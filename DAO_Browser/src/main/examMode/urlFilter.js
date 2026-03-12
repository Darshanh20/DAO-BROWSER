/**
 * URL Filter for Exam Mode
 * Intercepts navigation/requests and enforces whitelist-only browsing during exams
 * 
 * When exam mode is active:
 * - ALLOW internal URLs (chrome://, localhost, etc.)
 * - BLOCK if URL matches blacklist (with specific reason)
 * - ALLOW if URL matches whitelist
 * - BLOCK everything else (not in whitelist)
 * 
 * When exam mode is NOT active:
 * - Pass through (return null) to let other filters handle it
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { matchesPattern, matchesAnyPattern, isInternalUrl, extractDomain } = require('./patternMatcher');

// ==================== STATE ====================

// Current profile ID (set via IPC from renderer)
let currentProfileId = null;

// Cached session state (refreshed periodically)
let cachedSession = null;
let lastSessionCheck = 0;
const SESSION_CACHE_MS = 2000; // Re-read session state every 2 seconds

// Statistics
let blockedAttempts = 0;
let allowedRequests = 0;

// ==================== PROFILE ID MANAGEMENT ====================

/**
 * Set the current profile ID
 * Called from main.js IPC handler when profile changes
 * @param {string|number} profileId - The profile ID
 */
function setCurrentProfileId(profileId) {
    if (currentProfileId !== profileId) {
        console.log(`[ExamFilter] Profile changed: ${currentProfileId} → ${profileId}`);
        currentProfileId = profileId;
        // Invalidate cache when profile changes
        cachedSession = null;
        lastSessionCheck = 0;
    }
}

/**
 * Get the current profile ID
 * @returns {string|number|null}
 */
function getCurrentProfileId() {
    return currentProfileId;
}

// ==================== SESSION STATE ====================

/**
 * Get profile-specific session state directory
 * @param {number|string} profileId - The profile ID
 * @returns {string} - Path to profile's exam state directory
 */
function getProfileSessionDir(profileId) {
    if (!profileId) {
        return path.join(os.homedir(), '.dao-browser', 'temp');
    }
    return path.join(os.homedir(), '.dao-browser', 'profiles', `profile_${profileId}`);
}

/**
 * Get session state path for a specific profile
 * @param {number|string} profileId - The profile ID
 * @returns {string} - Path to exam_session_state.json for this profile
 */
function getSessionStatePath(profileId) {
    const dir = getProfileSessionDir(profileId);
    return path.join(dir, 'exam_session_state.json');
}

/**
 * Read the active exam session for current profile
 * Uses caching to avoid disk reads on every request
 * @returns {Object|null} - Session state or null
 */
function getActiveSession() {
    const now = Date.now();
    
    // Return cached session if still valid
    if (cachedSession && (now - lastSessionCheck) < SESSION_CACHE_MS) {
        // Quick expiry check
        if (cachedSession.end_time) {
            const endTime = new Date(cachedSession.end_time);
            if (endTime <= new Date()) {
                cachedSession = null;
                return null;
            }
        }
        return cachedSession;
    }
    
    // Re-read from disk
    lastSessionCheck = now;
    
    if (!currentProfileId) {
        cachedSession = null;
        return null;
    }
    
    try {
        const statePath = getSessionStatePath(currentProfileId);
        
        if (!fs.existsSync(statePath)) {
            cachedSession = null;
            return null;
        }
        
        const stateData = fs.readFileSync(statePath, 'utf8');
        const state = JSON.parse(stateData);
        
        if (!state.active) {
            cachedSession = null;
            return null;
        }
        
        // Check if session has expired
        const endTime = new Date(state.end_time);
        if (endTime <= new Date()) {
            cachedSession = null;
            return null;
        }
        
        cachedSession = state;
        return state;
        
    } catch (error) {
        console.error('[ExamFilter] Error reading session state:', error.message);
        cachedSession = null;
        return null;
    }
}

/**
 * Force refresh session cache
 * Call this when session is created/ended
 */
function invalidateSessionCache() {
    cachedSession = null;
    lastSessionCheck = 0;
}

// ==================== URL CHECKING ====================

/**
 * Check if a URL is allowed during exam mode
 * This is the main entry point called from webRequest handler
 * 
 * @param {string} url - The URL to check
 * @param {string} resourceType - Type of resource ('mainFrame', 'subFrame', 'image', etc.)
 * @returns {Object} - { allowed: boolean, reason: string, blocked: boolean, examActive: boolean }
 */
function checkUrl(url, resourceType = 'mainFrame') {
    // Always allow internal URLs
    if (isInternalUrl(url)) {
        return {
            allowed: true,
            reason: 'Internal URL',
            blocked: false,
            examActive: false
        };
    }
    
    // Get active session
    const session = getActiveSession();
    
    // No exam mode active - pass through
    if (!session) {
        return {
            allowed: true,
            reason: 'No active exam',
            blocked: false,
            examActive: false
        };
    }
    
    // Exam mode is active - apply filtering
    const result = checkUrlAgainstSession(url, session, resourceType);
    result.examActive = true;
    
    // Update stats
    if (result.blocked) {
        blockedAttempts++;
    } else {
        allowedRequests++;
    }
    
    return result;
}

/**
 * Check URL against session whitelist/blacklist
 * @param {string} url - URL to check
 * @param {Object} session - Active session state
 * @param {string} resourceType - Type of resource
 * @returns {Object}
 */
function checkUrlAgainstSession(url, session, resourceType) {
    const whitelist = session.whitelist || [];
    const blacklist = session.blacklist || [];
    
    // 1. Check blacklist first (explicit blocks take priority)
    const blacklistResult = matchesAnyPattern(url, blacklist);
    if (blacklistResult.matches) {
        // Determine if it's an AI tool
        const isAiTool = isAiToolDomain(url);
        const reason = isAiTool 
            ? 'AI tool - explicitly blacklisted' 
            : `Blocked site: ${blacklistResult.matchedPattern}`;
        
        console.log(`🚫 [ExamFilter] BLOCKED (blacklist): ${extractDomain(url)}`);
        
        return {
            allowed: false,
            blocked: true,
            reason: reason,
            matchedPattern: blacklistResult.matchedPattern,
            blockType: 'blacklist'
        };
    }
    
    // 2. Check whitelist
    const whitelistResult = matchesAnyPattern(url, whitelist);
    if (whitelistResult.matches) {
        return {
            allowed: true,
            blocked: false,
            reason: 'Whitelisted',
            matchedPattern: whitelistResult.matchedPattern
        };
    }
    
    // 3. For sub-resources (CSS, JS, images), check if the main domain is whitelisted
    // This prevents breaking page resources for allowed sites
    if (resourceType !== 'mainFrame' && resourceType !== 'subFrame') {
        const domain = extractDomain(url);
        const domainPattern = domain.replace(/^www\./, '');
        
        // Check if any whitelist pattern would cover this domain
        for (const pattern of whitelist) {
            // Normalize pattern for domain-level check
            let normalizedPattern = pattern.toLowerCase();
            if (normalizedPattern.includes('://')) {
                normalizedPattern = normalizedPattern.split('://')[1];
            }
            if (normalizedPattern.startsWith('www.')) {
                normalizedPattern = normalizedPattern.substring(4);
            }
            
            // Extract just the domain from pattern
            const patternDomain = normalizedPattern.split('/')[0].replace('*.', '');
            
            if (domainPattern === patternDomain || 
                domainPattern.endsWith('.' + patternDomain) ||
                patternDomain.endsWith('.' + domainPattern)) {
                return {
                    allowed: true,
                    blocked: false,
                    reason: 'Resource from whitelisted domain'
                };
            }
        }
    }
    
    // 4. Not in whitelist - block by default during exam
    if (whitelist.length > 0) {
        console.log(`🚫 [ExamFilter] BLOCKED (not whitelisted): ${extractDomain(url)}`);
        
        return {
            allowed: false,
            blocked: true,
            reason: 'Site not in allowed list',
            blockType: 'not_whitelisted'
        };
    }
    
    // 5. No whitelist configured - only blacklist active
    return {
        allowed: true,
        blocked: false,
        reason: 'No whitelist restrictions'
    };
}

// ==================== AI TOOLS DETECTION ====================

const AI_TOOL_DOMAINS = [
    'chat.openai.com',
    'chatgpt.com',
    'openai.com',
    'claude.ai',
    'anthropic.com',
    'gemini.google.com',
    'bard.google.com',
    'copilot.microsoft.com',
    'copilot.github.com',
    'perplexity.ai',
    'poe.com',
    'you.com',
    'character.ai',
    'huggingface.co',
    'ai.google',
    'bing.com/chat',
    'phind.com',
    'blackboxai.com',
    'writesonic.com',
    'jasper.ai',
    'grammarly.com',
    'quillbot.com',
    'forefront.ai',
    'notion.so/ai',
    'copy.ai'
];

/**
 * Check if URL is a known AI tool domain
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isAiToolDomain(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const fullUrl = (hostname + urlObj.pathname).toLowerCase();
        
        for (const aiDomain of AI_TOOL_DOMAINS) {
            // Exact match or subdomain
            if (hostname === aiDomain || hostname.endsWith('.' + aiDomain)) {
                return true;
            }
            // Path match (e.g., bing.com/chat, notion.so/ai)
            if (aiDomain.includes('/') && fullUrl.includes(aiDomain)) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

// ==================== STATISTICS ====================

/**
 * Get filter statistics
 * @returns {Object}
 */
function getStats() {
    return {
        blockedAttempts,
        allowedRequests,
        currentProfileId,
        sessionActive: !!cachedSession,
        sessionId: cachedSession?.session_id || null
    };
}

/**
 * Reset statistics
 */
function resetStats() {
    blockedAttempts = 0;
    allowedRequests = 0;
}

// ==================== EXPORTS ====================

module.exports = {
    // Profile management
    setCurrentProfileId,
    getCurrentProfileId,
    
    // Session management
    getActiveSession,
    invalidateSessionCache,
    
    // URL checking
    checkUrl,
    isAiToolDomain,
    
    // Statistics
    getStats,
    resetStats,
    
    // Constants
    AI_TOOL_DOMAINS
};

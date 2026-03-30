/**
 * Exam Mode Session Manager
 * Handles session creation, validation, and state management for exam mode
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

// ==================== CONSTANTS ====================

// AI tools domains to blacklist when "Block AI Tools" is enabled
const AI_TOOLS_DOMAINS = [
    'chat.openai.com',
    'openai.com',
    'chatgpt.com',
    'claude.ai',
    'anthropic.com',
    'gemini.google.com',
    'bard.google.com',
    'copilot.microsoft.com',
    'copilot.github.com',
    'github.com/features/copilot',
    'perplexity.ai',
    'poe.com',
    'you.com',
    'huggingface.co',
    'chat.huggingface.co',
    'character.ai',
    'writesonic.com',
    'jasper.ai',
    'copy.ai',
    'notion.so/ai',
    'phind.com',
    'forefront.ai',
    'quillbot.com'
];

// Session directories
const getExamSessionsDir = () => {
    return path.join(os.homedir(), 'Documents', 'DAOBrowser', 'ExamSessions');
};

const getTempSessionDir = () => {
    return path.join(os.homedir(), '.dao-browser', 'temp');
};

/**
 * Get profile-specific session state directory
 * @param {number|string} profileId - The profile ID
 * @returns {string} - Path to profile's exam state directory
 */
const getProfileSessionDir = (profileId) => {
    if (!profileId) {
        console.warn('[ExamMode] No profile ID provided, using temp dir');
        return getTempSessionDir();
    }
    return path.join(os.homedir(), '.dao-browser', 'profiles', `profile_${profileId}`);
};

/**
 * Get session state path for a specific profile
 * @param {number|string} profileId - The profile ID
 * @returns {string} - Path to exam_session_state.json for this profile
 */
const getSessionStatePath = (profileId) => {
    const dir = getProfileSessionDir(profileId);
    return path.join(dir, 'exam_session_state.json');
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate a 6-digit session ID
 */
function generateSessionId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash password using SHA-256 (simple hash for demo, consider bcrypt for production)
 * Note: For a real exam system, use bcrypt. Using simple hash for cross-platform compatibility.
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Verify password against hash
 */
function verifyPassword(password, hash) {
    return hashPassword(password) === hash;
}

/**
 * Ensure directory exists
 */
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// ==================== SESSION MANAGER ====================

class SessionManager {
    constructor() {
        this.activeSession = null;
    }

    /**
     * Create a new exam session
     * @param {Object} examInfo - Exam details (name, subject, duration_minutes, created_by)
     * @param {Array} whitelist - Array of allowed URL patterns
     * @param {Array} blacklist - Array of blocked URL patterns
     * @param {Object} settings - Session settings
     * @param {string} password - Plain text password to hash
     * @param {number|string} profileId - The profile ID for storing session state
     * @returns {Object} - { success, sessionId, configPath, error }
     */
    createSession(examInfo, whitelist, blacklist, settings, password, profileId) {
        try {
            const sessionId = generateSessionId();
            const passwordHash = hashPassword(password);
            
            // Add AI tools to blacklist if setting is enabled
            let finalBlacklist = [...blacklist];
            if (settings.block_ai_tools) {
                finalBlacklist = [...finalBlacklist, ...AI_TOOLS_DOMAINS];
            }

            // Create session config
            const config = {
                session_id: sessionId,
                password_hash: passwordHash,
                exam_info: {
                    name: examInfo.name,
                    subject: examInfo.subject,
                    duration_minutes: parseInt(examInfo.duration_minutes),
                    created_at: new Date().toISOString(),
                    created_by: examInfo.created_by || 'Professor'
                },
                whitelist: whitelist,
                blacklist: finalBlacklist,
                settings: {
                    block_ai_tools: settings.block_ai_tools !== false,
                    disable_downloads: settings.disable_downloads !== false,
                    disable_devtools: settings.disable_devtools !== false,
                    warn_on_exit: settings.warn_on_exit !== false,
                    auto_open_tabs: settings.auto_open_tabs !== false
                }
            };

            // Ensure sessions directory exists
            const sessionsDir = getExamSessionsDir();
            ensureDirectoryExists(sessionsDir);

            // Save config file
            const configFileName = `exam_config_${sessionId}.json`;
            const configPath = path.join(sessionsDir, configFileName);
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

            // Also activate the session for the professor
            const professorSession = this.activateSession(config, 'professor', password, profileId);

            return {
                success: true,
                sessionId: sessionId,
                configPath: configPath,
                config: config,
                session: professorSession
            };
        } catch (error) {
            console.error('[ExamMode] Failed to create session:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Join an existing exam session
     * @param {string} configPath - Path to the config JSON file
     * @param {string} password - Plain text password to verify
     * @param {Object} studentInfo - Student details (name, roll_number)
     * @param {number|string} profileId - The profile ID for storing session state
     * @returns {Object} - { success, session, error }
     */
    joinSession(configPath, password, studentInfo, profileId) {
        try {
            // Read and parse config file
            if (!fs.existsSync(configPath)) {
                return { success: false, error: 'Session config file not found' };
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            // Validate password
            if (!verifyPassword(password, config.password_hash)) {
                return { success: false, error: 'Invalid password' };
            }

            // Create session state
            const sessionState = {
                role: 'student',
                session_id: config.session_id,
                student_info: {
                    name: studentInfo.name,
                    roll_number: studentInfo.roll_number,
                    joined_at: new Date().toISOString()
                },
                exam_info: config.exam_info,
                whitelist: config.whitelist,
                blacklist: config.blacklist,
                settings: config.settings,
                start_time: new Date().toISOString(),
                end_time: new Date(Date.now() + config.exam_info.duration_minutes * 60 * 1000).toISOString(),
                activity_log: [],
                active: true
            };

            // Save session state (profile-specific)
            const profileDir = getProfileSessionDir(profileId);
            ensureDirectoryExists(profileDir);
            
            const statePath = getSessionStatePath(profileId);
            fs.writeFileSync(statePath, JSON.stringify(sessionState, null, 2), 'utf8');

            // Set as active session
            this.activeSession = sessionState;

            return {
                success: true,
                session: sessionState
            };
        } catch (error) {
            console.error('[ExamMode] Failed to join session:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Load config from a file path (for preview/validation)
     * @param {string} configPath - Path to config file
     * @returns {Object} - { success, config, error }
     */
    loadConfig(configPath) {
        try {
            if (!fs.existsSync(configPath)) {
                return { success: false, error: 'Config file not found' };
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            // Don't expose password hash
            const safeConfig = { ...config };
            delete safeConfig.password_hash;

            return {
                success: true,
                config: safeConfig
            };
        } catch (error) {
            console.error('[ExamMode] Failed to load config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Activate a session (used by professor after creating)
     * @param {Object} config - The session config
     * @param {string} role - 'professor' or 'student'
     * @param {string} password - Plain text password (stored for professor to verify students)
     * @param {number|string} profileId - The profile ID for storing session state
     * @returns {Object} - Session state
     */
    activateSession(config, role, password = null, profileId = null) {
        const sessionState = {
            role: role,
            session_id: config.session_id,
            exam_info: config.exam_info,
            whitelist: config.whitelist,
            blacklist: config.blacklist,
            settings: config.settings,
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + config.exam_info.duration_minutes * 60 * 1000).toISOString(),
            active: true
        };

        // Store password hash for professor (to share with students)
        if (role === 'professor' && password) {
            sessionState.password = password; // Store plain for professor reference
        }

        // Store profileId in session state for reference
        sessionState.profileId = profileId;

        // Save session state (profile-specific)
        const profileDir = getProfileSessionDir(profileId);
        ensureDirectoryExists(profileDir);
        
        const statePath = getSessionStatePath(profileId);
        fs.writeFileSync(statePath, JSON.stringify(sessionState, null, 2), 'utf8');

        // Set as active session
        this.activeSession = sessionState;

        return sessionState;
    }

    /**
     * Log activity for student sessions
     * @param {Object} activityEntry - { type, url, title, timestamp }
     * @param {number|string} profileId - The profile ID
     */
    logActivity(activityEntry, profileId) {
        const session = this.getActiveSession(profileId);
        if (!session || session.role !== 'student') return;

        if (!session.activity_log) {
            session.activity_log = [];
        }

        session.activity_log.push({
            ...activityEntry,
            timestamp: new Date().toISOString()
        });

        // Save updated state
        const statePath = getSessionStatePath(profileId);
        fs.writeFileSync(statePath, JSON.stringify(session, null, 2), 'utf8');
        
        this.activeSession = session;
    }

    /**
     * Mark activity log as submitted (backend sync is now source of truth)
     * @param {number|string} profileId - The profile ID
     * @returns {Object} - { success }
     */
    saveActivityLog(profileId) {
        const session = this.getActiveSession(profileId);
        if (!session) {
            return { success: false, error: 'No active session' };
        }

        return { success: true };
    }

    /**
     * Get the currently active session
     * @param {number|string} profileId - The profile ID
     * @returns {Object|null} - Active session state or null
     */
    getActiveSession(profileId) {
        // First check in-memory (if matches current profile)
        if (this.activeSession && this.activeSession.active && this.activeSession.profileId === profileId) {
            return this.activeSession;
        }

        // Then check file system for profile-specific session
        try {
            const statePath = getSessionStatePath(profileId);
            if (fs.existsSync(statePath)) {
                const stateData = fs.readFileSync(statePath, 'utf8');
                const state = JSON.parse(stateData);
                
                if (state.active) {
                    // Check if session has expired
                    const endTime = new Date(state.end_time);
                    if (endTime > new Date()) {
                        this.activeSession = state;
                        return state;
                    } else {
                        // Session expired, end it
                        this.endSession(profileId);
                    }
                }
            }
        } catch (error) {
            console.error('[ExamMode] Error checking active session:', error);
        }

        return null;
    }

    /**
     * End the current session
     * @param {number|string} profileId - The profile ID
     * @returns {boolean} - Success status
     */
    endSession(profileId) {
        try {
            const statePath = getSessionStatePath(profileId);
            
            if (fs.existsSync(statePath)) {
                // Mark as inactive before deleting
                const stateData = fs.readFileSync(statePath, 'utf8');
                const state = JSON.parse(stateData);
                state.active = false;
                state.ended_at = new Date().toISOString();
                
                // Save final state (for logging purposes) - in profile dir
                const profileDir = getProfileSessionDir(profileId);
                const endedStatePath = path.join(
                    profileDir, 
                    `exam_session_ended_${state.session_id}.json`
                );
                fs.writeFileSync(endedStatePath, JSON.stringify(state, null, 2), 'utf8');
                
                // Delete active state file
                fs.unlinkSync(statePath);
            }

            this.activeSession = null;
            console.log(`[ExamMode] Session ended for profile: ${profileId}`);
            
            return true;
        } catch (error) {
            console.error('[ExamMode] Failed to end session:', error);
            return false;
        }
    }

    /**
     * Check if a URL is allowed in the current session
     * @param {string} url - URL to check
     * @param {number|string} profileId - The profile ID
     * @returns {Object} - { allowed, reason }
     */
    checkUrlAllowed(url, profileId) {
        const session = this.getActiveSession(profileId);
        
        if (!session) {
            return { allowed: true, reason: 'No active exam session' };
        }

        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            const fullUrl = url.toLowerCase();

            // Check blacklist first
            for (const pattern of session.blacklist) {
                if (this.matchesPattern(hostname, fullUrl, pattern)) {
                    return { 
                        allowed: false, 
                        reason: `Blocked by exam session: ${pattern}` 
                    };
                }
            }

            // Check whitelist
            for (const pattern of session.whitelist) {
                if (this.matchesPattern(hostname, fullUrl, pattern)) {
                    return { allowed: true, reason: 'Whitelisted' };
                }
            }

            // If whitelist exists and URL didn't match, block it
            if (session.whitelist.length > 0) {
                return { 
                    allowed: false, 
                    reason: 'Not in whitelist' 
                };
            }

            return { allowed: true, reason: 'No restrictions' };
        } catch (error) {
            return { allowed: false, reason: 'Invalid URL' };
        }
    }

    /**
     * Match URL against a pattern
     * Supports: domain.com, domain.com/*, *.domain.com, *://domain.com/*
     */
    matchesPattern(hostname, fullUrl, pattern) {
        pattern = pattern.toLowerCase().trim();
        
        // Remove protocol if pattern has it
        if (pattern.includes('://')) {
            pattern = pattern.split('://')[1];
        }

        // Handle wildcard subdomain: *.domain.com
        if (pattern.startsWith('*.')) {
            const baseDomain = pattern.substring(2);
            if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
                return true;
            }
        }

        // Handle path wildcard: domain.com/*
        if (pattern.endsWith('/*')) {
            const baseDomain = pattern.slice(0, -2);
            if (hostname === baseDomain || fullUrl.includes(baseDomain)) {
                return true;
            }
        }

        // Handle path pattern: domain.com/path
        if (pattern.includes('/')) {
            return fullUrl.includes(pattern);
        }

        // Simple domain match
        return hostname === pattern || hostname.endsWith('.' + pattern);
    }

    /**
     * Get remaining time in current session (in seconds)
     * @param {number|string} profileId - The profile ID
     */
    getRemainingTime(profileId) {
        const session = this.getActiveSession(profileId);
        if (!session) return 0;

        const endTime = new Date(session.end_time);
        const remaining = Math.max(0, Math.floor((endTime - new Date()) / 1000));
        return remaining;
    }

    /**
     * Get the exam sessions directory path
     */
    getSessionsDirectory() {
        return getExamSessionsDir();
    }

    /**
     * Get the AI tools blacklist
     */
    getAiToolsDomains() {
        return AI_TOOLS_DOMAINS;
    }
}

// Create and export singleton instance
const sessionManager = new SessionManager();

module.exports = {
    sessionManager,
    SessionManager,
    AI_TOOLS_DOMAINS,
    getExamSessionsDir,
    getTempSessionDir,
    getProfileSessionDir,
    getSessionStatePath
};

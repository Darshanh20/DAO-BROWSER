/**
 * Advanced Ad and Tracker Blocking Module
 * 
 * Provides aggressive rule-based blocking of ads and tracking domains
 * using Electron's webRequest API for network interception.
 * 
 * Features:
 * - Pattern-based URL matching with aggressive rules
 * - Per-tab blocked request counters with categorization
 * - Request type detection (YT ad, tracker, analytics, etc.)
 * - Console logging with clear labels
 * - Global enable/disable toggle
 * - Whitelist for content delivery networks
 * - Graceful error handling
 * 
 * Limitations:
 * - Does NOT block dynamically injected ads (YouTube video stream ads)
 * - Pattern-based only (no ML detection)
 * - Cannot remove ad UI placeholders (CSS-level blocking not included)
 */

const { session } = require('electron');

// ============================================
// CONFIGURATION
// ============================================

/**
 * Global ad-blocker state
 * Can be toggled via IPC
 */
let AD_BLOCKING_ENABLED = true;

// ============================================
// BLOCKING PATTERNS - AGGRESSIVE RULES
// ============================================

/**
 * Display Ad Networks
 * Blocks banner, sidebar, and display ads
 */
const DISPLAY_AD_PATTERNS = [
  // Google Display Ads
  'doubleclick.net',
  'googlesyndication.com',
  'pagead2.googlesyndication.com',
  'ads.google',
  'adservice.google',
  'adtech',
  'adfarm',
  'adsense',
  
  // Other Display Networks
  'ads.pinterest.com',
  'ads.facebook.com',
  'ads.linkedin.com',
  'amazon-adsystem.com',
  
  // Generic display patterns
  '/ads/',
  '/adv/',
  '/banner/',
  '/advertisement/',
];

/**
 * Video Pre-roll and Mid-roll Ad Patterns
 * Blocks video ads (though YouTube video stream ads still load)
 */
const VIDEO_AD_PATTERNS = [
  'ads.youtube.com',
  'youtube-nocookie.com',
  'youtube.com/api/stats/ads',
  'youtube.com/pagead',
  'youtube.com/ads',
  'youtubeadvertising',
  'yt-ad',
];

/**
 * Tracking and Analytics Patterns
 * Blocks tracking pixels, event beacons, and analytics
 */
const TRACKING_PATTERNS = [
  // Analytics
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'gtm.js',
  'ga.js',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'firebase.google.com',
  
  // Tracking pixels
  'pixel.facebook.com',
  'connect.facebook.net',
  'scorecardresearch.com',
  'metrics.pinterest.com',
  'tracking.reddit.com',
  'analytics.twitter.com',
  'platform.twitter.com',
  
  // Marketing tracking
  'appsflyer.com',
  'branch.io',
  'adjust.com',
  'singular.net',
  
  // Generic tracking
  '/tracking/',
  '/tracker/',
  '/beacon/',
  '/pixels/',
];

/**
 * Ad-related Query Parameter Patterns
 * Blocks requests with marketing/tracking parameters
 */
const PARAMETER_PATTERNS = [
  '?utm_',        // UTM tracking parameters
  '&utm_',
  'fbclid=',      // Facebook click ID
  'gclid=',       // Google click ID
  'msclkid=',     // Microsoft click ID
];

/**
 * Combined blocking patterns
 */
const BLOCKING_PATTERNS = [
  ...DISPLAY_AD_PATTERNS,
  ...VIDEO_AD_PATTERNS,
  ...TRACKING_PATTERNS,
  ...PARAMETER_PATTERNS,
];

/**
 * Request type categorization for logging
 */
const REQUEST_CATEGORIES = {
  displayAd: DISPLAY_AD_PATTERNS,
  videoAd: VIDEO_AD_PATTERNS,
  tracking: TRACKING_PATTERNS,
  marketing: PARAMETER_PATTERNS,
};

/**
 * Whitelisted domains - these are NEVER blocked
 * Critical for content delivery and functionality
 */
const WHITELIST = [
  // Content Delivery Networks (CDNs)
  'fonts.gstatic.com',      // Google Fonts
  'fonts.googleapis.com',   // Google Fonts API
  'ajax.googleapis.com',    // Google AJAX Libraries
  'cdnjs.cloudflare.com',   // Cloudflare CDN
  'cdn.jsdelivr.net',       // jsDelivr CDN
  'unpkg.com',              // unpkg CDN
  'cdn.plot.ly',            // Plotly CDN
  'cdn.mathjax.org',        // MathJax CDN
  'cdnjs.com',              // cdnjs
  
  // Video Streaming (YouTube, Vimeo, etc.)
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'googlevideo.com',        // YouTube video streaming
  'yt.ggpht.com',          // YouTube metadata
  'yt3.ggpht.com',         // YouTube channel assets
  'vimeo.com',             // Vimeo
  'player.vimeo.com',      // Vimeo player
  
  // Developer & Legitimate Services
  'github.com',
  'githubusercontent.com',   // GitHub raw content
  'stackoverflow.com',
  'stackexchange.com',
  'raw.githubusercontent.com',
  'api.github.com',
];

/**
 * Categorize a blocked request for logging
 * @param {string} url - The blocked URL
 * @returns {string} - Category label (e.g., "YT ad", "tracking")
 */
function categorizeBlockedRequest(url) {
  const urlLower = url.toLowerCase();
  
  for (const [category, patterns] of Object.entries(REQUEST_CATEGORIES)) {
    for (const pattern of patterns) {
      if (urlLower.includes(pattern.toLowerCase())) {
        if (category === 'displayAd') return 'DISPLAY_AD';
        if (category === 'videoAd') return 'YT_AD';
        if (category === 'tracking') return 'TRACKER';
        if (category === 'marketing') return 'MARKETING';
      }
    }
  }
  
  return 'AD/TRACKER';
}

// ============================================
// STATISTICS
// ============================================

/**
 * Track blocked requests per tab/session
 * Key: webContentsId, Value: { count, urls: [] }
 */
const blockedStats = new Map();

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if a URL matches any blocking pattern
 * @param {string} url - The URL to check
 * @returns {boolean} - True if URL should be blocked
 */
function shouldBlockUrl(url) {
  if (!url) return false;
  
  try {
    const urlLower = url.toLowerCase();
    
    // Check whitelist first - never block these domains
    for (const whitelistDomain of WHITELIST) {
      if (urlLower.includes(whitelistDomain.toLowerCase())) {
        return false;
      }
    }
    
    // Then check blocking patterns
    return BLOCKING_PATTERNS.some(pattern => {
      // Simple substring matching (can be enhanced with regex)
      return urlLower.includes(pattern.toLowerCase());
    });
  } catch (error) {
    console.warn('Error checking URL for blocking:', error);
    return false;
  }
}

/**
 * Extract domain from URL for logging
 * @param {string} url - The full URL
 * @returns {string} - The domain
 */
function getDomainFromUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Initialize stats tracking for a session
 * @param {number} webContentsId - Electron webContents ID
 */
function initializeStats(webContentsId) {
  if (!blockedStats.has(webContentsId)) {
    blockedStats.set(webContentsId, {
      count: 0,
      urls: [],
      startTime: Date.now()
    });
  }
}

/**
 * Record a blocked request with categorization
 * @param {number} webContentsId - Electron webContents ID
 * @param {string} url - The blocked URL
 * @param {string} category - The block category (YT_AD, TRACKER, etc.)
 */
function recordBlockedRequest(webContentsId, url, category = 'AD/TRACKER') {
  initializeStats(webContentsId);
  
  const stats = blockedStats.get(webContentsId);
  stats.count++;
  stats.urls.push({
    url: getDomainFromUrl(url),
    category: category,
    timestamp: new Date().toLocaleTimeString()
  });
  
  // Keep only last 100 URLs in memory (prevent unbounded growth)
  if (stats.urls.length > 100) {
    stats.urls.shift();
  }
}

/**
 * Get blocked request stats for a session
 * @param {number} webContentsId - Electron webContents ID
 * @returns {object} - Stats object
 */
function getBlockedStats(webContentsId) {
  initializeStats(webContentsId);
  return blockedStats.get(webContentsId);
}

/**
 * Clear stats for a session (e.g., when tab is closed)
 * @param {number} webContentsId - Electron webContents ID
 */
function clearStats(webContentsId) {
  blockedStats.delete(webContentsId);
}

/**
 * Get stats for all active sessions
 * @returns {object} - Map of all stats
 */
function getAllStats() {
  return Object.fromEntries(blockedStats);
}

// ============================================
// NETWORK REQUEST INTERCEPTION
// ============================================

/**
 * Setup network request interception for a session
 * @param {session} electronSession - Electron session object
 * @param {number} webContentsId - Associated webContents ID
 */
function setupNetworkInterception(electronSession, webContentsId) {
  initializeStats(webContentsId);
  
  // Use onBeforeRequest to block URLs before they're fetched
  electronSession.webRequest.onBeforeRequest(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const { url, resourceType } = details;
      
      // Skip if ad-blocking is disabled
      if (!AD_BLOCKING_ENABLED) {
        callback({ cancel: false });
        return;
      }
      
      // Check if request should be blocked
      if (shouldBlockUrl(url)) {
        // Categorize the blocked request
        const category = categorizeBlockedRequest(url);
        
        // Record the blocked request with category
        recordBlockedRequest(webContentsId, url, category);
        
        // Log to console with clear label
        const domain = getDomainFromUrl(url);
        const stats = getBlockedStats(webContentsId);
        console.log(
          `[${category}] ${domain} | Type: ${resourceType} | Total Blocked: ${stats.count}`
        );
        
        // Cancel the request
        callback({ cancel: true });
      } else {
        // Allow the request to proceed
        callback({ cancel: false });
      }
    }
  );
}

/**
 * Add custom blocking patterns
 * @param {array} patterns - Array of pattern strings to add
 */
function addBlockingPatterns(patterns) {
  if (Array.isArray(patterns)) {
    BLOCKING_PATTERNS.push(...patterns);
    console.log(`[AD-BLOCKER] Added ${patterns.length} custom patterns`);
  }
}

/**
 * Remove blocking patterns
 * @param {array} patterns - Array of patterns to remove
 */
function removeBlockingPatterns(patterns) {
  if (Array.isArray(patterns)) {
    patterns.forEach(pattern => {
      const index = BLOCKING_PATTERNS.indexOf(pattern);
      if (index !== -1) {
        BLOCKING_PATTERNS.splice(index, 1);
      }
    });
    console.log(`[AD-BLOCKER] Removed ${patterns.length} patterns`);
  }
}

/**
 * Get all current blocking patterns
 * @returns {array} - Current patterns
 */
function getBlockingPatterns() {
  return [...BLOCKING_PATTERNS];
}

/**
 * Enable ad blocking for a specific session
 * @param {object} webContents - Electron webContents object
 * @returns {function} - Cleanup function to disable blocking
 */
function enableAdBlocking(webContents) {
  const webContentsId = webContents.id;
  const electronSession = webContents.session;
  
  console.log(`[AD-BLOCKER] Enabled for webContents ${webContentsId}`);
  
  // Setup interception
  setupNetworkInterception(electronSession, webContentsId);
  
  // Return cleanup function
  return () => {
    clearStats(webContentsId);
    console.log(`[AD-BLOCKER] Disabled for webContents ${webContentsId}`);
  };
}

/**
 * Enable or disable ad-blocking globally
 * @param {boolean} enabled - True to enable, false to disable
 * @returns {boolean} - New state
 */
function setAdBlockingEnabled(enabled) {
  AD_BLOCKING_ENABLED = enabled;
  const state = enabled ? 'ENABLED' : 'DISABLED';
  console.log(`[AD-BLOCKER] Global blocking is now ${state}`);
  return AD_BLOCKING_ENABLED;
}

/**
 * Get current ad-blocking state
 * @returns {boolean} - True if enabled
 */
function isAdBlockingEnabled() {
  return AD_BLOCKING_ENABLED;
}

/**
 * Log statistics for a session with categories
 * @param {number} webContentsId - Electron webContents ID
 */
function logStats(webContentsId) {
  const stats = getBlockedStats(webContentsId);
  const uptime = Math.round((Date.now() - stats.startTime) / 1000);
  
  // Count by category
  const byCategory = {};
  stats.urls.forEach(u => {
    byCategory[u.category] = (byCategory[u.category] || 0) + 1;
  });
  
  const categoryBreakdown = Object.entries(byCategory)
    .map(([cat, count]) => `  ${cat}: ${count}`)
    .join('\n');
  
  console.log(`
╔══════════════════════════════════════════╗
║   ADVANCED AD-BLOCKER STATISTICS         ║
╚══════════════════════════════════════════╝
STATUS: ${AD_BLOCKING_ENABLED ? '✓ ENABLED' : '✗ DISABLED'}
Total Blocked: ${stats.count}
Session Time: ${uptime}s
Block Rate: ${(stats.count / (uptime || 1)).toFixed(2)} req/sec

Blocked By Type:
${categoryBreakdown}

Recent Blocks:
${stats.urls.slice(-10).map(u => `  [${u.category}] ${u.url}`).join('\n')}
═════════════════════════════════════════════
  `);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Main API
  enableAdBlocking,
  setupNetworkInterception,
  
  // Toggle control
  setAdBlockingEnabled,
  isAdBlockingEnabled,
  
  // Pattern management
  addBlockingPatterns,
  removeBlockingPatterns,
  getBlockingPatterns,
  shouldBlockUrl,
  
  // Statistics
  getBlockedStats,
  getAllStats,
  clearStats,
  logStats,
  recordBlockedRequest,
  
  // Utilities
  getDomainFromUrl,
  initializeStats
};

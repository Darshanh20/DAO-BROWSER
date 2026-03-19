const { app, BrowserWindow, ipcMain, session, protocol, dialog, clipboard } = require('electron');
const path = require('path');
const fetch = require('cross-fetch');
const contentFilter = require('./content-filter');
const { sessionManager } = require('./examMode/sessionManager');
const configValidator = require('./examMode/configValidator');
const examUrlFilter = require('./examMode/urlFilter');
const logSyncer = require('./examMode/logSyncer');
const { exportExamPDF } = require('./examMode/pdfExporter');

let mainWindow;

// Ad-Blocker Statistics
let totalBlocked = 0;
let sessionBlocked = 0;
let adBlockerEnabled = true;

// Exam Mode Lockdown State
// Tracks which profiles are in lockdown mode (student exam session active)
const examLockdownProfiles = new Map(); // profileId -> { locked: boolean, sessionId: string }

// Set of blocked ad domains (loaded from blocklists at startup)
let blockedDomains = new Set();

// Blocklist sources (hosts-file format) — domain-level only, won't break YouTube
const BLOCKLIST_URLS = [
    'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext', // Peter Lowe's (~3,500 domains)
];

// Fallback hardcoded domains (used if download fails)
const FALLBACK_DOMAINS = [
    'doubleclick.net', 'googlesyndication.com', 'google-analytics.com',
    'ads.google.com', 'adservice.google.com', 'googleadservices.com',
    'pagead2.googlesyndication.com', 'amazon-adsystem.com', 'criteo.com',
    'scorecardresearch.com', 'chartbeat.net', 'facebook.com/tr',
    'connect.facebook.net', 'mixpanel.com', 'segment.com', 'intercom.io',
    'fullstory.com', 'hotjar.com', 'adnxs.com', 'rubiconproject.com',
    'pubmatic.com', 'openx.net', 'casalemedia.com', 'turn.com',
    'serving-sys.com', 'moatads.com', 'adsrvr.org', 'taboola.com',
    'outbrain.com', 'revcontent.com', 'mgid.com', 'zergnet.com'
];

// Parse hosts-file format and extract domains
function parseHostsFile(text) {
    const domains = new Set();
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) continue;
        // Hosts file format: "127.0.0.1 ad.domain.com" or "0.0.0.0 ad.domain.com"
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && (parts[0] === '127.0.0.1' || parts[0] === '0.0.0.0')) {
            const domain = parts[1].toLowerCase();
            if (domain && domain !== 'localhost' && domain !== 'localhost.localdomain') {
                domains.add(domain);
            }
        }
    }
    return domains;
}

// Download and load blocklists
async function loadBlocklists() {
    console.log('📥 Downloading ad-blocker domain lists...');

    for (const url of BLOCKLIST_URLS) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                const domains = parseHostsFile(text);
                domains.forEach(d => blockedDomains.add(d));
                console.log(`   ✅ Loaded ${domains.size} domains from ${url.substring(0, 50)}...`);
            }
        } catch (error) {
            console.warn(`   ⚠️ Failed to download blocklist: ${error.message}`);
        }
    }

    // Add fallback domains if download failed or as extras
    FALLBACK_DOMAINS.forEach(d => blockedDomains.add(d));

    console.log(`🛡️ Ad-Blocker ready: ${blockedDomains.size} domains loaded`);
}

// Check if a request URL belongs to a blocked ad domain
function isAdRequest(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        // Check exact match and parent domain match
        // e.g., "ads.example.com" is blocked if "example.com" is in the list
        if (blockedDomains.has(hostname)) return true;
        const parts = hostname.split('.');
        for (let i = 1; i < parts.length - 1; i++) {
            const parent = parts.slice(i).join('.');
            if (blockedDomains.has(parent)) return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// Register custom protocol scheme BEFORE app is ready
// This allows safe redirects from HTTPS to our block page
protocol.registerSchemesAsPrivileged([
    { scheme: 'dao-blocked', privileges: { standard: true, secure: true } },
    { scheme: 'dao-exam-blocked', privileges: { standard: true, secure: true } }
]);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true
        }
    });

    // Load profile selector landing page on startup
    mainWindow.loadFile(path.join(__dirname, '../renderer/pages/profile-selector.html'));
    mainWindow.maximize();

    // Register the dao-blocked:// protocol to serve the block page
    const blockPagePath = path.join(__dirname, '../renderer/pages/blocked.html');
    protocol.registerFileProtocol('dao-blocked', (request, callback) => {
        callback({ path: blockPagePath });
    });

    // Register the dao-exam-blocked:// protocol for exam mode block page
    const examBlockPagePath = path.join(__dirname, '../renderer/pages/exam-blocked.html');
    protocol.registerFileProtocol('dao-exam-blocked', (request, callback) => {
        callback({ path: examBlockPagePath });
    });

    // Setup ad-blocker
    setupAdBlocker();
}

async function setupAdBlocker() {
    // Load both blocklists in parallel
    await Promise.all([
        loadBlocklists(),
        contentFilter.loadContentBlocklists()
    ]);

    // Register content filter IPC handlers
    contentFilter.registerIpcHandlers();

    // Intercept all network requests in the default session
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        // 0. Check EXAM MODE FIRST (highest priority)
        const examResult = examUrlFilter.checkUrl(details.url, details.resourceType);
        if (examResult.examActive && examResult.blocked) {
            // For navigation requests, redirect to exam blocked page
            if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
                const params = new URLSearchParams({
                    url: details.url,
                    reason: examResult.reason || 'Not allowed during exam',
                    blockType: examResult.blockType || 'unknown'
                });
                
                // Send IPC event to renderer to log the blocked URL
                console.log('[ExamFilter] Blocked URL:', details.url, 'Reason:', examResult.reason);
                if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('examMode:urlBlocked', {
                        type: 'blocked_url_attempt',
                        url: details.url,
                        reason: examResult.reason || 'Not allowed during exam',
                        blockType: examResult.blockType || 'unknown',
                        timestamp: new Date().toISOString()
                    });
                }
                
                callback({ redirectURL: `dao-exam-blocked://blocked?${params.toString()}` });
            } else {
                // Cancel sub-resources silently
                callback({ cancel: true });
            }
            return;
        }
        
        // 1. Check content filter (redirect to block page)
        const contentResult = contentFilter.checkRequest(details.url);
        if (contentResult === 'blocked') {
            // For navigation requests, redirect to custom protocol block page
            if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
                callback({ redirectURL: `dao-blocked://blocked?url=${encodeURIComponent(details.url)}` });
            } else {
                callback({ cancel: true });
            }
            return;
        }

        // 2. Check ad-blocker
        if (adBlockerEnabled && isAdRequest(details.url)) {
            sessionBlocked++;
            totalBlocked++;
            if (sessionBlocked % 10 === 0) {
                console.log(`🚫 Blocked ${sessionBlocked} ads this session`);
            }
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });

    // Downloads are now allowed during exam mode
    // URL filtering (Phase 2) handles blocking non-whitelisted download sources
    // Activity is logged silently

    console.log('✅ Ad-Blocker + Content Filter + Exam Mode Filter initialized');
}

app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for Ad-Blocker Statistics
ipcMain.handle('adBlocker:getStats', () => {
    return {
        sessionBlocked,
        totalBlocked,
        enabled: adBlockerEnabled
    };
});

ipcMain.handle('adBlocker:toggle', () => {
    adBlockerEnabled = !adBlockerEnabled;
    console.log(`Ad-Blocker ${adBlockerEnabled ? '🛡️ Enabled' : '⚠️ Disabled'}`);
    return adBlockerEnabled;
});


ipcMain.handle('adBlocker:resetSession', () => {
    sessionBlocked = 0;
    console.log('Session stats reset');
    return sessionBlocked;
});

// IPC Handler for fetching (bypasses CORS)
ipcMain.handle('app:fetch', async (event, url, options = {}) => {
    try {
        const https = require('https');
        return new Promise((resolve, reject) => {
            https.get(url, options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        data: data,
                        headers: res.headers
                    });
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
});

// IPC Handler to get the app path for internal pages
ipcMain.handle('app:getPath', (event, pathType) => {
    if (pathType === 'renderer') {
        return path.join(__dirname, '../renderer');
    }
    if (pathType === 'webview-preload') {
        return path.join(__dirname, '../preload/webview-preload.js');
    }
    return path.join(__dirname, '../');
});

// IPC Handler for Article Summarization
ipcMain.handle('summarize:article', async (event, articleData) => {
    const http = require('http');

    console.log('[Summarization] Starting request...');
    console.log('[Summarization] Text length:', articleData.text.length, 'characters');

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            text: articleData.text,
            sentences: articleData.sentences || 5
        });

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/summarize',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 30000 // 30 second timeout (increased from 10 seconds)
        };

        const startTime = Date.now();
        const req = http.request(options, (res) => {
            let data = '';

            console.log('[Summarization] Response received, status:', res.statusCode);

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const duration = Date.now() - startTime;
                console.log('[Summarization] Request completed in', duration, 'ms');

                try {
                    const response = JSON.parse(data);
                    if (res.statusCode === 200) {
                        console.log('[Summarization] Success! Generated', response.summary?.length || 0, 'sentences');
                        resolve({
                            success: true,
                            data: response
                        });
                    } else {
                        console.error('[Summarization] Error response:', response);
                        resolve({
                            success: false,
                            error: response.error || 'Summarization failed',
                            message: response.message || 'Unknown error'
                        });
                    }
                } catch (error) {
                    console.error('[Summarization] Failed to parse response:', error);
                    reject(new Error('Failed to parse response: ' + error.message));
                }
            });
        });

        req.on('error', (error) => {
            console.error('[Summarization] Request error:', error.message);
            reject(new Error('Failed to connect to summarization service. Make sure the Python server is running on port 5000.'));
        });

        req.on('timeout', () => {
            console.error('[Summarization] Request timed out after 30 seconds');
            req.destroy();
            reject(new Error('Summarization request timed out after 30 seconds. The article might be too long or the service is slow. Try a shorter article.'));
        });

        console.log('[Summarization] Sending request to backend...');
        req.write(postData);
        req.end();
    });
});

// IPC Handler to check if summarization service is available
ipcMain.handle('summarize:checkService', async () => {
    const http = require('http');

    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/health',
            method: 'GET',
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            resolve({ available: res.statusCode === 200 });
        });

        req.on('error', () => {
            resolve({ available: false });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ available: false });
        });

        req.end();
    });
});

// ==================== HISTORY TRACKING ====================

// IPC Handler to add history entry
ipcMain.handle('history:add', async (event, historyData) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            url: historyData.url,
            title: historyData.title || '',
            favicon_url: historyData.favicon_url || '',
            visit_duration: historyData.visit_duration || 0,
            profile_id: historyData.profile_id || 1
        });

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/history/add',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve(response);
                    } else {
                        console.error('[History] Error response:', response);
                        resolve({ success: false, error: response.error });
                    }
                } catch (error) {
                    console.error('[History] Failed to parse response:', error);
                    resolve({ success: false, error: error.message });
                }
            });
        });

        req.on('error', (error) => {
            console.error('[History] Request error:', error.message);
            resolve({ success: false, error: error.message });
        });

        req.on('timeout', () => {
            console.error('[History] Request timed out');
            req.destroy();
            resolve({ success: false, error: 'Timeout' });
        });

        req.write(postData);
        req.end();
    });
});

// IPC Handler to get all history
ipcMain.handle('history:getAll', async (event, page = 1, limit = 50, profileId = null) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        let path = `/api/history/all?page=${page}&limit=${limit}`;
        if (profileId) {
            path += `&profile_id=${profileId}`;
        }
        
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: path,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
    });
});

// IPC Handler to search history
ipcMain.handle('history:search', async (event, query, limit = 50) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: `/api/history/search?q=${encodedQuery}&limit=${limit}`,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
    });
});

// IPC Handler to delete history entry
ipcMain.handle('history:delete', async (event, entryId) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: `/api/history/${entryId}`,
            method: 'DELETE',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
    });
});

// IPC Handler to clear all history
ipcMain.handle('history:clear', async () => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/history/clear',
            method: 'DELETE',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
    });
});

// IPC Handler to get history stats
ipcMain.handle('history:getStats', async () => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/history/stats',
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        req.end();
    });
});

// ==================== EXAM MODE IPC HANDLERS ====================

// Set current profile ID for exam mode URL filtering
// Called by renderer when profile changes
ipcMain.handle('examMode:setProfileId', async (event, profileId) => {
    examUrlFilter.setCurrentProfileId(profileId);
    return { success: true };
});

// Get exam filter statistics
ipcMain.handle('examMode:getFilterStats', async () => {
    return examUrlFilter.getStats();
});

// Invalidate session cache (call after session create/join/end)
ipcMain.handle('examMode:invalidateCache', async () => {
    examUrlFilter.invalidateSessionCache();
    return { success: true };
});

// Log blocked URL attempt (for activity logging)
ipcMain.handle('examMode:logBlockedAttempt', async (event, blockedInfo, profileId) => {
    // Add to activity log
    sessionManager.logActivity({
        type: 'blocked_attempt',
        url: blockedInfo.url,
        reason: blockedInfo.reason,
        timestamp: new Date().toISOString()
    }, profileId);
    return { success: true };
});

// Create a new exam session (Professor side)
ipcMain.handle('examMode:createSession', async (event, examInfo, whitelist, blacklist, settings, password, profileId) => {
    
    // Validate exam info
    const examValidation = configValidator.validateExamInfo(examInfo);
    if (!examValidation.valid) {
        return { success: false, error: examValidation.errors.join(', ') };
    }
    
    // Validate password
    const pwdValidation = configValidator.validatePassword(password);
    if (!pwdValidation.valid) {
        return { success: false, error: pwdValidation.errors.join(', ') };
    }
    
    // Validate whitelist patterns
    for (const pattern of whitelist) {
        const patternValidation = configValidator.validateWhitelistPattern(pattern);
        if (!patternValidation.valid) {
            return { success: false, error: `Invalid whitelist pattern "${pattern}": ${patternValidation.error}` };
        }
    }
    
    // Create session with profileId
    const result = sessionManager.createSession(examInfo, whitelist, blacklist, settings, password, profileId);
    
    // Invalidate URL filter cache so it picks up new session
    if (result.success) {
        examUrlFilter.invalidateSessionCache();
    }
    
    return result;
});

// Join an existing exam session (Student side)
ipcMain.handle('examMode:joinSession', async (event, configPath, password, studentInfo, profileId) => {
    
    // Validate student info
    const studentValidation = configValidator.validateStudentInfo(studentInfo);
    if (!studentValidation.valid) {
        return { success: false, error: studentValidation.errors.join(', ') };
    }
    
    const result = sessionManager.joinSession(configPath, password, studentInfo, profileId);
    
    // Invalidate URL filter cache so it picks up new session
    if (result.success) {
        examUrlFilter.invalidateSessionCache();
        
        // Start background log syncer with offline backup support
        if (result.session) {
            logSyncer.start(result.session, profileId, () => {
                // Callback when professor ends session
                mainWindow.webContents.send('examMode:sessionEndedByProfessor', { profileId });
            });
        }
    }
    
    return result;
});

// Load config file (for preview before joining)
ipcMain.handle('examMode:loadConfig', async (event, configPath) => {
    return sessionManager.loadConfig(configPath);
});

// Get active session
ipcMain.handle('examMode:getActiveSession', async (event, profileId) => {
    return sessionManager.getActiveSession(profileId);
});

// End current session
ipcMain.handle('examMode:endSession', async (event, profileId) => {
    const result = sessionManager.endSession(profileId);
    
    // Stop background log syncer
    logSyncer.stop();
    
    // Invalidate URL filter cache
    examUrlFilter.invalidateSessionCache();
    
    return result;
});

// Check if URL is allowed
ipcMain.handle('examMode:checkUrl', async (event, url, profileId) => {
    return sessionManager.checkUrlAllowed(url, profileId);
});

// Get remaining time
ipcMain.handle('examMode:getRemainingTime', async (event, profileId) => {
    return sessionManager.getRemainingTime(profileId);
});

// Validate password strength (for UI feedback)
ipcMain.handle('examMode:validatePassword', async (event, password) => {
    return configValidator.validatePassword(password);
});

// Validate URL pattern (for UI feedback)
ipcMain.handle('examMode:validatePattern', async (event, pattern) => {
    return configValidator.validateWhitelistPattern(pattern);
});

// Get AI tools domains list
ipcMain.handle('examMode:getAiToolsDomains', async () => {
    return sessionManager.getAiToolsDomains();
});

// Get sessions directory path
ipcMain.handle('examMode:getSessionsDirectory', async () => {
    return sessionManager.getSessionsDirectory();
});

// Show save dialog for session file download
ipcMain.handle('examMode:showSaveDialog', async (event, defaultFileName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Exam Session File',
        defaultPath: defaultFileName,
        filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

// Save file to custom location
ipcMain.handle('examMode:saveFileToPath', async (event, sourcePath, destPath) => {
    const fs = require('fs');
    try {
        fs.copyFileSync(sourcePath, destPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Show open dialog for session file upload
ipcMain.handle('examMode:showOpenDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Exam Session File',
        filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });
    return result;
});

// Show open dialog for multiple log files (Professor logs view)
ipcMain.handle('examMode:showOpenDialogMultiple', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Student Log Files',
        filters: [
            { name: 'Activity Log Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile', 'multiSelections']
    });
    return result;
});

// Read file contents
ipcMain.handle('examMode:readFile', async (event, filePath) => {
    const fs = require('fs');
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return { success: true, content: content };
    } catch (error) {
        console.error('[ExamMode] Failed to read file:', error);
        return { success: false, error: error.message };
    }
});

// Copy text to clipboard
ipcMain.handle('examMode:copyToClipboard', async (event, text) => {
    clipboard.writeText(text);
    return { success: true };
});

// Log activity for student sessions
ipcMain.handle('examMode:logActivity', async (event, activityEntry, profileId) => {
    sessionManager.logActivity(activityEntry, profileId);
    return { success: true };
});

// Save activity log to Desktop
ipcMain.handle('examMode:saveActivityLog', async (event, profileId) => {
    return sessionManager.saveActivityLog(profileId);
});

// Export exam data to PDF
ipcMain.handle('export-exam-pdf', async (event, { examData, students, allLogs }) => {
    return await exportExamPDF(examData, students, allLogs);
});

// Get connection status for sync indicator
ipcMain.handle('examMode:getConnectionStatus', async () => {
    return {
        status: logSyncer.getConnectionStatus(),
        lastSyncTime: logSyncer.getLastSyncTime()
    };
});

// Set lockdown state for a profile (called when student exam session activates/ends)
ipcMain.handle('examMode:setLockdownState', async (event, locked, profileId, sessionId = null) => {
    
    if (locked) {
        examLockdownProfiles.set(profileId, { locked: true, sessionId });
    } else {
        examLockdownProfiles.delete(profileId);
        console.log(`[ExamMode Lockdown] Profile ${profileId} lockdown released`);
    }
    
    return { success: true };
});

// Check if profile is in lockdown mode
ipcMain.handle('examMode:isLocked', async (event, profileId) => {
    const lockState = examLockdownProfiles.get(profileId);
    return { locked: lockState?.locked || false, sessionId: lockState?.sessionId };
});

// ==================== PROFILE MANAGEMENT IPC HANDLERS ====================

// Get all profiles from Python backend
ipcMain.handle('profile:getAll', async (event) => {
    try {
        const response = await fetch('http://localhost:5000/api/profiles');
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        console.log('✅ Profiles loaded:', data.data?.length || 0);
        return data;
    } catch (error) {
        console.error('❌ Error loading profiles:', error);
        return { success: false, error: error.message };
    }
});

// Get specific profile
ipcMain.handle('profile:get', async (event, profileId) => {
    try {
        const response = await fetch(`http://localhost:5000/api/profiles/${profileId}`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Error getting profile:', error);
        return { success: false, error: error.message };
    }
});

// Create new profile
ipcMain.handle('profile:create', async (event, name, displayName, avatarColor = '#4A90E2') => {
    try {
        const response = await fetch('http://localhost:5000/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                display_name: displayName,
                avatar_color: avatarColor
            })
        });
        const data = await response.json();
        if (data.success) {
            console.log(`✅ Profile created: ${displayName}`);
        }
        return data;
    } catch (error) {
        console.error('❌ Error creating profile:', error);
        return { success: false, error: error.message };
    }
});

// Update profile
ipcMain.handle('profile:update', async (event, profileId, updates) => {
    try {
        const response = await fetch(`http://localhost:5000/api/profiles/${profileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        return await response.json();
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        return { success: false, error: error.message };
    }
});

// Delete profile
ipcMain.handle('profile:delete', async (event, profileId) => {
    try {
        const response = await fetch(`http://localhost:5000/api/profiles/${profileId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        if (data.success) {
            console.log(`✅ Profile deleted: ${profileId}`);
        }
        return data;
    } catch (error) {
        console.error('❌ Error deleting profile:', error);
        return { success: false, error: error.message };
    }
});

// Activate (switch to) profile
ipcMain.handle('profile:activate', async (event, profileId) => {
    try {
        const response = await fetch(`http://localhost:5000/api/profiles/${profileId}/activate`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            console.log(`✅ Profile activated: ${profileId}`);
        }
        return data;
    } catch (error) {
        console.error('❌ Error activating profile:', error);
        return { success: false, error: error.message };
    }
});

// Get currently active profile
ipcMain.handle('profile:getActive', async (event) => {
    try {
        const response = await fetch('http://localhost:5000/api/profiles/active');
        return await response.json();
    } catch (error) {
        console.error('❌ Error getting active profile:', error);
        return { success: false, error: error.message };
    }
});

// Get profile statistics
ipcMain.handle('profile:getStats', async (event, profileId) => {
    try {
        const response = await fetch(`http://localhost:5000/api/profiles/${profileId}/stats`);
        return await response.json();
    } catch (error) {
        console.error('❌ Error getting profile stats:', error);
        return { success: false, error: error.message };
    }
});

// Select profile and navigate to main browser window
ipcMain.handle('profile:select', async (event, profileId) => {
    try {
        // Activate the profile in backend
        const activateResponse = await fetch(`http://localhost:5000/api/profiles/${profileId}/activate`, {
            method: 'POST'
        });

        if (!activateResponse.ok) {
            return { success: false, error: 'Failed to activate profile' };
        }

        console.log(`🔄 Switching to profile: ${profileId}`);

        // Load the main browser window
        if (mainWindow) {
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
            mainWindow.show();
        }

        return { success: true };
    } catch (error) {
        console.error('❌ Error selecting profile:', error);
        return { success: false, error: error.message };
    }
});

// Open a new window for a different profile
ipcMain.handle('profile:openNewWindow', async (event, profileId) => {
    try {
        // Get profile info first
        const profileResponse = await fetch(`http://localhost:5000/api/profiles/${profileId}`);
        const profileData = await profileResponse.json();

        if (!profileData.success) {
            return { success: false, error: 'Failed to get profile info' };
        }

        const profile = profileData.data;
        console.log(`🪟 Opening new window for profile: ${profile.display_name} (ID: ${profileId})`);

        // Create a new browser window for this profile
        const newWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 800,
            minHeight: 600,
            autoHideMenuBar: true,
            title: `D.A.O. Browser - ${profile.display_name}`,
            webPreferences: {
                preload: path.join(__dirname, '../preload/preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                webviewTag: true
            }
        });

        // Store the profile ID for this window
        newWindow.profileId = profileId;

        // Load the main browser page with profile ID in hash (so it's available immediately)
        const indexPath = path.join(__dirname, '../renderer/index.html');
        newWindow.loadURL(`file://${indexPath}#profileId=${profileId}`);
        newWindow.maximize();

        return { success: true, profileId };
    } catch (error) {
        console.error('❌ Error opening new profile window:', error);
        return { success: false, error: error.message };
    }
});

// Block devtools when lockdown is active
// This listener prevents F12 from opening devtools during exam lockdown
app.on('web-contents-created', (event, contents) => {
    // Intercept devtools opening
    contents.on('before-input-event', (event, input) => {
        // Check if any profile is in lockdown mode
        const hasLockdown = examLockdownProfiles.size > 0 && 
            Array.from(examLockdownProfiles.values()).some(s => s.locked);
        
        if (hasLockdown) {
            // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
            const isDevToolsShortcut = (
                input.key === 'F12' ||
                (input.control && input.shift && ['I', 'i', 'J', 'j', 'C', 'c'].includes(input.key))
            );
            
            if (isDevToolsShortcut) {
                event.preventDefault();
                console.log('[ExamMode Lockdown] Devtools shortcut blocked');
            }
        }
    });
});

// Log app info
console.log(`D.A.O. Browser v1.0 - Privacy & Distraction-Free`);
console.log(`Total Ads Blocked: ${totalBlocked}`);
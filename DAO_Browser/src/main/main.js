const { app, BrowserWindow, ipcMain, session, protocol, dialog, clipboard, webContents } = require('electron');
const path = require('path');
const fetch = require('cross-fetch');
const contentFilter = require('./content-filter');
const { sessionManager } = require('./examMode/sessionManager');
const configValidator = require('./examMode/configValidator');
const examUrlFilter = require('./examMode/urlFilter');
const logSyncer = require('./examMode/logSyncer');
const { exportExamPDF } = require('./examMode/pdfExporter');
const { focusModeManager } = require('./focusMode/manager');

let mainWindow;
let selectorWindow;
const profileWindows = new Map(); // profileId -> BrowserWindow
const windowProfiles = new Map(); // webContentsId -> { profileId, profileName }

// Ad-Blocker Statistics
let totalBlocked = 0;
let sessionBlocked = 0;
let adBlockerEnabled = true;
let backendProcess = null;

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = Number(process.env.DAO_BACKEND_PORT || 5000);
const BACKEND_BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

// Exam Mode Lockdown State
// Tracks which profiles are in lockdown mode (student exam session active)
const examLockdownProfiles = new Map(); // profileId -> { locked: boolean, sessionId: string }

// Set of blocked ad domains (loaded from blocklists at startup)
let blockedDomains = new Set();
const initializedPartitions = new Set();
const downloadTrackingSessions = new Set();
const blockedProtocolsRegisteredSessions = new WeakSet();
let downloadHistory = [];
let downloadHistoryFilePath = null;

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

function getBackendDataDir() {
    return path.join(app.getPath('userData'), 'backend-data');
}

function getBackendCommand() {
    if (app.isPackaged) {
        const exePath = path.join(process.resourcesPath, 'backend', 'dao_backend', 'dao_backend.exe');
        return {
            command: exePath,
            args: [],
            cwd: path.dirname(exePath)
        };
    }

    const appRoot = app.getAppPath();
    const backendScript = path.join(appRoot, 'backend', 'summarizer.py');
    const venvCandidates = process.platform === 'win32'
        ? [
            path.join(appRoot, '..', 'venv', 'Scripts', 'python.exe'),
            path.join(appRoot, 'venv', 'Scripts', 'python.exe')
        ]
        : [
            path.join(appRoot, '..', 'venv', 'bin', 'python3'),
            path.join(appRoot, 'venv', 'bin', 'python3')
        ];

    const pythonExecutable = process.env.DAO_BACKEND_PYTHON || venvCandidates.find(candidate => fs.existsSync(candidate)) || 'python';
    return {
        command: pythonExecutable,
        args: [backendScript],
        cwd: path.dirname(backendScript)
    };
}

function checkBackendHealth(timeoutMs = 2000) {
    const http = require('http');

    return new Promise((resolve) => {
        const req = http.request({
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
            path: '/health',
            method: 'GET',
            timeout: timeoutMs
        }, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

async function waitForBackendReady(maxWaitMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        if (await checkBackendHealth(1000)) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
}

async function startBackendService() {
    const alreadyRunning = await checkBackendHealth(1000);
    if (alreadyRunning) {
        console.log(`[Backend] Existing backend detected at ${BACKEND_BASE_URL}`);
        return;
    }

    const backendDataDir = getBackendDataDir();
    fs.mkdirSync(backendDataDir, { recursive: true });

    const { command, args, cwd } = getBackendCommand();
    if (app.isPackaged && !fs.existsSync(command)) {
        throw new Error(`Backend executable not found: ${command}`);
    }

    console.log(`[Backend] Starting backend: ${command} ${args.join(' ')}`);
    backendProcess = spawn(command, args, {
        cwd,
        env: {
            ...process.env,
            DAO_BACKEND_DATA_DIR: backendDataDir,
            DAO_BACKEND_PORT: String(BACKEND_PORT)
        },
        stdio: 'pipe',
        windowsHide: true
    });

    backendProcess.stdout.on('data', (data) => {
        console.log(`[Backend] ${String(data).trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[Backend Error] ${String(data).trim()}`);
    });

    backendProcess.on('exit', (code) => {
        console.log(`[Backend] Process exited with code ${code}`);
        backendProcess = null;
    });

    const ready = await waitForBackendReady(25000);
    if (!ready) {
        throw new Error(`Backend did not become ready at ${BACKEND_BASE_URL}`);
    }

    console.log(`[Backend] Service ready at ${BACKEND_BASE_URL}`);
}

function stopBackendService() {
    if (backendProcess && !backendProcess.killed) {
        console.log('[Backend] Stopping backend process');
        backendProcess.kill();
    }
}

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

function getBrowserWindowForEvent(event) {
    return BrowserWindow.fromWebContents(event.sender) || mainWindow || null;
}

function getPartitionForProfile(profileId) {
    return `persist:${profileId}`;
}

function sendToRequestWindow(details, channel, payload) {
    if (!details.webContentsId) {
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send(channel, payload);
        }
        return;
    }

    const targetContents = webContents.fromId(details.webContentsId);
    if (targetContents && !targetContents.isDestroyed()) {
        targetContents.send(channel, payload);
    } else if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, payload);
    }
}

function buildBlockedRedirectUrl(mode, details, meta = {}) {
    // Central routing for blocked pages:
    // 1) exam => exam blocked page
    // 2) focus => focus blocked page
    // 3) adult/content => generic error page style
    if (mode === 'exam') {
        const params = new URLSearchParams({
            url: details.url,
            reason: meta.reason || 'Not allowed during exam',
            blockType: meta.blockType || 'unknown'
        });
        return `dao-exam-blocked://blocked?${params.toString()}`;
    }

    if (mode === 'focus') {
        const params = new URLSearchParams({
            url: details.url,
            reason: meta.reason || 'Blocked during Focus Mode',
            domain: meta.domain || 'unknown'
        });
        return `dao-focus-blocked://blocked?${params.toString()}`;
    }

    const params = new URLSearchParams({
        code: 'CONTENT_BLOCKED',
        message: 'Site blocked by content filter',
        url: details.url,
        hint: 'This website is restricted by your protection settings.'
    });
    return `dao-blocked://error?${params.toString()}`;
}

function getProfileIdForRequest(details) {
    if (!details || !details.webContentsId) {
        return 1;
    }

    const targetContents = webContents.fromId(details.webContentsId);
    if (!targetContents || targetContents.isDestroyed()) {
        return 1;
    }

    const host = targetContents.hostWebContents || targetContents;
    const context = windowProfiles.get(host.id);
    return Number(context?.profileId) || 1;
}

function getFallbackFileName(downloadUrl) {
    try {
        const parsed = new URL(downloadUrl);
        const lastSegment = decodeURIComponent(parsed.pathname.split('/').pop() || '');
        if (lastSegment) {
            return lastSegment;
        }
    } catch (error) {
        // Fall through to default
    }

    return 'download';
}

function getSourceContextFromWebContents(sourceWebContents) {
    if (!sourceWebContents) {
        return { hostContents: null, profileId: 1 };
    }

    const hostContents = sourceWebContents.hostWebContents || sourceWebContents;
    const profileContext = windowProfiles.get(hostContents.id);
    return {
        hostContents,
        profileId: profileContext?.profileId || 1
    };
}

function loadDownloadHistory() {
    if (!downloadHistoryFilePath) {
        return;
    }

    try {
        if (!fs.existsSync(downloadHistoryFilePath)) {
            downloadHistory = [];
            return;
        }

        const raw = fs.readFileSync(downloadHistoryFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        downloadHistory = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[Downloads] Failed to load history:', error);
        downloadHistory = [];
    }
}

function saveDownloadHistory() {
    if (!downloadHistoryFilePath) {
        return;
    }

    try {
        fs.writeFileSync(downloadHistoryFilePath, JSON.stringify(downloadHistory, null, 2), 'utf8');
    } catch (error) {
        console.error('[Downloads] Failed to persist history:', error);
    }
}

function addDownloadEntry(entry) {
    downloadHistory.unshift(entry);

    // Keep the persisted history bounded.
    if (downloadHistory.length > 500) {
        downloadHistory = downloadHistory.slice(0, 500);
    }

    saveDownloadHistory();
}

function updateDownloadEntry(downloadId, updates) {
    const entry = downloadHistory.find(item => item.id === downloadId);
    if (!entry) {
        return;
    }

    Object.assign(entry, updates);
    saveDownloadHistory();
}

function sendDownloadEventToProfileWindows(channel, payload, profileId) {
    profileWindows.forEach((profileWindow, mappedProfileId) => {
        if (mappedProfileId !== profileId) {
            return;
        }

        if (!profileWindow || profileWindow.isDestroyed()) {
            return;
        }

        profileWindow.webContents.send(channel, payload);

        // Forward to guest webviews hosted by this profile window so internal pages
        // (like downloads.html opened in a webview tab) receive live updates too.
        const hostContentsId = profileWindow.webContents.id;
        webContents.getAllWebContents().forEach((contents) => {
            if (contents.isDestroyed()) {
                return;
            }

            if (contents.hostWebContents && contents.hostWebContents.id === hostContentsId) {
                contents.send(channel, payload);
            }
        });
    });
}

function sendEventToProfileWindows(channel, payload, profileId) {
    profileWindows.forEach((profileWindow, mappedProfileId) => {
        if (mappedProfileId !== profileId) {
            return;
        }

        if (!profileWindow || profileWindow.isDestroyed()) {
            return;
        }

        profileWindow.webContents.send(channel, payload);

        const hostContentsId = profileWindow.webContents.id;
        webContents.getAllWebContents().forEach((contents) => {
            if (contents.isDestroyed()) {
                return;
            }

            if (contents.hostWebContents && contents.hostWebContents.id === hostContentsId) {
                contents.send(channel, payload);
            }
        });
    });
}

function showFocusIntroWindow() {
    return new Promise((resolve) => {
        const introWindow = new BrowserWindow({
            fullscreen: true,
            frame: false,
            transparent: false,
            alwaysOnTop: true,
            resizable: false,
            skipTaskbar: true,
            backgroundColor: '#061024',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        const introPath = path.join(__dirname, '../renderer/pages/focus-intro.html');
        introWindow.loadFile(introPath);

        const closeIntro = () => {
            if (!introWindow.isDestroyed()) {
                introWindow.close();
            }
            resolve();
        };

        introWindow.once('ready-to-show', () => {
            introWindow.show();
            setTimeout(closeIntro, 2600);
        });

        introWindow.on('closed', () => {
            resolve();
        });
    });
}

function attachDownloadTracking(targetSession) {
    if (!targetSession || downloadTrackingSessions.has(targetSession)) {
        return;
    }

    downloadTrackingSessions.add(targetSession);

    targetSession.on('will-download', (event, item, sourceWebContents) => {
        const { hostContents, profileId } = getSourceContextFromWebContents(sourceWebContents);
        const downloadId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const fileUrl = item.getURL();
        const fileName = item.getFilename() || getFallbackFileName(fileUrl);
        const startedAt = new Date().toISOString();

        const downloadEntry = {
            id: downloadId,
            profileId,
            fileName,
            fileUrl,
            status: 'downloading',
            timestamp: startedAt
        };

        addDownloadEntry(downloadEntry);

        if (hostContents && !hostContents.isDestroyed()) {
            hostContents.send('downloads:started', downloadEntry);
            hostContents.send('downloads:redirect', downloadEntry);
        }

        sendDownloadEventToProfileWindows('downloads:updated', downloadEntry, profileId);

        item.on('done', (doneEvent, state) => {
            const isCompleted = state === 'completed';
            const updatedEntry = {
                status: isCompleted ? 'completed' : 'failed'
            };

            if (!isCompleted) {
                updatedEntry.error = state || 'Download failed';
            }

            updateDownloadEntry(downloadId, updatedEntry);

            const payload = {
                ...downloadEntry,
                ...updatedEntry
            };

            if (hostContents && !hostContents.isDestroyed()) {
                hostContents.send('downloads:updated', payload);
            }

            sendDownloadEventToProfileWindows('downloads:updated', payload, profileId);
        });
    });
}

async function callProfileApi(apiPath, method = 'GET', body = null) {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const postData = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: apiPath,
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 5000
        };

        if (postData) {
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve(parsed);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Profile API request timed out'));
        });

        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function getProfileById(profileId) {
    const result = await callProfileApi(`/api/profiles/${profileId}`);
    if (!result.success) {
        throw new Error(result.error || 'Profile not found');
    }
    return result.data;
}

async function activateProfile(profileId) {
    try {
        await callProfileApi(`/api/profiles/${profileId}/activate`, 'POST');
    } catch (error) {
        console.warn(`[ProfileWindow] Failed to activate profile ${profileId}:`, error.message);
    }
}

async function touchProfile(profileId) {
    try {
        await callProfileApi(`/api/profiles/${profileId}/touch`, 'POST');
    } catch (error) {
        console.warn(`[ProfileWindow] Failed to update last_used_at for profile ${profileId}:`, error.message);
    }
}

// Register custom protocol scheme BEFORE app is ready
// This allows safe redirects from HTTPS to our block page
protocol.registerSchemesAsPrivileged([
    { scheme: 'dao-blocked', privileges: { standard: true, secure: true } },
    { scheme: 'dao-exam-blocked', privileges: { standard: true, secure: true } },
    { scheme: 'dao-focus-blocked', privileges: { standard: true, secure: true } }
]);

function createProfileSelectorWindow() {
    if (selectorWindow && !selectorWindow.isDestroyed()) {
        selectorWindow.focus();
        return;
    }

    selectorWindow = new BrowserWindow({
        width: 1100,
        height: 760,
        minWidth: 900,
        minHeight: 600,
        autoHideMenuBar: true,
        title: 'D.A.O. Browser - Select Profile',
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.maximize();
    mainWindow.webContents.openDevTools();

    // Register the dao-blocked:// protocol to serve the block page
    const blockPagePath = path.join(__dirname, '../renderer/pages/blocked.html');
    protocol.registerFileProtocol('dao-blocked', (request, callback) => {
        callback({ path: blockPagePath });
    });

    const blockPagePath = path.join(__dirname, '../renderer/pages/error.html');
    const examBlockPagePath = path.join(__dirname, '../renderer/pages/exam-blocked.html');
    const focusBlockPagePath = path.join(__dirname, '../renderer/pages/focus-blocked.html');

    const tryRegister = (scheme, filePath) => {
        try {
            sessionProtocol.registerFileProtocol(scheme, (request, callback) => {
                callback({ path: filePath });
            });
        } catch (error) {
            const message = String(error?.message || '').toLowerCase();
            if (!message.includes('register') && !message.includes('already')) {
                console.warn(`[Protocol] Failed to register ${scheme} for session:`, error.message || error);
            }
        }
    };

    tryRegister('dao-blocked', blockPagePath);
    tryRegister('dao-exam-blocked', examBlockPagePath);
    tryRegister('dao-focus-blocked', focusBlockPagePath);

    blockedProtocolsRegisteredSessions.add(targetSession);
}

function attachRequestInterception(targetSession) {
    if (!targetSession || initializedPartitions.has(targetSession)) {
        return;
    }

    initializedPartitions.add(targetSession);
    registerBlockedProtocolsForSession(targetSession);
    attachDownloadTracking(targetSession);
    targetSession.webRequest.onBeforeRequest((details, callback) => {
        // 0. Check EXAM MODE FIRST (highest priority)
        const examResult = examUrlFilter.checkUrl(details.url, details.resourceType);
        if (examResult.examActive && examResult.blocked) {
            // For navigation requests, redirect to exam blocked page
            if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
                // Send IPC event to the originating renderer to log the blocked URL
                console.log('[ExamFilter] Blocked URL:', details.url, 'Reason:', examResult.reason);
                sendToRequestWindow(details, 'examMode:urlBlocked', {
                    type: 'blocked_url_attempt',
                    url: details.url,
                    reason: examResult.reason || 'Not allowed during exam',
                    blockType: examResult.blockType || 'unknown',
                    timestamp: new Date().toISOString()
                });

                callback({
                    redirectURL: buildBlockedRedirectUrl('exam', details, {
                        reason: examResult.reason,
                        blockType: examResult.blockType
                    })
                });
            } else {
                // Cancel sub-resources silently
                callback({ cancel: true });
            }
            return;
        }

        // 1.5 Check Focus Mode social blocklist (after exam mode, before other filters)
        const requestProfileId = getProfileIdForRequest(details);
        const focusResult = focusModeManager.checkRequest(details.url, details.resourceType, requestProfileId);
        if (focusResult.focusActive && focusResult.blocked) {
            focusModeManager.logBlockedAttempt(requestProfileId, details.url, focusResult.reason).catch(() => {});

            if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
                sendToRequestWindow(details, 'focusMode:urlBlocked', {
                    type: 'blocked_url_attempt',
                    url: details.url,
                    reason: focusResult.reason,
                    domain: focusResult.domain,
                    timestamp: new Date().toISOString()
                });

                callback({
                    redirectURL: buildBlockedRedirectUrl('focus', details, {
                        reason: focusResult.reason,
                        domain: focusResult.domain
                    })
                });
            } else {
                callback({ cancel: true });
            }
            return;
        }

        if ((details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') && focusResult.focusActive) {
            focusModeManager.logVisit(requestProfileId, details.url).catch(() => {});
        }

        // 2. Check content filter (redirect to block page)
        const contentResult = contentFilter.checkRequest(details.url);
        if (contentResult === 'blocked') {
            // For navigation requests, redirect to custom protocol block page
            if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
                callback({ redirectURL: buildBlockedRedirectUrl('adult', details) });
            } else {
                callback({ cancel: true });
            }
            return;
        }

        // 3. Check ad-blocker
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
}

async function createOrFocusProfileWindow(profileId) {
    const existing = profileWindows.get(profileId);
    if (existing && !existing.isDestroyed()) {
        existing.focus();
        return { success: true, focusedExisting: true };
    }

    const profile = await getProfileById(profileId);
    const partition = getPartitionForProfile(profileId);
    const profileWindow = new BrowserWindow({
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
            webviewTag: true,
            partition
        }
    });

    mainWindow = profileWindow;
    profileWindows.set(profileId, profileWindow);
    windowProfiles.set(profileWindow.webContents.id, {
        profileId,
        profileName: profile.display_name
    });

    attachRequestInterception(session.fromPartition(partition));

    await activateProfile(profileId);
    await profileWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
        query: {
            profileId: String(profileId),
            profileName: profile.display_name
        }
    });
    profileWindow.maximize();

    profileWindow.on('focus', async () => {
        mainWindow = profileWindow;
        await activateProfile(profileId);
    });

    profileWindow.on('closed', async () => {
        profileWindows.delete(profileId);
        windowProfiles.delete(profileWindow.webContents.id);
        await touchProfile(profileId);
    });

    if (selectorWindow && !selectorWindow.isDestroyed()) {
        selectorWindow.close();
    }

    return { success: true, focusedExisting: false };
}

async function setupAdBlocker() {
    // Load both blocklists in parallel
    await Promise.all([
        loadBlocklists(),
        contentFilter.loadContentBlocklists()
    ]);

    // Register content filter IPC handlers
    contentFilter.registerIpcHandlers();

    attachRequestInterception(session.defaultSession);
    attachDownloadTracking(session.defaultSession);

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

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createProfileSelectorWindow();
    }
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

// Profile window management IPC
ipcMain.handle('profileSelector:profileSelected', async (event, profileId) => {
    try {
        const numericProfileId = Number(profileId);
        if (!numericProfileId || Number.isNaN(numericProfileId)) {
            return { success: false, error: 'Invalid profile ID' };
        }

        return await createOrFocusProfileWindow(numericProfileId);
    } catch (error) {
        console.error('[ProfileSelector] Failed to open profile window:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('profileWindow:open', async (event, profileId) => {
    try {
        const numericProfileId = Number(profileId);
        if (!numericProfileId || Number.isNaN(numericProfileId)) {
            return { success: false, error: 'Invalid profile ID' };
        }

        return await createOrFocusProfileWindow(numericProfileId);
    } catch (error) {
        console.error('[ProfileWindow] Failed to open profile window:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('profileWindow:getContext', async (event) => {
    let context = windowProfiles.get(event.sender.id);

    if (!context && event.sender.hostWebContents) {
        context = windowProfiles.get(event.sender.hostWebContents.id);
    }

    if (!context) {
        return { success: false, error: 'Window profile context not found' };
    }

    return {
        success: true,
        data: context
    };
});

// ==================== FOCUS MODE IPC HANDLERS ====================

ipcMain.handle('focusMode:startSession', async (event, profileId) => {
    const numericProfileId = Number(profileId) || 1;
    const startResult = await focusModeManager.startSession(numericProfileId);

    if (!startResult.success) {
        return startResult;
    }

    if (!startResult.alreadyActive) {
        await showFocusIntroWindow();
    }

    return startResult;
});

ipcMain.handle('focusMode:endSession', async (event, profileId) => {
    const numericProfileId = Number(profileId) || 1;
    return focusModeManager.endSession(numericProfileId);
});

ipcMain.handle('focusMode:getActiveSession', async (event, profileId) => {
    const numericProfileId = Number(profileId) || 1;
    return focusModeManager.getActiveSession(numericProfileId);
});

ipcMain.handle('focusMode:startBreak', async (event, profileId) => {
    const numericProfileId = Number(profileId) || 1;
    return focusModeManager.startBreak(numericProfileId);
});

ipcMain.handle('focusMode:getHistory', async (event, profileId, limit = 100) => {
    const numericProfileId = Number(profileId) || 1;
    return focusModeManager.getHistory(numericProfileId, limit);
});

ipcMain.handle('focusMode:getBlocklistMeta', async () => {
    return {
        success: true,
        data: focusModeManager.getBlocklistMeta()
    };
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
    return path.join(__dirname, '../');
});

// ==================== DOWNLOAD TRACKING ====================

ipcMain.handle('downloads:getHistory', async (event, profileId = null) => {
    const numericProfileId = Number(profileId);

    if (numericProfileId && !Number.isNaN(numericProfileId)) {
        return {
            success: true,
            data: downloadHistory.filter(item => Number(item.profileId) === numericProfileId)
        };
    }

    return {
        success: true,
        data: downloadHistory
    };
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
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
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
            reject(new Error(`Failed to connect to summarization service at ${BACKEND_BASE_URL}.`));
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
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
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
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
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
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
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
ipcMain.handle('history:search', async (event, query, limit = 50, profileId = null) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        const encodedQuery = encodeURIComponent(query);
        let requestPath = `/api/history/search?q=${encodedQuery}&limit=${limit}`;
        if (profileId) {
            requestPath += `&profile_id=${profileId}`;
        }

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
            hostname: BACKEND_HOST,
            port: BACKEND_PORT,
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
ipcMain.handle('history:clear', async (event, profileId = null) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        let requestPath = '/api/history/clear';
        if (profileId) {
            requestPath += `?profile_id=${profileId}`;
        }

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
ipcMain.handle('history:getStats', async (event, profileId = null) => {
    const http = require('http');

    return new Promise((resolve, reject) => {
        let requestPath = '/api/history/stats';
        if (profileId) {
            requestPath += `?profile_id=${profileId}`;
        }

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
                const targetWindow = profileWindows.get(profileId);
                if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send('examMode:sessionEndedByProfessor', { profileId });
                }
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
    const targetWindow = getBrowserWindowForEvent(event);
    const result = await dialog.showSaveDialog(targetWindow, {
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
ipcMain.handle('examMode:showOpenDialog', async (event) => {
    const targetWindow = getBrowserWindowForEvent(event);
    const result = await dialog.showOpenDialog(targetWindow, {
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
ipcMain.handle('examMode:showOpenDialogMultiple', async (event) => {
    const targetWindow = getBrowserWindowForEvent(event);
    const result = await dialog.showOpenDialog(targetWindow, {
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles`);
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}`);
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles`, {
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}`, {
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}`, {
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}/activate`, {
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
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles/active`);
        return await response.json();
    } catch (error) {
        console.error('❌ Error getting active profile:', error);
        return { success: false, error: error.message };
    }
});

// Get profile statistics
ipcMain.handle('profile:getStats', async (event, profileId) => {
    try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}/stats`);
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
        const activateResponse = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}/activate`, {
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
        const profileResponse = await fetch(`${BACKEND_BASE_URL}/api/profiles/${profileId}`);
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
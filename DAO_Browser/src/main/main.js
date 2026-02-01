const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// Ad-Blocker Statistics
let totalBlocked = 0;
let sessionBlocked = 0;
let adBlockerEnabled = true;

// Comprehensive list of ad and tracker domains
const AD_DOMAINS = [
    'doubleclick.net',
    'googlesyndication.com',
    'google-analytics.com',
    'analytics.google.com',
    'facebook.com/tr',
    'connect.facebook.net',
    'twitter.com/i/web',
    'ads.google.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    'googleadservices.com',
    'amazon-adsystem.com',
    'criteo.com',
    'scorecardresearch.com',
    'chartbeat.net',
    'kissmetrics.com',
    'mixpanel.com',
    'segment.com',
    'intercom.io',
    'fullstory.com'
];

// URL patterns that indicate ad/tracking requests
const AD_PATTERNS = [
    '/ads/',
    '/ad/',
    '/banner/',
    '/banners/',
    '/advertisements/',
    '/advertisement/',
    '/tracking',
    '/tracker/',
    '/pixels/',
    '/pixel.gif',
    '/analytics',
    '/metrics',
    '/beacon',
    '/t.gif',
    '.gif?',
    '/log?',
    '/log.php'
];

// Efficient filtering function
function isAdRequest(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const pathname = urlObj.pathname + urlObj.search;

        // Check against known ad domains
        for (const domain of AD_DOMAINS) {
            if (hostname.includes(domain)) {
                return true;
            }
        }

        // Check against ad patterns
        for (const pattern of AD_PATTERNS) {
            if (pathname.includes(pattern)) {
                return true;
            }
        }

        return false;
    } catch (e) {
        // Invalid URL, don't block
        return false;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            // This links our UI to our system securely
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true // Crucial for rendering other websites
        }
    });

    // Load our UI file
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    // Maximize the window
    mainWindow.maximize();
    
    // Open DevTools for debugging (Optional - uncomment to enable)
    mainWindow.webContents.openDevTools();
    
    // Setup ad-blocker for all webview instances
    setupAdBlocker();
}

function setupAdBlocker() {
    const { session } = require('electron');
    
    // Apply to default session
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        if (!adBlockerEnabled) {
            callback({ cancel: false });
            return;
        }

        const url = details.url;

        if (isAdRequest(url)) {
            console.log(`🚫 Blocked: ${url}`);
            sessionBlocked++;
            totalBlocked++;
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });

    console.log('✅ Ad-Blocker initialized');
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
    console.log(`Ad-Blocker ${adBlockerEnabled ? 'Enabled' : 'Disabled'}`);
    return adBlockerEnabled;
});

ipcMain.handle('adBlocker:resetSession', () => {
    sessionBlocked = 0;
    console.log('Session stats reset');
    return sessionBlocked;
});

// Log app info
console.log(`D.A.O. Browser v1.0 - Privacy & Distraction-Free`);
console.log(`Total Ads Blocked: ${totalBlocked}`);
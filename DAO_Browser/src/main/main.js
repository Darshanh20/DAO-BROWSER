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
        autoHideMenuBar: true,
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
    
    console.log('[History] Adding entry:', historyData.url);
    
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            url: historyData.url,
            title: historyData.title || '',
            favicon_url: historyData.favicon_url || '',
            visit_duration: historyData.visit_duration || 0
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
                        console.log('[History] Entry added successfully');
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
ipcMain.handle('history:getAll', async (event, page = 1, limit = 50) => {
    const http = require('http');
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5000,
            path: `/api/history/all?page=${page}&limit=${limit}`,
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

// Log app info
console.log(`D.A.O. Browser v1.0 - Privacy & Distraction-Free`);
console.log(`Total Ads Blocked: ${totalBlocked}`);
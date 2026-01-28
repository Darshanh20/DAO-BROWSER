const { app, BrowserWindow, Menu, ipcMain, session } = require("electron");
const path = require("path");
const adBlocker = require("./adBlocker");

try {
  require("electron-reloader")(module);
} catch (_) {}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,      // SECURITY: Enable context isolation
      enableRemoteModule: false,   // SECURITY: Disable remote module
      webviewTag: true,
      sandbox: true                // SECURITY: Enable sandbox
    }
  });

  win.loadFile(path.join(__dirname, "../frontend/index.html"));
  win.show();
  win.maximize();
  
  // Enable ad blocking for the main window's webContents
  console.log("[INIT] Setting up ad and tracker blocking...");
  const disableAdBlocking = adBlocker.enableAdBlocking(win.webContents);
  
  // ============================================
  // HANDLE NEW WINDOW/TAB REQUESTS
  // ============================================
  
  /**
   * Intercept new window requests from webviews (target="_blank", window.open, etc.)
   * Instead of opening a new window, create a new tab in the existing window
   */
  win.webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    console.log(`[MAIN] setWindowOpenHandler fired`);
    console.log(`[MAIN] URL: ${url}`);
    console.log(`[MAIN] Frame: ${frameName}`);
    console.log(`[MAIN] Features: ${features}`);
    
    // Send IPC message to renderer to create a new tab
    if (url) {
      console.log(`[MAIN] Sending create-new-tab IPC with URL: ${url}`);
      win.webContents.send('create-new-tab', {
        url: url,
        frameName: frameName,
        features: features
      });
    }
    
    // Deny opening external window
    return { action: 'deny' };
  });
  
  // Handle window resize - useful for webview scaling in complex layouts
  win.on('resize', () => {
    win.webContents.send('window-resized', {
      width: win.getSize()[0],
      height: win.getSize()[1]
    });
  });
  
  // Cleanup on window close
  win.on('closed', () => {
    disableAdBlocking();
  });
});

// ============================================
// IPC HANDLERS FOR AD-BLOCKER
// ============================================

/**
 * Get statistics for blocked ads/trackers
 * Usage: const stats = await ipcRenderer.invoke('get-blocked-stats', webContentsId);
 */
ipcMain.handle('get-blocked-stats', (event, webContentsId) => {
  if (!webContentsId) {
    webContentsId = event.sender.id;
  }
  
  const stats = adBlocker.getBlockedStats(webContentsId);
  return stats;
});

/**
 * Get all blocking patterns
 * Usage: const patterns = await ipcRenderer.invoke('get-blocking-patterns');
 */
ipcMain.handle('get-blocking-patterns', () => {
  return adBlocker.getBlockingPatterns();
});

/**
 * Add custom blocking patterns
 * Usage: await ipcRenderer.invoke('add-blocking-patterns', ['example.com', 'ads.example.com']);
 */
ipcMain.handle('add-blocking-patterns', (event, patterns) => {
  adBlocker.addBlockingPatterns(patterns);
  return { success: true, count: patterns.length };
});

/**
 * Remove blocking patterns
 * Usage: await ipcRenderer.invoke('remove-blocking-patterns', ['example.com']);
 */
ipcMain.handle('remove-blocking-patterns', (event, patterns) => {
  adBlocker.removeBlockingPatterns(patterns);
  return { success: true, count: patterns.length };
});

/**
 * Log statistics for debugging
 * Usage: await ipcRenderer.invoke('log-blocker-stats', webContentsId);
 */
ipcMain.handle('log-blocker-stats', (event, webContentsId) => {
  if (!webContentsId) {
    webContentsId = event.sender.id;
  }
  
  adBlocker.logStats(webContentsId);
  return { logged: true };
});

/**
 * Get all statistics from all sessions
 * Usage: const allStats = await ipcRenderer.invoke('get-all-blocker-stats');
 */
ipcMain.handle('get-all-blocker-stats', () => {
  return adBlocker.getAllStats();
});

/**
 * Clear statistics for a session
 * Usage: await ipcRenderer.invoke('clear-blocker-stats', webContentsId);
 */
ipcMain.handle('clear-blocker-stats', (event, webContentsId) => {
  if (!webContentsId) {
    webContentsId = event.sender.id;
  }
  
  adBlocker.clearStats(webContentsId);
  return { success: true };
});

/**
 * Toggle ad-blocking on/off
 * Usage: const state = await ipcRenderer.invoke('toggle-ad-blocker', true/false);
 */
ipcMain.handle('toggle-ad-blocker', (event, enabled) => {
  const newState = adBlocker.setAdBlockingEnabled(enabled);
  return { enabled: newState };
});

/**
 * Get ad-blocker enabled state
 * Usage: const enabled = await ipcRenderer.invoke('is-ad-blocker-enabled');
 */
ipcMain.handle('is-ad-blocker-enabled', () => {
  return { enabled: adBlocker.isAdBlockingEnabled() };
});

// ============================================
// IPC HANDLERS FOR NEW TAB REQUESTS
// ============================================

/**
 * Handle new tab creation request from webview
 * Called when a link with target="_blank" is clicked or window.open() is called
 * Usage: window.newTab.open('https://example.com');
 */
ipcMain.handle('open-new-tab', (event, url) => {
  if (!url) {
    return { success: false, error: 'No URL provided' };
  }
  
  console.log(`[NEW-TAB] Opening new tab from webview: ${url}`);
  
  // Get the browser window from the event sender
  const BrowserWindow = require('electron').BrowserWindow;
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  
  if (senderWindow) {
    // Send message to renderer to create a new tab
    senderWindow.webContents.send('create-new-tab', {
      url: url,
      fromWebview: true
    });
    
    return { success: true, url: url };
  }
  
  return { success: false, error: 'Browser window not found' };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});


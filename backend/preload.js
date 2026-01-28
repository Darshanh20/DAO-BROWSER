// Preload script for capturing keyboard events
const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener("DOMContentLoaded", () => {
  console.log("Browser preload loaded");
});

// Global keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Don't trigger shortcuts if typing in input field (except for address bar)
  const isInInput = document.activeElement && (
    document.activeElement.tagName === "INPUT" || 
    document.activeElement.tagName === "TEXTAREA"
  );
  
  const isAddressBar = document.activeElement && 
    document.activeElement.id === "urlBar";
  
  // Ctrl+T or Cmd+T: New Tab
  if ((e.ctrlKey || e.metaKey) && e.key === "t" && !isInInput) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-new-tab"));
    return;
  }
  
  // Alt+Left or Cmd+Left: Back
  if ((e.altKey && e.key === "ArrowLeft") || (e.metaKey && e.key === "ArrowLeft")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-back"));
    return;
  }
  
  // Alt+Right or Cmd+Right: Forward
  if ((e.altKey && e.key === "ArrowRight") || (e.metaKey && e.key === "ArrowRight")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-forward"));
    return;
  }
  
  // Ctrl+R or Cmd+R: Reload (not in address bar)
  if ((e.ctrlKey || e.metaKey) && e.key === "r" && !isAddressBar) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-reload"));
    return;
  }
  
  // Ctrl+L or Cmd+L: Focus address bar
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-focus-address"));
    return;
  }
  
  // Ctrl+Tab or Cmd+Tab: Next tab
  if ((e.ctrlKey && e.key === "Tab") || (e.metaKey && e.key === "Tab")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-next-tab"));
    return;
  }
  
  // Ctrl+Shift+Tab or Cmd+Shift+Tab: Previous tab
  if ((e.ctrlKey && e.shiftKey && e.key === "Tab") || (e.metaKey && e.shiftKey && e.key === "Tab")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-prev-tab"));
    return;
  }
  
  // Ctrl+W or Cmd+W: Close current tab
  if ((e.ctrlKey || e.metaKey) && e.key === "w" && !isInInput) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-close-tab"));
    return;
  }
});

// ============================================
// EXPOSE AD-BLOCKER API SAFELY
// ============================================

/**
 * Safe API for ad-blocker functionality
 * Accessible in renderer as: window.adBlocker
 */
contextBridge.exposeInMainWorld('adBlocker', {
  // Get statistics for blocked content
  getStats: async (webContentsId) => {
    return await ipcRenderer.invoke('get-blocked-stats', webContentsId);
  },
  
  // Get all blocking patterns
  getPatterns: async () => {
    return await ipcRenderer.invoke('get-blocking-patterns');
  },
  
  // Add custom blocking patterns
  addPatterns: async (patterns) => {
    return await ipcRenderer.invoke('add-blocking-patterns', patterns);
  },
  
  // Remove blocking patterns
  removePatterns: async (patterns) => {
    return await ipcRenderer.invoke('remove-blocking-patterns', patterns);
  },
  
  // Log statistics to console
  logStats: async (webContentsId) => {
    return await ipcRenderer.invoke('log-blocker-stats', webContentsId);
  },
  
  // Get all statistics
  getAllStats: async () => {
    return await ipcRenderer.invoke('get-all-blocker-stats');
  },
  
  // Clear statistics
  clearStats: async (webContentsId) => {
    return await ipcRenderer.invoke('clear-blocker-stats', webContentsId);
  },
  
  // Toggle ad-blocking on/off
  toggleBlocking: async (enabled) => {
    return await ipcRenderer.invoke('toggle-ad-blocker', enabled);
  },
  
  // Check if ad-blocking is enabled
  isEnabled: async () => {
    return await ipcRenderer.invoke('is-ad-blocker-enabled');
  }
});

// ============================================
// EXPOSE NEW TAB API SAFELY
// ============================================

/**
 * Safe API for opening new tabs
 * Accessible in renderer as: window.newTab
 */
contextBridge.exposeInMainWorld('newTab', {
  /**
   * Open a URL in a new tab
   * Called from webview when clicking target="_blank" links or window.open()
   */
  open: async (url) => {
    return await ipcRenderer.invoke('open-new-tab', url);
  }
});

/**
 * Expose IPC on event channel for listening to create-new-tab events
 */
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => {
      callback(event, ...args);
    });
  },
  once: (channel, callback) => {
    ipcRenderer.once(channel, (event, ...args) => {
      callback(event, ...args);
    });
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

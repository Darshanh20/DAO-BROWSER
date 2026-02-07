/**
 * Webview Preload Script
 * This script runs in the context of each webview (loaded website)
 * and enables communication with the parent renderer process.
 */

const { ipcRenderer } = require('electron');

// Capture Ctrl+F keyboard shortcut in webview
function setupCtrlFHandler() {
    document.addEventListener('keydown', (e) => {
        // Capture Ctrl+F (Windows/Linux) or Cmd+F (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            e.stopPropagation();
            
            // Send message to parent renderer (host)
            ipcRenderer.sendToHost('webview-ctrl-f');
            console.log('[Webview Preload] Ctrl+F sent to host');
        }
    }, true); // Use capture phase to intercept before page scripts
}

// Set up handler when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCtrlFHandler);
} else {
    setupCtrlFHandler();
}

console.log('[Webview Preload] Preload script initialized');


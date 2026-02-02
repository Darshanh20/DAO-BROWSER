const { contextBridge, ipcRenderer } = require('electron');

// We "expose" specific functions to the renderer (UI)
contextBridge.exposeInMainWorld('electronAPI', {
    // Health check for Python backend
    checkHealth: () => ipcRenderer.invoke('api:health'),

    // Ad-Blocker API
    adBlocker: {
        getStats: () => ipcRenderer.invoke('adBlocker:getStats'),
        toggle: () => ipcRenderer.invoke('adBlocker:toggle'),
        resetSession: () => ipcRenderer.invoke('adBlocker:resetSession')
    }
});
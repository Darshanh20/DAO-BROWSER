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
    },

    // Content Filter API
    contentFilter: {
        getStats: () => ipcRenderer.invoke('contentFilter:getStats'),
        toggle: () => ipcRenderer.invoke('contentFilter:toggle'),
        isEnabled: () => ipcRenderer.invoke('contentFilter:isEnabled')
    },

    // Path utilities
    paths: {
        getPath: (pathType) => ipcRenderer.invoke('app:getPath', pathType)
    },

    // Fetch API (goes through main process to bypass CORS)
    fetchNews: (url, options) => ipcRenderer.invoke('app:fetch', url, options)
});

// Expose summarization API
contextBridge.exposeInMainWorld('api', {
    summarizeArticle: (articleData) => ipcRenderer.invoke('summarize:article', articleData),
    checkSummarizationService: () => ipcRenderer.invoke('summarize:checkService')
});

// Expose history API
contextBridge.exposeInMainWorld('historyAPI', {
    addHistory: (historyData) => ipcRenderer.invoke('history:add', historyData),
    getAllHistory: (page, limit, profileId) => ipcRenderer.invoke('history:getAll', page, limit, profileId),
    searchHistory: (query, limit, profileId) => ipcRenderer.invoke('history:search', query, limit, profileId),
    deleteHistory: (entryId) => ipcRenderer.invoke('history:delete', entryId),
    clearHistory: (profileId) => ipcRenderer.invoke('history:clear', profileId),
    getStats: (profileId) => ipcRenderer.invoke('history:getStats', profileId)
});
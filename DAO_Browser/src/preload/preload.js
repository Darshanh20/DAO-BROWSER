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
    getAllHistory: (page, limit) => ipcRenderer.invoke('history:getAll', page, limit),
    searchHistory: (query, limit) => ipcRenderer.invoke('history:search', query, limit),
    deleteHistory: (entryId) => ipcRenderer.invoke('history:delete', entryId),
    clearHistory: () => ipcRenderer.invoke('history:clear'),
    getStats: () => ipcRenderer.invoke('history:getStats')
});
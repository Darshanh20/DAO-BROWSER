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

// Expose Exam Mode API
contextBridge.exposeInMainWorld('examModeAPI', {
    // Profile ID management for URL filtering
    setProfileId: (profileId) => 
        ipcRenderer.invoke('examMode:setProfileId', profileId),
    
    // Session management (all methods now require profileId for profile-specific state)
    createSession: (examInfo, whitelist, blacklist, settings, password, profileId) => 
        ipcRenderer.invoke('examMode:createSession', examInfo, whitelist, blacklist, settings, password, profileId),
    joinSession: (configPath, password, studentInfo, profileId) => 
        ipcRenderer.invoke('examMode:joinSession', configPath, password, studentInfo, profileId),
    loadConfig: (configPath) => 
        ipcRenderer.invoke('examMode:loadConfig', configPath),
    getActiveSession: (profileId) => 
        ipcRenderer.invoke('examMode:getActiveSession', profileId),
    endSession: (profileId) => 
        ipcRenderer.invoke('examMode:endSession', profileId),
    
    // URL checking
    checkUrl: (url, profileId) => 
        ipcRenderer.invoke('examMode:checkUrl', url, profileId),
    
    // Time management
    getRemainingTime: (profileId) => 
        ipcRenderer.invoke('examMode:getRemainingTime', profileId),
    
    // Activity logging (for students)
    logActivity: (activityEntry, profileId) => 
        ipcRenderer.invoke('examMode:logActivity', activityEntry, profileId),
    saveActivityLog: (profileId) => 
        ipcRenderer.invoke('examMode:saveActivityLog', profileId),
    logBlockedAttempt: (blockedInfo, profileId) => 
        ipcRenderer.invoke('examMode:logBlockedAttempt', blockedInfo, profileId),
    
    // URL Filter statistics
    getFilterStats: () => 
        ipcRenderer.invoke('examMode:getFilterStats'),
    invalidateCache: () => 
        ipcRenderer.invoke('examMode:invalidateCache'),
    
    // Validation helpers
    validatePassword: (password) => 
        ipcRenderer.invoke('examMode:validatePassword', password),
    validatePattern: (pattern) => 
        ipcRenderer.invoke('examMode:validatePattern', pattern),
    
    // Utility
    getAiToolsDomains: () => 
        ipcRenderer.invoke('examMode:getAiToolsDomains'),
    getSessionsDirectory: () => 
        ipcRenderer.invoke('examMode:getSessionsDirectory'),
    
    // File dialogs
    showSaveDialog: (defaultFileName) => 
        ipcRenderer.invoke('examMode:showSaveDialog', defaultFileName),
    saveFileToPath: (sourcePath, destPath) => 
        ipcRenderer.invoke('examMode:saveFileToPath', sourcePath, destPath),
    showOpenDialog: () => 
        ipcRenderer.invoke('examMode:showOpenDialog'),
    showOpenDialogMultiple: () => 
        ipcRenderer.invoke('examMode:showOpenDialogMultiple'),
    readFile: (filePath) => 
        ipcRenderer.invoke('examMode:readFile', filePath),
    
    // Clipboard
    copyToClipboard: (text) => 
        ipcRenderer.invoke('examMode:copyToClipboard', text),
    
    // Lockdown mode (browser restriction during student exams)
    setLockdownState: (locked, profileId, sessionId = null) => 
        ipcRenderer.invoke('examMode:setLockdownState', locked, profileId, sessionId),
    isLocked: (profileId) => 
        ipcRenderer.invoke('examMode:isLocked', profileId),
    
    // Lockdown event listeners
    onDownloadBlocked: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('examMode:downloadBlocked', listener);
        // Return cleanup function
        return () => ipcRenderer.removeListener('examMode:downloadBlocked', listener);
    }
});
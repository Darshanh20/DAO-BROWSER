/**
 * LogSyncer - Syncs student activity logs to backend server
 * Runs periodically during exam mode to keep professor dashboard updated
 */

const SYNC_INTERVAL_MS = 10000; // 10 seconds
const BACKEND_URL = 'http://localhost:5000/api/exam';

let syncInterval = null;
let isRunning = false;
let pendingLogs = [];
let currentSession = null;
let onSessionEndedCallback = null;

/**
 * Start the log syncer
 * @param {Object} session - Current exam session info
 * @param {Function} onSessionEnded - Callback when professor ends exam
 */
function start(session, onSessionEnded) {
    if (isRunning) {
        console.log('[LogSyncer] Already running');
        return;
    }
    
    currentSession = session;
    onSessionEndedCallback = onSessionEnded;
    pendingLogs = [];
    isRunning = true;
    
    console.log('[LogSyncer] Starting sync for session:', session.session_id);
    
    // Initial sync immediately
    syncLogs();
    
    // Start periodic sync
    syncInterval = setInterval(() => {
        syncLogs();
    }, SYNC_INTERVAL_MS);
    
    console.log('[LogSyncer] Started - syncing every 10s');
}

/**
 * Stop the log syncer
 */
function stop() {
    if (!isRunning) return;
    
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    
    isRunning = false;
    pendingLogs = [];
    currentSession = null;
    
    console.log('[LogSyncer] Stopped');
}

/**
 * Add logs to pending queue (called by ExamModeLockdown)
 * @param {Array} logs - Activity log entries
 */
function addLogs(logs) {
    if (!logs || !logs.length) return;
    
    pendingLogs.push(...logs);
    
    // Limit queue size to prevent memory issues
    if (pendingLogs.length > 1000) {
        pendingLogs = pendingLogs.slice(-500);
    }
    
    console.log(`[LogSyncer] Queued ${logs.length} logs (total pending: ${pendingLogs.length})`);
}

/**
 * Main sync function - posts logs to backend
 */
async function syncLogs() {
    if (!isRunning || !currentSession) {
        return;
    }
    
    const logsToSend = [...pendingLogs]; // Copy
    const currentUrl = getCurrentUrl();
    
    try {
        const response = await fetch(`${BACKEND_URL}/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: currentSession.session_id,
                student: {
                    name: currentSession.student_name || 'Unknown',
                    roll_number: currentSession.roll_number || 'Unknown'
                },
                logs: logsToSend,
                current_url: currentUrl,
                status: 'active',
                last_seen: new Date().toISOString()
            })
        });
        
        const data = await response.json();
        
        if (data.received) {
            // Success - clear sent logs from pending
            pendingLogs = pendingLogs.slice(logsToSend.length);
            console.log(`[LogSyncer] Synced ${logsToSend.length} logs`);
        } else if (data.session_ended) {
            // Professor ended the exam!
            console.log('[LogSyncer] Session ended by professor!');
            stop();
            
            if (onSessionEndedCallback) {
                onSessionEndedCallback();
            }
        } else {
            console.warn('[LogSyncer] Sync failed:', data.error);
        }
        
    } catch (error) {
        // Network error - keep logs in pending queue
        console.warn('[LogSyncer] Network error, will retry:', error.message);
    }
}

/**
 * Check session status (backup safety net)
 */
async function checkSessionStatus() {
    if (!currentSession) return { status: 'unknown' };
    
    try {
        const response = await fetch(`${BACKEND_URL}/session/${currentSession.session_id}/status`);
        const data = await response.json();
        
        if (data.status === 'ended') {
            console.log('[LogSyncer] Session ended (from status check)');
            stop();
            
            if (onSessionEndedCallback) {
                onSessionEndedCallback();
            }
        }
        
        return data;
        
    } catch (error) {
        console.warn('[LogSyncer] Status check failed:', error.message);
        return { status: 'error' };
    }
}

/**
 * Notify backend that student submitted
 */
async function notifySubmit() {
    if (!currentSession) return;
    
    try {
        await fetch(`${BACKEND_URL}/student/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSession.session_id,
                roll_number: currentSession.roll_number
            })
        });
        console.log('[LogSyncer] Submit notification sent');
    } catch (error) {
        console.warn('[LogSyncer] Submit notification failed:', error.message);
    }
}

/**
 * Get current active tab URL (if available)
 */
function getCurrentUrl() {
    try {
        // In main process context
        const { BrowserWindow } = require('electron');
        const focusedWindow = BrowserWindow.getFocusedWindow();
        
        if (focusedWindow && focusedWindow.webContents) {
            return focusedWindow.webContents.getURL();
        }
    } catch (e) {
        // Not in main process, try renderer context
        try {
            return window.location.href;
        } catch (e2) {
            return '';
        }
    }
    
    return '';
}

/**
 * Get sync status info
 */
function getStatus() {
    return {
        running: isRunning,
        session: currentSession?.session_id,
        pending_logs: pendingLogs.length,
        interval_ms: SYNC_INTERVAL_MS
    };
}

module.exports = {
    start,
    stop,
    addLogs,
    syncLogs,
    checkSessionStatus,
    notifySubmit,
    getStatus
};

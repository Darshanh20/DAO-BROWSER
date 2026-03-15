/**
 * LogSyncer - Syncs student activity logs to backend server
 * Runs periodically during exam mode to keep professor dashboard updated
 * Includes payload integrity checking via SHA-256 hashing
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SYNC_INTERVAL_MS = 10000; // 10 seconds
const BACKEND_URL = 'http://localhost:5000/api/exam';

let syncInterval = null;
let isRunning = false;
let pendingLogs = [];
let currentSession = null;
let currentProfileId = null;
let onSessionEndedCallback = null;
let lastSyncTime = null;
let backupRestored = false;

/**
 * Start the log syncer
 * @param {Object} session - Current exam session info
 * @param {string} profileId - Current profile ID for offline backup
 * @param {Function} onSessionEnded - Callback when professor ends exam
 */
function start(session, profileId, onSessionEnded) {
    if (isRunning) {
        return;
    }
    
    currentSession = session;
    currentProfileId = profileId;
    onSessionEndedCallback = onSessionEnded;
    pendingLogs = [];
    isRunning = true;
    lastSyncTime = Date.now();
    
    // Check for backup from previous session and flush if needed
    checkAndFlushBackup(profileId);
    
    // Initial sync immediately
    syncLogs();
    
    // Start periodic sync
    syncInterval = setInterval(() => {
        syncLogs();
    }, SYNC_INTERVAL_MS);
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
}

/**
 * Generate SHA-256 hash of payload for integrity verification
 * @param {Object} payload - The payload to hash
 * @returns {string} - Hex-encoded SHA-256 hash
 */
function generatePayloadHash(payload) {
    const hashSource = JSON.stringify({
        session_id: payload.session_id,
        roll_number: payload.student.roll_number,
        logs: payload.logs,
        last_seen: payload.last_seen
    }, null, 0); // No whitespace for consistent hashing
    
    return crypto
        .createHash('sha256')
        .update(hashSource)
        .digest('hex');
}

/**
 * Get backup path for profile-specific offline log storage
 * @param {string} profileId - The profile ID
 * @returns {string} - Path to backup file
 */
function getBackupPath(profileId) {
    const baseDir = path.join(os.homedir(), '.dao-browser', 'profiles', profileId);
    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
    }
    return path.join(baseDir, 'exam_log_backup.json');
}

/**
 * Save pending logs to offline backup (when backend is unreachable)
 * @param {string} profileId - The profile ID
 */
function saveOfflineBackup(profileId) {
    if (!currentSession || pendingLogs.length === 0) {
        return;
    }
    
    try {
        const backupPath = getBackupPath(profileId);
        const backupData = {
            session_id: currentSession.session_id,
            student: {
                name: currentSession.student_name || 'Unknown',
                roll_number: currentSession.roll_number || 'Unknown'
            },
            pending_logs: [...pendingLogs],
            last_backup: new Date().toISOString()
        };
        
        fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
    } catch (error) {
        console.error('[LogSyncer] Failed to save offline backup:', error.message);
    }
}

/**
 * Check for and flush offline backup from previous session
 * @param {string} profileId - The profile ID
 */
function checkAndFlushBackup(profileId) {
    try {
        const backupPath = getBackupPath(profileId);
        
        if (fs.existsSync(backupPath)) {
            const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            
            // Add backed-up logs to pending queue
            pendingLogs.push(...backupData.pending_logs);
            
            // Delete backup file
            fs.unlinkSync(backupPath);
            
            backupRestored = true;
        }
    } catch (error) {
        console.error('[LogSyncer] Failed to restore backup:', error.message);
    }
}


function addLogs(logs) {
    if (!logs || !logs.length) return;
    
    pendingLogs.push(...logs);
    
    // Limit queue size to prevent memory issues
    if (pendingLogs.length > 1000) {
        pendingLogs = pendingLogs.slice(-500);
    }
}

/**
 * Main sync function - posts logs to backend with integrity hash
 */
async function syncLogs() {
    if (!isRunning || !currentSession) {
        return;
    }
    
    const logsToSend = [...pendingLogs]; // Copy
    const currentUrl = getCurrentUrl();
    
    // Build payload
    const payload = {
        session_id: currentSession.session_id,
        student: {
            name: currentSession.student_name || 'Unknown',
            roll_number: currentSession.roll_number || 'Unknown'
        },
        logs: logsToSend,
        current_url: currentUrl,
        status: 'active',
        last_seen: new Date().toISOString()
    };
    
    // Generate integrity hash
    payload.payload_hash = generatePayloadHash(payload);
    
    try {
        const response = await fetch(`${BACKEND_URL}/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.received) {
            // Success - clear sent logs from pending
            pendingLogs = pendingLogs.slice(logsToSend.length);
            lastSyncTime = Date.now();
        } else if (data.session_ended) {
            // Professor ended the exam!
            stop();
            
            if (onSessionEndedCallback) {
                onSessionEndedCallback();
            }
        }
        
    } catch (error) {
        // Network error - save offline backup and keep retrying
        // Save pending logs to offline backup file
        if (currentProfileId) {
            saveOfflineBackup(currentProfileId);
        }
    }
}

/**
 * Get last sync time (for connection status indicator)
 * @returns {number|null} - Milliseconds, or null if never synced
 */
function getLastSyncTime() {
    return lastSyncTime;
}

/**
 * Get connection status (for exam banner UI)
 * @returns {string} - 'synced', 'syncing', or 'offline'
 */
function getConnectionStatus() {
    if (!isRunning) return 'offline';
    
    const timeSinceSync = lastSyncTime ? Date.now() - lastSyncTime : null;
    
    // If synced within last 15 seconds, consider it synced
    if (timeSinceSync !== null && timeSinceSync < 15000) {
        return 'synced';
    }
    
    // If there are pending logs and it's been > 20s, likely offline
    if (pendingLogs.length > 0 && timeSinceSync && timeSinceSync > 20000) {
        return 'offline';
    }
    
    return 'syncing';
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
    getStatus,
    getConnectionStatus,
    getLastSyncTime
};

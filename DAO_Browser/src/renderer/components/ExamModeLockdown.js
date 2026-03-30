/**
 * Exam Mode Lockdown Module (Revised)
 * Manages minimal restrictions + silent activity logging for student exam sessions
 * 
 * ONLY these restrictions are enforced:
 * - DevTools blocked (F12, Ctrl+Shift+I, Ctrl+Shift+J)
 * - Profile switching locked (handled by ProfileSwitcher component)
 * 
 * All other activity is LOGGED SILENTLY (no blocking):
 * - Window/app switching (blur/focus events)
 * - Blocked URL attempts (from Phase 2 URL filter)
 * - DevTools attempts
 * 
 * Student is NOT notified about what is being logged.
 */

class ExamModeLockdown {
    constructor() {
        this.isLocked = false;
        this.session = null;
        
        // Only block devtools shortcuts
        this.blockedShortcuts = [
            { key: 'F12' },                        // F12 - DevTools
            { key: 'I', ctrl: true, shift: true }, // Ctrl+Shift+I - DevTools
            { key: 'J', ctrl: true, shift: true }, // Ctrl+Shift+J - Console
        ];
        
        // Window switching tracking
        this.windowSwitchCount = 0;
        this.lastBlurTime = null;
        this.isWindowFocused = true;
        
        // Backend sync configuration
        this.BACKEND_URL = 'http://localhost:5000/api/exam';
        this.SYNC_INTERVAL_MS = 10000; // 10 seconds
        this.syncInterval = null;
        this.pendingLogs = [];
        
        this.init();
    }

    init() {
        // Listen for exam session activation
        document.addEventListener('examSessionActivated', (e) => {
            if (e.detail?.session?.role === 'student') {
                this.activateLockdown(e.detail.session);
            }
        });
        
        // Listen for exam session end
        document.addEventListener('examSessionEnded', () => {
            this.deactivateLockdown();
        });
        
        // Listen for profile switch (deactivate if no session on new profile)
        document.addEventListener('profileSwitched', () => {
            setTimeout(() => {
                if (!window.examSessionBanner?.session) {
                    this.deactivateLockdown();
                }
            }, 500);
        });
        
        // Listen for blocked URL events from main process
        this.setupUrlBlockedListener();
    }
    
    /**
     * Setup listener for URL blocked events from main process
     */
    setupUrlBlockedListener() {
        if (window.examModeAPI && typeof window.examModeAPI.onUrlBlocked === 'function') {
            this.urlBlockedCleanup = window.examModeAPI.onUrlBlocked((data) => {
                if (this.isLocked) {
                    this.logActivity({
                        type: 'blocked_url_attempt',
                        url: data.url,
                        reason: data.reason,
                        blockType: data.blockType,
                        timestamp: data.timestamp || new Date().toISOString()
                    });
                }
            });
        }
    }

    /**
     * Activate lockdown mode for student exam session
     * @param {Object} session - The exam session state
     */
    activateLockdown(session) {
        if (this.isLocked) {
            return;
        }
        
        this.isLocked = true;
        this.session = session;
        this.windowSwitchCount = 0;
        
        // Add lockdown class to body (for CSS styling)
        document.body.classList.add('exam-lockdown-active');
        document.body.classList.add('exam-student-mode');
        
        // Block devtools shortcuts only
        this.blockDevToolsShortcuts();
        
        // Start window switching detection (silent logging)
        this.startWindowSwitchDetection();
        
        // Start backend sync (every 10s)
        this.startBackendSync();
        
        // Notify main process
        this.notifyMainProcess(true);
        
        // Dispatch event for profile switcher to lock
        this.dispatchLockdownEvent(true);
    }

    /**
     * Deactivate lockdown mode
     */
    deactivateLockdown() {
        if (!this.isLocked) return;
        
        // Remove lockdown class from body
        document.body.classList.remove('exam-lockdown-active');
        document.body.classList.remove('exam-student-mode');
        
        // Remove keyboard blocker
        this.unblockDevToolsShortcuts();
        
        // Stop window switching detection
        this.stopWindowSwitchDetection();
        
        // Stop backend sync
        this.stopBackendSync();
        
        // Notify main process
        this.notifyMainProcess(false);
        
        // Dispatch event for profile switcher to unlock
        this.dispatchLockdownEvent(false);
        
        this.isLocked = false;
        this.session = null;
    }

    /**
     * Dispatch lockdown state change event for other components
     */
    dispatchLockdownEvent(locked) {
        const event = new CustomEvent('examLockdownStateChanged', {
            detail: { 
                locked,
                session: this.session,
                profileId: localStorage.getItem('dao_current_profile_id')
            },
            bubbles: true
        });
        document.dispatchEvent(event);
    }

    /**
     * Block only DevTools keyboard shortcuts
     */
    blockDevToolsShortcuts() {
        this.keydownHandler = (e) => {
            if (!this.isLocked) return;
            
            for (const shortcut of this.blockedShortcuts) {
                const keyMatch = e.key === shortcut.key || 
                                e.key.toUpperCase() === shortcut.key?.toUpperCase();
                const ctrlMatch = !shortcut.ctrl || (e.ctrlKey || e.metaKey);
                const shiftMatch = !shortcut.shift || e.shiftKey;
                
                if (keyMatch && ctrlMatch && shiftMatch) {
                    if (shortcut.ctrl && !(e.ctrlKey || e.metaKey)) continue;
                    if (shortcut.shift && !e.shiftKey) continue;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // Log silently (no toast shown to student)
                    this.logActivity({
                        type: 'devtools_attempt',
                        shortcut_used: this.formatShortcut(shortcut),
                        timestamp: new Date().toISOString()
                    });
                    
                    return false;
                }
            }
        };
        
        document.addEventListener('keydown', this.keydownHandler, true);
    }

    /**
     * Remove keyboard shortcut blocker
     */
    unblockDevToolsShortcuts() {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
    }

    /**
     * Start detecting window/app switching (silent logging only)
     */
    startWindowSwitchDetection() {
        this.blurHandler = () => {
            if (!this.isLocked) return;
            
            this.isWindowFocused = false;
            this.lastBlurTime = new Date();
            this.windowSwitchCount++;

        };
        
        this.focusHandler = () => {
            if (!this.isLocked || this.isWindowFocused) return;
            
            this.isWindowFocused = true;
            const returnTime = new Date();
            
            // Calculate time away
            let awayDurationSeconds = 0;
            if (this.lastBlurTime) {
                awayDurationSeconds = Math.round((returnTime - this.lastBlurTime) / 1000);
            }
            
            // Log the window switch silently
            this.logActivity({
                type: 'window_switched',
                timestamp: this.lastBlurTime?.toISOString(),
                returned_at: returnTime.toISOString(),
                away_duration_seconds: awayDurationSeconds,
                violation_number: this.windowSwitchCount
            });
            
            this.lastBlurTime = null;
        };
        
        window.addEventListener('blur', this.blurHandler);
        window.addEventListener('focus', this.focusHandler);
    }

    /**
     * Stop window switching detection
     */
    stopWindowSwitchDetection() {
        if (this.blurHandler) {
            window.removeEventListener('blur', this.blurHandler);
            this.blurHandler = null;
        }
        if (this.focusHandler) {
            window.removeEventListener('focus', this.focusHandler);
            this.focusHandler = null;
        }
    }

    /**
     * Notify main process about lockdown state
     */
    async notifyMainProcess(locked) {
        try {
            if (window.examModeAPI) {
                const profileId = localStorage.getItem('dao_current_profile_id');
                await window.examModeAPI.setLockdownState(locked, profileId);
            }
        } catch (error) {
            console.error('[Lockdown] Failed to notify main process:', error);
        }
    }

    /**
     * Format shortcut for logging
     */
    formatShortcut(shortcut) {
        let parts = [];
        if (shortcut.ctrl) parts.push('Ctrl');
        if (shortcut.shift) parts.push('Shift');
        if (shortcut.alt) parts.push('Alt');
        parts.push(shortcut.key);
        return parts.join('+');
    }

    // ==================== BACKEND SYNC ====================

    /**
     * Start periodic sync to backend
     */
    startBackendSync() {
        if (this.syncInterval) {
            return;
        }
        
        // Initial sync immediately
        this.syncToBackend();
        
        // Periodic sync
        this.syncInterval = setInterval(() => {
            this.syncToBackend();
        }, this.SYNC_INTERVAL_MS);
    }

    /**
     * Stop backend sync
     */
    stopBackendSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.pendingLogs = [];
    }

    /**
     * Sync logs to backend server
     */
    async syncToBackend() {
        if (!this.isLocked || !this.session) {
            return;
        }
        
        const logsToSend = [...this.pendingLogs];
        
        // Get student info with fallbacks
        const studentName = this.session.student_info?.name || 
                            this.session.studentInfo?.name || 
                            'Unknown';
        const rollNumber = this.session.student_info?.roll_number || 
                           this.session.studentInfo?.roll_number ||
                           this.session.roll_number || 
                           'Unknown';
        
        // Get current active tab URL from webview if available
        let currentUrl = 'N/A';
        try {
            const activeWebview = document.querySelector('webview.active');
            if (activeWebview) {
                currentUrl = activeWebview.getURL() || activeWebview.src || 'N/A';
            }
        } catch (e) {
            // Fallback to renderer location
            currentUrl = 'exam-app';
        }
        
        const payload = {
            session_id: this.session.session_id,
            student: {
                name: studentName,
                roll_number: rollNumber
            },
            logs: logsToSend,
            current_url: currentUrl,
            status: 'active',
            last_seen: new Date().toISOString()
        };
        
        try {
            const response = await fetch(`${this.BACKEND_URL}/log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            const data = await response.json();
            
            if (data.received) {
                // Clear sent logs
                this.pendingLogs = this.pendingLogs.slice(logsToSend.length);
            } else if (data.session_ended) {
                // Professor ended the exam!
                this.handleRemoteSessionEnd();
            } else {
                console.warn('[Lockdown] Sync response not received:', data);
            }
            
        } catch (error) {
            // Network error - keep logs in queue, will retry
            console.error('[Lockdown] Backend sync failed:', error.message, error);
        }
    }

    /**
     * Handle remote session end (professor ended exam)
     */
    handleRemoteSessionEnd() {
        // Stop syncing
        this.stopBackendSync();
        
        // Show notification modal
        this.showSessionEndedModal();
        
        // Trigger auto-submit after a brief delay
        setTimeout(() => {
            this.triggerAutoSubmit();
        }, 3000);
    }

    /**
     * Show session ended notification modal
     */
    showSessionEndedModal() {
        const modal = document.createElement('div');
        modal.className = 'exam-session-ended-modal';
        modal.innerHTML = `
            <div class="ended-modal-content">
                <div class="ended-icon">⏰</div>
                <h2>Exam Ended</h2>
                <p>The professor has ended the exam session.</p>
                <p>Your activity log is being saved automatically...</p>
                <div class="ended-countdown">
                    <span class="countdown-spinner"></span>
                    Submitting...
                </div>
            </div>
        `;
        
        // Add styles if not present
        if (!document.querySelector('#exam-ended-modal-styles')) {
            const styles = document.createElement('style');
            styles.id = 'exam-ended-modal-styles';
            styles.textContent = `
                .exam-session-ended-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.95);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 99999;
                }
                .ended-modal-content {
                    background: transparent;
                    border: 2px solid #2ecc71;
                    padding: 40px 60px;
                    border-radius: 16px;
                    text-align: center;
                    color: #e0e0e0;
                }
                .ended-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                    color: #2ecc71;
                }
                .ended-modal-content h2 {
                    font-size: 28px;
                    margin-bottom: 16px;
                    color: #2ecc71;
                }
                .ended-modal-content p {
                    font-size: 16px;
                    margin-bottom: 8px;
                    color: #888888;
                }
                .ended-countdown {
                    margin-top: 24px;
                    font-size: 14px;
                    color: #2ecc71;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }
                .countdown-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #2ecc71;
                    border-top-color: transparent;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(modal);
    }

    /**
     * Trigger automatic exam submission
     */
    async triggerAutoSubmit() {
        try {
            // Save activity log
            if (window.examModeAPI) {
                const profileId = localStorage.getItem('dao_current_profile_id');
                await window.examModeAPI.saveActivityLog(profileId);
            }
            
            // End local session
            if (window.examSessionBanner) {
                await window.examSessionBanner.submitExam(true); // true = silent/auto submit
            }
            
            // Remove modal and reload
            const modal = document.querySelector('.exam-session-ended-modal');
            if (modal) {
                modal.querySelector('.ended-countdown').innerHTML = '✓ Submitted successfully!';
                setTimeout(() => {
                    modal.remove();
                }, 1500);
            }
            
        } catch (error) {
            console.error('[Lockdown] Auto-submit failed:', error);
        }
    }

    /**
     * Log activity silently to activity log
     */
    async logActivity(activityEntry) {
        try {
            // Add to pending logs for backend sync
            this.pendingLogs.push(activityEntry);
            
            // Limit pending queue size
            if (this.pendingLogs.length > 500) {
                this.pendingLogs = this.pendingLogs.slice(-250);
            }
            
            // Also save to local file via IPC
            if (window.examModeAPI) {
                const profileId = localStorage.getItem('dao_current_profile_id');
                await window.examModeAPI.logActivity(activityEntry, profileId);
            }
        } catch (error) {
            console.error('[Lockdown] Failed to log activity:', error);
        }
    }

    /**
     * Check if lockdown is currently active
     */
    isLockdownActive() {
        return this.isLocked;
    }

    /**
     * Get current lockdown state
     */
    getLockdownState() {
        return {
            locked: this.isLocked,
            session: this.session,
            windowSwitchCount: this.windowSwitchCount
        };
    }

    /**
     * Get window switch statistics
     */
    getWindowSwitchStats() {
        return {
            count: this.windowSwitchCount,
            currentlyFocused: this.isWindowFocused
        };
    }
}

// Create global instance
window.examModeLockdown = new ExamModeLockdown();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExamModeLockdown;
}

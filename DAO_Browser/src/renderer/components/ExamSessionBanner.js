/**
 * Exam Session Banner Component
 * Displays active exam session status, timer, and handles session state persistence
 * Session state is now profile-specific
 */

class ExamSessionBanner {
    constructor() {
        this.session = null;
        this.timerInterval = null;
        this.warningShown = {
            '15': false,
            '10': false,
            '5': false
        };
        
        this.init();
    }

    async init() {
        this.setupElements();
        this.attachEventListeners();
        this.setupProfileSwitchListener();
        
        // Check for active session on startup
        await this.checkAndRestoreSession();
        
        console.log('✅ Exam Session Banner initialized');
    }

    /**
     * Get current profile ID from localStorage
     * @returns {string|null} Current profile ID or null
     */
    getCurrentProfileId() {
        return localStorage.getItem('dao_current_profile_id');
    }

    /**
     * Setup listener for profile switching events
     */
    setupProfileSwitchListener() {
        document.addEventListener('profileSwitched', async (event) => {
            console.log('[ExamBanner] Profile switched, reloading session state...');
            
            const newProfileId = event.detail?.profile?.id || this.getCurrentProfileId();
            
            // Clear current session display
            this.clearSession();
            
            // Check for session on new profile
            await this.checkAndRestoreSession();
            
            // Show toast if no active session on new profile
            if (!this.session) {
                this.showToast('No active exam session on this profile', 'info');
            }
        });
    }

    setupElements() {
        // Banner elements
        this.banner = document.getElementById('exam-session-banner');
        this.statusDot = this.banner?.querySelector('.exam-status-dot');
        this.statusText = document.getElementById('exam-banner-status-text');
        this.examName = document.getElementById('exam-banner-name');
        this.sessionIdEl = document.getElementById('exam-banner-session-id');
        this.sessionInfo = document.getElementById('exam-banner-session-info');
        this.countdown = document.getElementById('exam-banner-countdown');
        this.timerContainer = this.banner?.querySelector('.exam-banner-timer');
        this.userInfo = document.getElementById('exam-banner-user-info');
        this.userEl = document.getElementById('exam-banner-user');
        this.userDivider = document.getElementById('exam-banner-user-divider');
        
        // Settings page elements
        this.inactiveView = document.getElementById('exammode-inactive');
        this.professorView = document.getElementById('exammode-professor-active');
        this.studentView = document.getElementById('exammode-student-active');
        
        // Professor view elements
        this.profSessionName = document.getElementById('prof-session-name');
        this.profSessionSubject = document.getElementById('prof-session-subject');
        this.profSessionId = document.getElementById('prof-session-id');
        this.profSessionTime = document.getElementById('prof-session-time');
        this.endExamBtn = document.getElementById('end-exam-professor-btn');
        
        // Student view elements
        this.studentSessionName = document.getElementById('student-session-name');
        this.studentSessionSubject = document.getElementById('student-session-subject');
        this.studentSessionBy = document.getElementById('student-session-by');
        this.studentSessionTime = document.getElementById('student-session-time');
        this.submitExamBtn = document.getElementById('submit-exam-student-btn');
        
        // Confirmation modals
        this.endExamModal = document.getElementById('end-exam-confirm-modal');
        this.submitExamModal = document.getElementById('submit-exam-confirm-modal');
        this.cancelEndBtn = document.getElementById('cancel-end-exam-btn');
        this.confirmEndBtn = document.getElementById('confirm-end-exam-btn');
        this.cancelSubmitBtn = document.getElementById('cancel-submit-exam-btn');
        this.confirmSubmitBtn = document.getElementById('confirm-submit-exam-btn');
        
        // Toast
        this.toast = document.getElementById('exam-toast');
        this.toastMessage = document.getElementById('exam-toast-message');
    }

    attachEventListeners() {
        // End exam button (Professor)
        if (this.endExamBtn) {
            this.endExamBtn.addEventListener('click', () => this.showEndExamConfirm());
        }
        
        // Submit exam button (Student)
        if (this.submitExamBtn) {
            this.submitExamBtn.addEventListener('click', () => this.showSubmitExamConfirm());
        }
        
        // End exam confirmation
        if (this.cancelEndBtn) {
            this.cancelEndBtn.addEventListener('click', () => this.hideEndExamConfirm());
        }
        if (this.confirmEndBtn) {
            this.confirmEndBtn.addEventListener('click', () => this.endExamSession());
        }
        
        // Submit exam confirmation
        if (this.cancelSubmitBtn) {
            this.cancelSubmitBtn.addEventListener('click', () => this.hideSubmitExamConfirm());
        }
        if (this.confirmSubmitBtn) {
            this.confirmSubmitBtn.addEventListener('click', () => this.submitAndEndExam());
        }
        
        // Close modals on outside click
        if (this.endExamModal) {
            this.endExamModal.addEventListener('click', (e) => {
                if (e.target === this.endExamModal) this.hideEndExamConfirm();
            });
        }
        if (this.submitExamModal) {
            this.submitExamModal.addEventListener('click', (e) => {
                if (e.target === this.submitExamModal) this.hideSubmitExamConfirm();
            });
        }
    }

    // ==================== SESSION STATE ====================

    async checkAndRestoreSession() {
        try {
            const profileId = this.getCurrentProfileId();
            const session = await window.examModeAPI.getActiveSession(profileId);
            
            if (session && session.active) {
                // Check if session has expired
                const endTime = new Date(session.end_time);
                const now = new Date();
                
                if (endTime <= now) {
                    // Session expired, auto-end it
                    console.log('[ExamBanner] Session expired, auto-ending...');
                    await this.autoEndSession(session);
                    return;
                }
                
                // Restore active session
                this.session = session;
                this.showBanner();
                this.updateSettingsPage();
                this.startTimer();
                
                console.log(`[ExamBanner] Session restored: ${session.session_id} (${session.role}) for profile: ${profileId}`);
            }
        } catch (error) {
            console.error('[ExamBanner] Error checking session:', error);
        }
    }

    async autoEndSession(session) {
        const profileId = this.getCurrentProfileId();
        
        if (session.role === 'student') {
            // Save activity log before ending
            await window.examModeAPI.saveActivityLog(profileId);
            this.showToast('Exam time expired! Activity log saved.');
        } else {
            this.showToast('Exam session has ended.');
        }
        
        await window.examModeAPI.endSession(profileId);
        this.clearSession();
    }

    activateSession(session) {
        this.session = session;
        this.warningShown = { '15': false, '10': false, '5': false };
        this.showBanner();
        this.updateSettingsPage();
        this.startTimer();
        
        console.log(`[ExamBanner] Session activated: ${session.session_id} (${session.role})`);
    }

    clearSession() {
        this.session = null;
        this.stopTimer();
        this.hideBanner();
        this.updateSettingsPage();
        
        console.log('[ExamBanner] Session cleared');
    }

    // ==================== BANNER DISPLAY ====================

    showBanner() {
        if (!this.banner || !this.session) return;
        
        const isStudent = this.session.role === 'student';
        const isProfessor = this.session.role === 'professor';
        
        // Set banner role class
        this.banner.classList.remove('professor', 'student', 'hidden');
        this.banner.classList.add(this.session.role);
        
        // Update status text
        if (this.statusText) {
            this.statusText.textContent = isStudent ? 'EXAM MODE ACTIVE' : 'EXAM RUNNING';
        }
        
        // Update exam name
        if (this.examName && this.session.exam_info) {
            this.examName.textContent = this.session.exam_info.name;
        }
        
        // Update session ID (professor only, hide for students)
        if (this.sessionInfo) {
            if (isProfessor) {
                this.sessionInfo.style.display = 'block';
                if (this.sessionIdEl) {
                    this.sessionIdEl.textContent = `Session: ${this.session.session_id}`;
                }
            } else {
                this.sessionInfo.style.display = 'none';
            }
        }
        
        // Update user info (student only)
        if (this.userInfo && this.userDivider) {
            if (isStudent && this.session.student_info) {
                this.userInfo.style.display = 'flex';
                this.userDivider.style.display = 'block';
                if (this.userEl) {
                    this.userEl.textContent = `${this.session.student_info.name} (${this.session.student_info.roll_number})`;
                }
            } else {
                this.userInfo.style.display = 'none';
                this.userDivider.style.display = 'none';
            }
        }
    }

    hideBanner() {
        if (this.banner) {
            this.banner.classList.add('hidden');
        }
    }

    // ==================== SETTINGS PAGE ====================

    updateSettingsPage() {
        if (!this.inactiveView) return;
        
        if (!this.session) {
            // No active session - show launch button
            this.inactiveView.style.display = 'block';
            if (this.professorView) this.professorView.style.display = 'none';
            if (this.studentView) this.studentView.style.display = 'none';
            return;
        }
        
        // Hide inactive view
        this.inactiveView.style.display = 'none';
        
        if (this.session.role === 'professor') {
            // Show professor view
            if (this.professorView) {
                this.professorView.style.display = 'block';
                if (this.profSessionName) {
                    this.profSessionName.textContent = this.session.exam_info?.name || '-';
                }
                if (this.profSessionSubject) {
                    this.profSessionSubject.textContent = this.session.exam_info?.subject || '-';
                }
                if (this.profSessionId) {
                    this.profSessionId.textContent = this.session.session_id;
                }
            }
            if (this.studentView) this.studentView.style.display = 'none';
        } else {
            // Show student view
            if (this.studentView) {
                this.studentView.style.display = 'block';
                if (this.studentSessionName) {
                    this.studentSessionName.textContent = this.session.exam_info?.name || '-';
                }
                if (this.studentSessionSubject) {
                    this.studentSessionSubject.textContent = this.session.exam_info?.subject || '-';
                }
                if (this.studentSessionBy) {
                    this.studentSessionBy.textContent = this.session.exam_info?.created_by || '-';
                }
            }
            if (this.professorView) this.professorView.style.display = 'none';
        }
    }

    // ==================== TIMER ====================

    startTimer() {
        this.stopTimer(); // Clear any existing timer
        
        // Update immediately
        this.updateTimer();
        
        // Then update every second
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimer() {
        if (!this.session) return;
        
        const endTime = new Date(this.session.end_time);
        const now = new Date();
        const remainingMs = endTime - now;
        
        if (remainingMs <= 0) {
            // Time's up!
            this.stopTimer();
            this.handleTimeUp();
            return;
        }
        
        // Calculate hours, minutes, seconds
        const totalSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update banner countdown
        if (this.countdown) {
            this.countdown.textContent = timeStr;
        }
        
        // Update timer style based on remaining time
        const remainingMinutes = totalSeconds / 60;
        
        if (this.timerContainer) {
            this.timerContainer.classList.remove('warning', 'critical');
            if (remainingMinutes <= 5) {
                this.timerContainer.classList.add('critical');
            } else if (remainingMinutes <= 15) {
                this.timerContainer.classList.add('warning');
            }
        }
        
        // Update Settings page timers
        if (this.session.role === 'professor' && this.profSessionTime) {
            this.profSessionTime.textContent = timeStr;
        } else if (this.studentSessionTime) {
            this.studentSessionTime.textContent = timeStr;
        }
        
        // Show warning notifications
        this.checkWarnings(remainingMinutes);
    }

    checkWarnings(remainingMinutes) {
        if (remainingMinutes <= 15 && remainingMinutes > 10 && !this.warningShown['15']) {
            this.showToast('⚠️ 15 minutes remaining', 'warning');
            this.warningShown['15'] = true;
        } else if (remainingMinutes <= 10 && remainingMinutes > 5 && !this.warningShown['10']) {
            this.showToast('⚠️ 10 minutes remaining', 'warning');
            this.warningShown['10'] = true;
        } else if (remainingMinutes <= 5 && !this.warningShown['5']) {
            this.showToast('🔴 5 minutes remaining!', 'error');
            this.warningShown['5'] = true;
        }
    }

    async handleTimeUp() {
        console.log('[ExamBanner] Time is up!');
        
        if (this.session.role === 'student') {
            // Auto submit for student
            await this.submitAndEndExam();
        } else {
            // Auto end for professor
            await this.endExamSession();
        }
    }

    // ==================== END SESSION FLOWS ====================

    showEndExamConfirm() {
        if (this.endExamModal) {
            this.endExamModal.classList.remove('hidden');
        }
    }

    hideEndExamConfirm() {
        if (this.endExamModal) {
            this.endExamModal.classList.add('hidden');
        }
    }

    showSubmitExamConfirm() {
        if (this.submitExamModal) {
            this.submitExamModal.classList.remove('hidden');
        }
    }

    hideSubmitExamConfirm() {
        if (this.submitExamModal) {
            this.submitExamModal.classList.add('hidden');
        }
    }

    async endExamSession() {
        this.hideEndExamConfirm();
        
        try {
            const profileId = this.getCurrentProfileId();
            const result = await window.examModeAPI.endSession(profileId);
            
            if (result) {
                this.showToast('Exam session ended successfully');
                this.clearSession();
            } else {
                this.showToast('Failed to end session', 'error');
            }
        } catch (error) {
            console.error('[ExamBanner] Error ending session:', error);
            this.showToast('Error ending session', 'error');
        }
    }

    async submitAndEndExam() {
        this.hideSubmitExamConfirm();
        
        try {
            const profileId = this.getCurrentProfileId();
            
            // Save activity log first
            const logResult = await window.examModeAPI.saveActivityLog(profileId);
            
            if (logResult.success) {
                console.log('[ExamBanner] Activity log saved to:', logResult.filePath);
            }
            
            // End the session
            const result = await window.examModeAPI.endSession(profileId);
            
            if (result) {
                this.showToast('Exam submitted successfully! Activity log saved to Desktop.');
                this.clearSession();
            } else {
                this.showToast('Failed to submit exam', 'error');
            }
        } catch (error) {
            console.error('[ExamBanner] Error submitting exam:', error);
            this.showToast('Error submitting exam', 'error');
        }
    }

    // ==================== TOAST ====================

    showToast(message, type = 'success') {
        if (!this.toast || !this.toastMessage) return;
        
        const icon = this.toast.querySelector('i');
        if (icon) {
            icon.className = type === 'error' ? 'fa-solid fa-times-circle' : 
                            type === 'warning' ? 'fa-solid fa-exclamation-circle' : 
                            'fa-solid fa-check-circle';
        }
        
        this.toastMessage.textContent = message;
        this.toast.classList.add('show');
        this.toast.classList.remove('error', 'warning', 'success');
        this.toast.classList.add(type);
        
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 4000);
    }
}

// Export for use
window.ExamSessionBanner = ExamSessionBanner;

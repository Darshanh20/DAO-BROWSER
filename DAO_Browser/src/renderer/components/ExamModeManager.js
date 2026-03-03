/**
 * Exam Mode Manager Component
 * Handles UI for creating and joining exam sessions
 */

class ExamModeManager {
    constructor() {
        this.modal = null;
        this.selectedRole = null; // 'professor' or 'student'
        this.whitelist = [];
        this.loadedConfig = null;
        this.loadedConfigPath = null;
        this.createdSessionData = null;
        
        this.init();
    }

    init() {
        this.setupElements();
        this.attachEventListeners();
        console.log('✅ Exam Mode Manager initialized');
    }

    setupElements() {
        // Modal elements
        this.modal = document.getElementById('exam-mode-modal');
        this.closeBtn = document.getElementById('close-exam-mode-btn');
        this.toast = document.getElementById('exam-toast');
        this.toastMessage = document.getElementById('exam-toast-message');
        
        // Role selection elements
        this.roleSelectionScreen = document.getElementById('role-selection-screen');
        this.roleCards = document.querySelectorAll('.role-card');
        this.backToRoleBtns = document.querySelectorAll('.back-to-roles-btn');
        
        // Panel elements
        this.createPanel = document.getElementById('exam-create-panel');
        this.joinPanel = document.getElementById('exam-join-panel');
        
        // Launch button from Settings page
        this.launchExamModeBtn = document.getElementById('launch-exam-mode-btn');
        
        // Create session form elements
        this.createForm = document.getElementById('create-session-form');
        this.examNameInput = document.getElementById('exam-name');
        this.examSubjectInput = document.getElementById('exam-subject');
        this.examDurationSelect = document.getElementById('exam-duration');
        this.examCreatedByInput = document.getElementById('exam-created-by');
        this.examPasswordInput = document.getElementById('exam-password');
        this.passwordStrengthFill = document.getElementById('password-strength-fill');
        this.passwordStrengthText = document.getElementById('password-strength-text');
        
        // Whitelist editor elements
        this.whitelistInput = document.getElementById('whitelist-input');
        this.addWhitelistBtn = document.getElementById('add-whitelist-btn');
        this.whitelistItems = document.getElementById('whitelist-items');
        
        // Security settings checkboxes
        this.blockAiToolsCheckbox = document.getElementById('block-ai-tools');
        this.disableDownloadsCheckbox = document.getElementById('disable-downloads');
        this.disableDevtoolsCheckbox = document.getElementById('disable-devtools');
        this.warnOnExitCheckbox = document.getElementById('warn-on-exit');
        
        // Session created elements
        this.sessionCreatedCard = document.getElementById('session-created-card');
        this.createdSessionId = document.getElementById('created-session-id');
        this.createdPasswordDisplay = document.getElementById('created-password-display');
        this.togglePasswordBtn = document.getElementById('toggle-password-btn');
        this.downloadSessionBtn = document.getElementById('download-session-btn');
        this.copySessionIdBtn = document.getElementById('copy-session-id-btn');
        
        // Join session elements
        this.uploadSessionSection = document.getElementById('upload-session-section');
        this.uploadSessionBtn = document.getElementById('upload-session-btn');
        this.sessionPreviewCard = document.getElementById('session-preview-card');
        this.studentInfoFormContainer = document.getElementById('student-info-form-container');
        this.joinForm = document.getElementById('join-session-form');
        this.sessionPasswordInput = document.getElementById('session-password');
        this.studentNameInput = document.getElementById('student-name');
        this.studentRollInput = document.getElementById('student-roll');
        
        // Preview elements
        this.previewExamName = document.getElementById('preview-exam-name');
        this.previewExamSubject = document.getElementById('preview-exam-subject');
        this.previewExamDuration = document.getElementById('preview-exam-duration');
        this.previewCreatedBy = document.getElementById('preview-created-by');
    }

    attachEventListeners() {
        // Modal open from Settings
        if (this.launchExamModeBtn) {
            this.launchExamModeBtn.addEventListener('click', () => this.open());
        }
        
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        
        // Close on outside click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });
        }
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
        
        // Role selection cards
        this.roleCards.forEach(card => {
            card.addEventListener('click', () => {
                this.selectRole(card.dataset.role);
            });
        });
        
        // Back to role selection buttons
        this.backToRoleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.showRoleSelection();
            });
        });
        
        // Password strength validation
        if (this.examPasswordInput) {
            this.examPasswordInput.addEventListener('input', () => {
                this.updatePasswordStrength();
            });
        }
        
        // Whitelist management
        if (this.addWhitelistBtn) {
            this.addWhitelistBtn.addEventListener('click', () => {
                this.addWhitelistItem();
            });
        }
        
        if (this.whitelistInput) {
            this.whitelistInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.addWhitelistItem();
                }
            });
        }
        
        // Create session form submission
        if (this.createForm) {
            this.createForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createSession();
            });
        }
        
        // Password visibility toggle
        if (this.togglePasswordBtn) {
            this.togglePasswordBtn.addEventListener('click', () => {
                this.togglePasswordVisibility();
            });
        }
        
        // Download session file
        if (this.downloadSessionBtn) {
            this.downloadSessionBtn.addEventListener('click', () => {
                this.downloadSessionFile();
            });
        }
        
        // Copy session ID
        if (this.copySessionIdBtn) {
            this.copySessionIdBtn.addEventListener('click', () => {
                this.copySessionId();
            });
        }
        
        // Upload session file
        if (this.uploadSessionBtn) {
            this.uploadSessionBtn.addEventListener('click', () => {
                this.uploadSessionFile();
            });
        }
        
        // Join session form submission
        if (this.joinForm) {
            this.joinForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.joinSession();
            });
        }
    }

    // ==================== MODAL MANAGEMENT ====================

    open() {
        if (this.modal) {
            this.modal.classList.remove('hidden');
            // Always start with role selection
            this.showRoleSelection();
            this.resetCreatePanel();
            this.resetJoinPanel();
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.selectedRole = null;
        }
    }

    isOpen() {
        return this.modal && !this.modal.classList.contains('hidden');
    }

    // ==================== ROLE SELECTION ====================

    showRoleSelection() {
        this.selectedRole = null;
        
        // Show role selection, hide panels
        if (this.roleSelectionScreen) {
            this.roleSelectionScreen.style.display = 'block';
        }
        if (this.createPanel) {
            this.createPanel.style.display = 'none';
        }
        if (this.joinPanel) {
            this.joinPanel.style.display = 'none';
        }
    }

    selectRole(role) {
        this.selectedRole = role;
        
        // Hide role selection
        if (this.roleSelectionScreen) {
            this.roleSelectionScreen.style.display = 'none';
        }
        
        // Show appropriate panel
        if (role === 'professor') {
            if (this.createPanel) {
                this.createPanel.style.display = 'block';
            }
            if (this.joinPanel) {
                this.joinPanel.style.display = 'none';
            }
        } else if (role === 'student') {
            if (this.createPanel) {
                this.createPanel.style.display = 'none';
            }
            if (this.joinPanel) {
                this.joinPanel.style.display = 'block';
            }
        }
    }

    // ==================== PASSWORD STRENGTH ====================

    async updatePasswordStrength() {
        const password = this.examPasswordInput.value;
        
        if (!password) {
            this.passwordStrengthFill.className = 'password-strength-fill';
            this.passwordStrengthText.textContent = '';
            return;
        }
        
        try {
            const result = await window.examModeAPI.validatePassword(password);
            
            this.passwordStrengthFill.className = `password-strength-fill ${result.strength}`;
            this.passwordStrengthText.className = `password-strength-text ${result.strength}`;
            this.passwordStrengthText.textContent = result.strength.charAt(0).toUpperCase() + result.strength.slice(1);
        } catch (error) {
            console.error('Password validation error:', error);
        }
    }

    // ==================== WHITELIST MANAGEMENT ====================

    async addWhitelistItem() {
        const pattern = this.whitelistInput.value.trim();
        
        if (!pattern) {
            this.showToast('Please enter a URL pattern', 'error');
            return;
        }
        
        // Check for duplicates
        if (this.whitelist.includes(pattern)) {
            this.showToast('This URL is already in the whitelist', 'error');
            return;
        }
        
        // Validate pattern
        try {
            const result = await window.examModeAPI.validatePattern(pattern);
            
            if (!result.valid) {
                this.showToast(result.error || 'Invalid URL pattern', 'error');
                return;
            }
        } catch (error) {
            console.error('Pattern validation error:', error);
        }
        
        // Add to whitelist
        this.whitelist.push(pattern);
        this.whitelistInput.value = '';
        this.renderWhitelist();
    }

    removeWhitelistItem(pattern) {
        this.whitelist = this.whitelist.filter(p => p !== pattern);
        this.renderWhitelist();
    }

    renderWhitelist() {
        if (!this.whitelistItems) return;
        
        if (this.whitelist.length === 0) {
            this.whitelistItems.innerHTML = '<div class="whitelist-empty">No URLs added yet</div>';
            return;
        }
        
        let html = '';
        this.whitelist.forEach(pattern => {
            html += `
                <div class="whitelist-item">
                    <span class="whitelist-item-url">${this.escapeHtml(pattern)}</span>
                    <button type="button" class="whitelist-item-remove" data-pattern="${this.escapeHtml(pattern)}" title="Remove">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            `;
        });
        
        this.whitelistItems.innerHTML = html;
        
        // Attach remove listeners
        this.whitelistItems.querySelectorAll('.whitelist-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeWhitelistItem(btn.dataset.pattern);
            });
        });
    }

    // ==================== CREATE SESSION ====================

    /**
     * Get the current profile ID from localStorage
     */
    getCurrentProfileId() {
        return localStorage.getItem('dao_current_profile_id');
    }

    async createSession() {
        const examInfo = {
            name: this.examNameInput.value.trim(),
            subject: this.examSubjectInput.value.trim(),
            duration_minutes: parseInt(this.examDurationSelect.value),
            created_by: this.examCreatedByInput.value.trim() || 'Professor'
        };
        
        const password = this.examPasswordInput.value;
        const profileId = this.getCurrentProfileId();
        
        const settings = {
            block_ai_tools: this.blockAiToolsCheckbox.checked,
            disable_downloads: this.disableDownloadsCheckbox.checked,
            disable_devtools: this.disableDevtoolsCheckbox.checked,
            warn_on_exit: this.warnOnExitCheckbox.checked,
            auto_open_tabs: true
        };
        
        // Use whitelist array
        const whitelist = [...this.whitelist];
        const blacklist = []; // Blacklist will be auto-populated with AI tools if enabled
        
        try {
            const result = await window.examModeAPI.createSession(examInfo, whitelist, blacklist, settings, password, profileId);
            
            if (result.success) {
                // Store the created session data
                this.createdSessionData = {
                    sessionId: result.sessionId,
                    configPath: result.configPath,
                    password: password
                };
                
                // Activate the session banner
                if (window.examSessionBanner && result.session) {
                    window.examSessionBanner.activateSession(result.session);
                }
                
                // Show success card
                this.showSessionCreatedCard();
                this.showToast('Session created successfully!', 'success');
            } else {
                this.showToast(result.error || 'Failed to create session', 'error');
            }
        } catch (error) {
            console.error('Create session error:', error);
            this.showToast('Failed to create session: ' + error.message, 'error');
        }
    }

    showSessionCreatedCard() {
        if (!this.createdSessionData) return;
        
        // Update the card content
        this.createdSessionId.textContent = this.createdSessionData.sessionId;
        this.createdPasswordDisplay.textContent = '••••••••';
        this.createdPasswordDisplay.dataset.password = this.createdSessionData.password;
        this.createdPasswordDisplay.dataset.visible = 'false';
        
        // Hide the form and show the card
        this.createForm.style.display = 'none';
        this.sessionCreatedCard.style.display = 'block';
    }

    togglePasswordVisibility() {
        const isVisible = this.createdPasswordDisplay.dataset.visible === 'true';
        
        if (isVisible) {
            this.createdPasswordDisplay.textContent = '••••••••';
            this.createdPasswordDisplay.dataset.visible = 'false';
            this.togglePasswordBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        } else {
            this.createdPasswordDisplay.textContent = this.createdPasswordDisplay.dataset.password;
            this.createdPasswordDisplay.dataset.visible = 'true';
            this.togglePasswordBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        }
    }

    async downloadSessionFile() {
        if (!this.createdSessionData) return;
        
        const defaultFileName = `exam_config_${this.createdSessionData.sessionId}.json`;
        
        try {
            const dialogResult = await window.examModeAPI.showSaveDialog(defaultFileName);
            
            if (dialogResult.canceled || !dialogResult.filePath) {
                return;
            }
            
            const saveResult = await window.examModeAPI.saveFileToPath(
                this.createdSessionData.configPath,
                dialogResult.filePath
            );
            
            if (saveResult.success) {
                this.showToast('Session file saved successfully!', 'success');
            } else {
                this.showToast('Failed to save file: ' + saveResult.error, 'error');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showToast('Failed to download file', 'error');
        }
    }

    async copySessionId() {
        if (!this.createdSessionData) return;
        
        try {
            await window.examModeAPI.copyToClipboard(this.createdSessionData.sessionId);
            this.showToast('Session ID copied to clipboard!', 'success');
        } catch (error) {
            console.error('Copy error:', error);
            this.showToast('Failed to copy to clipboard', 'error');
        }
    }

    resetCreatePanel() {
        // Reset form
        if (this.createForm) {
            this.createForm.reset();
            this.createForm.style.display = 'block';
        }
        
        // Hide success card
        if (this.sessionCreatedCard) {
            this.sessionCreatedCard.style.display = 'none';
        }
        
        // Reset whitelist
        this.whitelist = [];
        this.renderWhitelist();
        
        // Reset password strength
        if (this.passwordStrengthFill) {
            this.passwordStrengthFill.className = 'password-strength-fill';
        }
        if (this.passwordStrengthText) {
            this.passwordStrengthText.textContent = '';
        }
        
        // Reset created session data
        this.createdSessionData = null;
    }

    // ==================== JOIN SESSION ====================

    async uploadSessionFile() {
        try {
            const dialogResult = await window.examModeAPI.showOpenDialog();
            
            if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) {
                return;
            }
            
            const filePath = dialogResult.filePaths[0];
            
            // Read and parse the file
            const readResult = await window.examModeAPI.readFile(filePath);
            
            if (!readResult.success) {
                this.showToast('Failed to read file: ' + readResult.error, 'error');
                return;
            }
            
            // Parse JSON
            let config;
            try {
                config = JSON.parse(readResult.content);
            } catch (parseError) {
                this.showToast('Invalid session file format', 'error');
                return;
            }
            
            // Validate the config has required fields
            if (!config.session_id || !config.exam_info) {
                this.showToast('Invalid session file - missing required fields', 'error');
                return;
            }
            
            // Store the loaded config
            this.loadedConfig = config;
            this.loadedConfigPath = filePath;
            
            // Show the preview card
            this.showSessionPreview();
            this.showToast('Session file loaded!', 'success');
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Failed to upload file', 'error');
        }
    }

    showSessionPreview() {
        if (!this.loadedConfig) return;
        
        const examInfo = this.loadedConfig.exam_info;
        
        // Update preview info
        this.previewExamName.textContent = examInfo.name || '-';
        this.previewExamSubject.textContent = examInfo.subject || '-';
        this.previewExamDuration.textContent = this.formatDuration(examInfo.duration_minutes);
        this.previewCreatedBy.textContent = examInfo.created_by || 'Unknown';
        
        // Hide upload section, show preview and form
        this.uploadSessionSection.style.display = 'none';
        this.sessionPreviewCard.style.display = 'block';
        this.studentInfoFormContainer.style.display = 'block';
    }

    resetJoinPanel() {
        // Reset loaded config
        this.loadedConfig = null;
        this.loadedConfigPath = null;
        
        // Reset form
        if (this.joinForm) {
            this.joinForm.reset();
        }
        
        // Show upload section, hide preview and form
        this.uploadSessionSection.style.display = 'block';
        this.sessionPreviewCard.style.display = 'none';
        this.studentInfoFormContainer.style.display = 'none';
    }

    async joinSession() {
        if (!this.loadedConfig || !this.loadedConfigPath) {
            this.showToast('Please upload a session file first', 'error');
            return;
        }
        
        const password = this.sessionPasswordInput.value;
        const profileId = this.getCurrentProfileId();
        const studentInfo = {
            name: this.studentNameInput.value.trim(),
            roll_number: this.studentRollInput.value.trim()
        };
        
        try {
            const result = await window.examModeAPI.joinSession(
                this.loadedConfigPath,
                password,
                studentInfo,
                profileId
            );
            
            if (result.success) {
                this.showToast('Session joined successfully!', 'success');
                
                // Activate the session banner
                if (window.examSessionBanner && result.session) {
                    window.examSessionBanner.activateSession(result.session);
                }
                
                // Close modal
                this.close();
                
            } else {
                this.showToast(result.error || 'Failed to join session', 'error');
            }
        } catch (error) {
            console.error('Join session error:', error);
            this.showToast('Failed to join session: ' + error.message, 'error');
        }
    }

    // ==================== UTILITIES ====================

    formatDuration(minutes) {
        if (!minutes) return '-';
        
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours === 0) {
            return `${mins} minutes`;
        } else if (mins === 0) {
            return hours === 1 ? '1 hour' : `${hours} hours`;
        } else {
            return `${hours}h ${mins}m`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'success') {
        if (!this.toast || !this.toastMessage) return;
        
        // Update message and type
        this.toastMessage.textContent = message;
        this.toast.className = `exam-toast ${type}`;
        
        // Update icon
        const icon = this.toast.querySelector('i');
        if (icon) {
            if (type === 'success') {
                icon.className = 'fa-solid fa-check-circle';
            } else if (type === 'error') {
                icon.className = 'fa-solid fa-exclamation-circle';
            }
        }
        
        // Show toast
        this.toast.classList.add('show');
        
        // Hide after 3 seconds
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize Exam Mode components when DOM is ready
let examModeManager;
document.addEventListener('DOMContentLoaded', () => {
    // Check if examModeAPI is available
    if (typeof window.examModeAPI !== 'undefined') {
        // Initialize ExamSessionBanner first (it checks for active session)
        if (typeof ExamSessionBanner !== 'undefined') {
            window.examSessionBanner = new ExamSessionBanner();
            console.log('[ExamMode] ExamSessionBanner initialized');
        }
        
        // Initialize ExamModeManager
        examModeManager = new ExamModeManager();
    } else {
        console.warn('examModeAPI not available, Exam Mode disabled');
    }
});

// Export for external access
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExamModeManager;
}

/**
 * Profile Switcher Component
 * Handles profile selection and switching in the browser toolbar
 */

class ProfileSwitcher {
    constructor() {
        this.profiles = [];
        this.currentProfile = null;
        this.isOpen = false;
        this.isLoading = false;
        this.isExamLocked = false;
        
        this.init();
        this.loadProfiles();
        this.setupExamLockListener();
    }

    init() {
        this.createElement();
        this.attachEventListeners();
        console.log('✅ Profile Switcher initialized');
    }

    createElement() {
        // Create profile switcher container
        this.container = document.createElement('div');
        this.container.className = 'profile-switcher';
        this.container.innerHTML = `
            <button class="profile-switcher-button" title="Switch Profile">
                <div class="profile-avatar" style="background: linear-gradient(135deg, #2ecc71, #1abc9c);">U</div>
                <span class="profile-name">Loading...</span>
                <i class="fas fa-chevron-down profile-dropdown-icon"></i>
            </button>
            <div class="profile-dropdown hidden">
                <div class="profile-loading">Loading profiles...</div>
            </div>
        `;

        // Find toolbar and add profile switcher
        const toolbar = document.querySelector('.window-controls');
        if (toolbar) {
            // Insert before settings button
            const settingsBtn = document.querySelector('#settings-btn');
            if (settingsBtn) {
                toolbar.insertBefore(this.container, settingsBtn);
            } else {
                toolbar.appendChild(this.container);
            }
        } else {
            console.error('Window controls container not found for profile switcher');
            // Fallback: try to find any toolbar-like element
            const fallbackToolbar = document.querySelector('#toolbar');
            if (fallbackToolbar) {
                fallbackToolbar.appendChild(this.container);
            } else {
                document.body.appendChild(this.container);
            }
            return;
        }

        // Get references to elements
        this.button = this.container.querySelector('.profile-switcher-button');
        this.dropdown = this.container.querySelector('.profile-dropdown');
        this.avatar = this.container.querySelector('.profile-avatar');
        this.nameEl = this.container.querySelector('.profile-name');
        this.dropdownIcon = this.container.querySelector('.profile-dropdown-icon');
    }

    attachEventListeners() {
        if (!this.button) return;

        // Toggle dropdown on button click
        this.button.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Check if locked due to exam
            if (this.isExamLocked) {
                this.showExamLockedToast();
                return;
            }
            
            this.toggleDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // Close dropdown on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeDropdown();
            }
        });
    }

    async loadProfiles() {
        this.setLoading(true);
        
        try {
            // Load all profiles
            const profilesResult = await profileAPI.listProfiles();
            if (profilesResult.success) {
                this.profiles = profilesResult.data;
                console.log(`✅ Loaded ${this.profiles.length} profiles`);
            }

            // Determine current profile for this specific window first
            let resolvedCurrentProfile = null;
            if (window.profileWindows && typeof window.profileWindows.getContext === 'function') {
                const contextResult = await window.profileWindows.getContext();
                if (contextResult.success && contextResult.data?.profileId) {
                    resolvedCurrentProfile = this.profiles.find(
                        (profile) => profile.id === Number(contextResult.data.profileId)
                    ) || null;
                }
            }

            // Fallback to backend active profile if window context is unavailable
            if (!resolvedCurrentProfile) {
                const activeResult = await profileAPI.getActiveProfile();
                if (activeResult.success) {
                    resolvedCurrentProfile = activeResult.data;
                }
            }

            if (resolvedCurrentProfile) {
                this.currentProfile = resolvedCurrentProfile;
                this.updateCurrentProfileDisplay();
                
                // Store current profile ID in localStorage for other pages (like history)
                localStorage.setItem('dao_current_profile_id', this.currentProfile.id.toString());
                
                // Notify main process about current profile for exam mode URL filtering
                if (window.examModeAPI) {
                    window.examModeAPI.setProfileId(this.currentProfile.id.toString()).catch(err => {
                        console.warn('[ProfileSwitcher] Failed to set initial profile ID:', err);
                    });
                }
                
                console.log(`✅ Active profile: ${this.currentProfile.display_name} (ID: ${this.currentProfile.id})`);
            } else {
                console.warn('❌ No current profile found for this window, falling back to first profile');
                if (this.profiles.length > 0) {
                    this.currentProfile = this.profiles[0];
                    this.updateCurrentProfileDisplay();
                }
            }

            this.renderDropdown();
        } catch (error) {
            console.error('Failed to load profiles:', error);
            this.renderError('Failed to load profiles');
        } finally {
            this.setLoading(false);
        }
    }

    updateCurrentProfileDisplay() {
        if (!this.currentProfile || !this.avatar || !this.nameEl) return;

        // Update avatar
        this.avatar.style.background = this.currentProfile.avatar_color;
        this.avatar.textContent = this.getProfileInitials(this.currentProfile.display_name);

        // Update name
        this.nameEl.textContent = this.currentProfile.display_name;
    }

    renderDropdown() {
        if (!this.dropdown) return;

        let content = '';

        // Render profile list
        if (this.profiles.length > 0) {
            this.profiles.forEach(profile => {
                const isActive = this.currentProfile && profile.id === this.currentProfile.id;
                const initials = this.getProfileInitials(profile.display_name);
                
                content += `
                    <div class="profile-item ${isActive ? 'active' : ''}" data-profile-id="${profile.id}">
                        <div class="profile-avatar" style="background: ${profile.avatar_color};">
                            ${initials}
                        </div>
                        <div class="profile-info">
                            <div class="profile-name">${this.escapeHtml(profile.display_name)}</div>
                            <div class="profile-meta">
                                ${isActive ? 'Current Window' : 'Last used: ' + this.formatDate(profile.last_used_at)}
                            </div>
                        </div>
                        ${isActive ? '<div class="profile-status-indicator"></div>' : ''}
                    </div>
                `;
            });
        }

        // Add action buttons
        content += `
            <div class="profile-actions">
                <div class="profile-action" data-action="create">
                    <i class="fas fa-plus"></i>
                    <span>Create New Profile</span>
                </div>
                <div class="profile-action" data-action="manage">
                    <i class="fas fa-cog"></i>
                    <span>Manage Profiles</span>
                </div>
            </div>
        `;

        this.dropdown.innerHTML = content;
        this.attachDropdownListeners();
    }

    attachDropdownListeners() {
        if (!this.dropdown) return;

        // Profile item clicks (switch profile)
        this.dropdown.querySelectorAll('.profile-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const profileId = parseInt(e.currentTarget.dataset.profileId);
                if (profileId && profileId !== this.currentProfile?.id) {
                    await this.switchProfile(profileId);
                }
                this.closeDropdown();
            });
        });

        // Action button clicks
        this.dropdown.querySelectorAll('.profile-action').forEach(action => {
            action.addEventListener('click', (e) => {
                const actionType = e.currentTarget.dataset.action;
                this.handleAction(actionType);
                this.closeDropdown();
            });
        });
    }

    async switchProfile(profileId) {
        if (this.isLoading) return;

        try {
            if (!profileId || profileId === this.currentProfile?.id) {
                return;
            }

            this.setLoading(true);
            
            // Open or focus isolated profile window in main process
            const result = await window.profileWindows.openProfileWindow(profileId);
            
            if (result.success) {
                const selectedProfile = this.profiles.find((profile) => profile.id === profileId);
                const profileName = selectedProfile?.display_name || 'selected profile';
                console.log(`✅ Opened/focused profile window: ${profileName} (ID: ${profileId})`);
                this.showNotification(`Opened ${profileName} in a separate window`, 'success');
            } else {
                throw new Error(result.error || 'Failed to open profile window');
            }
        } catch (error) {
            console.error('Failed to open profile window:', error);
            this.showNotification('Failed to open profile window', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    handleAction(actionType) {
        switch (actionType) {
            case 'create':
                this.openCreateProfileDialog();
                break;
            case 'manage':
                this.openProfileManager();
                break;
        }
    }

    openCreateProfileDialog() {
        // This will be implemented when we create the profile management dialog
        if (window.profileManager) {
            window.profileManager.openCreateDialog();
        } else {
            console.log('Profile creation dialog not available yet');
            // Open profile manager in create mode
            if (window.profileManager) {
                window.profileManager.open();
                window.profileManager.showCreateForm();
            } else {
                this.showNotification('Profile manager not ready yet', 'info');
            }
        }
    }

    openProfileManager() {
        // Open the profile manager modal
        if (window.profileManager) {
            window.profileManager.open();
        } else {
            console.log('Profile manager not available yet');
            this.showNotification('Profile manager not ready yet', 'info');
        }
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        if (this.isLoading) return;
        
        this.isOpen = true;
        this.container.classList.add('open');
        this.dropdown.classList.remove('hidden');
        
        // Refresh profile list when opening
        this.loadProfiles();
    }

    closeDropdown() {
        this.isOpen = false;
        this.container.classList.remove('open');
        this.dropdown.classList.add('hidden');
    }

    setLoading(loading) {
        this.isLoading = loading;
        
        if (this.button) {
            this.button.disabled = loading;
            if (loading) {
                this.button.classList.add('loading');
            } else {
                this.button.classList.remove('loading');
            }
        }
    }

    renderError(message) {
        if (this.dropdown) {
            this.dropdown.innerHTML = `
                <div class="profile-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${this.escapeHtml(message)}
                </div>
            `;
        }
    }

    emitProfileSwitchEvent(profile) {
        // Emit custom event for other components to listen to
        const event = new CustomEvent('profileSwitched', {
            detail: { profile }
        });
        document.dispatchEvent(event);
        
        // Notify main process about profile change for exam mode URL filtering
        if (window.examModeAPI && profile && profile.id) {
            window.examModeAPI.setProfileId(profile.id.toString()).catch(err => {
                console.warn('[ProfileSwitcher] Failed to set profile ID in main process:', err);
            });
        }
        
        // Also call global handler if available
        if (typeof window.onProfileSwitch === 'function') {
            window.onProfileSwitch(profile);
        }
    }

    showNotification(message, type = 'info') {
        // Simple notification - can be enhanced later
        console.log(`Profile Notification [${type}]: ${message}`);
        
        // TODO: Integrate with app's notification system if available
    }

    // ==================== EXAM LOCK METHODS ====================

    /**
     * Setup listener for exam lockdown state changes
     * TEMPORARILY DISABLED - uncomment when deploying separate student/professor instances
     */
    setupExamLockListener() {
        console.log('[ProfileSwitcher] Setting up exam lock listener...');
        
        // Listen for lockdown state changes from ExamModeLockdown
        document.addEventListener('examLockdownStateChanged', (e) => {
            const { locked, session } = e.detail || {};
            
            if (locked && session?.role === 'student') {
                this.lockForExam();
            } else {
                this.unlockFromExam();
            }
        });

        // Also check on exam session activation (for initial state)
        document.addEventListener('examSessionActivated', (e) => {
            if (e.detail?.session?.role === 'student') {
                this.lockForExam();
            }
        });

        // Unlock when exam ends
        document.addEventListener('examSessionEnded', () => {
            this.unlockFromExam();
        });

        // Check initial state (in case exam is already active on load)
        this.checkInitialExamState();
    }

    /**
     * Check if exam is already active on component initialization
     */
    async checkInitialExamState() {
        try {
            const profileId = localStorage.getItem('dao_current_profile_id');
            if (window.examModeAPI && profileId) {
                const session = await window.examModeAPI.getActiveSession(profileId);
                if (session?.active && session?.role === 'student') {
                    this.lockForExam();
                }
            }
        } catch (error) {
            console.warn('[ProfileSwitcher] Failed to check initial exam state:', error);
        }
    }

    /**
     * Lock profile switching during exam
     */
    lockForExam() {
        if (this.isExamLocked) return;
        
        this.isExamLocked = true;
        console.log('🔒 [ProfileSwitcher] Locked for exam');
        
        // Add locked styling
        if (this.container) {
            this.container.classList.add('exam-locked');
        }
        
        if (this.button) {
            this.button.setAttribute('title', 'Profile switching disabled during exam');
            this.button.classList.add('exam-locked');
            
            // Add lock icon
            const lockIcon = document.createElement('span');
            lockIcon.className = 'profile-lock-icon';
            lockIcon.innerHTML = '🔒';
            this.button.appendChild(lockIcon);
        }
        
        // Close dropdown if open
        this.closeDropdown();
    }

    /**
     * Unlock profile switching after exam
     */
    unlockFromExam() {
        if (!this.isExamLocked) return;
        
        this.isExamLocked = false;
        console.log('🔓 [ProfileSwitcher] Unlocked from exam');
        
        // Remove locked styling
        if (this.container) {
            this.container.classList.remove('exam-locked');
        }
        
        if (this.button) {
            this.button.setAttribute('title', 'Switch Profile');
            this.button.classList.remove('exam-locked');
            
            // Remove lock icon
            const lockIcon = this.button.querySelector('.profile-lock-icon');
            if (lockIcon) {
                lockIcon.remove();
            }
        }
    }

    /**
     * Show toast when trying to switch profiles during exam
     */
    showExamLockedToast() {
        // Use exam toast if available
        const toast = document.getElementById('exam-toast');
        const toastMessage = document.getElementById('exam-toast-message');
        
        if (toast && toastMessage) {
            toastMessage.textContent = 'You cannot switch profiles during an active exam session';
            toast.className = 'exam-toast warning';
            toast.classList.remove('hidden');
            
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3000);
        } else {
            console.log('[ProfileSwitcher] Profile switching disabled during exam');
        }
    }

    // ==================== UTILITY METHODS ====================

    getProfileInitials(name) {
        if (!name) return 'U';
        
        const words = name.trim().split(' ');
        if (words.length === 1) {
            return words[0].charAt(0).toUpperCase();
        } else {
            return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
        }
    }

    formatDate(dateStr) {
        if (!dateStr) return 'Never';
        
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
                return 'Today';
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return 'Unknown';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== PUBLIC API ====================

    refresh() {
        return this.loadProfiles();
    }

    getCurrentProfile() {
        return this.currentProfile;
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

// ProfileSwitcher is initialized by renderer.js - no auto-init here

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfileSwitcher;
}
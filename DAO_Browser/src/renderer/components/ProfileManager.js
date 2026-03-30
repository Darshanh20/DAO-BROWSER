/**
 * Profile Manager Component
 * Full profile management interface - create, edit, delete, switch profiles
 */

class ProfileManager {
    constructor() {
        this.profiles = [];
        this.currentProfile = null;
        this.selectedProfile = null;
        this.isLoading = false;
        this.mode = 'view'; // 'view', 'create', 'edit', 'delete'
        
        this.init();
    }

    init() {
        // Use DOM elements already in index.html
        this.setupElements();
        this.attachEventListeners();
        this.loadProfiles();
        console.log('✅ Profile Manager initialized');
    }

    setupElements() {
        this.modal = document.getElementById('profile-manager-modal');
        this.closeBtn = document.getElementById('close-profile-manager-btn');
        this.createBtn = document.getElementById('create-profile-btn');
        this.profileList = document.getElementById('profile-list-container');
        this.detailsTitle = document.getElementById('profile-details-title');
        this.actionsToolbar = document.getElementById('profile-actions-toolbar');
        this.detailsContent = document.getElementById('profile-details-content');
        
        // Templates
        this.formTemplate = document.getElementById('profile-form-template');
        this.detailsTemplate = document.getElementById('profile-details-template');
        this.deleteTemplate = document.getElementById('delete-confirmation-template');
    }

    attachEventListeners() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.createBtn) {
            this.createBtn.addEventListener('click', () => this.showCreateForm());
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
    }

    async loadProfiles() {
        this.setLoading(true);
        
        try {
            // Load all profiles
            const profilesResult = await profileAPIClient.listProfiles();
            if (profilesResult.success) {
                this.profiles = profilesResult.data;
            }

            // Load current active profile
            const activeResult = await profileAPIClient.getActiveProfile();
            if (activeResult.success) {
                this.currentProfile = activeResult.data;
            }

            this.renderProfileList();
            
            // Auto-select current active profile
            if (this.currentProfile) {
                this.selectProfile(this.currentProfile.id);
            }
        } catch (error) {
            console.error('Failed to load profiles:', error);
            this.showError('Failed to load profiles');
        } finally {
            this.setLoading(false);
        }
    }

    renderProfileList() {
        if (!this.profileList) return;

        if (this.profiles.length === 0) {
            this.profileList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <i class="fa-solid fa-user-plus"></i>
                    </div>
                    <div class="empty-state-title">No Profiles</div>
                    <div class="empty-state-description">
                        Create your first profile to get started.
                    </div>
                </div>
            `;
            return;
        }

        let html = '';
        this.profiles.forEach(profile => {
            const isActive = this.currentProfile && profile.id === this.currentProfile.id;
            const isSelected = this.selectedProfile && profile.id === this.selectedProfile.id;
            const initials = this.getProfileInitials(profile.display_name);
            
            html += `
                <div class="profile-list-item ${isSelected ? 'active' : ''} ${isActive ? 'current-active' : ''}" 
                     data-profile-id="${profile.id}">
                    <div class="profile-avatar" style="background: ${profile.avatar_color};">
                        ${initials}
                    </div>
                    <div class="profile-list-info">
                        <div class="profile-list-name">${this.escapeHtml(profile.display_name)}</div>
                        <div class="profile-list-meta">
                            ${isActive ? '<span class="profile-status-badge">Active</span>' : ''}
                            <span>Last used: ${this.formatDate(profile.last_used_at)}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        this.profileList.innerHTML = html;
        this.attachProfileListListeners();
    }

    attachProfileListListeners() {
        const items = this.profileList.querySelectorAll('.profile-list-item');
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                const profileId = parseInt(e.currentTarget.dataset.profileId);
                this.selectProfile(profileId);
            });
        });
    }

    selectProfile(profileId) {
        const profile = this.profiles.find(p => p.id === profileId);
        if (!profile) return;

        this.selectedProfile = profile;
        this.mode = 'view';
        
        // Update list selection
        this.profileList.querySelectorAll('.profile-list-item').forEach(item => {
            const itemId = parseInt(item.dataset.profileId);
            item.classList.toggle('active', itemId === profileId);
        });

        this.showProfileDetails(profile);
    }

    showProfileDetails(profile) {
        this.detailsTitle.textContent = profile.display_name;
        this.renderActionButtons(profile);
        this.renderDetailsContent(profile);
    }

    renderActionButtons(profile) {
        const isActive = this.currentProfile && profile.id === this.currentProfile.id;
        const canDelete = this.profiles.length > 1 && !isActive;
        
        this.actionsToolbar.innerHTML = `
            ${!isActive ? `
                <button class="profile-action-btn primary" data-action="activate">
                    <i class="fa-solid fa-check"></i>
                    <span>Set Active</span>
                </button>
            ` : ''}
            <button class="profile-action-btn" data-action="edit">
                <i class="fa-solid fa-edit"></i>
                <span>Edit</span>
            </button>
            <button class="profile-action-btn" data-action="export">
                <i class="fa-solid fa-download"></i>
                <span>Export</span>
            </button>
            ${canDelete ? `
                <button class="profile-action-btn danger" data-action="delete">
                    <i class="fa-solid fa-trash"></i>
                    <span>Delete</span>
                </button>
            ` : ''}
        `;

        // Attach action listeners
        this.actionsToolbar.querySelectorAll('.profile-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.handleProfileAction(action, profile);
            });
        });
    }

    async renderDetailsContent(profile) {
        if (!this.detailsTemplate) return;

        const content = this.detailsTemplate.content.cloneNode(true);
        
        // Update profile info (use querySelector for DocumentFragment)
        const avatar = content.querySelector('#details-avatar');
        const displayName = content.querySelector('#details-display-name');
        const name = content.querySelector('#details-name');
        const created = content.querySelector('#details-created');
        const lastUsed = content.querySelector('#details-last-used');
        
        if (avatar) {
            avatar.style.background = profile.avatar_color;
            avatar.textContent = this.getProfileInitials(profile.display_name);
        }
        
        if (displayName) {
            displayName.textContent = profile.display_name;
        }
        
        if (name) {
            name.textContent = profile.name;
        }
        
        if (created) {
            created.textContent = this.formatDate(profile.created_at);
        }
        
        if (lastUsed) {
            lastUsed.textContent = this.formatDate(profile.last_used_at);
        }

        // Update stats
        try {
            const bookmarksEl = content.querySelector('#details-bookmarks');
            const historyEl = content.querySelector('#details-history');
            
            if (profile.stats) {
                if (bookmarksEl) bookmarksEl.textContent = profile.stats.total_bookmarks || 0;
                if (historyEl) historyEl.textContent = profile.stats.total_history_entries || 0;
            }
        } catch (error) {
            console.warn('Failed to load profile stats:', error);
        }

        this.detailsContent.innerHTML = '';
        this.detailsContent.appendChild(content);
    }

    async handleProfileAction(action, profile) {
        switch (action) {
            case 'activate':
                await this.activateProfile(profile);
                break;
            case 'edit':
                this.showEditForm(profile);
                break;
            case 'delete':
                this.showDeleteConfirmation(profile);
                break;
            case 'export':
                await this.exportProfile(profile);
                break;
        }
    }

    async activateProfile(profile) {
        try {
            this.setLoading(true);
            const result = await profileAPIClient.activateProfile(profile.id);
            
            if (result.success) {
                this.currentProfile = result.data;
                
                // Refresh profile switcher if available
                if (window.profileSwitcher) {
                    await window.profileSwitcher.refresh();
                }
                
                // Refresh our view
                await this.loadProfiles();
                this.selectProfile(profile.id);
                
                this.showNotification(`Switched to ${profile.display_name}`, 'success');
                
                // Emit profile switch event
                this.emitProfileSwitchEvent(this.currentProfile);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to activate profile:', error);
            this.showNotification('Failed to activate profile', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    showCreateForm() {
        this.mode = 'create';
        this.selectedProfile = null;
        this.detailsTitle.textContent = 'Create New Profile';
        this.actionsToolbar.innerHTML = '';
        this.renderForm();
    }

    showEditForm(profile) {
        this.mode = 'edit';
        this.selectedProfile = profile;
        this.detailsTitle.textContent = `Edit ${profile.display_name}`;
        this.actionsToolbar.innerHTML = '';
        this.renderForm(profile);
    }

    renderForm(profile = null) {
        if (!this.formTemplate) return;

        const content = this.formTemplate.content.cloneNode(true);
        
        // Get form elements (use querySelector for DocumentFragment)
        const form = content.querySelector('#profile-form');
        const displayNameInput = content.querySelector('#profile-display-name');
        const nameInput = content.querySelector('#profile-name');
        const colorPicker = content.querySelector('#avatar-color-picker');
        const submitBtn = content.querySelector('#profile-form-submit');
        const cancelBtn = content.querySelector('#profile-form-cancel');

        // Pre-fill form if editing
        if (profile) {
            displayNameInput.value = profile.display_name;
            nameInput.value = profile.name;
            
            // Set selected color
            colorPicker.querySelectorAll('.color-option').forEach(option => {
                const isSelected = option.dataset.color === profile.avatar_color;
                option.classList.toggle('selected', isSelected);
                option.querySelector('i').style.display = isSelected ? 'block' : 'none';
            });
        } else {
            // Default selection for new profiles
            const defaultOption = colorPicker.querySelector('.color-option');
            if (defaultOption) {
                defaultOption.classList.add('selected');
                defaultOption.querySelector('i').style.display = 'block';
            }
        }

        // Update submit button text
        if (submitBtn) {
            const isEditing = this.mode === 'edit';
            submitBtn.innerHTML = `
                <i class="fa-solid fa-${isEditing ? 'save' : 'plus'}"></i>
                <span>${isEditing ? 'Update Profile' : 'Create Profile'}</span>
            `;
        }

        // Auto-generate name from display name
        displayNameInput.addEventListener('input', () => {
            if (this.mode === 'create') {
                const sanitized = this.sanitizeProfileName(displayNameInput.value);
                nameInput.value = sanitized;
            }
        });

        // Color picker handlers
        colorPicker.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', () => {
                // Remove previous selection
                colorPicker.querySelectorAll('.color-option').forEach(opt => {
                    opt.classList.remove('selected');
                    opt.querySelector('i').style.display = 'none';
                });
                
                // Select clicked option
                option.classList.add('selected');
                option.querySelector('i').style.display = 'block';
            });
        });

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleFormSubmit(form);
        });

        // Cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (this.selectedProfile) {
                    this.selectProfile(this.selectedProfile.id);
                } else {
                    this.showEmptyState();
                }
            });
        }

        this.detailsContent.innerHTML = '';
        this.detailsContent.appendChild(content);
    }

    async handleFormSubmit(form) {
        try {
            this.setLoading(true);
            
            const formData = new FormData(form);
            const displayName = form.querySelector('#profile-display-name').value.trim();
            const name = form.querySelector('#profile-name').value.trim();
            const selectedColor = form.querySelector('.color-option.selected')?.dataset.color || '#2ecc71';
            
            // Validation
            if (!displayName || displayName.length < 2) {
                this.showFieldError('display-name-error', 'Display name must be at least 2 characters');
                return;
            }
            
            if (!name || name.length < 2) {
                this.showFieldError('name-error', 'Profile name must be at least 2 characters');
                return;
            }

            const profileData = {
                display_name: displayName,
                name: name,
                avatar_color: selectedColor
            };

            let result;
            if (this.mode === 'create') {
                result = await profileAPIClient.createProfile(profileData);
            } else {
                result = await profileAPIClient.updateProfile(this.selectedProfile.id, profileData);
            }

            if (result.success) {
                this.showNotification(`Profile ${this.mode === 'create' ? 'created' : 'updated'} successfully`, 'success');
                
                // Refresh data and UI
                await this.loadProfiles();
                this.selectProfile(result.data.id);
                
                // Refresh profile switcher
                if (window.profileSwitcher) {
                    await window.profileSwitcher.refresh();
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Form submission error:', error);
            this.showNotification(`Failed to ${this.mode} profile: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    showDeleteConfirmation(profile) {
        if (!this.deleteTemplate) {
            console.error('Delete template not found');
            return;
        }

        this.mode = 'delete';
        this.detailsTitle.textContent = 'Delete Profile';
        this.actionsToolbar.innerHTML = '';

        const content = this.deleteTemplate.content.cloneNode(true);
        
        // Update profile name in confirmation (use querySelector for DocumentFragment)
        const nameSpan = content.querySelector('#delete-profile-name');
        if (nameSpan) {
            nameSpan.textContent = profile.display_name;
        }

        // Handle confirmation buttons (use querySelector for DocumentFragment)
        const confirmBtn = content.querySelector('#confirm-delete-btn');
        const cancelBtn = content.querySelector('#cancel-delete-btn');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                await this.deleteProfile(profile);
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.selectProfile(profile.id);
            });
        }

        this.detailsContent.innerHTML = '';
        this.detailsContent.appendChild(content);
    }

    async deleteProfile(profile) {
        try {
            this.setLoading(true);
            
            const result = await profileAPIClient.deleteProfile(profile.id);
            
            if (result.success) {
                this.showNotification(`Profile "${profile.display_name}" deleted`, 'success');
                
                // Refresh data
                await this.loadProfiles();
                
                // Select first available profile
                if (this.profiles.length > 0) {
                    this.selectProfile(this.profiles[0].id);
                } else {
                    this.showEmptyState();
                }
                
                // Refresh profile switcher
                if (window.profileSwitcher) {
                    await window.profileSwitcher.refresh();
                }
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification(`Failed to delete profile: ${error.message}`, 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async exportProfile(profile) {
        try {
            const result = await profileAPIClient.exportProfile(profile.id);
            
            if (result.success) {
                const data = JSON.stringify(result.data, null, 2);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `${profile.name}_profile_export.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showNotification(`Profile "${profile.display_name}" exported`, 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showNotification('Failed to export profile', 'error');
        }
    }

    showEmptyState() {
        this.detailsTitle.textContent = 'Select a Profile';
        this.actionsToolbar.innerHTML = '';
        this.detailsContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fa-solid fa-user-circle"></i>
                </div>
                <div class="empty-state-title">No Profile Selected</div>
                <div class="empty-state-description">
                    Select a profile from the list to view and edit its details,
                    or create a new profile to get started.
                </div>
            </div>
        `;
    }

    // ==================== UTILITY METHODS ====================

    setLoading(loading) {
        this.isLoading = loading;
        
        if (this.modal) {
            this.modal.style.pointerEvents = loading ? 'none' : 'auto';
            this.modal.style.opacity = loading ? '0.7' : '1';
        }
    }

    showFieldError(fieldId, message) {
        const errorEl = document.getElementById(fieldId);
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    sanitizeProfileName(displayName) {
        return displayName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 20);
    }

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
            
            if (diffDays === 0) return 'Today';
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays} days ago`;
            
            return date.toLocaleDateString();
        } catch (error) {
            return 'Unknown';
        }
    }

    formatDuration(hours) {
        if (!hours || hours === 0) return '0h';
        if (hours < 1) return `${Math.round(hours * 60)}m`;
        return `${Math.round(hours)}h`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    emitProfileSwitchEvent(profile) {
        const event = new CustomEvent('profileSwitched', {
            detail: { profile }
        });
        document.dispatchEvent(event);
        
        if (typeof window.onProfileSwitch === 'function') {
            window.onProfileSwitch(profile);
        }
    }

    showNotification(message, type = 'info') {
        console.log(`Profile Manager [${type}]: ${message}`);
        // TODO: Integrate with app notification system
    }

    // ==================== PUBLIC API ====================

    open() {
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.loadProfiles();
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
    }

    isOpen() {
        return this.modal && !this.modal.classList.contains('hidden');
    }

    openCreateDialog() {
        this.open();
        setTimeout(() => this.showCreateForm(), 100);
    }

    refresh() {
        return this.loadProfiles();
    }
}

// Initialize profile manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.profileManager = new ProfileManager();
    }, 600);
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfileManager;
}
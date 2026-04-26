/**
 * Profile Selector Component
 * Handles profile selection on app startup
 */

class ProfileSelector {
    constructor() {
        this.profiles = [];
        this.selectedProfileId = null;
        this.isLoading = false;

        this.init();
    }

    init() {
        this.setupElements();
        this.attachEventListeners();
        this.loadProfiles();
        console.log('✅ Profile Selector initialized');
    }

    setupElements() {
        this.grid = document.getElementById('profiles-grid');
        this.createModal = document.getElementById('create-modal');
        this.deleteModal = document.getElementById('delete-modal');
        this.notification = document.getElementById('notification');

        // Create form elements
        this.createForm = document.getElementById('create-form');
        this.profileNameInput = document.getElementById('new-profile-name');
        this.colorOptions = document.querySelectorAll('.color-picker .color-option');
        this.previewName = document.getElementById('preview-name');
        this.previewAvatar = document.getElementById('preview-avatar');

        // Delete modal elements
        this.deleteProfileName = document.getElementById('delete-profile-name');
        this.confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        this.cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    }

    attachEventListeners() {
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.currentTarget.closest('.modal')) {
                    e.currentTarget.closest('.modal').classList.add('hidden');
                }
            });
        });

        // Create form submission
        this.createForm.addEventListener('submit', (e) => this.handleCreateSubmit(e));

        // Color picker
        this.colorOptions.forEach(option => {
            option.addEventListener('click', () => this.handleColorSelect(option));
        });

        // Profile name input preview
        this.profileNameInput.addEventListener('input', () => this.updateFormPreview());

        // Delete modal buttons
        this.confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());
        this.cancelDeleteBtn.addEventListener('click', () => this.deleteModal.classList.add('hidden'));

        // Close modals on outside click
        this.createModal.addEventListener('click', (e) => {
            if (e.target === this.createModal) {
                this.createModal.classList.add('hidden');
            }
        });

        this.deleteModal.addEventListener('click', (e) => {
            if (e.target === this.deleteModal) {
                this.deleteModal.classList.add('hidden');
            }
        });

        // Close modals on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.createModal.classList.add('hidden');
                this.deleteModal.classList.add('hidden');
            }
        });
    }

    async loadProfiles() {
        this.setLoading(true);
        try {
            const result = await profileAPI.listProfiles();
            if (result.success) {
                this.profiles = result.data || [];
                this.renderProfileCards();
            } else {
                this.showError('Failed to load profiles');
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
            this.showError('Failed to load profiles. Make sure the backend is running.');
        } finally {
            this.setLoading(false);
        }
    }

    renderProfileCards() {
        this.grid.innerHTML = '';

        if (this.profiles.length === 0) {
            this.grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-inbox empty-icon"></i>
                    <p>No profiles yet</p>
                    <p class="empty-text">Create your first profile to get started</p>
                </div>
            `;
            // Still add create card even in empty state
            this.appendCreateCard();
            return;
        }

        // Render profile cards
        this.profiles.forEach(profile => {
            const card = this.createProfileCard(profile);
            this.grid.appendChild(card);
        });

        // Add create new profile card at the end
        this.appendCreateCard();
    }

    appendCreateCard() {
        const createCard = document.createElement('div');
        createCard.className = 'profile-card create-new';
        createCard.title = 'Create a new profile';
        createCard.innerHTML = `
            <div class="profile-card-header">
                <div class="profile-avatar create-avatar">
                    <i class="fas fa-plus"></i>
                </div>
            </div>
            <div class="profile-info">
                <h3 class="profile-name">Create Profile</h3>
                <p class="profile-meta">New profile</p>
            </div>
        `;

        createCard.addEventListener('click', () => this.showCreateForm());
        this.grid.appendChild(createCard);
    }

    createProfileCard(profile) {
        const card = document.createElement('div');
        card.className = 'profile-card';
        card.dataset.profileId = profile.id;

        const initials = this.getInitials(profile.display_name);
        const lastUsed = this.formatLastUsed(profile.last_used_at);
        const isActive = profile.is_active ? ' (Active)' : '';

        card.innerHTML = `
            <div class="profile-card-header">
                <div class="profile-avatar" style="background-color: ${profile.avatar_color};">
                    ${initials}
                </div>
                <button class="profile-menu-btn" title="Delete profile" aria-label="Delete">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
            <div class="profile-info">
                <h3 class="profile-name">${this.escapeHtml(profile.display_name)}</h3>
                <p class="profile-meta">Last used: ${lastUsed}${isActive}</p>
            </div>
        `;

        // Click on card to select profile
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.profile-menu-btn')) {
                this.selectProfile(profile.id);
            }
        });

        // Delete button
        const deleteBtn = card.querySelector('.profile-menu-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteConfirm(profile);
        });

        // Alternate delete entry point via right-click
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showDeleteConfirm(profile);
        });

        return card;
    }

    async selectProfile(profileId) {
        this.setLoading(true);
        try {
            const result = await profileAPI.activateProfile(profileId);
            if (result.success) {
                // Store in localStorage
                localStorage.setItem('dao_current_profile_id', profileId.toString());

                // Notify main process and navigate to browser
                if (window.profileSelector) {
                    const openResult = await window.profileSelector.profileSelected(profileId);
                    if (!openResult?.success) {
                        throw new Error(openResult?.error || 'Failed to open profile window');
                    }
                } else {
                    console.warn('Profile selector API not available');
                    throw new Error('Profile selector bridge is unavailable');
                }
            } else {
                this.showError('Failed to select profile');
            }
        } catch (error) {
            console.error('Error selecting profile:', error);
            this.showError('Failed to select profile');
        } finally {
            this.setLoading(false);
        }
    }

    showCreateForm() {
        this.resetCreateForm();
        this.createModal.classList.remove('hidden');
        this.profileNameInput.focus();
    }

    resetCreateForm() {
        this.createForm.reset();
        this.profileNameInput.value = '';

        // Reset color picker
        this.colorOptions.forEach((opt, idx) => {
            if (idx === 0) {
                opt.classList.add('selected');
                opt.querySelector('i').style.display = 'inline';
            } else {
                opt.classList.remove('selected');
                opt.querySelector('i').style.display = 'none';
            }
        });

        // Reset preview
        this.previewAvatar.style.backgroundColor = '#2ecc71';
        this.previewName.textContent = 'Anonymous';
        this.updateFormPreview();
    }

    handleColorSelect(option) {
        // Remove previous selection
        this.colorOptions.forEach(opt => {
            opt.classList.remove('selected');
            opt.querySelector('i').style.display = 'none';
        });

        // Select clicked option
        option.classList.add('selected');
        option.querySelector('i').style.display = 'inline';

        // Update preview
        const color = option.dataset.color;
        this.previewAvatar.style.backgroundColor = color;
    }

    updateFormPreview() {
        const name = this.profileNameInput.value.trim() || 'Anonymous';
        const initials = this.getInitials(name);
        this.previewName.textContent = name;
        this.previewAvatar.textContent = initials;
    }

    async handleCreateSubmit(e) {
        e.preventDefault();

        const name = this.profileNameInput.value.trim();
        const nameError = document.getElementById('name-error');

        // Clear previous errors
        if (nameError) nameError.textContent = '';

        // Validate
        if (!name || name.length < 2) {
            this.showFieldError('name-error', 'Name must be at least 2 characters');
            return;
        }

        if (name.length > 50) {
            this.showFieldError('name-error', 'Name must be 50 characters or less');
            return;
        }

        // Get selected color
        const selectedColor = document.querySelector('.color-picker .color-option.selected');
        if (!selectedColor) {
            this.showError('Please select a color');
            return;
        }
        const color = selectedColor.dataset.color;

        const displayName = name;
        const internalName = this.sanitizeProfileName(name);

        this.setLoading(true);
        try {
            console.log('Creating profile:', { internalName, displayName, color });

            const result = await profileAPI.createProfile({
                name: internalName,
                display_name: displayName,
                avatar_color: color
            });

            console.log('Create profile response:', result);

            if (result && result.success) {
                this.showNotification(`Profile "${displayName}" created!`, 'success');
                this.createModal.classList.add('hidden');
                await this.loadProfiles();
            } else {
                const errorMsg = result?.error || 'Failed to create profile';
                console.error('Create profile error:', errorMsg);
                this.showFieldError('name-error', errorMsg);
                this.showError(errorMsg);
            }
        } catch (error) {
            console.error('Error creating profile:', error);
            this.showError(`Error: ${error.message || 'Failed to create profile'}`);
        } finally {
            this.setLoading(false);
        }
    }

    showDeleteConfirm(profile) {
        this.deleteProfileName.textContent = profile.display_name;
        this.deleteModal.dataset.profileId = profile.id;
        this.deleteModal.classList.remove('hidden');
    }

    async confirmDelete() {
        const profileId = parseInt(this.deleteModal.dataset.profileId);
        const profile = this.profiles.find(p => p.id === profileId);

        // Safety: Don't delete if only 1 profile
        if (this.profiles.length <= 1) {
            this.showError('Cannot delete the last profile');
            return;
        }

        this.setLoading(true);
        try {
            const result = await profileAPI.deleteProfile(profileId);
            if (result.success) {
                this.showNotification(`Profile "${profile.display_name}" deleted`, 'success');
                this.deleteModal.classList.add('hidden');
                await this.loadProfiles();
            } else {
                this.showError(result.error || 'Failed to delete profile');
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            this.showError('Failed to delete profile');
        } finally {
            this.setLoading(false);
        }
    }

    // ==================== UTILITY METHODS ====================

    setLoading(loading) {
        this.isLoading = loading;
        document.body.style.pointerEvents = loading ? 'none' : 'auto';
        document.body.style.opacity = loading ? '0.7' : '1';
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        this.notification.textContent = message;
        this.notification.className = `notification ${type}`;
        this.notification.classList.remove('hidden');

        // Auto-hide after 4 seconds
        setTimeout(() => {
            this.notification.classList.add('hidden');
        }, 4000);
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

    getInitials(name) {
        if (!name) return 'U';
        const words = name.trim().split(' ');
        if (words.length === 1) {
            return words[0].charAt(0).toUpperCase();
        } else {
            return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
        }
    }

    formatLastUsed(dateStr) {
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.profileSelectorInstance = new ProfileSelector();
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfileSelector;
}

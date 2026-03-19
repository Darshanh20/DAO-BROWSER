/**
 * Profile Selector Component
 * Manages profile selection landing page with CRUD operations
 */

class ProfileSelector {
    constructor() {
        this.profiles = [];
        this.currentProfile = null;
        this.selectedProfileForDelete = null;
        this.isLoading = false;
        
        // Initialize ProfileAPI client
        this.profileAPI = new ProfileAPI();

        this.init();
    }

    init() {
        this.cacheElements();
        this.attachEventListeners();
        this.loadProfiles();
        console.log('✅ Profile Selector initialized');
    }

    cacheElements() {
        // Main elements
        this.profilesGrid = document.getElementById('profilesGrid');
        this.addProfileModal = document.getElementById('addProfileModal');
        this.deleteConfirmModal = document.getElementById('deleteConfirmModal');
        this.toastContainer = document.getElementById('toastContainer');

        // Form elements
        this.addProfileForm = document.getElementById('addProfileForm');
        this.profileNameInput = document.getElementById('profileName');
        this.displayNameInput = document.getElementById('displayName');
        this.avatarColorInput = document.getElementById('avatarColor');
        this.colorPreview = document.getElementById('colorPreview');

        // Buttons
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.cancelFormBtn = document.getElementById('cancelFormBtn');
        this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    }

    attachEventListeners() {
        // Modal controls
        this.closeModalBtn.addEventListener('click', () => this.closeAddProfileModal());
        this.cancelFormBtn.addEventListener('click', () => this.closeAddProfileModal());
        this.cancelDeleteBtn.addEventListener('click', () => this.closeDeleteConfirmModal());

        // Form submission
        this.addProfileForm.addEventListener('submit', (e) => this.handleCreateProfile(e));

        // Delete confirmation
        this.confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());

        // Color picker preview
        this.avatarColorInput.addEventListener('change', (e) => {
            this.colorPreview.style.backgroundColor = e.target.value;
        });
        this.avatarColorInput.addEventListener('input', (e) => {
            this.colorPreview.style.backgroundColor = e.target.value;
        });

        // Close modal on overlay click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeAddProfileModal();
            }
        });

        // Close modals on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAddProfileModal();
                this.closeDeleteConfirmModal();
            }
        });
    }

    /**
     * Load profiles from backend
     */
    async loadProfiles() {
        try {
            console.log('[ProfileSelector] Starting to load profiles...');
            this.isLoading = true;
            
            const result = await this.profileAPI.listProfiles();
            console.log('[ProfileSelector] API Response:', result);

            if (result.success && Array.isArray(result.data)) {
                this.profiles = result.data;
                console.log(`✅ Loaded ${this.profiles.length} profiles`);
                // Debug: log profile data to check timestamps
                this.profiles.forEach(p => {
                    console.log(`[Profile] ${p.display_name}: created_at=${p.created_at}, last_used_at=${p.last_used_at}`);
                });
                this.renderProfiles();
            } else {
                const errorMsg = result.error || 'Failed to load profiles';
                console.error('Profile loading error:', result);
                this.showError(errorMsg);
                // Show empty state if no profiles
                this.renderProfiles();
            }
        } catch (error) {
            console.error('[ProfileSelector] Error loading profiles:', error);
            const errorMsg = error.message || 'Connection error. Is the backend running?';
            this.showError(`⚠️ ${errorMsg}`);
            // Show error state in grid
            this.profilesGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Cannot connect to backend</p>
                    <p style="font-size: 0.9rem; color: var(--color-text-secondary); margin-top: 10px;">
                        Error: ${this.escapeHtml(errorMsg)}
                    </p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 8px 16px; background: var(--color-primary); color: white; border: none; border-radius: 6px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Render profile cards in grid
     */
    renderProfiles() {
        // Clear loading state
        this.profilesGrid.innerHTML = '';

        if (this.profiles.length === 0) {
            this.profilesGrid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No profiles yet. Create one to get started!</p>
                </div>
            `;
        } else {
            // Render existing profiles
            this.profiles.forEach(profile => {
                const card = this.createProfileCard(profile);
                this.profilesGrid.appendChild(card);
            });
        }

        // Add "Create New Profile" card
        const addCard = this.createAddProfileCard();
        this.profilesGrid.appendChild(addCard);
    }

    /**
     * Create a profile card element
     */
    createProfileCard(profile) {
        const card = document.createElement('div');
        card.className = 'profile-card';
        card.id = `profile-${profile.id}`;

        // Generate initials from display name
        const initials = this.getInitials(profile.display_name);

        // Format last active time (pass created_at to detect new profiles)
        const lastActive = profile.last_used_at
            ? this.formatLastActive(profile.last_used_at, profile.created_at)
            : 'New';

        // Avatar background color
        const avatarColor = profile.avatar_color || '#4A90E2';

        card.innerHTML = `
            <div class="profile-card-content">
                <div class="profile-avatar" style="background: linear-gradient(135deg, ${avatarColor}, ${this.adjustColor(avatarColor, -30)});">
                    ${initials}
                </div>
                <div class="profile-info">
                    <h3 class="profile-name">${this.escapeHtml(profile.display_name)}</h3>
                    <p class="profile-meta">${lastActive}</p>
                </div>
            </div>
            <div class="profile-actions">
                <button class="profile-delete-btn" title="Delete profile" data-profile-id="${profile.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        // Click card to select profile
        card.querySelector('.profile-card-content').addEventListener('click', () => {
            this.selectProfile(profile.id);
        });

        // Delete button
        card.querySelector('.profile-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openDeleteConfirmModal(profile.id, profile.display_name);
        });

        return card;
    }

    /**
     * Create "Add Profile" card
     */
    createAddProfileCard() {
        const card = document.createElement('div');
        card.className = 'profile-card add-profile-card';
        card.innerHTML = `
            <div class="profile-card-content">
                <div class="profile-avatar add-avatar">
                    <i class="fas fa-plus"></i>
                </div>
                <div class="profile-info">
                    <h3 class="profile-name">Add Profile</h3>
                    <p class="profile-meta">Create a new profile</p>
                </div>
            </div>
        `;

        card.addEventListener('click', () => this.openAddProfileModal());

        return card;
    }

    /**
     * Open add profile modal
     */
    openAddProfileModal() {
        // Reset form
        this.addProfileForm.reset();
        this.colorPreview.style.backgroundColor = this.avatarColorInput.value;
        
        // Show modal
        this.addProfileModal.classList.remove('hidden');
        this.addProfileModal.classList.add('visible');
        
        // Focus on first input
        setTimeout(() => this.profileNameInput.focus(), 100);
    }

    /**
     * Close add profile modal
     */
    closeAddProfileModal() {
        this.addProfileModal.classList.add('hidden');
        this.addProfileModal.classList.remove('visible');
    }

    /**
     * Handle create profile form submission
     */
    async handleCreateProfile(e) {
        e.preventDefault();

        const name = this.profileNameInput.value.trim();
        const displayName = this.displayNameInput.value.trim();
        const avatarColor = this.avatarColorInput.value;

        if (!name || !displayName) {
            this.showError('Please fill in all required fields');
            return;
        }

        try {
            const result = await this.profileAPI.createProfile({
                name,
                display_name: displayName,
                avatar_color: avatarColor
            });

            if (result.success) {
                this.showSuccess(`Profile "${displayName}" created successfully!`);
                this.closeAddProfileModal();
                this.loadProfiles();
            } else {
                this.showError(result.error || 'Failed to create profile');
            }
        } catch (error) {
            console.error('Error creating profile:', error);
            this.showError(error.message || 'Error creating profile');
        }
    }

    /**
     * Open delete confirmation modal
     */
    openDeleteConfirmModal(profileId, profileName) {
        this.selectedProfileForDelete = profileId;
        const message = document.getElementById('deleteMessage');
        message.textContent = `Are you sure you want to delete "${this.escapeHtml(profileName)}"? This action cannot be undone.`;

        this.deleteConfirmModal.classList.remove('hidden');
        this.deleteConfirmModal.classList.add('visible');
    }

    /**
     * Close delete confirmation modal
     */
    closeDeleteConfirmModal() {
        this.deleteConfirmModal.classList.add('hidden');
        this.deleteConfirmModal.classList.remove('visible');
        this.selectedProfileForDelete = null;
    }

    /**
     * Confirm profile deletion
     */
    async confirmDelete() {
        if (!this.selectedProfileForDelete) return;

        try {
            const result = await this.profileAPI.deleteProfile(this.selectedProfileForDelete);

            if (result.success) {
                this.showSuccess('Profile deleted successfully');
                this.closeDeleteConfirmModal();
                this.loadProfiles();
            } else {
                this.showError(result.error || 'Failed to delete profile');
            }
        } catch (error) {
            console.error('Error deleting profile:', error);
            this.showError(error.message || 'Error deleting profile');
        }
    }

    /**
     * Select profile and navigate to main window
     */
    async selectProfile(profileId) {
        try {
            // Activate the profile
            const result = await this.profileAPI.activateProfile(profileId);

            if (result.success) {
                this.showSuccess('Profile loaded');
                const selectedProfile = result.data;
                
                // Store current profile ID in localStorage for other pages
                localStorage.setItem('dao_current_profile_id', profileId.toString());
                
                // Brief delay to show success message, then navigate
                setTimeout(() => {
                    // Navigate to the main browser window
                    window.location.href = '../index.html';
                }, 300);
            } else {
                this.showError(result.error || 'Failed to activate profile');
            }
        } catch (error) {
            console.error('Error selecting profile:', error);
            this.showError(error.message || 'Error selecting profile');
        }
    }

    /**
     * Show success toast notification
     */
    showSuccess(message) {
        this.showToast(message, 'success');
    }

    /**
     * Show error toast notification
     */
    showError(message) {
        this.showToast(message, 'error');
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${this.escapeHtml(message)}</span>
        `;

        this.toastContainer.appendChild(toast);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Get initials from name
     */
    getInitials(name) {
        return name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Adjust color brightness
     */
    adjustColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255))
            .toString(16)
            .slice(1);
    }

    /**
     * Format last active time
     */
    formatLastActive(timestamp, createdAt = null) {
        if (!timestamp) return 'New';

        // Debug: log what we're receiving
        console.log('[ProfileSelector] Formatting time:', { timestamp, createdAt });

        const lastActive = new Date(timestamp);
        const now = new Date();

        // Check if last_used_at equals created_at (meaning profile was never actually used)
        if (createdAt) {
            const created = new Date(createdAt);
            // If last_used_at and created_at are the same timestamp, profile is new
            if (lastActive.getTime() === created.getTime()) {
                return 'New';
            }
            // Also check if they're very close (within 1 minute) - backend might set them slightly different
            const timeDiff = Math.abs(lastActive.getTime() - created.getTime());
            if (timeDiff < 60000) { // Within 1 minute
                return 'New';
            }
        }

        const diff = now - lastActive;

        // Handle invalid date or future date (timezone issues)
        if (isNaN(diff) || diff < 0) return 'New';

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `Last used ${days}d ago`;
        if (hours > 0) return `Last used ${hours}h ago`;
        if (minutes > 0) return `Last used ${minutes}m ago`;
        return 'Last used just now';
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    new ProfileSelector();
});

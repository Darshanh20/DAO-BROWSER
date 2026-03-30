/**
 * Profile API Service - Frontend JavaScript module for profile operations
 * Uses Electron IPC via preload to communicate with the backend
 */

class ProfileAPI {
    constructor() {
        // Use the IPC-based profileAPI exposed via preload.js
        this.api = window.profileAPI;

        if (!this.api) {
            console.error('❌ profileAPI not available! Make sure preload.js is loaded.');
        }
    }

    // ==================== PROFILE CRUD OPERATIONS ====================

    async createProfile(profileData) {
        try {
            const result = await this.api.createProfile(
                profileData.name,
                profileData.display_name,
                profileData.avatar_color || '#4A90E2'
            );
            return result;
        } catch (error) {
            console.error('Profile API Error (create):', error);
            return { success: false, error: error.message };
        }
    }

    async listProfiles() {
        try {
            const result = await this.api.getAllProfiles();
            return result;
        } catch (error) {
            console.error('Profile API Error (list):', error);
            return { success: false, error: error.message };
        }
    }

    async getProfile(profileId) {
        try {
            const result = await this.api.getProfile(profileId);
            return result;
        } catch (error) {
            console.error('Profile API Error (get):', error);
            return { success: false, error: error.message };
        }
    }

    async updateProfile(profileId, updateData) {
        try {
            const result = await this.api.updateProfile(profileId, updateData);
            return result;
        } catch (error) {
            console.error('Profile API Error (update):', error);
            return { success: false, error: error.message };
        }
    }

    async deleteProfile(profileId) {
        try {
            const result = await this.api.deleteProfile(profileId);
            return result;
        } catch (error) {
            console.error('Profile API Error (delete):', error);
            return { success: false, error: error.message };
        }
    }

    async activateProfile(profileId) {
        try {
            const result = await this.api.activateProfile(profileId);
            return result;
        } catch (error) {
            console.error('Profile API Error (activate):', error);
            return { success: false, error: error.message };
        }
    }

    async getActiveProfile() {
        try {
            const result = await this.api.getActiveProfile();
            return result;
        } catch (error) {
            console.error('Profile API Error (getActive):', error);
            return { success: false, error: error.message };
        }
    }

    async getProfileStats(profileId) {
        try {
            const result = await this.api.getProfileStats(profileId);
            return result;
        } catch (error) {
            console.error('Profile API Error (getStats):', error);
            return { success: false, error: error.message };
        }
    }
}

// Create global instance with different name to avoid conflict with window.profileAPI from preload
const profileAPIClient = new ProfileAPI();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfileAPI;
}

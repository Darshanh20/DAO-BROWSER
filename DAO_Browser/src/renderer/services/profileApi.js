/**
 * Profile API Service - Frontend JavaScript module for profile operations
 * Handles all API calls to the profile management backend
 */

class ProfileAPI {
    constructor(baseUrl = 'http://localhost:5000/api/profiles') {
        this.baseUrl = baseUrl;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error(`Profile API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // ==================== PROFILE CRUD OPERATIONS ====================
    
    async createProfile(profileData) {
        return this.request('', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    }

    async listProfiles() {
        return this.request('');
    }

    async getProfile(profileId) {
        return this.request(`/${profileId}`);
    }

    async updateProfile(profileId, updateData) {
        return this.request(`/${profileId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });
    }

    async deleteProfile(profileId) {
        return this.request(`/${profileId}`, {
            method: 'DELETE'
        });
    }

    async activateProfile(profileId) {
        return this.request(`/${profileId}/activate`, {
            method: 'POST'
        });
    }

    async getActiveProfile() {
        return this.request('/active');
    }

    async getProfileStats(profileId) {
        return this.request(`/${profileId}/stats`);
    }

    // ==================== UTILITY OPERATIONS ====================

    async validateProfileName(name, excludeId = null) {
        const data = { name };
        if (excludeId) {
            data.exclude_id = excludeId;
        }
        
        return this.request('/validate-name', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async exportProfile(profileId) {
        return this.request(`/${profileId}/export`, {
            method: 'POST'
        });
    }

    async importProfile(profileData) {
        return this.request('/import', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    }
}

// Create global instance
const profileAPI = new ProfileAPI();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProfileAPI;
}
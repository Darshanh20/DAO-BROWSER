/**
 * Profile Settings Service
 * Manages per-profile settings with localStorage persistence
 */

class ProfileSettingsService {
    constructor() {
        this.currentProfileId = null;
        this.storageKeyPrefix = 'dao_browser_settings_profile_';
        this.defaultSettings = {
            rememberHistory: true,
            enableJavaScript: true,
            enableAdBlocker: true,
            blockTrackers: false,
            defaultSearchEngine: 'google',
            theme: 'dark'
        };
        
        this.init();
    }
    
    init() {
        // Listen for profile switch events
        document.addEventListener('profileSwitched', (e) => {
            this.onProfileSwitch(e.detail.profile);
        });
        
        // Initialize with current profile
        this.loadCurrentProfile();
    }
    
    async loadCurrentProfile() {
        try {
            if (window.profileWindows && typeof window.profileWindows.getContext === 'function') {
                const contextResult = await window.profileWindows.getContext();
                if (contextResult.success && contextResult.data?.profileId) {
                    this.currentProfileId = Number(contextResult.data.profileId);
                    console.log('[ProfileSettings] Loaded window profile context:', this.currentProfileId);
                    this.applyCurrentProfileSettings();
                    return;
                }
            }

            const storedProfileId = parseInt(localStorage.getItem('dao_current_profile_id'), 10);
            if (!isNaN(storedProfileId) && storedProfileId > 0) {
                this.currentProfileId = storedProfileId;
                console.log('[ProfileSettings] Loaded localStorage profile:', this.currentProfileId);
                this.applyCurrentProfileSettings();
                return;
            }

            if (typeof profileAPI !== 'undefined') {
                const result = await profileAPI.getActiveProfile();
                if (result.success && result.data) {
                    this.currentProfileId = result.data.id;
                    console.log('[ProfileSettings] Loaded fallback active profile:', this.currentProfileId);
                    this.applyCurrentProfileSettings();
                }
            }
        } catch (error) {
            console.error('[ProfileSettings] Error loading current profile:', error);
        }
    }
    
    onProfileSwitch(profile) {
        if (profile && profile.id) {
            this.currentProfileId = profile.id;
            console.log('[ProfileSettings] Switched to profile:', this.currentProfileId);
            
            // Apply settings for the new profile
            this.applyCurrentProfileSettings();
        }
    }
    
    getStorageKey() {
        const profileId = this.currentProfileId || 'default';
        return `${this.storageKeyPrefix}${profileId}`;
    }
    
    /**
     * Get settings for the current profile
     */
    getSettings() {
        const key = this.getStorageKey();
        const stored = localStorage.getItem(key);
        
        if (stored) {
            try {
                return { ...this.defaultSettings, ...JSON.parse(stored) };
            } catch (e) {
                console.error('[ProfileSettings] Error parsing settings:', e);
            }
        }
        
        return { ...this.defaultSettings };
    }
    
    /**
     * Save settings for the current profile
     */
    saveSettings(settings) {
        const key = this.getStorageKey();
        const merged = { ...this.getSettings(), ...settings };
        
        try {
            localStorage.setItem(key, JSON.stringify(merged));
            console.log('[ProfileSettings] Settings saved for profile:', this.currentProfileId);
            return true;
        } catch (e) {
            console.error('[ProfileSettings] Error saving settings:', e);
            return false;
        }
    }
    
    /**
     * Get a specific setting value
     */
    getSetting(key) {
        const settings = this.getSettings();
        return settings[key];
    }
    
    /**
     * Update a specific setting value
     */
    setSetting(key, value) {
        const settings = this.getSettings();
        settings[key] = value;
        return this.saveSettings(settings);
    }
    
    /**
     * Apply current profile settings to the UI
     */
    applyCurrentProfileSettings() {
        const settings = this.getSettings();
        
        // Emit event for other components to react
        document.dispatchEvent(new CustomEvent('profileSettingsLoaded', {
            detail: { settings, profileId: this.currentProfileId }
        }));
        
        console.log('[ProfileSettings] Applied settings:', settings);
    }
    
    /**
     * Export settings for a profile
     */
    exportSettings(profileId = null) {
        const id = profileId || this.currentProfileId || 'default';
        const key = `${this.storageKeyPrefix}${id}`;
        const stored = localStorage.getItem(key);
        
        return stored ? JSON.parse(stored) : this.defaultSettings;
    }
    
    /**
     * Import settings for a profile
     */
    importSettings(settings, profileId = null) {
        const id = profileId || this.currentProfileId || 'default';
        const key = `${this.storageKeyPrefix}${id}`;
        
        try {
            localStorage.setItem(key, JSON.stringify(settings));
            console.log('[ProfileSettings] Imported settings for profile:', id);
            return true;
        } catch (e) {
            console.error('[ProfileSettings] Error importing settings:', e);
            return false;
        }
    }
    
    /**
     * Delete settings for a profile
     */
    deleteProfileSettings(profileId) {
        const key = `${this.storageKeyPrefix}${profileId}`;
        localStorage.removeItem(key);
        console.log('[ProfileSettings] Deleted settings for profile:', profileId);
    }
}

// Create singleton instance
const profileSettings = new ProfileSettingsService();

// Make available globally
window.profileSettings = profileSettings;

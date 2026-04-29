// ==================== SETTINGS DIALOG MODULE ====================

class SettingsDialog {
    constructor() {
        this.dialog = document.getElementById('settings-dialog');
        this.closeBtn = document.getElementById('close-settings-btn');
        this.menuItems = document.querySelectorAll('.settings-menu-item');
        this.openShortcutsTabBtn = document.getElementById('open-shortcuts-tab');
        
        // Settings storage key (fallback for non-profile mode)
        this.storageKey = 'dao-browser-settings';
        
        // Load default settings (profile-aware if service available)
        this.settings = this.loadSettings();
        
        this.init();
        this.attachSettingListeners();
        this.applySettings();
        
        // Listen for profile settings changes
        document.addEventListener('profileSettingsLoaded', (e) => {
            this.settings = e.detail.settings;
            this.applySettings();
            console.log('✅ Settings reloaded for profile:', e.detail.profileId);
        });
    }

    init() {
        // Mount dropdown under toolbar controls so absolute positioning anchors to top-right trigger area
        const controlsContainer = document.querySelector('.window-controls');
        if (this.dialog && controlsContainer && this.dialog.parentElement !== controlsContainer) {
            controlsContainer.appendChild(this.dialog);
        }

        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Menu items
        this.menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                this.switchPage(e.currentTarget.dataset.page);
            });
        });

        // Open shortcuts in new tab
        if (this.openShortcutsTabBtn) {
            this.openShortcutsTabBtn.addEventListener('click', () => {
                this.openShortcutsTab();
            });
        }

        // Close on outside click
        document.addEventListener('click', (e) => {
            const settingsBtn = document.getElementById('settings-btn');
            if (this.dialog && !this.dialog.classList.contains('hidden') &&
                !this.dialog.contains(e.target) &&
                !(settingsBtn && settingsBtn.contains(e.target))) {
                this.close();
            }
        });

        // Prevent clicks inside dropdown from bubbling to global outside-click handlers
        if (this.dialog) {
            this.dialog.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog && !this.dialog.classList.contains('hidden')) {
                this.close();
            }
        });

        // Setup dropdown accordion behavior for section titles
        this.setupAccordion();
    }

    setupAccordion() {
        if (!this.dialog) return;

        const pages = this.dialog.querySelectorAll('.settings-page');
        pages.forEach(page => {
            const heading = page.querySelector('h3');
            if (!heading) return;

            heading.setAttribute('role', 'button');
            heading.setAttribute('tabindex', '0');

            const toggle = () => {
                page.classList.toggle('expanded');
            };

            heading.addEventListener('click', (e) => {
                e.preventDefault();
                toggle();
            });

            heading.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });
        });

        this.resetAccordionState();
    }

    resetAccordionState() {
        if (!this.dialog) return;

        const pages = this.dialog.querySelectorAll('.settings-page');
        pages.forEach(page => page.classList.remove('expanded'));

        const generalPage = this.dialog.querySelector('#general-page');
        if (generalPage) {
            generalPage.classList.add('expanded');
        }
    }

    // Settings persistence methods - now profile-aware
    loadSettings() {
        // Use profile settings service if available
        if (window.profileSettings) {
            return window.profileSettings.getSettings();
        }
        
        // Fallback to legacy localStorage
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : {
            rememberHistory: true,
            enableJavaScript: true,
            enableAdBlocker: true,
            blockTrackers: false
        };
    }

    saveSettings() {
        // Use profile settings service if available
        if (window.profileSettings) {
            window.profileSettings.saveSettings(this.settings);
        } else {
            // Fallback to legacy localStorage
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
        }
        console.log('✅ Settings saved', this.settings);
    }

    applySettings() {
        // Apply each setting from storage
        const historyCheckbox = document.querySelector('input[type="checkbox"]:nth-of-type(1)');
        const jsCheckbox = document.querySelector('input[type="checkbox"]:nth-of-type(2)');
        const adBlockerCheckbox = document.querySelector('input[type="checkbox"]:nth-of-type(3)');
        const trackersCheckbox = document.querySelector('input[type="checkbox"]:nth-of-type(4)');

        if (historyCheckbox) historyCheckbox.checked = this.settings.rememberHistory;
        if (jsCheckbox) jsCheckbox.checked = this.settings.enableJavaScript;
        if (adBlockerCheckbox) adBlockerCheckbox.checked = this.settings.enableAdBlocker;
        if (trackersCheckbox) trackersCheckbox.checked = this.settings.blockTrackers;

        console.log('✅ Settings applied from storage');
    }

    attachSettingListeners() {
        // Listen for changes to all checkboxes
        const checkboxes = document.querySelectorAll('.setting-item input[type="checkbox"]');
        
        checkboxes.forEach((checkbox, index) => {
            checkbox.addEventListener('change', (e) => {
                // Map checkbox index to setting names
                const settingNames = ['rememberHistory', 'enableJavaScript', 'enableAdBlocker', 'blockTrackers'];
                if (settingNames[index]) {
                    this.settings[settingNames[index]] = e.target.checked;
                    this.saveSettings();
                    
                    // If ad-blocker toggle changed, notify main process
                    if (settingNames[index] === 'enableAdBlocker' && window.electronAPI) {
                        // Sync with main process if needed
                        console.log(`Ad-Blocker: ${e.target.checked ? 'Enabled' : 'Disabled'}`);
                    }
                }
            });
        });
    }

    open() {
        if (this.dialog) {
            this.dialog.classList.remove('hidden');
            // Reset to general page
            this.switchPage('general');
            this.resetAccordionState();
            // Reload settings to ensure UI is in sync
            this.applySettings();
        }
    }

    close() {
        if (this.dialog) {
            this.dialog.classList.add('hidden');
        }
    }

    switchPage(pageName) {
        // Update menu items
        this.menuItems.forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === pageName) {
                item.classList.add('active');
            }
        });

        // Update pages
        const pages = document.querySelectorAll('.settings-page');
        pages.forEach(page => {
            page.classList.remove('active');
            if (page.id === `${pageName}-page`) {
                page.classList.add('active');
            }
        });
    }

    openShortcutsTab() {
        // Access the global openPageInNewTab function from renderer.js
        if (typeof openPageInNewTab === 'function') {
            openPageInNewTab('pages/shortcuts.html', 'Keyboard Shortcuts');
            this.close();
        } else {
            console.error('openPageInNewTab function not found');
        }
    }
}

// Initialize settings dialog when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.settingsDialog = new SettingsDialog();
});


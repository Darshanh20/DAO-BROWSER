// ==================== SETTINGS DIALOG MODULE ====================

class SettingsDialog {
    constructor() {
        this.dialog = document.getElementById('settings-dialog');
        this.closeBtn = document.getElementById('close-settings-btn');
        this.menuItems = document.querySelectorAll('.settings-menu-item');
        this.openShortcutsTabBtn = document.getElementById('open-shortcuts-tab');
        
        // Settings storage key
        this.storageKey = 'dao-browser-settings';
        
        // Load default settings
        this.settings = this.loadSettings();
        
        this.init();
        this.attachSettingListeners();
        this.applySettings();
    }

    init() {
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
            if (this.dialog && !this.dialog.classList.contains('hidden') && 
                e.target === this.dialog) {
                this.close();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog && !this.dialog.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    // Settings persistence methods
    loadSettings() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : {
            rememberHistory: true,
            enableJavaScript: true,
            enableAdBlocker: true,
            blockTrackers: false
        };
    }

    saveSettings() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
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


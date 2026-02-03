// ==================== SETTINGS DIALOG MODULE ====================

class SettingsDialog {
    constructor() {
        this.dialog = document.getElementById('settings-dialog');
        this.closeBtn = document.getElementById('close-settings-btn');
        this.menuItems = document.querySelectorAll('.settings-menu-item');
        this.openShortcutsTabBtn = document.getElementById('open-shortcuts-tab');
        
        this.init();
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

    open() {
        if (this.dialog) {
            this.dialog.classList.remove('hidden');
            // Reset to general page
            this.switchPage('general');
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

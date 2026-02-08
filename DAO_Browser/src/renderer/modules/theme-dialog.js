// ==================== THEME DIALOG MODULE ====================
/**
 * Theme Management System for D.A.O. Browser
 * 
 * IMPORTANT: WEBVIEW ISOLATION EXPLANATION
 * -----------------------------------------
 * This theme system applies ONLY to the browser UI (tabs, toolbar, sidebar, etc.)
 * and does NOT affect content loaded in <webview> tags. Here's why:
 * 
 * 1. SECURITY ISOLATION:
 *    - Webviews render external websites in a separate, sandboxed process
 *    - They have their own DOM, rendering context, and JavaScript environment
 *    - This isolation is crucial for security (prevents XSS, data leaks, etc.)
 * 
 * 2. CSS SCOPING:
 *    - We apply theme classes to #browser-container, NOT document root
 *    - CSS variables defined on #browser-container don't cascade into webviews
 *    - Webviews explicitly have `background: #fff !important` to prevent inheritance
 * 
 * 3. WHY WEBVIEWS SHOULDN'T BE THEMED:
 *    - Websites control their own appearance and branding
 *    - Forcing a dark theme on a light-designed site breaks usability
 *    - Many sites have their own dark mode that users can enable
 *    - Theming web content would violate the site's design intent
 * 
 * 4. PROPER ARCHITECTURE:
 *    - Browser Chrome (UI): Gets themed ✅
 *    - Website Content: Keeps original styling ✅
 *    - This matches behavior of Chrome, Firefox, Edge, etc.
 * 
 * If you need to theme website content, users should:
 *    - Use browser extensions like "Dark Reader"
 *    - Enable the website's native dark mode
 *    - Use OS-level dark mode
 */

class ThemeDialog {
    constructor() {
        this.dialog = document.getElementById('theme-dialog');
        this.closeBtn = document.getElementById('close-theme-btn');
        this.themeRadios = document.querySelectorAll('input[name="theme"]');
        
        // Validate required elements exist
        if (!this.dialog) {
            console.error('❌ Theme dialog element not found!');
            return;
        }
        
        if (this.themeRadios.length === 0) {
            console.error('❌ Theme radio buttons not found!');
            return;
        }
        
        // Theme storage key
        this.storageKey = 'dao-browser-theme';
        
        // Default theme
        this.currentTheme = 'dark';
        
        this.init();
        this.loadTheme();
    }

    init() {
        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        // Theme radio buttons - apply immediately on change
        this.themeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.applyTheme(e.target.value);
                }
            });
        });

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

    // Load theme from storage
    loadTheme() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            const theme = stored || 'dark';
            this.currentTheme = theme;
            
            // Set the correct radio button
            this.themeRadios.forEach(radio => {
                radio.checked = radio.value === theme;
            });
            
            // Apply the theme
            this.applyTheme(theme, false);
            console.log(`✅ Theme loaded: ${theme}`);
        } catch (error) {
            console.error('Failed to load theme:', error);
            this.applyTheme('dark', false);
        }
    }

    // Apply theme globally (to browser UI only, not webviews)
    applyTheme(theme, save = true) {
        try {
            // Get the browser container element
            const browserContainer = document.getElementById('browser-container');
            
            if (!browserContainer) {
                console.error('❌ Browser container not found!');
                return;
            }
            
            // Remove all theme classes from container
            browserContainer.classList.remove('theme-dark', 'theme-light');
            
            // Add new theme class to container (NOT document.documentElement)
            // This prevents theme from cascading into webview elements
            browserContainer.classList.add(`theme-${theme}`);
            
            this.currentTheme = theme;
            
            // Save to localStorage
            if (save) {
                localStorage.setItem(this.storageKey, theme);
                console.log(`✅ Theme saved: ${theme}`);
            }
            
            // Dispatch custom event for other components
            window.dispatchEvent(new CustomEvent('themeChanged', { 
                detail: { theme } 
            }));
            
            console.log(`✅ Theme applied: ${theme}`);
        } catch (error) {
            console.error('Failed to apply theme:', error);
        }
    }

    // Get current theme
    getCurrentTheme() {
        return this.currentTheme;
    }

    // Open dialog
    open() {
        if (this.dialog) {
            this.dialog.classList.remove('hidden');
            console.log('Theme dialog opened');
        }
    }

    // Close dialog
    close() {
        if (this.dialog) {
            this.dialog.classList.add('hidden');
            console.log('Theme dialog closed');
        }
    }

    // Toggle dialog
    toggle() {
        if (this.dialog) {
            if (this.dialog.classList.contains('hidden')) {
                this.open();
            } else {
                this.close();
            }
        }
    }
}

// Initialize theme dialog
// Wait for both DOM ready and theme dialog HTML loaded
let domReady = false;
let htmlLoaded = false;

function tryInitialize() {
    if (domReady && htmlLoaded && !window.themeDialog) {
        const dialogElement = document.getElementById('theme-dialog');
        if (dialogElement) {
            window.themeDialog = new ThemeDialog();
            console.log('✅ Theme Dialog initialized');
        } else {
            console.error('❌ Theme dialog element not found');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    domReady = true;
    tryInitialize();
});

window.addEventListener('themeDialogHTMLLoaded', () => {
    htmlLoaded = true;
    tryInitialize();
});

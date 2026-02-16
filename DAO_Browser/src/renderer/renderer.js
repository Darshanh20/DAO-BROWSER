// Multi-Tab Browser System
console.log('Renderer.js loading...');

const addressBar = document.getElementById('address-bar');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const tabsContainer = document.getElementById('tabs-container');
const newTabBtn = document.getElementById('new-tab-btn');
const contentArea = document.getElementById('content-area');
const welcomeScreen = document.getElementById('welcome-screen');
const progressBar = document.getElementById('progress-bar');
const loadingSpinner = document.getElementById('loading-spinner-overlay');
const blockedCountEl = document.getElementById('blocked-count');
const adblockerBtn = document.getElementById('adblocker-btn');
const goBtn = document.getElementById('go-btn');
const homeSearchInput = document.getElementById('home-search-input');
const homeSearchBtn = document.getElementById('home-search-btn');
const settingsBtn = document.getElementById('settings-btn');
const searchBtn = document.getElementById('search-btn');

// Debug: Check if elements exist
console.log('addressBar:', addressBar);
console.log('tabsContainer:', tabsContainer);
console.log('contentArea:', contentArea);

let tabs = [];
let activeTabId = null;
let nextTabId = 1;

// ==================== WEBVIEW POSTMESSAGE HANDLER ====================
// Listen for messages from webviews about Ctrl+F and other events
window.addEventListener('message', (event) => {
    if (event.source === window) return; // Ignore own messages
    
    if (event.data && event.data.type === 'WEBVIEW_CTRL_F') {
        console.log('[WebView Ctrl+F] Received Ctrl+F from webview, opening find bar');
        if (window.findBar) {
            window.findBar.open();
        } else {
            console.warn('[WebView Ctrl+F] window.findBar not available yet');
        }
    }
});

// ==================== URL SIMPLIFICATION ====================
function simplifyURL(url) {
    if (url === 'about:blank') return '';
    try {
        const urlObj = new URL(url);
        let simplified = urlObj.hostname;

        // Add path if not just root
        if (urlObj.pathname && urlObj.pathname !== '/') {
            simplified += urlObj.pathname;
        }

        // Add search params if important (skip tracking params)
        const importantParams = new URLSearchParams();
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', 'usegapi', 'jsh'];

        for (const [key, value] of urlObj.searchParams) {
            if (!trackingParams.includes(key)) {
                importantParams.append(key, value);
            }
        }

        if (importantParams.toString()) {
            simplified += '?' + importantParams.toString();
        }

        return simplified;
    } catch (e) {
        return url;
    }
}

// Update address bar with simplified URL
function updateAddressBar(url) {
    addressBar.value = simplifyURL(url);
    addressBar.dataset.fullUrl = url;
}

// Show full URL on focus, simplify on blur
addressBar.addEventListener('focus', function () {
    if (this.dataset.fullUrl && this.dataset.fullUrl !== 'about:blank') {
        this.value = this.dataset.fullUrl;
    } else {
        this.value = '';
    }
    this.select();
});

addressBar.addEventListener('blur', function () {
    if (this.dataset.fullUrl) {
        this.value = simplifyURL(this.dataset.fullUrl);
    }
});

// Tab Class - handles creation of webview and tab button
class Tab {
    constructor(id, url = '') {
        this.id = id;
        this.url = url || 'about:blank';
        this.previousUrl = null; // Track previous URL to detect actual changes
        this.title = 'New Tab';
        this.isLoading = false;
        this.loadingStopTimeout = null;
        this.mainFrameNavigating = false; // Track if main frame is navigating
        this.loaderState = 'idle'; // idle | loading | complete
        this.navigationStartTime = null; // Track when navigation started
        this.navigationId = 0; // Unique ID for each real navigation
        this.documentLoadComplete = false; // Lock loader after main document loads
        this.lastHistoryStateUrl = null; // Track history API changes to distinguish from real nav
        
        // Summary state per tab
        this.summaryOpen = false;
        this.summaryData = null;
        this.articleData = null;

        console.log(`Creating tab ${id}...`);

        // Create webview element
        this.webview = document.createElement('webview');
        this.webview.id = `webview-${id}`;
        this.webview.classList.add('webview-tab');
        this.webview.style.display = 'none';
        
        // Initially set to about:blank, will navigate after preload is set
        this.webview.src = 'about:blank';
        contentArea.appendChild(this.webview);
        
        // Set preload script then navigate to actual URL
        this.setupWebviewPreloadAndNavigate(this.url);

        // Create tab button in UI
        this.tabElement = document.createElement('div');
        this.tabElement.classList.add('tab');
        this.tabElement.dataset.tabId = id;

        const tabTitle = document.createElement('span');
        tabTitle.classList.add('tab-title');
        tabTitle.textContent = this.title;
        this.tabTitleElement = tabTitle;

        const closeBtn = document.createElement('button');
        closeBtn.classList.add('close-tab');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        this.tabElement.appendChild(tabTitle);
        this.tabElement.appendChild(closeBtn);
        // Insert before the new tab button
        tabsContainer.insertBefore(this.tabElement, newTabBtn);

        console.log(`Tab ${id} created, inserted into DOM`);

        // Tab click to switch
        this.tabElement.addEventListener('click', () => {
            switchToTab(this.id);
        });

        // Setup webview event listeners
        this.setupWebviewListeners();
    }

    async setupWebviewPreloadAndNavigate(targetUrl) {
        // Set preload script for webview to enable access to electron APIs
        try {
            const preloadPath = await window.electronAPI.paths.getPath('renderer');
            const preloadScript = preloadPath.replace(/\\/g, '/').replace('/renderer', '/preload/preload.js');
            
            // Set webview attributes for proper API access
            this.webview.setAttribute('preload', `file:///${preloadScript}`);
            this.webview.setAttribute('nodeintegration', 'false');
            this.webview.setAttribute('nodeintegrationinsubframes', 'false');
            this.webview.setAttribute('webpreferences', 'contextIsolation=true');
            
            console.log(`Webview preload set: ${preloadScript}`);
            
            // Now navigate to the target URL if it's not about:blank
            if (targetUrl && targetUrl !== 'about:blank') {
                this.webview.src = targetUrl;
            }
        } catch (error) {
            console.error('Failed to set webview preload:', error);
            // Navigate anyway even if preload fails
            if (targetUrl && targetUrl !== 'about:blank') {
                this.webview.src = targetUrl;
            }
        }
    }

    setupWebviewListeners() {
        // STRICT: Only trigger loader on REAL document navigation (not SPA internal changes)
        // will-navigate fires for actual page loads, clicks that change main frame
        this.webview.addEventListener('will-navigate', (e) => {
            // This is a REAL navigation - increase navigation ID to invalidate stale events
            const newUrl = e.url;
            
            if (this.id === activeTabId && !this.documentLoadComplete) {
                // Only prepare for loader if document isn't already complete
                const urlChanged = (this.previousUrl !== newUrl);
                
                if (urlChanged && e.isMainFrame) {
                    console.log(`🔄 [${this.id}] REAL document navigation: ${this.previousUrl || 'start'} → ${newUrl}`);
                    
                    // Increment navigation ID to ignore stale events from previous navigation
                    this.navigationId++;
                    this.mainFrameNavigating = true;
                    this.navigationStartTime = Date.now();
                    this.documentLoadComplete = false; // Reset for new navigation
                    
                } else {
                    console.log(`⤵️ [${this.id}] SPA route change detected (same base URL), ignoring`);
                    this.mainFrameNavigating = false;
                }
            }
        });

        // Update URL tracking
        this.webview.addEventListener('did-navigate', (e) => {
            this.previousUrl = this.url;
            this.url = e.url;
            this.lastHistoryStateUrl = e.url;
            
            if (this.id === activeTabId) {
                const displayUrl = this.convertUrlForDisplay(e.url);
                updateAddressBar(displayUrl);
                updateNavigationButtons();
                welcomeScreen.style.display = (e.url === 'about:blank') ? 'flex' : 'none';
            }
        });

        // Ignore SPA in-page navigation (history API, anchor changes)
        this.webview.addEventListener('did-navigate-in-page', (e) => {
            this.url = e.url;
            this.lastHistoryStateUrl = e.url; // Track that history API was used
            
            if (this.id === activeTabId) {
                const displayUrl = this.convertUrlForDisplay(e.url);
                updateAddressBar(displayUrl);
                updateNavigationButtons();
                welcomeScreen.style.display = (e.url === 'about:blank') ? 'flex' : 'none';
                // CRITICAL: Don't trigger loader for SPA navigation
                this.mainFrameNavigating = false;
            }
        });

        // Update tab title
        this.webview.addEventListener('page-title-updated', (e) => {
            this.title = e.title || 'New Tab';
            this.tabTitleElement.textContent = this.title;
        });

        // Loading states - STRICT guards against SPA activity
        // Only show loader if:
        // 1. Document not already loaded (documentLoadComplete = false)
        // 2. Real navigation detected (mainFrameNavigating = true)
        // 3. Loader not already showing
        this.webview.addEventListener('did-start-loading', () => {
            if (this.id === activeTabId && 
                this.mainFrameNavigating && 
                !this.documentLoadComplete && 
                this.loaderState === 'idle') {
                
                console.log(`⏳ [${this.id}] Showing loader - starting document load`);
                this.loaderState = 'loading';
                this.isLoading = true;
                progressBar.classList.add('active');
                progressBar.classList.add('loading');
                loadingSpinner.classList.add('visible');
            }
        });

        // Main document ready - LOCK the loader (no more background activity should restart it)
        this.webview.addEventListener('dom-ready', () => {
            if (this.id === activeTabId && this.loaderState === 'loading' && this.mainFrameNavigating) {
                console.log(`✅ [${this.id}] Main document ready - LOCKING loader`);
                
                // Lock the document - no more loader restarts allowed
                this.documentLoadComplete = true;
                this.completeLoading();
            }
            
            // Add to browsing history
            this.addToHistory();
            
            // Inject Ctrl+F handler into webview
            console.log(`[WebView ${this.id}] DOM ready, injecting Ctrl+F handler...`);
            this.injectCtrlFHandler();
            
            // Always update navigation buttons
            updateNavigationButtons();
        });

        // Fallback: did-stop-loading (only if dom-ready didn't complete it)
        this.webview.addEventListener('did-stop-loading', () => {
            if (this.id === activeTabId && this.loaderState === 'loading' && !this.documentLoadComplete) {
                console.log(`⏹️ [${this.id}] Loading stopped (fallback) - completing loader`);
                this.documentLoadComplete = true;
                this.completeLoading();
            }
        });

        // Handle page load failures
        this.webview.addEventListener('did-fail-load', async (e) => {
            if (e.isMainFrame && e.errorCode !== -3 && this.mainFrameNavigating && this.loaderState === 'loading') {
                // Complete the loader on error
                this.documentLoadComplete = true;
                this.completeLoading();
                
                try {
                    const rendererPath = await window.electronAPI.paths.getPath('renderer');
                    const errorPageUrl = `file://${rendererPath.replace(/\\/g, '/')}/pages/error.html?code=${e.errorCode}&message=${encodeURIComponent(e.errorDescription)}&url=${encodeURIComponent(e.validatedURL)}`;
                    this.webview.src = errorPageUrl;
                    console.error(`❌ Page failed to load: ${e.errorDescription} (Code: ${e.errorCode})`);
                } catch (error) {
                    console.error('Error loading error page:', error);
                }
            }
        });
    }

    // Complete the loader animation and reset state
    completeLoading() {
        // Only complete if loader is actually loading
        if (this.loaderState !== 'loading') return;
        
        this.loaderState = 'complete';
        this.isLoading = false;
        this.mainFrameNavigating = false;
        this.documentLoadComplete = true; // LOCK: No more loader restarts for this navigation
        
        console.log(`🔒 [${this.id}] Document load locked - no further loader restarts allowed`);
        
        progressBar.classList.remove('loading');
        progressBar.classList.add('complete');
        loadingSpinner.classList.remove('visible');
        
        // Fade out and hide
        setTimeout(() => {
            progressBar.classList.remove('active');
            progressBar.classList.remove('complete');
            this.loaderState = 'idle'; // Reset for next navigation
        }, 600);
        
        // Check if current URL is blank and show welcome screen
        if (this.url === 'about:blank') {
            welcomeScreen.style.display = 'flex';
        } else {
            welcomeScreen.style.display = 'none';
        }
        
        // Update navigation buttons
        updateNavigationButtons();
    }

    convertUrlForDisplay(url) {
        // Convert file:// URLs to dao:// URLs for internal pages
        if (url && url.startsWith('file://')) {
            // Extract the path after file://
            const filePath = url.replace('file://', '');
            // Check if it's a shortcuts page
            if (filePath.includes('shortcuts.html')) {
                return 'dao://shortcuts';
            }
            // Check if it's a settings page
            if (filePath.includes('settings-dialog.html')) {
                return 'dao://settings';
            }
            // Check if it's an error page
            if (filePath.includes('error.html')) {
                return 'dao://error';
            }
        }
        return url;
    }

    async addToHistory() {
        // Don't track internal pages or blank pages
        if (!this.url || this.url === 'about:blank' || this.url.startsWith('dao://')) {
            return;
        }
        
        try {
            // Get page title (fallback to URL if no title)
            const title = this.title && this.title !== 'New Tab' ? this.title : this.url;
            
            // Try to get favicon
            let faviconUrl = '';
            try {
                const urlObj = new URL(this.url);
                faviconUrl = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
            } catch (e) {
                console.log('[History] Could not extract favicon URL');
            }
            
            // Get current profile ID
            let profileId = 1;  // Default profile
            if (window.profileSwitcher && window.profileSwitcher.currentProfile) {
                profileId = window.profileSwitcher.currentProfile.id;
            }
            
            // Add to history via backend
            const result = await window.historyAPI.addHistory({
                url: this.url,
                title: title,
                favicon_url: faviconUrl,
                visit_duration: 0,
                profile_id: profileId
            });
            
            if (result.success) {
                console.log(`[History] Added: ${title} (Profile: ${profileId})`);
            }
        } catch (error) {
            // Silently fail if backend is not available
            console.log('[History] Backend not available:', error);
        }
    }

    injectCtrlFHandler() {
        // Inject Ctrl+F handler into webview's isolated context
        const script = `
            (function() {
                console.log('[WebView Ctrl+F] Handler injection started');
                
                // Send Ctrl+F event to parent window
                document.addEventListener('keydown', function(e) {
                    if (e.ctrlKey && e.key === 'f') {
                        console.log('[WebView Ctrl+F] Ctrl+F pressed, sending to parent');
                        e.preventDefault();
                        
                        // Use postMessage to communicate with parent
                        window.parent.postMessage(
                            { type: 'WEBVIEW_CTRL_F', tabId: '${this.id}' },
                            '*'
                        );
                    }
                });
                
                console.log('[WebView Ctrl+F] Handler injection complete');
            })();
        `;
        
        try {
            this.webview.executeJavaScript(script);
            console.log(`[WebView ${this.id}] Ctrl+F handler injected successfully`);
        } catch (error) {
            console.error(`[WebView ${this.id}] Failed to inject Ctrl+F handler:`, error);
        }
    }

    close() {
        // Clear any pending loading timeout and reset flags
        if (this.loadingStopTimeout) {
            clearTimeout(this.loadingStopTimeout);
            this.loadingStopTimeout = null;
        }
        this.mainFrameNavigating = false;
        this.isLoading = false;
        this.loaderState = 'idle';
        
        if (tabs.length === 1) {
            // Don't close the last tab, just reset it
            this.webview.src = 'about:blank';
            this.title = 'New Tab';
            this.tabTitleElement.textContent = this.title;
            addressBar.value = '';
            return;
        }

        // Remove from DOM
        this.webview.remove();
        this.tabElement.remove();

        // Remove from tabs array
        const index = tabs.findIndex(t => t.id === this.id);
        if (index > -1) {
            tabs.splice(index, 1);
        }

        // Switch to another tab if this was active
        if (this.id === activeTabId) {
            const newActiveTab = tabs[Math.max(0, index - 1)];
            switchToTab(newActiveTab.id);
        }
    }
}

// Switch to a specific tab
function switchToTab(tabId) {
    // Hide all webviews and deactivate all tabs, hide loader if switching away
    tabs.forEach(tab => {
        tab.webview.classList.remove('active');
        tab.webview.style.display = 'none'; // Ensure hidden
        tab.tabElement.classList.remove('active');
        // Hide loader if this tab was loading
        if (tab.loaderState === 'loading') {
            progressBar.classList.remove('active', 'loading');
            loadingSpinner.classList.remove('visible');
        }
    });

    // Show and activate the selected tab
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.webview.classList.add('active');
        tab.webview.style.display = 'flex'; // Make visible
        tab.tabElement.classList.add('active');
        activeTabId = tabId;
        const displayUrl = tab.url === 'about:blank' ? '' : tab.url;
        updateAddressBar(displayUrl);
        welcomeScreen.style.display = tab.url === 'about:blank' ? 'flex' : 'none';
        updateNavigationButtons();
        // Show loader if the new tab is loading
        if (tab.loaderState === 'loading') {
            progressBar.classList.add('active', 'loading');
            loadingSpinner.classList.add('visible');
        }

        // Restore or hide summary panel based on tab state
        if (tab.summaryOpen && tab.summaryData) {
            // Restore summary for this tab
            openSummaryPanel();
            showSummaryContent(tab.summaryData);
            lastArticleData = tab.articleData;
        } else {
            // Hide summary panel
            closeSummaryPanel();
            lastArticleData = null;
        }

        // Auto-focus the top address bar when switching tabs
        setTimeout(() => {
            if (addressBar) {
                addressBar.focus();
                addressBar.select();
            }
        }, 50);
    }
}

// Create a new tab
function createNewTab(url = '') {
    const tab = new Tab(nextTabId++, url);
    tabs.push(tab);
    // If URL is provided (not blank), mark that navigation is happening
    if (url && url !== 'about:blank') {
        tab.previousUrl = 'about:blank'; // Set previousUrl so will-navigate detects change
        tab.documentLoadComplete = false; // Reset so loader can show
        tab.mainFrameNavigating = true;
    }
    switchToTab(tab.id);
    return tab;
}

// Get active tab
function getActiveTab() {
    return tabs.find(t => t.id === activeTabId);
}

// Navigation Function
function navigate(url) {
    console.log('Navigate called with:', url);
    if (!url.trim()) {
        console.log('URL is empty, returning');
        return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // If it's not a URL, treat it as a search query
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        }
    }

    console.log('Final URL:', url);
    const activeTab = getActiveTab();
    console.log('Active tab:', activeTab);

    if (activeTab) {
        // Reset document load flag and prepare for real navigation
        activeTab.documentLoadComplete = false;
        activeTab.mainFrameNavigating = true;
        activeTab.webview.src = url;
        welcomeScreen.style.display = 'none';
        console.log('Navigation successful');
    } else {
        console.log('No active tab found');
    }
}

// Update navigation button states
async function updateNavigationButtons() {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.webview) {
        try {
            const canGoBack = await activeTab.webview.canGoBack();
            const canGoForward = await activeTab.webview.canGoForward();
            backBtn.disabled = !canGoBack;
            forwardBtn.disabled = !canGoForward;
            console.log(`Navigation buttons updated - Back: ${canGoBack}, Forward: ${canGoForward}`);
        } catch (error) {
            console.error('Error updating navigation buttons:', error);
            // Fallback: disable buttons if there's an error
            backBtn.disabled = true;
            forwardBtn.disabled = true;
        }
    } else {
        // No active tab, disable both buttons
        backBtn.disabled = true;
        forwardBtn.disabled = true;
    }
}

// Event Listeners for navigation
addressBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') navigate(addressBar.value);
});

goBtn.addEventListener('click', () => {
    navigate(addressBar.value);
});

// Home Page Search Logic
if (homeSearchInput) {
    homeSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') navigate(homeSearchInput.value);
    });
}

if (homeSearchBtn) {
    homeSearchBtn.addEventListener('click', () => {
        navigate(homeSearchInput.value);
    });
}

backBtn.addEventListener('click', async () => {
    const activeTab = getActiveTab();
    if (activeTab) {
        try {
            const canGoBack = await activeTab.webview.canGoBack();
            if (canGoBack) {
                activeTab.webview.goBack();
            } else {
                // If can't go back in history, try to go back within the page (for error page)
                activeTab.webview.executeJavaScript(`
                    if (typeof goBack === 'function') {
                        goBack();
                    } else if (window.history.length > 1) {
                        window.history.back();
                    }
                `).catch(err => console.error('Error executing back:', err));
            }
        } catch (error) {
            console.error('Error going back:', error);
        }
    }
});

forwardBtn.addEventListener('click', async () => {
    const activeTab = getActiveTab();
    if (activeTab) {
        try {
            const canGoForward = await activeTab.webview.canGoForward();
            if (canGoForward) {
                activeTab.webview.goForward();
            }
        } catch (error) {
            console.error('Error going forward:', error);
        }
    }
});

reloadBtn.addEventListener('click', () => {
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.webview.reload();
    }
});

// New tab button
newTabBtn.addEventListener('click', () => {
    createNewTab();
});

// Global Keyboard Shortcuts
document.addEventListener('keydown', async (e) => {
    const activeTab = getActiveTab();

    // Ctrl+R - Reload page
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        if (activeTab) activeTab.webview.reload();
    }

    // Ctrl+L - Focus address bar
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        addressBar.focus();
        addressBar.select();
    }

    // Ctrl+F - Find in page
    if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        
        // Ensure findBar is initialized
        if (!window.findBar) {
            console.warn('[Ctrl+F] window.findBar not yet available, waiting for initialization...');
            
            // Wait for findBar to be initialized (max 2 seconds)
            let attempts = 0;
            const checkFindBar = setInterval(() => {
                attempts++;
                if (window.findBar) {
                    clearInterval(checkFindBar);
                    window.findBar.open();
                    console.log('[Ctrl+F] FindBar initialized, opening...');
                } else if (attempts > 20) {
                    clearInterval(checkFindBar);
                    console.error('[Ctrl+F] Timeout waiting for findBar initialization');
                }
            }, 100);
        } else {
            window.findBar.open();
            console.log('[Ctrl+F] FindBar opened');
        }
    }

    // Ctrl+H - Open browsing history
    if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        console.log('[Ctrl+H] History shortcut triggered');
        openHistoryPage();
    }

    // Ctrl+Shift+S - Summarize article
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        console.log('[Ctrl+Shift+S] Summarize shortcut triggered');
        summarizeArticle();
    }

    // Alt+ArrowLeft - Go back
    if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (activeTab) {
            try {
                const canGoBack = await activeTab.webview.canGoBack();
                if (canGoBack) {
                    activeTab.webview.goBack();
                }
            } catch (error) {
                console.error('Error going back:', error);
            }
        }
    }

    // Alt+ArrowRight - Go forward
    if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (activeTab) {
            try {
                const canGoForward = await activeTab.webview.canGoForward();
                if (canGoForward) {
                    activeTab.webview.goForward();
                }
            } catch (error) {
                console.error('Error going forward:', error);
            }
        }
    }

    // Ctrl+T - New tab
    if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        createNewTab();
    }

    // Ctrl+W - Close tab
    if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTab) activeTab.close();
    }

    // Ctrl+Tab - Next tab
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        switchToTab(tabs[nextIndex].id);
    }

    // Ctrl+Shift+Tab - Previous tab
    if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        switchToTab(tabs[prevIndex].id);
    }
});

// ==================== BRAVE-STYLE SHIELD MENU LOGIC ====================

// DOM elements for new shield popup
const shieldBtn = document.getElementById('shield-btn');
const shieldPopup = document.getElementById('shield-popup');
const shieldToggle = document.getElementById('shield-toggle');
const popupBlockedCount = document.getElementById('popup-blocked-count');
const currentSiteEl = document.getElementById('current-site');

let popupOpen = false;

// 1. Toggle Popup
if (shieldBtn) {
    shieldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popupOpen = !popupOpen;
        shieldPopup.classList.toggle('hidden', !popupOpen);
        shieldBtn.classList.toggle('active', popupOpen);

        if (popupOpen) {
            updateShieldStats();
        }
    });
}

// 2. Click Outside to Close
document.addEventListener('click', (e) => {
    if (popupOpen && shieldPopup && !shieldPopup.contains(e.target) && e.target !== shieldBtn) {
        popupOpen = false;
        shieldPopup.classList.add('hidden');
        shieldBtn.classList.remove('active');
    }
});

// Prevent closing when clicking inside popup
if (shieldPopup) {
    shieldPopup.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// 3. Toggle Blocker
if (shieldToggle) {
    shieldToggle.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        // In a real app we might pass enabled state, 
        // but current backend just toggles. So we sync them.

        // Let's assume toggle returns the NEW state
        const newState = await window.electronAPI.adBlocker.toggle();

        // Sync UI if backend mismatch (unlikely but safe)
        if (newState !== isEnabled) {
            shieldToggle.checked = newState;
        }

        console.log(`Shields ${newState ? 'UP' : 'DOWN'}`);
        updateShieldStats();
    });
}

// 4. Update Stats UI
async function updateShieldStats() {
    try {
        const stats = await window.electronAPI.adBlocker.getStats();

        // Update number
        if (popupBlockedCount) {
            popupBlockedCount.textContent = stats.sessionBlocked;
        }

        // Update Toggle Switch
        if (shieldToggle) {
            shieldToggle.checked = stats.enabled;
        }

        // Update Current Site Label
        const activeTab = getActiveTab();
        if (activeTab && currentSiteEl) {
            try {
                const urlObj = new URL(activeTab.url);
                currentSiteEl.textContent = urlObj.hostname;
            } catch (e) {
                currentSiteEl.textContent = 'New Tab';
            }
        }

        // Icon Badge Logic
        if (stats.sessionBlocked > 0) {
            shieldBtn.classList.add('has-blocks');
        }

    } catch (error) {
        console.error('Error fetching shield stats:', error);
    }
}

// Auto-update stats when popup is visible
setInterval(() => {
    if (popupOpen) {
        updateShieldStats();
    }
}, 2000);

// ==================== PAGE LOADING IN NEW TABS ====================

// Function to open internal pages in a new tab
async function openPageInNewTab(pageUrl, pageTitle = 'New Page') {
    const tab = createNewTab();
    
    try {
        // Get the renderer path from main process
        const rendererPath = await window.electronAPI.paths.getPath('renderer');
        
        // Construct the absolute file path
        const fullPath = `file://${rendererPath.replace(/\\/g, '/')}/${pageUrl}`;
        
        console.log(`📖 Opening page in new tab`);
        console.log(`   Title: ${pageTitle}`);
        console.log(`   URL: ${fullPath}`);
        
        // Navigate the webview to the page
        tab.webview.src = fullPath;
        tab.title = pageTitle;
        tab.tabTitleElement.textContent = pageTitle;
        
        // Update address bar to show the page is loaded
        updateAddressBar(`dao://internal/${pageUrl}`);
    } catch (error) {
        console.error('Error opening page in new tab:', error);
        // Fallback: create a blank tab
        tab.webview.src = 'about:blank';
    }
}

// ==================== KEYBOARD SHORTCUTS DIALOG LOGIC ====================

// Open settings dialog
if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.settingsDialog) {
            window.settingsDialog.open();
        }
    });
}

// Open find bar
if (searchBtn) {
    searchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (!window.findBar) {
            console.warn('[Search Button] window.findBar not initialized, waiting...');
            let attempts = 0;
            const checkFindBar = setInterval(() => {
                attempts++;
                if (window.findBar) {
                    clearInterval(checkFindBar);
                    window.findBar.open();
                }
                if (attempts > 20) clearInterval(checkFindBar);
            }, 100);
        } else {
            window.findBar.open();
        }
    });
}

// Close when pressing Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const settingsDialog = document.getElementById('settings-dialog');
        if (settingsDialog && !settingsDialog.classList.contains('hidden')) {
            if (window.settingsDialog) {
                window.settingsDialog.close();
            }
        }
    }
});

// Initialize with first tab
console.log('About to create first tab...');
try {
    createNewTab();
    console.log('First tab created successfully');
} catch (error) {
    console.error('Error creating first tab:', error);
}

// Periodically update navigation button states to keep them in sync with webview history
setInterval(() => {
    updateNavigationButtons();
}, 500);

// ==================== PROFILE SWITCH - BROWSER RESET ====================

/**
 * Reset the browser state when switching profiles
 * Closes all tabs and creates a fresh new tab
 */
function resetBrowserForProfileSwitch(profileName) {
    console.log(`[Profile Switch] Resetting browser for profile: ${profileName}`);
    
    // Close all existing tabs
    while (tabs.length > 0) {
        const tab = tabs[0];
        
        // Remove webview from DOM
        if (tab.webview && tab.webview.parentNode) {
            tab.webview.remove();
        }
        
        // Remove tab element from DOM
        if (tab.tabElement && tab.tabElement.parentNode) {
            tab.tabElement.remove();
        }
        
        // Remove from array
        tabs.shift();
    }
    
    // Reset state
    activeTabId = null;
    
    // Clear address bar
    if (addressBar) {
        addressBar.value = '';
    }
    
    // Hide loading indicators
    if (progressBar) {
        progressBar.classList.remove('active', 'loading');
    }
    if (loadingSpinner) {
        loadingSpinner.classList.remove('visible');
    }
    
    // Close summary panel
    if (typeof closeSummaryPanel === 'function') {
        closeSummaryPanel();
    }
    
    // Show welcome screen
    if (welcomeScreen) {
        welcomeScreen.style.display = 'flex';
    }
    
    // Create a fresh new tab
    createNewTab();
    
    console.log(`[Profile Switch] Browser reset complete for profile: ${profileName}`);
}

// Listen for profile switch events
document.addEventListener('profileSwitched', (e) => {
    const profile = e.detail.profile;
    if (profile) {
        resetBrowserForProfileSwitch(profile.display_name || profile.name);
    }
});

// Make function available globally
window.resetBrowserForProfileSwitch = resetBrowserForProfileSwitch;

// ==================== PRODUCTIVITY DASHBOARD MODULE ====================

// Get dashboard element references
const liveTimeEl = document.getElementById('live-time');
const liveDateEl = document.getElementById('live-date');
const quickNotesEl = document.getElementById('quick-notes');
const todayFocusEl = document.getElementById('today-focus');
const locationDisplayEl = document.getElementById('location-display');

// 1. Live Clock & Date Update
function updateClockAndDate() {
    const now = new Date();
    
    // Format time as HH:MM:SS
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    if (liveTimeEl) {
        liveTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
    
    // Format date as "Day, Month Date"
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const dateString = now.toLocaleDateString('en-US', options);
    
    if (liveDateEl) {
        liveDateEl.textContent = dateString;
    }
}

// Update clock immediately and then every second
updateClockAndDate();
setInterval(updateClockAndDate, 1000);

// 2. Geolocation - Request Permission & Display Location
function initializeLocation() {
    if (!locationDisplayEl) return;
    
    // Check if location is already saved in localStorage
    const savedLocation = localStorage.getItem('dao_user_location');
    if (savedLocation) {
        locationDisplayEl.textContent = savedLocation;
        console.log('Location loaded from localStorage:', savedLocation);
        return;
    }
    
    // Request geolocation permission
    if ('geolocation' in navigator) {
        locationDisplayEl.textContent = '📍 Detecting location...';
        locationDisplayEl.style.cursor = 'pointer';
        locationDisplayEl.title = 'Click to update location';
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                console.log(`Geolocation granted: ${latitude}, ${longitude}`);
                
                // Use reverse geocoding via free API to get location name
                reverseGeocodeLocation(latitude, longitude);
            },
            (error) => {
                console.warn('Geolocation permission denied or error:', error.message);
                
                // Fallback to IP-based location or default
                locationDisplayEl.textContent = '📍 Enable location to see your city';
                locationDisplayEl.style.cursor = 'pointer';
                locationDisplayEl.title = 'Click to enable location access';
                
                // Add click handler to retry
                locationDisplayEl.addEventListener('click', initializeLocation);
            },
            {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 3600000 // Cache location for 1 hour
            }
        );
    } else {
        locationDisplayEl.textContent = '📍 Geolocation not supported';
    }
}

// Reverse geocode coordinates to get location name
async function reverseGeocodeLocation(latitude, longitude) {
    try {
        // Using OpenStreetMap's free Nominatim API for reverse geocoding
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        );
        
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        
        // Extract city/town and country
        const city = data.address?.city || data.address?.town || data.address?.village || 'Unknown';
        const country = data.address?.country || 'Unknown';
        const locationText = `📍 ${city}, ${country}`;
        
        // Save to localStorage
        localStorage.setItem('dao_user_location', locationText);
        
        if (locationDisplayEl) {
            locationDisplayEl.textContent = locationText;
            locationDisplayEl.style.cursor = 'pointer';
            locationDisplayEl.title = 'Click to update location';
            locationDisplayEl.addEventListener('click', initializeLocation);
        }
        
        console.log('Location updated:', locationText);
    } catch (error) {
        console.error('Geocoding error:', error);
        
        // Fallback: show coordinates
        const fallbackLocation = `📍 Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
        localStorage.setItem('dao_user_location', fallbackLocation);
        
        if (locationDisplayEl) {
            locationDisplayEl.textContent = fallbackLocation;
            locationDisplayEl.style.cursor = 'pointer';
            locationDisplayEl.title = 'Click to update location';
            locationDisplayEl.addEventListener('click', initializeLocation);
        }
    }
}

// 3. Quick Notes - localStorage persistence
function initializeQuickNotes() {
    if (!quickNotesEl) return;
    
    // Load saved notes from localStorage
    const savedNotes = localStorage.getItem('dao_quick_notes');
    if (savedNotes) {
        quickNotesEl.value = savedNotes;
    }
    
    // Auto-save on input (debounced)
    let saveTimeout;
    quickNotesEl.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            localStorage.setItem('dao_quick_notes', quickNotesEl.value);
            console.log('Quick notes saved to localStorage');
        }, 500); // Save after 500ms of inactivity
    });
}

// 4. Today's Focus - localStorage persistence
function initializeTodaysFocus() {
    if (!todayFocusEl) return;
    
    // Load saved focus from localStorage
    const savedFocus = localStorage.getItem('dao_today_focus');
    if (savedFocus) {
        todayFocusEl.value = savedFocus;
    }
    
    // Auto-save on input (debounced)
    let saveTimeout;
    todayFocusEl.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            localStorage.setItem('dao_today_focus', todayFocusEl.value);
            console.log('Today\'s focus saved to localStorage');
        }, 500); // Save after 500ms of inactivity
    });
}

// Initialize dashboard features
initializeLocation();
initializeQuickNotes();
initializeTodaysFocus();

// Optional: Clear dashboard data on new day (reset focus)
function checkAndResetFocusDaily() {
    const lastResetDate = localStorage.getItem('dao_last_reset_date');
    const today = new Date().toDateString();
    
    if (lastResetDate !== today) {
        // New day detected, clear today's focus but keep notes
        localStorage.setItem('dao_today_focus', '');
        localStorage.setItem('dao_last_reset_date', today);
        if (todayFocusEl) {
            todayFocusEl.value = '';
        }
        console.log('Today\'s focus cleared - new day detected');
    }
}

checkAndResetFocusDaily();

// ==================== QUICK LINKS MODULE ====================

// Default quick links
const DEFAULT_LINKS = [
    { name: 'Google', url: 'https://google.com', icon: '<i class="fa-brands fa-google"></i>' },
    { name: 'YouTube', url: 'https://youtube.com', icon: '<i class="fa-brands fa-youtube"></i>' },
    { name: 'GitHub', url: 'https://github.com', icon: '<i class="fa-brands fa-github"></i>' },
    { name: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '<i class="fa-brands fa-stack-overflow"></i>' },
    { name: 'Wikipedia', url: 'https://wikipedia.org', icon: '<i class="fa-solid fa-book"></i>' },
    { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '<i class="fa-brands fa-openai"></i>' },
];

// Get DOM elements
const quickLinksContainer = document.getElementById('quick-links-container');
const addLinkBtn = document.getElementById('add-link-btn');
const addLinkModal = document.getElementById('add-link-modal');
const closeAddLinkModalBtn = document.getElementById('close-add-link-modal');
const addLinkForm = document.getElementById('add-link-form');
const linkNameInput = document.getElementById('link-name');
const linkUrlInput = document.getElementById('link-url');
const cancelLinkBtn = document.getElementById('cancel-link-btn');
const formError = document.getElementById('form-error');

let allLinks = [];

// Load links from localStorage or use defaults
function loadQuickLinks() {
    const savedLinks = localStorage.getItem('dao_quick_links');
    const customLinks = savedLinks ? JSON.parse(savedLinks) : [];
    allLinks = [...DEFAULT_LINKS, ...customLinks];
    renderQuickLinks();
}

// Render quick links to the page
function renderQuickLinks() {
    quickLinksContainer.innerHTML = '';
    
    allLinks.forEach((link, index) => {
        const isCustom = index >= DEFAULT_LINKS.length;
        const linkCard = document.createElement('div');
        linkCard.className = 'quick-link-card';
        linkCard.style.cursor = 'pointer';
        
        let cardHTML = `
            <div class="quick-link-icon">${link.icon}</div>
            <div class="quick-link-name">${link.name}</div>
        `;
        
        // Add remove button for custom links only
        if (isCustom) {
            cardHTML += `<button class="quick-link-remove" data-index="${index}" title="Remove link">×</button>`;
        }
        
        linkCard.innerHTML = cardHTML;
        quickLinksContainer.appendChild(linkCard);
        
        // Add click event to open link in new tab
        linkCard.addEventListener('click', (e) => {
            // Don't trigger if clicking the remove button
            if (!e.target.closest('.quick-link-remove')) {
                createNewTab(link.url);
            }
        });
        
        // Add remove event listener
        if (isCustom) {
            const removeBtn = linkCard.querySelector('.quick-link-remove');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeQuickLink(index);
            });
        }
    });
}

// Remove a custom link
function removeQuickLink(index) {
    allLinks.splice(index, 1);
    const customLinks = allLinks.slice(DEFAULT_LINKS.length);
    localStorage.setItem('dao_quick_links', JSON.stringify(customLinks));
    renderQuickLinks();
    console.log('Quick link removed');
}

// Add a new custom link
function addQuickLink(name, url) {
    const newLink = { name, url, icon: '<i class="fa-solid fa-link"></i>' };
    const customLinks = allLinks.slice(DEFAULT_LINKS.length);
    customLinks.push(newLink);
    localStorage.setItem('dao_quick_links', JSON.stringify(customLinks));
    allLinks.push(newLink);
    renderQuickLinks();
    console.log('New quick link added:', name);
}

// Validate and normalize URL format
function normalizeAndValidateUrl(urlString) {
    let url = urlString.trim();
    
    // If URL doesn't start with http:// or https://, add https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    try {
        new URL(url);
        return url; // Return the normalized URL
    } catch (e) {
        return null; // Invalid URL
    }
}

// Open/Close modal
function openAddLinkModal() {
    addLinkModal.classList.remove('hidden');
    linkNameInput.focus();
}

function closeAddLinkModalFunc() {
    // Clear form fields
    linkNameInput.value = '';
    linkUrlInput.value = '';
    formError.textContent = '';
    formError.style.display = 'none';
    // Hide modal
    addLinkModal.classList.add('hidden');
}

// Modal event listeners
addLinkBtn.addEventListener('click', openAddLinkModal);
closeAddLinkModalBtn.addEventListener('click', closeAddLinkModalFunc);
cancelLinkBtn.addEventListener('click', closeAddLinkModalFunc);

// Close modal when clicking outside
addLinkModal.addEventListener('click', (e) => {
    if (e.target === addLinkModal) {
        closeAddLinkModalFunc();
    }
});

// Form submission
addLinkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = linkNameInput.value.trim();
    let url = linkUrlInput.value.trim();
    
    // Clear previous errors
    formError.style.display = 'none';
    formError.textContent = '';
    
    // Validation
    if (!name) {
        formError.textContent = 'Website name is required';
        formError.style.display = 'block';
        return;
    }
    
    if (!url) {
        formError.textContent = 'URL is required';
        formError.style.display = 'block';
        return;
    }
    
    // Validate and normalize URL
    const validatedUrl = normalizeAndValidateUrl(url);
    if (!validatedUrl) {
        formError.textContent = 'Please enter a valid URL (e.g., twitter.com or https://example.com)';
        formError.style.display = 'block';
        return;
    }
    
    // Check for duplicate names
    if (allLinks.some(link => link.name.toLowerCase() === name.toLowerCase())) {
        formError.textContent = 'A link with this name already exists';
        formError.style.display = 'block';
        return;
    }
    
    // Add the link with the validated URL
    addQuickLink(name, validatedUrl);
    closeAddLinkModalFunc();
});

// Initialize quick links on page load
loadQuickLinks();

// ==================== HISTORY FEATURE ====================

const historyBtn = document.getElementById('history-btn');

// Open history in a new tab
async function openHistoryPage() {
    console.log('[History] Opening history tab');
    
    try {
        const rendererPath = await window.electronAPI.paths.getPath('renderer');
        const historyPageUrl = `file://${rendererPath.replace(/\\/g, '/')}/pages/history.html`;
        
        // Create a new tab with the history page
        const historyTab = createNewTab(historyPageUrl);
        historyTab.title = 'Browsing History';
        historyTab.tabTitleElement.textContent = 'Browsing History';
        
        console.log('[History] History tab opened successfully');
    } catch (err) {
        console.error('[History] Failed to open history tab:', err);
    }
}

// History button click handler
if (historyBtn) {
    historyBtn.addEventListener('click', () => {
        console.log('[History] Button clicked');
        openHistoryPage();
    });
} else {
    console.error('[History] ❌ History button element not found!');
}

// ==================== ARTICLE SUMMARIZATION FEATURE ====================

// Summary Panel Elements
const summarizeBtn = document.getElementById('summarize-btn');
const summaryPanel = document.getElementById('summary-panel');
const closeSummaryBtn = document.getElementById('close-summary-btn');
const copySummaryBtn = document.getElementById('copy-summary-btn');
const summaryLoading = document.getElementById('summary-loading');
const summaryError = document.getElementById('summary-error');
const summaryErrorMessage = document.getElementById('summary-error-message');
const summaryContent = document.getElementById('summary-content');
const summaryList = document.getElementById('summary-list');
const summarySentencesCount = document.getElementById('summary-sentences-count');
const sentenceCountSelect = document.getElementById('sentence-count-select');

// Initialize Content Extractor
const contentExtractor = new ContentExtractor();

// State
let isSummarizing = false;
let summaryPanelOpen = false;
let lastArticleData = null; // Store last extracted article for re-summarization

// Check if summarization service is available on startup
async function checkSummarizationService() {
    try {
        const result = await window.api.checkSummarizationService();
        if (!result.available) {
            console.warn('⚠️ Summarization service not available. Make sure Python backend is running on port 5000.');
        } else {
            console.log('✅ Summarization service is available');
        }
    } catch (error) {
        console.error('Failed to check summarization service:', error);
    }
}

// Open summary panel
function openSummaryPanel() {
    summaryPanel.classList.remove('hidden');
    summaryPanelOpen = true;
    
    // Add active state to button
    if (summarizeBtn) {
        summarizeBtn.classList.add('active');
    }
    
    // Adjust content area to make room for panel
    if (contentArea) {
        contentArea.style.width = '70%';
    }
    
    // Save state to current tab
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.summaryOpen = true;
    }
}

// Close summary panel
function closeSummaryPanel() {
    summaryPanel.classList.add('hidden');
    summaryPanelOpen = false;
    
    // Remove active state from button
    if (summarizeBtn) {
        summarizeBtn.classList.remove('active');
    }
    
    // Restore content area to full width
    if (contentArea) {
        contentArea.style.width = '100%';
    }
    
    // Save state to current tab
    const activeTab = getActiveTab();
    if (activeTab) {
        activeTab.summaryOpen = false;
    }
}

// Show loading state
function showSummaryLoading() {
    summaryLoading.classList.remove('hidden');
    summaryError.classList.add('hidden');
    summaryContent.classList.add('hidden');
}

// Show error state
function showSummaryError(message) {
    summaryLoading.classList.add('hidden');
    summaryError.classList.remove('hidden');
    summaryContent.classList.add('hidden');
    summaryErrorMessage.textContent = message;
}

// Show summary content
function showSummaryContent(summaryData) {
    summaryLoading.classList.add('hidden');
    summaryError.classList.add('hidden');
    summaryContent.classList.remove('hidden');

    // Clear previous summary
    summaryList.innerHTML = '';

    // Update sentence count with processing time
    const count = summaryData.summary.length;
    let countText = `${count} key point${count !== 1 ? 's' : ''}`;
    if (summaryData.processing_time) {
        countText += ` • ${summaryData.processing_time}s`;
    }
    summarySentencesCount.textContent = countText;

    // Add summary bullets
    summaryData.summary.forEach((sentence, index) => {
        const li = document.createElement('li');
        li.textContent = sentence;
        summaryList.appendChild(li);
    });
}

// Extract article from current webview
async function extractArticleFromWebview() {
    const activeTab = getActiveTab();
    if (!activeTab || !activeTab.webview) {
        throw new Error('No active tab');
    }

    // Check if on about:blank or welcome screen
    if (activeTab.url === 'about:blank' || !activeTab.url) {
        throw new Error('Please navigate to an article page first');
    }

    // Execute content extraction in the webview
    try {
        const result = await activeTab.webview.executeJavaScript(`
            (function() {
                // Content extraction code
                const articleSelectors = [
                    'article',
                    '[role="main"]',
                    'main',
                    '.article-content',
                    '.post-content',
                    '.entry-content',
                    '#article',
                    '#content'
                ];

                const excludeSelectors = [
                    'nav', 'header', 'footer', 'aside',
                    '.sidebar', '.advertisement', '.ad',
                    '.social-share', '.comments', '.related-posts',
                    'script', 'style', 'iframe', 'noscript'
                ];

                // Find article element
                let articleElement = null;
                for (const selector of articleSelectors) {
                    const el = document.querySelector(selector);
                    if (el && el.textContent.trim().length > 200) {
                        articleElement = el;
                        break;
                    }
                }

                if (!articleElement) {
                    articleElement = document.body;
                }

                // Clone and clean
                const clone = articleElement.cloneNode(true);
                
                // Remove unwanted elements
                excludeSelectors.forEach(selector => {
                    clone.querySelectorAll(selector).forEach(el => el.remove());
                });

                // Extract text from paragraphs
                const paragraphs = clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
                const textParts = [];
                paragraphs.forEach(p => {
                    const text = p.textContent.trim();
                    if (text.length > 0) {
                        textParts.push(text);
                    }
                });

                const text = textParts.join('\\n\\n');

                return {
                    success: text.length >= 100,
                    text: text,
                    title: document.title || '',
                    wordCount: text.split(/\\s+/).length,
                    charCount: text.length
                };
            })();
        `);

        if (!result.success) {
            throw new Error('Article too short or no article content found on this page');
        }

        return result;
    } catch (error) {
        console.error('Content extraction error:', error);
        throw new Error('Failed to extract article content: ' + error.message);
    }
}

// Main summarize function
async function summarizeArticle() {
    if (isSummarizing) {
        console.log('Already summarizing...');
        return;
    }

    try {
        isSummarizing = true;
        
        // Open panel and show loading
        openSummaryPanel();
        showSummaryLoading();

        // Check if service is available
        const serviceCheck = await window.api.checkSummarizationService();
        if (!serviceCheck.available) {
            throw new Error('Summarization service is not running. Please start the Python backend server (python backend/summarizer.py)');
        }

        // Extract article content (only if not re-summarizing)
        if (!lastArticleData) {
            console.log('Extracting article content...');
            lastArticleData = await extractArticleFromWebview();
            console.log(`Extracted ${lastArticleData.wordCount} words, ${lastArticleData.charCount} characters`);
        }

        // Get selected sentence count
        const sentenceCount = sentenceCountSelect ? parseInt(sentenceCountSelect.value) : 5;
        console.log(`Using sentence count: ${sentenceCount}`);

        // Send to backend for summarization
        console.log('Sending to summarization service...');
        const result = await window.api.summarizeArticle({
            text: lastArticleData.text,
            sentences: sentenceCount
        });

        if (!result.success) {
            throw new Error(result.message || result.error || 'Summarization failed');
        }

        console.log('Summary generated successfully:', result.data);
        
        // Save to current tab
        const activeTab = getActiveTab();
        if (activeTab) {
            activeTab.summaryData = result.data;
            activeTab.articleData = lastArticleData;
        }
        
        // Display summary
        showSummaryContent(result.data);

    } catch (error) {
        console.error('Summarization error:', error);
        showSummaryError(error.message);
    } finally {
        isSummarizing = false;
    }
}

// Copy summary to clipboard
async function copySummaryToClipboard() {
    try {
        const summaryItems = summaryList.querySelectorAll('li');
        const summaryText = Array.from(summaryItems)
            .map((li, index) => `${index + 1}. ${li.textContent}`)
            .join('\n');

        await navigator.clipboard.writeText(summaryText);
        
        // Show feedback
        const originalIcon = copySummaryBtn.querySelector('i');
        const originalClass = originalIcon.className;
        originalIcon.className = 'fa-solid fa-check';
        
        setTimeout(() => {
            originalIcon.className = originalClass;
        }, 2000);
        
    } catch (error) {
        console.error('Failed to copy summary:', error);
        alert('Failed to copy summary to clipboard');
    }
}

// Event listeners
if (summarizeBtn) {
    summarizeBtn.addEventListener('click', () => {
        lastArticleData = null; // Reset to extract fresh content
        summarizeArticle();
    });
}

if (closeSummaryBtn) {
    closeSummaryBtn.addEventListener('click', () => {
        closeSummaryPanel();
        lastArticleData = null; // Clear cached data when closing
        
        // Clear from current tab
        const activeTab = getActiveTab();
        if (activeTab) {
            activeTab.summaryData = null;
            activeTab.articleData = null;
        }
    });
}

if (copySummaryBtn) {
    copySummaryBtn.addEventListener('click', copySummaryToClipboard);
}

// Re-summarize when sentence count changes
if (sentenceCountSelect) {
    sentenceCountSelect.addEventListener('change', () => {
        if (lastArticleData && summaryPanelOpen) {
            console.log('Re-summarizing with new sentence count...');
            summarizeArticle();
        }
    });
}

// Check service on startup
checkSummarizationService();

// ==================== PROFILE SYSTEM INITIALIZATION ====================

// Initialize profile components
function initializeProfileComponents() {
    console.log('[ProfileSystem] Initializing profile components...');
    
    try {
        // Initialize ProfileSwitcher
        if (typeof ProfileSwitcher !== 'undefined') {
            window.profileSwitcher = new ProfileSwitcher();
            console.log('[ProfileSystem] ProfileSwitcher initialized');
        } else {
            console.warn('[ProfileSystem] ProfileSwitcher class not found');
        }
        
        // Initialize ProfileManager
        if (typeof ProfileManager !== 'undefined') {
            window.profileManager = new ProfileManager();
            console.log('[ProfileSystem] ProfileManager initialized');
        } else {
            console.warn('[ProfileSystem] ProfileManager class not found');
        }
        
        console.log('[ProfileSystem] Profile components initialization complete');
    } catch (error) {
        console.error('[ProfileSystem] Error initializing profile components:', error);
    }
}

// Initialize profile components when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProfileComponents);
} else {
    initializeProfileComponents();
}
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
const loadingBar = document.getElementById('loading-bar');
const blockedCountEl = document.getElementById('blocked-count');
const adblockerBtn = document.getElementById('adblocker-btn');
const goBtn = document.getElementById('go-btn');
const homeSearchInput = document.getElementById('home-search-input');
const homeSearchBtn = document.getElementById('home-search-btn');

// Debug: Check if elements exist
console.log('addressBar:', addressBar);
console.log('tabsContainer:', tabsContainer);
console.log('contentArea:', contentArea);

let tabs = [];
let activeTabId = null;
let nextTabId = 1;

// ==================== URL SIMPLIFICATION ====================
function simplifyURL(url) {
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
    if (this.dataset.fullUrl) {
        this.value = this.dataset.fullUrl;
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
        this.title = 'New Tab';

        console.log(`Creating tab ${id}...`);

        // Create webview element
        this.webview = document.createElement('webview');
        this.webview.id = `webview-${id}`;
        this.webview.classList.add('webview-tab');
        this.webview.style.display = 'none';
        this.webview.src = this.url;
        contentArea.appendChild(this.webview);

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

    setupWebviewListeners() {
        // Update address bar and title on navigation
        this.webview.addEventListener('did-navigate', (e) => {
            this.url = e.url;
            if (this.id === activeTabId) {
                updateAddressBar(e.url);
                updateNavigationButtons();
            }
        });

        this.webview.addEventListener('did-navigate-in-page', (e) => {
            this.url = e.url;
            if (this.id === activeTabId) {
                updateAddressBar(e.url);
            }
        });

        // Update tab title
        this.webview.addEventListener('page-title-updated', (e) => {
            this.title = e.title || 'New Tab';
            this.tabTitleElement.textContent = this.title;
        });

        // Loading states with loading bar
        this.webview.addEventListener('did-start-loading', () => {
            if (this.id === activeTabId) {
                console.log('Loading...');
                loadingBar.classList.add('loading');
            }
        });

        this.webview.addEventListener('did-stop-loading', () => {
            if (this.id === activeTabId) {
                console.log('Finished loading.');
                loadingBar.classList.remove('loading');
                updateNavigationButtons();
            }
        });
    }

    close() {
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
    // Hide all webviews and deactivate all tabs
    tabs.forEach(tab => {
        tab.webview.classList.remove('active');
        tab.webview.style.display = 'none'; // Ensure hidden
        tab.tabElement.classList.remove('active');
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
    }
}

// Create a new tab
function createNewTab(url = '') {
    const tab = new Tab(nextTabId++, url);
    tabs.push(tab);
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
        activeTab.webview.src = url;
        welcomeScreen.style.display = 'none';
        console.log('Navigation successful');
    } else {
        console.log('No active tab found');
    }
}

// Update navigation button states
function updateNavigationButtons() {
    const activeTab = getActiveTab();
    if (activeTab) {
        backBtn.disabled = !activeTab.webview.canGoBack();
        forwardBtn.disabled = !activeTab.webview.canGoForward();
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

backBtn.addEventListener('click', () => {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.webview.canGoBack()) {
        activeTab.webview.goBack();
    }
});

forwardBtn.addEventListener('click', () => {
    const activeTab = getActiveTab();
    if (activeTab && activeTab.webview.canGoForward()) {
        activeTab.webview.goForward();
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
document.addEventListener('keydown', (e) => {
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

    // Alt+ArrowLeft - Go back
    if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        if (activeTab && activeTab.webview.canGoBack()) {
            activeTab.webview.goBack();
        }
    }

    // Alt+ArrowRight - Go forward
    if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        if (activeTab && activeTab.webview.canGoForward()) {
            activeTab.webview.goForward();
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

// Initialize with first tab
console.log('About to create first tab...');
try {
    createNewTab();
    console.log('First tab created successfully');
} catch (error) {
    console.error('Error creating first tab:', error);
}
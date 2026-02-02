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

// ==================== AD-BLOCKER UI INTEGRATION ====================

// DOM elements for stats popup
const shieldBtn = document.getElementById('shield-btn');
const statsPopup = document.getElementById('stats-popup');
const closePopupBtn = document.querySelector('.close-popup');
const toggleBlockerBtn = document.getElementById('toggle-blocker-btn');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const sessionBlockedEl = document.getElementById('session-blocked');
const totalBlockedEl = document.getElementById('total-blocked');
const blockerStatusEl = document.getElementById('blocker-status');

let popupOpen = false;

// Toggle stats popup
shieldBtn.addEventListener('click', () => {
    popupOpen = !popupOpen;
    statsPopup.classList.toggle('hidden', !popupOpen);
    shieldBtn.classList.toggle('active', popupOpen);

    if (popupOpen) {
        updateStatsDisplay();
    }
});

// Close popup
closePopupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popupOpen = false;
    statsPopup.classList.add('hidden');
    shieldBtn.classList.remove('active');
});

// Close popup when clicking outside
document.addEventListener('click', (e) => {
    if (popupOpen && !statsPopup.contains(e.target) && e.target !== shieldBtn) {
        popupOpen = false;
        statsPopup.classList.add('hidden');
        shieldBtn.classList.remove('active');
    }
});

// Toggle ad-blocker on/off
toggleBlockerBtn.addEventListener('click', async () => {
    const newStatus = await window.electronAPI.adBlocker.toggle();
    console.log(`Ad-Blocker toggled: ${newStatus ? 'Enabled' : 'Disabled'}`);
    updateStatsDisplay();
});

// Reset session stats
resetStatsBtn.addEventListener('click', async () => {
    await window.electronAPI.adBlocker.resetSession();
    console.log('Session stats reset');
    updateStatsDisplay();
});

// Update stats display
async function updateStatsDisplay() {
    try {
        const stats = await window.electronAPI.adBlocker.getStats();

        sessionBlockedEl.textContent = stats.sessionBlocked;
        totalBlockedEl.textContent = stats.totalBlocked;
        blockedCountEl.textContent = stats.sessionBlocked;

        // Update status indicator
        blockerStatusEl.textContent = stats.enabled ? 'Enabled' : 'Disabled';
        blockerStatusEl.className = `stat-value ${stats.enabled ? 'enabled' : 'disabled'}`;

        // Update toggle button text
        toggleBlockerBtn.textContent = stats.enabled ? 'Disable Blocker' : 'Enable Blocker';
        toggleBlockerBtn.className = stats.enabled ? 'btn-toggle' : 'btn-toggle disabled';

        // Update ad-blocker button badge
        if (stats.sessionBlocked > 0) {
            adblockerBtn.classList.add('active');
            blockedCountEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

// Update stats periodically (every 2 seconds) when popup is open
setInterval(() => {
    if (popupOpen) {
        updateStatsDisplay();
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
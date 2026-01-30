// Get all UI elements
const urlBar = document.getElementById("urlBar");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const newTabBtn = document.getElementById("newTabBtn");
const tabsContainer = document.getElementById("tabsContainer");
const browserContainer = document.getElementById("browserContainer");
const blockerStats = document.getElementById("blockerStats");
const blockerCount = document.getElementById("blockerCount");
const blockerToggle = document.getElementById("blockerToggle");

// Tabs state
let tabs = [];
let currentTabId = null;
let tabIdCounter = 0;

// State to track if we're programmatically updating the URL bar
let isUpdatingUrl = false;
let currentFullUrl = ""; // Store the full URL

// Function to simplify URL for display (e.g., https://www.google.com -> google.com)
function simplifyUrl(url) {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    
    // Remove 'www.' prefix if present
    if (hostname.startsWith("www.")) {
      hostname = hostname.substring(4);
    }
    
    return hostname;
  } catch {
    return url;
  }
}

// Function to update URL bar with current page URL
function updateUrlBar(url) {
  isUpdatingUrl = true;
  currentFullUrl = url;
  
  // Show simplified URL if not focused
  if (document.activeElement !== urlBar) {
    urlBar.value = simplifyUrl(url);
  } else {
    urlBar.value = url;
  }
  
  isUpdatingUrl = false;
}

// Function to get current active webview
function getCurrentWebview() {
  const activeTab = tabs.find(tab => tab.id === currentTabId);
  return activeTab ? activeTab.webview : null;
}

// Function to create a new tab
function createNewTab(url = "https://www.google.com") {
  const tabId = tabIdCounter++;
  
  // Create webview element with proper attributes
  const webview = document.createElement("webview");
  webview.id = `browserView-${tabId}`;
  webview.src = url;
  webview.classList.add("active");
  
  // Essential attributes for new-window handling
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('nodeintegration', 'false');
  webview.setAttribute('enableremotemodule', 'false');
  webview.setAttribute('preload', '');  // Empty preload to enable webview features
  
  browserContainer.appendChild(webview);
  
  // Setup webview event listeners immediately
  setupWebviewListeners(webview);
  
  // Create tab object
  const tab = {
    id: tabId,
    webview: webview,
    title: "New Tab",
    url: url
  };
  
  tabs.push(tab);
  
  // Switch to new tab
  switchTab(tabId);
  
  // Render tabs UI
  renderTabs();
  
  return tab;
}

// Function to setup webview event listeners
function setupWebviewListeners(webview) {
  webview.addEventListener("did-navigate", (event) => {
    const tab = tabs.find(t => t.webview === webview);
    if (tab) {
      tab.url = event.url;
      updateCurrentTabUI();
    }
  });

  webview.addEventListener("did-navigate-in-page", (event) => {
    const tab = tabs.find(t => t.webview === webview);
    if (tab) {
      tab.url = event.url;
      updateCurrentTabUI();
    }
  });

  webview.addEventListener("did-start-loading", () => {
    if (webview === getCurrentWebview()) {
      urlBar.style.opacity = "0.7";
    }
  });

  webview.addEventListener("did-stop-loading", () => {
    if (webview === getCurrentWebview()) {
      urlBar.style.opacity = "1";
    }
  });

  webview.addEventListener("page-title-updated", (event) => {
    const tab = tabs.find(t => t.webview === webview);
    if (tab) {
      tab.title = event.title || "New Tab";
      renderTabs();
    }
  });

  // ============================================
  // HANDLE NEW WINDOW/TAB REQUESTS FROM WEBVIEW
  // ============================================
  
  /**
   * Intercept new-window events from webview
   * Fires for target="_blank" links, window.open(), etc.
   */
  webview.addEventListener('new-window', (event) => {
    console.log(`[WEBVIEW] new-window event fired`);
    console.log(`[WEBVIEW] URL: ${event.url}`);
    
    // Prevent opening an external window
    event.preventDefault();
    
    // Create a new tab instead
    if (event.url) {
      console.log(`[NEW-TAB] Creating tab for: ${event.url}`);
      createNewTab(event.url);
    }
  });
  
  /**
   * Use JavaScript injection to capture window.open and target="_blank" clicks
   * This ensures we catch all new-window requests even if the event doesn't fire
   */
  webview.addEventListener('did-finish-load', () => {
    // Inject a script that forwards new-window attempts to the renderer
    const script = `
      (function interceptNewWindow() {
        // Override window.open
        const originalOpen = window.open;
        window.open = function(url, target, features) {
          if (target === '_blank' || target === '_new') {
            console.log('Intercepted window.open: ' + url);
            // Send message to parent (renderer process via new-window event)
            return null;
          }
          return originalOpen.apply(window, arguments);
        };
        
        // Override link target="_blank" behavior
        document.addEventListener('click', function(e) {
          const el = e.target.closest('a[href]');
          if (el && el.getAttribute('target') === '_blank') {
            console.log('Intercepted target="_blank" click: ' + el.href);
            // The new-window event should fire for this
          }
        }, true);
        
        console.log('New window interceptor installed');
      })();
    `;
    
    webview.executeJavaScript(script).catch(err => {
      console.error(`[INJECT] Error: ${err.message}`);
    });
  });




  webview.addEventListener("did-fail-load", (event) => {
    if (event.isMainFrame) {
      const tab = tabs.find(t => t.webview === webview);
      if (tab) {
        tab.title = "Error";
        const errorHtml = `
          <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e1e;color:#e8e8e8;font-family:system-ui;flex-direction:column;gap:20px;">
            <h1 style="font-size:32px;margin:0;">Failed to Load Page</h1>
            <p style="color:#b3b3b3;margin:0;">Error Code: ${event.errorCode}</p>
            <p style="color:#b3b3b3;margin:0;max-width:400px;text-align:center;">${event.errorDescription}</p>
            <button onclick="history.back()" style="padding:10px 20px;background:#0066ff;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Go Back</button>
          </div>
        `;
        webview.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
        renderTabs();
      }
    }
  });
}

// Function to switch to a specific tab
function switchTab(tabId) {
  // Hide all webviews
  tabs.forEach(tab => {
    tab.webview.classList.remove("active");
  });
  
  // Show the selected webview
  const selectedTab = tabs.find(tab => tab.id === tabId);
  if (selectedTab) {
    selectedTab.webview.classList.add("active");
    currentTabId = tabId;
    updateCurrentTabUI();
  }
}

// Function to update current tab UI (URL bar and buttons)
function updateCurrentTabUI() {
  const currentTab = tabs.find(tab => tab.id === currentTabId);
  if (currentTab) {
    // Use the tracked URL from navigation events, not webview.src
    updateUrlBar(currentTab.url);
  }
  renderTabs();
}

// Function to close a tab
function closeTab(tabId) {
  const tabIndex = tabs.findIndex(tab => tab.id === tabId);
  if (tabIndex !== -1) {
    const tab = tabs[tabIndex];
    
    // Properly dispose of webview
    try {
      if (tab.webview) {
        tab.webview.stop();  // Stop any loading in progress
        tab.webview.remove();  // Remove from DOM
        tab.webview = null;  // Clear reference to allow garbage collection
      }
    } catch (e) {
      console.warn("Error disposing webview:", e);
    }
    
    tabs.splice(tabIndex, 1);
    
    // If closed tab was active, switch to another tab
    if (currentTabId === tabId) {
      if (tabs.length > 0) {
        // Switch to the tab before or after the closed one
        switchTab(tabs[Math.max(0, tabIndex - 1)].id);
      } else {
        // Create new tab if no tabs left
        createNewTab();
      }
    } else {
      renderTabs();
    }
  }
}

// Function to render tabs UI
function renderTabs() {
  tabsContainer.innerHTML = "";
  
  tabs.forEach(tab => {
    const tabEl = document.createElement("div");
    tabEl.className = `tab ${tab.id === currentTabId ? "active" : ""}`;
    tabEl.dataset.tabId = tab.id;  // Store tab ID for event delegation
    tabEl.innerHTML = `
      <span class="tab-title" title="${tab.title}">${tab.title}</span>
      <button class="tab-close">×</button>
    `;
    
    tabsContainer.appendChild(tabEl);
  });
  
  // Use event delegation instead of attaching listeners to each tab
  // This prevents memory leaks from multiple listener accumulation
}

// Single event listener for all tab interactions using event delegation
tabsContainer.addEventListener("click", (e) => {
  const tabEl = e.target.closest(".tab");
  if (!tabEl) return;
  
  const tabId = parseInt(tabEl.dataset.tabId);
  
  if (e.target.classList.contains("tab-close")) {
    e.stopPropagation();
    closeTab(tabId);
  } else {
    switchTab(tabId);
  }
});

// Handle URL input when user presses Enter
urlBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !isUpdatingUrl) {
    const currentWebview = getCurrentWebview();
    if (!currentWebview) return;
    
    let url = urlBar.value.trim();
    
    // If no protocol, add https:// and www. if needed
    if (!url.startsWith("http")) {
      // If it doesn't have a dot, assume it's a search term
      if (!url.includes(".")) {
        url = "https://www.google.com/search?q=" + encodeURIComponent(url);
      } else {
        // Add www. if missing
        if (!url.startsWith("www.")) {
          url = "www." + url;
        }
        url = "https://" + url;
      }
    }
    currentWebview.src = url;
  }
});

// Back button - go to previous page
backBtn.addEventListener("click", () => {
  const currentWebview = getCurrentWebview();
  if (currentWebview && currentWebview.canGoBack()) {
    currentWebview.goBack();
  }
});

// Forward button - go to next page
forwardBtn.addEventListener("click", () => {
  const currentWebview = getCurrentWebview();
  if (currentWebview && currentWebview.canGoForward()) {
    currentWebview.goForward();
  }
});

// Reload button - refresh current page
reloadBtn.addEventListener("click", () => {
  const currentWebview = getCurrentWebview();
  if (currentWebview) {
    currentWebview.reload();
  }
});

// New Tab button
newTabBtn.addEventListener("click", () => {
  createNewTab();
});

// Keyboard Shortcuts
window.addEventListener("keyboard-new-tab", () => {
  createNewTab();
});

window.addEventListener("keyboard-back", () => {
  const currentWebview = getCurrentWebview();
  if (currentWebview && currentWebview.canGoBack()) {
    currentWebview.goBack();
  }
});

window.addEventListener("keyboard-forward", () => {
  const currentWebview = getCurrentWebview();
  if (currentWebview && currentWebview.canGoForward()) {
    currentWebview.goForward();
  }
});

window.addEventListener("keyboard-reload", () => {
  const currentWebview = getCurrentWebview();
  if (currentWebview) {
    currentWebview.reload();
  }
});

window.addEventListener("keyboard-focus-address", () => {
  urlBar.focus();
  urlBar.select();
});

// Address bar focus/blur handlers for URL display toggling
urlBar.addEventListener("focus", () => {
  // When focused, show full URL and select all
  urlBar.value = currentFullUrl;
  urlBar.select();
});

urlBar.addEventListener("blur", () => {
  // When blurred, show simplified URL
  urlBar.value = simplifyUrl(currentFullUrl);
});

window.addEventListener("keyboard-next-tab", () => {
  const currentIndex = tabs.findIndex(tab => tab.id === currentTabId);
  if (currentIndex !== -1 && currentIndex < tabs.length - 1) {
    switchTab(tabs[currentIndex + 1].id);
  }
});

window.addEventListener("keyboard-prev-tab", () => {
  const currentIndex = tabs.findIndex(tab => tab.id === currentTabId);
  if (currentIndex > 0) {
    switchTab(tabs[currentIndex - 1].id);
  }
});

window.addEventListener("keyboard-close-tab", () => {
  if (currentTabId !== null) {
    closeTab(currentTabId);
  }
});

// Keyboard shortcut: Ctrl+T for new tab (fallback for direct document event)
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "t") {
    e.preventDefault();
    createNewTab();
  }
  
  // Standard browser shortcuts: Ctrl+Tab for next tab
  if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
    e.preventDefault();
    const currentIndex = tabs.findIndex(tab => tab.id === currentTabId);
    if (currentIndex !== -1 && currentIndex < tabs.length - 1) {
      switchTab(tabs[currentIndex + 1].id);
    } else if (currentIndex !== -1 && currentIndex === tabs.length - 1) {
      // Wrap around to first tab
      switchTab(tabs[0].id);
    }
  }
  
  // Standard browser shortcuts: Ctrl+Shift+Tab for previous tab
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Tab") {
    e.preventDefault();
    const currentIndex = tabs.findIndex(tab => tab.id === currentTabId);
    if (currentIndex > 0) {
      switchTab(tabs[currentIndex - 1].id);
    } else if (currentIndex === 0 && tabs.length > 0) {
      // Wrap around to last tab
      switchTab(tabs[tabs.length - 1].id);
    }
  }
  
  // Ctrl+W for close tab (standard browser shortcut)
  if ((e.ctrlKey || e.metaKey) && e.key === "w") {
    e.preventDefault();
    if (currentTabId !== null) {
      closeTab(currentTabId);
    }
  }
});

// ============================================
// AD-BLOCKER STATISTICS
// ============================================

/**
 * Update ad-blocker stats display
 */
async function updateBlockerStats() {
  try {
    if (!window.adBlocker) return; // API not available yet
    
    // Get stats from main process
    const stats = await window.adBlocker.getStats();
    
    // Update UI
    if (blockerStats && blockerCount) {
      const count = stats ? stats.count : 0;
      blockerCount.textContent = count;
      
      // Show indicator when ads/trackers are blocked
      if (count > 0) {
        blockerStats.classList.add('active');
      } else {
        blockerStats.classList.remove('active');
      }
    }
  } catch (error) {
    console.warn('[AD-BLOCKER] Error updating stats:', error);
  }
}

/**
 * Show ad-blocker statistics in console
 */
async function showBlockerStats() {
  try {
    if (window.adBlocker) {
      await window.adBlocker.logStats();
    }
  } catch (error) {
    console.warn('[AD-BLOCKER] Error logging stats:', error);
  }
}

// Update stats display periodically (only after setup)
const statsInterval = setInterval(() => {
  if (window.adBlocker) {
    updateBlockerStats();
  }
}, 500); // Update every 500ms for real-time feedback

/**
 * Toggle ad-blocking on/off
 */
async function toggleAdBlocking() {
  try {
    if (!window.adBlocker) {
      console.warn('[AD-BLOCKER] API not available');
      return;
    }
    
    // Get current state
    const currentState = await window.adBlocker.isEnabled();
    const newState = !currentState.enabled;
    
    // Toggle blocking
    const result = await window.adBlocker.toggleBlocking(newState);
    
    // Update UI
    if (blockerToggle) {
      if (result.enabled) {
        blockerToggle.classList.remove('disabled');
        blockerToggle.title = 'Ad-blocker is ON - click to disable';
      } else {
        blockerToggle.classList.add('disabled');
        blockerToggle.title = 'Ad-blocker is OFF - click to enable';
      }
    }
    
    console.log(`[AD-BLOCKER] ${result.enabled ? 'ENABLED' : 'DISABLED'}`);
  } catch (error) {
    console.warn('[AD-BLOCKER] Error toggling:', error);
  }
}

// Initialize blocker state on DOM ready
window.addEventListener("DOMContentLoaded", async () => {
  createNewTab("https://www.google.com");
  
  // ============================================
  // LISTEN FOR NEW TAB CREATION REQUESTS
  // ============================================
  
  /**
   * Listen for create-new-tab messages from the main process
   * Fired when:
   * - A link with target="_blank" is clicked
   * - window.open() is called from a webview
   * - setWindowOpenHandler intercepts a new window request
   */
  if (window.ipcRenderer) {
    window.ipcRenderer.on('create-new-tab', (event, details) => {
      const url = details.url || "https://www.google.com";
      console.log(`[NEW-TAB] Creating new tab from IPC message: ${url}`);
      createNewTab(url);
    });
  }
  
  // Setup blocker stats click handler
  if (blockerStats) {
    blockerStats.addEventListener('click', async () => {
      await showBlockerStats();
    });
  }
  
  // Setup blocker toggle click handler
  if (blockerToggle) {
    blockerToggle.addEventListener('click', async () => {
      await toggleAdBlocking();
    });
    
    // Initialize toggle state
    if (window.adBlocker) {
      const state = await window.adBlocker.isEnabled();
      if (!state.enabled) {
        blockerToggle.classList.add('disabled');
      }
    }
  }
  
  // Initial stats update
  setTimeout(updateBlockerStats, 1000);
});

// ============================================
// THEME TOGGLE
// ============================================

/**
 * Get saved theme from localStorage or return default
 */
function getSavedTheme() {
  const saved = localStorage.getItem('theme');
  return saved || 'dark-theme';
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  document.body.classList.remove('dark-theme', 'light-theme');
  document.body.classList.add(theme);
  
  // Update icon based on theme
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    if (theme === 'dark-theme') {
      // Moon icon for dark theme
      themeIcon.setAttribute('d', 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z');
    } else {
      // Sun icon for light theme
      themeIcon.setAttribute('d', 'M12 2a10 10 0 1 0 20 0 10 10 0 0 0-20 0zm0-3a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0V2a1 1 0 0 1 1-1zm9 1a1 1 0 0 1 0 2h-2a1 1 0 0 1 0-2h2zM12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z');
    }
  }
}

/**
 * Toggle theme between dark and light
 */
function toggleTheme() {
  const currentTheme = getSavedTheme();
  const newTheme = currentTheme === 'dark-theme' ? 'light-theme' : 'dark-theme';
  
  // Save to localStorage
  localStorage.setItem('theme', newTheme);
  
  // Apply theme
  applyTheme(newTheme);
}

// Initialize theme on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  const savedTheme = getSavedTheme();
  applyTheme(savedTheme);
  
  // Setup theme toggle button
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
}, { once: true });


// Get all UI elements
const urlBar = document.getElementById("urlBar");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");
const newTabBtn = document.getElementById("newTabBtn");
const tabsContainer = document.getElementById("tabsContainer");
const browserContainer = document.getElementById("browserContainer");

// Tabs state
let tabs = [];
let currentTabId = null;
let tabIdCounter = 0;

// State to track if we're programmatically updating the URL bar
let isUpdatingUrl = false;

// Function to update URL bar with current page URL
function updateUrlBar(url) {
  isUpdatingUrl = true;
  urlBar.value = url;
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
  
  // Create webview element
  const webview = document.createElement("webview");
  webview.id = `browserView-${tabId}`;
  webview.src = url;
  webview.classList.add("active");
  browserContainer.appendChild(webview);
  
  // Setup webview event listeners
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
  const currentWebview = getCurrentWebview();
  if (currentWebview) {
    updateUrlBar(currentWebview.src);
  }
  renderTabs();
}

// Function to close a tab
function closeTab(tabId) {
  const tabIndex = tabs.findIndex(tab => tab.id === tabId);
  if (tabIndex !== -1) {
    const tab = tabs[tabIndex];
    tab.webview.remove();
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
    tabEl.innerHTML = `
      <span class="tab-title" title="${tab.title}">${tab.title}</span>
      <button class="tab-close">×</button>
    `;
    
    // Tab click to switch
    tabEl.addEventListener("click", (e) => {
      if (!e.target.classList.contains("tab-close")) {
        switchTab(tab.id);
      }
    });
    
    // Close button click
    const closeBtn = tabEl.querySelector(".tab-close");
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    
    tabsContainer.appendChild(tabEl);
  });
}

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
});

// Initialize: Create first tab
window.addEventListener("DOMContentLoaded", () => {
  createNewTab("https://www.google.com");
});

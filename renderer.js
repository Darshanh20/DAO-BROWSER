// Get all UI elements
const urlBar = document.getElementById("urlBar");
const browserView = document.getElementById("browserView");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");

// Track if we're programmatically updating the URL to avoid triggering navigation
let isUpdatingUrl = false;

// Get IPC from electron
const { ipcRenderer } = require("electron");

// Listen for URL updates from main process
ipcRenderer.on("url-updated", (event, url) => {
  console.log("URL updated to:", url);
  
  // Programmatically update the URL bar without triggering a navigation
  isUpdatingUrl = true;
  urlBar.value = url;
  isUpdatingUrl = false;
  
  // Update button states based on navigation history
  updateButtonStates();
});

// Listen for loading state changes
ipcRenderer.on("loading-started", () => {
  console.log("Page loading started");
  urlBar.style.opacity = "0.7";
});

ipcRenderer.on("loading-stopped", () => {
  console.log("Page loading stopped");
  urlBar.style.opacity = "1";
  updateButtonStates();
});

// Handle URL input when user presses Enter
urlBar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
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
    
    // Send navigation request to main process
    ipcRenderer.send("navigate-to", url);
  }
});

// Back button - send IPC message to main process
backBtn.addEventListener("click", () => {
  ipcRenderer.send("go-back");
});

// Forward button - send IPC message to main process
forwardBtn.addEventListener("click", () => {
  ipcRenderer.send("go-forward");
});

// Reload button - send IPC message to main process
reloadBtn.addEventListener("click", () => {
  ipcRenderer.send("reload");
});

// Update button states based on navigation availability
function updateButtonStates() {
  // Note: We can't directly check navigation state from renderer,
  // so we'll implement a simple approach or request from main
  // For now, buttons are always enabled - future improvement could track state
  backBtn.disabled = false;
  forwardBtn.disabled = false;
}

// Initialize: Get current URL on load
window.addEventListener("DOMContentLoaded", async () => {
  const currentUrl = await ipcRenderer.invoke("get-current-url");
  if (currentUrl) {
    urlBar.value = currentUrl;
  }
});

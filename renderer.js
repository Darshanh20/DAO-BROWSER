// Get all UI elements
const urlBar = document.getElementById("urlBar");
const browserView = document.getElementById("browserView");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const reloadBtn = document.getElementById("reloadBtn");

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
    browserView.src = url;
  }
});

// Back button - go to previous page
backBtn.addEventListener("click", () => {
  if (browserView.canGoBack()) {
    browserView.goBack();
  }
});

// Forward button - go to next page
forwardBtn.addEventListener("click", () => {
  if (browserView.canGoForward()) {
    browserView.goForward();
  }
});

// Reload button - refresh current page
reloadBtn.addEventListener("click", () => {
  browserView.reload();
});

// Preload script for capturing keyboard events
window.addEventListener("DOMContentLoaded", () => {
  console.log("Browser preload loaded");
});

// Global keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Don't trigger shortcuts if typing in input field (except for address bar)
  const isInInput = document.activeElement && (
    document.activeElement.tagName === "INPUT" || 
    document.activeElement.tagName === "TEXTAREA"
  );
  
  const isAddressBar = document.activeElement && 
    document.activeElement.id === "urlBar";
  
  // Ctrl+T or Cmd+T: New Tab
  if ((e.ctrlKey || e.metaKey) && e.key === "t" && !isInInput) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-new-tab"));
    return;
  }
  
  // Alt+Left or Cmd+Left: Back
  if ((e.altKey && e.key === "ArrowLeft") || (e.metaKey && e.key === "ArrowLeft")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-back"));
    return;
  }
  
  // Alt+Right or Cmd+Right: Forward
  if ((e.altKey && e.key === "ArrowRight") || (e.metaKey && e.key === "ArrowRight")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-forward"));
    return;
  }
  
  // Ctrl+R or Cmd+R: Reload (not in address bar)
  if ((e.ctrlKey || e.metaKey) && e.key === "r" && !isAddressBar) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-reload"));
    return;
  }
  
  // Ctrl+L or Cmd+L: Focus address bar
  if ((e.ctrlKey || e.metaKey) && e.key === "l") {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-focus-address"));
    return;
  }
  
  // Ctrl+Tab or Cmd+Tab: Next tab
  if ((e.ctrlKey && e.key === "Tab") || (e.metaKey && e.key === "Tab")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-next-tab"));
    return;
  }
  
  // Ctrl+Shift+Tab or Cmd+Shift+Tab: Previous tab
  if ((e.ctrlKey && e.shiftKey && e.key === "Tab") || (e.metaKey && e.shiftKey && e.key === "Tab")) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-prev-tab"));
    return;
  }
  
  // Ctrl+W or Cmd+W: Close current tab
  if ((e.ctrlKey || e.metaKey) && e.key === "w" && !isInInput) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("keyboard-close-tab"));
    return;
  }
});

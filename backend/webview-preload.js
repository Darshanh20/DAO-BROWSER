/**
 * Webview Preload Script
 * Injected into each webview to handle new-window interception
 */

// Intercept window.open calls
const originalOpen = window.open;
window.open = function(url, target, features) {
  console.log('[WEBVIEW-PRELOAD] window.open called: ' + url);
  
  if (target === '_blank' || target === '_new') {
    // Dispatch custom event on document
    const event = new CustomEvent('open-new-window', { 
      detail: { url: url } 
    });
    window.dispatchEvent(event);
    return null;
  }
  
  return originalOpen.apply(window, arguments);
};

// Intercept link clicks with target="_blank"
document.addEventListener('click', function(e) {
  const link = e.target.closest('a[href]');
  if (link && link.target === '_blank') {
    const url = link.href;
    console.log('[WEBVIEW-PRELOAD] target="_blank" link clicked: ' + url);
    
    // Dispatch event
    const event = new CustomEvent('open-new-window', { 
      detail: { url: url } 
    });
    window.dispatchEvent(event);
    
    // Prevent default navigation
    e.preventDefault();
  }
}, true);

// Listen for the custom event and trigger the native new-window event
window.addEventListener('open-new-window', function(e) {
  const url = e.detail.url;
  console.log('[WEBVIEW-PRELOAD] Triggering new-window event for: ' + url);
  
  // Create and dispatch a new-window-like event
  const newWindowEvent = new CustomEvent('new-window', {
    detail: { url: url, bubbles: true }
  });
  document.dispatchEvent(newWindowEvent);
});

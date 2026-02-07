// ==================== FIND BAR MODULE ====================

class FindBar {
    constructor() {
        this.findBar = document.getElementById('find-bar');
        this.findInput = document.getElementById('find-input');
        this.findCounter = document.getElementById('find-counter');
        this.findCaseBtn = document.getElementById('find-case-btn');
        this.prevBtn = document.getElementById('find-prev-btn');
        this.nextBtn = document.getElementById('find-next-btn');
        this.closeBtn = document.getElementById('find-close-btn');

        if (!this.findBar || !this.findInput || !this.findCounter ||
            !this.findCaseBtn || !this.prevBtn || !this.nextBtn || !this.closeBtn) {
            console.error('FindBar: Required elements not found');
            return;
        }

        // State
        this.isVisible = false;
        this.currentMatch = 0;
        this.totalMatches = 0;
        this.requestId = null;
        this.caseSensitive = false;  // Default: case-insensitive search

        // DOM search state
        this.searchRanges = [];
        this.currentRangeIndex = -1;
        this.highlightClass = 'findbar-highlight';
        this.activeHighlightClass = 'findbar-active';
        this.searchTimeout = null;

        this.init();
    }

    init() {
        // Input event - search as user types
        this.findInput.addEventListener('input', () => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => this.performSearch(), 150);
        });

        // Keyboard navigation
        this.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.shiftKey ? this.findPrevious() : this.findNext();
            } else if (e.key === 'Escape') {
                this.close();
            } else if (e.altKey && e.key === 'c') {
                // Alt+C toggle case-sensitivity
                e.preventDefault();
                this.toggleCaseSensitive();
            }
        });

        // Case-sensitive button
        this.findCaseBtn.addEventListener('click', () => {
            this.toggleCaseSensitive();
        });

        // Button events
        this.prevBtn.addEventListener('click', () => this.findPrevious());
        this.nextBtn.addEventListener('click', () => this.findNext());
        this.closeBtn.addEventListener('click', () => this.close());

        this.addStyles();
    }

    toggleCaseSensitive() {
        this.caseSensitive = !this.caseSensitive;
        
        // Update button state
        if (this.findCaseBtn) {
            if (this.caseSensitive) {
                this.findCaseBtn.classList.add('active');
                this.findCaseBtn.title = 'Case-sensitive search (enabled) - Alt+C';
            } else {
                this.findCaseBtn.classList.remove('active');
                this.findCaseBtn.title = 'Case-insensitive search (enabled) - Alt+C';
            }
        }
        
        // Re-run search with new case sensitivity setting
        if (this.findInput.value) {
            this.performSearch();
        }
    }

    addStyles() {
        if (document.getElementById('findbar-styles')) return;

        const style = document.createElement('style');
        style.id = 'findbar-styles';
        style.textContent = `
            .${this.highlightClass} {
                background-color: yellow !important;
                color: black !important;
            }
            .${this.activeHighlightClass} {
                background-color: orange !important;
                color: black !important;
            }
        `;
        document.head.appendChild(style);
    }

    open() {
        if (!this.findBar || !this.findInput) {
            console.error('[FindBar.open] Required elements not found');
            return;
        }

        console.log('[FindBar.open] Opening find bar...');

        if (this.isVisible) {
            console.log('[FindBar.open] Find bar already visible, focusing input');
            this.findInput.focus();
            this.findInput.select();
            return;
        }

        this.isVisible = true;
        console.log('[FindBar.open] Setting isVisible = true');
        
        // Log visibility debugging info
        console.log('[FindBar.open] Find bar element:', this.findBar);
        console.log('[FindBar.open] Current display:', window.getComputedStyle(this.findBar).display);
        console.log('[FindBar.open] Current visibility:', window.getComputedStyle(this.findBar).visibility);
        console.log('[FindBar.open] Current z-index:', window.getComputedStyle(this.findBar).zIndex);
        
        this.findBar.classList.remove('hidden');
        console.log('[FindBar.open] Removed hidden class');
        
        // Verify visibility after DOM change
        setTimeout(() => {
            console.log('[FindBar.open] POST-SHOW - display:', window.getComputedStyle(this.findBar).display);
            console.log('[FindBar.open] POST-SHOW - visibility:', window.getComputedStyle(this.findBar).visibility);
            console.log('[FindBar.open] POST-SHOW - z-index:', window.getComputedStyle(this.findBar).zIndex);
        }, 50);
        
        this.findInput.focus();
        this.findInput.select();
        console.log('[FindBar.open] Focused find input');

        if (this.findInput.value) {
            console.log('[FindBar.open] Input has value, performing search');
            this.performSearch();
        }
    }

    close() {
        if (!this.isVisible) return;

        this.isVisible = false;
        this.findBar.classList.add('hidden');
        this.stopWebViewSearch();
        this.clearHighlights();
        this.resetUI();
    }

    performSearch() {
        const query = this.findInput.value;
        console.log('[FindBar.performSearch] Starting search for:', query);

        if (!query) {
            console.log('[FindBar.performSearch] Query is empty, clearing search');
            this.stopWebViewSearch();
            this.clearHighlights();
            this.resetUI();
            return;
        }

        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && !welcomeScreen.classList.contains('hidden');
        
        console.log('[FindBar.performSearch] Active tab:', activeTab?.id);
        console.log('[FindBar.performSearch] Welcome screen visible:', isWelcomeVisible);
        console.log('[FindBar.performSearch] Webview exists:', !!activeTab?.webview);
        console.log('[FindBar.performSearch] Webview src:', activeTab?.webview?.src);

        if (!activeTab || !activeTab.webview || isWelcomeVisible) {
            console.log('[FindBar.performSearch] Using DOM search (landing page)');
            this.performDOMSearch(query);
        } else {
            console.log('[FindBar.performSearch] Using WebView search');
            this.performWebViewSearch(query, activeTab.webview);
        }
    }

    performDOMSearch(query) {
        console.log('[FindBar.performDOMSearch] Starting DOM search for:', query);
        this.clearHighlights();

        // Detect if we're on landing page (welcome screen visible) or fallback scenario
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && !welcomeScreen.classList.contains('hidden');
        const mainContent = document.getElementById('main-content');
        
        console.log('[FindBar.performDOMSearch] Welcome screen exists:', !!welcomeScreen);
        console.log('[FindBar.performDOMSearch] Welcome screen visible:', isWelcomeVisible);
        console.log('[FindBar.performDOMSearch] Main content exists:', !!mainContent);
        
        // Choose search root: welcome screen if visible, otherwise main content, then body
        let searchRoot = null;
        if (isWelcomeVisible && welcomeScreen) {
            searchRoot = welcomeScreen;
            console.log('[FindBar.performDOMSearch] Using welcome-screen as root');
        } else if (mainContent) {
            searchRoot = mainContent;
            console.log('[FindBar.performDOMSearch] Using main-content as root');
        } else {
            searchRoot = document.body;
            console.log('[FindBar.performDOMSearch] Using body as fallback root');
        }
        
        if (!searchRoot) {
            console.error('[FindBar.performDOMSearch] No valid search root found');
            this.totalMatches = 0;
            this.updateCounter();
            return;
        }

        // Collect all text nodes using TreeWalker
        console.log('[FindBar.performDOMSearch] Collecting text nodes from root...');
        const textNodes = this.collectTextNodes(searchRoot);
        console.log('[FindBar.performDOMSearch] Found text nodes:', textNodes.length);
        
        if (textNodes.length === 0) {
            console.warn('[FindBar.performDOMSearch] No text nodes found');
            this.totalMatches = 0;
            this.updateCounter();
            return;
        }

        // Build normalized text stream with bidirectional mapping to text nodes
        console.log('[FindBar.performDOMSearch] Building normalized text stream...');
        const textStream = this.buildNormalizedTextStream(textNodes);
        if (!textStream || textStream.normalizedText.length === 0) {
            console.warn('[FindBar.performDOMSearch] Text stream is empty or invalid');
            this.totalMatches = 0;
            this.updateCounter();
            return;
        }
        
        console.log('[FindBar.performDOMSearch] Text stream length:', textStream.normalizedText.length);

        // Prepare search query and text based on case sensitivity
        let searchQuery = this.caseSensitive ? query : query.toLowerCase();
        let searchText = this.caseSensitive ? textStream.originalCaseText : textStream.normalizedText;
        
        console.log('[FindBar.performDOMSearch] Search query:', searchQuery);
        console.log('[FindBar.performDOMSearch] Case sensitive:', this.caseSensitive);

        // Find all matches in text
        const matchPositions = [];
        let pos = 0;

        while (pos < searchText.length) {
            const index = searchText.indexOf(searchQuery, pos);
            if (index === -1) break;
            matchPositions.push(index);
            pos = index + 1;
        }
        
        console.log('[FindBar.performDOMSearch] Matches found:', matchPositions.length);

        if (matchPositions.length === 0) {
            console.log('[FindBar.performDOMSearch] No matches found');
            this.totalMatches = 0;
            this.updateCounter();
            return;
        }

        // Create ranges for each match and apply highlights
        // Process in REVERSE order to preserve offsets when a text node has multiple matches
        this.searchRanges = [];
        const marks = [];

        for (let i = matchPositions.length - 1; i >= 0; i--) {
            const matchStart = matchPositions[i];
            const matchEnd = matchStart + searchQuery.length;

            try {
                // Convert positions to DOM ranges
                const range = this.positionsToRange(textStream, matchStart, matchEnd);
                if (!range) continue;

                // Safely apply highlight without using surroundContents
                const mark = this.applyHighlightToRange(range);
                if (mark) {
                    marks.unshift(mark);  // Prepend to maintain original order
                }

            } catch (error) {
                console.warn('Failed to create highlight:', error);
            }
        }

        this.searchRanges = marks;
        this.totalMatches = this.searchRanges.length;

        if (this.totalMatches > 0) {
            this.currentRangeIndex = 0;
            this.currentMatch = 1;
            this.setActiveHighlight(0);
        } else {
            this.currentMatch = 0;
            this.currentRangeIndex = -1;
        }

        this.updateCounter();
    }

    buildNormalizedTextStream(textNodes) {
        let normalizedText = '';
        let originalCaseText = '';
        const positionMap = [];

        textNodes.forEach(node => {
            const originalText = node.nodeValue;
            let i = 0;

            while (i < originalText.length) {
                let char = originalText[i];
                let charStart = i;
                let charEnd = i + 1;

                // Normalize whitespace characters
                if (char === '\u00A0' || char === '\r' || char === '\n' || char === '\t') {
                    char = ' ';
                } else if (char === '\r' && i + 1 < originalText.length && originalText[i + 1] === '\n') {
                    // CRLF is treated as a single whitespace
                    char = ' ';
                    charEnd = i + 2;  // Span both characters
                    i++;  // Skip the LF
                }

                // Skip consecutive spaces and leading spaces
                if (char === ' ') {
                    if (normalizedText.length === 0 || normalizedText[normalizedText.length - 1] === ' ') {
                        i++;
                        continue;
                    }
                    
                    // For the space we keep, extend charEnd to skip subsequent whitespace
                    let j = i + 1;
                    while (j < originalText.length) {
                        const nextChar = originalText[j];
                        if (nextChar === ' ' || nextChar === '\u00A0' || nextChar === '\r' || nextChar === '\n' || nextChar === '\t') {
                            // These will be part of the current space's boundary
                            j++;
                        } else {
                            break;
                        }
                    }
                    charEnd = j;  // Extend to skip all following whitespace
                }

                // Add character to both normalized and original-case texts and track position
                positionMap.push({
                    node: node,
                    offsetStart: charStart,
                    offsetEnd: charEnd,
                    char: char
                });

                normalizedText += char.toLowerCase();
                originalCaseText += char;  // Keep original case
                i++;
            }
        });

        // Trim trailing spaces from both versions
        while (normalizedText.endsWith(' ')) {
            normalizedText = normalizedText.slice(0, -1);
            originalCaseText = originalCaseText.slice(0, -1);
            positionMap.pop();
        }

        return {
            normalizedText: normalizedText,
            originalCaseText: originalCaseText,
            positionMap: positionMap,
            textNodes: textNodes
        };
    }

    getOriginalCharIndex(originalText, processedText, processedIndex) {
        // No longer used in new implementation
        return 0;
    }

    positionsToRange(textStream, startPos, endPos) {
        const positionMap = textStream.positionMap;

        if (startPos < 0 || endPos > positionMap.length) {
            return null;
        }

        const startMapping = positionMap[startPos];
        const endMapping = positionMap[endPos - 1];

        if (!startMapping || !endMapping) {
            return null;
        }

        const range = document.createRange();

        try {
            if (startMapping.node === endMapping.node) {
                // Match within single node
                range.setStart(startMapping.node, startMapping.offsetStart);
                range.setEnd(endMapping.node, endMapping.offsetEnd);
            } else {
                // Match spans multiple nodes
                range.setStart(startMapping.node, startMapping.offsetStart);
                range.setEnd(endMapping.node, endMapping.offsetEnd);
            }

            return range;
        } catch (error) {
            console.warn('Range creation failed:', error);
            return null;
        }
    }

    applyHighlightToRange(range) {
        try {
            const mark = document.createElement('mark');
            mark.className = this.highlightClass;
            mark.setAttribute('data-findbar', '1');

            // Try surroundContents first - it's more stable for DOM structure
            try {
                range.surroundContents(mark);
                return mark;
            } catch (e1) {
                // If surroundContents fails, try extractContents approach
                try {
                    const contents = range.extractContents();
                    mark.appendChild(contents);
                    range.insertNode(mark);
                    return mark;
                } catch (e2) {
                    // Last resort: manually wrap the range
                    console.warn('Standard range methods failed, using manual wrapping');
                    if (this.manuallyWrapRange(range, mark)) {
                        return mark;
                    }
                    return null;
                }
            }
        } catch (error) {
            console.warn('Failed to apply highlight:', error);
            return null;
        }
    }

    manuallyWrapRange(range, mark) {
        // Manually wrap the range content without using extractContents/surroundContents
        // This is a last-resort approach for complex ranges
        try {
            const startContainer = range.startContainer;
            const startOffset = range.startOffset;
            const endContainer = range.endContainer;
            const endOffset = range.endOffset;

            if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
                // Single text node case
                const text = startContainer.nodeValue;
                const before = text.substring(0, startOffset);
                const matched = text.substring(startOffset, endOffset);
                const after = text.substring(endOffset);

                const parent = startContainer.parentNode;
                if (!parent) return false;

                const beforeNode = before ? document.createTextNode(before) : null;
                const afterNode = after ? document.createTextNode(after) : null;

                mark.appendChild(document.createTextNode(matched));

                if (beforeNode) parent.insertBefore(beforeNode, startContainer);
                parent.insertBefore(mark, startContainer);
                if (afterNode) parent.insertBefore(afterNode, startContainer);
                parent.removeChild(startContainer);

                return true;
            }
            
            return false;
        } catch (error) {
            console.warn('Manual wrapping failed:', error);
            return false;
        }
    }

    collectTextNodes(root) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    // Skip find bar itself
                    if (node.parentElement &&
                        (node.parentElement.closest('#find-bar') ||
                         node.parentElement.hasAttribute('data-findbar'))) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Skip invisible elements
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Skip script, style, etc.
                    const tagName = parent.tagName;
                    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Only accept nodes with actual text
                    if (!node.nodeValue || !node.nodeValue.trim()) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        return textNodes;
    }

    setActiveHighlight(index) {
        // Remove active class from all
        this.searchRanges.forEach(mark => {
            if (mark && mark.parentNode) {
                mark.classList.remove(this.activeHighlightClass);
                mark.classList.add(this.highlightClass);
            }
        });

        // Add active class to current
        if (index >= 0 && index < this.searchRanges.length) {
            const activeMark = this.searchRanges[index];
            if (activeMark && activeMark.parentNode) {
                activeMark.classList.remove(this.highlightClass);
                activeMark.classList.add(this.activeHighlightClass);

                activeMark.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }

    clearHighlights() {
        const welcomeScreen = document.getElementById('welcome-screen');
        
        if (welcomeScreen) {
            // Find all highlight marks in welcome screen
            const marks = welcomeScreen.querySelectorAll('mark[data-findbar="1"]');
            
            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (!parent) return;

                // Extract children and insert them before the mark
                while (mark.firstChild) {
                    parent.insertBefore(mark.firstChild, mark);
                }

                // Remove the now-empty mark element
                parent.removeChild(mark);
            });

            // Normalize to merge adjacent text nodes
            welcomeScreen.normalize();
        }

        // Always reset search state, regardless of welcome screen existence
        this.searchRanges = [];
        this.currentRangeIndex = -1;
    }

    performWebViewSearch(query, webview) {
        console.log('[FindBar.performWebViewSearch] Starting webview search for:', query);
        this.clearHighlights();

        // Validate webview
        if (!webview) {
            console.error('[FindBar.performWebViewSearch] Webview is null or undefined');
            this.performDOMSearch(query);
            return;
        }
        
        console.log('[FindBar.performWebViewSearch] Webview src:', webview.src);
        console.log('[FindBar.performWebViewSearch] Webview loaded:', webview.src && webview.src !== 'about:blank');
        
        if (typeof webview.findInPage !== 'function') {
            console.error('[FindBar.performWebViewSearch] findInPage is not available on webview, falling back to DOM search');
            this.performDOMSearch(query);
            return;
        }
        
        // Check if webview has content loaded
        if (!webview.src || webview.src === 'about:blank') {
            console.warn('[FindBar.performWebViewSearch] Webview has no content loaded, falling back to DOM search');
            this.performDOMSearch(query);
            return;
        }

        // Stop previous search
        if (this.requestId !== null) {
            console.log('[FindBar.performWebViewSearch] Stopping previous search (requestId:', this.requestId, ')');
            try {
                webview.stopFindInPage('clearSelection');
                console.log('[FindBar.performWebViewSearch] Previous search stopped');
            } catch (e) {
                console.warn('[FindBar.performWebViewSearch] Error stopping previous search:', e.message);
            }
        }

        this.totalMatches = 0;
        this.currentMatch = 0;
        this.findCounter.textContent = 'Searching...';
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;

        try {
            console.log('[FindBar.performWebViewSearch] Setting up webview listener');
            this.setupWebViewListener(webview);

            console.log('[FindBar.performWebViewSearch] Calling webview.findInPage with query:', query, ', caseSensitive:', this.caseSensitive);
            this.requestId = webview.findInPage(query, {
                forward: true,
                findNext: false,
                matchCase: this.caseSensitive
            });
            
            console.log('[FindBar.performWebViewSearch] findInPage returned requestId:', this.requestId);

            // Set timeout for search result in case event doesn't fire
            setTimeout(() => {
                if (this.findCounter.textContent === 'Searching...') {
                    console.warn('[FindBar.performWebViewSearch] Search timeout - no results after 2 seconds');
                    this.totalMatches = 0;
                    this.currentMatch = 0;
                    this.updateCounter();
                }
            }, 2000);

        } catch (error) {
            console.error('[FindBar.performWebViewSearch] Error during findInPage:', error);
            console.error('[FindBar.performWebViewSearch] Error type:', error.name);
            console.error('[FindBar.performWebViewSearch] Error message:', error.message);
            
            // Fallback to DOM search on error
            console.log('[FindBar.performWebViewSearch] Falling back to DOM search due to error');
            this.performDOMSearch(query);
        }
    }

    setupWebViewListener(webview) {
        if (this._webViewHandler) {
            try {
                webview.removeEventListener('found-in-page', this._webViewHandler);
            } catch (e) {}
        }

        this._webViewHandler = (e) => {
            if (e.result && e.result.finalUpdate) {
                this.totalMatches = e.result.matches || 0;
                this.currentMatch = e.result.activeMatchOrdinal || 0;
                this.updateCounter();
            }
        };

        webview.addEventListener('found-in-page', this._webViewHandler);
    }

    findNext() {
        const query = this.findInput.value;
        if (!query) return;

        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && !welcomeScreen.classList.contains('hidden');

        if (!activeTab || !activeTab.webview || isWelcomeVisible) {
            // DOM search navigation
            if (this.searchRanges.length === 0) return;

            this.currentRangeIndex = (this.currentRangeIndex + 1) % this.searchRanges.length;
            this.currentMatch = this.currentRangeIndex + 1;
            this.setActiveHighlight(this.currentRangeIndex);
            this.updateCounter();
        } else {
            // WebView search navigation
            if (typeof activeTab.webview.findInPage === 'function') {
                activeTab.webview.findInPage(query, {
                    forward: true,
                    findNext: true,
                    matchCase: false
                });
            }
        }
    }

    findPrevious() {
        const query = this.findInput.value;
        if (!query) return;

        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && !welcomeScreen.classList.contains('hidden');

        if (!activeTab || !activeTab.webview || isWelcomeVisible) {
            // DOM search navigation
            if (this.searchRanges.length === 0) return;

            this.currentRangeIndex = this.currentRangeIndex - 1;
            if (this.currentRangeIndex < 0) {
                this.currentRangeIndex = this.searchRanges.length - 1;
            }
            this.currentMatch = this.currentRangeIndex + 1;
            this.setActiveHighlight(this.currentRangeIndex);
            this.updateCounter();
        } else {
            // WebView search navigation
            if (typeof activeTab.webview.findInPage === 'function') {
                activeTab.webview.findInPage(query, {
                    forward: false,
                    findNext: true,
                    matchCase: false
                });
            }
        }
    }

    stopWebViewSearch() {
        const activeTab = this.getActiveTab();
        if (activeTab && activeTab.webview && typeof activeTab.webview.stopFindInPage === 'function') {
            try {
                activeTab.webview.stopFindInPage('clearSelection');
            } catch (e) {}
        }
        this.requestId = null;
    }

    updateCounter() {
        if (this.totalMatches === 0) {
            this.findCounter.textContent = 'No matches';
            this.findCounter.classList.add('no-matches');
            this.findInput.classList.add('no-matches');
            this.prevBtn.disabled = true;
            this.nextBtn.disabled = true;
        } else {
            this.findCounter.textContent = `${this.currentMatch} of ${this.totalMatches}`;
            this.findCounter.classList.remove('no-matches');
            this.findInput.classList.remove('no-matches');
            this.prevBtn.disabled = false;
            this.nextBtn.disabled = false;
        }
    }

    resetUI() {
        this.currentMatch = 0;
        this.totalMatches = 0;
        this.findCounter.textContent = '0 of 0';
        this.findCounter.classList.remove('no-matches');
        this.findInput.classList.remove('no-matches');
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
    }

    getActiveTab() {
        if (typeof tabs === 'undefined' || typeof activeTabId === 'undefined') {
            return null;
        }
        return tabs.find(t => t.id === activeTabId);
    }
}

// Initialize find bar
function initializeFindBar() {
    const findBarElement = document.getElementById('find-bar');
    const findInputElement = document.getElementById('find-input');
    const findCounterElement = document.getElementById('find-counter');
    const findPrevBtnElement = document.getElementById('find-prev-btn');
    const findNextBtnElement = document.getElementById('find-next-btn');
    const findCloseBtnElement = document.getElementById('find-close-btn');

    if (!findBarElement || !findInputElement || !findCounterElement ||
        !findPrevBtnElement || !findNextBtnElement || !findCloseBtnElement) {
        console.error('[FindBar] Required DOM elements not found - retrying in 100ms');
        console.error('  find-bar:', !!findBarElement);
        console.error('  find-input:', !!findInputElement);
        console.error('  find-counter:', !!findCounterElement);
        console.error('  find-prev-btn:', !!findPrevBtnElement);
        console.error('  find-next-btn:', !!findNextBtnElement);
        console.error('  find-close-btn:', !!findCloseBtnElement);
        
        // Retry after a short delay
        setTimeout(initializeFindBar, 100);
        return;
    }

    console.log('[FindBar] All required elements found, initializing...');
    window.findBar = new FindBar();
    console.log('[FindBar] Initialization complete - window.findBar available');
}

if (document.readyState === 'loading') {
    console.log('[FindBar] DOM still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[FindBar] DOMContentLoaded fired, initializing...');
        initializeFindBar();
    });
} else {
    console.log('[FindBar] DOM already loaded, initializing immediately...');
    initializeFindBar();
}

// Ensure window.findBar is accessible from other modules
window.ensureFindBar = function() {
    return window.findBar;
};

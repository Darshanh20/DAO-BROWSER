// ==================== FIND BAR MODULE - Chrome-Style ====================
// Complete find-in-page implementation for Electron browser

class FindBar {
    constructor() {
        // DOM Elements
        this.findBar = document.getElementById('find-bar');
        this.findInput = document.getElementById('find-input');
        this.findCounter = document.getElementById('find-counter');
        this.findCaseBtn = document.getElementById('find-case-btn');
        this.prevBtn = document.getElementById('find-prev-btn');
        this.nextBtn = document.getElementById('find-next-btn');
        this.closeBtn = document.getElementById('find-close-btn');
        this.inputContainer = this.findInput?.parentElement;

        // Validate required elements
        if (!this.findBar || !this.findInput || !this.findCounter ||
            !this.findCaseBtn || !this.prevBtn || !this.nextBtn || !this.closeBtn) {
            console.error('[FindBar] Required elements not found, retrying...');
            return;
        }

        // State
        this.isVisible = false;
        this.currentMatch = 0;
        this.totalMatches = 0;
        this.requestId = null;
        this.caseSensitive = false;
        this.lastQuery = '';
        this.searchTimeout = null;
        this.isSearching = false;

        // DOM search state (for welcome screen)
        this.searchRanges = [];
        this.currentRangeIndex = -1;
        this.highlightClass = 'findbar-highlight';
        this.activeHighlightClass = 'findbar-active';

        // Webview event handler reference
        this._webViewHandler = null;
        this._currentWebview = null;

        this.init();
        console.log('[FindBar] Initialized successfully');
    }

    init() {
        // Input event - search as user types (debounced)
        this.findInput.addEventListener('input', () => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.performSearch();
            }, 100);
        });

        // Keyboard navigation
        this.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.findPrevious();
                } else {
                    this.findNext();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                this.toggleCaseSensitive();
            }
        });

        // Button click events
        this.prevBtn.addEventListener('click', () => this.findPrevious());
        this.nextBtn.addEventListener('click', () => this.findNext());
        this.closeBtn.addEventListener('click', () => this.close());
        this.findCaseBtn.addEventListener('click', () => this.toggleCaseSensitive());

        // Add highlight styles for DOM search
        this.addHighlightStyles();
    }

    addHighlightStyles() {
        if (document.getElementById('findbar-highlight-styles')) return;

        const style = document.createElement('style');
        style.id = 'findbar-highlight-styles';
        style.textContent = `
            .${this.highlightClass} {
<<<<<<< HEAD
                background-color: #ffff00 !important;
                color: #000000 !important;
                border-radius: 2px;
            }
            .${this.activeHighlightClass} {
                background-color: #ff9632 !important;
                color: #000000 !important;
                border-radius: 2px;
                box-shadow: 0 0 0 2px rgba(255, 150, 50, 0.4);
=======
                background-color: rgba(46, 204, 113, 0.2) !important;
                color: #0a0a0a !important;
                border-radius: 2px;
            }
            .${this.activeHighlightClass} {
                background-color: #2ecc71 !important;
                color: #0a0a0a !important;
                border-radius: 2px;
>>>>>>> 50717754f4b9e6ff24b194e251d5d513ad57f633
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== OPEN/CLOSE ====================

    open() {
        if (!this.findBar || !this.findInput) {
            console.error('[FindBar.open] Required elements not found');
            return;
        }

        this.isVisible = true;
        this.findBar.classList.remove('hidden');
        
        // Focus and select existing text
        this.findInput.focus();
        this.findInput.select();

        // If there's existing text, perform search
        if (this.findInput.value) {
            this.performSearch();
        }

        console.log('[FindBar] Opened');
    }

    close() {
        if (!this.isVisible) return;

        this.isVisible = false;
        this.findBar.classList.add('hidden');
        
        // Stop webview search and clear highlights
        this.stopWebViewSearch();
        this.clearDOMHighlights();
        this.resetUI();
        
        console.log('[FindBar] Closed');
    }

    // ==================== TOGGLE CASE SENSITIVITY ====================

    toggleCaseSensitive() {
        this.caseSensitive = !this.caseSensitive;
        
        if (this.caseSensitive) {
            this.findCaseBtn.classList.add('active');
            this.findCaseBtn.title = 'Match case ON (Alt+C)';
        } else {
            this.findCaseBtn.classList.remove('active');
            this.findCaseBtn.title = 'Match case OFF (Alt+C)';
        }
        
        // Re-run search with new setting
        if (this.findInput.value) {
            this.performSearch();
        }
    }

    // ==================== MAIN SEARCH LOGIC ====================

    performSearch() {
        const query = this.findInput.value;
        
        if (!query) {
            this.stopWebViewSearch();
            this.clearDOMHighlights();
            this.resetUI();
            return;
        }

        // Determine if we should use webview search or DOM search
        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && 
            window.getComputedStyle(welcomeScreen).display !== 'none';

        if (!activeTab || !activeTab.webview || isWelcomeVisible || 
            !activeTab.webview.src || activeTab.webview.src === 'about:blank') {
            // Use DOM search for welcome screen
            this.performDOMSearch(query);
        } else {
            // Use webview findInPage for external websites
            this.performWebViewSearch(query, activeTab.webview);
        }
    }

    // ==================== WEBVIEW SEARCH (External Websites) ====================

    performWebViewSearch(query, webview) {
        // Clear previous DOM highlights
        this.clearDOMHighlights();

        if (!webview || typeof webview.findInPage !== 'function') {
            console.error('[FindBar] findInPage not available on webview');
            this.performDOMSearch(query);
            return;
        }

        // Setup listener if not already set for this webview
        if (this._currentWebview !== webview) {
            this.setupWebViewListener(webview);
            this._currentWebview = webview;
        }

        // Update UI to searching state
        this.findCounter.textContent = '...';
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
        this.isSearching = true;

        try {
            // Call findInPage - Electron handles highlighting automatically
            this.requestId = webview.findInPage(query, {
                forward: true,
                findNext: false,
                matchCase: this.caseSensitive
            });

            this.lastQuery = query;
            
            // Timeout fallback if no results received
            setTimeout(() => {
                if (this.isSearching && this.findCounter.textContent === '...') {
                    this.totalMatches = 0;
                    this.currentMatch = 0;
                    this.updateUI();
                    this.isSearching = false;
                }
            }, 2000);

        } catch (error) {
            console.error('[FindBar] findInPage error:', error);
            this.performDOMSearch(query);
        }
    }

    setupWebViewListener(webview) {
        // Remove old listener if exists
        if (this._webViewHandler && this._currentWebview) {
            try {
                this._currentWebview.removeEventListener('found-in-page', this._webViewHandler);
            } catch (e) {}
        }

        // Create new handler
        this._webViewHandler = (event) => {
            const result = event.result;
            
            if (result) {
                this.totalMatches = result.matches || 0;
                this.currentMatch = result.activeMatchOrdinal || 0;
                
                if (result.finalUpdate) {
                    this.isSearching = false;
                    this.updateUI();
                }
            }
        };

        webview.addEventListener('found-in-page', this._webViewHandler);
    }

    stopWebViewSearch() {
        const activeTab = this.getActiveTab();
        if (activeTab && activeTab.webview && typeof activeTab.webview.stopFindInPage === 'function') {
            try {
                activeTab.webview.stopFindInPage('clearSelection');
            } catch (e) {
                console.warn('[FindBar] Error stopping webview search:', e);
            }
        }
        
        this._currentWebview = null;
        this.requestId = null;
        this.isSearching = false;
    }

    // ==================== NAVIGATION ====================

    findNext() {
        const query = this.findInput.value;
        if (!query || this.totalMatches === 0) return;

        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && 
            window.getComputedStyle(welcomeScreen).display !== 'none';

        if (!activeTab || !activeTab.webview || isWelcomeVisible ||
            !activeTab.webview.src || activeTab.webview.src === 'about:blank') {
            // DOM search navigation
            this.navigateDOMSearch('next');
        } else {
            // WebView search navigation
            if (typeof activeTab.webview.findInPage === 'function') {
                activeTab.webview.findInPage(query, {
                    forward: true,
                    findNext: true,
                    matchCase: this.caseSensitive
                });
            }
        }
    }

    findPrevious() {
        const query = this.findInput.value;
        if (!query || this.totalMatches === 0) return;

        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && 
            window.getComputedStyle(welcomeScreen).display !== 'none';

        if (!activeTab || !activeTab.webview || isWelcomeVisible ||
            !activeTab.webview.src || activeTab.webview.src === 'about:blank') {
            // DOM search navigation
            this.navigateDOMSearch('prev');
        } else {
            // WebView search navigation
            if (typeof activeTab.webview.findInPage === 'function') {
                activeTab.webview.findInPage(query, {
                    forward: false,
                    findNext: true,
                    matchCase: this.caseSensitive
                });
            }
        }
    }

    // ==================== DOM SEARCH (Welcome Screen) ====================

    performDOMSearch(query) {
        this.stopWebViewSearch();
        this.clearDOMHighlights();

        if (!query) {
            this.resetUI();
            return;
        }

        // Find search root
        const welcomeScreen = document.getElementById('welcome-screen');
        const mainContent = document.getElementById('main-content');
        let searchRoot = welcomeScreen || mainContent || document.body;

        // Collect text nodes
        const textNodes = this.collectTextNodes(searchRoot);
        if (textNodes.length === 0) {
            this.totalMatches = 0;
            this.currentMatch = 0;
            this.updateUI();
            return;
        }

        // Build text stream and find matches
        const textStream = this.buildTextStream(textNodes);
        const searchText = this.caseSensitive ? textStream.text : textStream.text.toLowerCase();
        const searchQuery = this.caseSensitive ? query : query.toLowerCase();

        // Find all match positions
        const matchPositions = [];
        let pos = 0;
        while ((pos = searchText.indexOf(searchQuery, pos)) !== -1) {
            matchPositions.push(pos);
            pos += searchQuery.length;
        }

        if (matchPositions.length === 0) {
            this.totalMatches = 0;
            this.currentMatch = 0;
            this.searchRanges = [];
            this.updateUI();
            return;
        }

        // Create and apply highlights (in reverse order to preserve positions)
        this.searchRanges = [];
        for (let i = matchPositions.length - 1; i >= 0; i--) {
            const startPos = matchPositions[i];
            const endPos = startPos + query.length;
            
            const mark = this.highlightRange(textStream, startPos, endPos);
            if (mark) {
                this.searchRanges.unshift(mark);
            }
        }

        this.totalMatches = this.searchRanges.length;
        this.currentMatch = this.totalMatches > 0 ? 1 : 0;
        this.currentRangeIndex = 0;

        // Highlight first match as active
        if (this.searchRanges.length > 0) {
            this.setActiveHighlight(0);
        }

        this.updateUI();
    }

    collectTextNodes(root) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    // Skip find bar itself
                    if (parent.closest('#find-bar')) return NodeFilter.FILTER_REJECT;

                    // Skip hidden elements
                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Skip script, style, etc.
                    const tagName = parent.tagName;
                    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA'].includes(tagName)) {
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
        while ((node = walker.nextNode())) {
            textNodes.push(node);
        }

        return textNodes;
    }

    buildTextStream(textNodes) {
        let text = '';
        const map = [];

        textNodes.forEach(node => {
            const nodeText = node.nodeValue;
            for (let i = 0; i < nodeText.length; i++) {
                map.push({ node, offset: i });
                text += nodeText[i];
            }
        });

        return { text, map };
    }

    highlightRange(textStream, startPos, endPos) {
        const { map } = textStream;
        
        if (startPos < 0 || endPos > map.length) return null;

        const startInfo = map[startPos];
        const endInfo = map[endPos - 1];
        
        if (!startInfo || !endInfo) return null;

        try {
            const range = document.createRange();
            range.setStart(startInfo.node, startInfo.offset);
            range.setEnd(endInfo.node, endInfo.offset + 1);

            const mark = document.createElement('mark');
            mark.className = this.highlightClass;
            mark.setAttribute('data-findbar', '1');

            range.surroundContents(mark);
            return mark;
        } catch (e) {
            // Fallback for complex ranges
            try {
                const startNode = startInfo.node;
                const text = startNode.nodeValue;
                const before = text.substring(0, startInfo.offset);
                const match = text.substring(startInfo.offset, endInfo.offset + 1);
                const after = text.substring(endInfo.offset + 1);

                const parent = startNode.parentNode;
                const mark = document.createElement('mark');
                mark.className = this.highlightClass;
                mark.setAttribute('data-findbar', '1');
                mark.textContent = match;

                if (before) parent.insertBefore(document.createTextNode(before), startNode);
                parent.insertBefore(mark, startNode);
                if (after) parent.insertBefore(document.createTextNode(after), startNode);
                parent.removeChild(startNode);

                return mark;
            } catch (e2) {
                console.warn('[FindBar] Failed to highlight range:', e2);
                return null;
            }
        }
    }

    navigateDOMSearch(direction) {
        if (this.searchRanges.length === 0) return;

        if (direction === 'next') {
            this.currentRangeIndex = (this.currentRangeIndex + 1) % this.searchRanges.length;
        } else {
            this.currentRangeIndex = this.currentRangeIndex - 1;
            if (this.currentRangeIndex < 0) {
                this.currentRangeIndex = this.searchRanges.length - 1;
            }
        }

        this.currentMatch = this.currentRangeIndex + 1;
        this.setActiveHighlight(this.currentRangeIndex);
        this.updateUI();
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

                // Scroll into view
                activeMark.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }

    clearDOMHighlights() {
        // Find all highlight marks and unwrap them
        const marks = document.querySelectorAll('mark[data-findbar="1"]');
        
        marks.forEach(mark => {
            const parent = mark.parentNode;
            if (!parent) return;

            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
        });

        // Normalize to merge adjacent text nodes
        document.body.normalize();

        this.searchRanges = [];
        this.currentRangeIndex = -1;
    }

    // ==================== UI UPDATES ====================

    updateUI() {
        // Update counter
        if (this.totalMatches === 0) {
            this.findCounter.textContent = this.findInput.value ? 'No matches' : '';
            this.findCounter.classList.add('no-matches');
            this.inputContainer?.classList.add('no-matches');
            this.prevBtn.disabled = true;
            this.nextBtn.disabled = true;
        } else {
            this.findCounter.textContent = `${this.currentMatch} of ${this.totalMatches}`;
            this.findCounter.classList.remove('no-matches');
            this.inputContainer?.classList.remove('no-matches');
            this.prevBtn.disabled = false;
            this.nextBtn.disabled = false;
        }
    }

    resetUI() {
        this.totalMatches = 0;
        this.currentMatch = 0;
        this.findCounter.textContent = '';
        this.findCounter.classList.remove('no-matches');
        this.inputContainer?.classList.remove('no-matches');
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;
    }

    // ==================== UTILITY ====================

    getActiveTab() {
        if (typeof tabs === 'undefined' || typeof activeTabId === 'undefined') {
            return null;
        }
        return tabs.find(t => t.id === activeTabId);
    }
}

// ==================== INITIALIZATION ====================

function initializeFindBar() {
    const findBarElement = document.getElementById('find-bar');
    const findInputElement = document.getElementById('find-input');

    if (!findBarElement || !findInputElement) {
        console.log('[FindBar] Waiting for DOM elements...');
        setTimeout(initializeFindBar, 100);
        return;
    }

    window.findBar = new FindBar();
    console.log('[FindBar] Module loaded and available as window.findBar');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeFindBar);
} else {
    initializeFindBar();
}

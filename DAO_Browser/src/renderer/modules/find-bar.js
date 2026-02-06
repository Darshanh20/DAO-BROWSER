// ==================== FIND BAR MODULE ====================

class FindBar {
    constructor() {
        this.findBar = document.getElementById('find-bar');
        this.findInput = document.getElementById('find-input');
        this.findCounter = document.getElementById('find-counter');
        this.prevBtn = document.getElementById('find-prev-btn');
        this.nextBtn = document.getElementById('find-next-btn');
        this.closeBtn = document.getElementById('find-close-btn');

        if (!this.findBar || !this.findInput || !this.findCounter ||
            !this.prevBtn || !this.nextBtn || !this.closeBtn) {
            console.error('FindBar: Required elements not found');
            return;
        }

        // State
        this.isVisible = false;
        this.currentMatch = 0;
        this.totalMatches = 0;
        this.requestId = null;

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
            }
        });

        // Button events
        this.prevBtn.addEventListener('click', () => this.findPrevious());
        this.nextBtn.addEventListener('click', () => this.findNext());
        this.closeBtn.addEventListener('click', () => this.close());

        this.addStyles();
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
        if (!this.findBar || !this.findInput) return;

        if (this.isVisible) {
            this.findInput.focus();
            this.findInput.select();
            return;
        }

        this.isVisible = true;
        this.findBar.classList.remove('hidden');
        this.findInput.focus();
        this.findInput.select();

        if (this.findInput.value) {
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

        if (!query) {
            this.stopWebViewSearch();
            this.clearHighlights();
            this.resetUI();
            return;
        }

        const activeTab = this.getActiveTab();
        const welcomeScreen = document.getElementById('welcome-screen');
        const isWelcomeVisible = welcomeScreen && !welcomeScreen.classList.contains('hidden');

        if (!activeTab || !activeTab.webview || isWelcomeVisible) {
            this.performDOMSearch(query);
        } else {
            this.performWebViewSearch(query, activeTab.webview);
        }
    }

    performDOMSearch(query) {
        this.clearHighlights();

        const welcomeScreen = document.getElementById('welcome-screen');
        if (!welcomeScreen) {
            this.totalMatches = 0;
            this.updateCounter();
            return;
        }

        // Collect all text nodes using TreeWalker
        const textNodes = this.collectTextNodes(welcomeScreen);
        if (textNodes.length === 0) {
            this.totalMatches = 0;
            this.updateCounter();
            return;
        }

        // Build continuous text string with position mapping
        let fullText = '';
        const nodeMap = [];

        textNodes.forEach(node => {
            const text = node.nodeValue;
            const startPos = fullText.length;
            fullText += text;
            nodeMap.push({
                node: node,
                startPos: startPos,
                endPos: fullText.length,
                originalText: text
            });
        });

        // Normalize text for searching (case-insensitive)
        const normalizedQuery = query.toLowerCase();
        const normalizedText = fullText.toLowerCase();

        // Find all matches in normalized text
        const matchPositions = [];
        let pos = 0;

        while (pos < normalizedText.length) {
            const index = normalizedText.indexOf(normalizedQuery, pos);
            if (index === -1) break;
            matchPositions.push(index);
            pos = index + 1;
        }

        if (matchPositions.length === 0) {
           this.totalMatches = 0;
            this.updateCounter();
            return;
        }

        // Create ranges for each match
        this.searchRanges = [];

        matchPositions.forEach(matchStart => {
            const matchEnd = matchStart + query.length;

            // Find which text nodes contain this match
            const startNode = nodeMap.find(n => matchStart >= n.startPos && matchStart < n.endPos);
            const endNode = nodeMap.find(n => matchEnd > n.startPos && matchEnd <= n.endPos);

            if (!startNode || !endNode) return;

            try {
                const range = document.createRange();

                if (startNode === endNode) {
                    // Match within a single text node
                    const offset = matchStart - startNode.startPos;
                    range.setStart(startNode.node, offset);
                    range.setEnd(startNode.node, offset + query.length);
                } else {
                    // Match spans multiple text nodes
                    const startOffset = matchStart - startNode.startPos;
                    range.setStart(startNode.node, startOffset);

                    const endOffset = matchEnd - endNode.startPos;
                    range.setEnd(endNode.node, endOffset);
                }

                // Create highlight
                const mark = document.createElement('mark');
                mark.className = this.highlightClass;
                mark.setAttribute('data-findbar', '1');

                range.surroundContents(mark);
                this.searchRanges.push(mark);

            } catch (error) {
                // Skip if range is invalid
                console.warn('Invalid range:', error);
            }
        });

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
        if (!welcomeScreen) return;

        const marks = welcomeScreen.querySelectorAll('mark[data-findbar="1"]');
        marks.forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                // Extract text from mark and replace with text node
                const textNode = document.createTextNode(mark.textContent);
                parent.replaceChild(textNode, mark);
            }
        });

        // Merge adjacent text nodes
        welcomeScreen.normalize();

        this.searchRanges = [];
        this.currentRangeIndex = -1;
    }

    performWebViewSearch(query, webview) {
        this.clearHighlights();

        if (!webview || typeof webview.findInPage !== 'function') {
            this.performDOMSearch(query);
            return;
        }

        if (this.requestId !== null) {
            try {
                webview.stopFindInPage('clearSelection');
            } catch (e) {}
        }

        this.totalMatches = 0;
        this.currentMatch = 0;
        this.findCounter.textContent = 'Searching...';
        this.prevBtn.disabled = true;
        this.nextBtn.disabled = true;

        try {
            this.setupWebViewListener(webview);

            this.requestId = webview.findInPage(query, {
                forward: true,
                findNext: false,
                matchCase: false
            });

            setTimeout(() => {
                if (this.findCounter.textContent === 'Searching...') {
                    this.totalMatches = 0;
                    this.currentMatch = 0;
                    this.updateCounter();
                }
            }, 2000);

        } catch (error) {
            this.totalMatches = 0;
            this.currentMatch = 0;
            this.updateCounter();
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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.findBar = new FindBar();
    });
} else {
    window.findBar = new FindBar();
}

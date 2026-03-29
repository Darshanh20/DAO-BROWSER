/**
 * Chrome-like Omnibox Address Bar with Live Suggestions
 * Features:
 * - Debounced input (200ms)
 * - Local history search
 * - Google search suggestions with caching (60s)
 * - Merged & ranked dropdown (max 8 items)
 * - Keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Highlight matching text
 */

class AddressBarOmnibox {
    constructor(addressBarSelector, containerSelector) {
        this.addressBar = document.querySelector(addressBarSelector);
        this.container = document.querySelector(containerSelector);
        this.suggestions = [];
        this.selectedIndex = -1;
        this.debounceTimer = null;
        this.debounceDelay = 200;
        
        // Google suggestions cache: { query: { results: [], timestamp } }
        this.googleSuggestionCache = new Map();
        this.cacheTTL = 60000; // 60 seconds in milliseconds
        
        // Profile ID (will be set from window context)
        this.profileId = window.windowProfileContext?.profileId || 1;
        
        this.setupUI();
        this.setupEventListeners();
        
        console.log('[Omnibox] Initialized');
    }
    
    /**
     * Create the suggestions dropdown UI
     */
    setupUI() {
        // Create dropdown container if it doesn't exist
        if (!document.getElementById('address-bar-suggestions')) {
            const dropdown = document.createElement('div');
            dropdown.id = 'address-bar-suggestions';
            dropdown.className = 'address-bar-suggestions-dropdown';
            dropdown.style.display = 'none';
            this.container.appendChild(dropdown);
        }
        this.dropdown = document.getElementById('address-bar-suggestions');
    }
    
    /**
     * Setup event listeners on address bar
     */
    setupEventListeners() {
        // Input event with debouncing
        this.addressBar.addEventListener('input', (e) => {
            this.onInput(e.target.value);
        });
        
        // Keyboard navigation
        this.addressBar.addEventListener('keydown', (e) => {
            this.onKeyDown(e);
        });
        
        // Hide dropdown on blur (with small delay to allow click on suggestion)
        this.addressBar.addEventListener('blur', () => {
            setTimeout(() => {
                this.hideSuggestions();
            }, 150);
        });
        
        // Prevent dropdown from closing when clicking on it
        this.dropdown.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
    }
    
    /**
     * Handle input changes with debouncing
     */
    onInput(value) {
        // Clear previous debounce timer
        clearTimeout(this.debounceTimer);
        
        // Reset selection
        this.selectedIndex = -1;
        
        if (value.trim().length === 0) {
            this.hideSuggestions();
            return;
        }
        
        // Debounce the search
        this.debounceTimer = setTimeout(() => {
            this.fetchSuggestions(value);
        }, this.debounceDelay);
    }
    
    /**
     * Handle keyboard navigation
     */
    onKeyDown(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectNext();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectPrevious();
        } else if (e.key === 'Enter') {
            if (this.selectedIndex !== -1 && this.suggestions.length > 0) {
                e.preventDefault();
                const suggestion = this.suggestions[this.selectedIndex];
                this.selectSuggestion(suggestion);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            this.hideSuggestions();
        }
    }
    
    /**
     * Fetch suggestions from history and Google
     */
    async fetchSuggestions(query) {
        try {
            const [historyResults, googleResults] = await Promise.all([
                this.searchHistory(query),
                this.fetchGoogleSuggestions(query)
            ]);
            
            // Merge and rank results
            this.suggestions = this.mergeAndRankResults(
                historyResults,
                googleResults,
                query
            );
            
            this.renderSuggestions(query);
            this.showSuggestions();
        } catch (error) {
            console.error('[Omnibox] Error fetching suggestions:', error);
        }
    }
    
    /**
     * Search local history
     */
    async searchHistory(query) {
        try {
            const result = await window.historyAPI.searchHistory(
                query,
                8, // Limit
                this.profileId
            );
            
            if (result.success && result.data) {
                return result.data.map(entry => ({
                    type: 'history',
                    url: entry.url,
                    title: entry.title || entry.url,
                    visitCount: entry.visit_count || 0,
                    lastVisited: entry.visit_time
                }));
            }
            return [];
        } catch (error) {
            console.error('[Omnibox] History search error:', error);
            return [];
        }
    }
    
    /**
     * Fetch Google search suggestions with caching
     */
    async fetchGoogleSuggestions(query) {
        // Check cache first
        const cached = this.googleSuggestionCache.get(query.toLowerCase());
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            console.log('[Omnibox] Using cached Google suggestions for:', query);
            return cached.results;
        }
        
        try {
            // Use the Google Suggest API (works from Electron)
            const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Google API returns: [query, [suggestions], [...], [...]]
            if (Array.isArray(data) && Array.isArray(data[1])) {
                const results = data[1].slice(0, 5).map(suggestion => ({
                    type: 'search',
                    url: `https://www.google.com/search?q=${encodeURIComponent(suggestion)}`,
                    title: suggestion,
                    visitCount: 0
                }));
                
                // Cache the results
                this.googleSuggestionCache.set(query.toLowerCase(), {
                    results,
                    timestamp: Date.now()
                });
                
                return results;
            }
            return [];
        } catch (error) {
            console.warn('[Omnibox] Google suggestions error:', error.message);
            return [];
        }
    }
    
    /**
     * Merge history and search results, ranked by relevance
     */
    mergeAndRankResults(historyResults, googleResults, query) {
        // Deduplicate by URL
        const seen = new Set();
        const merged = [];
        
        // History results first (higher priority)
        for (const result of historyResults) {
            if (!seen.has(result.url)) {
                merged.push(result);
                seen.add(result.url);
            }
        }
        
        // Google results second
        for (const result of googleResults) {
            if (!seen.has(result.url)) {
                merged.push(result);
                seen.add(result.url);
            }
        }
        
        // Sort by relevance and visit count
        merged.sort((a, b) => {
            // Type priority: history > search
            if (a.type !== b.type) {
                return a.type === 'history' ? -1 : 1;
            }
            // Visit count (descending)
            return b.visitCount - a.visitCount;
        });
        
        // Return top 8 results
        return merged.slice(0, 8);
    }
    
    /**
     * Render suggestions in the dropdown
     */
    renderSuggestions(query) {
        this.dropdown.innerHTML = '';
        
        if (this.suggestions.length === 0) {
            this.hideSuggestions();
            return;
        }
        
        const list = document.createElement('ul');
        list.className = 'suggestions-list';
        
        this.suggestions.forEach((suggestion, index) => {
            const item = document.createElement('li');
            item.className = 'suggestion-item';
            if (index === this.selectedIndex) {
                item.classList.add('selected');
            }
            
            const icon = document.createElement('span');
            icon.className = 'suggestion-icon';
            icon.innerHTML = suggestion.type === 'history' 
                ? '<i class="fa-solid fa-history"></i>'
                : '<i class="fa-solid fa-magnifying-glass"></i>';
            
            const content = document.createElement('div');
            content.className = 'suggestion-content';
            
            const title = document.createElement('div');
            title.className = 'suggestion-title';
            title.innerHTML = this.highlightMatch(suggestion.title, query);
            
            content.appendChild(title);
            
            item.appendChild(icon);
            item.appendChild(content);
            
            // Click to select
            item.addEventListener('click', () => {
                this.selectSuggestion(suggestion);
            });
            
            // Hover to highlight
            item.addEventListener('mouseenter', () => {
                this.setSelectedIndex(index);
            });
            
            list.appendChild(item);
        });
        
        this.dropdown.appendChild(list);
    }
    
    /**
     * Highlight matching text in suggestion
     */
    highlightMatch(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }
    
    /**
     * Simplify URL display
     */
    simplifyUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname + (urlObj.pathname !== '/' ? urlObj.pathname : '');
        } catch {
            return url;
        }
    }
    
    /**
     * Select next suggestion
     */
    selectNext() {
        if (this.suggestions.length === 0) {
            return;
        }
        this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
        this.updateSelection();
    }
    
    /**
     * Select previous suggestion
     */
    selectPrevious() {
        if (this.suggestions.length === 0) {
            return;
        }
        this.selectedIndex = this.selectedIndex === -1
            ? this.suggestions.length - 1
            : (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length;
        this.updateSelection();
    }
    
    /**
     * Set selected index directly
     */
    setSelectedIndex(index) {
        this.selectedIndex = index;
        this.updateSelection();
    }
    
    /**
     * Update visual selection
     */
    updateSelection() {
        const items = this.dropdown.querySelectorAll('.suggestion-item');
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
        
        // Scroll selected item into view
        if (this.selectedIndex !== -1 && items[this.selectedIndex]) {
            items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }
    
    /**
     * Select a suggestion
     */
    selectSuggestion(suggestion) {
        this.addressBar.value = suggestion.url;
        this.hideSuggestions();
        
        // Trigger navigation (will be handled by existing Enter key handler)
        const event = new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        });
        this.addressBar.dispatchEvent(event);
    }
    
    /**
     * Show dropdown
     */
    showSuggestions() {
        if (this.suggestions.length > 0) {
            this.dropdown.style.display = 'block';
        }
    }
    
    /**
     * Hide dropdown
     */
    hideSuggestions() {
        this.dropdown.style.display = 'none';
        this.selectedIndex = -1;
    }
    
    /**
     * Update profile ID (called when profile context changes)
     */
    setProfileId(profileId) {
        this.profileId = profileId;
        console.log('[Omnibox] Profile ID updated to:', profileId);
    }
}

// Expose globally
window.AddressBarOmnibox = AddressBarOmnibox;

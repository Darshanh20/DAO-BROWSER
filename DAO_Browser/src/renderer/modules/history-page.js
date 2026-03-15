/**
 * History Page JavaScript
 * Handles loading, searching, and managing browsing history
 */

// DOM Elements
const historyContainer = document.getElementById('history-container');
const searchInput = document.getElementById('search-input');
const clearAllBtn = document.getElementById('clear-all-btn');
const paginationContainer = document.getElementById('pagination');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const currentPageSpan = document.getElementById('current-page');
const totalPagesSpan = document.getElementById('total-pages');
const totalEntriesSpan = document.getElementById('total-entries');
const uniqueUrlsSpan = document.getElementById('unique-urls');
const totalTimeSpan = document.getElementById('total-time');

// State
let currentPage = 1;
let totalPages = 1;
let searchQuery = '';
let searchTimeout;

// Get current profile ID with multiple fallback sources
function getCurrentProfileId() {
    let profileId = 1; // Default fallback
    
    // Try to get from ProfileSwitcher instance first (most reliable)
    if (window.profileSwitcher && window.profileSwitcher.currentProfile && window.profileSwitcher.currentProfile.id) {
        profileId = window.profileSwitcher.currentProfile.id;
        return profileId;
    }
    
    // Try localStorage as fallback
    const storedProfileId = localStorage.getItem('dao_current_profile_id');
    if (storedProfileId && !isNaN(parseInt(storedProfileId)) && parseInt(storedProfileId) > 0) {
        profileId = parseInt(storedProfileId);
    } else {
        
        // Try to sync with ProfileSwitcher if available but no currentProfile yet
        if (window.profileSwitcher && typeof window.profileSwitcher.loadProfiles === 'function') {
            window.profileSwitcher.loadProfiles().catch(err => {
                console.warn('[History Page] Failed to refresh ProfileSwitcher:', err);
            });
        }
    }
    
    return profileId;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    
    // Update profile indicator
    updateProfileIndicator();
    
    // Load initial history
    await loadHistory();
    
    // Load statistics
    await loadStats();
    
    // Setup event listeners
    setupEventListeners();
    
    // Listen for profile switches to reload history
    setupProfileSwitchListener();
});

// Setup profile switch event listener
function setupProfileSwitchListener() {
    document.addEventListener('profileSwitched', async (e) => {
        
        // Update localStorage immediately to ensure consistency
        localStorage.setItem('dao_current_profile_id', e.detail.profile.id.toString());
        
        // Update profile indicator
        updateProfileIndicator();
        
        // Reset pagination and search
        currentPage = 1;
        searchQuery = '';
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Small delay to ensure profile switch is complete
        setTimeout(async () => {
            console.log('[History Page] Reloading data after profile switch...');
            await loadStats();
        }, 100);
    });
}

// Update the profile indicator in the UI
function updateProfileIndicator() {
    const indicatorEl = document.getElementById('profile-indicator');
    const profileNameEl = document.getElementById('current-profile-name');
    
    if (!indicatorEl || !profileNameEl) return;
    
    const profileId = getCurrentProfileId();
    let profileName = `Profile ${profileId}`;
    
    // Try to get the actual profile name
    if (window.profileSwitcher && window.profileSwitcher.currentProfile) {
        profileName = window.profileSwitcher.currentProfile.display_name;
    }
    
    profileNameEl.textContent = `Viewing history for: ${profileName}`;
    indicatorEl.style.display = 'flex';
    

function setupEventListeners() {
    // Search input with debounce
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value.trim();
            currentPage = 1;
            if (searchQuery) {
                searchHistory(searchQuery);
            } else {
                loadHistory();
            }
        }, 500);
    });

    // Clear all button
    clearAllBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all browsing history? This action cannot be undone.')) {
            await clearAllHistory();
        }
    });

    // Pagination
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadHistory();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadHistory();
        }
    });
}

async function loadHistory() {
    showLoading();
    
    try {
        const profileId = getCurrentProfileId();
        console.log(`[History Page] Loading history for profile ${profileId}, page ${currentPage}`);
        
        const response = await fetch(`http://localhost:5000/api/history/all?page=${currentPage}&limit=50&profile_id=${profileId}`);
        const result = await response.json();
        
        if (result.success) {
            console.log(`[History Page] Loaded ${result.data.length} history entries for profile ${profileId}`);
            displayHistory(result.data);
            updatePagination(result.pagination);
        } elconsole.error('[History Page] Failed to load history:', result.error);
            showError('Failed to load history: ' + result.error);
        }
    } catch (error) {
        console.error('Error loading history:', error);
        showError('Failed to load history. Make sure the backend server is running on port 5000.');
    }
}

async function searchHistory(query) {
    showLoading();
    
    try {
        const profileId = getCurrentProfileId();
        // Call backend directly via HTTP with profile_id
        const response = await fetch(`http://localhost:5000/api/history/search?q=${encodeURIComponent(query)}&limit=50&profile_id=${profileId}`);
        const result = await response.json();
        
        if (result.success) {
            displayHistory(result.data);
            paginationContainer.style.display = 'none';
        } else {
            showError('Failed to search history: ' + result.error);
        }
    } catch (error) {
        console.error('Error searching history:', error);
        showError('Failed to search history. Make sure the backend server is running.');
    }
}

function displayHistory(entries) {
    
    historyContainer.innerHTML = '';
    
    if (entries.length === 0) {
        showEmptyState();
        return;
    }
    
    // Group entries by date
    const grouped = groupByDate(entries);
    
    // Render each date group
    for (const [date, items] of Object.entries(grouped)) {
        const dateGroup = document.createElement('div');
        dateGroup.className = 'date-group';
        
        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.textContent = date;
        dateGroup.appendChild(dateHeader);
        
        const historyList = document.createElement('ul');
        historyList.className = 'history-list';
        
        items.forEach(entry => {
            const item = createHistoryItem(entry);
            historyList.appendChild(item);
        });
        
        dateGroup.appendChild(historyList);
        historyContainer.appendChild(dateGroup);
    }
}

function createHistoryItem(entry) {
    const li = document.createElement('li');
    li.className = 'history-item';
    
    // Favicon
    const favicon = document.createElement('div');
    favicon.className = 'favicon';
    if (entry.favicon_url) {
        const img = document.createElement('img');
        img.src = entry.favicon_url;
        img.onerror = () => {
            img.style.display = 'none';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-globe';
            favicon.appendChild(icon);
        };
        favicon.appendChild(img);
    } else {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-globe';
        favicon.appendChild(icon);
    }
    
    // Info container
    const info = document.createElement('div');
    info.className = 'history-info';
    
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = entry.title || 'Untitled Page';
    
    const url = document.createElement('div');
    url.className = 'history-url';
    url.textContent = entry.url;
    
    info.appendChild(title);
    info.appendChild(url);
    
    // Meta information
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    
    const visitCount = document.createElement('div');
    visitCount.className = 'visit-count';
    visitCount.innerHTML = `<i class="fa-solid fa-repeat"></i> ${entry.visit_count}`;
    
    const visitTime = document.createElement('div');
    visitTime.className = 'visit-time';
    visitTime.innerHTML = `<i class="fa-solid fa-clock"></i> ${formatTime(entry.visit_time)}`;
    
    meta.appendChild(visitCount);
    meta.appendChild(visitTime);
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.title = 'Delete this entry';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteHistoryEntry(entry.id);
    };
    
    // Click to navigate
    li.onclick = () => {
        // Try to open in the main browser window by navigating in the same webview
        // This works better within the Electron tab system
        window.location.href = entry.url;
    };
    
    li.appendChild(favicon);
    li.appendChild(info);
    li.appendChild(meta);
    li.appendChild(deleteBtn);
    
    return li;
}

function groupByDate(entries) {
    const groups = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    entries.forEach(entry => {
        const date = new Date(entry.visit_time);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        let label;
        if (dateOnly.getTime() === today.getTime()) {
            label = 'Today';
        } else if (dateOnly.getTime() === yesterday.getTime()) {
            label = 'Yesterday';
        } else {
            label = date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
        
        if (!groups[label]) {
            groups[label] = [];
        }
        groups[label].push(entry);
    });
    
    return groups;
}

function formatTime(timestamp) {
    // SQLite returns timestamps in format: "YYYY-MM-DD HH:MM:SS"
    // Parse it properly to ensure accurate time display
    const date = new Date(timestamp);
    
    // Check for invalid date
    if (isNaN(date.getTime())) {
        console.error('Invalid timestamp:', timestamp);
        return 'Unknown time';
    }
    
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) {
        return 'Just now';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    
    // Today (but more than 24 hours ago - edge case for early morning)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const visitDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (visitDate.getTime() === today.getTime()) {
        return 'Today at ' + date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    // Yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (visitDate.getTime() === yesterday.getTime()) {
        return 'Yesterday at ' + date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    // Less than 7 days ago
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    
    // Show full date and time for older entries
    return date.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
    });
}

async function deleteHistoryEntry(entryId) {
    try {
        // Call backend directly via HTTP
        const response = await fetch(`http://localhost:5000/api/history/${entryId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            // Reload current view
            if (searchQuery) {
                searchHistory(searchQuery);
            } else {
                loadHistory();
            }
            loadStats();
        } else {
            alert('Failed to delete entry: ' + result.error);
        }
    } catch (error) {
        console.error('Error deleting entry:', error);
        alert('Failed to delete entry');
    }
}

async function clearAllHistory() {
    try {
        const profileId = getCurrentProfileId();
        console.log(`[History Page] Clearing history for profile: ${profileId}`);
        
        // Call backend directly via HTTP with profile_id
        const response = await fetch(`http://localhost:5000/api/history/clear?profile_id=${profileId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            console.log(`[History Page] History cleared successfully for profile ${profileId}`);
            await loadHistory();
            await loadStats();
            alert(`Successfully cleared ${result.deleted} history entries`);
        } else {
            console.error('[History Page] Failed to clear history:', result.error);
            alert('Failed to clear history: ' + result.error);
        }
    } catch (error) {
        console.error('[History Page] Error clearing history:', error);
        alert('Failed to clear history. Make sure the backend server is running.');
    }
}

async function loadStats() {
    try {
        const profileId = getCurrentProfileId();
        console.log(`[History Page] Loading stats for profile: ${profileId}`);
        
        // Call backend directly via HTTP with profile_id
        const response = await fetch(`http://localhost:5000/api/history/stats?profile_id=${profileId}`);
        const result = await response.json();
        
        if (result.success) {
            const stats = result.stats;
            totalEntriesSpan.textContent = stats.total_entries || 0;
            uniqueUrlsSpan.textContent = stats.unique_urls || 0;
            totalTimeSpan.textContent = (stats.total_duration_hours || 0) + 'h';
            console.log(`[History Page] Stats loaded for profile ${profileId}:`, stats);
        } else {
            console.error('[History Page] Failed to load stats:', result.error);
            // Set default values on error
            totalEntriesSpan.textContent = '0';
            uniqueUrlsSpan.textContent = '0';
            totalTimeSpan.textContent = '0h';
        }
    } catch (error) {
        console.error('[History Page] Error loading stats:', error);
        // Set default values on error
        totalEntriesSpan.textContent = '0';
        uniqueUrlsSpan.textContent = '0';
        totalTimeSpan.textContent = '0h';
    }
}

function updatePagination(pagination) {
    if (!pagination) return;
    
    currentPage = pagination.page;
    totalPages = pagination.total_pages;
    
    currentPageSpan.textContent = currentPage;
    totalPagesSpan.textContent = totalPages;
    
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    
    paginationContainer.style.display = totalPages > 1 ? 'flex' : 'none';
}

function showLoading() {
    historyContainer.innerHTML = `
        <div class="loading">
            <i class="fa-solid fa-spinner"></i>
            <p style="margin-top: 16px;">Loading history...</p>
        </div>
    `;
}

function showEmptyState() {
    const profileId = getCurrentProfileId();
    const profileName = window.profileSwitcher?.currentProfile?.display_name || `Profile ${profileId}`;
    
    historyContainer.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <h2>No history yet</h2>
            <p>Your browsing history for ${profileName} will appear here</p>
            <small style="color: #888; margin-top: 8px; display: block;">Profile ID: ${profileId}</small>
        </div>
    `;
}

function showError(message) {
    historyContainer.innerHTML = `
        <div class="error-message">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>${message}</span>
        </div>
    `;
}

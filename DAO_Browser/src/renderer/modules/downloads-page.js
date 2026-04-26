const downloadsListEl = document.getElementById('downloads-list');
const downloadsEmptyEl = document.getElementById('downloads-empty');
const pageQuery = new URLSearchParams(window.location.search);

let currentProfileId = null;
let currentDownloads = [];
let unsubscribeStarted = null;
let unsubscribeUpdated = null;
let refreshTimerId = null;
const DOWNLOADS_CACHE_KEY = 'dao_download_history_cache';
const DOWNLOADS_CACHE_GLOBAL_KEY = 'dao_download_history_cache_global';

function formatTime(isoTime) {
    try {
        return new Date(isoTime).toLocaleString();
    } catch (error) {
        return isoTime || '';
    }
}

function statusClass(status) {
    if (status === 'completed') return 'status-completed';
    if (status === 'failed') return 'status-failed';
    return 'status-downloading';
}

function statusLabel(status) {
    if (status === 'completed') return 'completed';
    if (status === 'failed') return 'failed';
    return 'downloading';
}

function statusIcon(status) {
    if (status === 'completed') return 'fa-circle-check';
    if (status === 'failed') return 'fa-circle-xmark';
    return 'fa-spinner fa-spin';
}

function sortDownloads(items) {
    return [...items].sort((a, b) => {
        const left = new Date(b.timestamp).getTime() || 0;
        const right = new Date(a.timestamp).getTime() || 0;
        return left - right;
    });
}

function readCachedHistory(profileId) {
    try {
        const scopedRaw = localStorage.getItem(DOWNLOADS_CACHE_KEY);
        if (scopedRaw) {
            const scopedParsed = JSON.parse(scopedRaw);
            if (Array.isArray(scopedParsed) && scopedParsed.length > 0) {
                return scopedParsed;
            }
        }

        const globalRaw = localStorage.getItem(DOWNLOADS_CACHE_GLOBAL_KEY);
        if (globalRaw) {
            const globalParsed = JSON.parse(globalRaw);
            if (Array.isArray(globalParsed)) {
                return globalParsed.filter((item) => {
                    const entryProfileId = Number(item?.profileId);
                    if (!Number.isFinite(entryProfileId) || entryProfileId <= 0) {
                        return true;
                    }
                    return entryProfileId === Number(profileId);
                });
            }
        }
    } catch (error) {
        console.warn('[DownloadsPage] Failed to parse cached history:', error);
    }

    return [];
}

function writeCachedHistory(scopedHistory, globalHistory = null) {
    try {
        localStorage.setItem(DOWNLOADS_CACHE_KEY, JSON.stringify(scopedHistory || []));
        if (Array.isArray(globalHistory)) {
            localStorage.setItem(DOWNLOADS_CACHE_GLOBAL_KEY, JSON.stringify(globalHistory));
        }
    } catch (error) {
        console.warn('[DownloadsPage] Failed to write cached history:', error);
    }
}

function renderDownloads() {
    if (!downloadsListEl || !downloadsEmptyEl) {
        return;
    }

    const ordered = sortDownloads(currentDownloads);

    downloadsListEl.innerHTML = '';

    if (ordered.length === 0) {
        downloadsEmptyEl.style.display = 'block';
        return;
    }

    downloadsEmptyEl.style.display = 'none';

    ordered.forEach((download) => {
        const itemEl = document.createElement('article');
        itemEl.className = 'download-item';

        const mainEl = document.createElement('div');
        mainEl.className = 'download-main';

        const fileNameEl = document.createElement('div');
        fileNameEl.className = 'file-name';
        fileNameEl.textContent = download.fileName || 'download';

        const fileUrlEl = document.createElement('div');
        fileUrlEl.className = 'file-url';
        fileUrlEl.textContent = download.fileUrl || '';

        mainEl.appendChild(fileNameEl);
        mainEl.appendChild(fileUrlEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'download-meta';

        const statusEl = document.createElement('div');
        statusEl.className = `status ${statusClass(download.status)}`;
        statusEl.innerHTML = `<i class="fa-solid ${statusIcon(download.status)}"></i><span>${statusLabel(download.status)}</span>`;

        const timeEl = document.createElement('div');
        timeEl.className = 'download-time';
        timeEl.textContent = formatTime(download.timestamp);

        metaEl.appendChild(statusEl);
        metaEl.appendChild(timeEl);

        itemEl.appendChild(mainEl);
        itemEl.appendChild(metaEl);
        downloadsListEl.appendChild(itemEl);
    });
}

function upsertDownload(downloadEntry) {
    if (!downloadEntry || !downloadEntry.id) {
        return;
    }

    const entryProfileId = Number(downloadEntry.profileId);
    const pageProfileId = Number(currentProfileId);
    const profileKnown = Number.isFinite(entryProfileId) && entryProfileId > 0;

    // Keep strict filtering when profile context is known.
    // If profile is missing on an event/history entry, still show it in Downloads.
    if (profileKnown && entryProfileId !== pageProfileId) {
        return;
    }

    const existingIndex = currentDownloads.findIndex(item => item.id === downloadEntry.id);
    if (existingIndex === -1) {
        currentDownloads.push(downloadEntry);
    } else {
        currentDownloads[existingIndex] = {
            ...currentDownloads[existingIndex],
            ...downloadEntry
        };
    }

    renderDownloads();
}

async function loadDownloads() {
    if (!window.downloadsAPI || typeof window.downloadsAPI.getHistory !== 'function') {
        currentDownloads = readCachedHistory(currentProfileId);
        renderDownloads();
        return;
    }

    try {
        let globalHistory = null;
        const result = await window.downloadsAPI.getHistory(currentProfileId);
        if (result && result.success && Array.isArray(result.data)) {
            currentDownloads = result.data;

            // If profile-scoped history is empty, fallback to global history so
            // the Downloads page still reflects active/downloaded files.
            if (currentDownloads.length === 0) {
                const fallbackResult = await window.downloadsAPI.getHistory();
                if (fallbackResult && fallbackResult.success && Array.isArray(fallbackResult.data)) {
                    globalHistory = fallbackResult.data;
                    currentDownloads = fallbackResult.data;
                }
            }

            writeCachedHistory(currentDownloads, globalHistory);

            renderDownloads();
        }
    } catch (error) {
        console.error('[DownloadsPage] Failed to load history:', error);
        currentDownloads = readCachedHistory(currentProfileId);
        renderDownloads();
    }
}

function resolveProfileId() {
    const fromQuery = Number(pageQuery.get('profile_id'));
    if (fromQuery && !Number.isNaN(fromQuery)) {
        return fromQuery;
    }

    const fromStorage = Number(localStorage.getItem('dao_current_profile_id'));
    if (fromStorage && !Number.isNaN(fromStorage)) {
        return fromStorage;
    }

    return 1;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!downloadsListEl || !downloadsEmptyEl) {
        console.error('[DownloadsPage] Required container elements are missing.');
        return;
    }

    currentProfileId = resolveProfileId();

    // Always paint an initial state immediately.
    renderDownloads();

    await loadDownloads();

    if (window.downloadsAPI && typeof window.downloadsAPI.onStarted === 'function') {
        unsubscribeStarted = window.downloadsAPI.onStarted((downloadEntry) => {
            upsertDownload(downloadEntry);
        });
    }

    if (window.downloadsAPI && typeof window.downloadsAPI.onUpdated === 'function') {
        unsubscribeUpdated = window.downloadsAPI.onUpdated((downloadEntry) => {
            upsertDownload(downloadEntry);
        });
    }

    // Fallback refresh keeps statuses in sync even if event delivery is delayed.
    refreshTimerId = setInterval(loadDownloads, 2000);
});

window.addEventListener('beforeunload', () => {
    if (typeof unsubscribeStarted === 'function') {
        unsubscribeStarted();
    }

    if (typeof unsubscribeUpdated === 'function') {
        unsubscribeUpdated();
    }

    if (refreshTimerId) {
        clearInterval(refreshTimerId);
    }
});

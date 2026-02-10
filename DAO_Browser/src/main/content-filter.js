/**
 * Content Filter Module for D.A.O. Browser
 * Blocks access to inappropriate/illegal websites using community-maintained blocklists.
 * Independent from the ad-blocker — has its own toggle and stats.
 */

const { session, ipcMain } = require('electron');
const path = require('path');
const fetch = require('cross-fetch');

// ==================== STATE ====================

let contentFilterEnabled = true;
let blockedSitesCount = 0;
let filteredDomains = new Set();

// ==================== BLOCKLIST SOURCES ====================

// Community-maintained adult/NSFW domain blocklists (hosts-file format)
const CONTENT_BLOCKLIST_URLS = [
    // Steven Black's porn-only extension (~26,000 domains)
    'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
];

// Fallback domains if download fails
const FALLBACK_CONTENT_DOMAINS = [
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com',
    'redtube.com', 'youporn.com', 'tube8.com', 'spankbang.com',
    'beeg.com', 'eporner.com', 'tnaflix.com', 'drtuber.com',
    'sunporno.com', 'txxx.com', 'hclips.com', 'voyeurhit.com',
    'porntrex.com', 'fuq.com', 'daftsex.com', 'thumbzilla.com',
];

// ==================== HOSTS FILE PARSER ====================

function parseHostsFile(text) {
    const domains = new Set();
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2 && (parts[0] === '127.0.0.1' || parts[0] === '0.0.0.0')) {
            const domain = parts[1].toLowerCase();
            if (domain && domain !== 'localhost' && domain !== 'localhost.localdomain') {
                domains.add(domain);
            }
        }
    }
    return domains;
}

// ==================== DOMAIN MATCHING ====================

function isBlockedContent(url) {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        // Exact match
        if (filteredDomains.has(hostname)) return true;
        // Parent domain match (e.g., "cdn.example.com" blocked if "example.com" is in list)
        const parts = hostname.split('.');
        for (let i = 1; i < parts.length - 1; i++) {
            const parent = parts.slice(i).join('.');
            if (filteredDomains.has(parent)) return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

// ==================== INITIALIZATION ====================

async function loadContentBlocklists() {
    console.log('📥 [Content Filter] Downloading content blocklists...');

    for (const url of CONTENT_BLOCKLIST_URLS) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                const domains = parseHostsFile(text);
                domains.forEach(d => filteredDomains.add(d));
                console.log(`   ✅ [Content Filter] Loaded ${domains.size} domains`);
            }
        } catch (error) {
            console.warn(`   ⚠️ [Content Filter] Failed to download: ${error.message}`);
        }
    }

    // Add fallback domains
    FALLBACK_CONTENT_DOMAINS.forEach(d => filteredDomains.add(d));

    console.log(`🔒 [Content Filter] Ready: ${filteredDomains.size} domains loaded`);
}

// ==================== REQUEST INTERCEPTOR ====================

/**
 * Initialize the content filter.
 * Must be called AFTER the ad-blocker's onBeforeRequest is set up,
 * because Electron only allows ONE onBeforeRequest listener per session.
 * Instead, this module exports `checkRequest()` to be called from main.js.
 */
function checkRequest(url) {
    if (!contentFilterEnabled) return null; // null = not handled

    if (isBlockedContent(url)) {
        blockedSitesCount++;
        console.log(`🚫 [Content Filter] Blocked: ${url}`);
        return 'blocked'; // Signal to redirect to block page
    }

    return null; // Not blocked
}

// ==================== IPC HANDLERS ====================

function registerIpcHandlers() {
    ipcMain.handle('contentFilter:getStats', () => {
        return {
            enabled: contentFilterEnabled,
            blockedCount: blockedSitesCount,
            totalDomains: filteredDomains.size
        };
    });

    ipcMain.handle('contentFilter:toggle', () => {
        contentFilterEnabled = !contentFilterEnabled;
        console.log(`[Content Filter] ${contentFilterEnabled ? '🔒 Enabled' : '🔓 Disabled'}`);
        return contentFilterEnabled;
    });

    ipcMain.handle('contentFilter:isEnabled', () => {
        return contentFilterEnabled;
    });
}

// ==================== MODULE EXPORTS ====================

module.exports = {
    loadContentBlocklists,
    checkRequest,
    registerIpcHandlers,
    isBlockedContent,
};

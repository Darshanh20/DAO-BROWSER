const fs = require('fs');
const path = require('path');
const fetch = require('cross-fetch');
const http = require('http');

const STEVENBLACK_SOCIAL_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling-porn-social/hosts';
const BLOCKLIST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BREAK_DURATION_MS = 5 * 60 * 1000;

const AI_ALLOWLIST = [
    'chatgpt.com',
    'openai.com',
    'claude.ai',
    'anthropic.com',
    'copilot.microsoft.com',
    'githubcopilot.com',
    'gemini.google.com',
    'bard.google.com',
    'perplexity.ai',
    'poe.com'
];

function parseHostsFile(text) {
    const domains = new Set();
    const lines = text.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) {
            continue;
        }

        const ip = parts[0];
        const domain = (parts[1] || '').toLowerCase();
        if ((ip === '0.0.0.0' || ip === '127.0.0.1') && domain && domain !== 'localhost' && domain !== 'localhost.localdomain') {
            domains.add(domain);
        }
    }

    return domains;
}

function getDomainFromUrl(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch (error) {
        return null;
    }
}

function domainMatches(hostname, setOrArray) {
    if (!hostname) {
        return false;
    }

    const test = typeof setOrArray.has === 'function'
        ? (value) => setOrArray.has(value)
        : (value) => setOrArray.includes(value);

    if (test(hostname)) {
        return true;
    }

    const parts = hostname.split('.');
    for (let i = 1; i < parts.length - 1; i += 1) {
        const parent = parts.slice(i).join('.');
        if (test(parent)) {
            return true;
        }
    }

    return false;
}

function requestBackend(pathname, method = 'GET', body = null) {
    return new Promise((resolve) => {
        const payload = body ? JSON.stringify(body) : null;

        const options = {
            hostname: 'localhost',
            port: 5000,
            path: pathname,
            method,
            headers: payload
                ? {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
                : {},
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data || '{}');
                    resolve(parsed);
                } catch (error) {
                    resolve({ success: false, error: error.message });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Request timed out' });
        });

        if (payload) {
            req.write(payload);
        }

        req.end();
    });
}

class FocusModeManager {
    constructor() {
        this.sessions = new Map();
        this.socialDomains = new Set();
        this.cacheFilePath = null;
        this.cacheLoaded = false;
        this.sendToProfileWindows = null;
    }

    setNotifier(sendToProfileWindows) {
        this.sendToProfileWindows = sendToProfileWindows;
    }

    setCacheDirectory(baseDir) {
        this.cacheFilePath = path.join(baseDir, 'focus-social-cache.json');
    }

    async ensureSocialDomainsLoaded(forceRefresh = false) {
        if (!this.cacheFilePath) {
            throw new Error('Focus cache path not configured');
        }

        if (this.cacheLoaded && !forceRefresh) {
            return {
                success: true,
                totalDomains: this.socialDomains.size,
                source: 'memory'
            };
        }

        let cache = null;

        try {
            if (fs.existsSync(this.cacheFilePath)) {
                const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
                cache = JSON.parse(raw);
            }
        } catch (error) {
            cache = null;
        }

        const now = Date.now();
        const cacheIsFresh = Boolean(
            !forceRefresh &&
            cache &&
            cache.fetchedAt &&
            Array.isArray(cache.domains) &&
            cache.domains.length > 0 &&
            (now - new Date(cache.fetchedAt).getTime()) < BLOCKLIST_CACHE_TTL_MS
        );

        if (cacheIsFresh) {
            this.socialDomains = new Set(cache.domains.map((d) => String(d).toLowerCase()));
            this.cacheLoaded = true;
            return {
                success: true,
                totalDomains: this.socialDomains.size,
                source: 'cache'
            };
        }

        try {
            const response = await fetch(STEVENBLACK_SOCIAL_URL);
            if (!response.ok) {
                throw new Error(`Failed to download list: ${response.status}`);
            }

            const text = await response.text();
            this.socialDomains = parseHostsFile(text);
            this.cacheLoaded = true;

            const payload = {
                fetchedAt: new Date().toISOString(),
                sourceUrl: STEVENBLACK_SOCIAL_URL,
                domains: Array.from(this.socialDomains)
            };

            fs.writeFileSync(this.cacheFilePath, JSON.stringify(payload, null, 2), 'utf8');

            return {
                success: true,
                totalDomains: this.socialDomains.size,
                source: 'network'
            };
        } catch (error) {
            if (cache && Array.isArray(cache.domains) && cache.domains.length > 0) {
                this.socialDomains = new Set(cache.domains.map((d) => String(d).toLowerCase()));
                this.cacheLoaded = true;
                return {
                    success: true,
                    totalDomains: this.socialDomains.size,
                    source: 'stale-cache',
                    warning: error.message
                };
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    _broadcast(profileId, channel, payload) {
        if (typeof this.sendToProfileWindows === 'function') {
            this.sendToProfileWindows(channel, payload, profileId);
        }
    }

    getActiveSession(profileId) {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);

        if (!session) {
            return { success: true, active: false };
        }

        return {
            success: true,
            active: true,
            session: {
                backendSessionId: session.backendSessionId,
                profileId: session.profileId,
                startedAt: session.startedAt,
                breakActive: session.breakActive,
                breakEndsAt: session.breakEndsAt,
                breakRemainingSeconds: session.breakActive
                    ? Math.max(0, Math.ceil((new Date(session.breakEndsAt).getTime() - Date.now()) / 1000))
                    : 0,
                breaksTaken: session.breaksTaken,
                visitedCount: session.visitedDomains.size,
                blockedAttemptsCount: session.blockedAttempts.length
            }
        };
    }

    async startSession(profileId) {
        const numericProfileId = Number(profileId) || 1;

        const existing = this.sessions.get(numericProfileId);
        if (existing) {
            return {
                success: true,
                alreadyActive: true,
                session: this.getActiveSession(numericProfileId).session
            };
        }

        const blocklistResult = await this.ensureSocialDomainsLoaded(false);
        if (!blocklistResult.success) {
            return blocklistResult;
        }

        const startedAt = new Date().toISOString();
        const backendStart = await requestBackend('/api/focus/start', 'POST', {
            profile_id: numericProfileId,
            started_at: startedAt
        });

        if (!backendStart.success) {
            return {
                success: false,
                error: backendStart.error || 'Failed to create focus session in backend'
            };
        }

        const session = {
            profileId: numericProfileId,
            backendSessionId: backendStart.session_id,
            startedAt,
            breakActive: false,
            breakEndsAt: null,
            breakStartedAt: null,
            breakTimer: null,
            breaksTaken: 0,
            visitedDomains: new Set(),
            blockedAttempts: []
        };

        this.sessions.set(numericProfileId, session);

        this._broadcast(numericProfileId, 'focusMode:stateChanged', {
            type: 'started',
            session: this.getActiveSession(numericProfileId).session
        });

        return {
            success: true,
            session: this.getActiveSession(numericProfileId).session,
            blocklist: blocklistResult
        };
    }

    async endSession(profileId) {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);

        if (!session) {
            return {
                success: false,
                error: 'No active Focus Mode session'
            };
        }

        if (session.breakTimer) {
            clearTimeout(session.breakTimer);
            session.breakTimer = null;
        }

        if (session.breakActive && session.breakStartedAt) {
            await this._persistBreak(session, new Date().toISOString());
        }

        const backendEnd = await requestBackend('/api/focus/end', 'POST', {
            session_id: session.backendSessionId,
            ended_at: new Date().toISOString()
        });

        this.sessions.delete(numericProfileId);

        this._broadcast(numericProfileId, 'focusMode:stateChanged', {
            type: 'ended'
        });

        if (!backendEnd.success) {
            return {
                success: false,
                error: backendEnd.error || 'Failed to end focus session'
            };
        }

        return {
            success: true,
            report: backendEnd.data
        };
    }

    async _persistBreak(session, breakEndedAt) {
        if (!session.breakStartedAt) {
            return;
        }

        const started = new Date(session.breakStartedAt).getTime();
        const ended = new Date(breakEndedAt).getTime();
        const durationSeconds = Math.max(1, Math.round((ended - started) / 1000));

        await requestBackend('/api/focus/break', 'POST', {
            session_id: session.backendSessionId,
            break_started_at: session.breakStartedAt,
            break_ended_at: breakEndedAt,
            duration_seconds: durationSeconds
        });
    }

    async startBreak(profileId) {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);

        if (!session) {
            return {
                success: false,
                error: 'No active Focus Mode session'
            };
        }

        if (session.breakActive) {
            return {
                success: false,
                error: 'Break is already active',
                breakEndsAt: session.breakEndsAt
            };
        }

        const breakStartedAt = new Date().toISOString();
        const breakEndsAt = new Date(Date.now() + BREAK_DURATION_MS).toISOString();

        session.breakActive = true;
        session.breakStartedAt = breakStartedAt;
        session.breakEndsAt = breakEndsAt;

        if (session.breakTimer) {
            clearTimeout(session.breakTimer);
        }

        session.breakTimer = setTimeout(async () => {
            const latestSession = this.sessions.get(numericProfileId);
            if (!latestSession || !latestSession.breakActive) {
                return;
            }

            await this.resumeBreak(numericProfileId, true);
        }, BREAK_DURATION_MS);

        this._broadcast(numericProfileId, 'focusMode:breakChanged', {
            type: 'started',
            breakEndsAt,
            breakRemainingSeconds: Math.ceil(BREAK_DURATION_MS / 1000)
        });

        return {
            success: true,
            breakEndsAt,
            breakDurationSeconds: Math.ceil(BREAK_DURATION_MS / 1000)
        };
    }

    async resumeBreak(profileId, autoResumed = false) {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);

        if (!session) {
            return { success: false, error: 'No active Focus Mode session' };
        }

        if (!session.breakActive) {
            return { success: false, error: 'No active break' };
        }

        if (session.breakTimer) {
            clearTimeout(session.breakTimer);
            session.breakTimer = null;
        }

        const breakEndedAt = new Date().toISOString();
        await this._persistBreak(session, breakEndedAt);

        session.breakActive = false;
        session.breakEndsAt = null;
        session.breakStartedAt = null;
        session.breaksTaken += 1;

        this._broadcast(numericProfileId, 'focusMode:breakChanged', {
            type: autoResumed ? 'auto-resumed' : 'resumed',
            breaksTaken: session.breaksTaken
        });

        return {
            success: true,
            breaksTaken: session.breaksTaken,
            autoResumed
        };
    }

    async logVisit(profileId, url) {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);
        if (!session) {
            return;
        }

        const domain = getDomainFromUrl(url);
        if (!domain) {
            return;
        }

        if (session.visitedDomains.has(domain)) {
            return;
        }

        session.visitedDomains.add(domain);

        await requestBackend('/api/focus/visit', 'POST', {
            session_id: session.backendSessionId,
            url,
            domain,
            visited_at: new Date().toISOString()
        });
    }

    async logBlockedAttempt(profileId, url, reason = 'Social media blocked during Focus Mode') {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);
        if (!session) {
            return;
        }

        const domain = getDomainFromUrl(url) || 'unknown';
        const entry = {
            url,
            domain,
            reason,
            attemptedAt: new Date().toISOString()
        };

        session.blockedAttempts.push(entry);

        await requestBackend('/api/focus/blocked', 'POST', {
            session_id: session.backendSessionId,
            url,
            domain,
            reason,
            attempted_at: entry.attemptedAt
        });
    }

    checkRequest(url, resourceType, profileId) {
        const numericProfileId = Number(profileId) || 1;
        const session = this.sessions.get(numericProfileId);

        if (!session) {
            return { focusActive: false, blocked: false };
        }

        if (session.breakActive) {
            return { focusActive: true, blocked: false, onBreak: true };
        }

        const hostname = getDomainFromUrl(url);
        if (!hostname) {
            return { focusActive: true, blocked: false };
        }

        if (domainMatches(hostname, AI_ALLOWLIST)) {
            return { focusActive: true, blocked: false, aiAllowlisted: true };
        }

        const isBlocked = domainMatches(hostname, this.socialDomains);

        if (!isBlocked) {
            return { focusActive: true, blocked: false };
        }

        return {
            focusActive: true,
            blocked: true,
            resourceType,
            domain: hostname,
            reason: 'Social media is blocked during Focus Mode'
        };
    }

    async getHistory(profileId, limit = 100) {
        const numericProfileId = Number(profileId) || 1;
        const normalizedLimit = Number(limit) || 100;
        return requestBackend(`/api/focus/history?profile_id=${numericProfileId}&limit=${normalizedLimit}`, 'GET');
    }

    getBlocklistMeta() {
        return {
            totalDomains: this.socialDomains.size,
            sourceUrl: STEVENBLACK_SOCIAL_URL,
            cacheFilePath: this.cacheFilePath
        };
    }
}

const focusModeManager = new FocusModeManager();

module.exports = {
    focusModeManager,
    STEVENBLACK_SOCIAL_URL
 }
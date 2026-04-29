/* ==================== FOCUS MODE MANAGER ==================== */

class FocusModeManager {
    constructor() {
        this.launchBtn = document.getElementById('launch-focus-mode-btn');
        this.historyBtn = document.getElementById('focus-history-btn');
        this.widget = document.getElementById('focus-toolbar-widget');
        this.stopwatchEl = document.getElementById('focus-toolbar-stopwatch');
        this.breakBtn = document.getElementById('focus-break-btn');
        this.breakCountdownEl = document.getElementById('focus-break-countdown');

        this.activeSession = null;
        this.tickInterval = null;

        this.init();
    }

    init() {
        if (!window.focusModeAPI) {
            return;
        }

        if (this.launchBtn) {
            this.launchBtn.addEventListener('click', () => this.toggleFocusSession());
        }

        if (this.historyBtn) {
            this.historyBtn.addEventListener('click', () => this.openHistoryModal());
        }

        if (this.breakBtn) {
            this.breakBtn.addEventListener('click', () => this.takeBreak());
        }

        window.focusModeAPI.onStateChanged((data) => {
            if (data?.type === 'ended') {
                this.setSession(null);
            }

            if (data?.type === 'started' && data?.session) {
                this.setSession(data.session);
            }
        });

        window.focusModeAPI.onBreakChanged((data) => {
            if (!this.activeSession) {
                return;
            }

            if (data?.type === 'started') {
                this.activeSession.breakActive = true;
                this.activeSession.breakEndsAt = data.breakEndsAt;
            }

            if (data?.type === 'resumed' || data?.type === 'auto-resumed') {
                this.activeSession.breakActive = false;
                this.activeSession.breakEndsAt = null;
                this.activeSession.breaksTaken = data.breaksTaken || this.activeSession.breaksTaken || 0;
            }

            this.renderToolbar();
        });

        window.focusModeAPI.onUrlBlocked((payload) => {
            if (!payload || !payload.url) {
                return;
            }

            this.showToast('Focus Mode blocked: ' + payload.url);
        });

        this.loadActiveSession();
    }

    getProfileId() {
        const raw = localStorage.getItem('dao_current_profile_id');
        const parsed = Number(raw);
        if (parsed && !Number.isNaN(parsed)) {
            return parsed;
        }

        const query = new URLSearchParams(window.location.search);
        const queryId = Number(query.get('profileId'));
        if (queryId && !Number.isNaN(queryId)) {
            return queryId;
        }

        return 1;
    }

    async loadActiveSession() {
        const result = await window.focusModeAPI.getActiveSession(this.getProfileId());
        if (result?.success && result.active && result.session) {
            this.setSession(result.session);
        } else {
            this.setSession(null);
        }
    }

    setSession(session) {
        this.activeSession = session || null;
        this.renderToolbar();
        this.renderLaunchButton();
        this.setupTick();
    }

    setupTick() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }

        if (!this.activeSession) {
            return;
        }

        this.tickInterval = setInterval(() => {
            this.renderToolbar();
        }, 1000);
    }

    formatDuration(seconds) {
        const safe = Math.max(0, Math.floor(seconds));
        const hrs = String(Math.floor(safe / 3600)).padStart(2, '0');
        const mins = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
        const secs = String(safe % 60).padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
    }

    formatMinutes(seconds) {
        const mins = Math.max(1, Math.round((seconds || 0) / 60));
        return `${mins} min${mins === 1 ? '' : 's'}`;
    }

    formatDate(value) {
        const date = value ? new Date(value) : null;
        if (!date || Number.isNaN(date.getTime())) {
            return 'Unknown date';
        }

        return new Intl.DateTimeFormat(undefined, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(date);
    }

    renderLaunchButton() {
        if (!this.launchBtn) {
            return;
        }

        if (this.activeSession) {
            this.launchBtn.innerHTML = '<i class="fa-solid fa-stop-circle"></i> End Focus Mode';
            this.launchBtn.classList.add('focus-active');
        } else {
            this.launchBtn.innerHTML = '<i class="fa-solid fa-bullseye"></i> Start Focus Mode';
            this.launchBtn.classList.remove('focus-active');
        }
    }

    renderToolbar() {
        if (!this.widget) {
            return;
        }

        if (!this.activeSession) {
            this.widget.classList.add('hidden');
            return;
        }

        this.widget.classList.remove('hidden');

        const startedAtMs = new Date(this.activeSession.startedAt).getTime();
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));

        if (this.stopwatchEl) {
            this.stopwatchEl.textContent = this.formatDuration(elapsedSeconds);
        }

        const isBreakActive = Boolean(this.activeSession.breakActive && this.activeSession.breakEndsAt);

        if (this.breakBtn) {
            this.breakBtn.disabled = isBreakActive;
            this.breakBtn.textContent = isBreakActive ? 'Break Active' : 'Take a Break';
        }

        if (this.breakCountdownEl) {
            if (isBreakActive) {
                const remainingSeconds = Math.max(
                    0,
                    Math.ceil((new Date(this.activeSession.breakEndsAt).getTime() - Date.now()) / 1000)
                );

                this.breakCountdownEl.classList.remove('hidden');
                this.breakCountdownEl.textContent = this.formatDuration(remainingSeconds).slice(3);

                if (remainingSeconds <= 0) {
                    this.activeSession.breakActive = false;
                    this.activeSession.breakEndsAt = null;
                }
            } else {
                this.breakCountdownEl.classList.add('hidden');
                this.breakCountdownEl.textContent = '05:00';
            }
        }
    }

    async toggleFocusSession() {
        if (!window.focusModeAPI || !this.launchBtn) {
            return;
        }

        this.launchBtn.disabled = true;

        try {
            if (!this.activeSession) {
                const result = await window.focusModeAPI.startSession(this.getProfileId());
                if (!result?.success || !result.session) {
                    this.showToast(result?.error || 'Unable to start Focus Mode');
                    return;
                }

                this.setSession(result.session);
                this.showToast('Focus Mode started');
                return;
            }

            const result = await window.focusModeAPI.endSession(this.getProfileId());
            if (!result?.success || !result.report) {
                this.showToast(result?.error || 'Unable to end Focus Mode');
                return;
            }

            const report = result.report;
            this.setSession(null);
            this.openStatsModal(report);
        } finally {
            this.launchBtn.disabled = false;
        }
    }

    async takeBreak() {
        if (!this.activeSession || !window.focusModeAPI) {
            return;
        }

        const result = await window.focusModeAPI.startBreak(this.getProfileId());
        if (!result?.success) {
            this.showToast(result?.error || 'Unable to start break');
            return;
        }

        this.activeSession.breakActive = true;
        this.activeSession.breakEndsAt = result.breakEndsAt;
        this.renderToolbar();
        this.showToast('Break started for 5 minutes');
    }

    removeExistingModal() {
        const existing = document.querySelector('.focus-modal-overlay');
        if (existing) {
            existing.remove();
        }
    }

    createModal(title, bodyHtml) {
        this.removeExistingModal();

        const overlay = document.createElement('div');
        overlay.className = 'focus-modal-overlay';

        const card = document.createElement('div');
        card.className = 'focus-modal-card';
        card.innerHTML = `
            <div class="focus-modal-header">
                <div class="focus-modal-title">${title}</div>
                <button class="focus-modal-close" type="button">&times;</button>
            </div>
            <div class="focus-modal-body">${bodyHtml}</div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        const closeBtn = card.querySelector('.focus-modal-close');
        closeBtn?.addEventListener('click', () => overlay.remove());

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                overlay.remove();
            }
        });
    }

    openStatsModal(report) {
        const blockedItems = (report.blocked_attempts || [])
            .slice(-10)
            .map((item) => `<li>${item.domain || item.url}</li>`)
            .join('');

        const blockedListHtml = blockedItems || '<li>No blocked attempts during this session.</li>';

        const bodyHtml = `
            <div class="focus-motivation">${report.motivational_message || 'Great effort staying focused.'}</div>
            <div class="focus-stats-grid">
                <div class="focus-stat-item">
                    <div class="focus-stat-label">Total Focus Time</div>
                    <div class="focus-stat-value">${this.formatMinutes(report.total_focus_seconds || 0)}</div>
                </div>
                <div class="focus-stat-item">
                    <div class="focus-stat-label">Total Sites Visited</div>
                    <div class="focus-stat-value">${report.total_sites_visited || 0}</div>
                </div>
                <div class="focus-stat-item">
                    <div class="focus-stat-label">Blocked Attempts</div>
                    <div class="focus-stat-value">${report.blocked_attempts_count || 0}</div>
                </div>
                <div class="focus-stat-item">
                    <div class="focus-stat-label">Breaks Taken</div>
                    <div class="focus-stat-value">${report.breaks_taken || 0}</div>
                </div>
            </div>
            <div class="focus-list-section">
                <div class="focus-list-title">Blocked Site Attempts</div>
                <ul class="focus-list">${blockedListHtml}</ul>
            </div>
        `;

        this.createModal('Focus Session Report', bodyHtml);
    }

    async openHistoryModal() {
        if (!window.focusModeAPI) {
            return;
        }

        const result = await window.focusModeAPI.getHistory(this.getProfileId(), 100);
        if (!result?.success) {
            this.showToast(result?.error || 'Failed to load focus history');
            return;
        }

        const items = Array.isArray(result.data) ? result.data : [];

        const cardsHtml = items.length
            ? items.map((session) => this.renderHistoryCard(session)).join('')
            : '<div class="focus-history-empty">No focus sessions yet. Start one to build your streak.</div>';

        this.createModal('Focus History', `<div class="focus-history-list">${cardsHtml}</div>`);
    }

    renderHistoryCard(session) {
        const date = this.formatDate(session.started_at);

        return `
            <div class="focus-history-card">
                <div class="focus-history-head">
                    <span>${date}</span>
                    <span>${this.formatMinutes(session.total_focus_seconds || 0)}</span>
                </div>
                <div class="focus-stats-grid">
                    <div class="focus-stat-item">
                        <div class="focus-stat-label">Sites Visited</div>
                        <div class="focus-stat-value">${session.total_sites_visited || 0}</div>
                    </div>
                    <div class="focus-stat-item">
                        <div class="focus-stat-label">Blocked Attempts</div>
                        <div class="focus-stat-value">${session.blocked_attempts_count || 0}</div>
                    </div>
                    <div class="focus-stat-item">
                        <div class="focus-stat-label">Breaks Taken</div>
                        <div class="focus-stat-value">${session.breaks_taken || 0}</div>
                    </div>
                </div>
                <div class="focus-motivation">${session.motivational_message || 'Focused session completed.'}</div>
            </div>
        `;
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'exam-toast show';
        toast.innerHTML = `<i class="fa-solid fa-bullseye"></i><span>${message}</span>`;

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 260);
        }, 2200);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.focusModeManager) {
        window.focusModeManager = new FocusModeManager();
    }
});

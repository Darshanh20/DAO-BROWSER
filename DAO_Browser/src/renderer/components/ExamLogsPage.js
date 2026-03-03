/**
 * Exam Logs Page Component
 * Professor view for analyzing student activity logs during/after exams
 * 
 * Features:
 * - Load multiple student log files
 * - Filter by student or activity type
 * - Summary statistics cards
 * - Export to CSV
 * - Color-coded activity types
 */

class ExamLogsPage {
    constructor() {
        this.studentLogs = new Map(); // Map of roll_number -> log data
        this.allActivities = []; // Flattened list of all activities
        this.currentSession = null;
        
        // Live mode configuration
        this.BACKEND_URL = 'http://localhost:5000/api/exam';
        this.LIVE_REFRESH_MS = 10000; // 10 seconds
        this.liveMode = false;
        this.liveRefreshInterval = null;
        
        this.init();
    }

    init() {
        this.cacheElements();
        this.attachEventListeners();
        console.log('✅ Exam Logs Page initialized');
    }

    cacheElements() {
        // Modal
        this.modal = document.getElementById('student-logs-modal');
        this.closeBtn = document.getElementById('close-student-logs-btn');
        
        // Header info
        this.examNameEl = document.getElementById('logs-exam-name');
        this.sessionIdEl = document.getElementById('logs-session-id');
        
        // Controls
        this.liveModeBtn = document.getElementById('live-mode-btn');
        this.liveStatusIndicator = document.getElementById('live-status-indicator');
        this.loadFilesBtn = document.getElementById('load-log-files-btn');
        this.studentFilter = document.getElementById('logs-student-filter');
        this.typeFilter = document.getElementById('logs-type-filter');
        this.exportCsvBtn = document.getElementById('export-logs-csv-btn');
        
        // Summary cards
        this.summaryBlocked = document.getElementById('summary-blocked');
        this.summaryWindows = document.getElementById('summary-windows');
        this.summaryDevtools = document.getElementById('summary-devtools');
        this.summaryStudents = document.getElementById('summary-students');
        
        // Tables
        this.studentOverviewSection = document.getElementById('logs-student-overview');
        this.studentOverviewTbody = document.getElementById('student-overview-tbody');
        this.activitySection = document.getElementById('logs-activity-section');
        this.activityTbody = document.getElementById('activity-log-tbody');
        
        // View Student Logs button (in professor active session)
        this.viewLogsBtn = document.getElementById('view-student-logs-btn');
    }

    attachEventListeners() {
        // Open modal
        if (this.viewLogsBtn) {
            this.viewLogsBtn.addEventListener('click', () => this.open());
        }
        
        // Close modal
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
        
        // Close on outside click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.close();
            });
        }
        
        // Live mode toggle
        if (this.liveModeBtn) {
            this.liveModeBtn.addEventListener('click', () => this.toggleLiveMode());
        }
        
        // Load files
        if (this.loadFilesBtn) {
            this.loadFilesBtn.addEventListener('click', () => this.loadLogFiles());
        }
        
        // Filters
        if (this.studentFilter) {
            this.studentFilter.addEventListener('change', () => this.applyFilters());
        }
        if (this.typeFilter) {
            this.typeFilter.addEventListener('change', () => this.applyFilters());
        }
        
        // Export CSV
        if (this.exportCsvBtn) {
            this.exportCsvBtn.addEventListener('click', () => this.exportToCsv());
        }
    }

    open() {
        if (!this.modal) return;
        
        // Get current session info
        const session = window.examSessionBanner?.session;
        if (session) {
            this.currentSession = session;
            this.examNameEl.textContent = session.exam_info?.name || '-';
            this.sessionIdEl.textContent = session.session_id || '------';
        }
        
        this.modal.classList.remove('hidden');
        console.log('[ExamLogs] Opened logs modal');
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
        }
        
        // Stop live mode when closing
        if (this.liveMode) {
            this.stopLiveMode();
        }
    }

    async loadLogFiles() {
        try {
            // Open multi-file dialog
            const result = await window.examModeAPI.showOpenDialogMultiple();
            
            if (!result || !result.filePaths || result.filePaths.length === 0) {
                console.log('[ExamLogs] No files selected');
                return;
            }
            
            console.log(`[ExamLogs] Loading ${result.filePaths.length} log files...`);
            
            // Clear existing data
            this.studentLogs.clear();
            this.allActivities = [];
            
            // Process each file
            for (const filePath of result.filePaths) {
                try {
                    const readResult = await window.examModeAPI.readFile(filePath);
                    
                    if (!readResult.success) {
                        console.error(`[ExamLogs] Failed to read file: ${filePath}`, readResult.error);
                        continue;
                    }
                    
                    const logData = JSON.parse(readResult.content);
                    
                    // Validate it's a log file
                    if (logData.student_info && logData.activity_log) {
                        const rollNumber = logData.student_info.roll_number;
                        this.studentLogs.set(rollNumber, logData);
                        
                        // Add activities to flat list with student info
                        for (const activity of logData.activity_log) {
                            this.allActivities.push({
                                ...activity,
                                student_name: logData.student_info.name,
                                roll_number: rollNumber
                            });
                        }
                        
                        console.log(`[ExamLogs] Loaded log for ${logData.student_info.name} (${rollNumber})`);
                    }
                } catch (err) {
                    console.error(`[ExamLogs] Failed to parse file: ${filePath}`, err);
                }
            }
            
            // Sort activities by timestamp
            this.allActivities.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            // Update UI
            this.updateStudentFilter();
            this.updateSummaryCards();
            this.renderStudentOverview();
            this.renderActivityLog();
            
            // Enable export
            if (this.exportCsvBtn) {
                this.exportCsvBtn.disabled = this.studentLogs.size === 0;
            }
            
            this.showToast(`Loaded ${this.studentLogs.size} student logs`);
            
        } catch (error) {
            console.error('[ExamLogs] Failed to load files:', error);
            this.showToast('Failed to load log files', 'error');
        }
    }

    updateStudentFilter() {
        if (!this.studentFilter) return;
        
        // Clear existing options except "All Students"
        this.studentFilter.innerHTML = '<option value="all">All Students</option>';
        
        // Add option for each student
        for (const [rollNumber, logData] of this.studentLogs) {
            const opt = document.createElement('option');
            opt.value = rollNumber;
            opt.textContent = `${rollNumber} - ${logData.student_info.name}`;
            this.studentFilter.appendChild(opt);
        }
    }

    updateSummaryCards(filteredActivities = null) {
        const activities = filteredActivities || this.allActivities;
        
        let blocked = 0;
        let windows = 0;
        let devtools = 0;
        
        for (const activity of activities) {
            const type = activity.type?.toLowerCase() || '';
            
            if (type.includes('blocked') || type.includes('blocked_url')) {
                blocked++;
            } else if (type === 'window_switched') {
                windows++;
            } else if (type === 'devtools_attempt') {
                devtools++;
            }
        }
        
        if (this.summaryBlocked) this.summaryBlocked.textContent = blocked;
        if (this.summaryWindows) this.summaryWindows.textContent = windows;
        if (this.summaryDevtools) this.summaryDevtools.textContent = devtools;
        if (this.summaryStudents) this.summaryStudents.textContent = this.studentLogs.size;
    }

    renderStudentOverview() {
        if (!this.studentOverviewTbody) return;
        
        if (this.studentLogs.size === 0) {
            this.studentOverviewTbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">No student logs loaded. Click "Load Student Logs" to import log files.</td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        
        for (const [rollNumber, logData] of this.studentLogs) {
            const stats = this.calculateStudentStats(logData);
            const alertClass = stats.isAlert ? 'alert-row' : '';
            const statusBadge = stats.isAlert 
                ? '<span class="status-badge alert">🔴 Alert</span>'
                : '<span class="status-badge normal">✅ Normal</span>';
            
            html += `
                <tr class="${alertClass}" data-roll="${rollNumber}">
                    <td>${this.escapeHtml(rollNumber)}</td>
                    <td>${this.escapeHtml(logData.student_info.name)}</td>
                    <td>${statusBadge}</td>
                    <td class="count-cell ${stats.blocked > 5 ? 'high' : ''}">${stats.blocked}</td>
                    <td class="count-cell ${stats.windows > 5 ? 'high' : ''}">${stats.windows}</td>
                    <td class="count-cell ${stats.devtools > 2 ? 'high' : ''}">${stats.devtools}</td>
                </tr>
            `;
        }
        
        this.studentOverviewTbody.innerHTML = html;
        
        // Add click handlers to rows
        this.studentOverviewTbody.querySelectorAll('tr[data-roll]').forEach(row => {
            row.addEventListener('click', () => {
                const roll = row.dataset.roll;
                if (this.studentFilter) {
                    this.studentFilter.value = roll;
                    this.applyFilters();
                }
            });
        });
    }

    calculateStudentStats(logData) {
        let blocked = 0;
        let windows = 0;
        let devtools = 0;
        
        for (const activity of logData.activity_log || []) {
            const type = activity.type?.toLowerCase() || '';
            
            if (type.includes('blocked') || type.includes('blocked_url')) {
                blocked++;
            } else if (type === 'window_switched') {
                windows++;
            } else if (type === 'devtools_attempt') {
                devtools++;
            }
        }
        
        // Alert threshold: blocked > 5 OR devtools > 2
        const isAlert = blocked > 5 || devtools > 2;
        
        return { blocked, windows, devtools, isAlert };
    }

    renderActivityLog(filteredActivities = null) {
        if (!this.activityTbody) return;
        
        const activities = filteredActivities || this.allActivities;
        
        if (activities.length === 0) {
            this.activityTbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="4">No activity logged yet.</td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        
        for (const activity of activities) {
            const time = this.formatTime(activity.timestamp);
            const student = `${this.escapeHtml(activity.student_name || 'Unknown')} (${this.escapeHtml(activity.roll_number || '?')})`;
            const { description, typeClass, typeBadge } = this.formatActivity(activity);
            
            html += `
                <tr class="activity-row ${typeClass}">
                    <td class="time-cell">${time}</td>
                    <td class="student-cell">${student}</td>
                    <td class="activity-cell">${description}</td>
                    <td class="type-cell">${typeBadge}</td>
                </tr>
            `;
        }
        
        this.activityTbody.innerHTML = html;
    }

    formatActivity(activity) {
        const type = activity.type?.toLowerCase() || 'unknown';
        let description = '';
        let typeClass = '';
        let typeBadge = '';
        
        switch (type) {
            case 'blocked_url':
            case 'blocked_url_attempt':
                description = `Tried to access: ${this.escapeHtml(activity.url || 'unknown URL')}`;
                typeClass = 'blocked';
                typeBadge = '<span class="type-badge blocked">🔴 Blocked</span>';
                break;
                
            case 'window_switched':
                const duration = activity.away_duration_seconds || 0;
                description = `Switched window (away for ${duration}s)`;
                typeClass = 'warning';
                typeBadge = '<span class="type-badge warning">⚠️ Warning</span>';
                break;
                
            case 'devtools_attempt':
                description = `DevTools shortcut: ${this.escapeHtml(activity.shortcut_used || 'unknown')}`;
                typeClass = 'blocked';
                typeBadge = '<span class="type-badge blocked">🔴 DevTools</span>';
                break;
                
            case 'tab_opened':
                const blocked = activity.was_blocked ? ' (BLOCKED)' : '';
                description = `Tab opened: ${this.escapeHtml(activity.url || 'unknown')}${blocked}`;
                typeClass = activity.was_blocked ? 'blocked' : 'allowed';
                typeBadge = activity.was_blocked 
                    ? '<span class="type-badge blocked">🔴 Blocked</span>'
                    : '<span class="type-badge allowed">✅ Allowed</span>';
                break;
                
            default:
                description = activity.description || activity.type || 'Unknown activity';
                typeClass = 'info';
                typeBadge = '<span class="type-badge info">ℹ️ Info</span>';
        }
        
        return { description, typeClass, typeBadge };
    }

    applyFilters() {
        const studentValue = this.studentFilter?.value || 'all';
        const typeValue = this.typeFilter?.value || 'all';
        
        let filtered = [...this.allActivities];
        
        // Filter by student
        if (studentValue !== 'all') {
            filtered = filtered.filter(a => a.roll_number === studentValue);
        }
        
        // Filter by type
        if (typeValue !== 'all') {
            filtered = filtered.filter(a => {
                const type = a.type?.toLowerCase() || '';
                
                switch (typeValue) {
                    case 'blocked_url':
                        return type.includes('blocked');
                    case 'window_switched':
                        return type === 'window_switched';
                    case 'devtools_attempt':
                        return type === 'devtools_attempt';
                    case 'violations':
                        return type.includes('blocked') || 
                               type === 'window_switched' || 
                               type === 'devtools_attempt';
                    default:
                        return true;
                }
            });
        }
        
        // Update UI
        this.updateSummaryCards(filtered);
        this.renderActivityLog(filtered);
        
        // Show/hide student overview based on selection
        if (this.studentOverviewSection) {
            this.studentOverviewSection.style.display = studentValue === 'all' ? 'block' : 'none';
        }
    }

    async exportToCsv() {
        if (this.allActivities.length === 0) {
            this.showToast('No data to export', 'warning');
            return;
        }
        
        try {
            // Build CSV content
            const headers = ['Time', 'Student Name', 'Roll Number', 'Activity Type', 'Description', 'Details'];
            const rows = this.allActivities.map(a => [
                a.timestamp || '',
                a.student_name || '',
                a.roll_number || '',
                a.type || '',
                this.formatActivity(a).description,
                JSON.stringify(a)
            ]);
            
            let csv = headers.join(',') + '\n';
            for (const row of rows) {
                csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
            }
            
            // Create blob and download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            
            const sessionId = this.currentSession?.session_id || 'unknown';
            const filename = `exam_logs_${sessionId}_${Date.now()}.csv`;
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            
            URL.revokeObjectURL(url);
            
            this.showToast('CSV exported successfully');
            
        } catch (error) {
            console.error('[ExamLogs] Export failed:', error);
            this.showToast('Failed to export CSV', 'error');
        }
    }

    // ==================== LIVE MODE ====================

    /**
     * Toggle live mode on/off
     */
    toggleLiveMode() {
        if (this.liveMode) {
            this.stopLiveMode();
        } else {
            this.startLiveMode();
        }
    }

    /**
     * Start live mode - fetch from backend every 10s
     */
    startLiveMode() {
        if (!this.currentSession?.session_id) {
            this.showToast('No active exam session', 'error');
            return;
        }

        this.liveMode = true;
        
        // Update UI
        if (this.liveModeBtn) {
            this.liveModeBtn.classList.add('active');
            this.liveModeBtn.querySelector('.live-mode-text').textContent = 'Stop Live';
        }
        if (this.liveStatusIndicator) {
            this.liveStatusIndicator.classList.remove('hidden');
        }
        
        console.log('[ExamLogs] Starting live mode...');
        
        // Initial fetch
        this.fetchLiveData();
        
        // Start refresh interval
        this.liveRefreshInterval = setInterval(() => {
            this.fetchLiveData();
        }, this.LIVE_REFRESH_MS);
        
        this.showToast('Live mode enabled - refreshing every 10s');
    }

    /**
     * Stop live mode
     */
    stopLiveMode() {
        this.liveMode = false;
        
        if (this.liveRefreshInterval) {
            clearInterval(this.liveRefreshInterval);
            this.liveRefreshInterval = null;
        }
        
        // Update UI
        if (this.liveModeBtn) {
            this.liveModeBtn.classList.remove('active');
            this.liveModeBtn.querySelector('.live-mode-text').textContent = 'Live Mode';
        }
        if (this.liveStatusIndicator) {
            this.liveStatusIndicator.classList.add('hidden');
        }
        
        console.log('[ExamLogs] Live mode stopped');
        this.showToast('Live mode disabled');
    }

    /**
     * Fetch live student data from backend
     */
    async fetchLiveData() {
        if (!this.currentSession?.session_id) return;
        
        const sessionId = this.currentSession.session_id;
        
        try {
            // Fetch students list
            const response = await fetch(`${this.BACKEND_URL}/session/${sessionId}/students`);
            
            if (!response.ok) {
                console.warn('[ExamLogs] Live fetch failed:', response.status);
                return;
            }
            
            const data = await response.json();
            
            if (!data.success || !data.students) {
                return;
            }
            
            console.log(`[ExamLogs] Live: ${data.students.length} students active`);
            
            // Update student logs map
            this.studentLogs.clear();
            this.allActivities = [];
            
            for (const student of data.students) {
                // Create log entry from live data
                const logData = {
                    student_info: {
                        name: student.name,
                        roll_number: student.roll_number
                    },
                    activity_log: [], // Will fetch full logs if needed
                    live_status: student.live_status,
                    last_seen: student.last_seen,
                    current_url: student.current_url,
                    violation_count: student.violation_count || 0,
                    window_switches: student.window_switches || 0,
                    blocked_attempts: student.blocked_attempts || 0,
                    devtools_attempts: student.devtools_attempts || 0
                };
                
                this.studentLogs.set(student.roll_number, logData);
            }
            
            // Update UI
            this.updateStudentFilter();
            this.updateSummaryCardsLive(data.students);
            this.renderStudentOverviewLive(data.students);
            
            // Enable export
            if (this.exportCsvBtn) {
                this.exportCsvBtn.disabled = this.studentLogs.size === 0;
            }
            
        } catch (error) {
            console.error('[ExamLogs] Live fetch error:', error);
        }
    }

    /**
     * Update summary cards for live mode
     */
    updateSummaryCardsLive(students) {
        let blocked = 0;
        let windows = 0;
        let devtools = 0;
        
        for (const student of students) {
            blocked += student.blocked_attempts || 0;
            windows += student.window_switches || 0;
            devtools += student.devtools_attempts || 0;
        }
        
        if (this.summaryBlocked) this.summaryBlocked.textContent = blocked;
        if (this.summaryWindows) this.summaryWindows.textContent = windows;
        if (this.summaryDevtools) this.summaryDevtools.textContent = devtools;
        if (this.summaryStudents) this.summaryStudents.textContent = students.length;
    }

    /**
     * Render student overview table with live status indicators
     */
    renderStudentOverviewLive(students) {
        if (!this.studentOverviewTbody) return;
        
        if (students.length === 0) {
            this.studentOverviewTbody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">No students connected yet. Waiting for students to join...</td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        
        for (const student of students) {
            const isAlert = (student.blocked_attempts || 0) > 5 || (student.devtools_attempts || 0) > 2;
            const alertClass = isAlert ? 'alert-row' : '';
            
            // Live status badge
            const liveStatus = student.live_status || 'unknown';
            const statusLabel = this.getLiveStatusLabel(liveStatus);
            const statusBadge = `<span class="live-status-badge ${liveStatus}">${statusLabel}</span>`;
            
            // Last seen time
            const lastSeenTime = this.formatRelativeTime(student.last_seen);
            
            html += `
                <tr class="${alertClass}" data-roll="${student.roll_number}">
                    <td>${this.escapeHtml(student.roll_number)}</td>
                    <td>
                        ${this.escapeHtml(student.name)}
                        <div class="last-seen-time">Last seen: ${lastSeenTime}</div>
                    </td>
                    <td>${statusBadge}</td>
                    <td class="count-cell ${(student.blocked_attempts || 0) > 5 ? 'high' : ''}">${student.blocked_attempts || 0}</td>
                    <td class="count-cell ${(student.window_switches || 0) > 5 ? 'high' : ''}">${student.window_switches || 0}</td>
                    <td class="count-cell ${(student.devtools_attempts || 0) > 2 ? 'high' : ''}">${student.devtools_attempts || 0}</td>
                </tr>
            `;
        }
        
        this.studentOverviewTbody.innerHTML = html;
        
        // Add click handlers to rows
        this.studentOverviewTbody.querySelectorAll('tr[data-roll]').forEach(row => {
            row.addEventListener('click', () => {
                const roll = row.dataset.roll;
                this.fetchStudentLogs(roll);
            });
        });
    }

    /**
     * Fetch detailed logs for a specific student
     */
    async fetchStudentLogs(rollNumber) {
        if (!this.currentSession?.session_id) return;
        
        const sessionId = this.currentSession.session_id;
        
        try {
            const response = await fetch(`${this.BACKEND_URL}/session/${sessionId}/logs/${encodeURIComponent(rollNumber)}`);
            
            if (!response.ok) {
                console.warn('[ExamLogs] Failed to fetch student logs');
                return;
            }
            
            const data = await response.json();
            
            if (data.success && data.logs) {
                // Update activities for this student
                this.allActivities = data.logs.map(log => ({
                    ...log,
                    student_name: this.studentLogs.get(rollNumber)?.student_info?.name || rollNumber,
                    roll_number: rollNumber
                }));
                
                // Sort by timestamp
                this.allActivities.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                
                // Show activity log
                this.renderActivityLog();
                
                // Update filter
                if (this.studentFilter) {
                    this.studentFilter.value = rollNumber;
                }
            }
            
        } catch (error) {
            console.error('[ExamLogs] Failed to fetch student logs:', error);
        }
    }

    /**
     * Get label for live status
     */
    getLiveStatusLabel(status) {
        const labels = {
            'active': '● Online',
            'idle': '◐ Idle',
            'lost': '○ Lost',
            'submitted': '✓ Submitted',
            'unknown': '? Unknown'
        };
        return labels[status] || status;
    }

    /**
     * Format relative time (e.g., "2 min ago")
     */
    formatRelativeTime(timestamp) {
        if (!timestamp) return 'Never';
        
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffSeconds = Math.floor((now - date) / 1000);
            
            if (diffSeconds < 10) return 'Just now';
            if (diffSeconds < 60) return `${diffSeconds}s ago`;
            
            const diffMinutes = Math.floor(diffSeconds / 60);
            if (diffMinutes < 60) return `${diffMinutes}min ago`;
            
            const diffHours = Math.floor(diffMinutes / 60);
            return `${diffHours}h ago`;
        } catch {
            return timestamp;
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '-';
        
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
            });
        } catch {
            return timestamp;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('exam-toast');
        const toastMessage = document.getElementById('exam-toast-message');
        
        if (toast && toastMessage) {
            toastMessage.textContent = message;
            toast.className = `exam-toast show ${type}`;
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    }
}

// Create global instance
window.examLogsPage = new ExamLogsPage();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExamLogsPage;
}

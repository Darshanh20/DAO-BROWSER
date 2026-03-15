/**
 * Shared Export Helpers for Exam Mode
 * Reusable functions for PDF and CSV export across multiple contexts
 * (ExamLogsPage, ExamSessionBanner, etc.)
 */

/**
 * Download exam data as PDF from any context
 * Handles both file-based logs and live session logs
 * 
 * @param {Object} params - Export parameters
 * @param {string} params.sessionId - Exam session ID
 * @param {Object} params.examData - Exam metadata (name, subject, duration, etc)
 * @param {Array} params.students - Student records with summary stats
 * @param {Array} params.allLogs - All activity logs for export
 * @param {string} params.backendUrl - Backend base URL (optional, default: http://localhost:5000)
 * @returns {Promise<Object>} - { success, filePath } or { cancelled: true } or { success: false, error }
 */
async function downloadExamPDF({ sessionId, examData, students, allLogs, backendUrl = 'http://localhost:5000' }) {
    try {
        // Ensure allLogs is an array
        let logs = allLogs;
        if (allLogs && typeof allLogs === 'object' && !Array.isArray(allLogs)) {
            // If response wrapper, extract logs array
            logs = allLogs.logs || allLogs.data || [];
        }

        console.log('[ExportHelpers] Starting PDF export', {
            sessionId,
            examName: examData?.sessionName,
            studentCount: students?.length,
            logCount: logs?.length
        });

        // Invoke main process PDF export via IPC
        const result = await window.ipcRenderer.invoke('export-exam-pdf', {
            examData: {
                session_id: sessionId,
                ...examData
            },
            students: students || [],
            allLogs: logs || []
        });

        if (result.cancelled) {
            console.log('[ExportHelpers] PDF export cancelled by user');
            return { cancelled: true };
        }

        if (result.success) {
            console.log('[ExportHelpers] PDF exported successfully:', result.filePath);
            return { success: true, filePath: result.filePath };
        }

        throw new Error(result.error || 'PDF export failed');

    } catch (error) {
        console.error('[ExportHelpers] PDF export error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Download exam data as CSV
 * Creates a blob and triggers browser download
 * 
 * @param {Object} params - Export parameters
 * @param {string} params.sessionId - Exam session ID
 * @param {Object} params.examData - Exam metadata
 * @param {Array} params.students - Student records
 * @returns {Object} - { success: true } or { success: false, error }
 */
function downloadExamCSV({ sessionId, examData, students }) {
    try {
        if (!students || students.length === 0) {
            return { success: false, error: 'No student data to export' };
        }

        console.log('[ExportHelpers] Starting CSV export', {
            sessionId,
            studentCount: students.length
        });

        // Build CSV headers
        const headers = [
            'Roll Number',
            'Student Name',
            'Status',
            'Blocked URLs',
            'Window Switches',
            'DevTools Attempts',
            'Alert'
        ];

        // Build CSV rows
        const rows = students.map(student => [
            student.roll_number,
            student.student_name,
            student.alert ? 'ALERT' : 'Normal',
            student.blocked_attempts || 0,
            student.window_switches || 0,
            student.devtools_attempts || 0,
            student.alert ? 'YES' : 'NO'
        ]);

        // Create CSV string
        let csv = headers.join(',') + '\n';
        csv += rows.map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`)
                .join(',')
        ).join('\n');

        // Create blob and download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const filename = `exam_report_${sessionId || 'unknown'}_${Date.now()}.csv`;
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();

        URL.revokeObjectURL(url);

        console.log('[ExportHelpers] CSV export completed:', filename);
        return { success: true, filename };

    } catch (error) {
        console.error('[ExportHelpers] CSV export error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Fetch all logs from backend with fallback to cached logs
 * 
 * @param {string} sessionId - Exam session ID
 * @param {string} backendUrl - Backend base URL
 * @param {Array} fallbackLogs - Cached logs to use if fetch fails
 * @returns {Promise<Array>} - Array of logs or empty array
 */
async function fetchAllLogs(sessionId, backendUrl = 'http://localhost:5000', fallbackLogs = []) {
    try {
        if (!sessionId) {
            console.warn('[ExportHelpers] No session ID, using fallback logs');
            return fallbackLogs;
        }

        console.log('[ExportHelpers] Fetching logs from backend:', sessionId);
        const response = await fetch(`${backendUrl}/api/exam/session/${sessionId}/logs/all`, {
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const data = await response.json();
        
        // Handle wrapped response
        if (data && typeof data === 'object') {
            const logs = data.logs || data.data || data;
            console.log('[ExportHelpers] Logs fetched successfully:', logs.length, 'entries');
            return Array.isArray(logs) ? logs : fallbackLogs;
        }

        return fallbackLogs;

    } catch (error) {
        console.warn('[ExportHelpers] Failed to fetch logs from backend:', error.message);
        console.log('[ExportHelpers] Using', fallbackLogs.length, 'cached logs as fallback');
        return fallbackLogs;
    }
}

/**
 * Show a toast message to user
 * Finds existing toast or creates one
 * 
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'info', 'warning' (default: 'info')
 * @param {number} duration - Display duration in ms (default: 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
    // Try to find existing toast element
    let toast = document.getElementById('exam-toast');
    let toastMessage = document.getElementById('exam-toast-message');

    if (!toast || !toastMessage) {
        console.log('[ExportHelpers] No toast element found, creating one');
        // Create toast if it doesn't exist
        toast = document.createElement('div');
        toast.id = 'exam-toast';
        toast.className = 'exam-toast';
        
        toastMessage = document.createElement('div');
        toastMessage.id = 'exam-toast-message';
        toastMessage.className = 'exam-toast-message';
        
        toast.appendChild(toastMessage);
        document.body.appendChild(toast);
    }

    toastMessage.textContent = message;
    toast.className = `exam-toast ${type}`;
    toast.style.display = 'block';

    // Auto-hide after duration
    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

// Export all helpers
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        downloadExamPDF,
        downloadExamCSV,
        fetchAllLogs,
        showToast
    };
}

// For ES6 module imports
if (typeof window !== 'undefined') {
    window.exportHelpers = {
        downloadExamPDF,
        downloadExamCSV,
        fetchAllLogs,
        showToast
    };
}

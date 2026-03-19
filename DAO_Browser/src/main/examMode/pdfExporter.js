/**
 * PDF Exporter for Exam Reports
 * Generates comprehensive PDF reports using pdfkit
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const os = require('os');

/**
 * Export exam data to PDF report
 * @param {Object} examData - Exam information
 * @param {Array} students - Array of student records with summary stats
 * @param {Array} allLogs - All activity logs for all students
 * @returns {Promise<Object>} - { success, filePath } or { cancelled: true }
 */
async function exportExamPDF(examData, students, allLogs) {
    try {
        // Show save dialog
        const { filePath, cancelled } = await dialog.showSaveDialog({
            defaultPath: path.join(
                os.homedir(),
                'Desktop',
                `exam_report_${examData.session_id || 'unknown'}_${Date.now()}.pdf`
            ),
            filters: [
                { name: 'PDF Files', extensions: ['pdf'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (cancelled || !filePath) {
            return { cancelled: true };
        }

        // Create PDF document
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4'
        });

        // Pipe to file
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        // Generate pages
        generateCoverPage(doc, examData);
        generateStudentOverviewPage(doc, students);
        generateStudentDetailsPages(doc, students, allLogs);
        
        // Clean students note if applicable
        const cleanCount = students.length - students.filter(s => 
            s.summary.blocked_attempts > 0 || 
            s.summary.devtools_attempts > 0 || 
            s.summary.window_switches > 0
        ).length;
        
        if (cleanCount > 0) {
            doc.addPage()
               .fontSize(12)
               .font('Helvetica')
               .text(
                   `${cleanCount} student(s) had zero violations — detail pages omitted.`,
                   { align: 'center' }
               );
        }

        // Finalize PDF
        doc.end();

        // Return promise that resolves when write finishes
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                resolve({ success: true, filePath });
            });
            writeStream.on('error', (err) => {
                reject(err);
            });
            doc.on('error', (err) => {
                reject(err);
            });
        });

    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Generate cover/summary page
 */
function generateCoverPage(doc, examData) {
    // Title
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text('DAOBrowser Exam Report', { align: 'center' });

    doc.moveDown(2);

    // Exam details
    doc.fontSize(12)
       .font('Helvetica');

    const details = [
        ['Exam', examData.exam_name || examData.exam_info?.name || 'Unknown'],
        ['Subject', examData.subject || examData.exam_info?.subject || '-'],
        ['Session ID', examData.session_id || '-'],
        ['Created By', examData.created_by || examData.exam_info?.created_by || '-'],
        ['Duration', `${examData.duration_minutes || examData.exam_info?.duration_minutes || '0'} minutes`],
        ['Date', examData.created_at ? 
            new Date(examData.created_at).toLocaleDateString() : 
            new Date().toLocaleDateString()]
    ];

    details.forEach(([label, value]) => {
        doc.font('Helvetica-Bold')
           .text(`${label}: `, { continued: true })
           .font('Helvetica')
           .text(value);
    });

    doc.moveDown(2);

    // Divider
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();

    doc.moveDown(1.5);

    // Summary statistics
    doc.font('Helvetica-Bold')
       .fontSize(14)
       .text('SUMMARY');

    doc.fontSize(12)
       .font('Helvetica')
       .moveDown(0.5);

    const totalViolations = students.reduce((sum, s) => {
        const summary = s.summary || {};
        return sum + (summary.blocked_attempts || 0) + 
               (summary.window_switches || 0) + 
               (summary.devtools_attempts || 0);
    }, 0);

    const alertStudents = students.filter(s => s.summary?.alert).length;
    const submittedStudents = students.filter(s => 
        s.status === 'submitted' || s.status === 'completed'
    ).length;

    doc.text(`Total Students: ${students.length}`);
    doc.text(`Submitted: ${submittedStudents}`);
    doc.text(`Active: ${students.length - submittedStudents}`);
    doc.text(`Total Violations: ${totalViolations}`);
    doc.text(`Students with Alerts: ${alertStudents}`);

    doc.moveDown(1);
    doc.fontSize(10)
       .font('Helvetica')
       .text(`Generated: ${new Date().toLocaleString()}`);
}

/**
 * Generate student overview table page
 */
function generateStudentOverviewPage(doc, students) {
    doc.addPage();

    // Title
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text('Student Overview');

    doc.moveDown(0.5);

    // Table layout
    const tableTop = doc.y;
    const cols = {
        roll: 50,
        name: 130,
        status: 240,
        blocked: 310,
        windows: 370,
        devtools: 430,
        alert: 490
    };

    // Headers
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text('Roll No', cols.roll, tableTop)
       .text('Name', cols.name, tableTop)
       .text('Status', cols.status, tableTop)
       .text('Blocked', cols.blocked, tableTop)
       .text('Win.Sw', cols.windows, tableTop)
       .text('DevTools', cols.devtools, tableTop)
       .text('Alert', cols.alert, tableTop);

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Sort: alerts first, then by violations
    const sorted = [...students].sort((a, b) => {
        const aAlert = a.summary?.alert ? 1 : 0;
        const bAlert = b.summary?.alert ? 1 : 0;
        
        if (aAlert !== bAlert) return bAlert - aAlert;
        
        const aViol = (a.summary?.blocked_attempts || 0) + 
                      (a.summary?.window_switches || 0);
        const bViol = (b.summary?.blocked_attempts || 0) + 
                      (b.summary?.window_switches || 0);
        
        return bViol - aViol;
    });

    // Rows
    sorted.forEach(student => {
        const y = doc.y;
        
        // Check if need new page
        if (y > 750) {
            doc.addPage();
            doc.moveDown();
        }

        const summary = student.summary || {};
        const isAlert = student.summary?.alert;

        doc.fontSize(9)
           .font(isAlert ? 'Helvetica-Bold' : 'Helvetica');

        // Roll number (with alert marker)
        const rollText = isAlert ? `***${student.roll_number}` : student.roll_number;
        doc.text(rollText, cols.roll, y);

        // Name
        doc.text((student.student_name || student.name || '-').substring(0, 30), cols.name, y);

        // Status
        const statusText = student.status || 'Active';
        doc.text(statusText.substring(0, 10), cols.status, y);

        // Blocked attempts
        doc.text(String(summary.blocked_attempts || 0), cols.blocked, y);

        // Window switches
        doc.text(String(summary.window_switches || 0), cols.windows, y);

        // DevTools attempts
        doc.text(String(summary.devtools_attempts || 0), cols.devtools, y);

        // Alert status
        doc.text(isAlert ? 'YES' : '-', cols.alert, y);

        doc.moveDown(0.6);
    });
}

/**
 * Generate detailed per-student pages
 */
function generateStudentDetailsPages(doc, students, allLogs) {
    // Filter students with violations
    const violators = students.filter(s => {
        const summary = s.summary || {};
        return summary.blocked_attempts > 0 || 
               summary.devtools_attempts > 0 || 
               summary.window_switches > 0;
    });

    // Sort: alerts first
    violators.sort((a, b) => {
        if (a.summary?.alert && !b.summary?.alert) return -1;
        if (!a.summary?.alert && b.summary?.alert) return 1;
        return 0;
    });

    violators.forEach(student => {
        doc.addPage();

        const summary = student.summary || {};
        const rollNumber = student.roll_number;

        // Student header
        const headerText = `${student.student_name || student.name || 'Unknown'} (${rollNumber})` +
                          (student.summary?.alert ? '  [ALERT]' : '');

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .text(headerText);

        doc.fontSize(10)
           .font('Helvetica')
           .text(`Status: ${student.status || 'Active'}`);

        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(0.5);

        // Summary section
        doc.font('Helvetica-Bold')
           .text('Summary:');

        doc.font('Helvetica')
           .fontSize(9);
        doc.text(`  Blocked Attempts: ${summary.blocked_attempts || 0}`);
        doc.text(`  Window Switches: ${summary.window_switches || 0}`);
        doc.text(`  DevTools Attempts: ${summary.devtools_attempts || 0}`);
        doc.text(`  Total Activities: ${summary.total_activities || 0}`);

        doc.moveDown(0.5);
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('Activity Timeline:');

        doc.moveDown(0.3);

        // Get student's logs
        const studentLogs = allLogs.filter(log => 
            log.roll_number === rollNumber
        );

        // Activity entries
        doc.fontSize(9);
        studentLogs.forEach(log => {
            // Check page bottom
            if (doc.y > 750) {
                doc.addPage();
                doc.moveDown();
            }

            const time = log.timestamp ? 
                new Date(log.timestamp).toLocaleTimeString() : 
                'N/A';

            let typeLabel = '';
            switch (log.type?.toLowerCase()) {
                case 'blocked_url':
                case 'blocked_url_attempt':
                    typeLabel = 'BLOCKED';
                    break;
                case 'window_switched':
                    typeLabel = 'WARNING';
                    break;
                case 'devtools_attempt':
                    typeLabel = 'BLOCKED';
                    break;
                case 'url_visited':
                    typeLabel = 'VISITED';
                    break;
                default:
                    typeLabel = (log.type || 'ACTIVITY').toUpperCase();
            }

            doc.font('Helvetica-Bold')
               .text(`  ${time}  ${typeLabel}`, { continued: true })
               .font('Helvetica')
               .text(log.url ? `  ${log.url.substring(0, 50)}` : '');

            if (log.reason) {
                doc.text(`            Reason: ${log.reason.substring(0, 60)}`);
            }
            if (log.away_duration_seconds !== undefined) {
                doc.text(`            Away for: ${log.away_duration_seconds} seconds`);
            }

            doc.moveDown(0.2);
        });
    });
}

module.exports = { exportExamPDF };

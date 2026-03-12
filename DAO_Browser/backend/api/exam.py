"""
Exam API - REST endpoints for real-time exam monitoring
Flask Blueprint for exam session and activity log management
"""

from flask import Blueprint, request, jsonify
import logging
import sys
import os
from datetime import datetime, timedelta

# Add the parent directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.exam_session import (
    init_exam_database,
    register_session,
    get_session,
    get_session_status,
    end_session,
    update_student,
    submit_student,
    get_session_students,
    add_activity_logs,
    get_student_logs,
    get_all_session_logs
)

# Create Blueprint
exam_bp = Blueprint('exam', __name__, url_prefix='/api/exam')

logger = logging.getLogger(__name__)

# Initialize exam database
init_exam_database()

# ==================== SESSION MANAGEMENT ====================

@exam_bp.route('/session/register', methods=['POST'])
def api_register_session():
    """
    Register a new exam session (called by professor when creating exam)
    
    POST /api/exam/session/register
    Body: {
        "session_id": "123456",
        "exam_name": "Database Practical",
        "subject": "Database Systems",
        "duration_minutes": 60
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        session_id = data.get('session_id')
        exam_name = data.get('exam_name', 'Unknown Exam')
        subject = data.get('subject', '')
        duration_minutes = data.get('duration_minutes', 60)
        
        if not session_id:
            return jsonify({'success': False, 'error': 'session_id is required'}), 400
        
        logger.info(f"Registering exam session: {session_id} - {exam_name}")
        
        result = register_session(session_id, exam_name, subject, duration_minutes)
        
        if result['success']:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error registering session: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@exam_bp.route('/session/<session_id>/status', methods=['GET'])
def api_get_session_status(session_id):
    """
    Get session status (used by students to check if session ended)
    
    GET /api/exam/session/{session_id}/status
    Returns: { "status": "active" } or { "status": "ended" }
    """
    try:
        result = get_session_status(session_id)
        
        if result['success']:
            return jsonify({'status': result['status']}), 200
        else:
            return jsonify({'status': 'not_found'}), 404
    
    except Exception as e:
        logger.error(f"Error getting session status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@exam_bp.route('/session/<session_id>', methods=['DELETE'])
def api_end_session(session_id):
    """
    End an exam session (professor action)
    
    DELETE /api/exam/session/{session_id}
    """
    try:
        logger.info(f"Ending exam session: {session_id}")
        
        result = end_session(session_id)
        
        if result['success']:
            return jsonify({'success': True, 'message': 'Session ended'}), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error ending session: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== STUDENT LOG SYNC ====================

@exam_bp.route('/log', methods=['POST'])
def api_post_log():
    """
    Receive activity logs from student browser (called every 10s)
    
    POST /api/exam/log
    Body: {
        "session_id": "123456",
        "student": {
            "name": "John Doe",
            "roll_number": "21CS101"
        },
        "logs": [...],
        "current_url": "https://w3schools.com",
        "status": "active",
        "last_seen": "..."
    }
    
    Returns:
    - { "received": true } on success
    - { "received": false, "session_ended": true } if session was ended by professor
    """
    try:
        data = request.get_json()
        
        logger.info(f"[ExamLog] Received log request: {data}")
        
        if not data:
            logger.warning("[ExamLog] No data provided")
            return jsonify({'received': False, 'error': 'No data provided'}), 400
        
        session_id = data.get('session_id')
        student = data.get('student', {})
        logs = data.get('logs', [])
        current_url = data.get('current_url', '')
        status = data.get('status', 'active')
        
        if not session_id:
            logger.warning("[ExamLog] Missing session_id")
            return jsonify({'received': False, 'error': 'session_id required'}), 400
        
        if not student.get('roll_number'):
            logger.warning("[ExamLog] Missing roll_number")
            return jsonify({'received': False, 'error': 'student roll_number required'}), 400
        
        roll_number = student['roll_number']
        student_name = student.get('name', 'Unknown')
        
        logger.info(f"[ExamLog] Processing: session={session_id}, student={student_name} ({roll_number}), logs={len(logs)}")
        
        # Check if session is still active
        session = get_session(session_id)
        
        if not session:
            # Session doesn't exist - auto-register it (fallback)
            register_session(session_id, 'Unknown Exam')
            session = get_session(session_id)
        
        if session['status'] == 'ended':
            # Session was ended by professor - tell student to submit
            logger.info(f"Student {roll_number} sync rejected - session {session_id} ended")
            return jsonify({
                'received': False,
                'session_ended': True,
                'message': 'Exam has been ended by professor'
            }), 200
        
        # Update student record
        update_student(session_id, roll_number, student_name, current_url, status)
        
        # Add activity logs
        if logs and len(logs) > 0:
            add_activity_logs(session_id, roll_number, logs)
            logger.info(f"[ExamLog] Added {len(logs)} logs for {roll_number}")
        
        logger.info(f"[ExamLog] SUCCESS - student {roll_number} synced, url={current_url}")
        return jsonify({'received': True}), 200
    
    except Exception as e:
        logger.error(f"Error processing log: {e}")
        return jsonify({'received': False, 'error': str(e)}), 500

@exam_bp.route('/student/submit', methods=['POST'])
def api_student_submit():
    """
    Mark student as submitted (called when student submits exam)
    
    POST /api/exam/student/submit
    Body: {
        "session_id": "123456",
        "roll_number": "21CS101"
    }
    """
    try:
        data = request.get_json()
        
        session_id = data.get('session_id')
        roll_number = data.get('roll_number')
        
        if not session_id or not roll_number:
            return jsonify({'success': False, 'error': 'session_id and roll_number required'}), 400
        
        result = submit_student(session_id, roll_number)
        
        return jsonify(result), 200 if result['success'] else 400
    
    except Exception as e:
        logger.error(f"Error submitting student: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== PROFESSOR DASHBOARD ====================

@exam_bp.route('/session/<session_id>/students', methods=['GET'])
def api_get_students(session_id):
    """
    Get all students in a session with summary stats
    (called by professor dashboard every 10s)
    
    GET /api/exam/session/{session_id}/students
    """
    try:
        logger.info(f"[Dashboard] Fetching students for session: {session_id}")
        
        result = get_session_students(session_id)
        
        # Add session info
        session = get_session(session_id)
        if session:
            result['session_info'] = session
        
        students_count = len(result.get('students', []))
        logger.info(f"[Dashboard] Found {students_count} students in session {session_id}")
        
        # Calculate student statuses based on last_seen
        now = datetime.now()
        for student in result.get('students', []):
            last_seen = student.get('last_seen')
            student_status = student.get('status', 'active')
            
            if student_status == 'submitted':
                student['live_status'] = 'submitted'
            elif last_seen:
                try:
                    last_seen_dt = datetime.fromisoformat(last_seen)
                    seconds_ago = (now - last_seen_dt).total_seconds()
                    
                    if seconds_ago < 30:
                        student['live_status'] = 'active'
                    elif seconds_ago < 60:
                        student['live_status'] = 'idle'
                    else:
                        student['live_status'] = 'lost'
                except:
                    student['live_status'] = 'unknown'
            else:
                student['live_status'] = 'unknown'
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error getting students: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@exam_bp.route('/session/<session_id>/logs/<roll_number>', methods=['GET'])
def api_get_student_logs(session_id, roll_number):
    """
    Get full activity log for one student
    
    GET /api/exam/session/{session_id}/logs/{roll_number}
    """
    try:
        result = get_student_logs(session_id, roll_number)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error getting student logs: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@exam_bp.route('/session/<session_id>/logs/all', methods=['GET'])
def api_get_all_logs(session_id):
    """
    Get all activity logs for entire session (for export)
    
    GET /api/exam/session/{session_id}/logs/all
    """
    try:
        result = get_all_session_logs(session_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error getting all logs: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# ==================== HEALTH CHECK ====================

@exam_bp.route('/health', methods=['GET'])
def api_health():
    """
    Health check for exam API
    
    GET /api/exam/health
    """
    return jsonify({
        'status': 'running',
        'service': 'Exam Activity Sync',
        'timestamp': datetime.now().isoformat()
    }), 200

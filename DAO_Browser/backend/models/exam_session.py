"""
Exam Session Model
SQLite database model for exam sessions and activity logs
"""

import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Optional

# Database file path
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'exam_sessions.db')

def get_connection():
    """Create and return a database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_exam_database():
    """Initialize the exam database with required tables"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create exam_sessions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exam_sessions (
            session_id TEXT PRIMARY KEY,
            exam_name TEXT NOT NULL,
            subject TEXT,
            duration_minutes INTEGER,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME
        )
    ''')
    
    # Create exam_students table (tracks students in each session)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exam_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            roll_number TEXT NOT NULL,
            student_name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            current_url TEXT,
            last_seen DATETIME,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            submitted_at DATETIME,
            UNIQUE(session_id, roll_number),
            FOREIGN KEY (session_id) REFERENCES exam_sessions(session_id)
        )
    ''')
    
    # Create exam_activity table (individual log entries)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS exam_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            roll_number TEXT NOT NULL,
            log_type TEXT NOT NULL,
            log_data TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            integrity_failed BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES exam_sessions(session_id)
        )
    ''')
    
    # Create indexes for faster queries
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_activity_session 
        ON exam_activity(session_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_activity_student 
        ON exam_activity(session_id, roll_number)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_activity_timestamp 
        ON exam_activity(timestamp DESC)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_students_session 
        ON exam_students(session_id)
    ''')
    
    # Migration: Add integrity_failed column if it doesn't exist
    try:
        cursor.execute("PRAGMA table_info(exam_activity)")
        columns = [column[1] for column in cursor.fetchall()]
        if 'integrity_failed' not in columns:
            cursor.execute('''
                ALTER TABLE exam_activity 
                ADD COLUMN integrity_failed BOOLEAN DEFAULT 0
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_activity_integrity 
                ON exam_activity(session_id, integrity_failed)
            ''')
            print("[Migration] Added integrity_failed column to exam_activity table")
    except Exception as e:
        print(f"[Migration Warning] Could not add integrity column: {e}")
    
    conn.commit()
    conn.close()
    print("[OK] Exam sessions database initialized")

# ==================== SESSION MANAGEMENT ====================

def register_session(session_id: str, exam_name: str, subject: str = None, 
                     duration_minutes: int = None) -> Dict:
    """Register a new exam session"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Check if session already exists
        cursor.execute('SELECT session_id FROM exam_sessions WHERE session_id = ?', (session_id,))
        if cursor.fetchone():
            conn.close()
            return {'success': False, 'error': 'Session already exists'}
        
        cursor.execute('''
            INSERT INTO exam_sessions (session_id, exam_name, subject, duration_minutes, status)
            VALUES (?, ?, ?, ?, 'active')
        ''', (session_id, exam_name, subject, duration_minutes))
        
        conn.commit()
        conn.close()
        
        print(f"[ExamDB] Session registered: {session_id}")
        return {'success': True, 'session_id': session_id}
        
    except Exception as e:
        print(f"[ExamDB ERROR] Failed to register session: {e}")
        return {'success': False, 'error': str(e)}

def get_session(session_id: str) -> Optional[Dict]:
    """Get session details"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM exam_sessions WHERE session_id = ?', (session_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return dict(row)
        return None
        
    except Exception as e:
        print(f"[ExamDB ERROR] Failed to get session: {e}")
        return None

def get_session_status(session_id: str) -> Dict:
    """Get just the session status"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT status FROM exam_sessions WHERE session_id = ?', (session_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {'success': True, 'status': row['status']}
        return {'success': False, 'error': 'Session not found'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def end_session(session_id: str) -> Dict:
    """End an exam session (professor action)"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Check if session exists
        cursor.execute('SELECT status FROM exam_sessions WHERE session_id = ?', (session_id,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return {'success': False, 'error': 'Session not found'}
        
        if row['status'] == 'ended':
            conn.close()
            return {'success': True, 'message': 'Session already ended'}
        
        # Update session status
        cursor.execute('''
            UPDATE exam_sessions 
            SET status = 'ended', ended_at = ?
            WHERE session_id = ?
        ''', (datetime.now().isoformat(), session_id))
        
        # Mark all active students as submitted
        cursor.execute('''
            UPDATE exam_students 
            SET status = 'submitted', submitted_at = ?
            WHERE session_id = ? AND status = 'active'
        ''', (datetime.now().isoformat(), session_id))
        
        conn.commit()
        conn.close()
        
        print(f"[ExamDB] Session ended: {session_id}")
        return {'success': True}
        
    except Exception as e:
        print(f"[ExamDB ERROR] Failed to end session: {e}")
        return {'success': False, 'error': str(e)}

# ==================== STUDENT MANAGEMENT ====================

def update_student(session_id: str, roll_number: str, student_name: str,
                   current_url: str = None, status: str = 'active') -> Dict:
    """Update or create student record"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        now = datetime.now().isoformat()
        
        # Try to update existing student
        cursor.execute('''
            UPDATE exam_students 
            SET student_name = ?, current_url = ?, last_seen = ?, status = ?
            WHERE session_id = ? AND roll_number = ?
        ''', (student_name, current_url, now, status, session_id, roll_number))
        
        if cursor.rowcount == 0:
            # Student doesn't exist, insert new
            cursor.execute('''
                INSERT INTO exam_students 
                (session_id, roll_number, student_name, current_url, last_seen, status, joined_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (session_id, roll_number, student_name, current_url, now, status, now))
            print(f"[ExamDB] New student joined: {roll_number} in session {session_id}")
        
        conn.commit()
        conn.close()
        
        return {'success': True}
        
    except Exception as e:
        print(f"[ExamDB ERROR] Failed to update student: {e}")
        return {'success': False, 'error': str(e)}

def submit_student(session_id: str, roll_number: str) -> Dict:
    """Mark student as submitted"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            UPDATE exam_students 
            SET status = 'submitted', submitted_at = ?
            WHERE session_id = ? AND roll_number = ?
        ''', (datetime.now().isoformat(), session_id, roll_number))
        
        conn.commit()
        conn.close()
        
        print(f"[ExamDB] Student submitted: {roll_number}")
        return {'success': True}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_session_students(session_id: str) -> Dict:
    """Get all students in a session with their summary stats"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get all students in session
        cursor.execute('''
            SELECT * FROM exam_students 
            WHERE session_id = ?
            ORDER BY roll_number
        ''', (session_id,))
        
        students_rows = cursor.fetchall()
        students = []
        
        for row in students_rows:
            student = dict(row)
            roll = student['roll_number']
            
            # Get activity summary for this student
            cursor.execute('''
                SELECT log_type, COUNT(*) as count 
                FROM exam_activity 
                WHERE session_id = ? AND roll_number = ?
                GROUP BY log_type
            ''', (session_id, roll))
            
            summary = {
                'blocked_attempts': 0,
                'window_switches': 0,
                'devtools_attempts': 0,
                'total_activities': 0
            }
            
            for activity_row in cursor.fetchall():
                log_type = activity_row['log_type']
                count = activity_row['count']
                summary['total_activities'] += count
                
                if 'blocked' in log_type.lower():
                    summary['blocked_attempts'] += count
                elif log_type == 'window_switched':
                    summary['window_switches'] += count
                elif log_type == 'devtools_attempt':
                    summary['devtools_attempts'] += count
            
            # Alert threshold
            summary['alert'] = (summary['blocked_attempts'] > 5 or 
                               summary['devtools_attempts'] > 2)
            
            student['summary'] = summary
            students.append(student)
        
        conn.close()
        
        return {
            'success': True,
            'session_id': session_id,
            'students': students
        }
        
    except Exception as e:
        print(f"[ExamDB ERROR] Failed to get students: {e}")
        return {'success': False, 'error': str(e)}

# ==================== ACTIVITY LOGGING ====================

def add_activity_logs(session_id: str, roll_number: str, logs: List[Dict], integrity_failed: bool = False) -> Dict:
    """Add multiple activity log entries"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        added = 0
        for log in logs:
            log_type = log.get('type', 'unknown')
            timestamp = log.get('timestamp', datetime.now().isoformat())
            log_data = json.dumps(log)
            
            cursor.execute('''
                INSERT INTO exam_activity 
                (session_id, roll_number, log_type, log_data, timestamp, integrity_failed)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (session_id, roll_number, log_type, log_data, timestamp, integrity_failed))
            added += 1
        
        conn.commit()
        conn.close()
        
        return {'success': True, 'added': added}
        
    except Exception as e:
        print(f"[ExamDB ERROR] Failed to add logs: {e}")
        return {'success': False, 'error': str(e)}

def get_student_logs(session_id: str, roll_number: str) -> Dict:
    """Get all activity logs for a specific student"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT * FROM exam_activity 
            WHERE session_id = ? AND roll_number = ?
            ORDER BY timestamp ASC
        ''', (session_id, roll_number))
        
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for row in rows:
            log = json.loads(row['log_data'])
            log['db_id'] = row['id']
            logs.append(log)
        
        return {
            'success': True,
            'session_id': session_id,
            'roll_number': roll_number,
            'logs': logs
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_all_session_logs(session_id: str) -> Dict:
    """Get all activity logs for entire session"""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get session info
        session = get_session(session_id)
        
        # Get all students
        cursor.execute('''
            SELECT roll_number, student_name FROM exam_students 
            WHERE session_id = ?
        ''', (session_id,))
        students = {row['roll_number']: row['student_name'] for row in cursor.fetchall()}
        
        # Get all logs
        cursor.execute('''
            SELECT * FROM exam_activity 
            WHERE session_id = ?
            ORDER BY timestamp ASC
        ''', (session_id,))
        
        rows = cursor.fetchall()
        conn.close()
        
        logs = []
        for row in rows:
            log = json.loads(row['log_data'])
            log['roll_number'] = row['roll_number']
            log['student_name'] = students.get(row['roll_number'], 'Unknown')
            logs.append(log)
        
        return {
            'success': True,
            'session_id': session_id,
            'session_info': session,
            'logs': logs
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

# Initialize database on module import
if __name__ == '__main__':
    init_exam_database()

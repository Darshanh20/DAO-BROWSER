"""
Database module for D.A.O. Browser history tracking
Uses SQLite for local storage
"""

import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Optional

# Database file path
DB_PATH = os.path.join(os.path.dirname(__file__), 'browser_history.db')

def get_connection():
    """Create and return a database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    return conn

def init_database():
    """Initialize the database with required tables"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Create browsing_history table with profile_id support
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS browsing_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER DEFAULT 1,
            url TEXT NOT NULL,
            title TEXT,
            visit_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            visit_count INTEGER DEFAULT 1,
            favicon_url TEXT,
            visit_duration INTEGER DEFAULT 0,
            UNIQUE(profile_id, url)
        )
    ''')
    
    # Create index for faster searches
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_url ON browsing_history(url)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_visit_time ON browsing_history(visit_time DESC)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_title ON browsing_history(title)
    ''')
    
    # Migration: Add profile_id column if it doesn't exist (must run BEFORE creating index)
    try:
        cursor.execute('ALTER TABLE browsing_history ADD COLUMN profile_id INTEGER DEFAULT 1')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Create profile_id index (after migration ensures column exists)
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_profile_id ON browsing_history(profile_id)
    ''')

    # Focus mode sessions and telemetry
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS focus_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER DEFAULT 1,
            started_at TIMESTAMP NOT NULL,
            ended_at TIMESTAMP,
            total_focus_seconds INTEGER DEFAULT 0,
            total_sites_visited INTEGER DEFAULT 0,
            blocked_attempts_count INTEGER DEFAULT 0,
            breaks_taken INTEGER DEFAULT 0,
            motivational_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS focus_session_sites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            domain TEXT NOT NULL,
            visited_at TIMESTAMP NOT NULL,
            FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS focus_session_blocked_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            domain TEXT NOT NULL,
            reason TEXT,
            attempted_at TIMESTAMP NOT NULL,
            FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS focus_session_breaks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            break_started_at TIMESTAMP NOT NULL,
            break_ended_at TIMESTAMP NOT NULL,
            duration_seconds INTEGER DEFAULT 300,
            FOREIGN KEY (session_id) REFERENCES focus_sessions(id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_focus_sessions_profile_id ON focus_sessions(profile_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_focus_sites_session_id ON focus_session_sites(session_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_focus_blocked_session_id ON focus_session_blocked_attempts(session_id)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_focus_breaks_session_id ON focus_session_breaks(session_id)
    ''')
    
    conn.commit()
    conn.close()

def add_history(url: str, title: str = None, favicon_url: str = None, visit_duration: int = 0, profile_id: int = 1) -> Dict:
    """
    Add a URL to browsing history for a specific profile
    If URL exists for this profile, increment visit_count and update visit_time
    
    Args:
        url: The visited URL
        title: Page title (optional)
        favicon_url: Favicon URL (optional)
        visit_duration: Time spent on page in seconds (optional)
        profile_id: The profile ID this history belongs to
    
    Returns:
        Dict with success status and entry data
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Validate profile_id
        if not profile_id or profile_id <= 0:
            profile_id = 1  # Default to profile 1
            print(f"[History] Using default profile: {profile_id}")
        # Get current timestamp in ISO format for consistency
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Check if URL already exists for this profile
        cursor.execute('SELECT id, visit_count FROM browsing_history WHERE url = ? AND profile_id = ?', (url, profile_id))
        existing = cursor.fetchone()
        
        if existing:
            # URL exists, increment visit_count and update time
            new_count = existing['visit_count'] + 1
            cursor.execute('''
                UPDATE browsing_history 
                SET visit_count = ?, 
                    visit_time = ?,
                    title = COALESCE(?, title),
                    favicon_url = COALESCE(?, favicon_url),
                    visit_duration = visit_duration + ?
                WHERE url = ? AND profile_id = ?
            ''', (new_count, current_time, title, favicon_url, visit_duration, url, profile_id))
            entry_id = existing['id']
            print(f"[History DB] Updated visit count for {url} (profile: {profile_id})")
        else:
            # New URL, insert it with explicit timestamp
            cursor.execute('''
                INSERT INTO browsing_history (url, title, favicon_url, visit_duration, visit_time, profile_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (url, title, favicon_url, visit_duration, current_time, profile_id))
            entry_id = cursor.lastrowid
            print(f"[History DB] Inserted new entry (ID: {entry_id}, profile: {profile_id})")

        # IMPORTANT: Commit the transaction to save changes
        conn.commit()

        # Fetch the complete entry
        cursor.execute('SELECT * FROM browsing_history WHERE id = ?', (entry_id,))
        entry = dict(cursor.fetchone())
        conn.close()
        
        return {
            'success': True,
            'data': entry
        }
    
    except Exception as e:
        print(f"[History DB ERROR] Failed to add history: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

def get_history(page: int = 1, limit: int = 50, profile_id: int = None) -> Dict:
    """
    Get browsing history with pagination, optionally filtered by profile
    
    Args:
        page: Page number (starting from 1)
        limit: Number of entries per page
        profile_id: Filter by profile ID (optional, None = all profiles)
    
    Returns:
        Dict with history entries and pagination info
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        offset = (page - 1) * limit
        
        # Build query based on profile_id filter
        if profile_id is not None:
            # Get total count for this profile
            cursor.execute('SELECT COUNT(*) as count FROM browsing_history WHERE profile_id = ?', (profile_id,))
            total = cursor.fetchone()['count']
            
            # Get paginated entries for this profile
            cursor.execute('''
                SELECT * FROM browsing_history 
                WHERE profile_id = ?
                ORDER BY visit_time DESC 
                LIMIT ? OFFSET ?
            ''', (profile_id, limit, offset))
        else:
            # Get total count (all profiles)
            cursor.execute('SELECT COUNT(*) as count FROM browsing_history')
            total = cursor.fetchone()['count']
            
            # Get paginated entries (all profiles)
            cursor.execute('''
                SELECT * FROM browsing_history 
                ORDER BY visit_time DESC 
                LIMIT ? OFFSET ?
            ''', (limit, offset))
        
        entries = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return {
            'success': True,
            'data': entries,
            'pagination': {
                'page': page,
                'limit': limit,
                'total': total,
                'total_pages': (total + limit - 1) // limit
            }
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def search_history(query: str, limit: int = 50, profile_id: int = None) -> Dict:
    """
    Search browsing history by URL or title, optionally filtered by profile
    
    Args:
        query: Search query string
        limit: Maximum number of results
        profile_id: Filter by profile ID (optional, None = all profiles)
    
    Returns:
        Dict with matching entries
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        search_pattern = f'%{query}%'
        
        if profile_id is not None:
            cursor.execute('''
                SELECT * FROM browsing_history 
                WHERE profile_id = ? AND (url LIKE ? OR title LIKE ?)
                ORDER BY visit_time DESC
                LIMIT ?
            ''', (profile_id, search_pattern, search_pattern, limit))
        else:
            cursor.execute('''
                SELECT * FROM browsing_history 
                WHERE url LIKE ? OR title LIKE ?
                ORDER BY visit_time DESC
                LIMIT ?
            ''', (search_pattern, search_pattern, limit))
        
        entries = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return {
            'success': True,
            'data': entries,
            'count': len(entries)
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def delete_history(entry_id: int) -> Dict:
    """
    Delete a specific history entry by ID
    
    Args:
        entry_id: The ID of the entry to delete
    
    Returns:
        Dict with success status
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM browsing_history WHERE id = ?', (entry_id,))
        deleted = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        if deleted > 0:
            return {
                'success': True,
                'message': 'Entry deleted successfully'
            }
        else:
            return {
                'success': False,
                'error': 'Entry not found'
            }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def delete_history_by_url(url: str) -> Dict:
    """
    Delete all history entries for a specific URL
    
    Args:
        url: The URL to delete
    
    Returns:
        Dict with success status
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('DELETE FROM browsing_history WHERE url = ?', (url,))
        deleted = cursor.rowcount
        
        conn.commit()
        conn.close()
        
        return {
            'success': True,
            'deleted': deleted,
            'message': f'Deleted {deleted} entries'
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def clear_all_history(profile_id: int = None) -> Dict:
    """
    Clear all browsing history, optionally for a specific profile
    
    Args:
        profile_id: Clear only this profile's history (optional, None = all)
    
    Returns:
        Dict with success status
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        if profile_id is not None:
            cursor.execute('SELECT COUNT(*) as count FROM browsing_history WHERE profile_id = ?', (profile_id,))
            total = cursor.fetchone()['count']
            cursor.execute('DELETE FROM browsing_history WHERE profile_id = ?', (profile_id,))
        else:
            cursor.execute('SELECT COUNT(*) as count FROM browsing_history')
            total = cursor.fetchone()['count']
            cursor.execute('DELETE FROM browsing_history')
        
        conn.commit()
        conn.close()
        
        return {
            'success': True,
            'deleted': total,
            'message': f'Cleared {total} history entries'
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def get_history_stats(profile_id: int = None) -> Dict:
    """
    Get statistics about browsing history, optionally for a specific profile
    
    Args:
        profile_id: Get stats for this profile only (optional, None = all)
    
    Returns:
        Dict with statistics
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        if profile_id is not None:
            # Profile-specific stats
            cursor.execute('SELECT COUNT(*) as total FROM browsing_history WHERE profile_id = ?', (profile_id,))
            total = cursor.fetchone()['total']
            
            cursor.execute('SELECT COUNT(DISTINCT url) as unique_urls FROM browsing_history WHERE profile_id = ?', (profile_id,))
            unique = cursor.fetchone()['unique_urls']
            
            cursor.execute('''
                SELECT url, title, visit_count 
                FROM browsing_history 
                WHERE profile_id = ?
                ORDER BY visit_count DESC 
                LIMIT 10
            ''', (profile_id,))
            most_visited = [dict(row) for row in cursor.fetchall()]
            
            cursor.execute('''
                SELECT url, title, visit_time 
                FROM browsing_history 
                WHERE profile_id = ?
                ORDER BY visit_time DESC 
                LIMIT 10
            ''', (profile_id,))
            recent = [dict(row) for row in cursor.fetchall()]
            
            cursor.execute('SELECT SUM(visit_duration) as total_duration FROM browsing_history WHERE profile_id = ?', (profile_id,))
        else:
            # All profiles stats
            cursor.execute('SELECT COUNT(*) as total FROM browsing_history')
            total = cursor.fetchone()['total']
            
            cursor.execute('SELECT COUNT(DISTINCT url) as unique_urls FROM browsing_history')
            unique = cursor.fetchone()['unique_urls']
            
            cursor.execute('''
                SELECT url, title, visit_count 
                FROM browsing_history 
                ORDER BY visit_count DESC 
                LIMIT 10
            ''')
            most_visited = [dict(row) for row in cursor.fetchall()]
            
            cursor.execute('''
                SELECT url, title, visit_time 
                FROM browsing_history 
                ORDER BY visit_time DESC 
                LIMIT 10
            ''')
            recent = [dict(row) for row in cursor.fetchall()]
            
            cursor.execute('SELECT SUM(visit_duration) as total_duration FROM browsing_history')
        
        duration_result = cursor.fetchone()
        total_duration = duration_result['total_duration'] or 0
        
        conn.close()
        
        return {
            'success': True,
            'stats': {
                'total_entries': total,
                'unique_urls': unique,
                'total_duration_seconds': total_duration,
                'total_duration_hours': round(total_duration / 3600, 2),
                'most_visited': most_visited,
                'recent_visits': recent
            }
        }
    
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def _generate_focus_message(total_focus_seconds: int) -> str:
    """Build a short motivational message based on session length."""
    minutes = max(1, round(total_focus_seconds / 60))
    if minutes >= 45:
        return f"Amazing focus! You crushed a {minutes}-minute session!"
    if minutes >= 25:
        return f"Great work! You stayed locked in for {minutes} minutes."
    if minutes >= 10:
        return f"Nice momentum! You completed a {minutes}-minute focus block."
    return f"Solid start. Every focused minute counts ({minutes} min)."


def start_focus_session(profile_id: int = 1, started_at: str = None) -> Dict:
    """Create a focus session row and return the new session ID."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        normalized_profile_id = profile_id if isinstance(profile_id, int) and profile_id > 0 else 1
        started = started_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute('''
            INSERT INTO focus_sessions (profile_id, started_at)
            VALUES (?, ?)
        ''', (normalized_profile_id, started))

        session_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return {
            'success': True,
            'session_id': session_id,
            'started_at': started,
            'profile_id': normalized_profile_id
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def log_focus_site_visit(session_id: int, url: str, domain: str, visited_at: str = None) -> Dict:
    """Persist a single visited site event for a focus session."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        timestamp = visited_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO focus_session_sites (session_id, url, domain, visited_at)
            VALUES (?, ?, ?, ?)
        ''', (session_id, url, domain, timestamp))

        conn.commit()
        conn.close()

        return {'success': True}
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def log_focus_blocked_attempt(session_id: int, url: str, domain: str, reason: str = '', attempted_at: str = None) -> Dict:
    """Persist a blocked site attempt for a focus session."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        timestamp = attempted_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('''
            INSERT INTO focus_session_blocked_attempts (session_id, url, domain, reason, attempted_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (session_id, url, domain, reason, timestamp))

        conn.commit()
        conn.close()

        return {'success': True}
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def log_focus_break(session_id: int, break_started_at: str, break_ended_at: str, duration_seconds: int = 300) -> Dict:
    """Persist one focus break interval."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO focus_session_breaks (session_id, break_started_at, break_ended_at, duration_seconds)
            VALUES (?, ?, ?, ?)
        ''', (session_id, break_started_at, break_ended_at, duration_seconds))

        conn.commit()
        conn.close()

        return {'success': True}
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def _get_focus_session_report(cursor, session_id: int) -> Dict:
    """Fetch full report payload for a focus session using an open cursor."""
    cursor.execute('SELECT * FROM focus_sessions WHERE id = ?', (session_id,))
    session = cursor.fetchone()
    if not session:
        return {}

    session_dict = dict(session)

    cursor.execute('''
        SELECT id, url, domain, visited_at
        FROM focus_session_sites
        WHERE session_id = ?
        ORDER BY visited_at ASC
    ''', (session_id,))
    visited_sites = [dict(row) for row in cursor.fetchall()]

    cursor.execute('''
        SELECT id, url, domain, reason, attempted_at
        FROM focus_session_blocked_attempts
        WHERE session_id = ?
        ORDER BY attempted_at ASC
    ''', (session_id,))
    blocked_attempts = [dict(row) for row in cursor.fetchall()]

    cursor.execute('''
        SELECT id, break_started_at, break_ended_at, duration_seconds
        FROM focus_session_breaks
        WHERE session_id = ?
        ORDER BY break_started_at ASC
    ''', (session_id,))
    breaks = [dict(row) for row in cursor.fetchall()]

    return {
        **session_dict,
        'visited_sites': visited_sites,
        'blocked_attempts': blocked_attempts,
        'breaks': breaks
    }


def end_focus_session(session_id: int, ended_at: str = None) -> Dict:
    """Close a focus session and compute its aggregate statistics."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT started_at FROM focus_sessions WHERE id = ?', (session_id,))
        existing = cursor.fetchone()
        if not existing:
            conn.close()
            return {
                'success': False,
                'error': 'Focus session not found'
            }

        ended = ended_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute('''
            SELECT COUNT(DISTINCT domain) AS unique_sites
            FROM focus_session_sites
            WHERE session_id = ?
        ''', (session_id,))
        unique_sites = cursor.fetchone()['unique_sites'] or 0

        cursor.execute('''
            SELECT COUNT(*) AS blocked_count
            FROM focus_session_blocked_attempts
            WHERE session_id = ?
        ''', (session_id,))
        blocked_count = cursor.fetchone()['blocked_count'] or 0

        cursor.execute('''
            SELECT COUNT(*) AS breaks_count
            FROM focus_session_breaks
            WHERE session_id = ?
        ''', (session_id,))
        breaks_count = cursor.fetchone()['breaks_count'] or 0

        cursor.execute('''
            SELECT CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER) AS total_seconds
            FROM focus_sessions
            WHERE id = ?
        ''', (ended, session_id))
        total_focus_seconds = max(0, cursor.fetchone()['total_seconds'] or 0)

        motivational_message = _generate_focus_message(total_focus_seconds)

        cursor.execute('''
            UPDATE focus_sessions
            SET ended_at = ?,
                total_focus_seconds = ?,
                total_sites_visited = ?,
                blocked_attempts_count = ?,
                breaks_taken = ?,
                motivational_message = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            ended,
            total_focus_seconds,
            unique_sites,
            blocked_count,
            breaks_count,
            motivational_message,
            session_id
        ))

        report = _get_focus_session_report(cursor, session_id)
        conn.commit()
        conn.close()

        return {
            'success': True,
            'data': report
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def get_focus_history(profile_id: int = 1, limit: int = 100) -> Dict:
    """Return focus sessions with embedded report-style metrics."""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        normalized_profile_id = profile_id if isinstance(profile_id, int) and profile_id > 0 else 1
        normalized_limit = max(1, min(int(limit), 500))

        cursor.execute('''
            SELECT id
            FROM focus_sessions
            WHERE profile_id = ?
            ORDER BY started_at DESC
            LIMIT ?
        ''', (normalized_profile_id, normalized_limit))

        session_ids = [row['id'] for row in cursor.fetchall()]
        items = [_get_focus_session_report(cursor, session_id) for session_id in session_ids]

        conn.close()
        return {
            'success': True,
            'data': items,
            'count': len(items)
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

# Initialize database when module is imported
init_database()

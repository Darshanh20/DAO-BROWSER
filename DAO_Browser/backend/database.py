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
    
    # Create browsing_history table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS browsing_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT,
            visit_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            visit_count INTEGER DEFAULT 1,
            favicon_url TEXT,
            visit_duration INTEGER DEFAULT 0,
            UNIQUE(url)
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
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

def add_history(url: str, title: str = None, favicon_url: str = None, visit_duration: int = 0) -> Dict:
    """
    Add a URL to browsing history
    If URL exists, increment visit_count and update visit_time
    
    Args:
        url: The visited URL
        title: Page title (optional)
        favicon_url: Favicon URL (optional)
        visit_duration: Time spent on page in seconds (optional)
    
    Returns:
        Dict with success status and entry data
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get current timestamp in ISO format for consistency
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Check if URL already exists
        cursor.execute('SELECT id, visit_count FROM browsing_history WHERE url = ?', (url,))
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
                WHERE url = ?
            ''', (new_count, current_time, title, favicon_url, visit_duration, url))
            entry_id = existing['id']
        else:
            # New URL, insert it with explicit timestamp
            cursor.execute('''
                INSERT INTO browsing_history (url, title, favicon_url, visit_duration, visit_time)
                VALUES (?, ?, ?, ?, ?)
            ''', (url, title, favicon_url, visit_duration, current_time))
            entry_id = cursor.lastrowid
        
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
        return {
            'success': False,
            'error': str(e)
        }

def get_history(page: int = 1, limit: int = 50) -> Dict:
    """
    Get browsing history with pagination
    
    Args:
        page: Page number (starting from 1)
        limit: Number of entries per page
    
    Returns:
        Dict with history entries and pagination info
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        offset = (page - 1) * limit
        
        # Get total count
        cursor.execute('SELECT COUNT(*) as count FROM browsing_history')
        total = cursor.fetchone()['count']
        
        # Get paginated entries
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

def search_history(query: str, limit: int = 50) -> Dict:
    """
    Search browsing history by URL or title
    
    Args:
        query: Search query string
        limit: Maximum number of results
    
    Returns:
        Dict with matching entries
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        search_pattern = f'%{query}%'
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

def clear_all_history() -> Dict:
    """
    Clear all browsing history
    
    Returns:
        Dict with success status
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
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

def get_history_stats() -> Dict:
    """
    Get statistics about browsing history
    
    Returns:
        Dict with statistics
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Total entries
        cursor.execute('SELECT COUNT(*) as total FROM browsing_history')
        total = cursor.fetchone()['total']
        
        # Total unique URLs
        cursor.execute('SELECT COUNT(DISTINCT url) as unique_urls FROM browsing_history')
        unique = cursor.fetchone()['unique_urls']
        
        # Most visited sites (top 10)
        cursor.execute('''
            SELECT url, title, visit_count 
            FROM browsing_history 
            ORDER BY visit_count DESC 
            LIMIT 10
        ''')
        most_visited = [dict(row) for row in cursor.fetchall()]
        
        # Recent visits (last 10)
        cursor.execute('''
            SELECT url, title, visit_time 
            FROM browsing_history 
            ORDER BY visit_time DESC 
            LIMIT 10
        ''')
        recent = [dict(row) for row in cursor.fetchall()]
        
        # Total visit duration (in seconds)
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

# Initialize database when module is imported
init_database()

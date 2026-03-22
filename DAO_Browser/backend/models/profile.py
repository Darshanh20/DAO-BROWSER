"""
Profile Model - Handles profile data operations
Manages profile CRUD operations and data isolation
"""

import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Optional, Union

# Profile-specific database paths  
def get_profile_db_path(profile_id: int) -> str:
    """Get database path for specific profile"""
    profile_dir = os.path.join(os.path.dirname(__file__), '..', 'profiles', f'profile_{profile_id}')
    os.makedirs(profile_dir, exist_ok=True)
    return os.path.join(profile_dir, 'profile_data.db')

# Main profiles database path (stores profile metadata)
PROFILES_DB_PATH = os.path.join(os.path.dirname(__file__), 'profiles.db')

class Profile:
    """Profile model for managing user profiles"""
    
    def __init__(self, profile_id: int = None, name: str = None, display_name: str = None, 
                 avatar_color: str = '#4A90E2', is_default: bool = False, is_active: bool = False):
        self.id = profile_id
        self.name = name
        self.display_name = display_name
        self.avatar_color = avatar_color
        self.is_default = is_default
        self.is_active = is_active
        self.created_at = None
        self.last_used_at = None

    def to_dict(self) -> Dict:
        """Convert profile to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name,
            'avatar_color': self.avatar_color,
            'is_default': self.is_default,
            'is_active': self.is_active,
            'created_at': self.created_at,
            'last_used_at': self.last_used_at
        }

    @staticmethod
    def from_dict(data: Dict) -> 'Profile':
        """Create profile from dictionary"""
        profile = Profile()
        profile.id = data.get('id')
        profile.name = data.get('name')
        profile.display_name = data.get('display_name')
        profile.avatar_color = data.get('avatar_color', '#4A90E2')
        profile.is_default = data.get('is_default', False)
        profile.is_active = data.get('is_active', False)
        profile.created_at = data.get('created_at')
        profile.last_used_at = data.get('last_used_at')
        return profile

def get_profiles_connection():
    """Get connection to profiles database"""
    conn = sqlite3.connect(PROFILES_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_profiles_database():
    """Initialize the profiles database"""
    conn = get_profiles_connection()
    cursor = conn.cursor()
    
    # Create profiles table directly with SQL
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#4A90E2',
            is_default BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS profile_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            preference_key TEXT NOT NULL,
            preference_value TEXT,
            preference_type TEXT DEFAULT 'string',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(profile_id, preference_key),
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS profile_bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            folder TEXT DEFAULT 'Default',
            favicon_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            sort_order INTEGER DEFAULT 0,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )
    ''')
    
    # Create indexes
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_profile_preferences_profile_id ON profile_preferences(profile_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_profile_bookmarks_profile_id ON profile_bookmarks(profile_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_profiles_active ON profiles(is_active)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_profiles_default ON profiles(is_default)')
    
    conn.commit()
    conn.close()
    print("✅ Profiles database initialized")

def create_profile(name: str, display_name: str, avatar_color: str = '#4A90E2', is_default: bool = False) -> Dict:
    """Create a new profile"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        # Validate inputs
        if not name or not name.strip():
            return {'success': False, 'error': 'Profile name is required'}
        
        if not display_name or not display_name.strip():
            return {'success': False, 'error': 'Display name is required'}
        
        name = name.strip()
        display_name = display_name.strip()
        
        # Check if name already exists
        cursor.execute('SELECT id FROM profiles WHERE name = ?', (name,))
        existing = cursor.fetchone()
        if existing:
            return {'success': False, 'error': 'Profile name already exists'}
        
        # If this is the first profile, make it default and active
        cursor.execute('SELECT COUNT(*) as count FROM profiles')
        count = cursor.fetchone()['count']
        if count == 0:
            is_default = True
            is_active = True
        else:
            is_active = False
        
        # Insert new profile
        cursor.execute('''
            INSERT INTO profiles (name, display_name, avatar_color, is_default, is_active)
            VALUES (?, ?, ?, ?, ?)
        ''', (name, display_name, avatar_color, is_default, is_active))
        
        profile_id = cursor.lastrowid
        
        # Get the created profile
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        profile_data = dict(cursor.fetchone())
        
        conn.commit()
        conn.close()
        
        # Initialize profile-specific database
        init_profile_database(profile_id)
        
        return {
            'success': True,
            'data': profile_data,
            'message': f'Profile "{display_name}" created successfully'
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_all_profiles() -> Dict:
    """Get all profiles"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM profiles ORDER BY created_at DESC')
        profiles = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return {
            'success': True,
            'data': profiles,
            'count': len(profiles)
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_profile_by_id(profile_id: int) -> Dict:
    """Get profile by ID"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        profile = cursor.fetchone()
        
        conn.close()
        
        if profile:
            return {'success': True, 'data': dict(profile)}
        else:
            return {'success': False, 'error': 'Profile not found'}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_active_profile() -> Dict:
    """Get currently active profile"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM profiles WHERE is_active = TRUE')
        profile = cursor.fetchone()
        
        conn.close()
        
        if profile:
            return {'success': True, 'data': dict(profile)}
        else:
            return {'success': False, 'error': 'No active profile found'}
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def update_profile(profile_id: int, **kwargs) -> Dict:
    """Update profile"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        # Check if profile exists
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        existing = cursor.fetchone()
        if not existing:
            return {'success': False, 'error': 'Profile not found'}
        
        # Build update query
        update_fields = []
        update_values = []
        
        allowed_fields = ['name', 'display_name', 'avatar_color', 'is_default', 'is_active']
        for field in allowed_fields:
            if field in kwargs:
                update_fields.append(f'{field} = ?')
                update_values.append(kwargs[field])
        
        if not update_fields:
            return {'success': False, 'error': 'No valid fields to update'}
        
        # Check for unique name constraint
        if 'name' in kwargs:
            cursor.execute('SELECT id FROM profiles WHERE name = ? AND id != ?', (kwargs['name'], profile_id))
            if cursor.fetchone():
                return {'success': False, 'error': 'Profile name already exists'}
        
        update_values.append(profile_id)
        query = f"UPDATE profiles SET {', '.join(update_fields)} WHERE id = ?"
        
        cursor.execute(query, update_values)
        
        # Get updated profile
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        updated_profile = dict(cursor.fetchone())
        
        conn.commit()
        conn.close()
        
        return {
            'success': True,
            'data': updated_profile,
            'message': 'Profile updated successfully'
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def delete_profile(profile_id: int) -> Dict:
    """Delete profile with validation"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        # Check if profile exists
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        profile = cursor.fetchone()
        if not profile:
            return {'success': False, 'error': 'Profile not found'}
        
        # Check if this is the last profile
        cursor.execute('SELECT COUNT(*) as count FROM profiles')
        count = cursor.fetchone()['count']
        if count <= 1:
            return {'success': False, 'error': 'Cannot delete the last profile'}
        
        # Check if this is the active profile
        if profile['is_active']:
            return {'success': False, 'error': 'Cannot delete the active profile. Switch to another profile first.'}
        
        profile_name = profile['display_name']
        
        # Delete profile
        cursor.execute('DELETE FROM profiles WHERE id = ?', (profile_id,))
        
        conn.commit()
        conn.close()
        
        # Clean up profile directory
        profile_dir = os.path.join(os.path.dirname(__file__), '..', 'profiles', f'profile_{profile_id}')
        if os.path.exists(profile_dir):
            import shutil
            shutil.rmtree(profile_dir)
        
        return {
            'success': True,
            'message': f'Profile "{profile_name}" deleted successfully'
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def activate_profile(profile_id: int) -> Dict:
    """Switch to a different profile"""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()
        
        # Check if profile exists
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        profile = cursor.fetchone()
        if not profile:
            return {'success': False, 'error': 'Profile not found'}
        
        # Deactivate all profiles
        cursor.execute('UPDATE profiles SET is_active = FALSE')
        
        # Activate target profile
        cursor.execute('UPDATE profiles SET is_active = TRUE, last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (profile_id,))
        
        # Get activated profile
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        activated_profile = dict(cursor.fetchone())
        
        conn.commit()
        conn.close()
        
        return {
            'success': True,
            'data': activated_profile,
            'message': f'Switched to profile "{activated_profile["display_name"]}"'
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def touch_profile_last_used(profile_id: int) -> Dict:
    """Update a profile's last_used_at timestamp without switching active profile."""
    try:
        conn = get_profiles_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        profile = cursor.fetchone()
        if not profile:
            return {'success': False, 'error': 'Profile not found'}

        cursor.execute('UPDATE profiles SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', (profile_id,))
        cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
        updated_profile = dict(cursor.fetchone())

        conn.commit()
        conn.close()

        return {
            'success': True,
            'data': updated_profile,
            'message': 'Profile last_used_at updated'
        }

    except Exception as e:
        return {'success': False, 'error': str(e)}

def get_profile_stats(profile_id: int) -> Dict:
    """Get statistics for a specific profile"""
    try:
        import os
        
        stats = {
            'total_bookmarks': 0,
            'total_history_entries': 0,
            'total_focus_schedules': 0,
            'last_activity': None
        }
        
        # Query the main browsing_history database for this profile's history count
        main_db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'browser_history.db')
        if os.path.exists(main_db_path):
            conn = sqlite3.connect(main_db_path)
            cursor = conn.cursor()
            
            # Count history entries for this profile
            cursor.execute('SELECT COUNT(*) FROM browsing_history WHERE profile_id = ?', (profile_id,))
            history_count = cursor.fetchone()[0]
            stats['total_history_entries'] = history_count
            
            # Get last activity time for this profile
            cursor.execute('''
                SELECT MAX(visit_time) FROM browsing_history WHERE profile_id = ?
            ''', (profile_id,))
            last_visit = cursor.fetchone()[0]
            if last_visit:
                stats['last_activity'] = last_visit
            
            conn.close()
        
        # Count bookmarks from profile_bookmarks table
        profile_db_path = get_profile_db_path(profile_id)
        if os.path.exists(profile_db_path):
            conn = sqlite3.connect(profile_db_path)
            cursor = conn.cursor()
            
            try:
                cursor.execute('SELECT COUNT(*) FROM bookmarks')
                bookmark_count = cursor.fetchone()[0]
                stats['total_bookmarks'] = bookmark_count
            except:
                pass  # Table may not exist yet
            
            conn.close()
        
        return {
            'success': True,
            'data': stats
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

def init_profile_database(profile_id: int):
    """Initialize database for a specific profile"""
    profile_db_path = get_profile_db_path(profile_id)
    
    conn = sqlite3.connect(profile_db_path)
    cursor = conn.cursor()
    
    # Create profile-specific tables
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
    
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_url ON browsing_history(url)
    ''')
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_visit_time ON browsing_history(visit_time DESC)
    ''')
    
    conn.commit()
    conn.close()

# Migration function to move existing data to default profile
def migrate_existing_data_to_profiles():
    """Migrate existing single-user data to default profile"""
    try:
        # Check if profiles exist
        result = get_all_profiles()
        if not result['success'] or len(result['data']) == 0:
            # Seed two sample profiles for initial testing
            sample_profiles = [
                ('alex', 'Alex (Personal)', '#2ecc71'),
                ('maya', 'Maya (Work)', '#3498db')
            ]

            created_ids = []
            for name, display_name, avatar_color in sample_profiles:
                create_result = create_profile(name, display_name, avatar_color)
                if create_result['success']:
                    created_ids.append(create_result['data']['id'])
                else:
                    return {'success': False, 'error': f'Failed to create sample profile {display_name}: {create_result["error"]}'}

            default_profile_id = created_ids[0]
            activate_profile(default_profile_id)
            print(f"✅ Seeded {len(created_ids)} sample profiles. Active profile ID: {default_profile_id}")
        else:
            # Use existing default profile
            default_profile = None
            active_profile = None
            for profile in result['data']:
                if profile['is_default']:
                    default_profile = profile
                if profile['is_active']:
                    active_profile = profile
            
            if not default_profile:
                # Make first profile default
                first_profile = result['data'][0]
                update_profile(first_profile['id'], is_default=True, is_active=True)
                default_profile_id = first_profile['id']
                print(f"✅ Made first profile default and active (ID: {default_profile_id})")
            else:
                default_profile_id = default_profile['id']
                # Ensure default profile is active if no active profile exists
                if not active_profile:
                    activate_profile(default_profile_id)
                    print(f"✅ Activated default profile (ID: {default_profile_id})")
        
        # Migrate existing browsing history to default profile
        try:
            # Import database module to migrate history
            import sys
            import os
            db_path = os.path.join(os.path.dirname(__file__), '..', 'database.py')
            sys.path.append(os.path.dirname(db_path))
            
            # Update any history entries that don't have a profile_id
            import sqlite3
            history_db_path = os.path.join(os.path.dirname(__file__), '..', 'browser_history.db')
            if os.path.exists(history_db_path):
                conn = sqlite3.connect(history_db_path)
                cursor = conn.cursor()
                cursor.execute('UPDATE browsing_history SET profile_id = ? WHERE profile_id IS NULL OR profile_id = 0', (default_profile_id,))
                updated_rows = cursor.rowcount
                conn.commit()
                conn.close()
                if updated_rows > 0:
                    print(f"✅ Migrated {updated_rows} history entries to default profile")
        except Exception as migrate_error:
            print(f"⚠️ History migration failed: {migrate_error}")
        
        return {
            'success': True, 
            'message': f'Migration completed. Default profile ID: {default_profile_id}'
        }
    
    except Exception as e:
        return {'success': False, 'error': str(e)}

# Initialize profiles database when module is imported
try:
    if not os.path.exists(PROFILES_DB_PATH):
        init_profiles_database()
        migrate_existing_data_to_profiles()
    else:
        # Database exists, just ensure tables are up to date
        init_profiles_database()
        print("✅ Profiles database verified")
except Exception as e:
    print(f"❌ Profile database initialization failed: {e}")
    # Create a minimal working database as fallback
    try:
        conn = sqlite3.connect(PROFILES_DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                avatar_color TEXT DEFAULT '#4A90E2',
                is_default BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()
        print("✅ Fallback profiles database created")
    except Exception as fallback_error:
        print(f"❌ Fallback database creation also failed: {fallback_error}")
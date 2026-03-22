"""
Profile Service - Business logic layer for profile operations
Handles complex profile operations and validation
"""

import os
import json
import shutil
from typing import Dict, List, Optional
import sys

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.profile import (
    create_profile as _create_profile,
    get_all_profiles as _get_all_profiles,
    get_profile_by_id as _get_profile_by_id,
    get_active_profile as _get_active_profile,
    update_profile as _update_profile,
    delete_profile as _delete_profile,
    activate_profile as _activate_profile,
    get_profile_stats as _get_profile_stats,
    touch_profile_last_used as _touch_profile_last_used
)

class ProfileService:
    """Service class for profile business logic"""
    
    @staticmethod
    def create_profile(name: str, display_name: str, avatar_color: str = '#4A90E2') -> Dict:
        """Create new profile with validation"""
        # Validate inputs
        if not name or len(name.strip()) < 2:
            return {'success': False, 'error': 'Profile name must be at least 2 characters'}
        
        if not display_name or len(display_name.strip()) < 2:
            return {'success': False, 'error': 'Display name must be at least 2 characters'}
        
        # Sanitize profile name (remove special characters)
        import re
        sanitized_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name.strip())
        
        if len(sanitized_name) < 2:
            return {'success': False, 'error': 'Profile name contains invalid characters'}
        
        # Check for reserved names
        reserved_names = ['default', 'admin', 'system', 'guest', 'temp', 'temporary']
        if sanitized_name.lower() in reserved_names:
            return {'success': False, 'error': f'"{sanitized_name}" is a reserved name'}
        
        # Validate avatar color
        if not avatar_color.startswith('#') or len(avatar_color) != 7:
            avatar_color = '#4A90E2'  # Default color
        
        return _create_profile(sanitized_name, display_name.strip(), avatar_color)
    
    @staticmethod
    def list_profiles() -> Dict:
        """Get all profiles with additional metadata"""
        result = _get_all_profiles()
        if not result['success']:
            return result
        
        # Add usage statistics to each profile
        for profile in result['data']:
            stats_result = _get_profile_stats(profile['id'])
            if stats_result['success']:
                profile['stats'] = stats_result['data']
            else:
                profile['stats'] = {
                    'total_bookmarks': 0,
                    'total_history_entries': 0,
                    'total_focus_schedules': 0
                }
        
        return result
    
    @staticmethod
    def get_profile(profile_id: int) -> Dict:
        """Get profile with detailed information"""
        result = _get_profile_by_id(profile_id)
        if not result['success']:
            return result
        
        # Add statistics
        stats_result = _get_profile_stats(profile_id)
        if stats_result['success']:
            result['data']['stats'] = stats_result['data']
        
        return result
    
    @staticmethod
    def update_profile(profile_id: int, **kwargs) -> Dict:
        """Update profile with validation"""
        # Validate inputs
        if 'name' in kwargs and kwargs['name']:
            import re
            sanitized_name = re.sub(r'[^a-zA-Z0-9_-]', '_', kwargs['name'].strip())
            if len(sanitized_name) < 2:
                return {'success': False, 'error': 'Profile name must be at least 2 characters'}
            kwargs['name'] = sanitized_name
        
        if 'display_name' in kwargs and kwargs['display_name']:
            kwargs['display_name'] = kwargs['display_name'].strip()
            if len(kwargs['display_name']) < 2:
                return {'success': False, 'error': 'Display name must be at least 2 characters'}
        
        if 'avatar_color' in kwargs:
            if not kwargs['avatar_color'].startswith('#') or len(kwargs['avatar_color']) != 7:
                return {'success': False, 'error': 'Invalid avatar color format'}
        
        return _update_profile(profile_id, **kwargs)
    
    @staticmethod
    def delete_profile(profile_id: int) -> Dict:
        """Delete profile with additional safety checks"""
        # Get profile details first
        profile_result = _get_profile_by_id(profile_id)
        if not profile_result['success']:
            return profile_result
        
        profile = profile_result['data']
        
        # Additional safety check: prevent deletion of default profile
        if profile['is_default']:
            profiles_result = _get_all_profiles()
            if profiles_result['success'] and len(profiles_result['data']) > 1:
                # Transfer default status to another profile
                for other_profile in profiles_result['data']:
                    if other_profile['id'] != profile_id:
                        _update_profile(other_profile['id'], is_default=True)
                        break
            else:
                return {'success': False, 'error': 'Cannot delete the default profile when it\'s the only profile'}
        
        return _delete_profile(profile_id)
    
    @staticmethod
    def switch_profile(profile_id: int) -> Dict:
        """Switch to different profile with cleanup"""
        result = _activate_profile(profile_id)
        if result['success']:
            # TODO: Clear browser cache and session data here
            # This will be implemented in the frontend integration phase
            pass
        
        return result

    @staticmethod
    def touch_profile(profile_id: int) -> Dict:
        """Update profile last-used timestamp without changing active profile."""
        return _touch_profile_last_used(profile_id)
    
    @staticmethod
    def get_current_profile() -> Dict:
        """Get currently active profile"""
        result = _get_active_profile()
        if not result['success']:
            # No active profile found, activate default
            profiles_result = _get_all_profiles()
            if profiles_result['success'] and len(profiles_result['data']) > 0:
                # Find default profile or use first one
                default_profile = None
                for profile in profiles_result['data']:
                    if profile['is_default']:
                        default_profile = profile
                        break
                
                if not default_profile:
                    default_profile = profiles_result['data'][0]
                
                # Activate it
                activation_result = _activate_profile(default_profile['id'])
                if activation_result['success']:
                    return activation_result
        
        return result
    
    @staticmethod
    def export_profile_data(profile_id: int) -> Dict:
        """Export profile data for backup/transfer"""
        try:
            # Get profile info
            profile_result = _get_profile_by_id(profile_id)
            if not profile_result['success']:
                return profile_result
            
            profile_data = profile_result['data']
            
            # TODO: Export profile-specific data (bookmarks, preferences, etc.)
            # This will be implemented when we integrate with existing features
            
            export_data = {
                'profile': profile_data,
                'bookmarks': [],
                'preferences': {},
                'focus_schedules': [],
                'export_date': '2026-02-16',
                'version': '1.0.0'
            }
            
            return {
                'success': True,
                'data': export_data,
                'message': f'Profile "{profile_data["display_name"]}" exported successfully'
            }
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def import_profile_data(import_data: Dict) -> Dict:
        """Import profile data from backup"""
        try:
            if 'profile' not in import_data:
                return {'success': False, 'error': 'Invalid import data: missing profile information'}
            
            profile_info = import_data['profile']
            
            # Create new profile with imported data
            result = ProfileService.create_profile(
                f"{profile_info.get('name', 'imported')}_imported",
                f"{profile_info.get('display_name', 'Imported Profile')} (Imported)",
                profile_info.get('avatar_color', '#4A90E2')
            )
            
            if not result['success']:
                return result
            
            new_profile_id = result['data']['id']
            
            # TODO: Import bookmarks, preferences, etc.
            # This will be implemented in later phases
            
            return {
                'success': True,
                'data': result['data'],
                'message': f'Profile imported successfully as "{result["data"]["display_name"]}"'
            }
        
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def validate_profile_name(name: str, exclude_id: int = None) -> Dict:
        """Validate profile name availability"""
        if not name or len(name.strip()) < 2:
            return {'valid': False, 'error': 'Profile name must be at least 2 characters'}
        
        # Sanitize name
        import re
        sanitized_name = re.sub(r'[^a-zA-Z0-9_-]', '_', name.strip())
        
        if len(sanitized_name) < 2:
            return {'valid': False, 'error': 'Profile name contains too many invalid characters'}
        
        # Check for reserved names
        reserved_names = ['default', 'admin', 'system', 'guest', 'temp', 'temporary']
        if sanitized_name.lower() in reserved_names:
            return {'valid': False, 'error': f'"{sanitized_name}" is a reserved name'}
        
        # Check if name already exists
        profiles_result = _get_all_profiles()
        if profiles_result['success']:
            for profile in profiles_result['data']:
                if profile['name'] == sanitized_name and (not exclude_id or profile['id'] != exclude_id):
                    return {'valid': False, 'error': 'Profile name already exists'}
        
        return {'valid': True, 'sanitized_name': sanitized_name}
    
    @staticmethod
    def get_profile_directory(profile_id: int) -> str:
        """Get profile-specific directory path"""
        return os.path.join(os.path.dirname(__file__), '..', '..', 'profiles', f'profile_{profile_id}')
    
    @staticmethod
    def cleanup_inactive_profiles():
        """Cleanup resources for inactive profiles (maintenance function)"""
        # This could be called periodically to free up memory/resources
        # Implementation depends on how we handle profile sessions
        pass
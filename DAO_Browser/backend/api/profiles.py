"""
Profile API - REST endpoints for profile management
Flask Blueprint for profile-related operations
"""

from flask import Blueprint, request, jsonify
import logging
import sys
import os

# Add the parent directory to the Python path to import models and services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.profile_service import ProfileService

# Create Blueprint
profiles_bp = Blueprint('profiles', __name__, url_prefix='/api/profiles')

logger = logging.getLogger(__name__)

@profiles_bp.route('', methods=['POST'])
def create_profile():
    """
    Create a new profile
    
    POST /api/profiles
    Body: {
        "name": "work_profile",
        "display_name": "Work Profile", 
        "avatar_color": "#4A90E2"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        name = data.get('name', '').strip()
        display_name = data.get('display_name', '').strip()
        avatar_color = data.get('avatar_color', '#4A90E2')
        
        if not name:
            return jsonify({
                'success': False,
                'error': 'Profile name is required'
            }), 400
        
        if not display_name:
            return jsonify({
                'success': False,
                'error': 'Display name is required'
            }), 400
        
        logger.info(f"Creating profile: {display_name}")
        
        result = ProfileService.create_profile(name, display_name, avatar_color)
        
        if result['success']:
            logger.info(f"Profile created successfully: {result['data']['id']}")
            return jsonify(result), 201
        else:
            logger.error(f"Failed to create profile: {result['error']}")
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error creating profile: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('', methods=['GET'])
def list_profiles():
    """
    Get all profiles
    
    GET /api/profiles
    """
    try:
        logger.info("Listing all profiles")
        
        result = ProfileService.list_profiles()
        
        if result['success']:
            return jsonify(result), 200
        else:
            logger.error(f"Failed to list profiles: {result['error']}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error listing profiles: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>', methods=['GET'])
def get_profile(profile_id):
    """
    Get specific profile
    
    GET /api/profiles/{id}
    """
    try:
        logger.info(f"Getting profile: {profile_id}")
        
        result = ProfileService.get_profile(profile_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 404
    
    except Exception as e:
        logger.error(f"Error getting profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>', methods=['PUT'])
def update_profile(profile_id):
    """
    Update profile
    
    PUT /api/profiles/{id}
    Body: {
        "display_name": "Updated Name",
        "avatar_color": "#FF5722"
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        logger.info(f"Updating profile: {profile_id}")
        
        # Filter allowed fields
        allowed_fields = ['name', 'display_name', 'avatar_color', 'is_default']
        update_data = {key: value for key, value in data.items() if key in allowed_fields}
        
        if not update_data:
            return jsonify({
                'success': False,
                'error': 'No valid fields to update'
            }), 400
        
        result = ProfileService.update_profile(profile_id, **update_data)
        
        if result['success']:
            logger.info(f"Profile updated successfully: {profile_id}")
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error updating profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>', methods=['DELETE'])
def delete_profile(profile_id):
    """
    Delete profile
    
    DELETE /api/profiles/{id}
    """
    try:
        logger.info(f"Deleting profile: {profile_id}")
        
        result = ProfileService.delete_profile(profile_id)
        
        if result['success']:
            logger.info(f"Profile deleted successfully: {profile_id}")
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error deleting profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>/activate', methods=['POST'])
def activate_profile(profile_id):
    """
    Switch to profile (make it active)
    
    POST /api/profiles/{id}/activate
    """
    try:
        logger.info(f"Activating profile: {profile_id}")
        
        result = ProfileService.switch_profile(profile_id)
        
        if result['success']:
            logger.info(f"Profile activated successfully: {profile_id}")
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error activating profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>/touch', methods=['POST'])
def touch_profile(profile_id):
    """Update profile last-used timestamp without changing active profile."""
    try:
        logger.info(f"Touching profile last_used_at: {profile_id}")

        result = ProfileService.touch_profile(profile_id)

        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 400

    except Exception as e:
        logger.error(f"Error touching profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/active', methods=['GET'])
def get_active_profile():
    """
    Get currently active profile
    
    GET /api/profiles/active
    """
    try:
        logger.info("Getting active profile")
        
        result = ProfileService.get_current_profile()
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 404
    
    except Exception as e:
        logger.error(f"Error getting active profile: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>/stats', methods=['GET'])
def get_profile_stats(profile_id):
    """
    Get profile statistics
    
    GET /api/profiles/{id}/stats
    """
    try:
        logger.info(f"Getting stats for profile: {profile_id}")
        
        result = ProfileService.get_profile(profile_id)
        
        if result['success']:
            return jsonify({
                'success': True,
                'data': result['data'].get('stats', {})
            }), 200
        else:
            return jsonify(result), 404
    
    except Exception as e:
        logger.error(f"Error getting stats for profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/<int:profile_id>/export', methods=['POST'])
def export_profile(profile_id):
    """
    Export profile data
    
    POST /api/profiles/{id}/export
    """
    try:
        logger.info(f"Exporting profile: {profile_id}")
        
        result = ProfileService.export_profile_data(profile_id)
        
        if result['success']:
            logger.info(f"Profile exported successfully: {profile_id}")
            return jsonify(result), 200
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error exporting profile {profile_id}: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/import', methods=['POST'])
def import_profile():
    """
    Import profile data
    
    POST /api/profiles/import
    Body: {
        "profile": {...},
        "bookmarks": [...],
        "preferences": {...}
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        logger.info("Importing profile data")
        
        result = ProfileService.import_profile_data(data)
        
        if result['success']:
            logger.info("Profile imported successfully")
            return jsonify(result), 201
        else:
            return jsonify(result), 400
    
    except Exception as e:
        logger.error(f"Error importing profile: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@profiles_bp.route('/validate-name', methods=['POST'])
def validate_profile_name():
    """
    Validate profile name availability
    
    POST /api/profiles/validate-name
    Body: {
        "name": "profile_name",
        "exclude_id": 1  // optional, for updates
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({
                'valid': False,
                'error': 'Profile name is required'
            }), 400
        
        name = data['name']
        exclude_id = data.get('exclude_id')
        
        result = ProfileService.validate_profile_name(name, exclude_id)
        
        return jsonify(result), 200
    
    except Exception as e:
        logger.error(f"Error validating profile name: {str(e)}")
        return jsonify({
            'valid': False,
            'error': 'Internal server error'
        }), 500

# Error handlers for the blueprint
@profiles_bp.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Profile not found'
    }), 404

@profiles_bp.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500
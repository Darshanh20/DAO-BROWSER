"""
AI Article Summarization Backend
Flask server that uses sumy library for extractive text summarization
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words
import logging
import database  # Import our database module for history tracking

# Import profile API blueprint
try:
    from api.profiles import profiles_bp
    from models.profile import init_profiles_database, migrate_existing_data_to_profiles
    PROFILES_AVAILABLE = True
    print("✓ Profile management API loaded")
except ImportError as e:
    PROFILES_AVAILABLE = False
    print(f"⚠ Profile API not available: {e}")

# Import exam API blueprint
try:
    from api.exam import exam_bp
    EXAM_API_AVAILABLE = True
    print("✓ Exam Activity API loaded")
except ImportError as e:
    EXAM_API_AVAILABLE = False
    print(f"⚠ Exam API not available: {e}")

app = Flask(__name__)
CORS(app)  # Enable CORS for Electron app

# Initialize databases
database.init_database()  # Initialize browsing history database

# Initialize profile database if available
if PROFILES_AVAILABLE:
    try:
        init_profiles_database()
        print("✅ Profiles database initialized")
        
        # Verify/migrate existing data
        migrate_result = migrate_existing_data_to_profiles()
        if migrate_result['success']:
            print("✅ Profiles database verified")
        else:
            print(f"⚠ Profile migration warning: {migrate_result.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"❌ Error initializing profiles database: {e}")

# Register profile management blueprint if available
if PROFILES_AVAILABLE:
    app.register_blueprint(profiles_bp)
    print("✓ Profile API endpoints registered")

# Register exam API blueprint if available
if EXAM_API_AVAILABLE:
    app.register_blueprint(exam_bp)
    print("✓ Exam API endpoints registered")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Language setting
LANGUAGE = "english"

@app.route('/summarize', methods=['POST'])
def summarize_text():
    """
    Summarize article text using LSA algorithm
    
    Expected JSON body:
    {
        "text": "Article text to summarize",
        "sentences": 5  (optional, default: 5)
    }
    
    Returns:
    {
        "summary": ["Sentence 1", "Sentence 2", ...],
        "original_length": 1000,
        "summary_length": 200
    }
    """
    import time
    start_time = time.time()
    
    try:
        # Get request data
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({
                'error': 'No text provided',
                'message': 'Please provide text in the request body'
            }), 400
        
        text = data.get('text', '').strip()
        num_sentences = data.get('sentences', 5)
        
        logger.info(f"Received summarization request: {len(text)} chars, {num_sentences} sentences requested")
        
        # Validate input
        if not text:
            return jsonify({
                'error': 'Empty text',
                'message': 'The provided text is empty'
            }), 400
        
        if len(text) < 100:
            return jsonify({
                'error': 'Text too short',
                'message': 'The article is too short to summarize (minimum 100 characters)'
            }), 400
        
        # Limit text length to prevent timeouts (max 50KB)
        if len(text) > 50000:
            logger.warning(f"Text too long ({len(text)} chars), truncating to 50000")
            text = text[:50000]
        
        parse_start = time.time()
        # Parse text
        parser = PlaintextParser.from_string(text, Tokenizer(LANGUAGE))
        parse_time = time.time() - parse_start
        logger.info(f"Parsing took {parse_time:.2f}s")
        
        summarize_start = time.time()
        # Create LSA summarizer
        stemmer = Stemmer(LANGUAGE)
        summarizer = LsaSummarizer(stemmer)
        summarizer.stop_words = get_stop_words(LANGUAGE)
        
        # Generate summary
        summary_sentences = summarizer(parser.document, num_sentences)
        summarize_time = time.time() - summarize_start
        logger.info(f"Summarization took {summarize_time:.2f}s")
        
        # Convert sentences to strings
        summary_list = [str(sentence) for sentence in summary_sentences]
        
        # Calculate lengths
        original_length = len(text)
        summary_length = sum(len(s) for s in summary_list)
        
        total_time = time.time() - start_time
        logger.info(f"Total processing time: {total_time:.2f}s - Summarized {original_length} chars to {summary_length} chars ({len(summary_list)} sentences)")
        
        return jsonify({
            'summary': summary_list,
            'original_length': original_length,
            'summary_length': summary_length,
            'sentences_count': len(summary_list),
            'processing_time': round(total_time, 2)
        }), 200
        
    except Exception as e:
        logger.error(f"Summarization error: {str(e)}")
        return jsonify({
            'error': 'Summarization failed',
            'message': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'running',
        'service': 'Article Summarizer',
        'version': '1.0.0'
    }), 200

@app.route('/', methods=['GET'])
def index():
    """Root endpoint with API documentation"""
    return jsonify({
        'service': 'D.A.O. Browser Backend API',
        'version': '1.0.0',
        'endpoints': {
            '/summarize': 'POST - Summarize article text',
            '/health': 'GET - Health check',
            '/api/history/add': 'POST - Add history entry',
            '/api/history/all': 'GET - Get all history (paginated)',
            '/api/history/search': 'GET - Search history',
            '/api/history/stats': 'GET - Get history statistics',
            '/api/history/:id': 'DELETE - Delete history entry',
            '/api/history/clear': 'DELETE - Clear all history'
        },
        'usage': {
            'summarize': {
                'endpoint': '/summarize',
                'method': 'POST',
                'body': {
                    'text': 'Your article text here',
                    'sentences': 5
                }
            },
            'history': {
                'add': 'POST /api/history/add with {url, title, favicon_url}',
                'get': 'GET /api/history/all?page=1&limit=50',
                'search': 'GET /api/history/search?q=query'
            }
        }
    }), 200

# ==================== HISTORY API ENDPOINTS ====================

@app.route('/api/history/add', methods=['POST'])
def add_history_entry():
    """
    Add a new history entry
    
    Expected JSON body:
    {
        "url": "https://example.com",
        "title": "Page Title",
        "favicon_url": "https://example.com/favicon.ico",
        "visit_duration": 60,
        "profile_id": 1
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'url' not in data:
            logger.warning("History add request missing required data or URL")
            return jsonify({
                'success': False,
                'error': 'URL is required'
            }), 400
        
        url = data.get('url')
        title = data.get('title', '')
        favicon_url = data.get('favicon_url', '')
        visit_duration = data.get('visit_duration', 0)
        profile_id = data.get('profile_id', 1)  # Default to profile 1
        
        # Validate profile_id
        if not isinstance(profile_id, int) or profile_id <= 0:
            logger.warning(f"Invalid profile_id: {profile_id}, using default profile 1")
            profile_id = 1
            
        logger.info(f"Adding history entry: {url} (title: {title}, profile: {profile_id})")
        
        result = database.add_history(url, title, favicon_url, visit_duration, profile_id)
        
        if result['success']:
            logger.info(f"History entry added successfully for profile {profile_id}")
            return jsonify(result), 200
        else:
            logger.error(f"Failed to add history entry: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error adding history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history/all', methods=['GET'])
def get_all_history():
    """
    Get all history with pagination
    
    Query params:
    - page: Page number (default: 1)
    - limit: Entries per page (default: 50)
    - profile_id: Filter by profile (optional)
    """
    try:
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))
        profile_id = request.args.get('profile_id')
        
        if profile_id:
            profile_id = int(profile_id)
            
        logger.info(f"[HISTORY API] Fetching history: page={page}, limit={limit}, profile_id={profile_id}")
        logger.info(f"[HISTORY API] Request args: {dict(request.args)}")
        
        result = database.get_history(page, limit, profile_id)
        
        if result['success']:
            logger.info(f"[HISTORY API] History fetched successfully: {len(result['data'])} entries, total={result['pagination']['total']}")
            logger.info(f"[HISTORY API] First few entries: {result['data'][:3] if len(result['data']) > 0 else 'None'}")
            return jsonify(result), 200
        else:
            logger.error(f"[HISTORY API] Failed to fetch history: {result.get('error')}")
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error fetching history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history/search', methods=['GET'])
def search_history_entries():
    """
    Search history by URL or title
    
    Query params:
    - q: Search query
    - limit: Maximum results (default: 50)
    - profile_id: Filter by profile (optional)
    """
    try:
        query = request.args.get('q', '')
        limit = int(request.args.get('limit', 50))
        profile_id = request.args.get('profile_id')
        
        if profile_id:
            profile_id = int(profile_id)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Search query is required'
            }), 400
        
        result = database.search_history(query, limit, profile_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error searching history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history/<int:entry_id>', methods=['DELETE'])
def delete_history_entry(entry_id):
    """
    Delete a specific history entry by ID
    """
    try:
        result = database.delete_history(entry_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 404
    
    except Exception as e:
        logger.error(f"Error deleting history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history/clear', methods=['DELETE'])
def clear_all_history_entries():
    """
    Clear all browsing history, optionally for a specific profile
    
    Query params:
    - profile_id: Clear only this profile's history (optional)
    """
    try:
        profile_id = request.args.get('profile_id')
        
        if profile_id:
            profile_id = int(profile_id)
        
        result = database.clear_all_history(profile_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error clearing history: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history/stats', methods=['GET'])
def get_history_statistics():
    """
    Get statistics about browsing history
    
    Query params:
    - profile_id: Get stats for this profile only (optional)
    """
    try:
        profile_id = request.args.get('profile_id')
        
        if profile_id:
            profile_id = int(profile_id)
        
        result = database.get_history_stats(profile_id)
        
        if result['success']:
            return jsonify(result), 200
        else:
            return jsonify(result), 500
    
    except Exception as e:
        logger.error(f"Error fetching stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("=" * 60)
    print("🤖 AI Article Summarization Server")
    print("=" * 60)
    print("✓ Server starting on http://localhost:5000")
    print("✓ Using LSA (Latent Semantic Analysis) algorithm")
    print("✓ CORS enabled for Electron app")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)

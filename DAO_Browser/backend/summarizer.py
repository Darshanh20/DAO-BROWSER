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

app = Flask(__name__)
CORS(app)  # Enable CORS for Electron app

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
        'service': 'Article Summarization API',
        'version': '1.0.0',
        'endpoints': {
            '/summarize': 'POST - Summarize article text',
            '/health': 'GET - Health check'
        },
        'usage': {
            'endpoint': '/summarize',
            'method': 'POST',
            'body': {
                'text': 'Your article text here',
                'sentences': 5
            }
        }
    }), 200

if __name__ == '__main__':
    print("=" * 60)
    print("🤖 AI Article Summarization Server")
    print("=" * 60)
    print("✓ Server starting on http://localhost:5000")
    print("✓ Using LSA (Latent Semantic Analysis) algorithm")
    print("✓ CORS enabled for Electron app")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)

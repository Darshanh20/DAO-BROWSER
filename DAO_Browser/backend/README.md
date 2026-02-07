# Article Summarization Backend

## Installation

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Download NLTK data (required for tokenization):
```bash
python -c "import nltk; nltk.download('punkt')"
```

3. Start the Flask server:
```bash
python summarizer.py
```

The server will start on `http://localhost:5000`

## API Endpoints

### POST /summarize
Summarize article text using LSA algorithm

**Request:**
```json
{
  "text": "Your article text here...",
  "sentences": 5
}
```

**Response:**
```json
{
  "summary": ["Sentence 1", "Sentence 2", ...],
  "original_length": 1000,
  "summary_length": 200,
  "sentences_count": 5
}
```

### GET /health
Health check endpoint

### GET /
API documentation

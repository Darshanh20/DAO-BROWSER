/**
 * Content Extractor - Extract main article text from webpages
 * Uses a combination of heuristics to identify and extract article content
 * while removing ads, navigation, sidebars, and other non-content elements
 */

class ContentExtractor {
    constructor() {
        // Common article selectors (prioritized)
        this.articleSelectors = [
            'article',
            '[role="main"]',
            'main',
            '.article-content',
            '.post-content',
            '.entry-content',
            '#article',
            '#content',
            '.content',
            '#main-content',
            '.main-content'
        ];

        // Elements to exclude from extraction
        this.excludeSelectors = [
            'nav',
            'header',
            'footer',
            'aside',
            '.sidebar',
            '.advertisement',
            '.ad',
            '.social-share',
            '.comments',
            '.related-posts',
            'script',
            'style',
            'iframe',
            'noscript'
        ];
    }

    /**
     * Extract main article text from the current page
     * @returns {Object} { text: string, title: string, success: boolean, error: string }
     */
    extractArticle() {
        try {
            // Get page title
            const title = document.title || '';

            // Try to find article container
            let articleElement = this.findArticleElement();

            if (!articleElement) {
                // Fallback: use body if no article element found
                articleElement = document.body;
            }

            // Clone the element to avoid modifying the actual DOM
            const clone = articleElement.cloneNode(true);

            // Remove unwanted elements
            this.removeUnwantedElements(clone);

            // Extract and clean text
            let text = this.extractText(clone);

            // Clean up the text
            text = this.cleanText(text);

            // Validate extracted content
            if (text.length < 100) {
                return {
                    success: false,
                    error: 'Article too short or no article content found on this page',
                    text: '',
                    title: title
                };
            }

            return {
                success: true,
                text: text,
                title: title,
                wordCount: text.split(/\s+/).length,
                charCount: text.length
            };

        } catch (error) {
            console.error('Content extraction error:', error);
            return {
                success: false,
                error: error.message,
                text: '',
                title: document.title || ''
            };
        }
    }

    /**
     * Find the main article element using various selectors
     * @returns {HTMLElement|null}
     */
    findArticleElement() {
        // Try each selector in order of priority
        for (const selector of this.articleSelectors) {
            const element = document.querySelector(selector);
            if (element && this.hasSignificantText(element)) {
                return element;
            }
        }

        // Fallback: find the element with most paragraphs
        return this.findElementWithMostParagraphs();
    }

    /**
     * Find element with the most paragraph tags (likely the article)
     * @returns {HTMLElement|null}
     */
    findElementWithMostParagraphs() {
        const containers = document.querySelectorAll('div, section, article');
        let maxParagraphs = 0;
        let bestElement = null;

        containers.forEach(container => {
            const paragraphs = container.querySelectorAll('p');
            if (paragraphs.length > maxParagraphs) {
                maxParagraphs = paragraphs.length;
                bestElement = container;
            }
        });

        return bestElement;
    }

    /**
     * Check if element contains significant text content
     * @param {HTMLElement} element
     * @returns {boolean}
     */
    hasSignificantText(element) {
        const text = element.textContent || '';
        return text.trim().length > 200; // At least 200 characters
    }

    /**
     * Remove unwanted elements from the cloned article
     * @param {HTMLElement} element
     */
    removeUnwantedElements(element) {
        this.excludeSelectors.forEach(selector => {
            const unwantedElements = element.querySelectorAll(selector);
            unwantedElements.forEach(el => el.remove());
        });

        // Remove hidden elements
        const allElements = element.querySelectorAll('*');
        allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
                el.remove();
            }
        });
    }

    /**
     * Extract text from element, focusing on paragraphs and headers
     * @param {HTMLElement} element
     * @returns {string}
     */
    extractText(element) {
        const textParts = [];

        // Get all paragraphs and headers
        const textElements = element.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
        
        textElements.forEach(el => {
            const text = el.textContent.trim();
            if (text.length > 0) {
                textParts.push(text);
            }
        });

        return textParts.join('\n\n');
    }

    /**
     * Clean extracted text (remove extra whitespace, etc.)
     * @param {string} text
     * @returns {string}
     */
    cleanText(text) {
        return text
            // Replace multiple newlines with double newline
            .replace(/\n{3,}/g, '\n\n')
            // Replace multiple spaces with single space
            .replace(/[ \t]{2,}/g, ' ')
            // Trim each line
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
            .trim();
    }

    /**
     * Check if current page is likely an article
     * @returns {boolean}
     */
    isArticlePage() {
        // Check for common article indicators
        const indicators = [
            document.querySelector('article'),
            document.querySelector('[itemtype*="Article"]'),
            document.querySelector('meta[property="og:type"][content="article"]'),
            document.querySelector('.article'),
            document.querySelector('.post')
        ];

        return indicators.some(indicator => indicator !== null);
    }

    /**
     * Get article metadata
     * @returns {Object}
     */
    getMetadata() {
        const metadata = {
            title: document.title || '',
            url: window.location.href,
            author: '',
            publishDate: '',
            description: ''
        };

        // Try to get author
        const authorMeta = document.querySelector('meta[name="author"]') ||
                          document.querySelector('meta[property="article:author"]');
        if (authorMeta) {
            metadata.author = authorMeta.content;
        }

        // Try to get publish date
        const dateMeta = document.querySelector('meta[property="article:published_time"]') ||
                        document.querySelector('time[datetime]');
        if (dateMeta) {
            metadata.publishDate = dateMeta.getAttribute('datetime') || dateMeta.content;
        }

        // Try to get description
        const descMeta = document.querySelector('meta[name="description"]') ||
                        document.querySelector('meta[property="og:description"]');
        if (descMeta) {
            metadata.description = descMeta.content;
        }

        return metadata;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentExtractor;
}

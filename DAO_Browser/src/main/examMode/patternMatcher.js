/**
 * Pattern Matcher for Exam Mode URL Filtering
 * Provides robust URL pattern matching for whitelist/blacklist filtering
 * 
 * Supported patterns:
 *   "domain.com"         → exact domain only
 *   "domain.com/*"       → domain + all paths
 *   "*.domain.com"       → all subdomains
 *   "domain.com/path/*"  → specific path and below
 */

/**
 * Normalize a URL for consistent matching
 * - Removes protocol (http://, https://)
 * - Removes www. prefix
 * - Removes trailing slash
 * - Removes query parameters and hash
 * - Converts to lowercase
 * 
 * @param {string} url - The URL to normalize
 * @returns {Object} - { hostname, pathname, normalized }
 */
function normalizeUrl(url) {
    try {
        // Handle URLs without protocol
        let fullUrl = url;
        if (!url.includes('://')) {
            fullUrl = 'https://' + url;
        }
        
        const urlObj = new URL(fullUrl);
        
        // Get hostname without www
        let hostname = urlObj.hostname.toLowerCase();
        if (hostname.startsWith('www.')) {
            hostname = hostname.substring(4);
        }
        
        // Get pathname, remove trailing slash
        let pathname = urlObj.pathname.toLowerCase();
        if (pathname.endsWith('/') && pathname.length > 1) {
            pathname = pathname.slice(0, -1);
        }
        
        // Combined normalized form (no protocol, no www, no query/hash)
        const normalized = hostname + pathname;
        
        return {
            hostname,
            pathname,
            normalized,
            valid: true
        };
    } catch (e) {
        return {
            hostname: '',
            pathname: '',
            normalized: url.toLowerCase(),
            valid: false
        };
    }
}

/**
 * Normalize a pattern for consistent matching
 * - Removes protocol if present
 * - Removes www. prefix (unless pattern specifically targets www)
 * - Converts to lowercase
 * 
 * @param {string} pattern - The pattern to normalize
 * @returns {string} - Normalized pattern
 */
function normalizePattern(pattern) {
    let p = pattern.toLowerCase().trim();
    
    // Remove protocol if present
    if (p.includes('://')) {
        p = p.split('://')[1];
    }
    
    // Remove www. prefix (unless it's a wildcard pattern for www specifically)
    if (p.startsWith('www.') && !p.startsWith('www.*')) {
        p = p.substring(4);
    }
    
    // Remove trailing slash unless it's part of the pattern
    if (p.endsWith('/') && !p.endsWith('/*')) {
        p = p.slice(0, -1);
    }
    
    return p;
}

/**
 * Check if a URL matches a single pattern
 * 
 * @param {string} url - The full URL to check
 * @param {string} pattern - The pattern to match against
 * @returns {boolean} - True if URL matches the pattern
 */
function matchesPattern(url, pattern) {
    const urlInfo = normalizeUrl(url);
    const normalizedPattern = normalizePattern(pattern);
    
    // Handle invalid URLs
    if (!urlInfo.valid) {
        return false;
    }
    
    const { hostname, pathname, normalized } = urlInfo;
    
    // Pattern: */specific-path (any domain with that path)
    if (normalizedPattern.startsWith('*/')) {
        const pathPattern = normalizedPattern.substring(2);
        // Check if pathname starts with or equals the pattern path
        if (pathname === '/' + pathPattern || pathname.startsWith('/' + pathPattern + '/')) {
            return true;
        }
        // Also check if pathname contains the path (for nested paths)
        if (pathname.includes('/' + pathPattern)) {
            return true;
        }
        return false;
    }
    
    // Pattern: *.domain.com (wildcard subdomain)
    if (normalizedPattern.startsWith('*.')) {
        const baseDomain = normalizedPattern.substring(2);
        // Extract just the domain part (without path) from pattern
        const baseDomainOnly = baseDomain.split('/')[0];
        
        // Match exact domain or any subdomain
        if (hostname === baseDomainOnly || hostname.endsWith('.' + baseDomainOnly)) {
            // If pattern has a path component, check that too
            if (baseDomain.includes('/')) {
                const patternPath = '/' + baseDomain.split('/').slice(1).join('/');
                if (patternPath.endsWith('/*')) {
                    const basePath = patternPath.slice(0, -2);
                    return pathname === basePath || pathname.startsWith(basePath + '/') || pathname.startsWith(basePath);
                }
                return pathname === patternPath || pathname.startsWith(patternPath + '/');
            }
            return true;
        }
        return false;
    }
    
    // Pattern: domain.com/path/* (domain with path wildcard)
    if (normalizedPattern.endsWith('/*')) {
        const basePattern = normalizedPattern.slice(0, -2);
        
        if (basePattern.includes('/')) {
            // Pattern has a path component: domain.com/path/*
            const patternDomain = basePattern.split('/')[0];
            const patternPath = '/' + basePattern.split('/').slice(1).join('/');
            
            // Check domain matches (exact or subdomain)
            const domainMatches = hostname === patternDomain || hostname.endsWith('.' + patternDomain);
            
            if (domainMatches) {
                // Check path matches (exact or starts with)
                return pathname === patternPath || pathname.startsWith(patternPath + '/') || pathname.startsWith(patternPath);
            }
            return false;
        } else {
            // Pattern is just domain.com/* (all paths on domain)
            return hostname === basePattern || hostname.endsWith('.' + basePattern);
        }
    }
    
    // Pattern: domain.com/specific-path (exact path)
    if (normalizedPattern.includes('/')) {
        const patternDomain = normalizedPattern.split('/')[0];
        const patternPath = '/' + normalizedPattern.split('/').slice(1).join('/');
        
        // Check domain matches
        const domainMatches = hostname === patternDomain || hostname.endsWith('.' + patternDomain);
        
        if (domainMatches) {
            // Exact path match or path starts with pattern
            return pathname === patternPath || pathname.startsWith(patternPath + '/');
        }
        return false;
    }
    
    // Pattern: domain.com (exact domain only)
    // Match the exact domain or subdomains
    return hostname === normalizedPattern || hostname.endsWith('.' + normalizedPattern);
}

/**
 * Check if a URL matches any pattern in a list
 * 
 * @param {string} url - The URL to check
 * @param {Array<string>} patterns - List of patterns to match against
 * @returns {Object} - { matches: boolean, matchedPattern: string|null }
 */
function matchesAnyPattern(url, patterns) {
    if (!patterns || !Array.isArray(patterns) || patterns.length === 0) {
        return { matches: false, matchedPattern: null };
    }
    
    for (const pattern of patterns) {
        if (matchesPattern(url, pattern)) {
            return { matches: true, matchedPattern: pattern };
        }
    }
    
    return { matches: false, matchedPattern: null };
}

/**
 * Check if a URL is a browser-internal URL that should always be allowed
 * 
 * @param {string} url - The URL to check
 * @returns {boolean} - True if URL should always be allowed
 */
function isInternalUrl(url) {
    if (!url) return true;
    
    const lowerUrl = url.toLowerCase();
    
    // Browser internal protocols
    if (lowerUrl.startsWith('chrome://') ||
        lowerUrl.startsWith('chrome-extension://') ||
        lowerUrl.startsWith('about:') ||
        lowerUrl.startsWith('devtools://') ||
        lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('blob:') ||
        lowerUrl.startsWith('javascript:')) {
        return true;
    }
    
    // DAOBrowser internal protocols
    if (lowerUrl.startsWith('dao-blocked://') ||
        lowerUrl.startsWith('dao-exam://')) {
        return true;
    }
    
    // Local development / backend
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        if (hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '0.0.0.0' ||
            hostname.endsWith('.localhost')) {
            return true;
        }
    } catch (e) {
        // Invalid URL
    }
    
    // File URLs
    if (lowerUrl.startsWith('file://')) {
        return true;
    }
    
    return false;
}

/**
 * Extract domain from URL for display purposes
 * 
 * @param {string} url - The URL
 * @returns {string} - The domain
 */
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return url;
    }
}

module.exports = {
    normalizeUrl,
    normalizePattern,
    matchesPattern,
    matchesAnyPattern,
    isInternalUrl,
    extractDomain
};

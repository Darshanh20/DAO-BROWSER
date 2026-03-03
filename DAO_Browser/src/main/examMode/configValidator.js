/**
 * Exam Mode Config Validator
 * Validates session configurations and URL patterns
 */

// ==================== CONFIG VALIDATION ====================

/**
 * Validate a session config object
 * @param {Object} config - The config object to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateConfig(config) {
    const errors = [];

    // Check required top-level fields
    if (!config) {
        return { valid: false, errors: ['Config object is required'] };
    }

    // Session ID
    if (!config.session_id) {
        errors.push('Session ID is required');
    } else if (!/^\d{6}$/.test(config.session_id)) {
        errors.push('Session ID must be a 6-digit number');
    }

    // Password hash
    if (!config.password_hash) {
        errors.push('Password hash is required');
    } else if (typeof config.password_hash !== 'string' || config.password_hash.length < 32) {
        errors.push('Invalid password hash format');
    }

    // Exam info
    if (!config.exam_info) {
        errors.push('Exam info is required');
    } else {
        if (!config.exam_info.name || typeof config.exam_info.name !== 'string') {
            errors.push('Exam name is required');
        }
        if (!config.exam_info.subject || typeof config.exam_info.subject !== 'string') {
            errors.push('Subject is required');
        }
        if (!config.exam_info.duration_minutes || typeof config.exam_info.duration_minutes !== 'number') {
            errors.push('Duration (in minutes) is required and must be a number');
        } else if (config.exam_info.duration_minutes < 1 || config.exam_info.duration_minutes > 480) {
            errors.push('Duration must be between 1 and 480 minutes');
        }
        if (!config.exam_info.created_at) {
            errors.push('Created timestamp is required');
        }
    }

    // Whitelist
    if (!Array.isArray(config.whitelist)) {
        errors.push('Whitelist must be an array');
    } else {
        config.whitelist.forEach((pattern, index) => {
            const patternValidation = validateWhitelistPattern(pattern);
            if (!patternValidation.valid) {
                errors.push(`Whitelist pattern ${index + 1}: ${patternValidation.error}`);
            }
        });
    }

    // Blacklist
    if (!Array.isArray(config.blacklist)) {
        errors.push('Blacklist must be an array');
    } else {
        config.blacklist.forEach((pattern, index) => {
            const patternValidation = validateWhitelistPattern(pattern);
            if (!patternValidation.valid) {
                errors.push(`Blacklist pattern ${index + 1}: ${patternValidation.error}`);
            }
        });
    }

    // Settings
    if (!config.settings) {
        errors.push('Settings object is required');
    } else {
        const requiredSettings = ['block_ai_tools', 'disable_downloads', 'disable_devtools', 'warn_on_exit'];
        requiredSettings.forEach(setting => {
            if (typeof config.settings[setting] !== 'boolean') {
                errors.push(`Setting '${setting}' must be a boolean`);
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ==================== URL PATTERN VALIDATION ====================

/**
 * Validate a whitelist/blacklist URL pattern
 * Supported formats:
 * - domain.com (exact domain)
 * - domain.com/* (domain with any path)
 * - *.domain.com (any subdomain)
 * - *.domain.com/* (any subdomain with any path)
 * - domain.com/specific/path
 * 
 * @param {string} pattern - The URL pattern to validate
 * @returns {Object} - { valid: boolean, error?: string }
 */
function validateWhitelistPattern(pattern) {
    if (!pattern || typeof pattern !== 'string') {
        return { valid: false, error: 'Pattern must be a non-empty string' };
    }

    const trimmed = pattern.trim();
    
    if (trimmed.length === 0) {
        return { valid: false, error: 'Pattern cannot be empty' };
    }

    if (trimmed.length > 255) {
        return { valid: false, error: 'Pattern is too long (max 255 characters)' };
    }

    // Remove protocol if present for validation
    let toValidate = trimmed;
    if (toValidate.includes('://')) {
        const parts = toValidate.split('://');
        const protocol = parts[0].toLowerCase();
        if (!['http', 'https', '*'].includes(protocol)) {
            return { valid: false, error: 'Invalid protocol (use http, https, or *)' };
        }
        toValidate = parts[1];
    }

    // Check for invalid characters
    const invalidChars = /[<>"|{}\\^`\[\]]/;
    if (invalidChars.test(toValidate)) {
        return { valid: false, error: 'Pattern contains invalid characters' };
    }

    // Check for valid domain pattern
    // Allow: alphanumeric, dots, hyphens, asterisks (for wildcards), slashes (for paths)
    const validPattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*(\/.*)?\*?$/;
    
    // Simpler check - just ensure it looks like a domain
    const simpleDomainCheck = /^(\*\.)?[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9](\/.*)?$/;
    
    if (!simpleDomainCheck.test(toValidate) && toValidate !== '*') {
        return { valid: false, error: 'Invalid domain pattern format' };
    }

    // Check for consecutive dots
    if (/\.\./.test(toValidate)) {
        return { valid: false, error: 'Pattern cannot have consecutive dots' };
    }

    // Check that domain has at least one dot (TLD required) unless it's localhost
    const domainPart = toValidate.split('/')[0].replace(/^\*\./, '');
    if (!domainPart.includes('.') && domainPart !== 'localhost') {
        return { valid: false, error: 'Domain must include a TLD (e.g., .com, .edu)' };
    }

    return { valid: true };
}

// ==================== PASSWORD VALIDATION ====================

/**
 * Validate password strength
 * @param {string} password - The password to validate
 * @returns {Object} - { valid: boolean, strength: 'weak'|'medium'|'strong', errors: string[] }
 */
function validatePassword(password) {
    const errors = [];
    let score = 0;

    if (!password || typeof password !== 'string') {
        return { 
            valid: false, 
            strength: 'weak', 
            errors: ['Password is required'] 
        };
    }

    // Minimum length check
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    } else {
        score += 1;
    }

    // Length bonus
    if (password.length >= 12) {
        score += 1;
    }

    // Contains lowercase
    if (/[a-z]/.test(password)) {
        score += 1;
    } else {
        errors.push('Password should contain lowercase letters');
    }

    // Contains uppercase
    if (/[A-Z]/.test(password)) {
        score += 1;
    } else {
        errors.push('Password should contain uppercase letters');
    }

    // Contains numbers
    if (/[0-9]/.test(password)) {
        score += 1;
    } else {
        errors.push('Password should contain numbers');
    }

    // Contains special characters
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        score += 1;
    }

    // Determine strength
    let strength;
    if (score <= 2) {
        strength = 'weak';
    } else if (score <= 4) {
        strength = 'medium';
    } else {
        strength = 'strong';
    }

    return {
        valid: password.length >= 8,
        strength: strength,
        errors: errors
    };
}

// ==================== EXAM INFO VALIDATION ====================

/**
 * Validate exam info fields
 * @param {Object} examInfo - The exam info to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateExamInfo(examInfo) {
    const errors = [];

    if (!examInfo) {
        return { valid: false, errors: ['Exam info is required'] };
    }

    // Name validation
    if (!examInfo.name || typeof examInfo.name !== 'string') {
        errors.push('Exam name is required');
    } else if (examInfo.name.trim().length < 3) {
        errors.push('Exam name must be at least 3 characters');
    } else if (examInfo.name.length > 100) {
        errors.push('Exam name is too long (max 100 characters)');
    }

    // Subject validation
    if (!examInfo.subject || typeof examInfo.subject !== 'string') {
        errors.push('Subject is required');
    } else if (examInfo.subject.trim().length < 2) {
        errors.push('Subject must be at least 2 characters');
    } else if (examInfo.subject.length > 50) {
        errors.push('Subject is too long (max 50 characters)');
    }

    // Duration validation
    const duration = parseInt(examInfo.duration_minutes);
    if (isNaN(duration)) {
        errors.push('Duration is required');
    } else if (duration < 1) {
        errors.push('Duration must be at least 1 minute');
    } else if (duration > 480) {
        errors.push('Duration cannot exceed 8 hours (480 minutes)');
    }

    // Created by validation (optional but if provided, validate)
    if (examInfo.created_by && examInfo.created_by.length > 50) {
        errors.push('Created by name is too long (max 50 characters)');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ==================== STUDENT INFO VALIDATION ====================

/**
 * Validate student info fields
 * @param {Object} studentInfo - The student info to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateStudentInfo(studentInfo) {
    const errors = [];

    if (!studentInfo) {
        return { valid: false, errors: ['Student info is required'] };
    }

    // Name validation
    if (!studentInfo.name || typeof studentInfo.name !== 'string') {
        errors.push('Student name is required');
    } else if (studentInfo.name.trim().length < 2) {
        errors.push('Student name must be at least 2 characters');
    } else if (studentInfo.name.length > 100) {
        errors.push('Student name is too long (max 100 characters)');
    }

    // Roll number validation
    if (!studentInfo.roll_number || typeof studentInfo.roll_number !== 'string') {
        errors.push('Roll number is required');
    } else if (studentInfo.roll_number.trim().length < 1) {
        errors.push('Roll number cannot be empty');
    } else if (studentInfo.roll_number.length > 30) {
        errors.push('Roll number is too long (max 30 characters)');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ==================== EXPORTS ====================

module.exports = {
    validateConfig,
    validateWhitelistPattern,
    validatePassword,
    validateExamInfo,
    validateStudentInfo
};

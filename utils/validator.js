const validator = require('validator');

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const validators = {
  // Text validation with length and content checks
  validateText(text, field, options = {}) {
    const { minLength = 1, maxLength = 1000, required = true } = options;
    
    if (!text || typeof text !== 'string') {
      if (required) {
        throw new ValidationError(`${field} is required and must be a string`, field);
      }
      return '';
    }

    // Trim and sanitize
    const trimmed = text.trim();
    
    if (required && trimmed.length === 0) {
      throw new ValidationError(`${field} cannot be empty`, field);
    }

    if (trimmed.length < minLength) {
      throw new ValidationError(`${field} must be at least ${minLength} characters long`, field);
    }

    if (trimmed.length > maxLength) {
      throw new ValidationError(`${field} cannot exceed ${maxLength} characters`, field);
    }

    // Remove potentially dangerous characters
    return validator.escape(trimmed);
  },

  // URL validation
  validateUrl(url, field, options = { required: false }) {
    if (!url) {
      if (options.required) {
        throw new ValidationError(`${field} is required`, field);
      }
      return '';
    }

    if (typeof url !== 'string') {
      throw new ValidationError(`${field} must be a string`, field);
    }

    const trimmed = url.trim();
    
    if (trimmed && !validator.isURL(trimmed, { 
      protocols: ['http', 'https'],
      require_protocol: true 
    })) {
      throw new ValidationError(`${field} must be a valid URL`, field);
    }

    return trimmed;
  },

  // User ID validation (Slack user IDs)
  validateUserId(userId, field = 'User ID') {
    if (!userId || typeof userId !== 'string') {
      throw new ValidationError(`${field} is required and must be a string`, field);
    }

    const trimmed = userId.trim();
    
    // Slack user IDs typically start with U and are alphanumeric
    if (!/^U[A-Z0-9]+$/i.test(trimmed)) {
      throw new ValidationError(`${field} has invalid format`, field);
    }

    return trimmed;
  },

  // Task type validation
  validateTaskType(taskType, field = 'Task Type') {
    const allowedTypes = [
      'New Feature',
      'Content Update', 
      'Feature Request',
      'Content Flag',
      'Content Edit'
    ];

    if (!taskType) {
      throw new ValidationError(`${field} is required`, field);
    }

    if (!allowedTypes.includes(taskType)) {
      throw new ValidationError(`${field} must be one of: ${allowedTypes.join(', ')}`, field);
    }

    return taskType;
  },

  // File array validation
  validateFiles(files, field = 'Files') {
    if (!files) return [];

    if (!Array.isArray(files)) {
      throw new ValidationError(`${field} must be an array`, field);
    }

    // Validate each file ID
    return files.map((fileId, index) => {
      if (typeof fileId !== 'string' || !fileId.trim()) {
        throw new ValidationError(`File ${index + 1} ID must be a non-empty string`, field);
      }
      return fileId.trim();
    });
  },

  // Sanitize for Monday.com GraphQL (prevent injection)
  sanitizeForGraphQL(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .replace(/[\\]/g, '\\\\')  // Escape backslashes
      .replace(/["]/g, '\\"')    // Escape double quotes
      .replace(/[']/g, "\\'")    // Escape single quotes
      .replace(/\n/g, '\\n')     // Escape newlines
      .replace(/\r/g, '\\r')     // Escape carriage returns
      .replace(/\t/g, '\\t');    // Escape tabs
  },

  // Validate complete KB request data
  validateKBRequest(requestData) {
    const validated = {};

    try {
      validated.subject = this.validateText(requestData.subject, 'Subject', { 
        minLength: 3, 
        maxLength: 200 
      });

      validated.taskType = this.validateTaskType(requestData.taskType);

      validated.product = this.validateText(requestData.product, 'Product', { 
        minLength: 2, 
        maxLength: 100 
      });

      validated.description = this.validateText(requestData.description, 'Description', { 
        minLength: 10, 
        maxLength: 5000 
      });

      validated.kbUrls = this.validateText(requestData.kbUrls, 'KB URLs', { 
        required: false, 
        maxLength: 2000 
      });

      validated.supportingMaterials = this.validateText(requestData.supportingMaterials, 'Supporting Materials', { 
        required: false, 
        maxLength: 2000 
      });

      validated.files = this.validateFiles(requestData.files);

      return validated;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('Validation failed with unexpected error', 'unknown');
    }
  }
};

module.exports = { validators, ValidationError };
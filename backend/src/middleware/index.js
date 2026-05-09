/**
 * =====================================================
 * Middleware - Comprehensive Error Handling & Validation
 * =====================================================
 */

import rateLimit from 'express-rate-limit';
import { 
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    normalizeError,
    formatErrorResponse,
    ErrorLogger
} from '../utils/errorHandling.js';

const errorLogger = new ErrorLogger('./logs');

// =====================================================
// SECURITY HEADERS MIDDLEWARE
// =====================================================

export function securityHeadersMiddleware(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    next();
}

// =====================================================
// RATE LIMITING MIDDLEWARE
// =====================================================

export const rateLimitMiddleware = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'ขีดจำกัดการร้องขอถูกเกิน กรุณาลองใหม่ภายหลัง',
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => {
        // Skip rate limiting for health check
        return req.path === '/health';
    }
});

// =====================================================
// JSON PAYLOAD VALIDATION
// =====================================================

export function validateJsonPayload(req, res, next) {
    res.on('finish', () => {
        if (req.rawBody && typeof req.rawBody !== 'string') {
            req.rawBody = '';
        }
    });

    let rawBody = '';
    req.on('data', chunk => {
        rawBody += chunk.toString();
        if (rawBody.length > 1e6) { // 1MB limit
            return next(new ValidationError('ข้อมูลเกินขีดจำกัดขนาด (1MB)'));
        }
    });

    req.on('end', () => {
        req.rawBody = rawBody;
        next();
    });
}

// =====================================================
// INPUT SANITIZATION
// =====================================================

/**
 * Sanitize input data
 */
function sanitizeValue(value) {
    if (typeof value === 'string') {
        // Remove potentially dangerous characters
        return value
            .replace(/[<>]/g, '') // Remove < and >
            .trim();
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const sanitized = {};
        for (const [key, val] of Object.entries(value)) {
            sanitized[key] = sanitizeValue(val);
        }
        return sanitized;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    return value;
}

export function sanitizeInputs(req, res, next) {
    if (req.body) {
        req.body = sanitizeValue(req.body);
    }
    if (req.query) {
        req.query = sanitizeValue(req.query);
    }
    if (req.params) {
        req.params = sanitizeValue(req.params);
    }
    next();
}

// =====================================================
// VALIDATION HELPERS
// =====================================================

export function validateAiApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
        return next(new ValidationError('ไม่พบ API Key'));
    }
    
    req.apiKey = apiKey;
    next();
}

export function isValidOfficerToken(token) {
    // ตรวจสอบรูปแบบ token ของเจ้าหน้าที่
    // ควรจะ check กับ database ในการใช้จริง
    return token && typeof token === 'string' && token.length >= 6;
}

export function validatePeopleCountRequest(req, res, next) {
    const { count, timestamp } = req.body;

    if (typeof count !== 'number') {
        return next(new ValidationError('count ต้องเป็นตัวเลข', { field: 'count' }));
    }

    if (count < 0) {
        return next(new ValidationError('count ต้องมากกว่า 0', { field: 'count' }));
    }

    if (timestamp && !isValidTimestamp(timestamp)) {
        return next(new ValidationError('timestamp ไม่ถูกต้อง', { field: 'timestamp' }));
    }

    next();
}

export function validateOfficerTokenRequest(req, res, next) {
    const { officerToken } = req.body;

    if (!officerToken || typeof officerToken !== 'string') {
        return next(new ValidationError('officerToken ไม่ถูกต้อง', { field: 'officerToken' }));
    }

    if (officerToken.length < 6) {
        return next(new ValidationError('officerToken ต้องมีความยาวอย่างน้อย 6 ตัวอักษร'));
    }

    next();
}

export function validateLineCallbackRequest(req, res, next) {
    const { code, state } = req.body;

    if (!code || typeof code !== 'string') {
        return next(new ValidationError('code ไม่ถูกต้อง', { field: 'code' }));
    }

    if (!state || typeof state !== 'string') {
        return next(new ValidationError('state ไม่ถูกต้อง', { field: 'state' }));
    }

    next();
}

// =====================================================
// HELPERS
// =====================================================

function isValidTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date instanceof Date && !isNaN(date);
}

// =====================================================
// 404 HANDLER
// =====================================================

export function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: {
            message: 'ไม่พบเส้นทาง API นี้',
            code: 'NOT_FOUND',
            path: req.path,
            method: req.method
        }
    });
}

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

/**
 * Express Global Error Handler (ต้องเป็นตัวสุดท้าย)
 * ต้องมี 4 parameters: (err, req, res, next)
 */
export function errorHandler(err, req, res, next) {
    const isDev = process.env.NODE_ENV === 'development';

    // Normalize error
    const normalizedError = normalizeError(err);

    // Log error
    errorLogger.log(normalizedError, {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        userId: req.user?.id
    });

    // Determine status code
    const statusCode = normalizedError.statusCode || 500;

    // Format error response
    const errorResponse = {
        success: false,
        error: {
            message: normalizedError.message,
            code: normalizedError.code,
            timestamp: new Date().toISOString(),
            ...(isDev && {
                stack: err.stack,
                details: err.details,
                originalError: err.originalError
            })
        }
    };

    // Add request tracking info in development
    if (isDev) {
        errorResponse.error.requestId = req.id || 'unknown';
        errorResponse.error.path = req.path;
    }

    // Send response
    res.status(statusCode).json(errorResponse);
}

// =====================================================
// REQUEST LOGGING MIDDLEWARE
// =====================================================

export function requestLoggingMiddleware(req, res, next) {
    const startTime = Date.now();

    // Generate unique request ID
    req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Log request
    console.log(`[${req.id}] ${req.method} ${req.path}`);

    // Override res.json to log response
    const originalJson = res.json;
    res.json = function(data) {
        const duration = Date.now() - startTime;
        const isSuccess = res.statusCode < 400;

        console.log(
            `[${req.id}] ${res.statusCode} ${isSuccess ? '✓' : '✗'} (${duration}ms)`
        );

        return originalJson.call(this, data);
    };

    next();
}

// =====================================================
// EXPORTS
// =====================================================

export const middleware = {
    securityHeadersMiddleware,
    rateLimitMiddleware,
    validateJsonPayload,
    sanitizeInputs,
    validateAiApiKey,
    isValidOfficerToken,
    validatePeopleCountRequest,
    validateOfficerTokenRequest,
    validateLineCallbackRequest,
    notFoundHandler,
    errorHandler,
    requestLoggingMiddleware
};

export default middleware;

/**
 * =====================================================
 * Error Handling Utilities
 * Comprehensive error wrapping, logging, and recovery
 * =====================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// CUSTOM ERROR CLASSES
// =====================================================

export class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.timestamp = new Date().toISOString();
        this.isDev = process.env.NODE_ENV === 'development';
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            error: {
                name: this.name,
                message: this.message,
                code: this.code,
                statusCode: this.statusCode,
                timestamp: this.timestamp,
                ...(this.isDev && { stack: this.stack })
            }
        };
    }
}

export class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
        this.details = details;
    }

    toJSON() {
        const base = super.toJSON();
        if (this.details) base.error.details = this.details;
        return base;
    }
}

export class AuthenticationError extends AppError {
    constructor(message = 'ไม่ได้รับอนุญาต') {
        super(message, 401, 'AUTHENTICATION_ERROR');
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends AppError {
    constructor(message = 'ไม่มีสิทธิ์เข้าถึง') {
        super(message, 403, 'AUTHORIZATION_ERROR');
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} ไม่พบ`, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message = 'ข้อมูลขัดแย้ง') {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
}

export class RateLimitError extends AppError {
    constructor(retryAfter = 60) {
        super('ขีดจำกัดการร้องขอถูกเกิน', 429, 'RATE_LIMIT');
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }

    toJSON() {
        const base = super.toJSON();
        base.error.retryAfter = this.retryAfter;
        return base;
    }
}

export class ExternalServiceError extends AppError {
    constructor(service = 'External Service', originalError = null) {
        super(`ไม่สามารถเชื่อมต่อกับ ${service} ได้`, 502, 'EXTERNAL_SERVICE_ERROR');
        this.name = 'ExternalServiceError';
        this.service = service;
        this.originalError = originalError?.message;
    }

    toJSON() {
        const base = super.toJSON();
        if (this.isDev && this.originalError) {
            base.error.originalError = this.originalError;
        }
        return base;
    }
}

export class DatabaseError extends AppError {
    constructor(message = 'ข้อผิดพลาดในฐานข้อมูล', originalError = null) {
        super(message, 500, 'DATABASE_ERROR');
        this.name = 'DatabaseError';
        this.originalError = originalError?.message;
    }

    toJSON() {
        const base = super.toJSON();
        if (this.isDev && this.originalError) {
            base.error.originalError = this.originalError;
        }
        return base;
    }
}

// =====================================================
// ERROR LOGGER
// =====================================================

export class ErrorLogger {
    constructor(logsDir = './logs') {
        this.logsDir = logsDir;
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }

    formatError(error, context = {}) {
        return {
            timestamp: new Date().toISOString(),
            type: error.name || 'Unknown',
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
            context: {
                userId: context.userId,
                method: context.method,
                path: context.path,
                ip: context.ip,
                userAgent: context.userAgent
            },
            stack: error.stack,
            isDev: process.env.NODE_ENV === 'development'
        };
    }

    logToFile(error, errorType = 'error') {
        const date = new Date();
        const filename = path.join(
            this.logsDir,
            `${errorType}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`
        );

        const logEntry = `${new Date().toISOString()} [${error.name}] ${error.message}\n${error.stack || ''}\n---\n`;

        try {
            fs.appendFileSync(filename, logEntry);
        } catch (e) {
            console.error('Failed to write to log file:', e.message);
        }
    }

    log(error, context = {}) {
        const formatted = this.formatError(error, context);

        if (error.statusCode >= 500) {
            console.error('[ERROR]', formatted);
            this.logToFile(error, 'error');
        } else if (error.statusCode >= 400) {
            console.warn('[WARNING]', formatted.message);
            this.logToFile(error, 'warning');
        } else {
            console.log('[INFO]', formatted.message);
        }

        return formatted;
    }
}

// =====================================================
// ASYNC FUNCTION WRAPPER
// =====================================================

export function asyncHandler(fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            throw normalizeError(error);
        }
    };
}

export function expressAsyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((error) => {
            next(normalizeError(error));
        });
    };
}

// =====================================================
// ERROR NORMALIZATION
// =====================================================

export function normalizeError(error) {
    if (error instanceof AppError) {
        return error;
    }

    if (error.name === 'ValidationError' || error.statusCode === 400) {
        return new ValidationError(error.message, error.details);
    }

    if (error.name === 'DatabaseError' || error.code?.includes('SQLITE')) {
        return new DatabaseError(error.message, error);
    }

    if (error.code?.includes('ECONNREFUSED') || error.code?.includes('ETIMEDOUT')) {
        return new ExternalServiceError('External API', error);
    }

    if (error.name === 'JsonWebTokenError' || error.message?.includes('token')) {
        return new AuthenticationError(error.message);
    }

    if (error.statusCode) {
        return new AppError(error.message, error.statusCode, error.code);
    }

    return new AppError(
        error.message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ',
        500,
        'INTERNAL_ERROR'
    );
}

// =====================================================
// RETRY LOGIC
// =====================================================

export async function retryAsync(fn, options = {}) {
    const {
        maxAttempts = 3,
        delayMs = 1000,
        backoffMultiplier = 2,
        shouldRetry = () => true
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (!shouldRetry(error) || attempt === maxAttempts) {
                throw error;
            }

            const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
            console.log(`[Retry] Attempt ${attempt} failed, retrying in ${delay}ms...`);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

// =====================================================
// CIRCUIT BREAKER
// =====================================================

export class CircuitBreaker {
    constructor(fn, options = {}) {
        this.fn = fn;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeoutMs = options.resetTimeoutMs || 60000;

        this.state = 'CLOSED';
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
    }

    async call(...args) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }

        try {
            const result = await this.fn(...args);

            if (this.state === 'HALF_OPEN') {
                this.successCount++;
                if (this.successCount >= 2) {
                    this.state = 'CLOSED';
                    this.failureCount = 0;
                }
            }

            return result;
        } catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();

            if (this.failureCount >= this.failureThreshold) {
                this.state = 'OPEN';
            }

            throw error;
        }
    }

    getStatus() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailureTime: this.lastFailureTime,
            successCount: this.successCount
        };
    }
}

// =====================================================
// GLOBAL ERROR HANDLERS
// =====================================================

export function setupGlobalErrorHandlers() {
    process.on('unhandledRejection', (reason, promise) => {
        console.error('[Unhandled Rejection]', reason, promise);
    });

    process.on('uncaughtException', (error) => {
        console.error('[Uncaught Exception]', error);
    });
}

// =====================================================
// ERROR RESPONSE FORMATTER
// =====================================================

export function formatErrorResponse(error, isDev = false) {
    if (error instanceof AppError) {
        return {
            success: false,
            error: {
                message: error.message,
                code: error.code,
                ...(isDev && {
                    stack: error.stack,
                    details: error.details
                })
            }
        };
    }

    return {
        success: false,
        error: {
            message: error.message || 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ',
            code: 'INTERNAL_ERROR',
            ...(isDev && { stack: error.stack })
        }
    };
}

// =====================================================
// VALIDATION HELPERS
// =====================================================

export function validateRequired(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field]);
    
    if (missing.length > 0) {
        throw new ValidationError(
            'ข้อมูลไม่ครบถ้วน',
            { missingFields: missing }
        );
    }
}

export function validateTypes(data, schema) {
    const errors = {};

    for (const [field, expectedType] of Object.entries(schema)) {
        if (data[field] !== undefined) {
            const actualType = typeof data[field];
            if (actualType !== expectedType) {
                errors[field] = `คาดหวัง ${expectedType} แต่ได้ ${actualType}`;
            }
        }
    }

    if (Object.keys(errors).length > 0) {
        throw new ValidationError('ข้อมูลมีประเภทไม่ถูกต้อง', errors);
    }
}

export function validateRange(value, min, max, fieldName = 'ค่า') {
    if (value < min || value > max) {
        throw new ValidationError(
            `${fieldName} ต้องอยู่ระหว่าง ${min} ถึง ${max}`,
            { value, min, max }
        );
    }
}

export const errorHandling = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ErrorLogger,
    asyncHandler,
    expressAsyncHandler,
    normalizeError,
    retryAsync,
    CircuitBreaker,
    setupGlobalErrorHandlers,
    formatErrorResponse,
    validateRequired,
    validateTypes,
    validateRange
};

export default errorHandling;

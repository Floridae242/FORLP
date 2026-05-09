/**
 * =====================================================
 * Utils Index - Export all error handling & service utilities
 * =====================================================
 */

export {
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
} from './errorHandling.js';

export {
    wrapService,
    withDatabase,
    withTransaction,
    callExternalAPI,
    batchOperation,
    createPollingWrapper,
    wrapRequest,
    createCacheWrapper
} from './serviceWrapper.js';

export default {
    // Error Handling
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
    validateRange,
    // Service Wrappers
    wrapService,
    withDatabase,
    withTransaction,
    callExternalAPI,
    batchOperation,
    createPollingWrapper,
    wrapRequest,
    createCacheWrapper
};

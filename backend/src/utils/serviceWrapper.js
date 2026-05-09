/**
 * =====================================================
 * Service Wrapper - Automatic Error Handling & Recovery
 * Retry logic, Circuit Breaker, Timeout handling
 * =====================================================
 */

import {
    retryAsync,
    CircuitBreaker,
    ExternalServiceError,
    DatabaseError,
    normalizeError
} from './errorHandling.js';

// =====================================================
// SERVICE WRAPPER
// =====================================================

export function wrapService(service, serviceName = 'Service', methodConfig = {}) {
    const wrapped = {};
    const breakers = {};

    for (const [methodName, method] of Object.entries(service)) {
        if (typeof method !== 'function') {
            wrapped[methodName] = method;
            continue;
        }

        const config = methodConfig[methodName] || {};
        const {
            retryable = false,
            maxRetries = 3,
            circuitBreaker = false,
            timeout = 30000,
            logErrors = true
        } = config;

        if (circuitBreaker) {
            breakers[methodName] = new CircuitBreaker(
                (...args) => method.apply(service, args),
                { failureThreshold: 5, resetTimeoutMs: 60000 }
            );
        }

        wrapped[methodName] = async (...args) => {
            const startTime = Date.now();

            try {
                let result;

                if (breakers[methodName]) {
                    result = await Promise.race([
                        breakers[methodName].call(...args),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), timeout)
                        )
                    ]);
                } else if (retryable) {
                    result = await retryAsync(
                        () => method.apply(service, args),
                        { maxAttempts: maxRetries, delayMs: 1000, backoffMultiplier: 2 }
                    );
                } else {
                    result = await Promise.race([
                        method.apply(service, args),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), timeout)
                        )
                    ]);
                }

                const duration = Date.now() - startTime;
                console.log(`[${serviceName}.${methodName}] ✓ ${duration}ms`);

                return {
                    success: true,
                    data: result,
                    duration,
                    service: serviceName
                };
            } catch (error) {
                const duration = Date.now() - startTime;
                const normalized = normalizeError(error);

                if (logErrors) {
                    console.error(`[${serviceName}.${methodName}] ✗ ${duration}ms - ${normalized.message}`);
                }

                return {
                    success: false,
                    error: normalized.message,
                    code: normalized.code,
                    duration,
                    service: serviceName
                };
            }
        };
    }

    return wrapped;
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

export async function withDatabase(fn, operationName = 'Database Operation') {
    try {
        const result = await fn();
        console.log(`[DB] ${operationName} ✓`);
        return { success: true, data: result };
    } catch (error) {
        console.error(`[DB] ${operationName} ✗ - ${error.message}`);
        throw new DatabaseError(`${operationName} ล้มเหลว`, error);
    }
}

export async function withTransaction(db, fn, operationName = 'Transaction') {
    const transaction = db.transaction(fn);

    try {
        const result = transaction();
        console.log(`[DB Transaction] ${operationName} ✓`);
        return { success: true, data: result };
    } catch (error) {
        console.error(`[DB Transaction] ${operationName} ✗ - ${error.message}`);
        throw new DatabaseError(`Transaction ${operationName} ล้มเหลว`, error);
    }
}

// =====================================================
// EXTERNAL API CALLS
// =====================================================

export async function callExternalAPI(serviceName, fn, options = {}) {
    const {
        retryable = true,
        maxRetries = 3,
        timeout = 15000,
        logErrors = true
    } = options;

    const startTime = Date.now();

    try {
        let result;

        if (retryable) {
            result = await retryAsync(fn, {
                maxAttempts: maxRetries,
                delayMs: 1000,
                backoffMultiplier: 2,
                shouldRetry: (error) => {
                    return error.code?.includes('ECONNREFUSED') ||
                           error.code?.includes('ETIMEDOUT') ||
                           error.code?.includes('ENOTFOUND');
                }
            });
        } else {
            result = await Promise.race([
                fn(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), timeout)
                )
            ]);
        }

        const duration = Date.now() - startTime;
        console.log(`[API ${serviceName}] ✓ ${duration}ms`);

        return {
            success: true,
            data: result,
            service: serviceName,
            duration,
            retried: false
        };
    } catch (error) {
        const duration = Date.now() - startTime;

        if (logErrors) {
            console.error(`[API ${serviceName}] ✗ ${duration}ms - ${error.message}`);
        }

        throw new ExternalServiceError(serviceName, error);
    }
}

// =====================================================
// BATCH OPERATIONS
// =====================================================

export async function batchOperation(items, fn, options = {}) {
    const {
        maxConcurrent = 5,
        continueOnError = true,
        timeout = 30000
    } = options;

    const results = [];
    const errors = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < items.length; i += maxConcurrent) {
        const batch = items.slice(i, i + maxConcurrent);

        const batchResults = await Promise.allSettled(
            batch.map(async (item) => {
                try {
                    return await Promise.race([
                        fn(item),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), timeout)
                        )
                    ]);
                } catch (error) {
                    if (!continueOnError) throw error;
                    return { error: error.message };
                }
            })
        );

        batchResults.forEach((result) => {
            if (result.status === 'fulfilled') {
                if (result.value?.error) {
                    errors.push(result.value.error);
                    errorCount++;
                } else {
                    results.push(result.value);
                    successCount++;
                }
            } else {
                errors.push(result.reason?.message);
                errorCount++;
            }
        });
    }

    return {
        success: errorCount === 0,
        results,
        errors,
        successCount,
        errorCount,
        totalCount: items.length
    };
}

// =====================================================
// POLLING OPERATIONS
// =====================================================

export function createPollingWrapper(fn, intervalMs = 5000, options = {}) {
    const {
        maxAttempts = 100,
        exitCondition = () => false,
        onError = () => {},
        maxConsecutiveErrors = 5
    } = options;

    let isRunning = false;
    let attempts = 0;
    let consecutiveErrors = 0;
    let pollerId = null;

    return {
        start() {
            if (isRunning) return;
            isRunning = true;
            attempts = 0;
            consecutiveErrors = 0;

            console.log(`[Polling] Started with ${intervalMs}ms interval`);

            pollerId = setInterval(async () => {
                attempts++;

                try {
                    const result = await fn();

                    consecutiveErrors = 0;

                    if (exitCondition(result)) {
                        console.log(`[Polling] Exit condition met at attempt ${attempts}`);
                        this.stop();
                    }
                } catch (error) {
                    consecutiveErrors++;

                    onError(error, attempts);

                    if (consecutiveErrors >= maxConsecutiveErrors) {
                        console.error(`[Polling] Too many consecutive errors (${consecutiveErrors}), stopping`);
                        this.stop();
                    }
                }

                if (attempts >= maxAttempts) {
                    console.log(`[Polling] Max attempts reached (${attempts}), stopping`);
                    this.stop();
                }
            }, intervalMs);
        },

        stop() {
            if (pollerId) {
                clearInterval(pollerId);
                pollerId = null;
            }
            isRunning = false;
            console.log(`[Polling] Stopped after ${attempts} attempts`);
        },

        getStats() {
            return {
                isRunning,
                attempts,
                consecutiveErrors,
                interval: intervalMs
            };
        }
    };
}

// =====================================================
// REQUEST WRAPPER
// =====================================================

export async function wrapRequest(fn, metadata = {}) {
    const startTime = Date.now();
    const requestId = metadata.requestId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
        const result = await fn();
        const duration = Date.now() - startTime;

        console.log(`[Request ${requestId}] ✓ ${duration}ms`);

        return {
            success: true,
            data: result,
            duration,
            requestId
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        const normalized = normalizeError(error);

        console.error(`[Request ${requestId}] ✗ ${duration}ms - ${normalized.message}`);

        return {
            success: false,
            error: normalized.message,
            code: normalized.code,
            duration,
            requestId
        };
    }
}

// =====================================================
// CACHING WRAPPER
// =====================================================

export function createCacheWrapper(ttlMs = 60000) {
    const cache = new Map();

    return {
        async get(key, fn) {
            if (cache.has(key)) {
                const { data, expiresAt } = cache.get(key);
                if (Date.now() < expiresAt) {
                    console.log(`[Cache] HIT: ${key}`);
                    return data;
                }
                cache.delete(key);
            }

            console.log(`[Cache] MISS: ${key}, fetching...`);
            const data = await fn();

            cache.set(key, {
                data,
                expiresAt: Date.now() + ttlMs
            });

            return data;
        },

        set(key, data) {
            cache.set(key, {
                data,
                expiresAt: Date.now() + ttlMs
            });
        },

        clear(key) {
            if (key) {
                cache.delete(key);
            } else {
                cache.clear();
            }
        },

        getStats() {
            return {
                size: cache.size,
                ttlMs
            };
        }
    };
}

// =====================================================
// EXPORTS
// =====================================================

export const serviceWrapper = {
    wrapService,
    withDatabase,
    withTransaction,
    callExternalAPI,
    batchOperation,
    createPollingWrapper,
    wrapRequest,
    createCacheWrapper
};

export default serviceWrapper;

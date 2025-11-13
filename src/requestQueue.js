/**
 * Request Queue Manager for handling concurrent users
 * Optimized for Render 512MB RAM / 0.1 CPU
 */

class RequestQueue {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 1; // Max 1 concurrent API call
    this.maxQueueSize = options.maxQueueSize || 50; // Max 50 queued requests
    this.requestTimeout = options.requestTimeout || 60000; // 60s timeout
    
    this.activeRequests = 0;
    this.queue = [];
    this.userRateLimits = new Map(); // Track per-user rate limits
    
    // Rate limiting: 5 requests per minute per user
    this.rateLimitWindow = 60000; // 1 minute
    this.maxRequestsPerWindow = 5;
    
    // Cleanup old rate limit entries every 5 minutes
    setInterval(() => this.cleanupRateLimits(), 300000);
  }

  /**
   * Check if user is rate limited
   */
  isRateLimited(userId) {
    const userLimit = this.userRateLimits.get(userId);
    if (!userLimit) return false;
    
    const now = Date.now();
    // Remove requests older than rate limit window
    userLimit.requests = userLimit.requests.filter(
      timestamp => now - timestamp < this.rateLimitWindow
    );
    
    if (userLimit.requests.length >= this.maxRequestsPerWindow) {
      const oldestRequest = Math.min(...userLimit.requests);
      const timeUntilReset = this.rateLimitWindow - (now - oldestRequest);
      return {
        limited: true,
        retryAfter: Math.ceil(timeUntilReset / 1000) // seconds
      };
    }
    
    return { limited: false };
  }

  /**
   * Record a request for rate limiting
   */
  recordRequest(userId) {
    if (!this.userRateLimits.has(userId)) {
      this.userRateLimits.set(userId, { requests: [] });
    }
    this.userRateLimits.get(userId).requests.push(Date.now());
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits() {
    const now = Date.now();
    for (const [userId, data] of this.userRateLimits.entries()) {
      data.requests = data.requests.filter(
        timestamp => now - timestamp < this.rateLimitWindow
      );
      if (data.requests.length === 0) {
        this.userRateLimits.delete(userId);
      }
    }
  }

  /**
   * Add request to queue
   */
  async enqueue(userId, username, requestFn) {
    // Check rate limit
    const rateLimitStatus = this.isRateLimited(userId);
    if (rateLimitStatus.limited) {
      throw new Error(`Rate limit exceeded. Please try again in ${rateLimitStatus.retryAfter} seconds.`);
    }

    // Check queue size
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error('Server is busy. Please try again in a moment.');
    }

    // Record request for rate limiting
    this.recordRequest(userId);

    return new Promise((resolve, reject) => {
      const request = {
        userId,
        username,
        requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: setTimeout(() => {
          this.removeFromQueue(request);
          reject(new Error('Request timeout'));
        }, this.requestTimeout)
      };

      this.queue.push(request);
      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  async processQueue() {
    // Process requests if we have capacity
    while (this.activeRequests < this.maxConcurrent && this.queue.length > 0) {
      const request = this.queue.shift();
      
      if (!request) continue;

      this.activeRequests++;
      
      // Execute request
      this.executeRequest(request)
        .then(result => {
          clearTimeout(request.timeout);
          request.resolve(result);
        })
        .catch(error => {
          clearTimeout(request.timeout);
          request.reject(error);
        })
        .finally(() => {
          this.activeRequests--;
          // Process next request in queue
          setImmediate(() => this.processQueue());
        });
    }
  }

  /**
   * Execute a single request
   */
  async executeRequest(request) {
    const startTime = Date.now();
    
    try {
      console.log(`[Queue] Processing request from ${request.username} (${this.activeRequests} active, ${this.queue.length} queued)`);
      
      const result = await request.requestFn();
      
      const elapsed = Date.now() - startTime;
      console.log(`[Queue] Completed request from ${request.username} in ${elapsed}ms`);
      
      return result;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[Queue] Failed request from ${request.username} after ${elapsed}ms:`, error.message);
      throw error;
    }
  }

  /**
   * Remove request from queue
   */
  removeFromQueue(request) {
    const index = this.queue.indexOf(request);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      totalUsers: this.userRateLimits.size
    };
  }
}

// Singleton instance
const requestQueue = new RequestQueue({
  maxConcurrent: 1,      // Max 1 concurrent API call
  maxQueueSize: 50,      // Max 50 queued requests
  requestTimeout: 60000  // 60 second timeout
});

module.exports = requestQueue;

// Simple in-memory cache for API responses
// For production, consider using Redis or Vercel KV

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map();
  
  // Set cache with TTL in seconds
  set(key: string, data: any, ttl: number = 300) { // Default 5 minutes
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl * 1000 // Convert to milliseconds
    });
  }
  
  // Get from cache if not expired
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    const now = Date.now();
    const isExpired = now - entry.timestamp > entry.ttl;
    
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  // Clear specific key
  clear(key: string) {
    this.cache.delete(key);
  }
  
  // Clear all cache
  clearAll() {
    this.cache.clear();
  }
  
  // Generate cache key from request params
  static generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${prefix}:${sortedParams}`;
  }
}

// Singleton instance
export const apiCache = new SimpleCache();

// Cache TTL configurations (in seconds)
export const CACHE_TTL = {
  SALES_SUMMARY: 300,      // 5 minutes
  SALES_DAILY: 300,        // 5 minutes  
  PRODUCTS: 600,           // 10 minutes
  TRAFFIC: 900,            // 15 minutes
  SEARCH_CONSOLE: 1800,    // 30 minutes
  ADVERTISING: 600,        // 10 minutes
  CATEGORIES: 900,         // 15 minutes
};
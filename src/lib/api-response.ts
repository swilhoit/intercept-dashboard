import { NextResponse } from 'next/server';

interface CacheOptions {
  maxAge?: number;      // Browser cache in seconds
  sMaxAge?: number;     // CDN cache in seconds  
  staleWhileRevalidate?: number; // Serve stale content while revalidating
  revalidate?: number;  // ISR revalidation time
}

const DEFAULT_CACHE: CacheOptions = {
  maxAge: 60,           // 1 minute browser cache
  sMaxAge: 300,         // 5 minutes CDN cache
  staleWhileRevalidate: 600, // 10 minutes stale-while-revalidate
};

export function cachedResponse(
  data: any, 
  options: CacheOptions = DEFAULT_CACHE,
  cacheHit: boolean = false
) {
  const { maxAge, sMaxAge, staleWhileRevalidate } = { ...DEFAULT_CACHE, ...options };
  
  const cacheControl = [
    'public',
    `max-age=${maxAge}`,
    `s-maxage=${sMaxAge}`,
    staleWhileRevalidate ? `stale-while-revalidate=${staleWhileRevalidate}` : ''
  ].filter(Boolean).join(', ');

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': cacheControl,
      'CDN-Cache-Control': `max-age=${sMaxAge * 2}`, // Longer CDN cache
      'Vercel-CDN-Cache-Control': `max-age=${sMaxAge * 4}`, // Even longer Vercel edge cache
      'X-Cache': cacheHit ? 'HIT' : 'MISS',
      'X-Response-Time': `${Date.now()}`,
    }
  });
}

// Different cache strategies for different data types
export const CACHE_STRATEGIES = {
  // Frequently changing data (sales, orders)
  REALTIME: {
    maxAge: 30,
    sMaxAge: 60,
    staleWhileRevalidate: 120,
  },
  
  // Semi-static data (products, categories)
  STANDARD: {
    maxAge: 300,
    sMaxAge: 600,
    staleWhileRevalidate: 1800,
  },
  
  // Rarely changing data (historical reports)
  STATIC: {
    maxAge: 3600,
    sMaxAge: 7200,
    staleWhileRevalidate: 86400,
  },
  
  // Analytics data (traffic, search console)
  ANALYTICS: {
    maxAge: 900,
    sMaxAge: 1800,
    staleWhileRevalidate: 3600,
  }
};
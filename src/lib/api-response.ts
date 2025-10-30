import { NextResponse } from 'next/server';
import { bigquery } from './bigquery';
import NodeCache from 'node-cache';

// In-memory cache with a standard TTL of 10 minutes, matching the default stale-while-revalidate time.
const cache = new NodeCache({ stdTTL: 600 });


interface CacheOptions {
  maxAge?: number;      // Browser cache in seconds
  sMaxAge?: number;     // CDN cache in seconds  
  staleWhileRevalidate?: number; // Serve stale content while revalidating
}

const DEFAULT_CACHE: CacheOptions = {
  maxAge: 60,           // 1 minute browser cache
  sMaxAge: 300,         // 5 minutes CDN cache
  staleWhileRevalidate: 600, // 10 minutes stale-while-revalidate
};

export async function cachedResponse(
  cacheKey: string,
  query: string,
  options: CacheOptions = DEFAULT_CACHE
) {
  // Check if we have a cached response
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return jsonResponse(cachedData, options, true);
  }

  // If not in cache, run the BigQuery query
  const [rows] = await bigquery.query(query);
  
  // Store the result in cache. The TTL should align with the CDN cache time.
  const cacheTtl = options.sMaxAge || 300;
  cache.set(cacheKey, rows, cacheTtl);

  // Return the newly fetched data
  return jsonResponse(rows, options, false);
}


function jsonResponse(
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
      'CDN-Cache-Control': `max-age=${(sMaxAge || 300) * 2}`, // Longer CDN cache
      'Vercel-CDN-Cache-Control': `max-age=${(sMaxAge || 300) * 4}`, // Even longer Vercel edge cache
      'X-Cache-Status': cacheHit ? 'HIT' : 'MISS',
      'X-Cache-Provider': 'In-Memory',
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
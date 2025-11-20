import { BigQuery } from '@google-cloud/bigquery';
import { unstable_cache } from 'next/cache';

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'intercept-sales-2508061117';

// Configure BigQuery client for both development and production
let bigqueryOptions: any = {
  projectId: projectId,
};

// In production (Vercel), use service account JSON from environment variable
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    bigqueryOptions = {
      ...bigqueryOptions,
      credentials,
    };
  } catch (error) {
    console.error('Error parsing GOOGLE_SERVICE_ACCOUNT_JSON:', error);
  }
}

export const bigquery = new BigQuery(bigqueryOptions);

// Type for BigQuery query options
interface QueryOptions {
  query: string;
  params?: any;
  [key: string]: any;
}

/**
 * Executes a BigQuery query with Next.js Data Cache.
 * 
 * @param query The SQL query string
 * @param params Optional query parameters
 * @param tags Cache tags for revalidation (e.g., ['sales-data'])
 * @param revalidateSeconds Cache duration in seconds (default: 300 / 5 mins)
 */
export const cachedQuery = async <T = any>(
  query: string, 
  params?: any, 
  tags: string[] = [], 
  revalidateSeconds: number = 300
): Promise<T[]> => {
  
  // Create a unique key for the cache based on query and params
  // We use a simple hashing approach or just the stringified version
  // Note: unstable_cache keys must be strings
  const queryKey = JSON.stringify({ query, params });

  const getCachedData = unstable_cache(
    async () => {
      try {
        const [rows] = await bigquery.query({ query, params });
        return rows as T[];
      } catch (error) {
        console.error('BigQuery Query Error:', error);
        throw error;
      }
    },
    [queryKey], // Key parts for the cache
    {
      tags: tags,
      revalidate: revalidateSeconds
    }
  );

  return getCachedData();
};

export interface DailySales {
  date: string;
  amazon_sales: number;
  woocommerce_sales: number;
  total_sales: number;
}

export interface ProductSales {
  product_name: string;
  channel: string;
  total_sales: number;
  quantity: number;
}

export interface MonthlySales {
  month: string;
  amazon_total: number;
  woocommerce_total: number;
  total_revenue: number;
}

export interface ChannelBreakdown {
  channel: string;
  revenue: number;
  percentage: number;
}

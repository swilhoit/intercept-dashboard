import { BigQuery } from '@google-cloud/bigquery';

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
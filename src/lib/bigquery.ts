import { BigQuery } from '@google-cloud/bigquery';

const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'intercept-sales-2508061117';

// Use Application Default Credentials or service account
export const bigquery = new BigQuery({
  projectId: projectId,
});

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
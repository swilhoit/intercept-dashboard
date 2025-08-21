import { BigQuery } from '@google-cloud/bigquery';

const credentials = {
  client_email: process.env.GOOGLE_CLOUD_CLIENT_EMAIL!,
  private_key: process.env.GOOGLE_CLOUD_PRIVATE_KEY!.replace(/\\n/g, '\n'),
};

export const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  credentials,
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
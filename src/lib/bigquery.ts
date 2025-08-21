import { BigQuery } from '@google-cloud/bigquery';

const privateKey = process.env.GOOGLE_CLOUD_PRIVATE_KEY || '';
const clientEmail = process.env.GOOGLE_CLOUD_CLIENT_EMAIL || '';
const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';

const credentials = clientEmail && privateKey ? {
  client_email: clientEmail,
  private_key: privateKey.replace(/\\n/g, '\n'),
} : undefined;

export const bigquery = projectId && credentials ? new BigQuery({
  projectId: projectId,
  credentials,
}) : null as any;

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
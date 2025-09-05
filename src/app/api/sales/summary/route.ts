import { NextRequest, NextResponse } from 'next/server';
import { bigquery } from '@/lib/bigquery';
import { checkBigQueryConfig, handleApiError } from '@/lib/api-helpers';
import { cachedResponse, CACHE_STRATEGIES } from '@/lib/api-response';
import { calculatePreviousPeriod, calculatePercentageChange } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const configError = checkBigQueryConfig();
  if (configError) return configError;
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    let whereClause = '';
    if (startDate && endDate) {
      whereClause = ` WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    }
    
    const query = `
      SELECT 
        SUM(total_sales) as total_revenue,
        AVG(total_sales) as avg_daily_sales,
        COUNT(DISTINCT date) as days_with_sales,
        SUM(amazon_sales) as amazon_revenue,
        SUM(woocommerce_sales) as woocommerce_revenue,
        MAX(total_sales) as highest_day,
        MIN(total_sales) as lowest_day
      FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
      ${whereClause}
    `;
    
    const [rows] = await bigquery.query(query);
    const currentData = rows[0] || {};
    
    // Get previous period data for comparison if date range is provided
    let previousData: any = {};
    let percentageChanges: any = {};
    
    if (startDate && endDate) {
      const previousPeriod = calculatePreviousPeriod(startDate, endDate);
      const prevWhereClause = ` WHERE date >= '${previousPeriod.startDate}' AND date <= '${previousPeriod.endDate}'`;
      
      const prevQuery = `
        SELECT 
          SUM(total_sales) as total_revenue,
          AVG(total_sales) as avg_daily_sales,
          COUNT(DISTINCT date) as days_with_sales,
          SUM(amazon_sales) as amazon_revenue,
          SUM(woocommerce_sales) as woocommerce_revenue,
          MAX(total_sales) as highest_day,
          MIN(total_sales) as lowest_day
        FROM \`intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES\`
        ${prevWhereClause}
      `;
      
      const [prevRows] = await bigquery.query(prevQuery);
      previousData = prevRows[0] || {};
      
      // Calculate percentage changes
      percentageChanges = {
        total_revenue: calculatePercentageChange(currentData.total_revenue || 0, previousData.total_revenue || 0),
        avg_daily_sales: calculatePercentageChange(currentData.avg_daily_sales || 0, previousData.avg_daily_sales || 0),
        amazon_revenue: calculatePercentageChange(currentData.amazon_revenue || 0, previousData.amazon_revenue || 0),
        woocommerce_revenue: calculatePercentageChange(currentData.woocommerce_revenue || 0, previousData.woocommerce_revenue || 0),
        highest_day: calculatePercentageChange(currentData.highest_day || 0, previousData.highest_day || 0),
      };
    }
    
    const response = {
      ...currentData,
      previous_period: previousData,
      percentage_changes: percentageChanges,
      has_comparison: startDate && endDate ? true : false
    };
    
    return cachedResponse(response, CACHE_STRATEGIES.REALTIME);
  } catch (error) {
    return handleApiError(error);
  }}
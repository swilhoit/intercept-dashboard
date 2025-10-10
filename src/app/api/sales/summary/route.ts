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

    // Get organic clicks data from GA4 attribution table
    let organicClicksClause = '';
    if (startDate && endDate) {
      organicClicksClause = ` WHERE date >= '${startDate}' AND date <= '${endDate}'`;
    }

    const organicClicksQuery = `
      SELECT
        SUM(clicks) as total_organic_clicks
      FROM \`intercept-sales-2508061117.GA4.ATTRIBUTION_DAILY\`
      ${organicClicksClause}
      AND source = 'google'
      AND medium = 'organic'
    `;
    
    const [rows] = await bigquery.query(query);
    const currentData = rows[0] || {};

    // Get organic clicks
    let organicClicks = 0;
    try {
      const [organicRows] = await bigquery.query(organicClicksQuery);
      organicClicks = organicRows[0]?.total_organic_clicks || 0;
    } catch (error) {
      console.error('Error fetching organic clicks:', error);
    }
    
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

      const prevOrganicQuery = `
        SELECT
          SUM(clicks) as total_organic_clicks
        FROM \`intercept-sales-2508061117.GA4.ATTRIBUTION_DAILY\`
        WHERE date >= '${previousPeriod.startDate}' AND date <= '${previousPeriod.endDate}'
        AND source = 'google'
        AND medium = 'organic'
      `;
      
      const [prevRows] = await bigquery.query(prevQuery);
      previousData = prevRows[0] || {};

      // Get previous period organic clicks
      let prevOrganicClicks = 0;
      try {
        const [prevOrganicRows] = await bigquery.query(prevOrganicQuery);
        prevOrganicClicks = prevOrganicRows[0]?.total_organic_clicks || 0;
      } catch (error) {
        console.error('Error fetching previous organic clicks:', error);
      }
      
      // Calculate percentage changes
      percentageChanges = {
        total_revenue: calculatePercentageChange(currentData.total_revenue || 0, previousData.total_revenue || 0),
        avg_daily_sales: calculatePercentageChange(currentData.avg_daily_sales || 0, previousData.avg_daily_sales || 0),
        amazon_revenue: calculatePercentageChange(currentData.amazon_revenue || 0, previousData.amazon_revenue || 0),
        woocommerce_revenue: calculatePercentageChange(currentData.woocommerce_revenue || 0, previousData.woocommerce_revenue || 0),
        highest_day: calculatePercentageChange(currentData.highest_day || 0, previousData.highest_day || 0),
        organicClicks: calculatePercentageChange(organicClicks, prevOrganicClicks),
      };
    }
    
    const response = {
      ...currentData,
      organic_clicks: organicClicks,
      previous_period: previousData,
      percentage_changes: percentageChanges,
      has_comparison: startDate && endDate ? true : false
    };
    
    return cachedResponse({
      ...response,
      _timestamp: Date.now(),
      _debugInfo: {
        message: "WooCommerce cache fix applied",
        actualWooCommerceRevenue: currentData.woocommerce_revenue || 0
      }
    }, {
      maxAge: 0,
      sMaxAge: 0,
      staleWhileRevalidate: 0
    });
  } catch (error) {
    return handleApiError(error);
  }}
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
    
    // Get current WooCommerce revenue directly from individual site tables
    let wooWhereClause = '';
    if (startDate && endDate) {
      wooWhereClause = ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }

    const wooCommerceRevenueQuery = `
      WITH all_woo_revenue AS (
        SELECT SUM(total_revenue) as revenue FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        UNION ALL
        SELECT SUM(total_revenue) as revenue FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        UNION ALL
        SELECT SUM(total_revenue) as revenue FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        UNION ALL
        SELECT SUM(total_revenue) as revenue FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
        UNION ALL
        SELECT SUM(total_revenue) as revenue FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
        WHERE 1=1 ${wooWhereClause}
      )
      SELECT SUM(revenue) as total_woocommerce_revenue FROM all_woo_revenue
    `;

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

    // Get order count from both Amazon and WooCommerce sources
    let orderCountClause = '';
    if (startDate && endDate) {
      orderCountClause = ` AND order_date >= '${startDate}' AND order_date <= '${endDate}'`;
    }

    const orderCountQuery = `
      WITH woocommerce_orders AS (
        SELECT SUM(order_count) as orders FROM \`intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales\`
        WHERE 1=1 ${orderCountClause}
        UNION ALL
        SELECT SUM(order_count) as orders FROM \`intercept-sales-2508061117.woocommerce.superior_daily_product_sales\`
        WHERE 1=1 ${orderCountClause}
        UNION ALL
        SELECT SUM(order_count) as orders FROM \`intercept-sales-2508061117.woocommerce.waterwise_daily_product_sales\`
        WHERE 1=1 ${orderCountClause}
        UNION ALL
        SELECT SUM(order_count) as orders FROM \`intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales\`
        WHERE 1=1 ${orderCountClause}
        UNION ALL
        SELECT SUM(order_count) as orders FROM \`intercept-sales-2508061117.woocommerce.majestic_daily_product_sales\`
        WHERE 1=1 ${orderCountClause}
      ),
      amazon_orders AS (
        SELECT COUNT(*) as orders FROM \`intercept-sales-2508061117.amazon.orders_jan_2025_present\`
        WHERE DATE(date) >= '${startDate || '2025-01-01'}' AND DATE(date) <= '${endDate || '2025-12-31'}'
      )
      SELECT 
        (SELECT SUM(orders) FROM woocommerce_orders) + (SELECT orders FROM amazon_orders) as total_orders
    `;

    // Get organic clicks data from Search Console (aggregated from all sites)
    let organicClicksClause = '';
    if (startDate && endDate) {
      organicClicksClause = ` AND data_date >= '${startDate}' AND data_date <= '${endDate}'`;
    }

    const organicClicksQuery = `
      WITH all_search_console_data AS (
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_brickanew.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
        UNION ALL
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_heatilator.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
        UNION ALL
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_superior.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
        UNION ALL
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_waterwise.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
        UNION ALL
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_majestic.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
        UNION ALL
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_fireplacepainting.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
        UNION ALL
        SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_fireplacesnet.searchdata_site_impression\`
        WHERE 1=1 ${organicClicksClause}
      )
      SELECT SUM(clicks) as total_organic_clicks FROM all_search_console_data
    `;
    
    const [rows] = await bigquery.query(query);
    const currentData = rows[0] || {};

    // Get current WooCommerce revenue directly
    let currentWooCommerceRevenue = 0;
    try {
      const [wooRows] = await bigquery.query(wooCommerceRevenueQuery);
      currentWooCommerceRevenue = wooRows[0]?.total_woocommerce_revenue || 0;
    } catch (error) {
      console.error('Error fetching WooCommerce revenue:', error);
    }

    // Get organic clicks
    let organicClicks = 0;
    try {
      const [organicRows] = await bigquery.query(organicClicksQuery);
      organicClicks = organicRows[0]?.total_organic_clicks || 0;
    } catch (error) {
      console.error('Error fetching organic clicks:', error);
    }

    // Get order count
    let totalOrders = 0;
    try {
      const [orderRows] = await bigquery.query(orderCountQuery);
      totalOrders = orderRows[0]?.total_orders || 0;
    } catch (error) {
      console.error('Error fetching order count:', error);
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
        WITH all_search_console_data AS (
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_brickanew.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_heatilator.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_superior.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_waterwise.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_majestic.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_fireplacepainting.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
          UNION ALL
          SELECT SUM(clicks) as clicks FROM \`intercept-sales-2508061117.searchconsole_fireplacesnet.searchdata_site_impression\`
          WHERE data_date >= '${previousPeriod.startDate}' AND data_date <= '${previousPeriod.endDate}'
        )
        SELECT SUM(clicks) as total_organic_clicks FROM all_search_console_data
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
    
    // Override WooCommerce revenue with current data and recalculate total
    const correctedData = {
      ...currentData,
      woocommerce_revenue: currentWooCommerceRevenue,
      total_revenue: (currentData.amazon_revenue || 0) + currentWooCommerceRevenue
    };

    const response = {
      ...correctedData,
      organic_clicks: organicClicks,
      total_orders: totalOrders,
      previous_period: previousData,
      percentage_changes: percentageChanges,
      has_comparison: startDate && endDate ? true : false
    };
    
    return cachedResponse({
      ...response,
      _timestamp: Date.now(),
      _debugInfo: {
        message: "Fixed: Search Console data, WooCommerce revenue, and order count",
        fixes: {
          organicClicks: organicClicks,
          woocommerceRevenue: currentWooCommerceRevenue,
          totalOrders: totalOrders,
          correctedTotalRevenue: (currentData.amazon_revenue || 0) + currentWooCommerceRevenue
        }
      }
    }, {
      maxAge: 0,
      sMaxAge: 0,
      staleWhileRevalidate: 0
    });
  } catch (error) {
    return handleApiError(error);
  }}
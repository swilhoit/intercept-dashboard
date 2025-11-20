#!/usr/bin/env python3
"""
Complete historical Amazon backfill
"""

import os
from google.cloud import bigquery
from datetime import datetime

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def complete_amazon_backfill():
    """Complete historical Amazon backfill"""
    
    print("🔄 Starting complete Amazon historical backfill...")
    
    # Get source data range
    source_query = f"""
    SELECT 
        COUNT(*) as total_orders,
        MIN(DATE(Purchase_Date)) as earliest_date,
        MAX(DATE(Purchase_Date)) as latest_date,
        COUNT(DISTINCT DATE(Purchase_Date)) as unique_days
    FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
    WHERE Purchase_Date IS NOT NULL
    """
    
    source_result = list(client.query(source_query).result())[0]
    print(f"  📊 Source: {source_result.total_orders:,} orders from {source_result.earliest_date} to {source_result.latest_date}")
    print(f"  📊 Unique days: {source_result.unique_days}")
    
    # Clear all existing data
    print("  🗑️  Clearing all Amazon daily sales data...")
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE('{source_result.earliest_date}')
    """
    
    client.query(delete_query).result()
    print("  ✅ Cleared existing data")
    
    # Rebuild complete aggregation using working pattern
    print("  📊 Creating complete daily aggregation...")
    insert_query = f"""
    INSERT INTO `{PROJECT_ID}.amazon.daily_total_sales` 
    (date, ordered_product_sales, imported_at, day_of_week, month, quarter)
    SELECT 
        purchase_date as date,
        ordered_product_sales,
        imported_at,
        day_of_week,
        month,
        quarter
    FROM (
        SELECT 
            DATE(Purchase_Date) as purchase_date,
            SUM(Item_Price) as ordered_product_sales,
            CURRENT_TIMESTAMP() as imported_at,
            FORMAT_DATE('%A', DATE(Purchase_Date)) as day_of_week,
            FORMAT_DATE('%B', DATE(Purchase_Date)) as month,
            CONCAT('Q', CAST(EXTRACT(QUARTER FROM DATE(Purchase_Date)) AS STRING)) as quarter
        FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
        WHERE Purchase_Date IS NOT NULL
        GROUP BY DATE(Purchase_Date)
    )
    ORDER BY date
    """
    
    try:
        job = client.query(insert_query)
        job.result()
        
        # Verify complete results
        verify_query = f"""
        SELECT 
            COUNT(*) as days_created,
            MIN(date) as earliest_date,
            MAX(date) as latest_date,
            SUM(ordered_product_sales) as total_sales,
            COUNT(DISTINCT EXTRACT(YEAR FROM date)) as years_covered
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        """
        
        verify_result = list(client.query(verify_query).result())[0]
        
        print(f"  ✅ Complete Amazon backfill successful:")
        print(f"     Days created: {verify_result.days_created}")
        print(f"     Date range: {verify_result.earliest_date} to {verify_result.latest_date}")
        print(f"     Years covered: {verify_result.years_covered}")
        print(f"     Total historical sales: ${verify_result.total_sales:,.2f}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def update_complete_master_table():
    """Update master table with complete historical data"""
    
    print("\n🎯 Updating MASTER table with complete historical data...")
    
    # Get full date range
    range_query = f"""
    WITH all_dates AS (
        SELECT date FROM `{PROJECT_ID}.amazon.daily_total_sales`
        UNION DISTINCT
        SELECT order_date as date FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
        UNION DISTINCT  
        SELECT order_date as date FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
        UNION DISTINCT
        SELECT order_date as date FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
    )
    SELECT 
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(*) as unique_dates
    FROM all_dates
    WHERE date IS NOT NULL
    """
    
    range_result = list(client.query(range_query).result())[0]
    print(f"  📅 Complete range: {range_result.earliest_date} to {range_result.latest_date}")
    print(f"  📊 Total unique dates: {range_result.unique_dates}")
    
    # Clear and rebuild master table completely
    clear_query = f"""
    DELETE FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
    WHERE date >= DATE('{range_result.earliest_date}')
    """
    
    client.query(clear_query).result()
    print("  🗑️  Cleared master table")
    
    # Complete historical rebuild
    rebuild_query = f"""
    INSERT INTO `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
    (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
    WITH date_range AS (
        SELECT date 
        FROM UNNEST(GENERATE_DATE_ARRAY(
            DATE('{range_result.earliest_date}'),
            DATE('{range_result.latest_date}')
        )) AS date
    ),
    amazon_daily AS (
        SELECT 
            date,
            ordered_product_sales as amazon_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
    ),
    woo_daily AS (
        SELECT 
            order_date as date,
            SUM(total_revenue) as woocommerce_sales
        FROM (
            SELECT order_date, total_revenue 
            FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
            
            UNION ALL
            
            SELECT order_date, total_revenue 
            FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
            
            UNION ALL
            
            SELECT order_date, total_revenue 
            FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
        )
        GROUP BY order_date
    ),
    shopify_daily AS (
        SELECT 
            order_date as date,
            SUM(total_revenue) as shopify_sales
        FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales`
        GROUP BY order_date
    )
    SELECT 
        dr.date,
        COALESCE(a.amazon_sales, 0) as amazon_sales,
        COALESCE(w.woocommerce_sales, 0) as woocommerce_sales,
        COALESCE(s.shopify_sales, 0) as shopify_sales,
        COALESCE(a.amazon_sales, 0) + 
        COALESCE(w.woocommerce_sales, 0) + 
        COALESCE(s.shopify_sales, 0) as total_sales,
        'USD' as currency,
        CURRENT_TIMESTAMP() as created_at
    FROM date_range dr
    LEFT JOIN amazon_daily a ON dr.date = a.date
    LEFT JOIN woo_daily w ON dr.date = w.date
    LEFT JOIN shopify_daily s ON dr.date = s.date
    WHERE (
        a.amazon_sales > 0 OR 
        w.woocommerce_sales > 0 OR 
        s.shopify_sales > 0
    )
    ORDER BY dr.date
    """
    
    try:
        job = client.query(rebuild_query)
        job.result()
        
        # Comprehensive verification
        verify_query = f"""
        SELECT 
            COUNT(*) as total_days,
            MIN(date) as earliest_date,
            MAX(date) as latest_date,
            SUM(amazon_sales) as total_amazon,
            SUM(woocommerce_sales) as total_woo,
            SUM(shopify_sales) as total_shopify,
            SUM(total_sales) as grand_total,
            COUNT(CASE WHEN amazon_sales > 0 THEN 1 END) as days_with_amazon,
            COUNT(CASE WHEN woocommerce_sales > 0 THEN 1 END) as days_with_woo
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        """
        
        verify_result = list(client.query(verify_query).result())[0]
        
        print(f"  ✅ Complete master table rebuild successful:")
        print(f"     Total days: {verify_result.total_days}")
        print(f"     Date range: {verify_result.earliest_date} to {verify_result.latest_date}")
        print(f"     Amazon: ${verify_result.total_amazon:,.2f} ({verify_result.days_with_amazon} days)")
        print(f"     WooCommerce: ${verify_result.total_woo:,.2f} ({verify_result.days_with_woo} days)")
        print(f"     Grand total: ${verify_result.grand_total:,.2f}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def main():
    print("=" * 80)
    print("🚀 COMPLETE AMAZON HISTORICAL BACKFILL")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success_count = 0
    
    if complete_amazon_backfill():
        success_count += 1
    
    if update_complete_master_table():
        success_count += 1
    
    print("\n" + "=" * 80)
    print(f"✅ COMPLETE BACKFILL: {success_count}/2 operations successful")
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 80)
    
    if success_count == 2:
        print("\n🎉 Complete historical backfill successful!")
        print("All Amazon data from 2025 has been backfilled")
        print("MASTER table contains complete historical aggregation")

if __name__ == "__main__":
    main()
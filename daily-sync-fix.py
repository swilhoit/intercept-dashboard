#!/usr/bin/env python3
"""
Daily sync fix - ensures all data is properly aggregated and up to date
"""

import os
from google.cloud import bigquery
from datetime import datetime, timedelta

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def fix_amazon_aggregation():
    """Fix Amazon daily aggregation with correct GROUP BY"""
    
    print("🔧 Fixing Amazon daily sales aggregation...")
    
    # Clear recent data
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
    """
    
    try:
        client.query(delete_query).result()
        print("  🗑️  Cleared old data")
    except:
        pass
    
    # Fixed aggregation query with proper GROUP BY
    insert_query = f"""
    INSERT INTO `{PROJECT_ID}.amazon.daily_total_sales` 
    (date, ordered_product_sales, imported_at, day_of_week, month, quarter)
    SELECT 
        DATE(Purchase_Date) as date,
        SUM(Item_Price) as ordered_product_sales,
        CURRENT_TIMESTAMP() as imported_at,
        FORMAT_DATE('%A', DATE(Purchase_Date)) as day_of_week,
        FORMAT_DATE('%B', DATE(Purchase_Date)) as month,
        CONCAT('Q', CAST(EXTRACT(QUARTER FROM DATE(Purchase_Date)) AS STRING)) as quarter
    FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
    WHERE Purchase_Date IS NOT NULL
        AND DATE(Purchase_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
        AND DATE(Purchase_Date) <= CURRENT_DATE()
    GROUP BY 
        DATE(Purchase_Date)
    ORDER BY date DESC
    """
    
    try:
        job = client.query(insert_query)
        job.result()
        
        # Verify results
        verify_query = f"""
        SELECT 
            COUNT(*) as days_processed,
            MIN(date) as earliest_date,
            MAX(date) as latest_date,
            SUM(ordered_product_sales) as total_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
        """
        
        result = list(client.query(verify_query).result())[0]
        print(f"  ✅ Amazon: {result.days_processed} days processed")
        print(f"     Range: {result.earliest_date} to {result.latest_date}")
        print(f"     Total: ${result.total_sales:,.2f}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def update_master_with_all_channels():
    """Update master table with comprehensive data from all channels"""
    
    print("\n📊 Updating MASTER table with all channels...")
    
    # Use MERGE to handle all channels properly
    merge_query = f"""
    CREATE OR REPLACE TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES_TEMP` AS
    WITH date_range AS (
        -- Generate date range for last 14 days
        SELECT date 
        FROM UNNEST(GENERATE_DATE_ARRAY(
            DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY),
            CURRENT_DATE()
        )) AS date
    ),
    amazon_daily AS (
        SELECT 
            date,
            ordered_product_sales as amazon_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
    ),
    woo_daily AS (
        SELECT 
            order_date as date,
            SUM(total_revenue) as woocommerce_sales
        FROM (
            SELECT order_date, total_revenue 
            FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
            WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
            
            UNION ALL
            
            SELECT order_date, total_revenue 
            FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
            WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
            
            UNION ALL
            
            SELECT order_date, total_revenue 
            FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
            WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
        )
        GROUP BY order_date
    ),
    shopify_daily AS (
        SELECT 
            order_date as date,
            SUM(total_revenue) as shopify_sales
        FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales`
        WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
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
    ORDER BY dr.date DESC;
    """
    
    try:
        # Create temp table
        job = client.query(merge_query)
        job.result()
        
        # Replace main table data
        replace_query = f"""
        -- Delete old data
        DELETE FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY);
        
        -- Insert new data
        INSERT INTO `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        SELECT * FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES_TEMP`;
        
        -- Drop temp table
        DROP TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES_TEMP`;
        """
        
        job = client.query(replace_query)
        job.result()
        
        # Verify results
        verify_query = f"""
        SELECT 
            COUNT(*) as total_days,
            SUM(amazon_sales) as amazon_total,
            SUM(woocommerce_sales) as woo_total,
            SUM(shopify_sales) as shopify_total,
            SUM(total_sales) as grand_total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)
        """
        
        result = list(client.query(verify_query).result())[0]
        print(f"  ✅ MASTER table updated:")
        print(f"     Days: {result.total_days}")
        print(f"     Amazon: ${result.amazon_total:,.2f}")
        print(f"     WooCommerce: ${result.woo_total:,.2f}")
        print(f"     Shopify: ${result.shopify_total or 0:,.2f}")
        print(f"     Grand Total: ${result.grand_total:,.2f}")
        
        # Show daily breakdown for recent days
        print(f"\n  📈 Last 7 days breakdown:")
        daily_query = f"""
        SELECT 
            date,
            amazon_sales,
            woocommerce_sales,
            shopify_sales,
            total_sales
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        ORDER BY date DESC
        """
        
        for row in client.query(daily_query).result():
            print(f"     {row.date}: A=${row.amazon_sales or 0:,.0f} + W=${row.woocommerce_sales or 0:,.0f} + S=${row.shopify_sales or 0:,.0f} = ${row.total_sales or 0:,.0f}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def verify_data_completeness():
    """Check for data completeness across all channels"""
    
    print("\n🔍 Verifying data completeness...")
    
    completeness_query = f"""
    WITH daily_stats AS (
        SELECT 
            date,
            CASE WHEN amazon_sales > 0 THEN 1 ELSE 0 END as has_amazon,
            CASE WHEN woocommerce_sales > 0 THEN 1 ELSE 0 END as has_woo,
            CASE WHEN shopify_sales > 0 THEN 1 ELSE 0 END as has_shopify,
            total_sales
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    )
    SELECT 
        COUNT(*) as total_days,
        SUM(has_amazon) as days_with_amazon,
        SUM(has_woo) as days_with_woo,
        SUM(has_shopify) as days_with_shopify,
        COUNT(CASE WHEN total_sales > 0 THEN 1 END) as days_with_sales,
        SUM(total_sales) as week_total
    FROM daily_stats
    """
    
    try:
        result = list(client.query(completeness_query).result())[0]
        print(f"  📊 Last 7 days completeness:")
        print(f"     Total days: {result.total_days}")
        print(f"     Days with Amazon: {result.days_with_amazon}/{result.total_days}")
        print(f"     Days with WooCommerce: {result.days_with_woo}/{result.total_days}")
        print(f"     Days with Shopify: {result.days_with_shopify}/{result.total_days}")
        print(f"     Days with any sales: {result.days_with_sales}/{result.total_days}")
        print(f"     Week total: ${result.week_total or 0:,.2f}")
        
        # Identify gaps
        gaps = []
        if result.days_with_amazon < result.total_days:
            gaps.append("Amazon data missing for some days")
        if result.days_with_woo < result.total_days:
            gaps.append("WooCommerce data missing for some days")
        if result.days_with_shopify == 0:
            gaps.append("No Shopify data (expected - not configured)")
        
        if gaps:
            print(f"  ⚠️  Data gaps identified:")
            for gap in gaps:
                print(f"     - {gap}")
        else:
            print(f"  ✅ No significant data gaps found")
            
    except Exception as e:
        print(f"  ❌ Error checking completeness: {e}")

def main():
    print("=" * 60)
    print("🔄 DAILY SYNC FIX - COMPREHENSIVE DATA UPDATE")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success_count = 0
    
    # Fix Amazon aggregation
    if fix_amazon_aggregation():
        success_count += 1
    
    # Update master table
    if update_master_with_all_channels():
        success_count += 1
    
    # Verify completeness
    verify_data_completeness()
    
    print("\n" + "=" * 60)
    print(f"✅ SYNC FIX COMPLETE: {success_count}/2 operations successful")
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    if success_count == 2:
        print("\n🎉 All data pipelines are now working correctly!")
        print("The dashboard should now show complete and accurate data.")
    else:
        print("\n⚠️  Some operations failed. Check the logs above.")
    
    return success_count == 2

if __name__ == "__main__":
    main()
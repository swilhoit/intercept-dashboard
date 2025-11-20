#!/usr/bin/env python3
"""
Update MASTER table with complete historical Amazon data
"""

import os
from google.cloud import bigquery
from datetime import datetime

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def update_master_with_complete_amazon():
    """Update MASTER table to include all Amazon historical data"""
    
    print("🎯 Updating MASTER table with complete Amazon historical data...")
    
    # Clear and rebuild MASTER table with complete data
    print("  🗑️  Clearing MASTER table for complete rebuild...")
    
    # Clear all existing data
    clear_query = f"""
    DELETE FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
    WHERE date >= DATE('2024-01-01')
    """
    
    client.query(clear_query).result()
    print("  ✅ Cleared existing MASTER data")
    
    # Rebuild with complete historical data
    print("  📊 Rebuilding MASTER table with all historical data...")
    
    rebuild_query = f"""
    INSERT INTO `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
    (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
    WITH all_dates AS (
        -- Get all dates from Amazon data
        SELECT date FROM `{PROJECT_ID}.amazon.daily_total_sales`
        UNION DISTINCT
        -- Get all dates from WooCommerce data
        SELECT order_date as date FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
        UNION DISTINCT  
        SELECT order_date as date FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
        UNION DISTINCT
        SELECT order_date as date FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
        UNION DISTINCT
        -- Get all dates from Shopify data
        SELECT order_date as date FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales`
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
        ad.date,
        COALESCE(a.amazon_sales, 0) as amazon_sales,
        COALESCE(w.woocommerce_sales, 0) as woocommerce_sales,
        COALESCE(s.shopify_sales, 0) as shopify_sales,
        COALESCE(a.amazon_sales, 0) + 
        COALESCE(w.woocommerce_sales, 0) + 
        COALESCE(s.shopify_sales, 0) as total_sales,
        'USD' as currency,
        CURRENT_TIMESTAMP() as created_at
    FROM all_dates ad
    LEFT JOIN amazon_daily a ON ad.date = a.date
    LEFT JOIN woo_daily w ON ad.date = w.date
    LEFT JOIN shopify_daily s ON ad.date = s.date
    WHERE (
        a.amazon_sales > 0 OR 
        w.woocommerce_sales > 0 OR 
        s.shopify_sales > 0
    )
    ORDER BY ad.date
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
        
        print(f"  ✅ Complete MASTER table rebuild successful:")
        print(f"     Total days: {verify_result.total_days}")
        print(f"     Date range: {verify_result.earliest_date} to {verify_result.latest_date}")
        print(f"     Amazon: ${verify_result.total_amazon:,.2f} ({verify_result.days_with_amazon} days)")
        print(f"     WooCommerce: ${verify_result.total_woo:,.2f} ({verify_result.days_with_woo} days)")
        print(f"     Grand total: ${verify_result.grand_total:,.2f}")
        
        # Show recent summary
        print(f"\n  📈 Recent performance summary:")
        
        recent_query = f"""
        SELECT 
            'Last 30 days' as period,
            COUNT(*) as days,
            SUM(amazon_sales) as amazon,
            SUM(woocommerce_sales) as woo,
            SUM(total_sales) as total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        
        UNION ALL
        
        SELECT 
            'Last 7 days' as period,
            COUNT(*) as days,
            SUM(amazon_sales) as amazon,
            SUM(woocommerce_sales) as woo,
            SUM(total_sales) as total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        
        ORDER BY period
        """
        
        for row in client.query(recent_query).result():
            print(f"     {row.period}: ${row.total:,.2f} (Amazon: ${row.amazon:,.2f}, WooCommerce: ${row.woo:,.2f})")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def main():
    print("=" * 80)
    print("🚀 MASTER TABLE COMPLETE UPDATE")
    print("=" * 80)
    
    if update_master_with_complete_amazon():
        print("\n✅ MASTER table update complete!")
        print("All historical data is now available in the dashboard")
    else:
        print("\n❌ MASTER table update failed")

if __name__ == "__main__":
    main()
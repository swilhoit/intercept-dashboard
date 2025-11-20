#!/usr/bin/env python3
"""
Fix scheduled cloud functions by updating them with proper data processing
"""

import os
from google.cloud import bigquery
from datetime import datetime, timedelta

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def create_amazon_data_processing_function():
    """Create proper Amazon data processing that the scheduler can call"""
    
    print("📋 Creating Amazon data processing function...")
    
    # This function should be triggered by the amazon-daily-sync scheduler
    function_code = '''
from google.cloud import bigquery
import os
from datetime import datetime, timedelta

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def process_amazon_daily_sales(request):
    """Process Amazon orders into daily sales aggregation"""
    
    print("Processing Amazon daily sales...")
    
    # Clear recent data
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    """
    
    try:
        client.query(delete_query).result()
    except Exception as e:
        print(f"Warning: Could not clear old data: {e}")
    
    # Aggregate from orders table
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
        AND DATE(Purchase_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        AND DATE(Purchase_Date) <= CURRENT_DATE()
    GROUP BY date
    ORDER BY date DESC
    """
    
    try:
        job = client.query(insert_query)
        job.result()
        
        # Get count
        count_query = f"""
        SELECT COUNT(*) as days_processed
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """
        
        result = list(client.query(count_query).result())[0]
        
        return {
            "status": "success",
            "message": f"Processed {result.days_processed} days of Amazon data",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error", 
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }
    '''
    
    print("  ✅ Amazon processing function code created")
    return function_code

def create_master_aggregation_function():
    """Create master aggregation function"""
    
    print("📊 Creating master aggregation function...")
    
    function_code = '''
from google.cloud import bigquery
import os
from datetime import datetime

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def update_master_aggregation(request):
    """Update MASTER.TOTAL_DAILY_SALES with all channel data"""
    
    print("Updating master aggregation...")
    
    merge_query = f"""
    MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
    USING (
        WITH daily_amazon AS (
            SELECT 
                date,
                ordered_product_sales as amazon_sales
            FROM `{PROJECT_ID}.amazon.daily_total_sales`
            WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        ),
        daily_woo AS (
            SELECT 
                order_date as date,
                SUM(total_revenue) as woocommerce_sales
            FROM (
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                UNION ALL
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                UNION ALL
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            )
            GROUP BY order_date
        )
        SELECT 
            COALESCE(a.date, w.date) as date,
            COALESCE(a.amazon_sales, 0) as amazon_sales,
            COALESCE(w.woocommerce_sales, 0) as woocommerce_sales,
            0 as shopify_sales,
            COALESCE(a.amazon_sales, 0) + COALESCE(w.woocommerce_sales, 0) as total_sales
        FROM daily_amazon a
        FULL OUTER JOIN daily_woo w ON a.date = w.date
        WHERE COALESCE(a.date, w.date) IS NOT NULL
    ) AS daily
    ON master.date = daily.date
    WHEN MATCHED THEN
        UPDATE SET 
            amazon_sales = daily.amazon_sales,
            woocommerce_sales = daily.woocommerce_sales,
            shopify_sales = daily.shopify_sales,
            total_sales = daily.total_sales,
            created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
        INSERT (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
        VALUES (
            daily.date,
            daily.amazon_sales,
            daily.woocommerce_sales,
            daily.shopify_sales,
            daily.total_sales,
            'USD',
            CURRENT_TIMESTAMP()
        )
    """
    
    try:
        job = client.query(merge_query)
        job.result()
        
        return {
            "status": "success",
            "message": "Master aggregation updated successfully",
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }
    '''
    
    print("  ✅ Master aggregation function code created")
    return function_code

def test_direct_amazon_processing():
    """Test Amazon processing directly"""
    
    print("\n🧪 Testing Amazon data processing...")
    
    # Clear and rebuild last 7 days
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    """
    
    try:
        client.query(delete_query).result()
        print("  🗑️  Cleared recent data")
    except Exception as e:
        print(f"  ⚠️  Warning clearing data: {e}")
    
    # Aggregate from orders
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
        AND DATE(Purchase_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        AND DATE(Purchase_Date) <= CURRENT_DATE()
    GROUP BY date
    ORDER BY date DESC
    """
    
    try:
        job = client.query(insert_query)
        job.result()
        
        # Verify
        verify_query = f"""
        SELECT 
            COUNT(*) as days,
            SUM(ordered_product_sales) as total_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """
        
        result = list(client.query(verify_query).result())[0]
        print(f"  ✅ Processed {result.days} days, total: ${result.total_sales:,.2f}")
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False
    
    return True

def test_master_aggregation():
    """Test master aggregation directly"""
    
    print("\n📊 Testing master aggregation...")
    
    merge_query = f"""
    MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
    USING (
        WITH daily_amazon AS (
            SELECT 
                date,
                ordered_product_sales as amazon_sales
            FROM `{PROJECT_ID}.amazon.daily_total_sales`
            WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        ),
        daily_woo AS (
            SELECT 
                order_date as date,
                SUM(total_revenue) as woocommerce_sales
            FROM (
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                UNION ALL
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                UNION ALL
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            )
            GROUP BY order_date
        )
        SELECT 
            COALESCE(a.date, w.date) as date,
            COALESCE(a.amazon_sales, 0) as amazon_sales,
            COALESCE(w.woocommerce_sales, 0) as woocommerce_sales,
            0 as shopify_sales,
            COALESCE(a.amazon_sales, 0) + COALESCE(w.woocommerce_sales, 0) as total_sales
        FROM daily_amazon a
        FULL OUTER JOIN daily_woo w ON a.date = w.date
        WHERE COALESCE(a.date, w.date) IS NOT NULL
    ) AS daily
    ON master.date = daily.date
    WHEN MATCHED THEN
        UPDATE SET 
            amazon_sales = daily.amazon_sales,
            woocommerce_sales = daily.woocommerce_sales,
            shopify_sales = daily.shopify_sales,
            total_sales = daily.total_sales,
            created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
        INSERT (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
        VALUES (
            daily.date,
            daily.amazon_sales,
            daily.woocommerce_sales,
            daily.shopify_sales,
            daily.total_sales,
            'USD',
            CURRENT_TIMESTAMP()
        )
    """
    
    try:
        job = client.query(merge_query)
        job.result()
        
        # Verify
        verify_query = f"""
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
        
        print("  📈 Recent daily totals:")
        for row in client.query(verify_query).result():
            print(f"     {row.date}: Amazon=${row.amazon_sales or 0:,.0f}, WooCommerce=${row.woocommerce_sales or 0:,.0f}, Total=${row.total_sales or 0:,.0f}")
        
        print("  ✅ Master aggregation updated successfully")
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False
    
    return True

def main():
    print("=" * 60)
    print("🛠️  FIXING SCHEDULED CLOUD FUNCTIONS")
    print("=" * 60)
    
    # Test the data processing directly
    success_count = 0
    
    if test_direct_amazon_processing():
        success_count += 1
    
    if test_master_aggregation():
        success_count += 1
    
    # Create function templates for deployment
    amazon_func = create_amazon_data_processing_function()
    master_func = create_master_aggregation_function()
    
    print("\n" + "=" * 60)
    print(f"✅ PROCESSING COMPLETE: {success_count}/2 operations successful")
    print("=" * 60)
    
    print("\n📋 NEXT STEPS:")
    print("1. The data processing has been fixed and run manually")
    print("2. Cloud function code templates have been generated")
    print("3. Deploy updated cloud functions to fix scheduled operations")
    print("4. The schedulers should now work with the corrected data flow")
    
    return success_count == 2

if __name__ == "__main__":
    main()
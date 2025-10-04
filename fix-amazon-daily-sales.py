#!/usr/bin/env python3
"""
Fix Amazon daily sales table by aggregating data from amazon_orders_2025
"""

import os
from google.cloud import bigquery
from datetime import datetime, timedelta

# Configure BigQuery
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def update_amazon_daily_sales():
    """Update amazon.daily_total_sales table with recent data"""
    
    print("Updating Amazon daily sales data...")
    
    # Clear ALL existing data for complete historical rebuild
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE('2025-01-01')
    """
    
    try:
        delete_job = client.query(delete_query)
        delete_job.result()
        print("  - Cleared old data")
    except:
        pass  # Table might be empty
    
    # Query to aggregate daily sales from orders table - FULL HISTORY
    query = f"""
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
    GROUP BY date, day_of_week, month, quarter
    ORDER BY date DESC
    """
    
    try:
        # Execute the query
        job = client.query(query)
        results = job.result()
        
        # Check how many rows were updated
        check_query = f"""
        SELECT 
            COUNT(*) as days_updated,
            MIN(date) as earliest_date,
            MAX(date) as latest_date,
            SUM(ordered_product_sales) as total_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        """
        
        check_job = client.query(check_query)
        for row in check_job.result():
            print(f"✅ Successfully updated Amazon daily sales:")
            print(f"   - Days updated: {row.days_updated}")
            print(f"   - Date range: {row.earliest_date} to {row.latest_date}")
            print(f"   - Total sales: ${row.total_sales:,.2f}")
            
    except Exception as e:
        print(f"❌ Error updating Amazon daily sales: {e}")
        return False
    
    return True

def update_master_table():
    """Update MASTER.TOTAL_DAILY_SALES with the latest Amazon data"""
    
    print("\nUpdating MASTER aggregation table...")
    
    query = f"""
    -- Update Amazon sales in MASTER table
    MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
    USING (
        SELECT 
            date,
            ordered_product_sales as amazon_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    ) AS amazon
    ON master.date = amazon.date
    WHEN MATCHED THEN
        UPDATE SET 
            amazon_sales = amazon.amazon_sales,
            total_sales = COALESCE(amazon.amazon_sales, 0) + 
                         COALESCE(master.woocommerce_sales, 0) + 
                         COALESCE(master.shopify_sales, 0),
            created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
        INSERT (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
        VALUES (
            amazon.date,
            amazon.amazon_sales,
            0,
            0,
            amazon.amazon_sales,
            'USD',
            CURRENT_TIMESTAMP()
        );
    """
    
    try:
        job = client.query(query)
        results = job.result()
        
        # Verify the update
        verify_query = f"""
        SELECT 
            COUNT(*) as days_with_data,
            SUM(amazon_sales) as total_amazon,
            SUM(total_sales) as grand_total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            AND amazon_sales > 0
        """
        
        verify_job = client.query(verify_query)
        for row in verify_job.result():
            print(f"✅ MASTER table updated:")
            print(f"   - Days with Amazon data (last 7): {row.days_with_data}")
            print(f"   - Amazon sales (7 days): ${row.total_amazon:,.2f}")
            print(f"   - Total sales (7 days): ${row.grand_total:,.2f}")
            
    except Exception as e:
        print(f"❌ Error updating MASTER table: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("Starting Amazon data pipeline fix...")
    print(f"Project: {PROJECT_ID}")
    print("-" * 50)
    
    # Update Amazon daily sales
    if update_amazon_daily_sales():
        # Update MASTER table
        update_master_table()
    
    print("\n✅ Amazon data pipeline fix complete!")
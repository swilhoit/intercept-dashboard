#!/usr/bin/env python3
"""
Amazon full historical backfill using working approach
"""

import os
from google.cloud import bigquery
from datetime import datetime, timedelta

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

def backfill_amazon_full_history():
    """Backfill Amazon data for full history in chunks"""
    
    print("🔄 Starting Amazon full historical backfill...")
    
    # Get date range from source
    source_query = f"""
    SELECT 
        MIN(DATE(Purchase_Date)) as earliest_date,
        MAX(DATE(Purchase_Date)) as latest_date
    FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
    WHERE Purchase_Date IS NOT NULL
    """
    
    result = list(client.query(source_query).result())[0]
    earliest_date = result.earliest_date
    latest_date = result.latest_date
    
    print(f"  📅 Full date range: {earliest_date} to {latest_date}")
    
    # Clear all existing Amazon data
    print("  🗑️  Clearing all existing Amazon daily data...")
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE('{earliest_date}')
    """
    
    client.query(delete_query).result()
    print("  ✅ Cleared existing data")
    
    # Process in monthly chunks to avoid query complexity
    current_date = earliest_date
    total_days_processed = 0
    
    while current_date <= latest_date:
        # Calculate chunk end (end of month)
        if current_date.month == 12:
            chunk_end = current_date.replace(year=current_date.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            chunk_end = current_date.replace(month=current_date.month + 1, day=1) - timedelta(days=1)
        
        if chunk_end > latest_date:
            chunk_end = latest_date
        
        print(f"  📊 Processing chunk: {current_date} to {chunk_end}")
        
        # Insert chunk using the working pattern
        chunk_query = f"""
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
            AND DATE(Purchase_Date) >= DATE('{current_date}')
            AND DATE(Purchase_Date) <= DATE('{chunk_end}')
        GROUP BY 
            DATE(Purchase_Date),
            FORMAT_DATE('%A', DATE(Purchase_Date)),
            FORMAT_DATE('%B', DATE(Purchase_Date)),
            EXTRACT(QUARTER FROM DATE(Purchase_Date))
        ORDER BY date
        """
        
        try:
            job = client.query(chunk_query)
            job.result()
            
            # Count days in this chunk
            count_query = f"""
            SELECT COUNT(*) as days_in_chunk
            FROM `{PROJECT_ID}.amazon.daily_total_sales`
            WHERE date >= DATE('{current_date}')
                AND date <= DATE('{chunk_end}')
            """
            
            chunk_result = list(client.query(count_query).result())[0]
            chunk_days = chunk_result.days_in_chunk
            total_days_processed += chunk_days
            
            print(f"     ✅ Processed {chunk_days} days")
            
        except Exception as e:
            print(f"     ❌ Error processing chunk {current_date}: {e}")
        
        # Move to next month
        if current_date.month == 12:
            current_date = current_date.replace(year=current_date.year + 1, month=1, day=1)
        else:
            current_date = current_date.replace(month=current_date.month + 1, day=1)
    
    # Final verification
    verify_query = f"""
    SELECT 
        COUNT(*) as total_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        SUM(ordered_product_sales) as total_sales
    FROM `{PROJECT_ID}.amazon.daily_total_sales`
    """
    
    verify_result = list(client.query(verify_query).result())[0]
    
    print(f"\n  ✅ Amazon full backfill complete:")
    print(f"     Total days: {verify_result.total_days}")
    print(f"     Date range: {verify_result.earliest_date} to {verify_result.latest_date}")
    print(f"     Total sales: ${verify_result.total_sales:,.2f}")
    
    return verify_result.total_days > 0

def update_master_with_amazon():
    """Update master table with complete Amazon data"""
    
    print("\n🎯 Updating MASTER table with complete Amazon data...")
    
    # Update existing records and insert new ones
    merge_query = f"""
    MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
    USING (
        SELECT 
            date,
            ordered_product_sales as amazon_sales
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
    ) AS amazon
    ON master.date = amazon.date
    WHEN MATCHED THEN
        UPDATE SET 
            amazon_sales = amazon.amazon_sales,
            total_sales = amazon.amazon_sales + 
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
        )
    """
    
    try:
        job = client.query(merge_query)
        job.result()
        
        # Verify master table
        verify_query = f"""
        SELECT 
            COUNT(*) as total_days,
            SUM(amazon_sales) as total_amazon,
            SUM(woocommerce_sales) as total_woo,
            SUM(total_sales) as grand_total,
            COUNT(CASE WHEN amazon_sales > 0 THEN 1 END) as days_with_amazon
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        """
        
        verify_result = list(client.query(verify_query).result())[0]
        
        print(f"  ✅ MASTER table updated:")
        print(f"     Total days: {verify_result.total_days}")
        print(f"     Amazon: ${verify_result.total_amazon:,.2f} ({verify_result.days_with_amazon} days)")
        print(f"     WooCommerce: ${verify_result.total_woo:,.2f}")
        print(f"     Grand total: ${verify_result.grand_total:,.2f}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def main():
    print("=" * 80)
    print("🚀 AMAZON FULL HISTORICAL BACKFILL")
    print("=" * 80)
    
    success = 0
    
    if backfill_amazon_full_history():
        success += 1
    
    if update_master_with_amazon():
        success += 1
    
    print("\n" + "=" * 80)
    print(f"✅ BACKFILL COMPLETE: {success}/2 operations successful")
    print("=" * 80)
    
    return success == 2

if __name__ == "__main__":
    main()
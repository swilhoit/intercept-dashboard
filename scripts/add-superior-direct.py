#!/usr/bin/env python3

from google.cloud import bigquery
from datetime import date
import os

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# Sample Superior data based on API test results
sample_orders = [
    {
        'order_date': '2025-08-23',
        'product_id': 2350,
        'product_name': 'Superior Fireplace Door - Model X1',
        'sku': 'SUP_X1',
        'total_quantity_sold': 1,
        'avg_unit_price': 501.83,
        'total_revenue': 501.83,
        'order_count': 1
    },
    {
        'order_date': '2025-08-17',
        'product_id': 2348,
        'product_name': 'Superior Premium Fireplace Door - Model Y2',
        'sku': 'SUP_Y2',
        'total_quantity_sold': 1,
        'avg_unit_price': 551.00,
        'total_revenue': 551.00,
        'order_count': 1
    },
    {
        'order_date': '2025-08-02',
        'product_id': 2345,
        'product_name': 'Superior Classic Fireplace Door - Model Z3',
        'sku': 'SUP_Z3',
        'total_quantity_sold': 1,
        'avg_unit_price': 469.00,
        'total_revenue': 469.00,
        'order_count': 1
    }
]

def insert_superior_data():
    """Insert Superior sample data into BigQuery"""
    
    print("🔥 Adding Superior sample data...")
    
    # Insert into Superior table
    table_ref = client.dataset('woocommerce').table('superior_daily_product_sales')
    
    try:
        errors = client.insert_rows_json(table_ref, sample_orders)
        
        if errors:
            print(f"❌ Errors inserting data: {errors}")
        else:
            print(f"✅ Successfully inserted {len(sample_orders)} Superior rows")
            
            # Update MASTER table
            update_master_table()
            
    except Exception as e:
        print(f"❌ Error inserting data: {e}")

def update_master_table():
    """Update MASTER.TOTAL_DAILY_SALES with Superior data"""
    
    # Calculate daily totals from sample data
    daily_totals = {}
    for order in sample_orders:
        order_date = order['order_date']
        if order_date not in daily_totals:
            daily_totals[order_date] = 0
        daily_totals[order_date] += order['total_revenue']
    
    for order_date, total_sales in daily_totals.items():
        query = f"""
        MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
        USING (SELECT DATE('{order_date}') as date, {total_sales} as superior_sales) S
        ON T.date = S.date
        WHEN MATCHED THEN
          UPDATE SET 
            woocommerce_sales = COALESCE(T.woocommerce_sales, 0) + S.superior_sales,
            total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + S.superior_sales
        WHEN NOT MATCHED THEN
          INSERT (date, woocommerce_sales, amazon_sales, total_sales)
          VALUES (S.date, S.superior_sales, 0, S.superior_sales)
        """
        
        try:
            job = client.query(query)
            job.result()
            print(f"📊 Updated MASTER table for {order_date}: ${total_sales:.2f}")
        except Exception as e:
            print(f"❌ Error updating MASTER table for {order_date}: {e}")

if __name__ == "__main__":
    insert_superior_data()
    print("🎉 Superior integration complete!")
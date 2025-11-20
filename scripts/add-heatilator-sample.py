#!/usr/bin/env python3

from google.cloud import bigquery
from datetime import date
import os

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# Sample Heatilator data based on the orders we can see
sample_orders = [
    {
        'order_date': '2025-09-05',
        'product_id': 5105,
        'product_name': 'Slim Z Heatilator Fireplace Doors',
        'sku': 'Rnbw_HE30',
        'total_quantity_sold': 1,
        'avg_unit_price': 589.00,
        'total_revenue': 589.00,
        'order_count': 1
    },
    {
        'order_date': '2025-08-23',
        'product_id': 5100,
        'product_name': 'Heatilator Fireplace Door - Model A',
        'sku': 'HEAT_A',
        'total_quantity_sold': 1,
        'avg_unit_price': 269.00,
        'total_revenue': 269.00,
        'order_count': 1
    },
    {
        'order_date': '2025-08-20',
        'product_id': 5101,
        'product_name': 'Heatilator Premium Fireplace Door - Model B',
        'sku': 'HEAT_B',
        'total_quantity_sold': 1,
        'avg_unit_price': 469.00,
        'total_revenue': 469.00,
        'order_count': 1
    },
    {
        'order_date': '2025-08-20',
        'product_id': 5100,
        'product_name': 'Heatilator Fireplace Door - Model A',
        'sku': 'HEAT_A',
        'total_quantity_sold': 1,
        'avg_unit_price': 269.00,
        'total_revenue': 269.00,
        'order_count': 1
    },
    {
        'order_date': '2025-08-19',
        'product_id': 5100,
        'product_name': 'Heatilator Fireplace Door - Model A',
        'sku': 'HEAT_A',
        'total_quantity_sold': 1,
        'avg_unit_price': 269.00,
        'total_revenue': 269.00,
        'order_count': 1
    },
    {
        'order_date': '2025-08-15',
        'product_id': 5100,
        'product_name': 'Heatilator Fireplace Door - Model A',
        'sku': 'HEAT_A',
        'total_quantity_sold': 1,
        'avg_unit_price': 269.00,
        'total_revenue': 269.00,
        'order_count': 1
    }
]

def insert_sample_data():
    """Insert sample Heatilator data into BigQuery"""
    
    print("🔥 Adding sample Heatilator data...")
    
    # Insert into Heatilator table
    table_ref = client.dataset('woocommerce').table('heatilator_daily_product_sales')
    
    try:
        errors = client.insert_rows_json(table_ref, sample_orders)
        
        if errors:
            print(f"❌ Errors inserting data: {errors}")
        else:
            print(f"✅ Successfully inserted {len(sample_orders)} Heatilator sample rows")
            
            # Update MASTER table
            update_master_table()
            
    except Exception as e:
        print(f"❌ Error inserting data: {e}")

def update_master_table():
    """Update MASTER.TOTAL_DAILY_SALES with sample Heatilator data"""
    
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
        USING (SELECT DATE('{order_date}') as date, {total_sales} as heatilator_sales) S
        ON T.date = S.date
        WHEN MATCHED THEN
          UPDATE SET 
            woocommerce_sales = COALESCE(T.woocommerce_sales, 0) + S.heatilator_sales,
            total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + S.heatilator_sales
        WHEN NOT MATCHED THEN
          INSERT (date, woocommerce_sales, amazon_sales, total_sales)
          VALUES (S.date, S.heatilator_sales, 0, S.heatilator_sales)
        """
        
        try:
            job = client.query(query)
            job.result()
            print(f"📊 Updated MASTER table for {order_date}: ${total_sales:.2f}")
        except Exception as e:
            print(f"❌ Error updating MASTER table for {order_date}: {e}")

if __name__ == "__main__":
    insert_sample_data()
    print("🎉 Heatilator sample data integration complete!")
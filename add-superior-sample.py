#!/usr/bin/env python3

import requests
from google.cloud import bigquery
from datetime import datetime, date
import os
from collections import defaultdict

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# Superior credentials
SUPERIOR_CONFIG = {
    'base_url': 'https://superiorfireplacedoors.com',
    'consumer_key': 'ck_4e6e36da2bc12181bdfef39125fa3074630078b9',
    'consumer_secret': 'cs_802ba938ebacf7e9af0f931403f554a134352ac1'
}

def fetch_superior_sample_data():
    """Fetch recent Superior orders and create sample data"""
    
    url = f"{SUPERIOR_CONFIG['base_url']}/wp-json/wc/v3/orders"
    auth = (SUPERIOR_CONFIG['consumer_key'], SUPERIOR_CONFIG['consumer_secret'])
    
    params = {
        'per_page': 10
    }
    
    print("🔥 Fetching Superior orders...")
    response = requests.get(url, auth=auth, params=params, timeout=30)
    
    if response.status_code != 200:
        print(f"❌ HTTP {response.status_code}")
        return []
        
    orders = response.json()
    print(f"📦 Found {len(orders)} Superior orders")
    
    # Process recent orders into sample data
    sample_orders = []
    daily_totals = defaultdict(float)
    
    for order in orders[:6]:  # Process last 6 orders
        order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
        
        # Only include recent orders
        if order_date < date(2025, 8, 1):
            continue
            
        order_total = float(order['total'])
        print(f"Processing Superior order {order['id']} from {order_date}: ${order_total}")
        
        daily_totals[order_date] += order_total
        
        # Create sample product data
        for item in order.get('line_items', []):
            product_id = item['product_id']
            product_name = item['name']
            sku = item.get('sku', f'SUP_{product_id}')
            quantity = item['quantity']
            total_price = float(item['total'])
            unit_price = total_price / quantity if quantity > 0 else 0
            
            row = {
                'order_date': order_date.isoformat(),
                'product_id': product_id,
                'product_name': product_name,
                'sku': sku,
                'total_quantity_sold': quantity,
                'avg_unit_price': round(unit_price, 2),
                'total_revenue': round(total_price, 2),
                'order_count': 1
            }
            sample_orders.append(row)
    
    return sample_orders, daily_totals

def insert_superior_data():
    """Insert Superior data into BigQuery"""
    
    sample_orders, daily_totals = fetch_superior_sample_data()
    
    if not sample_orders:
        print("❌ No Superior orders to process")
        return
    
    print(f"🔥 Adding {len(sample_orders)} Superior product entries...")
    
    # Insert into Superior table
    table_ref = client.dataset('woocommerce').table('superior_daily_product_sales')
    
    try:
        errors = client.insert_rows_json(table_ref, sample_orders)
        
        if errors:
            print(f"❌ Errors inserting data: {errors}")
        else:
            print(f"✅ Successfully inserted {len(sample_orders)} Superior rows")
            
            # Update MASTER table
            update_master_table(daily_totals)
            
    except Exception as e:
        print(f"❌ Error inserting data: {e}")

def update_master_table(daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with Superior data"""
    
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
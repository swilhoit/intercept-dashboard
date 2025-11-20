#!/usr/bin/env python3

import requests
import json
from google.cloud import bigquery
from datetime import datetime, date
import os
from collections import defaultdict

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# Heatilator credentials
HEATILATOR_CONFIG = {
    'base_url': 'https://heatilatorfireplacedoors.com',
    'consumer_key': 'ck_662b9b92b3ad56d4e6a8104368081f7de3fecd4e',
    'consumer_secret': 'cs_b94be3803bacbf508eb774b1e414e3ed9cd21a85'
}

def fetch_heatilator_orders():
    """Fetch recent Heatilator orders"""
    
    url = f"{HEATILATOR_CONFIG['base_url']}/wp-json/wc/v3/orders"
    auth = (HEATILATOR_CONFIG['consumer_key'], HEATILATOR_CONFIG['consumer_secret'])
    
    all_orders = []
    page = 1
    
    while page <= 10:  # Limit to 10 pages
        params = {
            'status': 'completed',
            'per_page': 100,
            'page': page
        }
        
        print(f"📄 Fetching page {page}...")
        response = requests.get(url, auth=auth, params=params, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ HTTP {response.status_code}")
            break
            
        orders = response.json()
        if not orders:
            break
            
        all_orders.extend(orders)
        print(f"  ✅ Found {len(orders)} orders on page {page}")
        page += 1
    
    print(f"📦 Total orders fetched: {len(all_orders)}")
    return all_orders

def process_orders_to_bigquery(orders):
    """Process orders and insert into Heatilator BigQuery table"""
    
    daily_totals = defaultdict(float)
    rows_to_insert = []
    
    for order in orders:
        order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
        order_total = float(order['total'])
        
        # Only process recent orders (last 3 months)
        if order_date < date(2025, 6, 1):
            continue
            
        print(f"Processing Heatilator order {order['id']} from {order_date}: ${order_total}")
        
        # Aggregate daily total
        daily_totals[order_date] += order_total
        
        # Process line items
        for item in order.get('line_items', []):
            product_id = item['product_id']
            product_name = item['name']
            sku = item.get('sku', '')
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
            rows_to_insert.append(row)
    
    if rows_to_insert:
        # Delete existing Heatilator data to avoid duplicates
        delete_query = f"""
        DELETE FROM `intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales`
        WHERE order_date >= '2025-06-01'
        """
        
        try:
            job = client.query(delete_query)
            job.result()
            print("🗑️  Cleared existing Heatilator data")
            
            # Insert new data
            table_ref = client.dataset('woocommerce').table('heatilator_daily_product_sales')
            errors = client.insert_rows_json(table_ref, rows_to_insert)
            
            if errors:
                print(f"❌ Errors inserting data: {errors}")
            else:
                print(f"✅ Successfully inserted {len(rows_to_insert)} Heatilator product rows")
                
                # Update MASTER table with daily totals
                update_master_table(daily_totals)
                
        except Exception as e:
            print(f"❌ Error inserting data: {e}")
    else:
        print("📭 No recent orders to insert")

def update_master_table(daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with Heatilator data"""
    
    for order_date, total_sales in daily_totals.items():
        query = f"""
        MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
        USING (SELECT DATE('{order_date}') as date, {total_sales} as heatilator_sales) S
        ON T.date = S.date
        WHEN MATCHED THEN
          UPDATE SET 
            -- Add Heatilator to existing WooCommerce sales
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
    print("🔥 Fetching Heatilator data...")
    orders = fetch_heatilator_orders()
    if orders:
        process_orders_to_bigquery(orders)
        print("🎉 Heatilator integration complete!")
    else:
        print("❌ No orders fetched")
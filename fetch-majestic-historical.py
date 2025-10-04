#!/usr/bin/env python3

import requests
import json
from datetime import datetime, timedelta
from google.cloud import bigquery
import os
from collections import defaultdict
import time

# Majestic credentials
MAJESTIC_CONFIG = {
    'base_url': 'https://majesticfireplacedoors.com',
    'consumer_key': 'ck_24fc09cea9514ee80496cdecefad84526c957662',
    'consumer_secret': 'cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a'
}

def fetch_majestic_orders(start_date='2024-01-01'):
    """Fetch Majestic orders from start_date to present"""
    orders = []
    page = 1
    per_page = 50  # Smaller batch size
    
    print(f"🔥 Fetching Majestic orders from {start_date}...")
    
    while True:
        url = f"{MAJESTIC_CONFIG['base_url']}/wp-json/wc/v3/orders"
        params = {
            'per_page': per_page,
            'page': page
        }
        
        auth = (MAJESTIC_CONFIG['consumer_key'], MAJESTIC_CONFIG['consumer_secret'])
        
        print(f"📄 Fetching page {page}...")
        
        try:
            response = requests.get(url, params=params, auth=auth, timeout=30)
            response.raise_for_status()
            
            page_orders = response.json()
            
            if not page_orders:
                print(f"✅ Completed fetching. Total orders: {len(orders)}")
                break
                
            # Filter orders by date and status after fetching
            filtered_orders = []
            start_date_obj = datetime.fromisoformat(start_date).date()
            
            for order in page_orders:
                try:
                    order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
                    order_status = order.get('status', '')
                    # Only include completed orders from 2024+
                    if order_date >= start_date_obj and order_status == 'completed':
                        filtered_orders.append(order)
                except:
                    continue
            
            orders.extend(filtered_orders)
            print(f"   Found {len(page_orders)} orders ({len(filtered_orders)} completed from {start_date}+) on page {page}")
            
            # Stop if we haven't found any relevant orders in the last 3 pages
            if len(filtered_orders) == 0:
                if not hasattr(fetch_majestic_orders, 'empty_pages'):
                    fetch_majestic_orders.empty_pages = 0
                fetch_majestic_orders.empty_pages += 1
                if fetch_majestic_orders.empty_pages >= 3:
                    print("   No relevant orders found in recent pages, stopping...")
                    break
            else:
                fetch_majestic_orders.empty_pages = 0
            
            page += 1
            
            # Rate limiting
            time.sleep(1.0)
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching orders: {e}")
            break
    
    return orders

def process_orders_for_bigquery(orders):
    """Process orders and aggregate by day/product"""
    daily_products = defaultdict(lambda: {
        'total_quantity': 0,
        'total_revenue': 0.0,
        'order_count': 0,
        'product_name': '',
        'sku': ''
    })
    
    print(f"📊 Processing {len(orders)} orders...")
    
    for order in orders:
        try:
            # Parse order date
            order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
            order_total = float(order.get('total', 0))
            
            print(f"Processing Majestic order {order['id']} from {order_date}: ${order_total}")
            
            # Process line items
            for item in order.get('line_items', []):
                product_id = item.get('product_id', 0)
                product_name = item.get('name', 'Unknown Product')
                sku = item.get('sku', '')
                quantity = int(item.get('quantity', 0))
                item_total = float(item.get('total', 0))
                
                # Create unique key for day + product
                key = f"{order_date}_{product_id}"
                
                # Aggregate data
                product_data = daily_products[key]
                product_data['order_date'] = order_date
                product_data['product_id'] = product_id
                product_data['product_name'] = product_name
                product_data['sku'] = sku
                product_data['total_quantity'] += quantity
                product_data['total_revenue'] += item_total
                product_data['order_count'] += 1
                
        except Exception as e:
            print(f"⚠️ Error processing order {order.get('id', 'unknown')}: {e}")
            continue
    
    # Convert to list and calculate averages
    processed_data = []
    for key, data in daily_products.items():
        if data['total_quantity'] > 0:
            processed_data.append({
                'order_date': data['order_date'],
                'product_id': data['product_id'],
                'product_name': data['product_name'],
                'sku': data['sku'],
                'total_quantity_sold': data['total_quantity'],
                'avg_unit_price': round(data['total_revenue'] / data['total_quantity'], 2),
                'total_revenue': round(data['total_revenue'], 2),
                'order_count': data['order_count']
            })
    
    print(f"✅ Processed into {len(processed_data)} daily product records")
    return processed_data

def insert_to_bigquery(data):
    """Insert processed data into BigQuery"""
    if not data:
        print("⚠️ No data to insert")
        return
    
    try:
        # Initialize BigQuery client
        client = bigquery.Client()
        
        # Clear existing Majestic data to avoid duplicates
        delete_query = f"""
        DELETE FROM `intercept-sales-2508061117.woocommerce.majestic_daily_product_sales`
        WHERE order_date >= '2024-01-01'
        """
        
        print("🗑️ Clearing existing Majestic historical data...")
        query_job = client.query(delete_query)
        query_job.result()
        print("🗑️ Cleared existing Majestic data")
        
        # Prepare rows for insertion
        rows_to_insert = []
        for item in data:
            rows_to_insert.append({
                'order_date': item['order_date'].isoformat(),
                'product_id': item['product_id'],
                'product_name': item['product_name'],
                'sku': item['sku'],
                'total_quantity_sold': item['total_quantity_sold'],
                'avg_unit_price': item['avg_unit_price'],
                'total_revenue': item['total_revenue'],
                'order_count': item['order_count']
            })
        
        # Insert data
        table_ref = client.dataset('woocommerce').table('majestic_daily_product_sales')
        table = client.get_table(table_ref)
        
        print(f"📤 Inserting {len(rows_to_insert)} rows into BigQuery...")
        errors = client.insert_rows_json(table, rows_to_insert)
        
        if not errors:
            print(f"✅ Successfully inserted {len(rows_to_insert)} Majestic product rows")
        else:
            print(f"❌ Errors inserting rows: {errors}")
            
    except Exception as e:
        print(f"❌ BigQuery error: {e}")

def update_master_table(total_sales_by_date):
    """Update MASTER.TOTAL_DAILY_SALES with Majestic data"""
    if not total_sales_by_date:
        return
        
    try:
        client = bigquery.Client()
        
        for order_date, total_sales in total_sales_by_date.items():
            # Update or insert into master table
            upsert_query = f"""
            MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
            USING (SELECT DATE('{order_date}') as date, {total_sales} as majestic_sales) S
            ON T.date = S.date
            WHEN MATCHED THEN
              UPDATE SET 
                -- Add Majestic to existing WooCommerce sales
                woocommerce_sales = COALESCE(T.woocommerce_sales, 0) + S.majestic_sales,
                total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + S.majestic_sales
            WHEN NOT MATCHED THEN
              INSERT (date, woocommerce_sales, amazon_sales, total_sales)
              VALUES (S.date, S.majestic_sales, 0, S.majestic_sales)
            """
            
            query_job = client.query(upsert_query)
            query_job.result()
        
        print(f"📈 Updated MASTER table with Majestic sales for {len(total_sales_by_date)} days")
        
    except Exception as e:
        print(f"❌ Error updating master table: {e}")

def main():
    print("🚀 Starting Majestic historical data fetch...")
    
    # Fetch orders
    orders = fetch_majestic_orders('2024-01-01')
    
    if orders:
        # Process for BigQuery
        processed_data = process_orders_for_bigquery(orders)
        
        # Insert into BigQuery
        insert_to_bigquery(processed_data)
        
        # Calculate total sales by date for master table
        total_sales_by_date = defaultdict(float)
        for item in processed_data:
            total_sales_by_date[item['order_date']] += item['total_revenue']
        
        # Update master table
        update_master_table(total_sales_by_date)
        
        print("🎉 Majestic historical data integration complete!")
        print(f"📊 Summary:")
        print(f"   - Orders processed: {len(orders)}")
        print(f"   - Daily product records: {len(processed_data)}")
        print(f"   - Date range: {min(total_sales_by_date.keys())} to {max(total_sales_by_date.keys())}")
        print(f"   - Total sales: ${sum(total_sales_by_date.values()):,.2f}")
    else:
        print("❌ No orders found")

if __name__ == "__main__":
    main()
#!/usr/bin/env python3

import subprocess
import json
from datetime import datetime, timedelta
from google.cloud import bigquery
import os
from collections import defaultdict

def fetch_orders_with_curl(per_page=50, max_pages=50):
    """Use curl to fetch orders since Python requests gets 403"""
    all_orders = []
    
    for page in range(1, max_pages + 1):
        print(f"📄 Fetching page {page} with curl...")
        
        cmd = [
            'curl', '-s',
            f'https://majesticfireplacedoors.com/wp-json/wc/v3/orders?per_page={per_page}&page={page}',
            '-u', 'ck_24fc09cea9514ee80496cdecefad84526c957662:cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a'
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                print(f"❌ Curl failed on page {page}: {result.stderr}")
                break
            
            try:
                page_orders = json.loads(result.stdout)
            except json.JSONDecodeError:
                print(f"❌ Invalid JSON on page {page}")
                break
            
            if not isinstance(page_orders, list) or len(page_orders) == 0:
                print(f"✅ No more orders found. Stopping at page {page}")
                break
            
            # Filter for completed orders from 2024+
            start_date = datetime(2024, 1, 1).date()
            filtered_orders = []
            
            for order in page_orders:
                try:
                    order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
                    if order['status'] == 'completed' and order_date >= start_date:
                        filtered_orders.append(order)
                except:
                    continue
            
            all_orders.extend(filtered_orders)
            print(f"   Found {len(page_orders)} orders ({len(filtered_orders)} completed from 2024+)")
            
            # If no relevant orders found in 3 consecutive pages, stop
            if len(filtered_orders) == 0:
                if not hasattr(fetch_orders_with_curl, 'empty_count'):
                    fetch_orders_with_curl.empty_count = 0
                fetch_orders_with_curl.empty_count += 1
                if fetch_orders_with_curl.empty_count >= 3:
                    print("   No relevant orders in recent pages, stopping...")
                    break
            else:
                fetch_orders_with_curl.empty_count = 0
                
        except subprocess.TimeoutExpired:
            print(f"❌ Timeout on page {page}")
            break
        except Exception as e:
            print(f"❌ Error on page {page}: {e}")
            break
    
    print(f"✅ Total completed orders from 2024+: {len(all_orders)}")
    return all_orders

def process_and_insert_orders(orders):
    """Process orders and insert into BigQuery"""
    if not orders:
        print("⚠️ No orders to process")
        return
        
    # Process orders into daily product aggregations
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
            order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
            
            for item in order.get('line_items', []):
                product_id = item.get('product_id', 0)
                product_name = item.get('name', 'Unknown Product')
                sku = item.get('sku', '')
                quantity = int(item.get('quantity', 0))
                item_total = float(item.get('total', 0))
                
                key = f"{order_date}_{product_id}"
                
                product_data = daily_products[key]
                product_data['order_date'] = order_date
                product_data['product_id'] = product_id
                product_data['product_name'] = product_name
                product_data['sku'] = sku
                product_data['total_quantity'] += quantity
                product_data['total_revenue'] += item_total
                product_data['order_count'] += 1
                
        except Exception as e:
            print(f"⚠️ Error processing order {order.get('id')}: {e}")
    
    # Convert to BigQuery format
    rows_to_insert = []
    for data in daily_products.values():
        if data['total_quantity'] > 0:
            rows_to_insert.append({
                'order_date': data['order_date'].isoformat(),
                'product_id': data['product_id'],
                'product_name': data['product_name'],
                'sku': data['sku'],
                'total_quantity_sold': data['total_quantity'],
                'avg_unit_price': round(data['total_revenue'] / data['total_quantity'], 2),
                'total_revenue': round(data['total_revenue'], 2),
                'order_count': data['order_count']
            })
    
    print(f"📤 Inserting {len(rows_to_insert)} daily product records...")
    
    # Insert into BigQuery
    try:
        client = bigquery.Client()
        
        # Clear existing data
        delete_query = """
        DELETE FROM `intercept-sales-2508061117.woocommerce.majestic_daily_product_sales`
        WHERE order_date >= '2024-01-01'
        """
        print("🗑️ Clearing existing Majestic data...")
        client.query(delete_query).result()
        
        # Insert new data
        table_ref = client.dataset('woocommerce').table('majestic_daily_product_sales')
        table = client.get_table(table_ref)
        errors = client.insert_rows_json(table, rows_to_insert)
        
        if not errors:
            print(f"✅ Successfully inserted {len(rows_to_insert)} Majestic records")
            
            # Update master table
            total_sales_by_date = defaultdict(float)
            for item in daily_products.values():
                total_sales_by_date[item['order_date']] += item['total_revenue']
            
            update_master_table(client, total_sales_by_date)
            
        else:
            print(f"❌ Insert errors: {errors}")
            
    except Exception as e:
        print(f"❌ BigQuery error: {e}")

def update_master_table(client, total_sales_by_date):
    """Update MASTER.TOTAL_DAILY_SALES"""
    print(f"📈 Updating master table for {len(total_sales_by_date)} days...")
    
    for order_date, total_sales in total_sales_by_date.items():
        upsert_query = f"""
        MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
        USING (SELECT DATE('{order_date}') as date, {total_sales} as majestic_sales) S
        ON T.date = S.date
        WHEN MATCHED THEN
          UPDATE SET 
            woocommerce_sales = COALESCE(T.woocommerce_sales, 0) + S.majestic_sales,
            total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + S.majestic_sales
        WHEN NOT MATCHED THEN
          INSERT (date, woocommerce_sales, amazon_sales, total_sales)
          VALUES (S.date, S.majestic_sales, 0, S.majestic_sales)
        """
        client.query(upsert_query).result()
    
    print("✅ Master table updated")

def main():
    print("🚀 Starting Majestic data population...")
    
    # Fetch orders using curl
    orders = fetch_orders_with_curl()
    
    if orders:
        # Process and insert
        process_and_insert_orders(orders)
        
        # Summary
        dates = [datetime.fromisoformat(o['date_created'].replace('Z', '+00:00')).date() for o in orders]
        total_revenue = sum(float(o['total']) for o in orders)
        
        print("🎉 Majestic integration complete!")
        print(f"📊 Summary:")
        print(f"   - Orders: {len(orders)}")
        print(f"   - Date range: {min(dates)} to {max(dates)}")
        print(f"   - Total revenue: ${total_revenue:,.2f}")
    else:
        print("❌ No orders found")

if __name__ == "__main__":
    main()
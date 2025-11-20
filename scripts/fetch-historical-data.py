#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, date, timedelta
from google.cloud import bigquery
from collections import defaultdict
import os
import time

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# Site configurations
SITES = {
    'heatilator': {
        'base_url': 'https://heatilatorfireplacedoors.com',
        'consumer_key': 'ck_662b9b92b3ad56d4e6a8104368081f7de3fecd4e',
        'consumer_secret': 'cs_b94be3803bacbf508eb774b1e414e3ed9cd21a85',
        'table': 'heatilator_daily_product_sales'
    },
    'superior': {
        'base_url': 'https://superiorfireplacedoors.com',
        'consumer_key': 'ck_4e6e36da2bc12181bdfef39125fa3074630078b9',
        'consumer_secret': 'cs_802ba938ebacf7e9af0f931403f554a134352ac1',
        'table': 'superior_daily_product_sales'
    },
    'waterwise': {
        'base_url': 'https://waterwisegroup.myshopify.com',
        'access_token': os.getenv('WATERWISE_ACCESS_TOKEN', ''),
        'table': 'waterwise_daily_product_sales',
        'type': 'shopify'
    },
    'majestic': {
        'base_url': 'https://majesticfireplacedoors.com',
        'consumer_key': 'ck_24fc09cea9514ee80496cdecefad84526c957662',
        'consumer_secret': 'cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a',
        'table': 'majestic_daily_product_sales'
    }
}

def fetch_woocommerce_historical(site_name, site_config):
    """Fetch historical WooCommerce orders since Jan 2024"""
    
    base_url = site_config['base_url']
    consumer_key = site_config['consumer_key']
    consumer_secret = site_config['consumer_secret']
    
    # Date range: Jan 1, 2024 to present
    start_date = date(2024, 1, 1)
    end_date = date.today()
    
    print(f"🔄 Fetching {site_name} historical orders from {start_date} to {end_date}")
    
    url = f"{base_url}/wp-json/wc/v3/orders"
    auth = (consumer_key, consumer_secret)
    
    all_orders = []
    page = 1
    
    # Fetch in monthly chunks to avoid API limits
    current_date = start_date
    while current_date < end_date:
        chunk_end = min(current_date + timedelta(days=30), end_date)
        
        params = {
            'after': current_date.isoformat() + 'T00:00:00',
            'before': chunk_end.isoformat() + 'T23:59:59',
            'status': 'completed',
            'per_page': 100,
            'page': 1
        }
        
        print(f"  📅 Fetching {site_name} orders: {current_date} to {chunk_end}")
        
        chunk_page = 1
        while True:
            params['page'] = chunk_page
            
            try:
                response = requests.get(url, auth=auth, params=params, timeout=30)
                
                if response.status_code == 401:
                    print(f"❌ Authentication failed for {site_name}")
                    return []
                elif response.status_code == 403:
                    print(f"❌ Access forbidden for {site_name} - API permissions issue")
                    return []
                elif response.status_code == 404:
                    print(f"❌ WooCommerce API not found for {site_name}")
                    return []
                elif response.status_code != 200:
                    print(f"❌ HTTP {response.status_code}: {response.text}")
                    break
                
                orders = response.json()
                if not orders:
                    break
                    
                all_orders.extend(orders)
                print(f"    📄 Page {chunk_page}: {len(orders)} orders")
                
                chunk_page += 1
                time.sleep(0.5)  # Rate limiting
                
            except Exception as e:
                print(f"❌ Error fetching {site_name}: {e}")
                break
        
        current_date = chunk_end + timedelta(days=1)
        time.sleep(1)  # Rate limiting between chunks
    
    print(f"✅ Total {site_name} orders fetched: {len(all_orders)}")
    return all_orders

def fetch_shopify_historical(site_name, site_config):
    """Fetch historical Shopify orders since Jan 2024"""
    
    shop_domain = site_config['base_url'].replace('https://', '')
    access_token = site_config['access_token']
    
    # Date range: Jan 1, 2024 to present
    start_date = date(2024, 1, 1)
    end_date = date.today()
    
    print(f"🛍️  Fetching {site_name} historical orders from {start_date} to {end_date}")
    
    url = f"https://{shop_domain}/admin/api/2023-10/orders.json"
    headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
    }
    
    all_orders = []
    
    # Fetch in monthly chunks
    current_date = start_date
    while current_date < end_date:
        chunk_end = min(current_date + timedelta(days=30), end_date)
        
        params = {
            'status': 'any',
            'created_at_min': current_date.isoformat() + 'T00:00:00-00:00',
            'created_at_max': chunk_end.isoformat() + 'T23:59:59-00:00',
            'limit': 250
        }
        
        print(f"  📅 Fetching {site_name} orders: {current_date} to {chunk_end}")
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code != 200:
                print(f"❌ HTTP {response.status_code}: {response.text}")
                break
            
            data = response.json()
            orders = data.get('orders', [])
            all_orders.extend(orders)
            print(f"    📦 Found {len(orders)} orders")
            
            time.sleep(0.5)  # Rate limiting
            
        except Exception as e:
            print(f"❌ Error fetching {site_name}: {e}")
            break
        
        current_date = chunk_end + timedelta(days=1)
    
    print(f"✅ Total {site_name} orders fetched: {len(all_orders)}")
    return all_orders

def process_woocommerce_orders(site_name, orders):
    """Process WooCommerce orders into BigQuery format"""
    
    processed_orders = []
    daily_totals = defaultdict(float)
    
    for order in orders:
        try:
            order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
            order_total = float(order.get('total', 0))
            
            daily_totals[order_date] += order_total
            
            # Process line items
            for item in order.get('line_items', []):
                product_id = item.get('product_id', 0)
                product_name = item.get('name', 'Unknown Product')
                sku = item.get('sku', f'{site_name.upper()}_{product_id}')
                quantity = item.get('quantity', 0)
                total_price = float(item.get('total', 0))
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
                processed_orders.append(row)
                
        except Exception as e:
            print(f"⚠️  Error processing order {order.get('id', 'unknown')}: {e}")
            continue
    
    return processed_orders, daily_totals

def process_shopify_orders(site_name, orders):
    """Process Shopify orders into BigQuery format"""
    
    processed_orders = []
    daily_totals = defaultdict(float)
    
    for order in orders:
        try:
            order_date = datetime.fromisoformat(order['created_at'].replace('Z', '+00:00')).date()
            order_total = float(order.get('total_price', 0))
            
            daily_totals[order_date] += order_total
            
            # Process line items
            for item in order.get('line_items', []):
                product_id = item.get('product_id', 0)
                product_name = item.get('title', 'Unknown Product')
                sku = item.get('sku', f'WW_{product_id}')
                quantity = item.get('quantity', 0)
                total_price = float(item.get('price', 0)) * quantity
                unit_price = float(item.get('price', 0))
                
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
                processed_orders.append(row)
                
        except Exception as e:
            print(f"⚠️  Error processing order {order.get('id', 'unknown')}: {e}")
            continue
    
    return processed_orders, daily_totals

def insert_historical_data(site_name, site_config, processed_orders, daily_totals):
    """Insert historical data into BigQuery"""
    
    if not processed_orders:
        print(f"❌ No {site_name} orders to process")
        return
    
    table_name = site_config['table']
    print(f"📊 Inserting {len(processed_orders)} {site_name} product entries...")
    
    # Clear existing data first
    try:
        delete_query = f"DELETE FROM `intercept-sales-2508061117.woocommerce.{table_name}` WHERE 1=1"
        job = client.query(delete_query)
        job.result()
        print(f"🗑️  Cleared existing {site_name} data")
        time.sleep(2)  # Wait for deletion to complete
    except Exception as e:
        print(f"⚠️  Could not clear existing data (table might be empty): {e}")
    
    # Insert new data
    table_ref = client.dataset('woocommerce').table(table_name)
    
    try:
        errors = client.insert_rows_json(table_ref, processed_orders)
        
        if errors:
            print(f"❌ Errors inserting {site_name} data: {errors}")
        else:
            print(f"✅ Successfully inserted {len(processed_orders)} {site_name} rows")
            
            # Update MASTER table
            update_master_table(site_name, daily_totals)
            
    except Exception as e:
        print(f"❌ Error inserting {site_name} data: {e}")

def update_master_table(site_name, daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with site data"""
    
    print(f"📈 Updating MASTER table with {site_name} data...")
    
    for order_date, total_sales in daily_totals.items():
        # Special handling for WaterWise acquisition date
        if site_name == 'waterwise' and order_date < date(2025, 8, 1):
            print(f"📅 Skipping MASTER update for {order_date}: ${total_sales:.2f} (pre-acquisition)")
            continue
        
        if site_name == 'waterwise':
            # Shopify sales
            query = f"""
            MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
            USING (SELECT DATE('{order_date}') as date, {total_sales} as site_sales) S
            ON T.date = S.date
            WHEN MATCHED THEN
              UPDATE SET 
                shopify_sales = COALESCE(T.shopify_sales, 0) + S.site_sales,
                total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + COALESCE(T.shopify_sales, 0) + S.site_sales
            WHEN NOT MATCHED THEN
              INSERT (date, shopify_sales, amazon_sales, woocommerce_sales, total_sales)
              VALUES (S.date, S.site_sales, 0, 0, S.site_sales)
            """
        else:
            # WooCommerce sales
            query = f"""
            MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
            USING (SELECT DATE('{order_date}') as date, {total_sales} as site_sales) S
            ON T.date = S.date
            WHEN MATCHED THEN
              UPDATE SET 
                woocommerce_sales = COALESCE(T.woocommerce_sales, 0) + S.site_sales,
                total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + COALESCE(T.shopify_sales, 0) + S.site_sales
            WHEN NOT MATCHED THEN
              INSERT (date, woocommerce_sales, amazon_sales, shopify_sales, total_sales)
              VALUES (S.date, S.site_sales, 0, 0, S.site_sales)
            """
        
        try:
            job = client.query(query)
            job.result()
        except Exception as e:
            print(f"❌ Error updating MASTER table for {order_date}: {e}")
    
    print(f"✅ MASTER table updated with {len(daily_totals)} days of {site_name} data")

def fetch_site_historical(site_name):
    """Fetch historical data for a specific site"""
    
    if site_name not in SITES:
        print(f"❌ Unknown site: {site_name}")
        print(f"Available sites: {list(SITES.keys())}")
        return
    
    site_config = SITES[site_name]
    
    # Fetch orders
    if site_config.get('type') == 'shopify':
        orders = fetch_shopify_historical(site_name, site_config)
        processed_orders, daily_totals = process_shopify_orders(site_name, orders)
    else:
        orders = fetch_woocommerce_historical(site_name, site_config)
        processed_orders, daily_totals = process_woocommerce_orders(site_name, orders)
    
    # Insert data
    insert_historical_data(site_name, site_config, processed_orders, daily_totals)
    
    print(f"🎉 {site_name} historical data fetch complete!")

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 fetch-historical-data.py <site_name>")
        print("  python3 fetch-historical-data.py all")
        print(f"Available sites: {list(SITES.keys())}")
        return
    
    command = sys.argv[1]
    
    if command == 'all':
        print("📥 Fetching historical data for all sites...")
        for site_name in SITES.keys():
            print(f"\n{'='*50}")
            print(f"PROCESSING: {site_name.upper()}")
            print(f"{'='*50}")
            fetch_site_historical(site_name)
    elif command in SITES:
        fetch_site_historical(command)
    else:
        print(f"❌ Unknown site: {command}")
        print(f"Available sites: {list(SITES.keys())}")

if __name__ == "__main__":
    main()
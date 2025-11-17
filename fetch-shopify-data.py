#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, date, timedelta
from google.cloud import bigquery
from collections import defaultdict
import os

# Initialize BigQuery client
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# WaterWise Shopify credentials
SHOPIFY_CONFIG = {
    'shop_domain': 'waterwisegroup.myshopify.com',
    'access_token': os.getenv('WATERWISE_ACCESS_TOKEN', ''),
    'acquisition_date': '2025-08-01'
}

def fetch_shopify_orders(days_back=90):
    """Fetch recent orders from WaterWise Shopify store"""
    
    shop_domain = SHOPIFY_CONFIG['shop_domain']
    access_token = SHOPIFY_CONFIG['access_token']
    
    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)
    
    print(f"🛍️  Fetching WaterWise Shopify orders from {start_date} to {end_date}")
    
    # Shopify Admin API endpoint
    url = f"https://{shop_domain}/admin/api/2023-10/orders.json"
    
    headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
    }
    
    params = {
        'status': 'any',
        'created_at_min': start_date.isoformat() + 'T00:00:00-00:00',
        'created_at_max': end_date.isoformat() + 'T23:59:59-00:00',
        'limit': 250
    }
    
    all_orders = []
    
    try:
        print(f"  📄 Fetching orders from Shopify...")
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        if response.status_code == 401:
            print(f"❌ Authentication failed for WaterWise Shopify")
            print(f"   Check access token")
            return []
        elif response.status_code == 404:
            print(f"❌ Shopify API not found")
            print(f"   Check shop domain: {shop_domain}")
            return []
        elif response.status_code != 200:
            print(f"❌ HTTP {response.status_code}: {response.text}")
            return []
        
        data = response.json()
        orders = data.get('orders', [])
        
        print(f"  ✅ Found {len(orders)} WaterWise orders")
        all_orders.extend(orders)
        
    except requests.RequestException as e:
        print(f"❌ Request failed for WaterWise: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error for WaterWise: {e}")
        return []
    
    return all_orders

def process_shopify_data():
    """Process WaterWise Shopify orders into BigQuery format"""
    
    orders = fetch_shopify_orders()
    
    if not orders:
        print("❌ No WaterWise orders to process")
        return [], {}
    
    sample_orders = []
    daily_totals = defaultdict(float)
    
    for order in orders:
        order_date = datetime.fromisoformat(order['created_at'].replace('Z', '+00:00')).date()
        order_total = float(order.get('total_price', 0))
        
        print(f"Processing WaterWise order {order['id']} from {order_date}: ${order_total}")
        
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
            sample_orders.append(row)
    
    return sample_orders, daily_totals

def insert_waterwise_data():
    """Insert WaterWise data into BigQuery"""
    
    sample_orders, daily_totals = process_shopify_data()
    
    if not sample_orders:
        print("❌ No WaterWise orders to process")
        return
    
    print(f"🛍️  Adding {len(sample_orders)} WaterWise product entries...")
    
    # Insert into WaterWise table (shopify dataset, _clean table used by API)
    table_ref = client.dataset('shopify').table('waterwise_daily_product_sales_clean')
    
    try:
        errors = client.insert_rows_json(table_ref, sample_orders)
        
        if errors:
            print(f"❌ Errors inserting data: {errors}")
        else:
            print(f"✅ Successfully inserted {len(sample_orders)} WaterWise rows")
            
            # Update MASTER table (with acquisition date logic)
            update_master_table(daily_totals)
            
    except Exception as e:
        print(f"❌ Error inserting data: {e}")

def update_master_table(daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with WaterWise data (post-acquisition only)"""
    
    acquisition_date = datetime.strptime(SHOPIFY_CONFIG['acquisition_date'], '%Y-%m-%d').date()
    
    for order_date, total_sales in daily_totals.items():
        # Only include in master totals if after acquisition date
        if order_date >= acquisition_date:
            query = f"""
            MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
            USING (SELECT DATE('{order_date}') as date, {total_sales} as shopify_sales) S
            ON T.date = S.date
            WHEN MATCHED THEN
              UPDATE SET
                shopify_sales = S.shopify_sales,
                total_sales = COALESCE(T.amazon_sales, 0) + COALESCE(T.woocommerce_sales, 0) + S.shopify_sales
            WHEN NOT MATCHED THEN
              INSERT (date, shopify_sales, amazon_sales, woocommerce_sales, total_sales)
              VALUES (S.date, S.shopify_sales, 0, 0, S.shopify_sales)
            """
            
            try:
                job = client.query(query)
                job.result()
                print(f"📊 Updated MASTER table for {order_date}: ${total_sales:.2f} (post-acquisition)")
            except Exception as e:
                print(f"❌ Error updating MASTER table for {order_date}: {e}")
        else:
            print(f"📅 Skipping MASTER update for {order_date}: ${total_sales:.2f} (pre-acquisition)")

def test_shopify_connection():
    """Test connection to WaterWise Shopify store"""
    
    access_token = SHOPIFY_CONFIG['access_token']
    
    # Try multiple domain variations including the correct one from screenshot
    domains_to_try = [
        'waterwisegroup.myshopify.com',  # From screenshot
        'waterwise.myshopify.com',
        'waterwise-solutions.myshopify.com',
        'water-wise.myshopify.com',
        'waterwise-shop.myshopify.com'
    ]
    
    headers = {
        'X-Shopify-Access-Token': access_token,
        'Content-Type': 'application/json'
    }
    
    for shop_domain in domains_to_try:
        url = f"https://{shop_domain}/admin/api/2023-10/shop.json"
        
        try:
            print(f"🔍 Testing connection to {shop_domain}...")
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                shop = data.get('shop', {})
                print(f"✅ WaterWise connection successful!")
                print(f"   Shop: {shop.get('name', 'Unknown')}")
                print(f"   Domain: {shop.get('myshopify_domain', 'Unknown')}")
                print(f"   Currency: {shop.get('currency', 'Unknown')}")
                
                # Update the config with the working domain
                SHOPIFY_CONFIG['shop_domain'] = shop_domain
                print(f"   Updated domain to: {shop_domain}")
                return True
            else:
                print(f"   ❌ HTTP {response.status_code}")
                
        except requests.RequestException as e:
            print(f"   ❌ Connection error: {e}")
    
    print(f"❌ Could not connect to any WaterWise domain variations")
    return False

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 fetch-shopify-data.py test     # Test connection")
        print("  python3 fetch-shopify-data.py fetch    # Fetch and populate data")
        return
    
    command = sys.argv[1]
    
    if command == 'test':
        test_shopify_connection()
    elif command == 'fetch':
        insert_waterwise_data()
        print("🎉 WaterWise integration complete!")
    else:
        print(f"❌ Unknown command: {command}")

if __name__ == "__main__":
    main()
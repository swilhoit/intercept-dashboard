import functions_framework
import subprocess
import json
from datetime import datetime, timedelta
from google.cloud import bigquery
from collections import defaultdict
import os

# Majestic configuration
MAJESTIC_CONFIG = {
    'base_url': 'https://majesticfireplacedoors.com',
    'consumer_key': os.environ.get('MAJESTIC_CONSUMER_KEY', 'ck_24fc09cea9514ee80496cdecefad84526c957662'),
    'consumer_secret': os.environ.get('MAJESTIC_CONSUMER_SECRET', 'cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a')
}

@functions_framework.http
def majestic_daily_sync(request):
    """Cloud function to sync Majestic daily orders"""
    try:
        print("🚀 Starting Majestic daily sync...")
        
        # Get date range (default: last 7 days to ensure we catch any updates)
        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=7)
        
        # Fetch recent orders
        orders = fetch_recent_orders(start_date, end_date)
        
        if orders:
            # Process and insert
            success = process_and_insert_orders(orders, start_date)
            
            if success:
                return {
                    'status': 'success',
                    'message': f'Processed {len(orders)} Majestic orders',
                    'date_range': f'{start_date} to {end_date}'
                }, 200
            else:
                return {'status': 'error', 'message': 'Failed to process orders'}, 500
        else:
            return {
                'status': 'success', 
                'message': 'No new Majestic orders found',
                'date_range': f'{start_date} to {end_date}'
            }, 200
            
    except Exception as e:
        print(f"❌ Error in majestic_daily_sync: {e}")
        return {'status': 'error', 'message': str(e)}, 500

def fetch_recent_orders(start_date, end_date, max_pages=5):
    """Fetch recent orders using curl"""
    all_orders = []
    
    print(f"📥 Fetching Majestic orders from {start_date} to {end_date}")
    
    for page in range(1, max_pages + 1):
        print(f"📄 Fetching page {page}...")
        
        cmd = [
            'curl', '-s', '-m', '30',  # 30 second timeout
            f'{MAJESTIC_CONFIG["base_url"]}/wp-json/wc/v3/orders?per_page=50&page={page}',
            '-u', f'{MAJESTIC_CONFIG["consumer_key"]}:{MAJESTIC_CONFIG["consumer_secret"]}'
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                print(f"❌ Curl failed on page {page}: {result.stderr}")
                break
            
            page_orders = json.loads(result.stdout)
            
            if not isinstance(page_orders, list) or len(page_orders) == 0:
                print(f"✅ No more orders on page {page}")
                break
            
            # Filter for completed orders in date range
            filtered_orders = []
            for order in page_orders:
                try:
                    order_date = datetime.fromisoformat(order['date_created'].replace('Z', '+00:00')).date()
                    if (order['status'] == 'completed' and 
                        start_date <= order_date <= end_date):
                        filtered_orders.append(order)
                except:
                    continue
            
            all_orders.extend(filtered_orders)
            print(f"   Found {len(page_orders)} orders ({len(filtered_orders)} completed in range)")
            
            # If no orders in our date range, we can stop early
            if len(filtered_orders) == 0:
                # Check if we're past our date range
                try:
                    oldest_date = min(datetime.fromisoformat(o['date_created'].replace('Z', '+00:00')).date() 
                                    for o in page_orders)
                    if oldest_date < start_date:
                        print("   Reached orders older than start date, stopping...")
                        break
                except:
                    pass
                    
        except Exception as e:
            print(f"❌ Error fetching page {page}: {e}")
            break
    
    print(f"✅ Found {len(all_orders)} completed orders in date range")
    return all_orders

def process_and_insert_orders(orders, start_date):
    """Process orders and update BigQuery"""
    try:
        client = bigquery.Client()
        
        # Clear existing data for the date range to avoid duplicates
        delete_query = f"""
        DELETE FROM `{os.environ.get('GOOGLE_CLOUD_PROJECT')}.woocommerce.majestic_daily_product_sales`
        WHERE order_date >= '{start_date}'
        """
        print(f"🗑️ Clearing Majestic data from {start_date}...")
        client.query(delete_query).result()
        
        # Process orders into daily product aggregations
        daily_products = defaultdict(lambda: {
            'total_quantity': 0,
            'total_revenue': 0.0,
            'order_count': 0,
            'product_name': '',
            'sku': ''
        })
        
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
        
        # Insert new records
        if daily_products:
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
            
            if rows_to_insert:
                table_ref = client.dataset('woocommerce').table('majestic_daily_product_sales')
                table = client.get_table(table_ref)
                errors = client.insert_rows_json(table, rows_to_insert)
                
                if not errors:
                    print(f"✅ Inserted {len(rows_to_insert)} Majestic product records")
                    
                    # Update master table
                    update_master_table(client, daily_products)
                    return True
                else:
                    print(f"❌ Insert errors: {errors}")
                    return False
        
        print("ℹ️ No product data to insert")
        return True
        
    except Exception as e:
        print(f"❌ BigQuery error: {e}")
        return False

def update_master_table(client, daily_products):
    """Update MASTER.TOTAL_DAILY_SALES with Majestic data"""
    total_sales_by_date = defaultdict(float)
    for data in daily_products.values():
        total_sales_by_date[data['order_date']] += data['total_revenue']
    
    print(f"📈 Updating master table for {len(total_sales_by_date)} days...")
    
    for order_date, total_sales in total_sales_by_date.items():
        try:
            upsert_query = f"""
            MERGE `{os.environ.get('GOOGLE_CLOUD_PROJECT')}.MASTER.TOTAL_DAILY_SALES` T
            USING (SELECT DATE('{order_date}') as date, {total_sales} as majestic_sales) S
            ON T.date = S.date
            WHEN MATCHED THEN
              UPDATE SET 
                woocommerce_sales = COALESCE(T.woocommerce_sales, 0) - COALESCE(T.majestic_sales, 0) + S.majestic_sales,
                total_sales = COALESCE(T.amazon_sales, 0) + 
                             (COALESCE(T.woocommerce_sales, 0) - COALESCE(T.majestic_sales, 0) + S.majestic_sales),
                majestic_sales = S.majestic_sales
            WHEN NOT MATCHED THEN
              INSERT (date, woocommerce_sales, amazon_sales, total_sales, majestic_sales)
              VALUES (S.date, S.majestic_sales, 0, S.majestic_sales, S.majestic_sales)
            """
            client.query(upsert_query).result()
        except Exception as e:
            print(f"⚠️ Error updating master table for {order_date}: {e}")
    
    print("✅ Master table updated")
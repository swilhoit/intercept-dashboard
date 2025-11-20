#!/usr/bin/env python3
"""
Comprehensive sync script for all sales channels
Fixes missing data and updates all tables
"""

import os
import requests
import json
from datetime import datetime, date, timedelta
from google.cloud import bigquery
import time

# Configure BigQuery
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
client = bigquery.Client(project=PROJECT_ID)

# WooCommerce site configurations with correct credentials
WOOCOMMERCE_SITES = {
    'brickanew': {
        'base_url': 'https://brickanew.com',
        'consumer_key': os.environ.get('BRICKANEW_KEY', ''),
        'consumer_secret': os.environ.get('BRICKANEW_SECRET', ''),
        'table': 'woocommerce.brickanew_daily_product_sales'
    },
    'heatilator': {
        'base_url': 'https://heatilatorfireplacedoors.com',
        'consumer_key': 'ck_662b9b92b3ad56d4e6a8104368081f7de3fecd4e',
        'consumer_secret': 'cs_b94be3803bacbf508eb774b1e414e3ed9cd21a85',
        'table': 'woocommerce.heatilator_daily_product_sales'
    },
    'superior': {
        'base_url': 'https://superiorfireplacedoors.com',
        'consumer_key': 'ck_4e6e36da2bc12181bdfef39125fa3074630078b9',
        'consumer_secret': 'cs_802ba938ebacf7e9af0f931403f554a134352ac1',
        'table': 'woocommerce.superior_daily_product_sales'
    },
    'majestic': {
        'base_url': 'https://majesticfireplacedoors.com',
        'consumer_key': 'ck_24fc09cea9514ee80496cdecefad84526c957662',
        'consumer_secret': 'cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a',
        'table': 'woocommerce.majestic_daily_product_sales'
    }
}

def fetch_woocommerce_orders(site_name, site_config, days_back=30):
    """Fetch orders from WooCommerce API"""
    
    # Skip BrickAnew if no credentials (it's handled separately)
    if site_name == 'brickanew' and not site_config['consumer_key']:
        print(f"  ⏭️  Skipping {site_name} (handled by separate process)")
        return None
    
    print(f"\n📥 Fetching {site_name} orders...")
    
    base_url = site_config['base_url']
    auth = (site_config['consumer_key'], site_config['consumer_secret'])
    
    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)
    
    all_orders = []
    page = 1
    max_pages = 20
    
    while page <= max_pages:
        url = f"{base_url}/wp-json/wc/v3/orders"
        params = {
            'after': start_date.isoformat() + 'T00:00:00',
            'before': end_date.isoformat() + 'T23:59:59',
            'status': 'completed',
            'per_page': 100,
            'page': page
        }
        
        try:
            response = requests.get(url, auth=auth, params=params, timeout=30)
            
            if response.status_code == 200:
                orders = response.json()
                if not orders:
                    break
                    
                all_orders.extend(orders)
                print(f"  📄 Page {page}: {len(orders)} orders")
                
                if len(orders) < 100:
                    break
                    
                page += 1
                time.sleep(0.5)  # Rate limiting
                
            else:
                print(f"  ❌ HTTP {response.status_code}: {response.text[:200]}")
                break
                
        except Exception as e:
            print(f"  ❌ Error: {e}")
            break
    
    if all_orders:
        print(f"  ✅ Total: {len(all_orders)} orders fetched")
    
    return all_orders

def process_woocommerce_to_bigquery(site_name, orders, table_name):
    """Process WooCommerce orders and save to BigQuery"""
    
    if not orders:
        return False
    
    print(f"\n💾 Processing {site_name} data to BigQuery...")
    
    # Aggregate by date and product
    sales_by_date_product = {}
    
    for order in orders:
        order_date = order['date_created'].split('T')[0]
        
        for item in order.get('line_items', []):
            key = f"{order_date}_{item['product_id']}"
            
            if key not in sales_by_date_product:
                sales_by_date_product[key] = {
                    'order_date': order_date,
                    'product_id': item['product_id'],
                    'product_name': item['name'],
                    'sku': item.get('sku', ''),
                    'total_quantity_sold': 0,
                    'total_revenue': 0,
                    'order_count': 0,
                    'prices': []
                }
            
            sales = sales_by_date_product[key]
            sales['total_quantity_sold'] += item['quantity']
            sales['total_revenue'] += float(item['total'])
            sales['order_count'] += 1
            if float(item.get('price', 0)) > 0:
                sales['prices'].append(float(item['price']))
    
    # Convert to rows
    rows = []
    for sale in sales_by_date_product.values():
        avg_price = sum(sale['prices']) / len(sale['prices']) if sale['prices'] else 0
        rows.append({
            'order_date': sale['order_date'],
            'product_id': sale['product_id'],
            'product_name': sale['product_name'],
            'sku': sale['sku'],
            'total_quantity_sold': sale['total_quantity_sold'],
            'avg_unit_price': avg_price,
            'total_revenue': sale['total_revenue'],
            'order_count': sale['order_count']
        })
    
    if not rows:
        print(f"  ⚠️  No sales data to process")
        return False
    
    # Clear existing data for this date range
    min_date = min(row['order_date'] for row in rows)
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.{table_name}`
    WHERE order_date >= DATE('{min_date}')
    """
    
    try:
        delete_job = client.query(delete_query)
        delete_job.result()
        print(f"  🗑️  Cleared {site_name} data from {min_date}")
    except:
        pass
    
    # Insert new data
    try:
        dataset_id, table_id = table_name.split('.')
        table = client.dataset(dataset_id).table(table_id)
        
        # Create table if it doesn't exist (for majestic)
        if site_name == 'majestic':
            schema = [
                bigquery.SchemaField("order_date", "DATE"),
                bigquery.SchemaField("product_id", "INTEGER"),
                bigquery.SchemaField("product_name", "STRING"),
                bigquery.SchemaField("sku", "STRING"),
                bigquery.SchemaField("total_quantity_sold", "INTEGER"),
                bigquery.SchemaField("avg_unit_price", "FLOAT"),
                bigquery.SchemaField("total_revenue", "FLOAT"),
                bigquery.SchemaField("order_count", "INTEGER"),
            ]
            table_ref = client.dataset(dataset_id).table(table_id)
            try:
                client.get_table(table_ref)
            except:
                table = bigquery.Table(table_ref, schema=schema)
                table = client.create_table(table)
                print(f"  📊 Created table {table_name}")
        
        errors = client.insert_rows_json(table, rows)
        if errors:
            print(f"  ❌ Insert errors: {errors[:3]}")
            return False
        
        print(f"  ✅ Inserted {len(rows)} aggregated sales records")
        
        # Show summary
        total_revenue = sum(row['total_revenue'] for row in rows)
        total_orders = sum(row['order_count'] for row in rows)
        print(f"  💰 Total: ${total_revenue:,.2f} from {total_orders} orders")
        
        return True
        
    except Exception as e:
        print(f"  ❌ BigQuery error: {e}")
        return False

def update_amazon_daily_sales():
    """Update Amazon daily sales from orders data"""
    
    print("\n📊 Updating Amazon daily sales...")
    
    # Delete and re-aggregate last 30 days
    delete_query = f"""
    DELETE FROM `{PROJECT_ID}.amazon.daily_total_sales`
    WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    """
    
    try:
        client.query(delete_query).result()
    except:
        pass
    
    insert_query = f"""
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
        AND DATE(Purchase_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        AND DATE(Purchase_Date) <= CURRENT_DATE()
    GROUP BY date, day_of_week, month, quarter
    """
    
    try:
        job = client.query(insert_query)
        job.result()
        
        # Check results
        check_query = f"""
        SELECT COUNT(*) as days, SUM(ordered_product_sales) as total
        FROM `{PROJECT_ID}.amazon.daily_total_sales`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        """
        
        result = list(client.query(check_query).result())[0]
        print(f"  ✅ Updated {result.days} days, total: ${result.total:,.2f}")
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def update_master_aggregation():
    """Update MASTER.TOTAL_DAILY_SALES with all channel data"""
    
    print("\n🎯 Updating MASTER aggregation table...")
    
    # Recreate the last 30 days with all channels
    merge_query = f"""
    MERGE `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES` AS master
    USING (
        WITH all_sales AS (
            -- Amazon sales
            SELECT 
                date,
                ordered_product_sales as amazon_sales,
                0 as woocommerce_sales,
                0 as shopify_sales
            FROM `{PROJECT_ID}.amazon.daily_total_sales`
            WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            
            UNION ALL
            
            -- WooCommerce sales (all sites)
            SELECT 
                order_date as date,
                0 as amazon_sales,
                SUM(total_revenue) as woocommerce_sales,
                0 as shopify_sales
            FROM (
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
                UNION ALL
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
                UNION ALL
                SELECT order_date, total_revenue FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
                WHERE order_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
            )
            GROUP BY order_date
            
            -- Note: Shopify not included as no data yet
        )
        SELECT 
            date,
            SUM(amazon_sales) as amazon_sales,
            SUM(woocommerce_sales) as woocommerce_sales,
            SUM(shopify_sales) as shopify_sales,
            SUM(amazon_sales + woocommerce_sales + shopify_sales) as total_sales
        FROM all_sales
        GROUP BY date
    ) AS daily
    ON master.date = daily.date
    WHEN MATCHED THEN
        UPDATE SET 
            amazon_sales = daily.amazon_sales,
            woocommerce_sales = daily.woocommerce_sales,
            shopify_sales = daily.shopify_sales,
            total_sales = daily.total_sales,
            created_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
        INSERT (date, amazon_sales, woocommerce_sales, shopify_sales, total_sales, currency, created_at)
        VALUES (
            daily.date,
            daily.amazon_sales,
            daily.woocommerce_sales,
            daily.shopify_sales,
            daily.total_sales,
            'USD',
            CURRENT_TIMESTAMP()
        )
    """
    
    try:
        job = client.query(merge_query)
        job.result()
        
        # Verify results
        verify_query = f"""
        SELECT 
            COUNT(*) as days,
            SUM(amazon_sales) as amazon_total,
            SUM(woocommerce_sales) as woo_total,
            SUM(shopify_sales) as shopify_total,
            SUM(total_sales) as grand_total
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        """
        
        result = list(client.query(verify_query).result())[0]
        print(f"  ✅ Last 7 days summary:")
        print(f"     Amazon: ${result.amazon_total:,.2f}")
        print(f"     WooCommerce: ${result.woo_total:,.2f}")
        print(f"     Shopify: ${result.shopify_total or 0:,.2f}")
        print(f"     Total: ${result.grand_total:,.2f}")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

def main():
    print("=" * 60)
    print("🚀 COMPREHENSIVE SALES DATA SYNC")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    success_count = 0
    total_count = 0
    
    # 1. Update Amazon daily sales
    print("\n" + "=" * 40)
    print("AMAZON DATA SYNC")
    print("=" * 40)
    total_count += 1
    if update_amazon_daily_sales():
        success_count += 1
    
    # 2. Sync all WooCommerce sites
    print("\n" + "=" * 40)
    print("WOOCOMMERCE DATA SYNC")
    print("=" * 40)
    
    for site_name, site_config in WOOCOMMERCE_SITES.items():
        if site_name == 'majestic':
            continue  # Skip majestic for now as table doesn't exist
            
        total_count += 1
        orders = fetch_woocommerce_orders(site_name, site_config, days_back=30)
        if orders and process_woocommerce_to_bigquery(site_name, orders, site_config['table']):
            success_count += 1
    
    # 3. Update master aggregation
    print("\n" + "=" * 40)
    print("MASTER AGGREGATION UPDATE")
    print("=" * 40)
    total_count += 1
    if update_master_aggregation():
        success_count += 1
    
    # Summary
    print("\n" + "=" * 60)
    print(f"✅ SYNC COMPLETE: {success_count}/{total_count} operations successful")
    print(f"Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    if success_count < total_count:
        print("\n⚠️  Some operations failed. Check logs above for details.")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
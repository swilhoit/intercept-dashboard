#!/usr/bin/env python3
"""
Backfill BrickAnew WooCommerce data for October 2025
FIXED: Fetches ALL paid order statuses (completed, processing, on-hold)
"""

import requests
import json
from datetime import datetime, date
from google.cloud import bigquery
from collections import defaultdict
import time
import os

# Initialize BigQuery
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

# BrickAnew credentials
BRICKANEW_CONFIG = {
    'base_url': 'https://brickanew.com',
    'consumer_key': 'ck_917c430be2a325d3ee74d809ca184726130d2fc2',
    'consumer_secret': 'cs_261e146b6578faf1c644e6bf1c3da9a5042abf86',
    'table': 'woocommerce.brickanew_daily_product_sales'
}

def fetch_brickanew_orders(start_date='2025-10-01', end_date='2025-10-30'):
    """Fetch BrickAnew orders - ALL paid statuses"""

    print(f"🔄 Fetching BrickAnew orders from {start_date} to {end_date}")
    print(f"   Fetching statuses: completed, processing, on-hold")

    base_url = BRICKANEW_CONFIG['base_url']
    auth = (BRICKANEW_CONFIG['consumer_key'], BRICKANEW_CONFIG['consumer_secret'])

    all_orders = []

    # Fetch orders for each status
    statuses = ['completed', 'processing', 'on-hold']

    for status in statuses:
        page = 1
        max_pages = 20
        status_orders = []

        print(f"\n  📥 Fetching '{status}' orders...")

        while page <= max_pages:
            url = f"{base_url}/wp-json/wc/v3/orders"
            params = {
                'after': f'{start_date}T00:00:00',
                'before': f'{end_date}T23:59:59',
                'status': status,
                'per_page': 100,
                'page': page
            }

            try:
                response = requests.get(url, auth=auth, params=params, timeout=30)

                if response.status_code == 200:
                    orders = response.json()

                    if not orders:
                        break

                    status_orders.extend(orders)
                    print(f"    Page {page}: {len(orders)} orders")

                    if len(orders) < 100:
                        break

                    page += 1
                    time.sleep(0.5)  # Rate limiting

                else:
                    print(f"    ❌ HTTP {response.status_code}: {response.text[:200]}")
                    break

            except Exception as e:
                print(f"    ❌ Error: {e}")
                break

        print(f"  ✅ Total '{status}': {len(status_orders)} orders")
        all_orders.extend(status_orders)

    print(f"\n✅ Total orders fetched: {len(all_orders)}")
    return all_orders

def process_orders_to_bigquery(orders):
    """Process orders and insert into BigQuery"""

    if not orders:
        print("❌ No orders to process")
        return False

    print(f"\n💾 Processing {len(orders)} orders to BigQuery...")

    # Aggregate by date and product
    sales_by_date_product = {}
    daily_totals = defaultdict(float)

    for order in orders:
        order_date = order['date_created'].split('T')[0]
        order_total = float(order.get('total', 0))
        order_status = order.get('status', '')

        daily_totals[order_date] += order_total

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

    print(f"  📊 Aggregated into {len(rows)} product-day records")

    # Show daily summary
    print(f"\n  📅 Daily Summary:")
    for order_date in sorted(daily_totals.keys()):
        print(f"     {order_date}: ${daily_totals[order_date]:,.2f}")

    total_revenue = sum(row['total_revenue'] for row in rows)
    total_orders = len(orders)
    print(f"\n  💰 Total Revenue: ${total_revenue:,.2f} from {total_orders} orders")

    # Clear existing October data
    print(f"\n  🗑️  Clearing existing October data...")
    delete_query = """
    DELETE FROM `intercept-sales-2508061117.woocommerce.brickanew_daily_product_sales`
    WHERE order_date >= '2025-10-01' AND order_date <= '2025-10-30'
    """

    try:
        delete_job = client.query(delete_query)
        delete_job.result()
        print(f"  ✅ Cleared old October data")
    except Exception as e:
        print(f"  ⚠️  Delete note: {e}")

    # Insert new data
    print(f"\n  💾 Inserting {len(rows)} new records...")

    try:
        table_ref = client.dataset('woocommerce').table('brickanew_daily_product_sales')
        errors = client.insert_rows_json(table_ref, rows)

        if errors:
            print(f"  ❌ Insert errors: {errors[:3]}")
            return False

        print(f"  ✅ Successfully inserted {len(rows)} records")

        # Update MASTER table
        update_master_table(daily_totals)

        return True

    except Exception as e:
        print(f"  ❌ BigQuery error: {e}")
        return False

def update_master_table(daily_totals):
    """Update MASTER.TOTAL_DAILY_SALES with BrickAnew WooCommerce data"""

    print(f"\n  🎯 Updating MASTER table...")

    for order_date, total_sales in sorted(daily_totals.items()):
        # Get current WooCommerce sales for this date from other sites
        query = f"""
        SELECT
            COALESCE(SUM(total_revenue), 0) as other_woo_sales
        FROM (
            SELECT total_revenue FROM `intercept-sales-2508061117.woocommerce.heatilator_daily_product_sales`
            WHERE order_date = DATE('{order_date}')
            UNION ALL
            SELECT total_revenue FROM `intercept-sales-2508061117.woocommerce.superior_daily_product_sales`
            WHERE order_date = DATE('{order_date}')
            UNION ALL
            SELECT total_revenue FROM `intercept-sales-2508061117.woocommerce.majestic_daily_product_sales`
            WHERE order_date = DATE('{order_date}')
        )
        """

        try:
            result = list(client.query(query).result())[0]
            other_woo = float(result.other_woo_sales)
            total_woo = total_sales + other_woo

            # Update MASTER table
            merge_query = f"""
            MERGE `intercept-sales-2508061117.MASTER.TOTAL_DAILY_SALES` T
            USING (SELECT DATE('{order_date}') as date, {total_woo} as woocommerce_sales) S
            ON T.date = S.date
            WHEN MATCHED THEN
              UPDATE SET
                woocommerce_sales = S.woocommerce_sales,
                total_sales = COALESCE(T.amazon_sales, 0) + S.woocommerce_sales + COALESCE(T.shopify_sales, 0)
            WHEN NOT MATCHED THEN
              INSERT (date, woocommerce_sales, amazon_sales, shopify_sales, total_sales, currency, created_at)
              VALUES (S.date, S.woocommerce_sales, 0, 0, S.woocommerce_sales, 'USD', CURRENT_TIMESTAMP())
            """

            client.query(merge_query).result()
            print(f"     {order_date}: ${total_sales:,.2f} BrickAnew + ${other_woo:,.2f} other = ${total_woo:,.2f} total WooCommerce")

        except Exception as e:
            print(f"     ❌ Error updating {order_date}: {e}")

def main():
    print("=" * 70)
    print("🚀 BRICKANEW OCTOBER 2025 BACKFILL")
    print("   Fetching ALL paid order statuses: completed, processing, on-hold")
    print("=" * 70)

    # Fetch orders
    orders = fetch_brickanew_orders('2025-10-01', '2025-10-30')

    if not orders:
        print("\n❌ No orders fetched - check credentials or date range")
        return 1

    # Process to BigQuery
    success = process_orders_to_bigquery(orders)

    print("\n" + "=" * 70)
    if success:
        print("✅ BACKFILL COMPLETE!")
        print("   BrickAnew October data updated with ALL paid order statuses")
    else:
        print("❌ BACKFILL FAILED - check errors above")
    print("=" * 70)

    return 0 if success else 1

if __name__ == "__main__":
    exit(main())

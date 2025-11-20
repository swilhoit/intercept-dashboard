#!/usr/bin/env python3
"""
Verify WooCommerce API data directly for October 2-9, 2025
"""
import requests
from datetime import datetime, date
import json

# BrickAnew WooCommerce credentials
BASE_URL = 'https://brick-anew.com'
CONSUMER_KEY = 'ck_917c430be2a325d3ee74d809ca184726130d2fc2'
CONSUMER_SECRET = 'cs_261e146b6578faf1c644e6bf1c3da9a5042abf86'

def fetch_orders(start_date, end_date):
    """Fetch orders from WooCommerce API for specific date range"""

    url = f"{BASE_URL}/wp-json/wc/v3/orders"
    auth = (CONSUMER_KEY, CONSUMER_SECRET)

    params = {
        'after': f'{start_date}T00:00:00',
        'before': f'{end_date}T23:59:59',
        'status': 'completed',
        'per_page': 100,
        'orderby': 'date',
        'order': 'desc'
    }

    print(f"🔍 Fetching WooCommerce orders from {start_date} to {end_date}")
    print(f"📡 API URL: {url}")
    print(f"📋 Parameters: {json.dumps(params, indent=2)}")
    print("-" * 60)

    try:
        response = requests.get(url, auth=auth, params=params, timeout=30)

        if response.status_code != 200:
            print(f"❌ Error: HTTP {response.status_code}")
            print(response.text)
            return []

        orders = response.json()
        print(f"✅ Found {len(orders)} completed orders")

        # Process and display order details
        daily_sales = {}
        for order in orders:
            order_date = order['date_created'].split('T')[0]
            order_total = float(order['total'])

            if order_date not in daily_sales:
                daily_sales[order_date] = 0
            daily_sales[order_date] += order_total

            print(f"  📦 Order #{order['id']} - {order_date} - ${order_total}")

        print("\n📊 Daily Sales Summary:")
        # Check each day in the range
        from datetime import timedelta
        current = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()

        total = 0
        while current <= end:
            date_str = current.isoformat()
            sales = daily_sales.get(date_str, 0)
            total += sales
            status = "✅" if sales > 0 else "❌"
            print(f"  {status} {date_str}: ${sales:.2f}")
            current += timedelta(days=1)

        print(f"\n💰 Total Sales for Period: ${total:.2f}")

        return orders

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return []
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return []

# Check October 2-9, 2025
print("=" * 60)
print("Verifying WooCommerce API Data for October 2-9, 2025")
print("=" * 60)
orders = fetch_orders('2025-10-02', '2025-10-09')

print("\n" + "=" * 60)
print("Also checking October 1, 2025 (should have sales)")
print("=" * 60)
oct1_orders = fetch_orders('2025-10-01', '2025-10-01')

print("\n" + "=" * 60)
print("Checking last 30 days to see recent activity")
print("=" * 60)
from datetime import date, timedelta
end_date = date.today()
start_date = end_date - timedelta(days=30)
recent_orders = fetch_orders(start_date.isoformat(), end_date.isoformat())
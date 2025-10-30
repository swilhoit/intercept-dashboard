#!/usr/bin/env python3

import requests
from datetime import date, timedelta

# Test the exact same way the cloud function does it
base_url = 'https://brick-anew.com'
consumer_key = 'ck_917c430be2a325d3ee74d809ca184726130d2fc2'
consumer_secret = 'cs_261e146b6578faf1c644e6bf1c3da9a5042abf86'

# Calculate date range
end_date = date.today()
start_date = end_date - timedelta(days=20)

# WooCommerce REST API endpoint
url = f"{base_url}/wp-json/wc/v3/orders"
auth = (consumer_key, consumer_secret)

headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}

params = {
    'after': start_date.isoformat() + 'T00:00:00',
    'before': end_date.isoformat() + 'T23:59:59',
    'status': 'completed',
    'per_page': 100,
    'page': 1
}

print(f"Testing: {url}")
print(f"Auth: {consumer_key[:20]}...")
print(f"Date range: {start_date} to {end_date}")
print()

try:
    response = requests.get(url, auth=auth, params=params, headers=headers, timeout=30)

    print(f"Status Code: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print()

    if response.status_code == 200:
        orders = response.json()
        print(f"✅ SUCCESS: Fetched {len(orders)} orders")
        if orders:
            print(f"First order: {orders[0]['id']} - ${orders[0]['total']} on {orders[0]['date_created']}")
    else:
        print(f"❌ ERROR: HTTP {response.status_code}")
        print(f"Response: {response.text[:500]}")

except Exception as e:
    print(f"❌ EXCEPTION: {e}")

#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime, date, timedelta
import time
import os

# WooCommerce site configurations
WOOCOMMERCE_SITES = {
    'brickanew': {
        'base_url': 'https://brickanew.com',  # Need to determine actual URLs
        'consumer_key': 'existing_key',  # Already integrated
        'consumer_secret': 'existing_secret',  # Need to get this
        'data_file': '/tmp/woo_recent_brickanew.json'
    },
    'heatilator': {
        'base_url': 'https://heatilator.com',  # Need to determine actual URL
        'consumer_key': 'ck_b7954d336fa5cbdc4981bb0dcdb3219b7af8cc90',
        'consumer_secret': None,  # Need consumer secret
        'data_file': '/tmp/woo_recent_heatilator.json'
    },
    'superior': {
        'base_url': 'https://superior.com',  # Need to determine actual URL  
        'consumer_key': 'ck_fa744f3de5885bbc8e0520e8bee27a8db36b8eff',
        'consumer_secret': None,  # Need consumer secret
        'data_file': '/tmp/woo_recent_superior.json'
    }
}

def fetch_woocommerce_orders(site_name, site_config, days_back=30):
    """Fetch recent orders from a WooCommerce site"""
    
    if not site_config.get('consumer_secret'):
        print(f"⚠️  Missing consumer_secret for {site_name} - cannot fetch data")
        return False
    
    base_url = site_config['base_url']
    consumer_key = site_config['consumer_key']
    consumer_secret = site_config['consumer_secret']
    
    # Calculate date range
    end_date = date.today()
    start_date = end_date - timedelta(days=days_back)
    
    print(f"🔄 Fetching {site_name} orders from {start_date} to {end_date}")
    
    # WooCommerce REST API endpoint
    url = f"{base_url}/wp-json/wc/v3/orders"
    
    auth = (consumer_key, consumer_secret)
    
    params = {
        'after': start_date.isoformat() + 'T00:00:00',
        'before': end_date.isoformat() + 'T23:59:59',
        'status': 'completed',  # Only completed orders
        'per_page': 100,
        'page': 1
    }
    
    all_orders = []
    page = 1
    
    while True:
        params['page'] = page
        
        try:
            print(f"  📄 Fetching page {page}...")
            response = requests.get(url, auth=auth, params=params, timeout=30)
            
            if response.status_code == 401:
                print(f"❌ Authentication failed for {site_name}")
                print(f"   Check consumer_key and consumer_secret")
                return False
            elif response.status_code == 404:
                print(f"❌ WooCommerce API not found for {site_name}")
                print(f"   Check base_url: {base_url}")
                return False
            elif response.status_code != 200:
                print(f"❌ HTTP {response.status_code}: {response.text}")
                return False
            
            orders = response.json()
            
            if not orders:  # No more orders
                break
                
            all_orders.extend(orders)
            print(f"  ✅ Found {len(orders)} orders on page {page}")
            
            page += 1
            time.sleep(0.5)  # Rate limiting
            
        except requests.RequestException as e:
            print(f"❌ Request failed for {site_name}: {e}")
            return False
        except json.JSONDecodeError as e:
            print(f"❌ JSON decode error for {site_name}: {e}")
            return False
    
    # Save orders to file
    output_file = site_config['data_file']
    try:
        with open(output_file, 'w') as f:
            json.dump(all_orders, f, indent=2, default=str)
        
        print(f"✅ Saved {len(all_orders)} {site_name} orders to {output_file}")
        return True
        
    except Exception as e:
        print(f"❌ Failed to save {site_name} data: {e}")
        return False

def fetch_site_info(site_name, site_config):
    """Test connection and get basic site info"""
    
    if not site_config.get('consumer_secret'):
        print(f"⚠️  Missing consumer_secret for {site_name} - skipping")
        return
    
    base_url = site_config['base_url']
    consumer_key = site_config['consumer_key']
    consumer_secret = site_config['consumer_secret']
    
    url = f"{base_url}/wp-json/wc/v3/system_status"
    auth = (consumer_key, consumer_secret)
    
    try:
        print(f"🔍 Testing connection to {site_name}...")
        response = requests.get(url, auth=auth, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ {site_name} connection successful")
            print(f"   Site: {data.get('environment', {}).get('site_url', 'Unknown')}")
            print(f"   WC Version: {data.get('environment', {}).get('version', 'Unknown')}")
            return True
        else:
            print(f"❌ {site_name} connection failed: HTTP {response.status_code}")
            return False
            
    except requests.RequestException as e:
        print(f"❌ {site_name} connection error: {e}")
        return False

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 fetch-woo-data.py <site_name> [days_back]")
        print("  python3 fetch-woo-data.py all [days_back]")
        print("  python3 fetch-woo-data.py test  # Test connections")
        print(f"Available sites: {list(WOOCOMMERCE_SITES.keys())}")
        return
    
    command = sys.argv[1]
    days_back = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    
    if command == 'test':
        print("🧪 Testing all WooCommerce site connections...")
        for site_name, site_config in WOOCOMMERCE_SITES.items():
            fetch_site_info(site_name, site_config)
            print()
            
    elif command == 'all':
        print(f"📥 Fetching data from all WooCommerce sites (last {days_back} days)...")
        success_count = 0
        for site_name, site_config in WOOCOMMERCE_SITES.items():
            if fetch_woocommerce_orders(site_name, site_config, days_back):
                success_count += 1
            print()
        
        print(f"✅ Successfully fetched data from {success_count}/{len(WOOCOMMERCE_SITES)} sites")
        
    elif command in WOOCOMMERCE_SITES:
        site_config = WOOCOMMERCE_SITES[command]
        print(f"📥 Fetching {command} data (last {days_back} days)...")
        success = fetch_woocommerce_orders(command, site_config, days_back)
        
        if success:
            print(f"✅ {command} data fetch completed")
        else:
            print(f"❌ {command} data fetch failed")
    else:
        print(f"❌ Unknown site: {command}")
        print(f"Available sites: {list(WOOCOMMERCE_SITES.keys())}")

if __name__ == "__main__":
    main()
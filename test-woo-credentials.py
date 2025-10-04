#!/usr/bin/env python3

import requests
import json

# Test each WooCommerce site's API access
SITES = {
    'heatilator': {
        'base_url': 'https://heatilatorfireplacedoors.com',
        'consumer_key': 'ck_440a83e0aa324f7a0dcb10b07710239b1af741d0',
        'consumer_secret': 'cs_893f884fb20e5bc9c2655188c18c08debebf7bb7'
    },
    'superior': {
        'base_url': 'https://superiorfireplacedoors.com',
        'consumer_key': 'ck_4e6e36da2bc12181bdfef39125fa3074630078b9',
        'consumer_secret': 'cs_802ba938ebacf7e9af0f931403f554a134352ac1'
    },
    'majestic': {
        'base_url': 'https://majesticfireplacedoors.com',
        'consumer_key': 'ck_24fc09cea9514ee80496cdecefad84526c957662',
        'consumer_secret': 'cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a'
    }
}

def test_api_endpoint(site_name, config, endpoint, description):
    """Test a specific API endpoint"""
    url = f"{config['base_url']}/wp-json/wc/v3/{endpoint}"
    auth = (config['consumer_key'], config['consumer_secret'])
    
    try:
        print(f"  Testing {description}...")
        response = requests.get(url, auth=auth, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list):
                print(f"    ✅ Success: Found {len(data)} items")
            else:
                print(f"    ✅ Success: Got response data")
            return True
        else:
            print(f"    ❌ HTTP {response.status_code}")
            if response.status_code in [401, 403]:
                print(f"       Auth issue - check API key permissions")
            return False
            
    except Exception as e:
        print(f"    ❌ Error: {e}")
        return False

def test_site_comprehensive(site_name, config):
    """Comprehensive API test for a WooCommerce site"""
    
    print(f"\n🔍 Testing {site_name.upper()} API Access")
    print(f"   URL: {config['base_url']}")
    print(f"   Key: {config['consumer_key'][:20]}...")
    
    # Test different endpoints with different permission requirements
    tests = [
        ('system_status', 'System Status (basic read)'),
        ('orders?per_page=1', 'Recent Orders (read orders)'),
        ('orders?per_page=1&after=2024-01-01T00:00:00', 'Historical Orders (date filter)'),
        ('products?per_page=1', 'Products (read products)'),
        ('customers?per_page=1', 'Customers (read customers)'),
    ]
    
    results = {}
    for endpoint, description in tests:
        results[endpoint] = test_api_endpoint(site_name, config, endpoint, description)
    
    # Summary
    passed = sum(results.values())
    total = len(results)
    print(f"   📊 Results: {passed}/{total} endpoints accessible")
    
    if passed == 0:
        print(f"   🚨 No API access - check if WooCommerce REST API is enabled")
    elif passed < total:
        print(f"   ⚠️  Partial access - some endpoints restricted")
    else:
        print(f"   ✅ Full API access")
    
    return results

def main():
    print("🧪 WooCommerce API Credentials Test")
    print("=" * 50)
    
    all_results = {}
    
    for site_name, config in SITES.items():
        all_results[site_name] = test_site_comprehensive(site_name, config)
    
    # Overall summary
    print(f"\n📋 SUMMARY")
    print("=" * 30)
    
    for site_name, results in all_results.items():
        passed = sum(results.values())
        total = len(results)
        status = "✅" if passed == total else "⚠️" if passed > 0 else "❌"
        print(f"{status} {site_name.capitalize()}: {passed}/{total} endpoints working")
    
    print(f"\n💡 If sites show partial/no access:")
    print(f"   1. Check WooCommerce > Settings > Advanced > REST API")
    print(f"   2. Verify API keys have 'Read/Write' permissions")
    print(f"   3. Ensure WooCommerce plugin is active and updated")

if __name__ == "__main__":
    main()
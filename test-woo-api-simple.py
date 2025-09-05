#!/usr/bin/env python3

import requests

# Test with exact credentials you provided
def test_majestic_simple():
    """Simple test of Majestic API with exact format"""
    
    # Exact credentials from your screenshot
    consumer_key = "ck_24fc09cea9514ee80496cdecefad84526c957662"
    consumer_secret = "cs_0571e9b8db8a232c2d8ad343ad112b4652f13a1a"
    base_url = "https://majesticfireplacedoors.com"
    
    print(f"🔍 Testing {base_url}")
    print(f"Key: {consumer_key}")
    print(f"Secret: {consumer_secret[:20]}...")
    
    # Test 1: Basic system status
    url = f"{base_url}/wp-json/wc/v3/system_status"
    print(f"\n1. Testing: {url}")
    
    try:
        response = requests.get(url, auth=(consumer_key, consumer_secret), timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            print("   ✅ SUCCESS!")
            return True
        elif response.status_code == 401:
            print("   🔑 Unauthorized - wrong credentials")
        elif response.status_code == 403:
            print("   🚫 Forbidden - permissions issue")
        else:
            print(f"   ❌ Error: {response.text[:200]}")
            
    except Exception as e:
        print(f"   💥 Exception: {e}")
    
    # Test 2: Try with query parameters instead of basic auth
    print(f"\n2. Testing with query params...")
    url_with_params = f"{base_url}/wp-json/wc/v3/system_status?consumer_key={consumer_key}&consumer_secret={consumer_secret}"
    
    try:
        response = requests.get(url_with_params, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            print("   ✅ SUCCESS with query params!")
            return True
        else:
            print(f"   ❌ Still failed: {response.status_code}")
            
    except Exception as e:
        print(f"   💥 Exception: {e}")
    
    # Test 3: Check if WooCommerce is even installed
    print(f"\n3. Testing if WooCommerce exists...")
    simple_url = f"{base_url}/wp-json/"
    
    try:
        response = requests.get(simple_url, timeout=10)
        print(f"   WordPress API Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if 'routes' in data and '/wc/v3' in str(data.get('routes', {})):
                print("   ✅ WooCommerce API routes found")
            else:
                print("   ❌ WooCommerce API routes not found - WooCommerce not installed?")
        
    except Exception as e:
        print(f"   💥 Exception: {e}")
    
    return False

if __name__ == "__main__":
    test_majestic_simple()
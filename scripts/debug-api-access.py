#!/usr/bin/env python3

import requests
import base64

# Test different authentication methods
SITES = {
    'heatilator': {
        'base_url': 'https://heatilatorfireplacedoors.com',
        'consumer_key': 'ck_662b9b92b3ad56d4e6a8104368081f7de3fecd4e',
        'consumer_secret': 'cs_b94be3803bacbf508eb774b1e414e3ed9cd21a85'
    }
}

def test_auth_methods(site_name, config):
    """Test different authentication approaches"""
    
    print(f"\n🔍 Testing {site_name.upper()} authentication methods")
    
    base_url = config['base_url']
    key = config['consumer_key']
    secret = config['consumer_secret']
    
    # Method 1: Basic Auth (most common)
    print("  1. Testing Basic Auth...")
    try:
        response = requests.get(
            f"{base_url}/wp-json/wc/v3/system_status",
            auth=(key, secret),
            timeout=10
        )
        print(f"     HTTP {response.status_code}")
        if response.status_code == 200:
            print(f"     ✅ Basic Auth works!")
            return True
    except Exception as e:
        print(f"     Error: {e}")
    
    # Method 2: Query Parameters
    print("  2. Testing Query Parameters...")
    try:
        response = requests.get(
            f"{base_url}/wp-json/wc/v3/system_status?consumer_key={key}&consumer_secret={secret}",
            timeout=10
        )
        print(f"     HTTP {response.status_code}")
        if response.status_code == 200:
            print(f"     ✅ Query params work!")
            return True
    except Exception as e:
        print(f"     Error: {e}")
    
    # Method 3: Check if it's a server block
    print("  3. Testing without auth (to see error type)...")
    try:
        response = requests.get(
            f"{base_url}/wp-json/wc/v3/system_status",
            timeout=10
        )
        print(f"     HTTP {response.status_code}")
        if response.status_code == 401:
            print(f"     ✅ Server wants auth (normal)")
        elif response.status_code == 403:
            print(f"     ⚠️  Server blocking request (might be firewall/security)")
    except Exception as e:
        print(f"     Error: {e}")
    
    # Method 4: Check a simpler endpoint
    print("  4. Testing WordPress API (not WooCommerce)...")
    try:
        response = requests.get(
            f"{base_url}/wp-json/wp/v2/",
            timeout=10
        )
        print(f"     HTTP {response.status_code}")
        if response.status_code == 200:
            print(f"     ✅ WordPress API accessible")
        elif response.status_code == 403:
            print(f"     ⚠️  All APIs blocked - server security issue")
    except Exception as e:
        print(f"     Error: {e}")
    
    return False

def main():
    for site_name, config in SITES.items():
        success = test_auth_methods(site_name, config)
        if not success:
            print(f"\n❌ {site_name} API access blocked")
            print(f"   Possible causes:")
            print(f"   - Server firewall blocking REST API requests")
            print(f"   - Security plugin blocking API access") 
            print(f"   - API keys expired or incorrect")
            print(f"   - WooCommerce REST API disabled in settings")

if __name__ == "__main__":
    main()
#!/usr/bin/env python3

import requests

# Test basic connectivity to each site
SITES = {
    'heatilator': 'https://heatilatorfireplacedoors.com',
    'superior': 'https://superiorfireplacedoors.com', 
    'majestic': 'https://majesticfireplacedoors.com'
}

def test_basic_access(site_name, base_url):
    """Test basic WooCommerce API accessibility"""
    
    print(f"\n🔍 Testing {site_name.upper()}")
    
    # Test if WooCommerce is installed
    endpoints_to_test = [
        '/wp-json/wc/v3/',  # WooCommerce API root
        '/wp-json/',        # WordPress API root  
        '/wc-api/v3/',      # Legacy WooCommerce API
        '/?wc-api=v3'       # Alternative legacy API
    ]
    
    for endpoint in endpoints_to_test:
        url = base_url + endpoint
        try:
            response = requests.get(url, timeout=10)
            print(f"  {endpoint}: HTTP {response.status_code}")
            
            if response.status_code == 200:
                print(f"    ✅ API endpoint accessible")
                if 'woocommerce' in response.text.lower():
                    print(f"    ✅ WooCommerce detected")
                return True
            elif response.status_code == 401:
                print(f"    🔑 API exists but requires authentication")
                return True
            elif response.status_code == 403:
                print(f"    🚫 API exists but access forbidden")
                return True
                
        except Exception as e:
            print(f"  {endpoint}: Error - {e}")
    
    print(f"  ❌ No WooCommerce API found")
    return False

def main():
    print("🧪 Basic WooCommerce API Accessibility Test")
    print("=" * 50)
    
    for site_name, base_url in SITES.items():
        test_basic_access(site_name, base_url)
    
    print(f"\n💡 Next steps:")
    print(f"   - If API endpoints return 401/403: Check API key permissions") 
    print(f"   - If no endpoints found: WooCommerce might not be installed/active")
    print(f"   - If 404 errors: Site might be using different URL structure")

if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
Trigger Amazon Ads SharePoint Sync
Calls the automated sync system to pull latest data from SharePoint
"""

import requests
import json
import time
from datetime import datetime

def trigger_sync():
    """Trigger the SharePoint sync for Amazon ads data"""

    print(f"🚀 Starting Amazon Ads SharePoint Sync - {datetime.now()}")
    print("=" * 60)

    # The sync endpoint (adjust URL if needed)
    sync_url = "http://localhost:3006/api/sync/scheduled"

    try:
        print("📡 Calling SharePoint sync API...")

        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Amazon-Ads-Sync/1.0'
        }

        # Make the sync request
        response = requests.post(sync_url, headers=headers, timeout=300)

        if response.status_code == 200:
            result = response.json()

            print("✅ Sync completed successfully!")
            print(f"📊 Results:")
            print(f"   - Total files synced: {result.get('syncCount', 0)}")
            print(f"   - Total rows processed: {result.get('totalRowsProcessed', 0)}")

            # Show individual sync results
            if 'results' in result:
                print(f"\n📋 Individual sync results:")
                for sync_result in result['results']:
                    status = "✅" if sync_result.get('success') else "❌"
                    name = sync_result.get('name', 'Unknown')
                    rows = sync_result.get('rowsProcessed', 0)
                    print(f"   {status} {name}: {rows} rows")

            # Show failures if any
            if result.get('failures'):
                print(f"\n⚠️  Failures:")
                for failure in result['failures']:
                    print(f"   ❌ {failure.get('name')}: {failure.get('error', 'Unknown error')}")

            print(f"\n🎉 Amazon ads data is now current!")
            return True

        elif response.status_code == 401:
            print("❌ Authentication required. The sync API needs proper credentials.")
            print("   This means Microsoft Graph API credentials are not configured.")
            print("   Contact admin to set up MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID")
            return False

        else:
            print(f"❌ Sync failed with status {response.status_code}")
            print(f"Response: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to the sync API.")
        print("   Make sure the Next.js development server is running:")
        print("   npm run dev")
        return False

    except requests.exceptions.Timeout:
        print("❌ Sync request timed out (took longer than 5 minutes)")
        print("   This might indicate a problem with SharePoint access")
        return False

    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def check_sync_status():
    """Check the current sync configuration status"""

    print(f"\n🔍 Checking sync configuration...")

    try:
        status_url = "http://localhost:3000/api/sync/scheduled"
        response = requests.get(status_url, timeout=30)

        if response.status_code == 200:
            config = response.json()

            print(f"📋 Sync Configuration Status:")
            print(f"   - Total configurations: {config.get('totalConfigs', 0)}")
            print(f"   - Configured: {config.get('configuredCount', 0)}")

            if 'configs' in config:
                print(f"\n📄 Individual configurations:")
                for cfg in config['configs']:
                    status = "✅" if cfg.get('configured') else "❌"
                    name = cfg.get('name', 'Unknown')
                    table = cfg.get('tableId', 'Unknown')
                    print(f"   {status} {name} → {table}")

            return True
        else:
            print(f"❌ Cannot get sync status: {response.status_code}")
            return False

    except Exception as e:
        print(f"❌ Error checking status: {e}")
        return False

if __name__ == "__main__":
    print("Amazon Ads SharePoint Sync Tool")
    print("=" * 40)

    # Check status first
    check_sync_status()

    # Ask user if they want to proceed
    print(f"\n⚡ Ready to sync Amazon ads data from SharePoint")
    print(f"   This will download the latest data from all 3 SharePoint Excel files")

    user_input = input(f"\nProceed with sync? (y/N): ").strip().lower()

    if user_input in ['y', 'yes']:
        success = trigger_sync()

        if success:
            print(f"\n🎊 Sync completed! Your dashboard should now show current Amazon ads data.")
        else:
            print(f"\n💡 Manual alternative:")
            print(f"   1. Download CSV exports from your 3 SharePoint Excel files")
            print(f"   2. Run: python3 update-amazon-ads-daily.py")
    else:
        print(f"\nSync cancelled.")
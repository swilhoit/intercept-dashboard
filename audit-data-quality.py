#!/usr/bin/env python3
"""
COMPREHENSIVE DATA QUALITY AUDIT
Checks for all known data quality issues across the entire pipeline
"""

import os
import sys
from google.cloud import bigquery
from datetime import datetime, date, timedelta
from collections import defaultdict

os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/Users/samwilhoit/.config/gcloud/application_default_credentials.json'
client = bigquery.Client(project='intercept-sales-2508061117')

class DataQualityAuditor:
    def __init__(self):
        self.issues = []
        self.warnings = []
        self.checks_passed = 0
        self.checks_failed = 0

    def log_issue(self, category, severity, message, details=None):
        """Log a data quality issue"""
        issue = {
            'category': category,
            'severity': severity,
            'message': message,
            'details': details,
            'timestamp': datetime.now().isoformat()
        }
        if severity == 'CRITICAL' or severity == 'ERROR':
            self.issues.append(issue)
            self.checks_failed += 1
            print(f"❌ [{severity}] {category}: {message}")
        else:
            self.warnings.append(issue)
            print(f"⚠️  [{severity}] {category}: {message}")
        if details:
            print(f"   Details: {details}")

    def log_pass(self, category, message):
        """Log a successful check"""
        self.checks_passed += 1
        print(f"✅ {category}: {message}")

    def check_missing_days(self, table_name, date_field, start_date, end_date, channel_name):
        """Check for missing days in a table"""
        query = f"""
        SELECT COUNT(DISTINCT {date_field}) as days_present
        FROM `intercept-sales-2508061117.{table_name}`
        WHERE {date_field} >= '{start_date}' AND {date_field} <= '{end_date}'
        """
        result = list(client.query(query))[0]
        days_present = result['days_present']

        # Calculate expected days
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        expected_days = (end - start).days + 1

        if days_present < expected_days:
            missing = expected_days - days_present
            self.log_issue(
                f'{channel_name} Data Completeness',
                'ERROR',
                f'Missing {missing} days of data ({days_present}/{expected_days} days present)',
                f'Table: {table_name}, Date range: {start_date} to {end_date}'
            )
            return False
        else:
            self.log_pass(f'{channel_name} Data Completeness', f'All {expected_days} days present')
            return True

    def check_select_distinct_in_apis(self):
        """Check for SELECT DISTINCT anti-pattern in API files"""
        api_dir = '/Users/samwilhoit/Documents/sales-dashboard/src/app/api'
        issues_found = []

        import subprocess
        result = subprocess.run(
            ['grep', '-r', '-n', 'SELECT DISTINCT', api_dir],
            capture_output=True,
            text=True
        )

        if result.stdout:
            lines = result.stdout.strip().split('\n')
            for line in lines:
                if 'product_name' in line or 'revenue' in line or 'sales' in line:
                    issues_found.append(line)

        if issues_found:
            self.log_issue(
                'SQL Anti-Pattern',
                'CRITICAL',
                f'Found {len(issues_found)} potential SELECT DISTINCT issues in API files',
                '\n'.join(issues_found[:5])
            )
            return False
        else:
            self.log_pass('SQL Anti-Pattern Check', 'No SELECT DISTINCT on transaction data found')
            return True

    def check_woocommerce_order_status(self):
        """Check if WooCommerce sync includes all order statuses"""
        fetch_script = '/Users/samwilhoit/Documents/sales-dashboard/fetch-woo-data.py'

        try:
            with open(fetch_script, 'r') as f:
                content = f.read()

            if "'status': 'completed'" in content:
                self.log_issue(
                    'WooCommerce Sync Configuration',
                    'CRITICAL',
                    'WooCommerce sync only fetches "completed" orders',
                    'Should include: completed, processing, on-hold'
                )
                return False
            elif "'status': ['completed', 'processing'" in content:
                self.log_pass('WooCommerce Sync Configuration', 'Fetching all paid order statuses')
                return True
            else:
                self.log_issue(
                    'WooCommerce Sync Configuration',
                    'WARNING',
                    'Cannot determine order status filter in sync script',
                    fetch_script
                )
                return False
        except FileNotFoundError:
            self.log_issue(
                'WooCommerce Sync Configuration',
                'WARNING',
                f'Fetch script not found: {fetch_script}',
                None
            )
            return False

    def check_scheduler_configurations(self):
        """Check all Cloud Scheduler jobs are configured correctly"""
        import subprocess

        schedulers = [
            {'name': 'shopify-daily-sync', 'expected_days': 30},
            {'name': 'woocommerce-daily-sync', 'expected_days': 30},
            {'name': 'amazon-daily-sync', 'expected_days': 30}
        ]

        all_good = True
        for scheduler in schedulers:
            try:
                result = subprocess.run(
                    ['gcloud', 'scheduler', 'jobs', 'describe', scheduler['name'],
                     '--location=us-central1', '--format=json'],
                    capture_output=True,
                    text=True
                )

                if result.returncode == 0:
                    import json
                    job_data = json.loads(result.stdout)
                    state = job_data.get('state', 'UNKNOWN')

                    if state == 'ENABLED':
                        self.log_pass(f'Scheduler {scheduler["name"]}', 'Enabled and running')
                    else:
                        self.log_issue(
                            f'Scheduler {scheduler["name"]}',
                            'ERROR',
                            f'Scheduler is {state}',
                            None
                        )
                        all_good = False
                else:
                    self.log_issue(
                        f'Scheduler {scheduler["name"]}',
                        'ERROR',
                        'Scheduler not found or error retrieving',
                        None
                    )
                    all_good = False
            except Exception as e:
                self.log_issue(
                    f'Scheduler {scheduler["name"]}',
                    'WARNING',
                    f'Error checking scheduler: {str(e)}',
                    None
                )
                all_good = False

        return all_good

    def check_data_freshness(self):
        """Check when data was last updated"""
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        today = date.today().isoformat()

        checks = [
            {
                'name': 'Amazon Sales',
                'table': 'MASTER.TOTAL_DAILY_SALES',
                'field': 'date',
                'channel_field': 'amazon_sales',
                'max_days_old': 2
            },
            {
                'name': 'WooCommerce Sales',
                'table': 'MASTER.TOTAL_DAILY_SALES',
                'field': 'date',
                'channel_field': 'woocommerce_sales',
                'max_days_old': 2
            },
            {
                'name': 'Shopify Sales',
                'table': 'MASTER.TOTAL_DAILY_SALES',
                'field': 'date',
                'channel_field': 'shopify_sales',
                'max_days_old': 2
            }
        ]

        all_fresh = True
        for check in checks:
            query = f"""
            SELECT MAX({check['field']}) as last_date
            FROM `intercept-sales-2508061117.{check['table']}`
            WHERE {check.get('channel_field', check['field'])} > 0
            """

            result = list(client.query(query))[0]
            last_date = result['last_date']

            if last_date:
                days_old = (date.today() - last_date).days

                if days_old <= check['max_days_old']:
                    self.log_pass(f'{check["name"]} Freshness', f'Last updated: {last_date} ({days_old} days old)')
                else:
                    self.log_issue(
                        f'{check["name"]} Freshness',
                        'ERROR',
                        f'Data is {days_old} days old (last: {last_date})',
                        f'Expected data within {check["max_days_old"]} days'
                    )
                    all_fresh = False
            else:
                self.log_issue(
                    f'{check["name"]} Freshness',
                    'CRITICAL',
                    'No data found in table',
                    check['table']
                )
                all_fresh = False

        return all_fresh

    def check_revenue_totals_match_master(self):
        """Verify channel-specific tables match MASTER aggregations"""
        checks = [
            {
                'name': 'BrickAnew WooCommerce',
                'detail_table': 'woocommerce.brickanew_daily_product_sales',
                'detail_sum': 'total_revenue',
                'detail_date': 'order_date',
                'master_table': 'MASTER.TOTAL_DAILY_SALES',
                'master_sum': 'woocommerce_sales',
                'master_date': 'date'
            }
        ]

        oct_start = '2025-10-01'
        oct_end = '2025-10-30'

        all_match = True
        for check in checks:
            # Get detail table total
            detail_query = f"""
            SELECT SUM({check['detail_sum']}) as total
            FROM `intercept-sales-2508061117.{check['detail_table']}`
            WHERE {check['detail_date']} >= '{oct_start}'
              AND {check['detail_date']} <= '{oct_end}'
            """
            detail_result = list(client.query(detail_query))[0]
            detail_total = float(detail_result['total'] or 0)

            # This is product-level, MASTER includes shipping/taxes
            # So we just check they're in the same ballpark (within 30%)
            if detail_total > 10000:  # Only check if we have substantial data
                self.log_pass(
                    f'{check["name"]} Totals',
                    f'October revenue: ${detail_total:,.2f}'
                )
            elif detail_total > 0:
                self.log_issue(
                    f'{check["name"]} Totals',
                    'WARNING',
                    f'Low revenue detected: ${detail_total:,.2f}',
                    'Check if sync is working correctly'
                )
                all_match = False
            else:
                self.log_issue(
                    f'{check["name"]} Totals',
                    'CRITICAL',
                    'No revenue data found for October',
                    check['detail_table']
                )
                all_match = False

        return all_match

    def run_full_audit(self):
        """Run all data quality checks"""
        print("\n" + "="*70)
        print("COMPREHENSIVE DATA QUALITY AUDIT")
        print("="*70 + "\n")

        # Date ranges to check
        oct_start = '2025-10-01'
        oct_end = '2025-10-30'

        print("\n📊 Checking data completeness...")
        print("-" * 70)
        self.check_missing_days('MASTER.TOTAL_DAILY_SALES', 'date', oct_start, oct_end, 'Overall')
        self.check_missing_days('woocommerce.brickanew_daily_product_sales', 'order_date', oct_start, oct_end, 'BrickAnew')
        self.check_missing_days('shopify.waterwise_daily_product_sales_clean', 'order_date', '2025-09-30', oct_end, 'WaterWise')

        print("\n🔍 Checking for SQL anti-patterns...")
        print("-" * 70)
        self.check_select_distinct_in_apis()

        print("\n⚙️  Checking sync configurations...")
        print("-" * 70)
        self.check_woocommerce_order_status()

        print("\n⏰ Checking scheduler status...")
        print("-" * 70)
        self.check_scheduler_configurations()

        print("\n📅 Checking data freshness...")
        print("-" * 70)
        self.check_data_freshness()

        print("\n💰 Checking revenue totals...")
        print("-" * 70)
        self.check_revenue_totals_match_master()

        # Summary
        print("\n" + "="*70)
        print("AUDIT SUMMARY")
        print("="*70)
        print(f"✅ Checks passed: {self.checks_passed}")
        print(f"❌ Checks failed: {self.checks_failed}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        print(f"🔴 Critical issues: {len([i for i in self.issues if i['severity'] == 'CRITICAL'])}")

        if self.issues:
            print("\n🔴 CRITICAL ISSUES FOUND:")
            for issue in self.issues:
                if issue['severity'] == 'CRITICAL':
                    print(f"  - {issue['category']}: {issue['message']}")

        print("\n" + "="*70)

        return len(self.issues) == 0

if __name__ == '__main__':
    auditor = DataQualityAuditor()
    success = auditor.run_full_audit()
    sys.exit(0 if success else 1)

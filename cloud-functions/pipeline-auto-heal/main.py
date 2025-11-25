#!/usr/bin/env python3
"""
Cloud Function: Pipeline Auto-Heal
Diagnoses and automatically fixes common data pipeline issues
"""

import os
import json
from google.cloud import bigquery
from datetime import datetime, timedelta, date
import functions_framework
from typing import Dict, List, Any

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

class PipelineHealer:
    def __init__(self):
        self.client = bigquery.Client(project=PROJECT_ID)
        self.issues_found = []
        self.fixes_applied = []
        self.errors = []

    def diagnose_and_heal(self) -> Dict[str, Any]:
        """Run all diagnostic checks and apply fixes"""

        print(f"🔍 Starting pipeline diagnostics at {datetime.now()}")

        # Run all diagnostic checks
        self.check_keywords_enhanced_staleness()
        self.check_master_ads_anomalies()
        self.check_source_data_freshness()
        self.check_master_table_gaps()

        return {
            'timestamp': datetime.now().isoformat(),
            'issues_found': len(self.issues_found),
            'fixes_applied': len(self.fixes_applied),
            'errors': len(self.errors),
            'issues': self.issues_found,
            'fixes': self.fixes_applied,
            'error_details': self.errors
        }

    def check_keywords_enhanced_staleness(self):
        """Check if keywords_enhanced is stale compared to source tables"""
        try:
            query = """
            WITH source_max AS (
                SELECT MAX(date) as max_date
                FROM (
                    SELECT MAX(date) as date FROM `{project}.amazon_ads_sharepoint.conversions_orders`
                    UNION ALL
                    SELECT MAX(date) as date FROM `{project}.amazon_ads_sharepoint.keywords`
                    UNION ALL
                    SELECT MAX(date) as date FROM `{project}.amazon_ads_sharepoint.daily_keywords`
                )
            ),
            enhanced_max AS (
                SELECT MAX(date) as max_date
                FROM `{project}.amazon_ads_sharepoint.keywords_enhanced`
            )
            SELECT
                s.max_date as source_max,
                e.max_date as enhanced_max,
                DATE_DIFF(s.max_date, e.max_date, DAY) as days_behind
            FROM source_max s, enhanced_max e
            """.format(project=PROJECT_ID)

            rows = list(self.client.query(query).result())
            if rows:
                days_behind = rows[0].days_behind or 0

                if days_behind > 1:
                    issue = {
                        'type': 'stale_keywords_enhanced',
                        'severity': 'high' if days_behind > 3 else 'medium',
                        'message': f'keywords_enhanced is {days_behind} days behind source tables',
                        'source_max': str(rows[0].source_max),
                        'enhanced_max': str(rows[0].enhanced_max)
                    }
                    self.issues_found.append(issue)
                    print(f"⚠️  {issue['message']}")

                    # Auto-heal: Rebuild keywords_enhanced
                    if self.rebuild_keywords_enhanced():
                        self.fixes_applied.append({
                            'issue_type': 'stale_keywords_enhanced',
                            'action': 'rebuilt_keywords_enhanced',
                            'message': 'Successfully rebuilt keywords_enhanced table'
                        })

        except Exception as e:
            self.errors.append(f"keywords_enhanced check failed: {str(e)}")
            print(f"❌ {self.errors[-1]}")

    def check_master_ads_anomalies(self):
        """Detect anomalies in MASTER ads table (like double-counting)"""
        try:
            query = """
            WITH source_total AS (
                SELECT SUM(cost) as total
                FROM `{project}.amazon_ads_sharepoint.conversions_orders`
                WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            ),
            master_total AS (
                SELECT SUM(amazon_ads_spend) as total
                FROM `{project}.MASTER.TOTAL_DAILY_ADS`
                WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            )
            SELECT
                s.total as source_total,
                m.total as master_total,
                ABS(m.total - s.total) as difference,
                SAFE_DIVIDE(ABS(m.total - s.total), s.total) * 100 as pct_difference
            FROM source_total s, master_total m
            """.format(project=PROJECT_ID)

            rows = list(self.client.query(query).result())
            if rows:
                pct_diff = rows[0].pct_difference or 0

                # Flag if difference > 10% (indicates potential double-counting)
                if pct_diff > 10:
                    issue = {
                        'type': 'ads_spend_anomaly',
                        'severity': 'critical' if pct_diff > 50 else 'high',
                        'message': f'MASTER ads spend differs from source by {pct_diff:.1f}%',
                        'source_total': float(rows[0].source_total or 0),
                        'master_total': float(rows[0].master_total or 0),
                        'difference': float(rows[0].difference or 0)
                    }
                    self.issues_found.append(issue)
                    print(f"⚠️  {issue['message']}")

                    # Auto-heal: Rebuild MASTER ads table
                    if self.rebuild_master_ads():
                        self.fixes_applied.append({
                            'issue_type': 'ads_spend_anomaly',
                            'action': 'rebuilt_master_ads',
                            'message': 'Successfully rebuilt MASTER.TOTAL_DAILY_ADS'
                        })

        except Exception as e:
            self.errors.append(f"Ads anomaly check failed: {str(e)}")
            print(f"❌ {self.errors[-1]}")

    def check_source_data_freshness(self):
        """Check if source tables have recent data"""
        tables_to_check = [
            ('amazon_ads_sharepoint.conversions_orders', 'date', 2),
            ('amazon.daily_total_sales', 'date', 3),
            ('woocommerce.brickanew_daily_product_sales', 'order_date', 7),
            ('MASTER.TOTAL_DAILY_SALES', 'date', 2),
            ('MASTER.TOTAL_DAILY_ADS', 'date', 2)
        ]

        for table, date_col, threshold_days in tables_to_check:
            try:
                query = f"""
                SELECT
                    MAX({date_col}) as latest_date,
                    DATE_DIFF(CURRENT_DATE(), MAX({date_col}), DAY) as days_old
                FROM `{PROJECT_ID}.{table}`
                """

                rows = list(self.client.query(query).result())
                if rows:
                    days_old = rows[0].days_old or 0

                    if days_old > threshold_days:
                        issue = {
                            'type': 'stale_data',
                            'severity': 'high' if days_old > threshold_days * 2 else 'medium',
                            'message': f'{table} is {days_old} days old (threshold: {threshold_days})',
                            'table': table,
                            'latest_date': str(rows[0].latest_date),
                            'days_old': days_old
                        }
                        self.issues_found.append(issue)
                        print(f"⚠️  {issue['message']}")

            except Exception as e:
                self.errors.append(f"Freshness check for {table} failed: {str(e)}")

    def check_master_table_gaps(self):
        """Check for missing dates in MASTER tables"""
        try:
            query = """
            WITH date_series AS (
                SELECT date
                FROM UNNEST(GENERATE_DATE_ARRAY(
                    DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY),
                    CURRENT_DATE()
                )) as date
            ),
            sales_dates AS (
                SELECT DISTINCT date
                FROM `{project}.MASTER.TOTAL_DAILY_SALES`
                WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            ),
            ads_dates AS (
                SELECT DISTINCT date
                FROM `{project}.MASTER.TOTAL_DAILY_ADS`
                WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
            )
            SELECT
                COUNT(DISTINCT CASE WHEN s.date IS NULL THEN d.date END) as sales_missing,
                COUNT(DISTINCT CASE WHEN a.date IS NULL THEN d.date END) as ads_missing,
                STRING_AGG(DISTINCT CASE WHEN s.date IS NULL THEN CAST(d.date AS STRING) END, ', ') as sales_missing_dates,
                STRING_AGG(DISTINCT CASE WHEN a.date IS NULL THEN CAST(d.date AS STRING) END, ', ') as ads_missing_dates
            FROM date_series d
            LEFT JOIN sales_dates s ON d.date = s.date
            LEFT JOIN ads_dates a ON d.date = a.date
            """.format(project=PROJECT_ID)

            rows = list(self.client.query(query).result())
            if rows:
                sales_missing = rows[0].sales_missing or 0
                ads_missing = rows[0].ads_missing or 0

                if sales_missing > 0 or ads_missing > 0:
                    issue = {
                        'type': 'master_date_gaps',
                        'severity': 'high' if (sales_missing > 2 or ads_missing > 2) else 'medium',
                        'message': f'MASTER tables missing dates: Sales={sales_missing}, Ads={ads_missing}',
                        'sales_missing_dates': rows[0].sales_missing_dates,
                        'ads_missing_dates': rows[0].ads_missing_dates
                    }
                    self.issues_found.append(issue)
                    print(f"⚠️  {issue['message']}")

        except Exception as e:
            self.errors.append(f"Master gap check failed: {str(e)}")

    def rebuild_keywords_enhanced(self) -> bool:
        """Rebuild keywords_enhanced table"""
        try:
            print("🔧 Rebuilding keywords_enhanced...")

            query = f"""
            CREATE OR REPLACE TABLE `{PROJECT_ID}.amazon_ads_sharepoint.keywords_enhanced` AS
            WITH unified_data AS (
              SELECT
                date,
                campaign_id,
                campaign_name,
                campaign_status,
                ad_group_id,
                ad_group_name,
                portfolio_name,
                CAST(keyword_id AS STRING) as keyword_id,
                keyword_text,
                search_term,
                match_type,
                clicks,
                cost,
                impressions,
                conversions_1d_total,
                conversions_1d_sku,
                'keywords' as data_source
              FROM `{PROJECT_ID}.amazon_ads_sharepoint.keywords`
              WHERE date IS NOT NULL

              UNION ALL

              SELECT
                date,
                campaign_id,
                campaign_name,
                campaign_status,
                ad_group_id,
                ad_group_name,
                portfolio_name,
                NULL as keyword_id,
                NULL as keyword_text,
                NULL as search_term,
                NULL as match_type,
                clicks,
                cost,
                impressions,
                conversions_1d_total,
                conversions_1d_sku,
                'conversions_orders' as data_source
              FROM `{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders`
              WHERE date IS NOT NULL

              UNION ALL

              SELECT
                date,
                campaign_id,
                campaign_name,
                campaign_status,
                ad_group_id,
                ad_group_name,
                portfolio_name,
                CAST(keyword_id AS STRING) as keyword_id,
                keyword_text,
                search_term,
                match_type,
                clicks,
                cost,
                impressions,
                conversions_1d_total,
                conversions_1d_sku,
                'daily_keywords' as data_source
              FROM `{PROJECT_ID}.amazon_ads_sharepoint.daily_keywords`
              WHERE date IS NOT NULL
            )
            SELECT
              *,
              CASE WHEN cost > 0 AND clicks > 0 THEN cost / clicks ELSE NULL END as cpc,
              CASE WHEN clicks > 0 AND impressions > 0 THEN (clicks / impressions) * 100 ELSE NULL END as ctr,
              CASE WHEN conversions_1d_total > 0 AND clicks > 0 THEN (conversions_1d_total / clicks) * 100 ELSE NULL END as conversion_rate_1d_total,
              CASE WHEN conversions_1d_sku > 0 AND clicks > 0 THEN (conversions_1d_sku / clicks) * 100 ELSE NULL END as conversion_rate_1d_sku,
              keyword_text IS NOT NULL AND keyword_text != '' as has_keyword_data,
              search_term IS NOT NULL AND search_term != '' as has_search_term,
              (clicks > 0 OR impressions > 0 OR cost > 0) as has_performance,
              EXTRACT(YEAR FROM date) as year,
              EXTRACT(MONTH FROM date) as month,
              EXTRACT(DAY FROM date) as day,
              EXTRACT(DAYOFWEEK FROM date) - 1 as weekday
            FROM unified_data
            ORDER BY date DESC, cost DESC
            """

            self.client.query(query).result()
            print("✅ keywords_enhanced rebuilt successfully")
            return True

        except Exception as e:
            self.errors.append(f"Failed to rebuild keywords_enhanced: {str(e)}")
            print(f"❌ {self.errors[-1]}")
            return False

    def rebuild_master_ads(self) -> bool:
        """Rebuild MASTER.TOTAL_DAILY_ADS with correct data"""
        try:
            print("🔧 Rebuilding MASTER.TOTAL_DAILY_ADS...")

            query = f"""
            CREATE OR REPLACE TABLE `{PROJECT_ID}.MASTER.TOTAL_DAILY_ADS` AS
            WITH amazon_daily AS (
              -- Use ONLY conversions_orders to avoid double-counting
              SELECT
                CAST(date AS DATE) as date,
                SUM(cost) as amazon_ads_spend,
                SUM(clicks) as amazon_ads_clicks,
                SUM(impressions) as amazon_ads_impressions,
                SUM(COALESCE(conversions_1d_total, 0)) as amazon_ads_conversions,
                COUNT(DISTINCT campaign_id) as amazon_campaigns
              FROM `{PROJECT_ID}.amazon_ads_sharepoint.conversions_orders`
              WHERE date IS NOT NULL
              GROUP BY CAST(date AS DATE)
            )
            SELECT
              date,
              amazon_ads_spend,
              amazon_ads_clicks,
              amazon_ads_impressions,
              amazon_ads_conversions,
              amazon_campaigns,
              0.0 as google_ads_spend,
              0 as google_ads_clicks,
              0 as google_ads_impressions,
              amazon_ads_spend as total_spend,
              amazon_ads_clicks as total_clicks,
              amazon_ads_impressions as total_impressions,
              amazon_ads_conversions as total_conversions,
              CURRENT_TIMESTAMP() as created_at
            FROM amazon_daily
            ORDER BY date DESC
            """

            self.client.query(query).result()
            print("✅ MASTER.TOTAL_DAILY_ADS rebuilt successfully")
            return True

        except Exception as e:
            self.errors.append(f"Failed to rebuild MASTER ads: {str(e)}")
            print(f"❌ {self.errors[-1]}")
            return False

@functions_framework.http
def pipeline_auto_heal(request):
    """HTTP endpoint for pipeline auto-healing"""

    print(f"🚀 Pipeline Auto-Heal started at {datetime.now()}")

    try:
        healer = PipelineHealer()
        result = healer.diagnose_and_heal()

        print(f"\n📊 Diagnostics Summary:")
        print(f"   - Issues found: {result['issues_found']}")
        print(f"   - Fixes applied: {result['fixes_applied']}")
        print(f"   - Errors: {result['errors']}")

        # Determine status
        if result['errors'] > 0:
            result['status'] = 'error'
        elif result['issues_found'] > 0:
            if result['fixes_applied'] == result['issues_found']:
                result['status'] = 'healed'
            else:
                result['status'] = 'issues_detected'
        else:
            result['status'] = 'healthy'

        return result

    except Exception as e:
        print(f"❌ Fatal error: {str(e)}")
        return {
            'status': 'fatal_error',
            'timestamp': datetime.now().isoformat(),
            'error': str(e)
        }, 500

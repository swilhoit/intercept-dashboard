"""
Daily Diagnostics Logger Cloud Function
Runs diagnostics and logs results to BigQuery for historical tracking
"""
import json
import os
import requests
from datetime import datetime
from google.cloud import bigquery
import functions_framework

PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
DASHBOARD_URL = os.environ.get('DASHBOARD_URL', 'https://intercept-dashboard.vercel.app')

@functions_framework.http
def log_diagnostics(request):
    """
    HTTP Cloud Function to run and log pipeline diagnostics
    """
    print(f'Starting diagnostic logging at {datetime.now().isoformat()}')
    start_time = datetime.now()

    client = bigquery.Client(project=PROJECT_ID)

    try:
        # Fetch diagnostic data from the API endpoints
        print('Fetching pipeline diagnostics...')
        pipeline_response = requests.get(
            f'{DASHBOARD_URL}/api/diagnostics/pipeline',
            timeout=60
        )

        if pipeline_response.status_code != 200:
            raise Exception(f'Pipeline API returned {pipeline_response.status_code}: {pipeline_response.text}')

        pipeline_data = pipeline_response.json()

        print('Fetching scheduler diagnostics...')
        schedulers_response = requests.get(
            f'{DASHBOARD_URL}/api/diagnostics/schedulers',
            timeout=30
        )

        schedulers_data = schedulers_response.json() if schedulers_response.status_code == 200 else None

        # Calculate summary metrics
        sources = list(pipeline_data['sources'].values())
        master_tables = list(pipeline_data['masterTables'].values())

        data_sources_healthy = sum(1 for s in sources if s['status'] == 'healthy')
        data_sources_warning = sum(1 for s in sources if s['status'] == 'warning')
        data_sources_error = sum(1 for s in sources if s['status'] == 'error')
        master_tables_healthy = sum(1 for t in master_tables if t['status'] == 'healthy')

        consistency_checks_passed = sum(1 for c in pipeline_data['consistency']['checks'] if c['passed'])
        consistency_checks_failed = sum(1 for c in pipeline_data['consistency']['checks'] if not c['passed'])

        # Calculate revenue totals
        amazon_revenue = 0
        woocommerce_revenue = 0
        shopify_revenue = 0

        for source in sources:
            if source.get('metrics', {}).get('last7DaysRevenue'):
                revenue = source['metrics']['last7DaysRevenue']
                if 'Amazon' in source['name']:
                    amazon_revenue += revenue
                elif 'WooCommerce' in source['name']:
                    woocommerce_revenue += revenue
                elif 'Shopify' in source['name']:
                    shopify_revenue += revenue

        total_revenue = amazon_revenue + woocommerce_revenue + shopify_revenue

        # Collect all issues
        issues = []
        for source in sources:
            if source.get('issues'):
                for issue in source['issues']:
                    issues.append(f"{source['name']}: {issue}")

        for table in master_tables:
            if table.get('issues'):
                for issue in table['issues']:
                    issues.append(f"{table['name']}: {issue}")

        for check in pipeline_data['consistency']['checks']:
            if not check['passed']:
                issues.append(f"{check['name']}: {check['message']}")

        execution_time = (datetime.now() - start_time).total_seconds() * 1000

        # Prepare log entry
        log_entry = {
            'timestamp': datetime.now().isoformat(),
            'overall_status': pipeline_data['overallStatus'],
            'data_sources_healthy': data_sources_healthy,
            'data_sources_warning': data_sources_warning,
            'data_sources_error': data_sources_error,
            'master_tables_healthy': master_tables_healthy,
            'consistency_checks_passed': consistency_checks_passed,
            'consistency_checks_failed': consistency_checks_failed,
            'schedulers_active': schedulers_data.get('summary', {}).get('active', 0) if schedulers_data else 0,
            'schedulers_total': schedulers_data.get('summary', {}).get('total', 0) if schedulers_data else 0,
            'total_7day_revenue': round(total_revenue, 2),
            'amazon_7day_revenue': round(amazon_revenue, 2),
            'woocommerce_7day_revenue': round(woocommerce_revenue, 2),
            'shopify_7day_revenue': round(shopify_revenue, 2),
            'issues_detected': ' | '.join(issues) if issues else None,
            'diagnostic_details': json.dumps({
                'pipeline': pipeline_data,
                'schedulers': schedulers_data
            }),
            'execution_time_ms': int(execution_time)
        }

        # Insert into BigQuery
        table_ref = client.dataset('MASTER').table('diagnostic_logs')
        errors = client.insert_rows_json(table_ref, [log_entry])

        if errors:
            raise Exception(f'BigQuery insert errors: {errors}')

        print(f'Successfully logged diagnostics: {log_entry["overall_status"]} - {len(issues)} issues detected')
        print(f'Revenue (7-day): Amazon=${amazon_revenue:.2f}, WooCommerce=${woocommerce_revenue:.2f}, Shopify=${shopify_revenue:.2f}')

        return {
            'status': 'success',
            'timestamp': log_entry['timestamp'],
            'overall_status': log_entry['overall_status'],
            'data_sources_healthy': data_sources_healthy,
            'data_sources_total': len(sources),
            'consistency_checks_passed': consistency_checks_passed,
            'total_7day_revenue': total_revenue,
            'issues_count': len(issues),
            'execution_time_ms': int(execution_time),
            'message': f'Diagnostic log saved successfully - {log_entry["overall_status"]} status'
        }

    except Exception as e:
        print(f'Error logging diagnostics: {e}')
        return {
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }, 500

def hello_world(request):
    """HTTP Cloud Function entry point"""
    return log_diagnostics(request)

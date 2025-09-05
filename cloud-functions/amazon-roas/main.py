"""
Cloud Function to calculate and store Amazon ROAS/TACOS metrics
"""
import json
import os
from datetime import datetime, date, timedelta
from google.cloud import bigquery

# Get project ID from environment
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')

def calculate_amazon_roas(request):
    """
    Calculate ROAS and TACOS metrics for Amazon ads and sales data
    """
    try:
        client = bigquery.Client(project=PROJECT_ID)
        
        # Calculate daily ROAS/TACOS for the last 30 days
        roas_query = f"""
        WITH daily_ads AS (
          SELECT 
            DATE(date) as ad_date,
            SUM(cost) as daily_ad_spend,
            SUM(conversions_1d_total) as daily_conversions,
            SUM(conversions_1d_sku) as daily_sku_conversions
          FROM `{PROJECT_ID}.amazon_ads_sharepoint.keywords_enhanced`
          WHERE has_performance = TRUE
            AND DATE(date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          GROUP BY DATE(date)
        ),
        daily_sales AS (
          SELECT 
            DATE(Purchase_Date) as sale_date,
            SUM(Item_Price) as daily_revenue,
            COUNT(*) as daily_orders
          FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
          WHERE Purchase_Date IS NOT NULL
            AND DATE(Purchase_Date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          GROUP BY DATE(Purchase_Date)
        )
        SELECT 
          COALESCE(a.ad_date, s.sale_date) as date,
          COALESCE(a.daily_ad_spend, 0) as ad_spend,
          COALESCE(a.daily_conversions, 0) as conversions,
          COALESCE(s.daily_revenue, 0) as revenue,
          COALESCE(s.daily_orders, 0) as orders,
          -- ROAS calculation (Revenue / Ad Spend)
          ROUND(SAFE_DIVIDE(COALESCE(s.daily_revenue, 0), NULLIF(COALESCE(a.daily_ad_spend, 0), 0)), 2) as roas,
          -- TACOS calculation (Ad Spend / Revenue * 100)  
          ROUND(SAFE_DIVIDE(COALESCE(a.daily_ad_spend, 0) * 100, NULLIF(COALESCE(s.daily_revenue, 0), 0)), 2) as tacos_percent,
          -- Cost per conversion
          ROUND(SAFE_DIVIDE(COALESCE(a.daily_ad_spend, 0), NULLIF(COALESCE(a.daily_conversions, 0), 0)), 2) as cost_per_conversion
        FROM daily_ads a
        FULL OUTER JOIN daily_sales s ON a.ad_date = s.sale_date
        WHERE COALESCE(a.ad_date, s.sale_date) IS NOT NULL
        ORDER BY date DESC
        """
        
        # Execute the query
        job = client.query(roas_query)
        results = job.result()
        
        # Calculate summary metrics
        total_ad_spend = 0
        total_revenue = 0
        total_conversions = 0
        days_with_data = 0
        roas_values = []
        tacos_values = []
        
        for row in results:
            if row.ad_spend > 0 or row.revenue > 0:
                days_with_data += 1
                total_ad_spend += row.ad_spend or 0
                total_revenue += row.revenue or 0
                total_conversions += row.conversions or 0
                
                if row.roas and row.roas > 0:
                    roas_values.append(row.roas)
                if row.tacos_percent and row.tacos_percent > 0:
                    tacos_values.append(row.tacos_percent)
        
        # Calculate overall metrics
        overall_roas = round(total_revenue / total_ad_spend, 2) if total_ad_spend > 0 else 0
        overall_tacos = round((total_ad_spend / total_revenue) * 100, 2) if total_revenue > 0 else 0
        avg_roas = round(sum(roas_values) / len(roas_values), 2) if roas_values else 0
        avg_tacos = round(sum(tacos_values) / len(tacos_values), 2) if tacos_values else 0
        
        # Store results in a summary table (create if doesn't exist)
        summary_data = {
            'calculation_date': date.today().isoformat(),
            'period_days': 30,
            'total_ad_spend': round(total_ad_spend, 2),
            'total_revenue': round(total_revenue, 2),
            'total_conversions': int(total_conversions),
            'days_with_data': days_with_data,
            'overall_roas': overall_roas,
            'overall_tacos': overall_tacos,
            'avg_daily_roas': avg_roas,
            'avg_daily_tacos': avg_tacos,
            'cost_per_conversion': round(total_ad_spend / total_conversions, 2) if total_conversions > 0 else 0
        }
        
        # Insert into MASTER.AMAZON_ROAS_SUMMARY table (create if needed)
        create_table_query = f"""
        CREATE TABLE IF NOT EXISTS `{PROJECT_ID}.MASTER.AMAZON_ROAS_SUMMARY` (
          calculation_date DATE,
          period_days INT64,
          total_ad_spend FLOAT64,
          total_revenue FLOAT64,
          total_conversions INT64,
          days_with_data INT64,
          overall_roas FLOAT64,
          overall_tacos FLOAT64,
          avg_daily_roas FLOAT64,
          avg_daily_tacos FLOAT64,
          cost_per_conversion FLOAT64,
          created_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
        )
        """
        
        client.query(create_table_query).result()
        
        # Upsert the summary data
        upsert_query = f"""
        MERGE `{PROJECT_ID}.MASTER.AMAZON_ROAS_SUMMARY` T
        USING (
          SELECT 
            DATE('{summary_data['calculation_date']}') as calculation_date,
            {summary_data['period_days']} as period_days,
            {summary_data['total_ad_spend']} as total_ad_spend,
            {summary_data['total_revenue']} as total_revenue,
            {summary_data['total_conversions']} as total_conversions,
            {summary_data['days_with_data']} as days_with_data,
            {summary_data['overall_roas']} as overall_roas,
            {summary_data['overall_tacos']} as overall_tacos,
            {summary_data['avg_daily_roas']} as avg_daily_roas,
            {summary_data['avg_daily_tacos']} as avg_daily_tacos,
            {summary_data['cost_per_conversion']} as cost_per_conversion
        ) S
        ON T.calculation_date = S.calculation_date AND T.period_days = S.period_days
        WHEN MATCHED THEN
          UPDATE SET 
            total_ad_spend = S.total_ad_spend,
            total_revenue = S.total_revenue,
            total_conversions = S.total_conversions,
            days_with_data = S.days_with_data,
            overall_roas = S.overall_roas,
            overall_tacos = S.overall_tacos,
            avg_daily_roas = S.avg_daily_roas,
            avg_daily_tacos = S.avg_daily_tacos,
            cost_per_conversion = S.cost_per_conversion,
            created_timestamp = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
          INSERT (calculation_date, period_days, total_ad_spend, total_revenue, 
                  total_conversions, days_with_data, overall_roas, overall_tacos,
                  avg_daily_roas, avg_daily_tacos, cost_per_conversion, created_timestamp)
          VALUES (S.calculation_date, S.period_days, S.total_ad_spend, S.total_revenue,
                  S.total_conversions, S.days_with_data, S.overall_roas, S.overall_tacos,
                  S.avg_daily_roas, S.avg_daily_tacos, S.cost_per_conversion, CURRENT_TIMESTAMP())
        """
        
        client.query(upsert_query).result()
        
        result = {
            'timestamp': datetime.now().isoformat(),
            'status': 'success',
            'project_id': PROJECT_ID,
            'summary': summary_data,
            'message': f'Calculated ROAS/TACOS for {days_with_data} days with data'
        }
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        return json.dumps({
            'timestamp': datetime.now().isoformat(),
            'status': 'error',
            'error': str(e),
            'project_id': PROJECT_ID
        }, indent=2)

def hello_world(request):
    """HTTP Cloud Function entry point"""
    return calculate_amazon_roas(request)
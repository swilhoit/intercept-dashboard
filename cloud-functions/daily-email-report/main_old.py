#!/usr/bin/env python3
"""
Daily Email Report Cloud Function
Sends daily summary of sales data with data freshness checks
"""

import os
import json
import smtplib
from datetime import datetime, timedelta, date
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from google.cloud import bigquery
import functions_framework

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT_ID', 'intercept-sales-2508061117')
GMAIL_ADDRESS = os.environ.get('GMAIL_ADDRESS', 'samwilhoit@gmail.com')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
FROM_EMAIL = os.environ.get('FROM_EMAIL', 'samwilhoit@gmail.com')
TO_EMAIL = os.environ.get('TO_EMAIL', 'samwilhoit@gmail.com')

def check_data_freshness(client):
    """Check if data has been updated recently for each source"""
    freshness = {}
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Check Amazon data
    amazon_query = f"""
    SELECT MAX(
        CASE
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{5}}$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$') THEN DATE(Date)
            ELSE PARSE_DATE('%m/%e/%y', Date)
        END
    ) as last_date
    FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
    """
    result = list(client.query(amazon_query).result())[0]
    amazon_last = result.last_date
    freshness['amazon'] = {
        'last_date': str(amazon_last) if amazon_last else 'Never',
        'is_fresh': amazon_last >= yesterday if amazon_last else False,
        'days_old': (today - amazon_last).days if amazon_last else 999
    }

    # Check WooCommerce data
    woo_query = f"""
    SELECT MAX(order_date) as last_date
    FROM (
        SELECT order_date FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
        UNION ALL
        SELECT order_date FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
        UNION ALL
        SELECT order_date FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
        UNION ALL
        SELECT order_date FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales`
    )
    """
    result = list(client.query(woo_query).result())[0]
    woo_last = result.last_date
    freshness['woocommerce'] = {
        'last_date': str(woo_last) if woo_last else 'Never',
        'is_fresh': woo_last >= yesterday if woo_last else False,
        'days_old': (today - woo_last).days if woo_last else 999
    }

    # Check Shopify/WaterWise data
    try:
        shopify_query = f"""
        SELECT MAX(order_date) as last_date
        FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales`
        """
        result = list(client.query(shopify_query).result())[0]
        shopify_last = result.last_date
        freshness['shopify'] = {
            'last_date': str(shopify_last) if shopify_last else 'Never',
            'is_fresh': shopify_last >= yesterday if shopify_last else False,
            'days_old': (today - shopify_last).days if shopify_last else 999
        }
    except Exception as e:
        freshness['shopify'] = {
            'last_date': 'Error',
            'is_fresh': False,
            'days_old': 999,
            'error': str(e)
        }

    # Check MASTER table
    master_query = f"""
    SELECT MAX(date) as last_date
    FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
    """
    result = list(client.query(master_query).result())[0]
    master_last = result.last_date
    freshness['master'] = {
        'last_date': str(master_last) if master_last else 'Never',
        'is_fresh': master_last >= yesterday if master_last else False,
        'days_old': (today - master_last).days if master_last else 999
    }

    return freshness

def get_daily_summary(client):
    """Get summary statistics for yesterday and today"""
    today = date.today()
    yesterday = today - timedelta(days=1)
    week_ago = today - timedelta(days=7)

    # Get yesterday's performance
    summary_query = f"""
    WITH yesterday_data AS (
        SELECT
            SUM(total_sales) as total_revenue,
            SUM(amazon_sales) as amazon_revenue,
            SUM(woocommerce_sales) as woo_revenue,
            SUM(shopify_sales) as shopify_revenue
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date = '{yesterday}'
    ),
    last_7_days AS (
        SELECT
            AVG(total_sales) as avg_revenue,
            SUM(total_sales) as total_revenue_7d
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{week_ago}' AND date < '{today}'
    )
    SELECT * FROM yesterday_data, last_7_days
    """

    result = list(client.query(summary_query).result())[0]

    # Get order counts for yesterday
    orders_query = f"""
    WITH woo_orders AS (
        SELECT SUM(order_count) as orders FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
        WHERE order_date = '{yesterday}'
        UNION ALL
        SELECT SUM(order_count) as orders FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
        WHERE order_date = '{yesterday}'
        UNION ALL
        SELECT SUM(order_count) as orders FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
        WHERE order_date = '{yesterday}'
        UNION ALL
        SELECT SUM(order_count) as orders FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales`
        WHERE order_date = '{yesterday}'
    ),
    amazon_orders AS (
        SELECT COUNT(DISTINCT ASIN) as orders
        FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
        WHERE CASE
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{5}}$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$') THEN DATE(Date)
            ELSE PARSE_DATE('%m/%e/%y', Date)
        END = '{yesterday}'
    )
    SELECT
        (SELECT SUM(orders) FROM woo_orders) as woo_orders,
        (SELECT orders FROM amazon_orders) as amazon_orders
    """

    try:
        orders_result = list(client.query(orders_query).result())[0]
    except Exception as e:
        orders_result = {'woo_orders': 0, 'amazon_orders': 0}

    return {
        'yesterday': {
            'total_revenue': float(result.total_revenue or 0),
            'amazon_revenue': float(result.amazon_revenue or 0),
            'woo_revenue': float(result.woo_revenue or 0),
            'shopify_revenue': float(result.shopify_revenue or 0),
            'total_orders': int((orders_result.get('woo_orders') or 0) + (orders_result.get('amazon_orders') or 0)),
            'amazon_orders': int(orders_result.get('amazon_orders') or 0),
            'woo_orders': int(orders_result.get('woo_orders') or 0)
        },
        'last_7_days': {
            'avg_revenue': float(result.avg_revenue or 0),
            'total_revenue': float(result.total_revenue_7d or 0)
        }
    }

def format_html_email(freshness, summary):
    """Format HTML email with data summary"""
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Determine overall status
    all_fresh = all(source['is_fresh'] for source in freshness.values())
    status_emoji = "✅" if all_fresh else "⚠️"
    status_text = "All Data Current" if all_fresh else "Some Data Stale"

    # Format currency
    def fmt_curr(val):
        return f"${val:,.2f}"

    # Calculate changes
    yesterday_rev = summary['yesterday']['total_revenue']
    avg_rev = summary['last_7_days']['avg_revenue']
    vs_avg = ((yesterday_rev - avg_rev) / avg_rev * 100) if avg_rev > 0 else 0

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }}
            .header h1 {{ margin: 0; font-size: 28px; }}
            .header p {{ margin: 5px 0 0 0; opacity: 0.9; }}
            .status {{ background: {'#d4edda' if all_fresh else '#fff3cd'}; border-left: 4px solid {'#28a745' if all_fresh else '#ffc107'}; padding: 15px; margin-bottom: 20px; border-radius: 5px; }}
            .status h2 {{ margin: 0 0 10px 0; color: {'#155724' if all_fresh else '#856404'}; }}
            .metric-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }}
            .metric-card {{ background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; }}
            .metric-card h3 {{ margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; }}
            .metric-card .value {{ font-size: 28px; font-weight: bold; color: #333; }}
            .metric-card .subtext {{ font-size: 12px; color: #999; margin-top: 5px; }}
            .channel-breakdown {{ margin-bottom: 30px; }}
            .channel-row {{ display: flex; justify-content: space-between; padding: 12px; background: #fff; border-bottom: 1px solid #eee; }}
            .channel-row:hover {{ background: #f8f9fa; }}
            .channel-name {{ font-weight: 600; }}
            .channel-value {{ color: #667eea; font-weight: 600; }}
            .freshness-table {{ width: 100%; border-collapse: collapse; margin-bottom: 30px; background: white; }}
            .freshness-table th {{ background: #667eea; color: white; padding: 12px; text-align: left; }}
            .freshness-table td {{ padding: 12px; border-bottom: 1px solid #eee; }}
            .fresh {{ color: #28a745; font-weight: bold; }}
            .stale {{ color: #dc3545; font-weight: bold; }}
            .footer {{ text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #eee; margin-top: 30px; }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>{status_emoji} Daily Sales Report</h1>
            <p>{yesterday.strftime('%B %d, %Y')} Performance Summary</p>
        </div>

        <div class="status">
            <h2>{status_text}</h2>
            <p>Report generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</p>
        </div>

        <h2>💰 Yesterday's Performance</h2>
        <div class="metric-grid">
            <div class="metric-card">
                <h3>Total Revenue</h3>
                <div class="value">{fmt_curr(yesterday_rev)}</div>
                <div class="subtext">{vs_avg:+.1f}% vs 7-day avg</div>
            </div>
            <div class="metric-card">
                <h3>Total Orders</h3>
                <div class="value">{summary['yesterday']['total_orders']}</div>
                <div class="subtext">All channels combined</div>
            </div>
            <div class="metric-card">
                <h3>7-Day Average</h3>
                <div class="value">{fmt_curr(avg_rev)}</div>
                <div class="subtext">{fmt_curr(summary['last_7_days']['total_revenue'])} total</div>
            </div>
        </div>

        <h2>📊 Revenue by Channel</h2>
        <div class="channel-breakdown">
            <div class="channel-row">
                <span class="channel-name">🛒 Amazon</span>
                <span class="channel-value">{fmt_curr(summary['yesterday']['amazon_revenue'])} ({summary['yesterday']['amazon_orders']} orders)</span>
            </div>
            <div class="channel-row">
                <span class="channel-name">🏪 WooCommerce</span>
                <span class="channel-value">{fmt_curr(summary['yesterday']['woo_revenue'])} ({summary['yesterday']['woo_orders']} orders)</span>
            </div>
            <div class="channel-row">
                <span class="channel-name">🛍️ Shopify</span>
                <span class="channel-value">{fmt_curr(summary['yesterday']['shopify_revenue'])}</span>
            </div>
        </div>

        <h2>🔄 Data Freshness Status</h2>
        <table class="freshness-table">
            <thead>
                <tr>
                    <th>Data Source</th>
                    <th>Last Updated</th>
                    <th>Status</th>
                    <th>Age</th>
                </tr>
            </thead>
            <tbody>
    """

    # Add freshness rows
    source_names = {
        'amazon': '🛒 Amazon Orders',
        'woocommerce': '🏪 WooCommerce',
        'shopify': '🛍️ Shopify',
        'master': '📊 Master Table'
    }

    for source, data in freshness.items():
        status_class = 'fresh' if data['is_fresh'] else 'stale'
        status_text = '✅ Fresh' if data['is_fresh'] else f'⚠️ {data["days_old"]} days old'

        html += f"""
                <tr>
                    <td>{source_names.get(source, source.title())}</td>
                    <td>{data['last_date']}</td>
                    <td class="{status_class}">{status_text}</td>
                    <td>{data['days_old']} {'day' if data['days_old'] == 1 else 'days'}</td>
                </tr>
        """

    html += """
            </tbody>
        </table>

        <div class="footer">
            <p>🤖 Generated automatically by Intercept Sales Dashboard</p>
            <p>Cloud Functions • BigQuery • SendGrid</p>
        </div>
    </body>
    </html>
    """

    return html

def send_email(subject, html_content):
    """Send email via Gmail SMTP"""
    if not GMAIL_APP_PASSWORD:
        print("WARNING: No Gmail App Password configured")
        return {'status': 'skipped', 'message': 'No Gmail password'}

    try:
        # Create message
        message = MIMEMultipart('alternative')
        message['Subject'] = subject
        message['From'] = FROM_EMAIL
        message['To'] = TO_EMAIL

        # Add HTML content
        html_part = MIMEText(html_content, 'html')
        message.attach(html_part)

        # Connect to Gmail SMTP server
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.send_message(message)

        print(f"Email sent successfully via Gmail to {TO_EMAIL}")
        return {'status': 'success', 'provider': 'gmail'}

    except Exception as e:
        print(f"Error sending email: {e}")
        return {'status': 'error', 'error': str(e)}

@functions_framework.http
def daily_email_report(request):
    """HTTP Cloud Function to send daily email report"""

    print(f"Starting daily email report at {datetime.now()}")

    try:
        client = bigquery.Client(project=PROJECT_ID)

        # Check data freshness
        print("Checking data freshness...")
        freshness = check_data_freshness(client)

        # Get summary data
        print("Getting daily summary...")
        summary = get_daily_summary(client)

        # Format email
        print("Formatting email...")
        yesterday = date.today() - timedelta(days=1)
        all_fresh = all(source['is_fresh'] for source in freshness.values())
        status_emoji = "✅" if all_fresh else "⚠️"

        subject = f"{status_emoji} Sales Report - {yesterday.strftime('%b %d, %Y')} - ${summary['yesterday']['total_revenue']:,.2f}"
        html_content = format_html_email(freshness, summary)

        # Send email
        print(f"Sending email to {TO_EMAIL}...")
        email_result = send_email(subject, html_content)

        # Return response
        response = {
            'timestamp': datetime.now().isoformat(),
            'report_date': str(yesterday),
            'email_status': email_result,
            'summary': summary['yesterday'],
            'data_freshness': {k: v['is_fresh'] for k, v in freshness.items()}
        }

        print(f"Daily report completed: {json.dumps(response, indent=2)}")
        return response

    except Exception as e:
        error_response = {
            'timestamp': datetime.now().isoformat(),
            'status': 'error',
            'error': str(e)
        }
        print(f"Error: {json.dumps(error_response, indent=2)}")
        return error_response, 500

# Alias for deployment
send_daily_report = daily_email_report

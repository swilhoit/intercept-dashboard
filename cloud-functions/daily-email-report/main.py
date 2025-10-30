#!/usr/bin/env python3
"""
Daily Email Report Cloud Function - Enhanced Version
Sends comprehensive daily summary with top products, trends, and actionable insights
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
    """Get comprehensive summary statistics"""
    today = date.today()
    yesterday = today - timedelta(days=1)
    week_ago = today - timedelta(days=7)
    two_weeks_ago = today - timedelta(days=14)

    # Get yesterday's and previous periods' performance
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
            SUM(total_sales) as total_revenue_7d,
            MIN(total_sales) as min_revenue,
            MAX(total_sales) as max_revenue
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{week_ago}' AND date < '{today}'
    ),
    prev_7_days AS (
        SELECT
            SUM(total_sales) as total_revenue_prev_7d
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{two_weeks_ago}' AND date < '{week_ago}'
    ),
    last_30_days AS (
        SELECT
            AVG(total_sales) as avg_revenue_30d
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= DATE_SUB('{today}', INTERVAL 30 DAY) AND date < '{today}'
    )
    SELECT * FROM yesterday_data, last_7_days, prev_7_days, last_30_days
    """

    result = list(client.query(summary_query).result())[0]

    # Get order counts and AOV for yesterday
    orders_query = f"""
    WITH woo_orders AS (
        SELECT
            COALESCE(SUM(order_count), 0) as orders,
            COALESCE(SUM(total_revenue), 0) as revenue
        FROM (
            SELECT order_date, order_count, total_revenue FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales` WHERE order_date = '{yesterday}'
            UNION ALL
            SELECT order_date, order_count, total_revenue FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales` WHERE order_date = '{yesterday}'
            UNION ALL
            SELECT order_date, order_count, total_revenue FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales` WHERE order_date = '{yesterday}'
            UNION ALL
            SELECT order_date, order_count, total_revenue FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales` WHERE order_date = '{yesterday}'
        )
    ),
    amazon_orders AS (
        SELECT
            COUNT(*) as orders,
            SUM(Item_Price) as revenue
        FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
        WHERE CASE
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{5}}$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$') THEN DATE(Date)
            ELSE PARSE_DATE('%m/%e/%y', Date)
        END = '{yesterday}'
    )
    SELECT
        (SELECT orders FROM woo_orders) as woo_orders,
        (SELECT revenue FROM woo_orders) as woo_revenue_check,
        (SELECT orders FROM amazon_orders) as amazon_orders,
        (SELECT revenue FROM amazon_orders) as amazon_revenue_check
    """

    try:
        orders_result = list(client.query(orders_query).result())[0]
        total_orders = int((orders_result.get('woo_orders') or 0) + (orders_result.get('amazon_orders') or 0))
        amazon_orders = int(orders_result.get('amazon_orders') or 0)
        woo_orders = int(orders_result.get('woo_orders') or 0)
    except Exception as e:
        print(f"Error getting order counts: {e}")
        total_orders = 0
        amazon_orders = 0
        woo_orders = 0

    # Calculate AOV
    yesterday_rev = float(result.total_revenue or 0)
    aov = (yesterday_rev / total_orders) if total_orders > 0 else 0

    # Get Top Products from yesterday
    top_products = get_top_products(client, yesterday)

    # Get WooCommerce site breakdown
    woo_sites = get_woo_site_breakdown(client, yesterday)

    return {
        'yesterday': {
            'total_revenue': yesterday_rev,
            'amazon_revenue': float(result.amazon_revenue or 0),
            'woo_revenue': float(result.woo_revenue or 0),
            'shopify_revenue': float(result.shopify_revenue or 0),
            'total_orders': total_orders,
            'amazon_orders': amazon_orders,
            'woo_orders': woo_orders,
            'aov': aov
        },
        'last_7_days': {
            'avg_revenue': float(result.avg_revenue or 0),
            'total_revenue': float(result.total_revenue_7d or 0),
            'min_revenue': float(result.min_revenue or 0),
            'max_revenue': float(result.max_revenue or 0)
        },
        'prev_7_days': {
            'total_revenue': float(result.total_revenue_prev_7d or 0)
        },
        'last_30_days': {
            'avg_revenue': float(result.avg_revenue_30d or 0)
        },
        'top_products': top_products,
        'woo_sites': woo_sites
    }

def get_top_products(client, target_date):
    """Get top 5 selling products from yesterday"""
    query = f"""
    WITH all_products AS (
        -- Amazon products
        SELECT
            Product_Name as product,
            'Amazon' as channel,
            SUM(Item_Price) as revenue,
            COUNT(*) as quantity
        FROM `{PROJECT_ID}.amazon_seller.amazon_orders_2025`
        WHERE CASE
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{5}}$') THEN DATE_ADD('1899-12-30', INTERVAL CAST(Date AS INT64) DAY)
            WHEN REGEXP_CONTAINS(Date, r'^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$') THEN DATE(Date)
            ELSE PARSE_DATE('%m/%e/%y', Date)
        END = '{target_date}'
        GROUP BY Product_Name

        UNION ALL

        -- WooCommerce products
        SELECT
            product_name as product,
            'WooCommerce' as channel,
            SUM(total_revenue) as revenue,
            SUM(total_quantity_sold) as quantity
        FROM (
            SELECT * FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales` WHERE order_date = '{target_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales` WHERE order_date = '{target_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales` WHERE order_date = '{target_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales` WHERE order_date = '{target_date}'
        )
        GROUP BY product_name
    )
    SELECT
        product,
        channel,
        revenue,
        quantity
    FROM all_products
    ORDER BY revenue DESC
    LIMIT 5
    """

    try:
        results = list(client.query(query).result())
        return [
            {
                'product': row.product,
                'channel': row.channel,
                'revenue': float(row.revenue),
                'quantity': int(row.quantity)
            }
            for row in results
        ]
    except Exception as e:
        print(f"Error getting top products: {e}")
        return []

def get_woo_site_breakdown(client, target_date):
    """Get individual WooCommerce site performance"""
    query = f"""
    SELECT
        'BrickAnew' as site,
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(order_count), 0) as orders
    FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales`
    WHERE order_date = '{target_date}'

    UNION ALL

    SELECT
        'Heatilator' as site,
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(order_count), 0) as orders
    FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales`
    WHERE order_date = '{target_date}'

    UNION ALL

    SELECT
        'Superior' as site,
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(order_count), 0) as orders
    FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales`
    WHERE order_date = '{target_date}'

    UNION ALL

    SELECT
        'Majestic' as site,
        COALESCE(SUM(total_revenue), 0) as revenue,
        COALESCE(SUM(order_count), 0) as orders
    FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales`
    WHERE order_date = '{target_date}'
    """

    try:
        results = list(client.query(query).result())
        return [
            {
                'site': row.site,
                'revenue': float(row.revenue),
                'orders': int(row.orders)
            }
            for row in results
            if float(row.revenue) > 0  # Only show sites with sales
        ]
    except Exception as e:
        print(f"Error getting WooCommerce site breakdown: {e}")
        return []

def format_html_email(freshness, summary):
    """Format comprehensive HTML email with enhanced data"""
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
    avg_rev_7d = summary['last_7_days']['avg_revenue']
    avg_rev_30d = summary['last_30_days']['avg_revenue']
    prev_7d_total = summary['prev_7_days']['total_revenue']
    curr_7d_total = summary['last_7_days']['total_revenue']

    vs_7d_avg = ((yesterday_rev - avg_rev_7d) / avg_rev_7d * 100) if avg_rev_7d > 0 else 0
    vs_30d_avg = ((yesterday_rev - avg_rev_30d) / avg_rev_30d * 100) if avg_rev_30d > 0 else 0
    wow_change = ((curr_7d_total - prev_7d_total) / prev_7d_total * 100) if prev_7d_total > 0 else 0

    # Trend indicators
    def trend_indicator(val):
        if val > 5:
            return "📈 +"
        elif val < -5:
            return "📉 "
        else:
            return "➡️ "

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 0 auto; padding: 20px; background: #f5f5f5; }}
            .container {{ background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; }}
            .header h1 {{ margin: 0 0 10px 0; font-size: 32px; font-weight: 700; }}
            .header .date {{ font-size: 18px; opacity: 0.95; font-weight: 400; }}
            .content {{ padding: 30px; }}
            .status-banner {{ background: {'#d4edda' if all_fresh else '#fff3cd'}; border-left: 5px solid {'#28a745' if all_fresh else '#ffc107'}; padding: 18px 20px; margin-bottom: 30px; border-radius: 8px; }}
            .status-banner h2 {{ margin: 0 0 8px 0; color: {'#155724' if all_fresh else '#856404'}; font-size: 20px; }}
            .status-banner p {{ margin: 0; color: {'#155724' if all_fresh else '#856404'}; opacity: 0.9; }}

            .section-title {{ font-size: 22px; font-weight: 700; margin: 35px 0 20px 0; color: #2c3e50; border-bottom: 2px solid #667eea; padding-bottom: 10px; }}

            .metric-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 35px; }}
            .metric-card {{ background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 24px; border-radius: 10px; border-left: 5px solid #667eea; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }}
            .metric-card.highlight {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-left: 5px solid #fff; }}
            .metric-card h3 {{ margin: 0 0 12px 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }}
            .metric-card.highlight h3 {{ color: rgba(255,255,255,0.9); }}
            .metric-card .value {{ font-size: 32px; font-weight: 700; color: #2c3e50; margin-bottom: 8px; }}
            .metric-card.highlight .value {{ color: white; }}
            .metric-card .subtext {{ font-size: 14px; color: #666; }}
            .metric-card.highlight .subtext {{ color: rgba(255,255,255,0.85); }}
            .trend-up {{ color: #28a745; }}
            .trend-down {{ color: #dc3545; }}

            .channel-list {{ background: #f8f9fa; border-radius: 10px; padding: 5px; margin-bottom: 35px; }}
            .channel-row {{ display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: white; margin-bottom: 5px; border-radius: 8px; transition: all 0.2s; }}
            .channel-row:last-child {{ margin-bottom: 0; }}
            .channel-row:hover {{ background: #f1f3f5; transform: translateX(5px); }}
            .channel-name {{ font-weight: 600; font-size: 16px; color: #2c3e50; }}
            .channel-value {{ font-weight: 700; font-size: 16px; color: #667eea; }}
            .channel-details {{ font-size: 13px; color: #666; margin-left: 10px; }}

            .products-table {{ width: 100%; border-collapse: collapse; margin-bottom: 35px; background: white; border-radius: 10px; overflow: hidden; }}
            .products-table thead {{ background: #667eea; color: white; }}
            .products-table th {{ padding: 14px 16px; text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }}
            .products-table td {{ padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }}
            .products-table tr:last-child td {{ border-bottom: none; }}
            .products-table tr:hover {{ background: #f8f9fa; }}
            .product-name {{ font-weight: 600; color: #2c3e50; max-width: 300px; }}
            .channel-badge {{ display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; }}
            .badge-amazon {{ background: #ff9900; color: white; }}
            .badge-woo {{ background: #7952b3; color: white; }}

            .freshness-table {{ width: 100%; border-collapse: collapse; margin-bottom: 35px; background: white; border-radius: 10px; overflow: hidden; }}
            .freshness-table thead {{ background: #2c3e50; color: white; }}
            .freshness-table th {{ padding: 14px 16px; text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; }}
            .freshness-table td {{ padding: 14px 16px; border-bottom: 1px solid #f0f0f0; }}
            .freshness-table tr:last-child td {{ border-bottom: none; }}
            .fresh-status {{ color: #28a745; font-weight: 700; }}
            .stale-status {{ color: #dc3545; font-weight: 700; }}

            .insights-box {{ background: #fff3cd; border-left: 5px solid #ffc107; padding: 20px; border-radius: 8px; margin-bottom: 30px; }}
            .insights-box h3 {{ margin: 0 0 12px 0; color: #856404; font-size: 18px; }}
            .insights-box p {{ margin: 8px 0; color: #856404; line-height: 1.6; }}

            .footer {{ text-align: center; padding: 30px 20px; color: #999; font-size: 13px; border-top: 2px solid #f0f0f0; margin-top: 30px; }}
            .footer p {{ margin: 5px 0; }}
            .footer strong {{ color: #667eea; }}

            @media only screen and (max-width: 600px) {{
                .metric-grid {{ grid-template-columns: 1fr; }}
                .channel-row {{ flex-direction: column; align-items: flex-start; }}
                .channel-value {{ margin-top: 8px; }}
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>{status_emoji} Daily Sales Report</h1>
                <div class="date">{yesterday.strftime('%A, %B %d, %Y')}</div>
            </div>

            <div class="content">
                <div class="status-banner">
                    <h2>{status_text}</h2>
                    <p>Report generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p ET')}</p>
                </div>

                <div class="section-title">💰 Yesterday's Performance</div>
                <div class="metric-grid">
                    <div class="metric-card highlight">
                        <h3>Total Revenue</h3>
                        <div class="value">{fmt_curr(yesterday_rev)}</div>
                        <div class="subtext">{trend_indicator(vs_7d_avg)}{vs_7d_avg:+.1f}% vs 7-day avg</div>
                    </div>
                    <div class="metric-card">
                        <h3>Total Orders</h3>
                        <div class="value">{summary['yesterday']['total_orders']}</div>
                        <div class="subtext">All channels combined</div>
                    </div>
                    <div class="metric-card">
                        <h3>Average Order Value</h3>
                        <div class="value">{fmt_curr(summary['yesterday']['aov'])}</div>
                        <div class="subtext">Per order average</div>
                    </div>
                    <div class="metric-card">
                        <h3>7-Day Average</h3>
                        <div class="value">{fmt_curr(avg_rev_7d)}</div>
                        <div class="subtext">{fmt_curr(curr_7d_total)} total</div>
                    </div>
                </div>

                <div class="insights-box">
                    <h3>📊 Quick Insights</h3>
                    <p><strong>Week-over-Week:</strong> {trend_indicator(wow_change)}{wow_change:+.1f}% change in 7-day total revenue</p>
                    <p><strong>30-Day Comparison:</strong> Yesterday was {vs_30d_avg:+.1f}% vs 30-day average</p>
                    <p><strong>7-Day Range:</strong> {fmt_curr(summary['last_7_days']['min_revenue'])} (low) to {fmt_curr(summary['last_7_days']['max_revenue'])} (high)</p>
                </div>

                <div class="section-title">📊 Revenue by Channel</div>
                <div class="channel-list">
                    <div class="channel-row">
                        <div>
                            <span class="channel-name">🛒 Amazon</span>
                            <span class="channel-details">{summary['yesterday']['amazon_orders']} orders</span>
                        </div>
                        <div class="channel-value">{fmt_curr(summary['yesterday']['amazon_revenue'])}</div>
                    </div>
                    <div class="channel-row">
                        <div>
                            <span class="channel-name">🏪 WooCommerce</span>
                            <span class="channel-details">{summary['yesterday']['woo_orders']} orders</span>
                        </div>
                        <div class="channel-value">{fmt_curr(summary['yesterday']['woo_revenue'])}</div>
                    </div>
    """

    # Add WooCommerce site breakdown if there are sales
    if summary['woo_sites']:
        html += """
                    <div style="margin-left: 30px; padding-top: 10px;">
        """
        for site in summary['woo_sites']:
            html += f"""
                        <div class="channel-row" style="background: #f8f9fa; padding: 10px 15px;">
                            <div>
                                <span class="channel-name" style="font-size: 14px;">↳ {site['site']}</span>
                                <span class="channel-details">{site['orders']} orders</span>
                            </div>
                            <div class="channel-value" style="font-size: 14px;">{fmt_curr(site['revenue'])}</div>
                        </div>
            """
        html += """
                    </div>
        """

    html += f"""
                    <div class="channel-row">
                        <div>
                            <span class="channel-name">🛍️ Shopify (WaterWise)</span>
                        </div>
                        <div class="channel-value">{fmt_curr(summary['yesterday']['shopify_revenue'])}</div>
                    </div>
                </div>
    """

    # Add Top Products section if we have data
    if summary['top_products']:
        html += """
                <div class="section-title">🏆 Top 5 Products Yesterday</div>
                <table class="products-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Channel</th>
                            <th style="text-align: right;">Quantity</th>
                            <th style="text-align: right;">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
        """
        for product in summary['top_products']:
            badge_class = 'badge-amazon' if product['channel'] == 'Amazon' else 'badge-woo'
            html += f"""
                        <tr>
                            <td class="product-name">{product['product'][:60]}{'...' if len(product['product']) > 60 else ''}</td>
                            <td><span class="channel-badge {badge_class}">{product['channel']}</span></td>
                            <td style="text-align: right;">{product['quantity']}</td>
                            <td style="text-align: right; font-weight: 700;">{fmt_curr(product['revenue'])}</td>
                        </tr>
            """
        html += """
                    </tbody>
                </table>
        """

    # Data Freshness Table
    html += """
                <div class="section-title">🔄 Data Freshness Status</div>
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

    source_names = {
        'amazon': '🛒 Amazon Orders',
        'woocommerce': '🏪 WooCommerce',
        'shopify': '🛍️ Shopify',
        'master': '📊 Master Table'
    }

    for source, data in freshness.items():
        status_class = 'fresh-status' if data['is_fresh'] else 'stale-status'
        status_text = '✅ Fresh' if data['is_fresh'] else f'⚠️ Stale'

        html += f"""
                        <tr>
                            <td style="font-weight: 600;">{source_names.get(source, source.title())}</td>
                            <td>{data['last_date']}</td>
                            <td class="{status_class}">{status_text}</td>
                            <td>{data['days_old']} {'day' if data['days_old'] == 1 else 'days'} ago</td>
                        </tr>
        """

    html += f"""
                    </tbody>
                </table>

                <div class="footer">
                    <p><strong>🤖 Intercept Sales Dashboard</strong></p>
                    <p>Automated Daily Report • Cloud Functions • BigQuery • Gmail</p>
                    <p style="margin-top: 15px; color: #ccc;">Report ID: {datetime.now().strftime('%Y%m%d_%H%M%S')}</p>
                </div>
            </div>
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
    """HTTP Cloud Function to send comprehensive daily email report"""

    print(f"Starting enhanced daily email report at {datetime.now()}")

    try:
        client = bigquery.Client(project=PROJECT_ID)

        # Check data freshness
        print("Checking data freshness...")
        freshness = check_data_freshness(client)

        # Get comprehensive summary data
        print("Getting daily summary with top products...")
        summary = get_daily_summary(client)

        # Format email
        print("Formatting enhanced email...")
        yesterday = date.today() - timedelta(days=1)
        all_fresh = all(source['is_fresh'] for source in freshness.values())
        status_emoji = "✅" if all_fresh else "⚠️"

        subject = f"{status_emoji} Sales Report - {yesterday.strftime('%b %d')} - ${summary['yesterday']['total_revenue']:,.2f} ({summary['yesterday']['total_orders']} orders)"
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
            'data_freshness': {k: v['is_fresh'] for k, v in freshness.items()},
            'top_products_count': len(summary['top_products'])
        }

        print(f"Enhanced daily report completed: {json.dumps(response, indent=2)}")
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

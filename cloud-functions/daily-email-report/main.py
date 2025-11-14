#!/usr/bin/env python3
"""
Daily Email Report Cloud Function - Enhanced Version with Weekly/Monthly Tracking
Sends comprehensive summary with 2-column layout and minimal styling
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
        FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales_clean`
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
    """Get comprehensive summary statistics including weekly and monthly tracking"""
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Calculate rolling 7-day windows
    last_7_days_start = today - timedelta(days=7)  # Last 7 days
    prev_7_days_start = today - timedelta(days=14)  # Previous 7 days (8-14 days ago)
    prev_7_days_end = today - timedelta(days=8)

    # Calculate month boundaries
    current_month_start = today.replace(day=1)
    if current_month_start.month == 1:
        last_month_start = current_month_start.replace(year=current_month_start.year - 1, month=12)
    else:
        last_month_start = current_month_start.replace(month=current_month_start.month - 1)
    last_month_end = current_month_start - timedelta(days=1)

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
    last_7_days_data AS (
        SELECT
            SUM(total_sales) as total_revenue,
            SUM(amazon_sales) as amazon_revenue,
            SUM(woocommerce_sales) as woo_revenue,
            SUM(shopify_sales) as shopify_revenue,
            COUNT(DISTINCT date) as days_count
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{last_7_days_start}' AND date < '{today}'
    ),
    prev_7_days_data AS (
        SELECT
            SUM(total_sales) as total_revenue,
            SUM(amazon_sales) as amazon_revenue,
            SUM(woocommerce_sales) as woo_revenue,
            SUM(shopify_sales) as shopify_revenue
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{prev_7_days_start}' AND date <= '{prev_7_days_end}'
    ),
    current_month_data AS (
        SELECT
            SUM(total_sales) as total_revenue,
            SUM(amazon_sales) as amazon_revenue,
            SUM(woocommerce_sales) as woo_revenue,
            SUM(shopify_sales) as shopify_revenue,
            COUNT(DISTINCT date) as days_count
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{current_month_start}' AND date < '{today}'
    ),
    last_month_data AS (
        SELECT
            SUM(total_sales) as total_revenue,
            SUM(amazon_sales) as amazon_revenue,
            SUM(woocommerce_sales) as woo_revenue,
            SUM(shopify_sales) as shopify_revenue
        FROM `{PROJECT_ID}.MASTER.TOTAL_DAILY_SALES`
        WHERE date >= '{last_month_start}' AND date <= '{last_month_end}'
    )
    SELECT
        (SELECT total_revenue FROM yesterday_data) as yesterday_total_revenue,
        (SELECT amazon_revenue FROM yesterday_data) as yesterday_amazon_revenue,
        (SELECT woo_revenue FROM yesterday_data) as yesterday_woo_revenue,
        (SELECT shopify_revenue FROM yesterday_data) as yesterday_shopify_revenue,
        (SELECT total_revenue FROM last_7_days_data) as last_7_days_total,
        (SELECT amazon_revenue FROM last_7_days_data) as last_7_days_amazon,
        (SELECT woo_revenue FROM last_7_days_data) as last_7_days_woo,
        (SELECT shopify_revenue FROM last_7_days_data) as last_7_days_shopify,
        (SELECT days_count FROM last_7_days_data) as last_7_days_count,
        (SELECT total_revenue FROM prev_7_days_data) as prev_7_days_total,
        (SELECT amazon_revenue FROM prev_7_days_data) as prev_7_days_amazon,
        (SELECT woo_revenue FROM prev_7_days_data) as prev_7_days_woo,
        (SELECT shopify_revenue FROM prev_7_days_data) as prev_7_days_shopify,
        (SELECT total_revenue FROM current_month_data) as current_month_total,
        (SELECT amazon_revenue FROM current_month_data) as current_month_amazon,
        (SELECT woo_revenue FROM current_month_data) as current_month_woo,
        (SELECT shopify_revenue FROM current_month_data) as current_month_shopify,
        (SELECT days_count FROM current_month_data) as current_month_days,
        (SELECT total_revenue FROM last_month_data) as last_month_total,
        (SELECT amazon_revenue FROM last_month_data) as last_month_amazon,
        (SELECT woo_revenue FROM last_month_data) as last_month_woo,
        (SELECT shopify_revenue FROM last_month_data) as last_month_shopify
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
            UNION ALL
            SELECT order_date, order_count, total_revenue FROM `{PROJECT_ID}.woocommerce.waterwise_daily_product_sales` WHERE order_date = '{yesterday}'
        )
    ),
    shopify_orders AS (
        SELECT
            COALESCE(SUM(order_count), 0) as orders,
            COALESCE(SUM(total_revenue), 0) as revenue
        FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales_clean`
        WHERE order_date = '{yesterday}'
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
        (SELECT orders FROM shopify_orders) as shopify_orders,
        (SELECT revenue FROM shopify_orders) as shopify_revenue_check,
        (SELECT orders FROM amazon_orders) as amazon_orders,
        (SELECT revenue FROM amazon_orders) as amazon_revenue_check
    """

    try:
        orders_result = list(client.query(orders_query).result())[0]
        total_orders = int((orders_result.get('woo_orders') or 0) + (orders_result.get('shopify_orders') or 0) + (orders_result.get('amazon_orders') or 0))
        amazon_orders = int(orders_result.get('amazon_orders') or 0)
        woo_orders = int(orders_result.get('woo_orders') or 0)
        shopify_orders = int(orders_result.get('shopify_orders') or 0)
    except Exception as e:
        print(f"Error getting order counts: {e}")
        total_orders = 0
        amazon_orders = 0
        woo_orders = 0
        shopify_orders = 0

    # Calculate AOV
    yesterday_rev = float(result.yesterday_total_revenue or 0)
    aov = (yesterday_rev / total_orders) if total_orders > 0 else 0

    # Get Top Products from different periods
    top_products_yesterday = get_top_products(client, yesterday, yesterday)
    last_7_days_start = today - timedelta(days=7)
    top_products_week = get_top_products(client, last_7_days_start, yesterday)
    current_month_start = today.replace(day=1)
    top_products_month = get_top_products(client, current_month_start, yesterday)

    return {
        'yesterday': {
            'total_revenue': yesterday_rev,
            'amazon_revenue': float(result.yesterday_amazon_revenue or 0),
            'woo_revenue': float(result.yesterday_woo_revenue or 0),
            'shopify_revenue': float(result.yesterday_shopify_revenue or 0),
            'total_orders': total_orders,
            'amazon_orders': amazon_orders,
            'woo_orders': woo_orders,
            'shopify_orders': shopify_orders,
            'aov': aov
        },
        'last_7_days': {
            'total_revenue': float(result.last_7_days_total or 0),
            'amazon_revenue': float(result.last_7_days_amazon or 0),
            'woo_revenue': float(result.last_7_days_woo or 0),
            'shopify_revenue': float(result.last_7_days_shopify or 0),
            'days_count': int(result.last_7_days_count or 0)
        },
        'prev_7_days': {
            'total_revenue': float(result.prev_7_days_total or 0),
            'amazon_revenue': float(result.prev_7_days_amazon or 0),
            'woo_revenue': float(result.prev_7_days_woo or 0),
            'shopify_revenue': float(result.prev_7_days_shopify or 0)
        },
        'current_month': {
            'total_revenue': float(result.current_month_total or 0),
            'amazon_revenue': float(result.current_month_amazon or 0),
            'woo_revenue': float(result.current_month_woo or 0),
            'shopify_revenue': float(result.current_month_shopify or 0),
            'days_count': int(result.current_month_days or 0)
        },
        'last_month': {
            'total_revenue': float(result.last_month_total or 0),
            'amazon_revenue': float(result.last_month_amazon or 0),
            'woo_revenue': float(result.last_month_woo or 0),
            'shopify_revenue': float(result.last_month_shopify or 0)
        },
        'top_products_yesterday': top_products_yesterday,
        'top_products_week': top_products_week,
        'top_products_month': top_products_month
    }

def get_top_products(client, start_date, end_date):
    """Get top 5 selling products for a date range"""
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
        END BETWEEN '{start_date}' AND '{end_date}'
        GROUP BY Product_Name

        UNION ALL

        -- WooCommerce products
        SELECT
            product_name as product,
            'WooCommerce' as channel,
            SUM(total_revenue) as revenue,
            SUM(total_quantity_sold) as quantity
        FROM (
            SELECT * FROM `{PROJECT_ID}.woocommerce.brickanew_daily_product_sales` WHERE order_date BETWEEN '{start_date}' AND '{end_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.heatilator_daily_product_sales` WHERE order_date BETWEEN '{start_date}' AND '{end_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.superior_daily_product_sales` WHERE order_date BETWEEN '{start_date}' AND '{end_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.majestic_daily_product_sales` WHERE order_date BETWEEN '{start_date}' AND '{end_date}'
            UNION ALL
            SELECT * FROM `{PROJECT_ID}.woocommerce.waterwise_daily_product_sales` WHERE order_date BETWEEN '{start_date}' AND '{end_date}'
        )
        GROUP BY product_name

        UNION ALL

        -- Shopify products
        SELECT
            product_name as product,
            'Shopify' as channel,
            SUM(total_revenue) as revenue,
            SUM(total_quantity_sold) as quantity
        FROM `{PROJECT_ID}.shopify.waterwise_daily_product_sales_clean`
        WHERE order_date BETWEEN '{start_date}' AND '{end_date}'
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

def format_html_email(freshness, summary):
    """Format minimal HTML email with 2-column layout and weekly/monthly tracking"""
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Determine overall status
    all_fresh = all(source['is_fresh'] for source in freshness.values())
    status_emoji = "✅" if all_fresh else "⚠️"

    # Format helpers
    def fmt_curr(val):
        return f"${val:,.0f}"

    def fmt_pct(val):
        color = 'green' if val > 0 else 'red' if val < 0 else ''
        return f"<span class='{color}'>{val:+.0f}%</span>"

    # Calculate changes
    yesterday_rev = summary['yesterday']['total_revenue']
    last_7_days_rev = summary['last_7_days']['total_revenue']
    prev_7_days_rev = summary['prev_7_days']['total_revenue']
    current_month_rev = summary['current_month']['total_revenue']
    last_month_rev = summary['last_month']['total_revenue']

    wow_change = ((last_7_days_rev - prev_7_days_rev) / prev_7_days_rev * 100) if prev_7_days_rev > 0 else 0
    mom_change = ((current_month_rev - last_month_rev) / last_month_rev * 100) if last_month_rev > 0 else 0

    # Date formatting
    last_7_days_start = yesterday - timedelta(days=6)  # 7 days including yesterday
    prev_7_days_start = yesterday - timedelta(days=13)
    prev_7_days_end = yesterday - timedelta(days=7)
    current_month_name = today.strftime('%B')
    if today.month == 1:
        last_month_name = 'December'
    else:
        last_month_name = (today.replace(day=1) - timedelta(days=1)).strftime('%B')

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; line-height: 1.4; color: #333; max-width: 800px; margin: 0 auto; padding: 15px; background: #f8f8f8; }}
            .container {{ background: white; border-radius: 4px; overflow: hidden; }}
            .header {{ background: #667eea; color: white; padding: 20px; border-bottom: 3px solid #5568d3; }}
            .header h1 {{ margin: 0; font-size: 22px; }}
            .header p {{ margin: 5px 0 0 0; font-size: 14px; opacity: 0.9; }}
            .content {{ padding: 20px; }}
            .row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }}
            .col-full {{ grid-column: 1 / -1; }}
            .metric {{ background: #f8f9fa; padding: 12px; border-left: 3px solid #667eea; }}
            .metric h3 {{ margin: 0 0 5px 0; font-size: 11px; color: #666; text-transform: uppercase; }}
            .metric .val {{ font-size: 24px; font-weight: bold; color: #333; }}
            .metric .sub {{ font-size: 12px; color: #888; margin-top: 3px; }}
            .section-title {{ font-size: 14px; font-weight: bold; margin: 20px 0 10px 0; color: #667eea; text-transform: uppercase; border-bottom: 2px solid #667eea; padding-bottom: 5px; }}
            .table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
            .table th {{ background: #667eea; color: white; padding: 8px; text-align: left; font-size: 11px; }}
            .table td {{ padding: 8px; border-bottom: 1px solid #f0f0f0; }}
            .table tr:last-child td {{ border-bottom: none; }}
            .green {{ color: #28a745; }}
            .red {{ color: #dc3545; }}
            .footer {{ text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #f0f0f0; margin-top: 20px; }}
            @media only screen and (max-width: 600px) {{ .row {{ grid-template-columns: 1fr; }} }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>{status_emoji} Sales Report</h1>
                <p>{yesterday.strftime('%A, %B %d, %Y')}</p>
            </div>

            <div class="content">
                <!-- Yesterday's Performance -->
                <div class="section-title">Yesterday</div>
                <div class="row">
                    <div class="metric">
                        <h3>Total Revenue</h3>
                        <div class="val">{fmt_curr(yesterday_rev)}</div>
                        <div class="sub">{summary['yesterday']['total_orders']} orders</div>
                    </div>
                    <div class="metric">
                        <h3>Avg Order Value</h3>
                        <div class="val">{fmt_curr(summary['yesterday']['aov'])}</div>
                        <div class="sub">Per order</div>
                    </div>
                </div>

                <!-- Weekly Tracking -->
                <div class="section-title">Last 7 Days ({last_7_days_start.strftime('%b %d')} - {yesterday.strftime('%b %d')})</div>
                <div class="row">
                    <div class="metric">
                        <h3>Last 7 Days</h3>
                        <div class="val">{fmt_curr(last_7_days_rev)}</div>
                        <div class="sub">{summary['last_7_days']['days_count']} days</div>
                    </div>
                    <div class="metric">
                        <h3>Previous 7 Days</h3>
                        <div class="val">{fmt_curr(prev_7_days_rev)}</div>
                        <div class="sub">{fmt_pct(wow_change)} change</div>
                    </div>
                </div>

                <!-- Channel Breakdown (Week) -->
                <div class="row">
                    <div class="metric">
                        <h3>🛒 Amazon (7d)</h3>
                        <div class="val">{fmt_curr(summary['last_7_days']['amazon_revenue'])}</div>
                    </div>
                    <div class="metric">
                        <h3>🏪 WooCommerce (7d)</h3>
                        <div class="val">{fmt_curr(summary['last_7_days']['woo_revenue'])}</div>
                    </div>
                </div>
                <div class="row">
                    <div class="metric">
                        <h3>🛍️ Shopify (7d)</h3>
                        <div class="val">{fmt_curr(summary['last_7_days']['shopify_revenue'])}</div>
                        <div class="sub">WaterWise</div>
                    </div>
                    <div class="metric">
                        <h3>Yesterday Breakdown</h3>
                        <div class="val">{summary['yesterday']['amazon_orders'] + summary['yesterday']['woo_orders'] + summary['yesterday']['shopify_orders']} orders</div>
                        <div class="sub">AMZ: {summary['yesterday']['amazon_orders']}, WC: {summary['yesterday']['woo_orders']}, SP: {summary['yesterday']['shopify_orders']}</div>
                    </div>
                </div>

                <!-- Monthly Tracking -->
                <div class="section-title">{current_month_name} (Month-to-Date)</div>
                <div class="row">
                    <div class="metric">
                        <h3>This Month</h3>
                        <div class="val">{fmt_curr(current_month_rev)}</div>
                        <div class="sub">{summary['current_month']['days_count']} days tracked</div>
                    </div>
                    <div class="metric">
                        <h3>vs {last_month_name}</h3>
                        <div class="val">{fmt_curr(last_month_rev)}</div>
                        <div class="sub">{fmt_pct(mom_change)} change</div>
                    </div>
                </div>

                <!-- Channel Breakdown (Month) -->
                <div class="row">
                    <div class="metric">
                        <h3>🛒 Amazon (Month)</h3>
                        <div class="val">{fmt_curr(summary['current_month']['amazon_revenue'])}</div>
                    </div>
                    <div class="metric">
                        <h3>🏪 WooCommerce (Month)</h3>
                        <div class="val">{fmt_curr(summary['current_month']['woo_revenue'])}</div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-full metric">
                        <h3>🛍️ Shopify (Month)</h3>
                        <div class="val">{fmt_curr(summary['current_month']['shopify_revenue'])}</div>
                        <div class="sub">WaterWise total for {current_month_name}</div>
                    </div>
                </div>

                <!-- Top Products Yesterday -->
                {_format_top_products_table(summary['top_products_yesterday'], 'Top Products Yesterday')}

                <!-- Top Products Last 7 Days -->
                {_format_top_products_table(summary['top_products_week'], 'Top Products Last 7 Days')}

                <!-- Data Freshness -->
                <div class="section-title">Data Freshness</div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Last Updated</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
    """

    # Data freshness rows
    source_names = {
        'amazon': '🛒 Amazon',
        'woocommerce': '🏪 WooCommerce',
        'shopify': '🛍️ Shopify',
        'master': '📊 Master'
    }

    for source, data in freshness.items():
        status_class = 'green' if data['is_fresh'] else 'red'
        status_text = '✅' if data['is_fresh'] else f"⚠️ {data['days_old']}d old"

        html += f"""
                        <tr>
                            <td>{source_names.get(source, source.title())}</td>
                            <td>{data['last_date']}</td>
                            <td class="{status_class}">{status_text}</td>
                        </tr>
        """

    html += f"""
                    </tbody>
                </table>

                <div class="footer">
                    <p>🤖 Intercept Sales Dashboard • {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """

    return html

def _format_top_products_table(products, title):
    """Helper to format top products table"""
    if not products:
        return ""

    def fmt_curr(val):
        return f"${val:,.0f}"

    html = f"""
                <div class="section-title">{title}</div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Channel</th>
                            <th style="text-align: right;">Qty</th>
                            <th style="text-align: right;">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
    """

    for product in products:
        product_name = product['product'][:50] + ('...' if len(product['product']) > 50 else '')
        html += f"""
                        <tr>
                            <td>{product_name}</td>
                            <td>{product['channel']}</td>
                            <td style="text-align: right;">{product['quantity']}</td>
                            <td style="text-align: right;">{fmt_curr(product['revenue'])}</td>
                        </tr>
        """

    html += """
                    </tbody>
                </table>
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
        print("Getting daily/weekly/monthly summary...")
        summary = get_daily_summary(client)

        # Format email
        print("Formatting minimal 2-column email...")
        yesterday = date.today() - timedelta(days=1)
        all_fresh = all(source['is_fresh'] for source in freshness.values())
        status_emoji = "✅" if all_fresh else "⚠️"

        subject = f"{status_emoji} Sales {yesterday.strftime('%b %d')} - {summary['yesterday']['total_revenue']:,.0f} ({summary['yesterday']['total_orders']} orders)"
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
            'last_7_days': summary['last_7_days'],
            'monthly': summary['current_month'],
            'data_freshness': {k: v['is_fresh'] for k, v in freshness.items()},
            'top_products_count': len(summary['top_products_yesterday'])
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

import { NextRequest, NextResponse } from 'next/server';

interface E2ECheck {
  name: string;
  layer: 'source' | 'api' | 'integration';
  status: 'healthy' | 'warning' | 'error';
  message: string;
  responseTime?: number;
  dataReturned?: boolean;
  recordCount?: number;
  endpoint?: string;
  errors?: string[];
}

interface E2EResult {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  checks: E2ECheck[];
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    errors: number;
    avgResponseTime: number;
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const checks: E2ECheck[] = [];

  const baseUrl = request.headers.get('host') || 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  // Define critical API endpoints to test
  const apiEndpoints = [
    {
      name: 'Sales Summary API',
      path: '/api/sales/summary',
      layer: 'api' as const,
      dataPath: 'sales', // Path to data in response
      minRecords: 1,
      requiredFields: ['totalSales', 'amazonSales', 'woocommerceSales', 'shopifySales']
    },
    {
      name: 'Daily Sales API',
      path: '/api/sales/daily',
      layer: 'api' as const,
      dataPath: 'sales',
      minRecords: 7, // Should have at least 7 days of data
      requiredFields: ['date', 'total_sales']
    },
    {
      name: 'Product Breakdown API',
      path: '/api/sales/product-breakdown',
      layer: 'api' as const,
      dataPath: 'products',
      minRecords: 1,
      requiredFields: ['product_name', 'total_revenue']
    },
    {
      name: 'Amazon Ads Campaigns API',
      path: '/api/ads/campaigns',
      layer: 'api' as const,
      dataPath: 'campaigns',
      minRecords: 1,
      requiredFields: ['name', 'spend', 'clicks', 'impressions']
    },
    {
      name: 'Amazon Ads Master Metrics API',
      path: '/api/ads/master-metrics',
      layer: 'api' as const,
      dataPath: 'metrics',
      minRecords: 7,
      requiredFields: ['date', 'spend']
    },
    {
      name: 'GA4 Traffic Analytics API',
      path: '/api/analytics/traffic',
      layer: 'api' as const,
      dataPath: 'summary',
      minRecords: 1,
      requiredFields: ['total_sessions', 'total_users']
    },
    {
      name: 'WooCommerce Sites API',
      path: '/api/sites/woocommerce',
      layer: 'api' as const,
      dataPath: 'sites',
      minRecords: 1,
      requiredFields: ['name', 'total_revenue']
    }
  ];

  // Test each API endpoint
  for (const endpoint of apiEndpoints) {
    const checkStartTime = Date.now();
    const check: E2ECheck = {
      name: endpoint.name,
      layer: endpoint.layer,
      status: 'healthy',
      message: '',
      endpoint: endpoint.path,
      errors: []
    };

    try {
      // Call the API
      const response = await fetch(`${protocol}://${baseUrl}${endpoint.path}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      check.responseTime = Date.now() - checkStartTime;

      if (!response.ok) {
        check.status = 'error';
        check.message = `API returned ${response.status} ${response.statusText}`;
        check.dataReturned = false;
        checks.push(check);
        continue;
      }

      // Parse response
      const data = await response.json();
      check.dataReturned = true;

      // Navigate to data path
      let dataArray = data;
      if (endpoint.dataPath) {
        const pathParts = endpoint.dataPath.split('.');
        for (const part of pathParts) {
          dataArray = dataArray[part];
          if (!dataArray) break;
        }
      }

      // Check if data exists
      if (!dataArray) {
        check.status = 'error';
        check.message = `No data found at path '${endpoint.dataPath}'`;
        check.recordCount = 0;
        checks.push(check);
        continue;
      }

      // Get record count
      const records = Array.isArray(dataArray) ? dataArray : [dataArray];
      check.recordCount = records.length;

      // Check minimum records
      if (check.recordCount < endpoint.minRecords) {
        check.status = 'warning';
        check.message = `Only ${check.recordCount} records found, expected at least ${endpoint.minRecords}`;
      }

      // Validate required fields
      if (records.length > 0) {
        const firstRecord = records[0];
        const missingFields = endpoint.requiredFields.filter(
          field => !(field in firstRecord) || firstRecord[field] === null || firstRecord[field] === undefined
        );

        if (missingFields.length > 0) {
          check.status = 'warning';
          check.errors?.push(`Missing fields: ${missingFields.join(', ')}`);
        }
      }

      // Success message
      if (check.status === 'healthy') {
        check.message = `✓ Returned ${check.recordCount} records in ${check.responseTime}ms`;
      } else if (check.errors && check.errors.length > 0) {
        check.message += ` | ${check.errors.join(' | ')}`;
      }

    } catch (error: any) {
      check.status = 'error';
      check.message = `Failed to call API: ${error.message}`;
      check.dataReturned = false;
      check.responseTime = Date.now() - checkStartTime;
    }

    checks.push(check);
  }

  // Integration checks - verify data flow
  const integrationChecks: E2ECheck[] = [];

  // Check 1: Verify Amazon Ads data flows to dashboard
  try {
    const [campaignsRes, metricsRes] = await Promise.all([
      fetch(`${protocol}://${baseUrl}/api/ads/campaigns`),
      fetch(`${protocol}://${baseUrl}/api/ads/master-metrics`)
    ]);

    const hasCampaigns = campaignsRes.ok && (await campaignsRes.json()).campaigns?.length > 0;
    const hasMetrics = metricsRes.ok && (await metricsRes.json()).metrics?.length > 0;

    integrationChecks.push({
      name: 'Amazon Ads Data Flow',
      layer: 'integration',
      status: hasCampaigns && hasMetrics ? 'healthy' : 'error',
      message: hasCampaigns && hasMetrics
        ? '✓ Amazon Ads data flows from BigQuery → API → Dashboard'
        : '⚠️ Amazon Ads data incomplete or missing',
      dataReturned: hasCampaigns && hasMetrics
    });
  } catch (error: any) {
    integrationChecks.push({
      name: 'Amazon Ads Data Flow',
      layer: 'integration',
      status: 'error',
      message: `Failed to verify data flow: ${error.message}`,
      dataReturned: false
    });
  }

  // Check 2: Verify Sales data flows to dashboard
  try {
    const [dailyRes, summaryRes, productRes] = await Promise.all([
      fetch(`${protocol}://${baseUrl}/api/sales/daily`),
      fetch(`${protocol}://${baseUrl}/api/sales/summary`),
      fetch(`${protocol}://${baseUrl}/api/sales/product-breakdown`)
    ]);

    const hasDaily = dailyRes.ok && (await dailyRes.json()).sales?.length > 0;
    const hasSummary = summaryRes.ok && (await summaryRes.json()).totalSales > 0;
    const hasProducts = productRes.ok && (await productRes.json()).products?.length > 0;

    integrationChecks.push({
      name: 'Sales Data Flow',
      layer: 'integration',
      status: hasDaily && hasSummary && hasProducts ? 'healthy' : 'warning',
      message: hasDaily && hasSummary && hasProducts
        ? '✓ Sales data flows from BigQuery → API → Dashboard'
        : '⚠️ Some sales endpoints missing data',
      dataReturned: hasDaily || hasSummary || hasProducts
    });
  } catch (error: any) {
    integrationChecks.push({
      name: 'Sales Data Flow',
      layer: 'integration',
      status: 'error',
      message: `Failed to verify data flow: ${error.message}`,
      dataReturned: false
    });
  }

  // Check 3: Verify GA4 data flows to dashboard
  try {
    const trafficRes = await fetch(`${protocol}://${baseUrl}/api/analytics/traffic`);
    const hasTraffic = trafficRes.ok && (await trafficRes.json()).summary?.total_sessions > 0;

    integrationChecks.push({
      name: 'GA4 Analytics Data Flow',
      layer: 'integration',
      status: hasTraffic ? 'healthy' : 'warning',
      message: hasTraffic
        ? '✓ GA4 data flows from BigQuery → API → Dashboard'
        : '⚠️ GA4 analytics data missing or zero sessions',
      dataReturned: hasTraffic
    });
  } catch (error: any) {
    integrationChecks.push({
      name: 'GA4 Analytics Data Flow',
      layer: 'integration',
      status: 'error',
      message: `Failed to verify data flow: ${error.message}`,
      dataReturned: false
    });
  }

  // Add integration checks to main checks array
  checks.push(...integrationChecks);

  // Calculate summary
  const passed = checks.filter(c => c.status === 'healthy').length;
  const warnings = checks.filter(c => c.status === 'warning').length;
  const errors = checks.filter(c => c.status === 'error').length;

  const responseTimes = checks
    .filter(c => c.responseTime !== undefined)
    .map(c => c.responseTime!);
  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : 0;

  const result: E2EResult = {
    timestamp: new Date().toISOString(),
    overallStatus: errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'healthy',
    checks,
    summary: {
      totalChecks: checks.length,
      passed,
      warnings,
      errors,
      avgResponseTime
    }
  };

  return NextResponse.json(result);
}

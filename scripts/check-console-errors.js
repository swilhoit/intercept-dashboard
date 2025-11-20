const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting Playwright browser console check...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages
  const consoleLogs = [];
  const consoleErrors = [];

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();

    const logEntry = {
      type,
      text,
      url: location.url,
      lineNumber: location.lineNumber
    };

    if (type === 'error') {
      consoleErrors.push(logEntry);
      console.log(`❌ Console Error: ${text}`);
      if (location.url) {
        console.log(`   at ${location.url}:${location.lineNumber}`);
      }
    } else if (type === 'warning') {
      consoleLogs.push(logEntry);
      console.log(`⚠️  Console Warning: ${text}`);
    } else if (type === 'log' && (text.includes('WooCommerce') || text.includes('Channel') || text.includes('Revenue'))) {
      consoleLogs.push(logEntry);
      console.log(`📝 Console Log: ${text}`);
    }
  });

  // Listen for page errors
  page.on('pageerror', error => {
    console.log(`🔴 Page Error: ${error.message}`);
    consoleErrors.push({ type: 'pageerror', text: error.message });
  });

  // Listen for request failures
  page.on('requestfailed', request => {
    console.log(`🔴 Request Failed: ${request.url()} - ${request.failure().errorText}`);
    consoleErrors.push({
      type: 'requestfailed',
      text: `${request.url()} - ${request.failure().errorText}`
    });
  });

  console.log('\n📍 Navigating to dashboard...');

  try {
    // Navigate to the dashboard
    await page.goto('http://localhost:3100', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('✅ Page loaded successfully');

    // Wait for dashboard to render
    await page.waitForTimeout(3000);

    // Check for specific dashboard elements
    const hasChannelBreakdown = await page.locator('text=/Channel Breakdown/i').isVisible();
    const hasStatsCards = await page.locator('[class*="stats"]').first().isVisible();

    console.log(`\n📊 Dashboard Status:`);
    console.log(`   Channel Breakdown visible: ${hasChannelBreakdown ? '✅' : '❌'}`);
    console.log(`   Stats Cards visible: ${hasStatsCards ? '✅' : '❌'}`);

    // Execute JavaScript in the page context to check data
    const dashboardData = await page.evaluate(() => {
      // Try to find React props or data attributes
      const channelElements = document.querySelectorAll('[data-testid*="channel"], [class*="channel"]');
      const data = {};

      // Look for any text containing dollar amounts
      const dollarAmounts = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.textContent && el.textContent.match(/\$[\d,]+(\.\d{2})?/) && el.children.length === 0) {
          dollarAmounts.push(el.textContent.trim());
        }
      });

      // Check for WooCommerce specific text
      const wooElements = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.textContent && el.textContent.includes('WooCommerce') && el.children.length === 0) {
          wooElements.push({
            text: el.textContent.trim(),
            className: el.className
          });
        }
      });

      return {
        dollarAmounts: dollarAmounts.slice(0, 10), // First 10 dollar amounts
        wooCommerceElements: wooElements.slice(0, 5), // First 5 WooCommerce mentions
        title: document.title,
        url: window.location.href
      };
    });

    console.log('\n📈 Dashboard Data Found:');
    console.log('   Page Title:', dashboardData.title);
    console.log('   URL:', dashboardData.url);
    console.log('   Dollar Amounts Found:', dashboardData.dollarAmounts);
    console.log('   WooCommerce Elements:', dashboardData.wooCommerceElements);

    // Try to interact with date range selector
    console.log('\n📅 Checking date range selector...');
    const dateRangeButton = await page.locator('button:has-text("Last 7 days"), button:has-text("Date range")').first();
    if (await dateRangeButton.isVisible()) {
      const dateRangeText = await dateRangeButton.textContent();
      console.log(`   Current date range: ${dateRangeText}`);
    }

    // Check API calls
    console.log('\n🔌 Checking API calls...');
    const apiCalls = [];
    page.on('response', response => {
      if (response.url().includes('/api/')) {
        apiCalls.push({
          url: response.url(),
          status: response.status(),
          ok: response.ok()
        });
      }
    });

    // Reload to capture API calls
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('   API Calls Made:');
    apiCalls.forEach(call => {
      const status = call.ok ? '✅' : '❌';
      console.log(`   ${status} ${call.url.replace('http://localhost:3100', '')} - Status: ${call.status}`);
    });

  } catch (error) {
    console.log(`❌ Navigation error: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Console Error Summary:');
  if (consoleErrors.length === 0) {
    console.log('   ✅ No console errors detected!');
  } else {
    console.log(`   ❌ Found ${consoleErrors.length} console errors:`);
    consoleErrors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error.text}`);
    });
  }
  console.log('='.repeat(60));

  await browser.close();
  console.log('\n✨ Browser check completed');
})();
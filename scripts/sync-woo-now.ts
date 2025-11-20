#!/usr/bin/env npx tsx

/**
 * Manual sync trigger for WooCommerce data
 * Usage: GOOGLE_CLOUD_PROJECT_ID=intercept-sales-2508061117 npx tsx sync-woo-now.ts
 */

import { execSync } from 'child_process';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'intercept-sales-2508061117';
const FUNCTION_NAME = 'ecommerce-daily-sync';
const REGION = 'us-central1';

async function triggerSync() {
  console.log('🚀 Triggering ecommerce data sync...');
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Function: ${FUNCTION_NAME}`);
  
  try {
    // Trigger the cloud function
    const cmd = `gcloud functions call ${FUNCTION_NAME} --region=${REGION} --project=${PROJECT_ID}`;
    
    console.log('⏳ Calling cloud function...');
    const result = execSync(cmd, { encoding: 'utf-8' });
    
    console.log('✅ Sync completed successfully');
    console.log('📋 Function response:');
    console.log(result);
    
    // Parse and display the JSON response if possible
    try {
      const response = JSON.parse(result);
      console.log('\\n📊 Sync Results:');
      console.log(`   Timestamp: ${response.timestamp}`);
      console.log(`   Project ID: ${response.project_id}`);
      
      if (response.shopify) {
        console.log(`   Shopify: ${response.shopify.status} - ${response.shopify.message}`);
      }
      if (response.woocommerce) {
        console.log(`   WooCommerce: ${response.woocommerce.status} - ${response.woocommerce.message}`);
      }
      if (response.amazon) {
        console.log(`   Amazon: ${response.amazon.status} - ${response.amazon.message}`);
      }
      if (response.summary_update) {
        console.log(`   Summary Update: ${response.summary_update.status} - ${response.summary_update.message}`);
      }
      
    } catch (parseError) {
      // Response is not JSON, just show raw output
      console.log('Raw response (not JSON):');
      console.log(result);
    }
    
  } catch (error: any) {
    console.error('❌ Sync failed:');
    console.error(error.message);
    
    if (error.message.includes('not found')) {
      console.error('\\n💡 Possible solutions:');
      console.error('   1. Deploy the cloud function first');
      console.error('   2. Check the function name and region');
      console.error('   3. Verify gcloud authentication');
    }
    
    process.exit(1);
  }
}

async function checkStatus() {
  console.log('🔍 Checking cloud function status...');
  
  try {
    const cmd = `gcloud functions describe ${FUNCTION_NAME} --region=${REGION} --project=${PROJECT_ID} --format="value(status,updateTime)"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    const [status, updateTime] = result.trim().split('\\t');
    
    console.log(`   Status: ${status}`);
    console.log(`   Last Updated: ${updateTime}`);
    
    if (status !== 'ACTIVE') {
      console.log('⚠️  Function is not active - may need deployment');
    }
    
  } catch (error: any) {
    console.error('❌ Could not check function status:');
    console.error(error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'sync';
  
  switch (command) {
    case 'status':
      await checkStatus();
      break;
    case 'sync':
    default:
      await checkStatus();
      console.log('');
      await triggerSync();
      break;
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { triggerSync, checkStatus };
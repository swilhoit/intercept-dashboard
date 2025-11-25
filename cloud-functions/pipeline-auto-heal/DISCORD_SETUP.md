# Discord Webhook Setup Guide

## Step 1: Create Discord Webhook

1. Go to your Discord server
2. Navigate to the **business** channel (ID: `1442965069909725367`)
3. Click the gear icon ⚙️ (Edit Channel)
4. Go to **Integrations** → **Webhooks**
5. Click **New Webhook**
6. Name it: `Pipeline Monitor`
7. Select channel: **business**
8. Click **Copy Webhook URL**

Your webhook URL will look like:
```
https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN
```

## Step 2: Deploy with Webhook URL

Run this command (replace `YOUR_WEBHOOK_URL` with the copied URL):

```bash
cd cloud-functions/pipeline-auto-heal

gcloud functions deploy pipeline-auto-heal \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=pipeline_auto_heal \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT_ID=intercept-sales-2508061117,DISCORD_WEBHOOK_URL="YOUR_WEBHOOK_URL" \
  --timeout=540s \
  --memory=512MB
```

## Step 3: Test

```bash
curl -X POST https://us-central1-intercept-sales-2508061117.cloudfunctions.net/pipeline-auto-heal
```

You should see a notification in your Discord business channel!

## What You'll Receive

### ✅ Healthy Status
- **Green** embed
- Summary of checks passed
- Sent daily at 6 AM ET

### 🔧 Issues Auto-Healed
- **Orange** embed
- List of issues found
- List of fixes applied
- Sent when auto-healing occurs

### ⚠️ Issues Detected
- **Red** embed
- Issues that couldn't be auto-fixed
- Requires manual intervention

### 🚨 Critical Errors
- **Dark Red** embed
- System failures
- Immediate attention needed

## Notification Format

```
┌──────────────────────────────────────┐
│ 🔧 Pipeline Diagnostics Report      │
├──────────────────────────────────────┤
│ Status: Healed                       │
│ 🔍 Issues Found: 2                   │
│ 🔧 Fixes Applied: 2                  │
│ ❌ Errors: 0                         │
├──────────────────────────────────────┤
│ Issues Detected:                     │
│ ⚠️ keywords_enhanced 3 days old     │
│ ⚠️ Ad spend variance 2.1%           │
├──────────────────────────────────────┤
│ Auto-Healing Actions:                │
│ ✅ Rebuilt Keywords Enhanced         │
│ ✅ Rebuilt Master Ads Table          │
└──────────────────────────────────────┘
```

## Schedule

Notifications sent automatically:
- **6:00 AM ET** - Daily diagnostics run
- **On-demand** - When manually triggered
- **Immediately** - When critical issues detected

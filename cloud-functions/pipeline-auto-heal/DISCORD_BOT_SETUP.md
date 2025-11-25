# Discord Bot API Setup Guide

## ⚠️ SECURITY NOTICE
**IMPORTANT:** Your bot token was exposed. You must regenerate it:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot (agents#4032)
3. Go to **Bot** → Click **Reset Token**
4. Copy the new token immediately (you can only see it once)

## Bot Information
- **Bot Name:** agents#4032
- **Bot ID:** 1439433391710670959
- **Channel:** business (ID: `1442965069909725367`)

## Step 1: Get Your New Bot Token

After regenerating:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications/1439433391710670959)
2. Click **Bot** in left sidebar
3. Under **Token**, click **Reset Token** → **Yes, do it!**
4. Click **Copy** to copy your new token
5. **Save it securely** - you'll need it for deployment

## Step 2: Verify Bot Permissions

Make sure your bot has these permissions in the business channel:
- ✅ **View Channel** (required)
- ✅ **Send Messages** (required)
- ✅ **Embed Links** (required for rich embeds)

To check:
1. Go to your Discord server
2. Right-click the **business** channel → **Edit Channel**
3. Go to **Permissions**
4. Find your bot (agents#4032)
5. Verify the permissions above are enabled

## Step 3: Deploy with Bot Token

Run this command (replace `YOUR_NEW_BOT_TOKEN` with the regenerated token):

```bash
cd /Users/samwilhoit/Documents/sales-dashboard/cloud-functions/pipeline-auto-heal

gcloud functions deploy pipeline-auto-heal \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=pipeline_auto_heal \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT_ID=intercept-sales-2508061117,DISCORD_BOT_TOKEN="YOUR_NEW_BOT_TOKEN",DISCORD_CHANNEL_ID="1442965069909725367" \
  --timeout=540s \
  --memory=512MB
```

## Step 4: Test It

```bash
curl -X POST https://us-central1-intercept-sales-2508061117.cloudfunctions.net/pipeline-auto-heal
```

Check the **business** channel - you should see a notification from agents#4032!

## Environment Variables

The function uses these environment variables:
- `DISCORD_BOT_TOKEN` - Your bot token (required)
- `DISCORD_CHANNEL_ID` - Target channel (defaults to `1442965069909725367`)
- `GOOGLE_CLOUD_PROJECT_ID` - GCP project (defaults to `intercept-sales-2508061117`)

## Troubleshooting

### Bot can't send messages
- Verify bot has **Send Messages** permission in the channel
- Check bot is a member of your server
- Ensure bot token is correct (regenerate if needed)

### Permission errors
- Bot needs **Embed Links** permission for rich embeds
- Check channel-specific permission overrides

### 401 Unauthorized
- Bot token is invalid or expired
- Regenerate token and redeploy

## Bot vs Webhook

**Why Bot API instead of Webhook:**
- ✅ More control and features
- ✅ Can interact with messages
- ✅ Access to full Discord API
- ✅ Better rate limiting
- ✅ Consistent with your existing agentflow setup

## Notification Format

Same rich embeds as before:
- ✅ Color-coded status indicators
- 📊 Detailed issue reporting
- 🔧 Auto-healing action logs
- ⏰ Real-time timestamps
- 🎨 Beautiful formatting

## Schedule

Messages sent to **business** channel:
- **6:00 AM ET** - Daily diagnostics
- **On-demand** - Manual triggers
- **Real-time** - When issues detected

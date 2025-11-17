# Amazon Returns Sync - Cloud Function

Automated cloud function that syncs Amazon returns data from SharePoint to BigQuery.

## What It Does

1. **Downloads** returns Excel file from SharePoint automatically
2. **Processes** the data (handles dates, columns, calculations)
3. **Uploads** to BigQuery table: `amazon_seller.returns`
4. **Runs** daily via Cloud Scheduler (or on-demand)

## Architecture

```
SharePoint Excel File
        ↓
Microsoft Graph API (authentication)
        ↓
Cloud Function (this)
        ↓
BigQuery: amazon_seller.returns
        ↓
Dashboard API
        ↓
Returns Impact Card
```

## Setup

### Prerequisites

1. **Google Cloud Project**: `intercept-sales-2508061117`
2. **Microsoft Credentials** (stored in Secret Manager):
   - `microsoft-tenant-id`
   - `microsoft-client-id`
   - `microsoft-client-secret`
3. **SharePoint File Access**: Returns file must be accessible via Microsoft Graph API

### Deployment

```bash
cd /Users/samwilhoit/Documents/sales-dashboard/cloud-functions/amazon-returns-sync

# Deploy the function
./deploy.sh

# Or manually:
gcloud functions deploy amazon-returns-sync \
  --gen2 \
  --runtime=python311 \
  --region=us-central1 \
  --source=. \
  --entry-point=amazon_returns_sync \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512MB \
  --timeout=540s \
  --set-env-vars=GOOGLE_CLOUD_PROJECT_ID=intercept-sales-2508061117 \
  --set-secrets=MICROSOFT_TENANT_ID=microsoft-tenant-id:latest,MICROSOFT_CLIENT_ID=microsoft-client-id:latest,MICROSOFT_CLIENT_SECRET=microsoft-client-secret:latest
```

### Schedule Daily Sync

```bash
# Create Cloud Scheduler job to run daily at 8 AM
gcloud scheduler jobs create http amazon-returns-daily \
  --location=us-central1 \
  --schedule="0 8 * * *" \
  --uri="https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync" \
  --http-method=POST \
  --description="Daily sync of Amazon returns from SharePoint"
```

## Testing

### Test the Function

```bash
# Trigger manually
curl https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync

# Or via gcloud
gcloud functions call amazon-returns-sync \
  --region=us-central1 \
  --data='{}'
```

### View Logs

```bash
# Recent logs
gcloud functions logs read amazon-returns-sync \
  --region=us-central1 \
  --limit=50

# Follow logs in real-time
gcloud functions logs read amazon-returns-sync \
  --region=us-central1 \
  --limit=50 \
  --follow
```

### Check the Data

```sql
-- View synced returns
SELECT
  DATE(return_date) as date,
  COUNT(*) as returns,
  SUM(refund_amount) as total_refunds,
  AVG(refund_amount) as avg_refund
FROM `intercept-sales-2508061117.amazon_seller.returns`
GROUP BY DATE(return_date)
ORDER BY date DESC
LIMIT 30
```

## Response Format

**Success Response**:
```json
{
  "status": "success",
  "timestamp": "2025-11-17T12:00:00",
  "returns_processed": 150,
  "total_refunds": 12500.50,
  "date_range": "2024-01-01 to 2025-11-15",
  "table": "intercept-sales-2508061117.amazon_seller.returns",
  "message": "Successfully processed 150 returns ($12,500.50 in refunds)"
}
```

**Error Response**:
```json
{
  "status": "error",
  "timestamp": "2025-11-17T12:00:00",
  "error": "Error message here"
}
```

## Data Schema

The function creates/updates this BigQuery table:

**Table**: `intercept-sales-2508061117.amazon_seller.returns`

| Column | Type | Description |
|--------|------|-------------|
| return_date | TIMESTAMP | When return was processed |
| order_date | TIMESTAMP | Original order date |
| date | DATE | Return date (date only) |
| order_id | STRING | Amazon order ID |
| asin | STRING | Product ASIN |
| sku | STRING | Seller SKU |
| product_name | STRING | Product name |
| return_quantity | INTEGER | Units returned |
| refund_amount | FLOAT | $ refunded |
| item_price | FLOAT | Original price |
| return_reason | STRING | Customer's reason |
| return_status | STRING | Return status |
| days_to_return | INTEGER | Days from order to return |
| year, month, day, weekday | INTEGER | Date components |
| processed_at | TIMESTAMP | When synced |

## How It Works

1. **Authentication**: Gets OAuth token from Microsoft Graph API
2. **Download**: Fetches Excel file from SharePoint using file ID
3. **Parse**: Reads Excel, handles various column formats
4. **Transform**:
   - Converts Excel serial dates to proper timestamps
   - Standardizes column names
   - Calculates days_to_return
   - Adds date components for easy filtering
5. **Upload**: Replaces all data in BigQuery table
6. **Verify**: Returns summary of what was processed

## Monitoring

### Success Indicators

- ✅ HTTP 200 response
- ✅ `status: "success"` in response
- ✅ `returns_processed` > 0
- ✅ Recent `processed_at` timestamp in BigQuery

### Error Indicators

- ❌ HTTP 500 response
- ❌ `status: "error"` in response
- ❌ No recent data in BigQuery
- ❌ Dashboard shows $0 returns

### Alerts

Set up alerts for:
- Function execution failures
- No data synced for > 24 hours
- Sudden drop in return count
- Error rate > 5%

```bash
# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="Amazon Returns Sync Failed" \
  --condition-display-name="Function errors" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=300s
```

## Maintenance

### Update Function

```bash
# After code changes
cd /Users/samwilhoit/Documents/sales-dashboard/cloud-functions/amazon-returns-sync
./deploy.sh
```

### Check Scheduler

```bash
# List scheduled jobs
gcloud scheduler jobs list --location=us-central1

# Pause the scheduler
gcloud scheduler jobs pause amazon-returns-daily --location=us-central1

# Resume the scheduler
gcloud scheduler jobs resume amazon-returns-daily --location=us-central1

# Force run now
gcloud scheduler jobs run amazon-returns-daily --location=us-central1
```

### Rotate Credentials

When Microsoft credentials change:

```bash
# Update secrets in Secret Manager
gcloud secrets versions add microsoft-client-secret --data-file=new-secret.txt

# Function will automatically use latest version
```

## Troubleshooting

### "Microsoft credentials not configured"

**Solution**: Ensure secrets exist in Secret Manager:
```bash
gcloud secrets list | grep microsoft
```

### "No download URL found"

**Solution**: Check file ID and permissions:
- File ID: `C0BF238B-1CDA-47FD-A968-087EE7A27270`
- Service account needs read access to SharePoint file

### "No data in Excel file"

**Solution**: 
- Check SharePoint file has data
- Verify sheet name/index
- Check column names match expected formats

### "Insert errors"

**Solution**:
- Check data types match schema
- Look at specific error messages in logs
- Verify no null values in required fields

## Cost

**Estimated Monthly Cost**: ~$0.50
- Function invocations: 30/month (daily)
- Compute: ~10 seconds per run
- Memory: 512MB
- Network: Minimal
- BigQuery: Storage only (< 1 GB)

## Integration

This function integrates with:

1. **Dashboard API**: `/api/amazon/returns/summary`
2. **Overview Page**: Returns Impact Card
3. **Returns Page**: Full analytics dashboard
4. **BigQuery**: Direct SQL queries

## Security

- ✅ Credentials stored in Secret Manager
- ✅ HTTPS only
- ✅ OAuth 2.0 authentication
- ✅ No credentials in code
- ✅ IAM roles properly configured

## Version History

- **v1.0** (2025-11-17): Initial release
  - Automatic SharePoint download
  - BigQuery upload
  - Error handling
  - Comprehensive logging


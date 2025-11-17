#!/bin/bash
#
# Deploy daily-email-report Cloud Function
# This script preserves all environment variables including Gmail credentials
#

set -e

# Load credentials from root .env.credentials file
source ../../.env.credentials

# Check required variables
if [ -z "$GMAIL_APP_PASSWORD" ] || [ "$GMAIL_APP_PASSWORD" = "<YOUR_GMAIL_APP_PASSWORD_HERE>" ]; then
    echo "ERROR: GMAIL_APP_PASSWORD not set in .env.credentials"
    echo "Please update .env.credentials with your Gmail app password"
    exit 1
fi

echo "Deploying daily-email-report function..."
echo "Gmail address: $GMAIL_ADDRESS"
echo "Project: $GOOGLE_CLOUD_PROJECT_ID"

gcloud functions deploy daily-email-report \
    --gen2 \
    --region=us-central1 \
    --runtime=python311 \
    --source=. \
    --entry-point=daily_email_report \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=$GOOGLE_CLOUD_PROJECT_ID,GMAIL_ADDRESS=$GMAIL_ADDRESS,GMAIL_APP_PASSWORD=$GMAIL_APP_PASSWORD,FROM_EMAIL=$GMAIL_ADDRESS,TO_EMAIL=$GMAIL_ADDRESS,LOG_EXECUTION_ID=true" \
    --timeout=540s \
    --memory=512MB

echo "✅ Function deployed successfully!"
echo "Testing with manual trigger..."

curl -X POST "https://us-central1-$GOOGLE_CLOUD_PROJECT_ID.cloudfunctions.net/daily-email-report" \
    -H "Content-Type: application/json" \
    -d '{}'

echo ""
echo "✅ Deploy complete! Check your email for the daily report."

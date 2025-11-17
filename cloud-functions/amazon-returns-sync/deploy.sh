#!/bin/bash

# Deploy Amazon Returns Sync Cloud Function
# Automatically downloads returns data from SharePoint and syncs to BigQuery

echo "🚀 Deploying Amazon Returns Sync Cloud Function..."

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

echo "✅ Deployment complete!"
echo ""
echo "Test the function:"
echo "curl https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync"
echo ""
echo "View logs:"
echo "gcloud functions logs read amazon-returns-sync --region=us-central1 --limit=50"


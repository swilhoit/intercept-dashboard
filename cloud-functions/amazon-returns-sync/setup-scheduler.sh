#!/bin/bash

# Setup Cloud Scheduler for Amazon Returns Daily Sync
# This creates a scheduled job that runs daily at 8 AM

echo "📅 Setting up Cloud Scheduler for Amazon Returns Sync..."

FUNCTION_URL="https://us-central1-intercept-sales-2508061117.cloudfunctions.net/amazon-returns-sync"
JOB_NAME="amazon-returns-daily"
LOCATION="us-central1"

# Check if job already exists
if gcloud scheduler jobs describe $JOB_NAME --location=$LOCATION &>/dev/null; then
    echo "⚠️  Job $JOB_NAME already exists. Updating..."
    
    gcloud scheduler jobs update http $JOB_NAME \
      --location=$LOCATION \
      --schedule="0 8 * * *" \
      --uri="$FUNCTION_URL" \
      --http-method=POST \
      --description="Daily sync of Amazon returns from SharePoint at 8 AM"
    
    echo "✅ Updated existing job"
else
    echo "Creating new scheduled job..."
    
    gcloud scheduler jobs create http $JOB_NAME \
      --location=$LOCATION \
      --schedule="0 8 * * *" \
      --uri="$FUNCTION_URL" \
      --http-method=POST \
      --description="Daily sync of Amazon returns from SharePoint at 8 AM" \
      --time-zone="America/New_York"
    
    echo "✅ Created new scheduled job"
fi

echo ""
echo "📊 Job Details:"
gcloud scheduler jobs describe $JOB_NAME --location=$LOCATION

echo ""
echo "🧪 Test the job now:"
echo "gcloud scheduler jobs run $JOB_NAME --location=$LOCATION"
echo ""
echo "📝 View scheduler logs:"
echo "gcloud scheduler jobs logs $JOB_NAME --location=$LOCATION --limit=10"
echo ""
echo "✅ Setup complete! Returns will sync daily at 8 AM."


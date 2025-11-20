# Deployment Guide: Event-Driven Data Pipeline

This guide outlines the steps to deploy the new event-driven architecture for the data pipeline.

### Prerequisites

1.  **Google Cloud SDK (`gcloud`)**: Make sure you have the `gcloud` command-line tool installed and authenticated to your Google Cloud project.
2.  **Set Project ID**: Configure your project ID in the terminal to avoid specifying it in every command.
    ```bash
    gcloud config set project intercept-sales-2508061117
    ```

### Step 1: Create the Pub/Sub Topic

The Cloud Functions will communicate through a Pub/Sub topic. You need to create this topic first.

```bash
gcloud pubsub topics create source-data-updated
```

### Step 2: Deploy the `woo-fetch` Cloud Function

This function is still an HTTP-triggered function, as it's called by a scheduler. The deployment command is similar to before, but it needs to be updated with the new code.

```bash
# Navigate to the function's directory
cd cloud-functions/woo-fetch

# Deploy the function
gcloud functions deploy woo-fetch-main \
--gen2 \
--runtime=python39 \
--region=us-central1 \
--source=. \
--entry-point=hello_world \
--trigger-http \
--allow-unauthenticated
```
*Note: You may need to adjust the function name (`woo-fetch-main`), region, and runtime to match your existing setup.*

### Step 3: Deploy the `master-aggregation` Cloud Function

This is the main change. This function is no longer triggered by HTTP. Instead, it's triggered by messages on the Pub/Sub topic you created.

First, you'll need to add `google-cloud-pubsub` to its `requirements.txt`. Create a `requirements.txt` file in `cloud-functions/master-aggregation` with the following content:
```
google-cloud-bigquery
functions-framework
google-cloud-pubsub
```

Then, deploy the function with the new trigger:
```bash
# Navigate to the function's directory
cd cloud-functions/master-aggregation

# Deploy the function with the Pub/Sub trigger
gcloud functions deploy master-aggregation-main \
--gen2 \
--runtime=python39 \
--region=us-central1 \
--source=. \
--entry-point=master_aggregation \
--trigger-topic=source-data-updated
```
*Note: You may need to adjust the function name (`master-aggregation-main`), region, and runtime.*

### Step 4: Deactivate the Old Scheduler

After you have deployed the new `master-aggregation` function, the old scheduler that triggered it via HTTP is no longer needed. You should disable or delete the Cloud Scheduler job that was previously responsible for calling the `master-aggregation` endpoint.

1.  Go to the [Cloud Scheduler](https://console.cloud.google.com/cloudscheduler) page in the Google Cloud Console.
2.  Find the scheduler job that targets your old `master-aggregation` HTTP endpoint.
3.  You can either **Pause** the job or **Delete** it.

### Next Steps

This guide only covers the WooCommerce to Master Aggregation flow. To make the entire pipeline event-driven, you would need to:

1.  Modify the other data fetching functions (e.g., `amazon-sync`, `shopify-sync`) to also publish to the `source-data-updated` topic.
2.  Update the `master-aggregation` logic to be "smarter". It could wait until it receives success messages from *all* expected sources for a given day before running the final `MERGE` query. This would require using a temporary storage mechanism like Firestore or BigQuery to track the status of daily source fetches.

These changes have laid a strong foundation for a more robust and scalable data pipeline.

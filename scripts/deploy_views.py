from google.cloud import bigquery
from google.cloud.exceptions import NotFound
import os

# The project ID used in the codebase
TARGET_PROJECT_ID = 'intercept-sales-2508061117'

def deploy_views():
    print(f"Attempting to deploy to {TARGET_PROJECT_ID}...")
    
    # Force the client to use the target project
    try:
        client = bigquery.Client(project=TARGET_PROJECT_ID)
    except Exception as e:
        print(f"Error creating client for {TARGET_PROJECT_ID}: {e}")
        # Fallback to default if specific project auth fails (though unlikely if we have ADC)
        client = bigquery.Client()
        print(f"Falling back to default project: {client.project}")

    dataset_id = f"{TARGET_PROJECT_ID}.VIEWS"

    # 1. Create Dataset if not exists
    try:
        client.get_dataset(dataset_id)
        print(f"Dataset {dataset_id} already exists.")
    except NotFound:
        print(f"Dataset {dataset_id} not found. Creating...")
        try:
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = "US"
            dataset = client.create_dataset(dataset, timeout=30)
            print(f"Created dataset {dataset.project}.{dataset.dataset_id}")
        except Exception as e:
            print(f"Error creating dataset: {e}")
            return

    # 2. Read and Execute SQL
    with open('scripts/sql/create_views.sql', 'r') as f:
        sql_content = f.read()
        
    # Remove comments to avoid issues
    lines = [l for l in sql_content.splitlines() if not l.strip().startswith('--')]
    clean_sql = '\n'.join(lines)
    
    # Split by semicolon
    statements = [s.strip() for s in clean_sql.split(';') if s.strip()]
    
    for i, stmt in enumerate(statements):
        if "CREATE SCHEMA" in stmt and "VIEWS" in stmt:
             continue

        print(f"Executing statement {i+1}...")
        try:
            job = client.query(stmt)
            job.result()
            print(f"Statement {i+1} completed successfully.")
        except Exception as e:
            print(f"Error executing statement {i+1}: {e}")

if __name__ == "__main__":
    deploy_views()

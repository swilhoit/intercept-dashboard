#!/usr/bin/env python3
"""
Cloud Function: Excel SharePoint Sync
Calls the Next.js API to sync Excel files from SharePoint to BigQuery
"""

import functions_framework
import requests
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
NEXTJS_BASE_URL = os.environ.get('NEXTJS_BASE_URL', 'http://localhost:3000')
SYNC_AUTH_TOKEN = os.environ.get('SYNC_AUTH_TOKEN', '')

@functions_framework.http
def excel_sync_handler(request):
    """Cloud function to trigger Excel sync"""
    logger.info(f"Starting Excel sync at {datetime.now()}")

    try:
        # Call the scheduled sync API
        sync_url = f"{NEXTJS_BASE_URL}/api/sync/scheduled"

        headers = {
            'Content-Type': 'application/json',
        }

        # Add auth token if configured
        if SYNC_AUTH_TOKEN:
            headers['Authorization'] = f'Bearer {SYNC_AUTH_TOKEN}'

        # Make the API call
        response = requests.post(sync_url, headers=headers, timeout=300)

        if response.status_code == 200:
            result = response.json()
            logger.info(f"Sync completed successfully: {result}")

            return {
                "status": "success",
                "message": "Excel sync completed successfully",
                "timestamp": datetime.now().isoformat(),
                "result": result
            }
        else:
            logger.error(f"Sync API returned {response.status_code}: {response.text}")
            return {
                "status": "error",
                "message": f"Sync API failed with status {response.status_code}",
                "timestamp": datetime.now().isoformat(),
                "error": response.text
            }

    except requests.exceptions.Timeout:
        logger.error("Sync request timed out")
        return {
            "status": "error",
            "message": "Sync request timed out",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in Excel sync: {e}")
        return {
            "status": "error",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }
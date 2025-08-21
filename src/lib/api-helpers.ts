import { NextResponse } from 'next/server';
import { bigquery } from './bigquery';

export function checkBigQueryConfig() {
  if (!bigquery) {
    return NextResponse.json(
      { error: 'BigQuery is not configured. Please set the required environment variables.' },
      { status: 503 }
    );
  }
  return null;
}

export function handleApiError(error: any) {
  console.error('API Error:', error);
  return NextResponse.json(
    { error: 'Failed to fetch data', details: error.message },
    { status: 500 }
  );
}
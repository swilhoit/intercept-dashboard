import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SchedulerStatus {
  name: string;
  state: string;
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  target: string;
  status: 'active' | 'paused' | 'error';
}

export async function GET(request: NextRequest) {
  try {
    // Check if running in a serverless environment (Vercel)
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

    if (isServerless) {
      // Return mock data or a graceful response for serverless environments
      // In production, you would use the Cloud Scheduler API client library instead of gcloud CLI
      console.warn('Cloud Scheduler CLI not available in serverless environment');
      return NextResponse.json({
        timestamp: new Date().toISOString(),
        schedulers: [],
        summary: {
          total: 0,
          active: 0,
          paused: 0,
          error: 0
        },
        note: 'Scheduler status unavailable in serverless environment. Use Google Cloud Console to view scheduler status.'
      });
    }

    // Get all Cloud Scheduler jobs (only works in environments with gcloud CLI)
    const { stdout } = await execAsync(
      'gcloud scheduler jobs list --format=json --project=intercept-sales-2508061117'
    );

    const jobs = JSON.parse(stdout);
    const schedulers: SchedulerStatus[] = [];

    for (const job of jobs) {
      schedulers.push({
        name: job.name.split('/').pop(),
        state: job.state,
        schedule: job.schedule,
        lastRun: job.status?.lastAttemptTime || null,
        nextRun: job.scheduleTime || null,
        target: job.httpTarget?.uri || job.pubsubTarget?.topicName || 'Unknown',
        status: job.state === 'ENABLED' ? 'active' : job.state === 'PAUSED' ? 'paused' : 'error'
      });
    }

    // Sort by name
    schedulers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      schedulers,
      summary: {
        total: schedulers.length,
        active: schedulers.filter(s => s.status === 'active').length,
        paused: schedulers.filter(s => s.status === 'paused').length,
        error: schedulers.filter(s => s.status === 'error').length
      }
    });
  } catch (error: any) {
    console.error('Error fetching scheduler status:', error);

    // Return graceful error response
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      schedulers: [],
      summary: {
        total: 0,
        active: 0,
        paused: 0,
        error: 0
      },
      error: 'Failed to fetch scheduler status',
      message: error.message,
      note: 'Use Google Cloud Console to view scheduler status.'
    }, { status: 200 }); // Return 200 instead of 500 to prevent client errors
  }
}

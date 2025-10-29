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
    // Get all Cloud Scheduler jobs
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
    return NextResponse.json({
      error: 'Failed to fetch scheduler status',
      message: error.message
    }, { status: 500 });
  }
}

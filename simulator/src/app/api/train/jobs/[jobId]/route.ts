import { NextResponse } from 'next/server';
import { getTrainingJob } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = getTrainingJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Training job not found' }, { status: 404 });
  }
  return NextResponse.json(job);
}

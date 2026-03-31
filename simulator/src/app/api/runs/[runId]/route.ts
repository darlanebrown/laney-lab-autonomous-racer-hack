import { NextResponse } from 'next/server';
import { getRunOrNull } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = getRunOrNull(runId);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json(run);
}

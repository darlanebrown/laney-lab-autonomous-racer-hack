import { NextRequest, NextResponse } from 'next/server';
import { createRun, listRuns } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

function getBaseUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) return env.replace(/\/+$/, '');
  return req.nextUrl.origin;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return badRequest('Invalid JSON body');
  }
  if (!payload || typeof payload !== 'object') {
    return badRequest('Body must be an object');
  }
  const input = payload as Record<string, unknown>;
  const userId = typeof input.user_id === 'string' ? input.user_id.trim() : '';
  const trackId = typeof input.track_id === 'string' ? input.track_id.trim() : '';
  const mode = input.mode;
  if (!userId) return badRequest('user_id is required');
  if (!trackId) return badRequest('track_id is required');
  if (mode !== 'manual' && mode !== 'autonomous') return badRequest("mode must be 'manual' or 'autonomous'");

  const created = createRun(getBaseUrl(req), {
    user_id: userId,
    track_id: trackId,
    mode,
    model_version: typeof input.model_version === 'string' ? input.model_version : null,
    sim_build: typeof input.sim_build === 'string' ? input.sim_build : undefined,
    client_build: typeof input.client_build === 'string' ? input.client_build : undefined,
    notes: typeof input.notes === 'string' ? input.notes : null,
    local_run_id: typeof input.local_run_id === 'string' ? input.local_run_id : null,
    started_at: typeof input.started_at === 'string' ? input.started_at : undefined,
  });
  return NextResponse.json(created, { status: 201 });
}

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 20;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 20;
  const status = req.nextUrl.searchParams.get('status') ?? undefined;
  const userId = req.nextUrl.searchParams.get('user_id') ?? undefined;
  const trackId = req.nextUrl.searchParams.get('track_id') ?? undefined;

  const data = listRuns({
    limit: safeLimit,
    status,
    user_id: userId,
    track_id: trackId,
  });
  return NextResponse.json(data);
}

import { NextResponse } from 'next/server';
import { getActiveModelVersion, setActiveModelVersion } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ active_model_version: getActiveModelVersion() });
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }
  const input = payload as Record<string, unknown>;
  const modelVersion = typeof input.model_version === 'string' ? input.model_version.trim() : '';
  if (!modelVersion) {
    return NextResponse.json({ error: 'model_version is required' }, { status: 400 });
  }
  try {
    const active = setActiveModelVersion(modelVersion);
    return NextResponse.json({ active_model_version: active });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Model not found')) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to set active model' }, { status: 500 });
  }
}

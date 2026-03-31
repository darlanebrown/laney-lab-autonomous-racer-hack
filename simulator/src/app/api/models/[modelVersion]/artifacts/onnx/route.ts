import { NextResponse } from 'next/server';
import { getModel } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ modelVersion: string }> }) {
  const { modelVersion } = await context.params;
  const model = getModel(modelVersion);
  if (!model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'ONNX artifact is not available for this model version' }, { status: 404 });
}

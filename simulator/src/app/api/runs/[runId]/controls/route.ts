import { NextResponse } from 'next/server';
import { uploadRunArtifact } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

async function parseUpload(req: Request): Promise<Buffer | null> {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return null;
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes);
}

export async function POST(req: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const bytes = await parseUpload(req);
  if (!bytes) {
    return NextResponse.json({ error: 'Missing file field in multipart form data' }, { status: 400 });
  }
  try {
    uploadRunArtifact(runId, 'controls', bytes);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Run not found')) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to upload artifact' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { listModels } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 20;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 20;
  return NextResponse.json(listModels(safeLimit));
}

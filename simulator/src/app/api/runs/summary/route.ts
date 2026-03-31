import { NextResponse } from 'next/server';
import { getStats } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json(getStats());
}

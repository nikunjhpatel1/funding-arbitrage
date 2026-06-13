import { NextResponse } from 'next/server';
import { performFetch, saveHistoricalData } from '../../funding-rates/route';

export const maxDuration = 55;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const data = await performFetch(50000);
    await saveHistoricalData(data.data);
    return NextResponse.json({ success: true, message: 'Snapshot completed' });
  } catch (err: any) {
    console.error('Cron snapshot failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

export const maxDuration = 55;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    
    // Hitting the main funding-rates endpoint natively triggers historical saves
    // and paper trading accruals in the background
    await fetch(`${protocol}://${host}/api/funding-rates`);
    
    return NextResponse.json({ success: true, message: 'Snapshot triggered' });
  } catch (err: any) {
    console.error('Cron snapshot failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

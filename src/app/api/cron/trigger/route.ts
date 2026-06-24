import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const host = process.env.NEXT_PUBLIC_SITE_URL || 'localhost:3000';
    
    const [scannerRes, snapshotRes] = await Promise.allSettled([
      fetch(`${protocol}://${host}/api/cron/scanner`, { method: 'GET' }),
      fetch(`${protocol}://${host}/api/cron/snapshot`, { method: 'GET' }),
    ]);

    return NextResponse.json({
      success: true,
      scanner: scannerRes.status === 'fulfilled' ? 'triggered' : 'failed',
      snapshot: snapshotRes.status === 'fulfilled' ? 'triggered' : 'failed',
      message: 'Cron jobs triggered. Wait 30 seconds then retry the backtest.',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

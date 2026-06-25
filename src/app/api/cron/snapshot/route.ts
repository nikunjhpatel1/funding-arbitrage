import { NextResponse } from 'next/server';

export const maxDuration = 55;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    // Call the real scanner which fetches live data, saves funding_rate_history,
    // refreshes scanner_cache, and runs paper trading accrual
    const res = await fetch(`${protocol}://${host}/api/cron/scanner`, {
      method: 'GET',
      headers: { 'x-forwarded-host': host },
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ success: res.ok, message: 'Scanner triggered', ...data });
  } catch (err: any) {
    console.error('Cron snapshot failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'demo';
  if (mode === 'paper') {
    // Paper trading uses its own separate paper_positions table
    // Return empty stats — paper trading has its own page/API
    return NextResponse.json({
      success: true,
      data: {
        equity: 10000,
        openPositions: 0,
        closedTrades: 0,
        winRate: '0.0%',
        realizedPnl: 0,
        unrealizedPnl: 0,
        positions: [],
        logs: [],
      }
    });
  }
  const prefix = mode === 'live' ? 'live' : 'demo';

  try {
    const [posRes, closedRes, logsRes] = await Promise.all([
      supabase.from(`${prefix}_positions`).select('*').eq('status', 'OPEN').order('opened_at', { ascending: false }),
      supabase.from(`${prefix}_positions`).select('realized_pnl, status').eq('status', 'CLOSED'),
      supabase.from(`${prefix}_execution_logs`).select('*').order('created_at', { ascending: false }).limit(30),
    ]);

    const openPositions = posRes.data || [];
    const closedPositions = closedRes.data || [];
    const logs = logsRes.data || [];

    const realizedPnl = closedPositions.reduce((s, p) => s + (Number(p.realized_pnl) || 0), 0);
    const unrealizedPnl = openPositions.reduce((s, p) => s + (Number(p.unrealized_pnl) || 0), 0);
    const winners = closedPositions.filter(p => (Number(p.realized_pnl) || 0) > 0).length;
    const winRate = closedPositions.length > 0
      ? ((winners / closedPositions.length) * 100).toFixed(1)
      : '0.0';

    return NextResponse.json({
      success: true,
      data: {
        equity: 10000 + realizedPnl + unrealizedPnl,
        openPositions: openPositions.length,
        closedTrades: closedPositions.length,
        winRate: `${winRate}%`,
        realizedPnl,
        unrealizedPnl,
        positions: openPositions,
        logs,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

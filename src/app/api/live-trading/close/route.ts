import { NextResponse } from 'next/server';
import { ExecutionEngine } from '@/lib/execution-engine';
import { TradingMode } from '@/lib/trading-mode';
import { supabase } from '@/lib/supabase';
import { ExecutionMonitor } from '@/lib/execution-monitor';

export async function POST(req: Request) {
  try {
    const { positionId } = await req.json();
    if (!positionId) return NextResponse.json({ error: 'positionId is required' }, { status: 400 });

    const { data: pos, error } = await supabase.from('live_positions').select('*').eq('id', positionId).single();
    if (error || !pos) throw new Error('Position not found');
    if (pos.status !== 'OPEN') throw new Error('Position already closed');

    await ExecutionMonitor.logExecution(TradingMode.LIVE, positionId, 'WARN', `REAL MONEY EMERGENCY CLOSE for ${pos.id}`);

    // Execute opposing order
    const closingSide = pos.side.toUpperCase() === 'BUY' ? 'Sell' : 'Buy';
    
    await ExecutionEngine.executeTrade({
      mode: TradingMode.LIVE,
      exchange: pos.exchange,
      symbol: pos.symbol,
      side: closingSide,
      quantity: pos.quantity
    });

    // Mark current position as closed
    await supabase.from('live_positions').update({ status: 'CLOSED', closed_at: Date.now() }).eq('id', positionId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

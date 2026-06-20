import { NextResponse } from 'next/server';
import { ExecutionEngine } from '@/lib/execution-engine';
import { TradingMode } from '@/lib/trading-mode';
import { supabase } from '@/lib/supabase';
import { ExecutionMonitor } from '@/lib/execution-monitor';

export async function POST(req: Request) {
  try {
    const { positionId } = await req.json();
    if (!positionId) return NextResponse.json({ error: 'positionId is required' }, { status: 400 });

    const { data: pos, error } = await supabase.from('demo_positions').select('*').eq('id', positionId).single();
    if (error || !pos) throw new Error('Position not found');
    if (pos.status !== 'OPEN') throw new Error('Position already closed');

    await ExecutionMonitor.logExecution(TradingMode.DEMO, positionId, 'INFO', `Closing demo position ${pos.id}`);

    // Execute opposing order
    const closingSide = pos.side.toUpperCase() === 'BUY' ? 'Sell' : 'Buy';
    
    // Instead of using executeTrade which creates a new position, we should ideally have a closeTrade in the engine,
    // but for this MVP we'll reuse executeTrade and mark the old one closed.
    // In a real system, you'd have a dedicated execution path.
    await ExecutionEngine.executeTrade({
      mode: TradingMode.DEMO,
      exchange: pos.exchange,
      symbol: pos.symbol,
      side: closingSide,
      quantity: pos.quantity
    });

    // Mark current position as closed
    await supabase.from('demo_positions').update({ status: 'CLOSED', closed_at: Date.now() }).eq('id', positionId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

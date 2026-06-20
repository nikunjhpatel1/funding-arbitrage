import { NextResponse } from 'next/server';
import { ExecutionEngine } from '@/lib/execution-engine';
import { TradingMode } from '@/lib/trading-mode';
import { ExecutionMonitor } from '@/lib/execution-monitor';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { exchange, symbol, side, quantity } = body;

    if (!exchange || !symbol || !side || !quantity) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Safety checks specific to Live Trading
    if (Number(quantity) <= 0) {
      return NextResponse.json({ error: 'Quantity must be strictly positive for live trading' }, { status: 400 });
    }

    await ExecutionMonitor.logExecution(TradingMode.LIVE, null, 'WARN', `REAL MONEY EXECUTION INITIATED: ${side} ${quantity} ${symbol} on ${exchange}`);

    const result = await ExecutionEngine.executeTrade({
      mode: TradingMode.LIVE,
      exchange,
      symbol,
      side,
      quantity: Number(quantity)
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    await ExecutionMonitor.logExecution(TradingMode.LIVE, null, 'ERROR', `REAL MONEY EXECUTION FAILED: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

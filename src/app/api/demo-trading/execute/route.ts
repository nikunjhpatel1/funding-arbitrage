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

    await ExecutionMonitor.logExecution(TradingMode.DEMO, null, 'INFO', `Received request to execute ${side} ${quantity} ${symbol} on ${exchange}`);

    const result = await ExecutionEngine.executeTrade({
      mode: TradingMode.DEMO,
      exchange,
      symbol,
      side,
      quantity: Number(quantity)
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    await ExecutionMonitor.logExecution(TradingMode.DEMO, null, 'ERROR', `Execution failed: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

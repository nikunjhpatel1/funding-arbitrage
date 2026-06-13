import { NextResponse } from 'next/server';
import db from '@/lib/db';

const TAKER_FEES: Record<string, number> = {
  binance:     0.0004,
  bybit:       0.0006,
  okx:         0.0005,
  bitget:      0.0006,
  kucoin:      0.0006,
  gateio:      0.0005,
  mexc:        0.0000,
  bingx:       0.0005,
  htx:         0.0005,
  bitmex:      0.00075,
  dydx:        0.0005,
  hyperliquid: 0.00035,
  phemex:      0.0006,
  blofin:      0.0005,
  delta:       0.0005,
};

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { closePrice, longClosePrice, shortClosePrice } = body;

    const stmt = db.prepare('SELECT * FROM paper_positions WHERE id = ?');
    const position = stmt.get(id) as any;

    if (!position || position.status === 'CLOSED') {
      return NextResponse.json({ success: false, error: 'Position not found or already closed' }, { status: 400 });
    }

    const actualLongClose = longClosePrice ?? closePrice;
    const actualShortClose = shortClosePrice ?? closePrice;

    const closeTime = Date.now();
    const notionalPerLeg = position.notional_per_leg || (position.capital * position.leverage);
    const longFee = notionalPerLeg * (TAKER_FEES[position.long_exchange] ?? 0.0005);
    const shortFee = notionalPerLeg * (TAKER_FEES[position.short_exchange] ?? 0.0005);
    const slippage = notionalPerLeg * 0.0005; // 0.05% per leg
    
    const longExitFee = longFee + slippage;
    const shortExitFee = shortFee + slippage;
    
    const totalLongFees = position.long_fees + longExitFee;
    const totalShortFees = position.short_fees + shortExitFee;

    const longRealizedPnl = ((actualLongClose - position.long_entry_price) / position.long_entry_price) * notionalPerLeg;
    const shortRealizedPnl = ((position.short_entry_price - actualShortClose) / position.short_entry_price) * notionalPerLeg;

    const updateStmt = db.prepare(`
      UPDATE paper_positions
      SET status = 'CLOSED', close_time = ?, close_reason = 'MANUAL',
          long_close_price = ?, short_close_price = ?,
          long_fees = ?, short_fees = ?,
          long_realized_pnl = ?, short_realized_pnl = ?
      WHERE id = ?
    `);

    updateStmt.run(closeTime, actualLongClose, actualShortClose, totalLongFees, totalShortFees, longRealizedPnl, shortRealizedPnl, id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

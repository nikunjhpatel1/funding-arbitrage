import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

import { TAKER_FEES } from '@/lib/constants';

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { closePrice, longClosePrice, shortClosePrice } = body;

    const { data: position, error: fetchError } = await supabase
      .from('paper_positions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !position || position.status === 'CLOSED') {
      return NextResponse.json({ success: false, error: 'Position not found or already closed' }, { status: 400 });
    }

    const actualLongClose = longClosePrice ?? closePrice;
    const actualShortClose = shortClosePrice ?? closePrice;
    const closeTime = Date.now();
    const notionalPerLeg = position.notional_per_leg || (position.capital * position.leverage);
    const longFee = notionalPerLeg * (TAKER_FEES[position.long_exchange] ?? 0.0005);
    const shortFee = notionalPerLeg * (TAKER_FEES[position.short_exchange] ?? 0.0005);
    const slippage = notionalPerLeg * 0.0005;

    const longExitFee = longFee + slippage;
    const shortExitFee = shortFee + slippage;

    const totalLongFees = position.long_fees + longExitFee;
    const totalShortFees = position.short_fees + shortExitFee;
    const longRealizedPnl = ((actualLongClose - position.long_entry_price) / position.long_entry_price) * notionalPerLeg;
    const shortRealizedPnl = ((position.short_entry_price - actualShortClose) / position.short_entry_price) * notionalPerLeg;

    const { error: updateError } = await supabase
      .from('paper_positions')
      .update({
        status: 'CLOSED',
        close_time: closeTime,
        close_reason: 'MANUAL',
        long_close_price: actualLongClose,
        short_close_price: actualShortClose,
        long_fees: totalLongFees,
        short_fees: totalShortFees,
        long_realized_pnl: longRealizedPnl,
        short_realized_pnl: shortRealizedPnl,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

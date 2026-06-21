import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { RestClientV5 } from 'bybit-api';

const CAPITAL = 20;    // $20
const LEVERAGE = 1;    // 1x
const SYMBOL = 'BTCUSDT';

export async function GET() {
  const apiKey = process.env.BYBIT_API_KEY;
  const secret = process.env.BYBIT_SECRET;
  const isDemo = process.env.BYBIT_TESTNET === 'true';

  if (!apiKey || !secret) {
    return NextResponse.json({ success: false, error: 'BYBIT_API_KEY or BYBIT_SECRET not set in env' });
  }

  try {
    const client = new RestClientV5({
      key: apiKey,
      secret,
      testnet: isDemo,
    });

    const tickerRes = await client.getTickers({ category: 'linear', symbol: SYMBOL });
    if (tickerRes.retCode !== 0) throw new Error(`Ticker fetch failed: ${tickerRes.retMsg}`);

    const price = parseFloat(tickerRes.result.list[0].lastPrice);
    if (!price || price <= 0) throw new Error('Invalid price from ticker');

    const notional = CAPITAL * LEVERAGE;       // $20
    const rawQty = notional / price;
    const qty = Math.max(0.001, Math.floor(rawQty * 1000) / 1000); // min 0.001 BTC

    console.log(`[Demo Order] BTC price: $${price} | notional: $${notional} | qty: ${qty}`);

    // --- 2. Place Market BUY order ---
    const orderRes = await client.submitOrder({
      category: 'linear',
      symbol: SYMBOL,
      side: 'Buy',
      orderType: 'Market',
      qty: qty.toString(),
    });

    console.log('[Demo Order] Bybit response:', JSON.stringify(orderRes));

    if (orderRes.retCode !== 0) {
      throw new Error(`Order failed: ${orderRes.retMsg} (code: ${orderRes.retCode})`);
    }

    const orderId = orderRes.result.orderId;

    // --- 3. Save to real_positions ---
    const { data: position, error: posError } = await supabase
      .from('real_positions')
      .insert({
        opportunity_id: `demo-bybit-btc-${Date.now()}`,
        long_exchange: 'bybit',
        short_exchange: 'bybit',
        long_symbol: 'BTC/USDT',
        short_symbol: 'BTC/USDT',
        long_order_id: orderId,
        short_order_id: null,
        entry_price_long: price,
        entry_price_short: null,
        quantity: qty,
        capital: CAPITAL,
        leverage: LEVERAGE,
        status: 'OPEN',
      })
      .select('id')
      .single();

    if (posError) {
      console.error('[Demo Order] Failed to insert position:', posError);
    }

    const positionId = position?.id || null;

    // --- 4. Save to real_trade_history ---
    if (positionId) {
      const { error: histError } = await supabase.from('real_trade_history').insert({
        position_id: positionId,
        event_type: 'ENTRY_LONG',
        exchange: 'bybit',
        order_id: orderId,
        price: price,
        quantity: qty,
      });
      if (histError) console.error('[Demo Order] Failed to insert trade history:', histError);
    }

    // --- 5. Save to execution_logs ---
    await supabase.from('execution_logs').insert({
      position_id: positionId,
      log_level: 'INFO',
      message: `[Demo] Order submitted on Bybit${isDemo ? ' (demo)' : ''}: BUY ${qty} BTCUSDT @ ~$${price} | orderId: ${orderId}`,
    });

    return NextResponse.json({
      success: true,
      order: {
        orderId,
        symbol: SYMBOL,
        side: 'Buy',
        qty,
        price,
        testnet: isDemo,
      },
      db: {
        positionId,
        message: positionId ? 'Saved to real_positions, real_trade_history, execution_logs' : 'Order placed but DB insert failed — check logs',
      },
    });

  } catch (e: any) {
    console.error('[Demo Order] Error:', e.message);
    // Log failure to execution_logs too
    try {
      await supabase.from('execution_logs').insert({
        position_id: null,
        log_level: 'ERROR',
        message: `[Demo] Order failed: ${e.message}`,
      });
    } catch (err) {}
    return NextResponse.json({ success: false, error: e.message });
  }
}

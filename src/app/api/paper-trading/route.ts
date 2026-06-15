import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import crypto from 'crypto';
import { getExchangePrice } from '@/lib/getExchangePrice';
import { calculateSlippage } from '@/lib/slippage';

export type PaperPosition = {
  id: string;
  symbol: string;
  capital: number;
  leverage: number;
  notional_per_leg: number;
  entry_time: number;
  close_time: number | null;
  status: 'OPEN' | 'CLOSED';
  close_reason: 'MANUAL' | 'LIQUIDATED' | null;

  long_exchange: string;
  long_entry_price: number;
  long_mark_price?: number;
  long_fill_price?: number;
  long_slippage?: number;
  long_slippage_cost?: number;
  long_close_price: number | null;
  long_funding: number;
  long_funding_received: number;
  long_funding_paid: number;
  long_fees: number;
  long_realized_pnl: number | null;
  long_next_funding_time: number | null;
  long_funding_interval_hours: number;
  long_rate_at_entry: number;

  short_exchange: string;
  short_entry_price: number;
  short_mark_price?: number;
  short_fill_price?: number;
  short_slippage?: number;
  short_slippage_cost?: number;
  short_close_price: number | null;
  short_funding: number;
  short_funding_received: number;
  short_funding_paid: number;
  short_fees: number;
  short_realized_pnl: number | null;
  short_next_funding_time: number | null;
  short_funding_interval_hours: number;
  short_rate_at_entry: number;

  funding_events_count: number;
  last_funding_accrual_time: number;
};

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('paper_positions')
      .select('*')
      .order('entry_time', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data as PaperPosition[] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

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

const VALID_EXCHANGES = new Set(Object.keys(TAKER_FEES));
const MIN_CAPITAL = 10;
const MAX_CAPITAL = 10_000_000;
const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 125;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      symbol, longExchange, shortExchange, capital, leverage,
      longEntryPrice, shortEntryPrice, entryPrice,
      longNextTime, shortNextTime, longIntervalHours, shortIntervalHours,
      longRateAtEntry, shortRateAtEntry
    } = body;

    if (!symbol || typeof symbol !== 'string' || !symbol.includes('/')) {
      return NextResponse.json({ error: 'Invalid symbol format. Expected: BASE/QUOTE (e.g. BTC/USDT)' }, { status: 400 });
    }
    if (!longExchange || !VALID_EXCHANGES.has(longExchange)) {
      return NextResponse.json({ error: `Invalid longExchange: ${longExchange}` }, { status: 400 });
    }
    if (!shortExchange || !VALID_EXCHANGES.has(shortExchange)) {
      return NextResponse.json({ error: `Invalid shortExchange: ${shortExchange}` }, { status: 400 });
    }
    if (longExchange === shortExchange) {
      return NextResponse.json({ error: 'Long and Short exchange must be different' }, { status: 400 });
    }
    const capitalNum = Number(capital);
    if (isNaN(capitalNum) || capitalNum < MIN_CAPITAL || capitalNum > MAX_CAPITAL) {
      return NextResponse.json({ error: `Capital must be between $${MIN_CAPITAL} and $${MAX_CAPITAL.toLocaleString()}` }, { status: 400 });
    }
    const leverageNum = Number(leverage);
    if (isNaN(leverageNum) || leverageNum < MIN_LEVERAGE || leverageNum > MAX_LEVERAGE || !Number.isInteger(leverageNum)) {
      return NextResponse.json({ error: `Leverage must be an integer between ${MIN_LEVERAGE}x and ${MAX_LEVERAGE}x` }, { status: 400 });
    }

    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const orderbookUrl = `${protocol}://${host}/api/orderbook?symbol=${encodeURIComponent(symbol)}&exchanges=${longExchange},${shortExchange}`;

    const [longPrice, shortPrice, obRes] = await Promise.all([
      getExchangePrice(longExchange, symbol),
      getExchangePrice(shortExchange, symbol),
      fetch(orderbookUrl).catch(() => null)
    ]);

    let longOrderbook = null;
    let shortOrderbook = null;
    if (obRes && obRes.ok) {
      const obData = await obRes.json();
      longOrderbook = obData.data?.[longExchange] || null;
      shortOrderbook = obData.data?.[shortExchange] || null;
    }

    const longMarkPrice = longPrice ?? longEntryPrice ?? entryPrice ?? 0;
    const shortMarkPrice = shortPrice ?? shortEntryPrice ?? entryPrice ?? 0;

    const notionalPerLeg = capital * leverage;

    const longSlippageResult = calculateSlippage(longOrderbook, 'buy', notionalPerLeg, longMarkPrice);
    const shortSlippageResult = calculateSlippage(shortOrderbook, 'sell', notionalPerLeg, shortMarkPrice);

    const longFillPrice = longSlippageResult.fullyFilled && longSlippageResult.averageFillPrice > 0
      ? longSlippageResult.averageFillPrice
      : longSlippageResult.markPriceUsed || longMarkPrice;
    const longSlippagePct = longSlippageResult.fullyFilled ? longSlippageResult.slippagePercent : null;

    const shortFillPrice = shortSlippageResult.fullyFilled && shortSlippageResult.averageFillPrice > 0
      ? shortSlippageResult.averageFillPrice
      : shortSlippageResult.markPriceUsed || shortMarkPrice;
    const shortSlippagePct = shortSlippageResult.fullyFilled ? shortSlippageResult.slippagePercent : null;

    console.log('[Open Position]', {
      symbol,
      longExchange,
      shortExchange,
      longEntryPrice: longFillPrice,
      shortEntryPrice: shortFillPrice,
      notional: notionalPerLeg,
    });

    const { data: existing, error: existingError } = await supabase
      .from('paper_positions')
      .select('id')
      .eq('symbol', symbol)
      .eq('long_exchange', longExchange)
      .eq('short_exchange', shortExchange)
      .eq('status', 'OPEN')
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json(
        { error: 'Position already open for this pair and exchange combination' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const entryTime = Date.now();

    const longFee = notionalPerLeg * (TAKER_FEES[longExchange] ?? 0.0005);
    const shortFee = notionalPerLeg * (TAKER_FEES[shortExchange] ?? 0.0005);

    const { error: insertError } = await supabase
      .from('paper_positions')
      .insert({
        id,
        symbol,
        capital,
        leverage,
        notional_per_leg: notionalPerLeg,
        entry_time: entryTime,
        status: 'OPEN',
        long_exchange: longExchange,
        long_entry_price: longFillPrice,
        long_fees: longFee,
        long_next_funding_time: longNextTime || null,
        long_funding_interval_hours: longIntervalHours || 8,
        long_rate_at_entry: longRateAtEntry || 0,
        long_mark_price: longSlippageResult.markPriceUsed || longMarkPrice,
        long_fill_price: longFillPrice,
        long_slippage: longSlippagePct,
        long_slippage_cost: longSlippageResult.fullyFilled ? longSlippageResult.executionCostUSD : 0,
        short_exchange: shortExchange,
        short_entry_price: shortFillPrice,
        short_fees: shortFee,
        short_next_funding_time: shortNextTime || null,
        short_funding_interval_hours: shortIntervalHours || 8,
        short_rate_at_entry: shortRateAtEntry || 0,
        short_mark_price: shortSlippageResult.markPriceUsed || shortMarkPrice,
        short_fill_price: shortFillPrice,
        short_slippage: shortSlippagePct,
        short_slippage_cost: shortSlippageResult.fullyFilled ? shortSlippageResult.executionCostUSD : 0,
        last_funding_accrual_time: entryTime,
        funding_events_count: 0,
        long_funding: 0,
        short_funding: 0,
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

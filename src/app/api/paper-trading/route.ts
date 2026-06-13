import { NextResponse } from 'next/server';
import db from '@/lib/db';
import crypto from 'crypto';
import { getExchangePrice } from '@/lib/getExchangePrice';

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
  long_close_price: number | null;
  long_funding: number;          // Net: positive = received, negative = paid
  long_funding_received: number; // Gross received
  long_funding_paid: number;     // Gross paid (positive number)
  long_fees: number;
  long_realized_pnl: number | null;
  long_next_funding_time: number | null;
  long_funding_interval_hours: number;
  long_rate_at_entry: number;
  
  short_exchange: string;
  short_entry_price: number;
  short_close_price: number | null;
  short_funding: number;          // Net: positive = received, negative = paid
  short_funding_received: number; // Gross received
  short_funding_paid: number;     // Gross paid (positive number)
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
    const stmt = db.prepare('SELECT * FROM paper_positions ORDER BY entry_time DESC');
    const positions = stmt.all() as PaperPosition[];
    return NextResponse.json({ success: true, data: positions });
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
const MIN_CAPITAL = 10;     // $10 minimum
const MAX_CAPITAL = 10_000_000; // $10M maximum
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
    
    // ── FIX H-7: Server-side input validation ─────────────────────────────────
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
    // Fetch prices from both exchanges in parallel
    const [longPrice, shortPrice] = await Promise.all([
      getExchangePrice(longExchange, symbol),
      getExchangePrice(shortExchange, symbol),
    ]);

    // Use fetched prices or fallback to API price
    const actualLongEntry = longPrice ?? longEntryPrice ?? entryPrice ?? 0;
    const actualShortEntry = shortPrice ?? shortEntryPrice ?? entryPrice ?? 0;

    console.log('[Open Position]', {
      symbol,
      longExchange,
      shortExchange,
      longEntryPrice: actualLongEntry,
      shortEntryPrice: actualShortEntry,
      notional: capital * leverage,
    });

    // Issue 1: Check for duplicates
    const checkStmt = db.prepare(`
      SELECT id FROM paper_positions 
      WHERE symbol = ? 
      AND long_exchange = ? 
      AND short_exchange = ? 
      AND status = 'OPEN'
    `);
    const existing = checkStmt.get(symbol, longExchange, shortExchange);
    if (existing) {
      return NextResponse.json(
        { error: 'Position already open for this pair and exchange combination' },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const entryTime = Date.now();
    
    // Bug 2: Entry fee calculation
    const notionalPerLeg = capital * leverage;
    const longFee = notionalPerLeg * (TAKER_FEES[longExchange] ?? 0.0005);
    const shortFee = notionalPerLeg * (TAKER_FEES[shortExchange] ?? 0.0005);
    const slippage = notionalPerLeg * 0.0005; // 0.05% per leg

    const stmt = db.prepare(`
      INSERT INTO paper_positions (
        id, symbol, capital, leverage, notional_per_leg,
        entry_time, status, 
        long_exchange, long_entry_price, long_fees, long_next_funding_time, long_funding_interval_hours, long_rate_at_entry,
        short_exchange, short_entry_price, short_fees, short_next_funding_time, short_funding_interval_hours, short_rate_at_entry,
        last_funding_accrual_time, funding_events_count, long_funding, short_funding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, symbol, capital, leverage, notionalPerLeg,
      entryTime, 'OPEN',
      longExchange, actualLongEntry, longFee + slippage, longNextTime || null, longIntervalHours || 8, longRateAtEntry || 0,
      shortExchange, actualShortEntry, shortFee + slippage, shortNextTime || null, shortIntervalHours || 8, shortRateAtEntry || 0,
      entryTime, 0, 0, 0
    );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

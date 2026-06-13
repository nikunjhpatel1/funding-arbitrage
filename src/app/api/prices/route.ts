import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  try {
    const res = await fetch(
      'https://fapi.binance.com/fapi/v1/ticker/24hr',
      { cache: 'no-store' }
    );
    const tickers = await res.json();
    
    const prices: Record<string, {
      price: number;
      change24h: number;
      volume24h: number;
    }> = {};
    
    for (const t of tickers) {
      if (!t.symbol.endsWith('USDT')) continue;
      const base = t.symbol.slice(0, -4);
      prices[base] = {
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        volume24h: parseFloat(t.quoteVolume),
      };
    }
    
    return NextResponse.json(prices, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch {
    return NextResponse.json({});
  }
}

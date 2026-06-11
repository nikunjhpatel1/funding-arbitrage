import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

export interface HistoricalFundingItem {
  timestamp: string;
  bestLong: string;
  bestShort: string;
  spread: number;
  exchanges: Record<string, number | null>;
}

export interface HistoricalFundingResponse {
  symbol: string;
  period: string;
  data: HistoricalFundingItem[];
  message?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const period = searchParams.get('period')?.toLowerCase() || '7d';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 });
  }

  // Normalize symbol from URL (e.g. BTC-USDT or BTCUSDT to BTC/USDT)
  let normalizedSymbol = symbol.replace('-', '/');
  if (!normalizedSymbol.includes('/')) {
    if (normalizedSymbol.endsWith('USDT')) {
      normalizedSymbol = normalizedSymbol.slice(0, -4) + '/USDT';
    } else if (normalizedSymbol.endsWith('USDC')) {
      normalizedSymbol = normalizedSymbol.slice(0, -4) + '/USDC';
    } else if (normalizedSymbol.endsWith('USD')) {
      normalizedSymbol = normalizedSymbol.slice(0, -3) + '/USD';
    }
  }

  const periodMap: Record<string, number> = {
    '24h': 24 * 3600 * 1000,
    '7d': 7 * 24 * 3600 * 1000,
    '30d': 30 * 24 * 3600 * 1000,
    '90d': 90 * 24 * 3600 * 1000,
    '180d': 180 * 24 * 3600 * 1000,
    '1y': 365 * 24 * 3600 * 1000
  };
  const duration = periodMap[period] || periodMap['7d'];
  const minTimestamp = Date.now() - duration;

  try {
    const rows = db.prepare(`
      SELECT timestamp, exchange, funding_rate, funding_interval 
      FROM funding_history 
      WHERE symbol = ? AND timestamp >= ? 
      ORDER BY timestamp ASC
    `).all(normalizedSymbol, minTimestamp) as { timestamp: number, exchange: string, funding_rate: number, funding_interval: number }[];

    // Group by timestamp
    const grouped = new Map<number, typeof rows>();
    for (const row of rows) {
      if (!grouped.has(row.timestamp)) grouped.set(row.timestamp, []);
      grouped.get(row.timestamp)!.push(row);
    }

    const data: HistoricalFundingItem[] = [];

    for (const [timestamp, exchangeRows] of Array.from(grouped.entries())) {
      const exchanges: Record<string, number | null> = {};
      let bestLong = '';
      let bestShort = '';
      let minNorm = Infinity;
      let maxNorm = -Infinity;

      for (const row of exchangeRows) {
        exchanges[row.exchange] = row.funding_rate;
        // Normalize to 8H equivalent for fair Best Long / Short comparison
        const normRate = row.funding_rate * (8 / (row.funding_interval || 8));
        
        if (normRate < minNorm) {
          minNorm = normRate;
          bestLong = row.exchange;
        }
        if (normRate > maxNorm) {
          maxNorm = normRate;
          bestShort = row.exchange;
        }
      }

      // Calculate spread based on normalized rates
      const longRateRaw = exchanges[bestLong] || 0;
      const shortRateRaw = exchanges[bestShort] || 0;
      const longNorm = longRateRaw * (8 / (exchangeRows.find(r => r.exchange === bestLong)?.funding_interval || 8));
      const shortNorm = shortRateRaw * (8 / (exchangeRows.find(r => r.exchange === bestShort)?.funding_interval || 8));
      const spread = shortNorm - longNorm;

      data.push({
        timestamp: new Date(timestamp).toISOString(),
        bestLong,
        bestShort,
        spread,
        exchanges
      });
    }

    return NextResponse.json<HistoricalFundingResponse>({
      symbol,
      period,
      data,
      message: data.length === 0 ? 'Data collection is starting.' : undefined
    });
  } catch (e) {
    console.error('Error fetching history:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

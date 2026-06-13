import { NextResponse } from 'next/server';
import { getExchangePrice } from '@/lib/getExchangePrice';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const exchange = searchParams.get('exchange') ?? '';
  const symbol = searchParams.get('symbol') ?? '';
  
  const price = await getExchangePrice(
    exchange, symbol
  );
  
  return NextResponse.json({ 
    price: price ?? 0,
    exchange,
    symbol,
    timestamp: Date.now(),
  });
}

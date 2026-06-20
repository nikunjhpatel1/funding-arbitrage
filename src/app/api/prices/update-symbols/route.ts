import { NextResponse } from 'next/server';
import { wsManager } from '@/lib/ws-manager';

export async function POST(req: Request) {
  try {
    const { symbols } = await req.json();
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array is required' }, { status: 400 });
    }
    
    // Cap at 150 symbols to avoid overwhelming exchange rate limits
    const cappedSymbols = symbols.slice(0, 150);
    
    wsManager.updateSymbols(cappedSymbols);
    
    return NextResponse.json({ success: true, count: cappedSymbols.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

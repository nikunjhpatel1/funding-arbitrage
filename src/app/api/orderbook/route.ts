import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbolParam = searchParams.get('symbol'); // e.g. BTC/USDT
  const exchangesParam = searchParams.get('exchanges');

  if (!symbolParam || !exchangesParam) {
    return NextResponse.json({ error: 'Missing symbol or exchanges' }, { status: 400 });
  }

  const base = symbolParam.split('/')[0];
  const exchanges = exchangesParam.split(',').map(e => e.trim().toLowerCase());

  const fetchers: Record<string, () => Promise<{ bids: [number, number][], asks: [number, number][] }>> = {
    binance: async () => {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/depth?symbol=${base}USDT&limit=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    bybit: async () => {
      const res = await fetch(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${base}USDT&limit=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.result.b.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: data.result.a.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    okx: async () => {
      const res = await fetch(`https://www.okx.com/api/v5/market/books?instId=${base}-USDT-SWAP&sz=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      const book = data.data[0];
      return {
        bids: book.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: book.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    bitget: async () => {
      const res = await fetch(`https://api.bitget.com/api/v2/mix/market/orderbook?symbol=${base}USDT&productType=usdt-futures&limit=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: data.data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    kucoin: async () => {
      const res = await fetch(`https://api-futures.kucoin.com/api/v1/level2/depth20?symbol=${base}USDTM`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.data.bids.map((b: any[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: data.data.asks.map((a: any[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    gateio: async () => {
      const res = await fetch(`https://api.gateio.ws/api/v4/futures/usdt/order_book?contract=${base}_USDT&limit=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.bids.map((b: any) => [parseFloat(b.p), parseFloat(b.s)]),
        asks: data.asks.map((a: any) => [parseFloat(a.p), parseFloat(a.s)]),
      };
    },
    mexc: async () => {
      const res = await fetch(`https://contract.mexc.com/api/v1/contract/depth/${base}_USDT?limit=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: data.data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    bingx: async () => {
      const res = await fetch(`https://open-api.bingx.com/openApi/swap/v2/quote/depth?symbol=${base}-USDT&limit=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.data.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: data.data.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    htx: async () => {
      const res = await fetch(`https://api.hbdm.com/linear-swap-ex/market/depth?contract_code=${base}-USDT&type=step0`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.tick.bids.map((b: number[]) => [b[0], b[1]]),
        asks: data.tick.asks.map((a: number[]) => [a[0], a[1]]),
      };
    },
    hyperliquid: async () => {
      const res = await fetch(`https://api.hyperliquid.xyz/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'l2Book', coin: base }),
        signal: AbortSignal.timeout(3000)
      });
      const data = await res.json();
      return {
        bids: data[0].levels.map((l: any) => [parseFloat(l.px), parseFloat(l.sz)]),
        asks: data[1].levels.map((l: any) => [parseFloat(l.px), parseFloat(l.sz)]),
      };
    },
    delta: async () => {
      const res = await fetch(`https://api.delta.exchange/v2/l2orderbook/${base}USDT`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.result.buy.map((b: any) => [parseFloat(b.price), parseFloat(b.size)]),
        asks: data.result.sell.map((a: any) => [parseFloat(a.price), parseFloat(a.size)]),
      };
    },
    blofin: async () => {
      const res = await fetch(`https://openapi.blofin.com/api/v1/market/books?instId=${base}-USDT&sz=50`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      const book = data.data[0];
      return {
        bids: book.bids.map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
        asks: book.asks.map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      };
    },
    dydx: async () => {
      const res = await fetch(`https://indexer.dydx.trade/v4/orderbooks/perpetualMarket/${base}-USD`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      return {
        bids: data.bids.map((b: any) => [parseFloat(b.price), parseFloat(b.size)]),
        asks: data.asks.map((a: any) => [parseFloat(a.price), parseFloat(a.size)]),
      };
    }
  };

  const results: Record<string, any> = {};

  const promises = exchanges.map(async (exchange) => {
    if (fetchers[exchange]) {
      try {
        const book = await fetchers[exchange]();
        results[exchange] = book;
      } catch (error) {
        console.error(`Error fetching orderbook for ${exchange}:`, error);
        results[exchange] = null;
      }
    } else {
      results[exchange] = null;
    }
  });

  await Promise.allSettled(promises);

  return NextResponse.json({ success: true, data: results });
}

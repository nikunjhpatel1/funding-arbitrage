export async function getExchangePrice(
  exchange: string, 
  symbol: string
): Promise<number | null> {
  const base = symbol.split('/')[0].toUpperCase();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(), 5000
  );
  
  try {
    let url = '';
    let parsePrice: (d: any) => number = () => 0;
    
    switch(exchange.toLowerCase()) {
      case 'binance':
        url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${base}USDT`;
        parsePrice = (d) => parseFloat(d.price);
        break;
      case 'bybit':
        url = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${base}USDT`;
        parsePrice = (d) => parseFloat(
          d?.result?.list?.[0]?.lastPrice ?? '0'
        );
        break;
      case 'okx':
        url = `https://www.okx.com/api/v5/market/ticker?instId=${base}-USDT-SWAP`;
        parsePrice = (d) => parseFloat(
          d?.data?.[0]?.last ?? '0'
        );
        break;
      case 'bitget':
        url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${base}USDT&productType=usdt-futures`;
        parsePrice = (d) => parseFloat(
          d?.data?.lastPr ?? '0'
        );
        break;
      case 'hyperliquid':
        url = 'https://api.hyperliquid.xyz/info';
        const hlRes = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({type: 'allMids'}),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const hlData = await hlRes.json();
        return parseFloat(hlData[base] ?? '0') || null;
      case 'dydx':
        url = `https://indexer.dydx.trade/v4/perpetualMarkets`;
        const dydxRes = await fetch(url, {
          signal: controller.signal
        });
        clearTimeout(timeout);
        const dydxData = await dydxRes.json();
        const market = dydxData?.markets?.[`${base}-USD`];
        return market 
          ? parseFloat(market.oraclePrice) 
          : null;
      case 'gateio':
        url = `https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=${base}_USDT`;
        parsePrice = (d) => parseFloat(
          d?.[0]?.last ?? '0'
        );
        break;
      case 'mexc':
        url = `https://contract.mexc.com/api/v1/contract/ticker?symbol=${base}_USDT`;
        parsePrice = (d) => parseFloat(
          d?.data?.lastPrice ?? '0'
        );
        break;
      default:
        // Fallback to Binance
        url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${base}USDT`;
        parsePrice = (d) => parseFloat(d.price);
    }
    
    const res = await fetch(url, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const price = parsePrice(data);
    return price > 0 ? price : null;
    
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

const urls = [
  { name: 'okx', url: 'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP' },
  { name: 'bitget', url: 'https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUMES' },
  { name: 'mexc', url: 'https://contract.mexc.com/api/v1/contract/funding_rate/BTC_USDT' },
  { name: 'kucoin', url: 'https://api-futures.kucoin.com/api/v1/ticker?symbol=XBTUSDTM' },
  { name: 'bingx', url: 'https://open-api.bingx.com/openApi/swap/v2/quote/ticker?symbol=BTC-USDT' },
  { name: 'htx', url: 'https://api.hbdm.com/linear-swap-ex/market/detail/merged?contract_code=BTC-USDT' },
  { name: 'blofin', url: 'https://openapi.blofin.com/api/v1/market/funding-rate?instId=BTC-USDT' },
  { name: 'coinswitch', url: 'https://coinswitch.co/trade/api/v2/futures/ticker?symbol=BTCUSDT&exchange=EXCHANGE_2' }
];

async function testAll() {
  for (const {name, url} of urls) {
    const s = Date.now();
    try {
      const r = await fetch(url);
      console.log(`${name}: ${r.status} in ${Date.now()-s}ms`);
    } catch(e) {
      console.log(`${name}: ERROR in ${Date.now()-s}ms (${e.message})`);
    }
  }
}
testAll();

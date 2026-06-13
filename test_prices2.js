const https = require('https');

function nativeGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { family: 4 }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function test() {
  try {
    const bitmex = await nativeGet('https://www.bitmex.com/api/v1/instrument/active');
    console.log('BitMEX first item:', Object.keys(bitmex[0]).filter(k => k.toLowerCase().includes('price')));
    
    const phemex = await nativeGet('https://api.phemex.com/md/v3/ticker/24hr/all');
    console.log('Phemex fields:', phemex.result.fields.filter(k => k.toLowerCase().includes('price')));
    
    const delta = await nativeGet('https://api.delta.exchange/v2/tickers');
    console.log('Delta first item:', Object.keys(delta.result[0]).filter(k => k.toLowerCase().includes('price')));
    
    const dydx = await nativeGet('https://api.dydx.exchange/v3/markets');
    const firstMarket = Object.values(dydx.markets)[0];
    console.log('dYdX first item:', Object.keys(firstMarket).filter(k => k.toLowerCase().includes('price')));
    
    const hyperliquid = await nativeGet('https://api.hyperliquid.xyz/info'); // this might need POST
  } catch (e) {
    console.error(e);
  }
}

test().catch(console.error);

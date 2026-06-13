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
  const bybit = await nativeGet('https://api.bybit.com/v5/market/tickers?category=linear');
  console.log('Bybit first item:', bybit.result.list[0]);
  
  const gateio = await nativeGet('https://api.gateio.ws/api/v4/futures/usdt/contracts');
  console.log('Gateio first item:', gateio[0]);
}

test().catch(console.error);


const fetch = require('node-fetch');

async function testBinance() {
  const res = await fetch('https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=20');
  const json = await res.json();
  console.log('Binance:', json.bids.length, json.asks.length);
}

testBinance().catch(console.error);


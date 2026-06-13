async function test() {
  const url1 = `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=USDT-FUTURES`;
  const url2 = `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures`;
  const r1 = await fetch(url1).then(r => r.json());
  const r2 = await fetch(url2).then(r => r.json());
  console.log("Upper:", r1);
  console.log("Lower:", r2);
}
test();

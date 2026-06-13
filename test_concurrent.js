const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const BITGET_FUND_RATE = (base) => `https://api.bitget.com/api/v2/mix/market/current-fund-rate?productType=USDT-FUTURES&symbol=${base}USDT`;

async function test() {
  const bases = ['BTC','ETH','XRP','SOL','DOGE','ADA','DOT','LTC','LINK','AVAX','MATIC','UNI','BCH','ATOM','NEAR'];
  const promises = bases.map(base => fetch(BITGET_FUND_RATE(base)).then(r => r.json()).then(r => console.log(base, r.msg)).catch(e => console.error(base, e.message, e.cause?.message)));
  await Promise.all(promises);
}
test();

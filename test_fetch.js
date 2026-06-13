const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const BITGET_FUND_RATE = (base) => `https://api.bitget.com/api/v2/mix/market/current-fund-rate?productType=USDT-FUTURES&symbol=${base}USDT`;
const MEXC_FUND_RATE = (base) => `https://contract.mexc.com/api/v1/contract/funding_rate/${base}_USDT`;
const KUCOIN_FUND_RATE = (base) => `https://api-futures.kucoin.com/api/v1/funding-rate/${base}USDTM`;

async function test() {
  const base = "BTC";
  try {
    const start = Date.now();
    const res = await fetch(BITGET_FUND_RATE(base), { signal: AbortSignal.timeout(5000) });
    console.log("Bitget Status:", res.status);
    console.log("Bitget body:", await res.text());
  } catch (e) {
    console.error("Bitget Error:", e.message);
  }

  try {
    const res = await fetch(MEXC_FUND_RATE(base), { signal: AbortSignal.timeout(5000) });
    console.log("MEXC Status:", res.status);
    console.log("MEXC body:", await res.text());
  } catch (e) {
    console.error("MEXC Error:", e.message);
  }

  try {
    const res = await fetch(KUCOIN_FUND_RATE(base), { signal: AbortSignal.timeout(5000) });
    console.log("KuCoin Status:", res.status);
    console.log("KuCoin body:", await res.text());
  } catch (e) {
    console.error("KuCoin Error:", e.message);
  }
}
test();

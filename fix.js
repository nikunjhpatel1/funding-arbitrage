const fs = require('fs');
let text = fs.readFileSync('./src/app/api/funding-rates/route.ts', 'utf8');
const replacement = `async function fetchHTX(bases: Iterable<string>, limit: any, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {
    if (Date.now() > deadline) return;
    try {
      const res = await fetchWithTimeout(HTX_FUND_RATE(base));
      if (!res.ok) return;
      const json = await res.json();
      const d = json?.data?.[0];
      if (!d) return;
      const rate = parseRate(d.funding_rate);
      if (rate === null) return;
      data.set(base, { rate, nextFunding: new Date(Number(d.next_funding_time)).toISOString() });
      anySuccess = true;
    } catch {}
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * BloFin
 * Field: fundingRate from /api/v1/market/funding-rate?instId={BASE}-USDT
 */
async function fetchBloFin(bases: Iterable<string>, limit: any, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {
    if (Date.now() > deadline) return;
    try {
      const res = await fetchWithTimeout(BLOFIN_FUND_RATE(base));
      if (!res.ok) return;
      const json = await res.json();
      if (json?.code !== '0') return;
      const d = json?.data?.[0];
      if (!d) return;
      const rate = parseRate(d.fundingRate);
      if (rate === null) return;
      data.set(base, {
        rate,
        nextFunding: d.fundingTime
          ? new Date(Number(d.fundingTime)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch {}
  })));
  return { data, ok: anySuccess || data.size > 0 };
}`;

const lines = text.split('\n');
const startIdx = lines.findIndex(l => l.includes('async function fetchHTX'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('/** Race a promise'));

lines.splice(startIdx, endIdx - startIdx, replacement);
fs.writeFileSync('./src/app/api/funding-rates/route.ts', lines.join('\n'));
console.log('Fixed');

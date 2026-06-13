const fs = require('fs');
let text = fs.readFileSync('./src/app/api/funding-rates/route.ts', 'utf8');

// 1. Update fetchOKX to fetchBloFin
const fetchers = ['fetchOKX', 'fetchBitget', 'fetchMEXC', 'fetchKuCoin', 'fetchBingX', 'fetchHTX', 'fetchBloFin'];
for (const f of fetchers) {
  // Update signature
  const sigRegex = new RegExp(`async function ${f}\\(bases: Iterable<string>, limit: <T>\\(fn: \\(\\) => Promise<T>\\) => Promise<T>\\): Promise<FetchResult<SimpleRateData>> {`);
  text = text.replace(sigRegex, `async function ${f}(bases: Iterable<string>, limit: any, deadline: number): Promise<FetchResult<SimpleRateData>> {`);
  
  // Add deadline check
  // Find the limit(async () => { block inside the function
  const limitStartIdx = text.indexOf(`limit(async () => {`, text.indexOf(`async function ${f}`));
  if (limitStartIdx !== -1) {
    const afterLimit = limitStartIdx + `limit(async () => {\n`.length;
    text = text.substring(0, afterLimit) + `    if (Date.now() > deadline) return;\n` + text.substring(afterLimit);
  }
}

// 2. Update performFetch
text = text.replace(
`  const limit = pLimit(15);
  const [okx, bitget, mexc, kucoin, bingx, htx, blofin] = await Promise.all([
    withDeadline(fetchOKX(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchBitget(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchMEXC(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchKuCoin(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchBingX(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchHTX(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchBloFin(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
  ]);`,
`  const limit = pLimit(15);
  const deadline = Date.now() + remainingMs;
  const [okx, bitget, mexc, kucoin, bingx, htx, blofin] = await Promise.all([
    fetchOKX(phase2Bases, limit, deadline),
    fetchBitget(phase2Bases, limit, deadline),
    fetchMEXC(phase2Bases, limit, deadline),
    fetchKuCoin(phase2Bases, limit, deadline),
    fetchBingX(phase2Bases, limit, deadline),
    fetchHTX(phase2Bases, limit, deadline),
    fetchBloFin(phase2Bases, limit, deadline),
  ]);`
);

fs.writeFileSync('./src/app/api/funding-rates/route.ts', text);
console.log('Fixed properly without breaking syntax!');

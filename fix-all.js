const fs = require('fs');
let text = fs.readFileSync('./src/app/api/funding-rates/route.ts', 'utf8');

// 1. Remove import pLimit if it exists
text = text.replace(/import pLimit from 'p-limit';\n?/g, '');

// 2. Change signature of all per-symbol fetchers
const fetchers = ['fetchOKX', 'fetchBitget', 'fetchMEXC', 'fetchKuCoin', 'fetchBingX', 'fetchHTX', 'fetchBloFin'];
fetchers.forEach(f => {
  text = text.replace(new RegExp(`async function ${f}\\(bases: Iterable<string>, limit: <T>\\(fn: \\(\\) => Promise<T>\\) => Promise<T>\\): Promise<FetchResult<SimpleRateData>> {`),
                      `async function ${f}(bases: Iterable<string>, limit: any, deadline: number): Promise<FetchResult<SimpleRateData>> {`);
});

// 3. Add deadline check inside limit
text = text.replace(/=> limit\(async \(\) => {\n\s+try {/g, '=> limit(async () => {\n    if (Date.now() > deadline) return;\n    try {');

// 4. Update performFetch 
// Add symbolLimit and deadline
text = text.replace(/const \[\n\s+binance, bybit, gateio, bitmex, phemex, delta, dydx, hyperliquid, batchTickers,\n\s+okx, bitget, mexc, kucoin, bingx, htx, blofin\n\s+\] = await Promise.all\(\[/,
`  const symbolLimit = pLimit(15);
  const deadline = Date.now() + phase1Ms;

  const [
    binance, bybit, gateio, bitmex, phemex, delta, dydx, hyperliquid, batchTickers,
    okx, bitget, mexc, kucoin, bingx, htx, blofin
  ] = await Promise.all([`);

// Update Phase 2 calls
const newPhase2 = `    fetchOKX(topBases, symbolLimit, deadline),
    fetchBitget(topBases, symbolLimit, deadline),
    fetchMEXC(topBases, symbolLimit, deadline),
    fetchKuCoin(topBases, symbolLimit, deadline),
    fetchBingX(topBases, symbolLimit, deadline),
    fetchHTX(topBases, symbolLimit, deadline),
    fetchBloFin(topBases, symbolLimit, deadline),
  ]);`;

text = text.replace(/withDeadline\(fetchOKX[\s\S]*?fetchBloFin[\s\S]*?\]\);/g, newPhase2);

fs.writeFileSync('./src/app/api/funding-rates/route.ts', text);
console.log('Successfully applied all fixes to route.ts!');

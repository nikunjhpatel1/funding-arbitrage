const fs = require('fs');
let text = fs.readFileSync('./src/app/api/funding-rates/route.ts', 'utf8');

const fetchers = ['fetchOKX', 'fetchBitget', 'fetchMEXC', 'fetchKuCoin', 'fetchBingX', 'fetchHTX', 'fetchBloFin'];
for (const f of fetchers) {
  const oldSig = `async function ${f}(bases: Iterable<string>, limit: <T>(fn: () => Promise<T>) => Promise<T>): Promise<FetchResult<SimpleRateData>> {`;
  const newSig = `async function ${f}(bases: Iterable<string>, limit: any, deadline: number): Promise<FetchResult<SimpleRateData>> {`;
  if (text.includes(oldSig)) {
    text = text.replace(oldSig, newSig);
    console.log(`Updated signature for ${f}`);
  } else {
    console.error(`Could not find signature for ${f}`);
  }

  const limitStartIdx = text.indexOf(`limit(async () => {`, text.indexOf(`async function ${f}`));
  if (limitStartIdx !== -1) {
    const afterLimit = limitStartIdx + `limit(async () => {\n`.length;
    text = text.substring(0, afterLimit) + `    if (Date.now() > deadline) return;\n` + text.substring(afterLimit);
    console.log(`Added deadline check to ${f}`);
  }
}

fs.writeFileSync('./src/app/api/funding-rates/route.ts', text);

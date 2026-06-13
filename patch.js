const fs = require('fs');
let text = fs.readFileSync('./src/app/api/funding-rates/route.ts', 'utf8');

text = text.replace(/\r\n/g, '\n');

const OLD_BLOCK = `  const limit = pLimit(15);
  const [okx, bitget, mexc, kucoin, bingx, htx, blofin] = await Promise.all([
    withDeadline(fetchOKX(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchBitget(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchMEXC(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchKuCoin(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchBingX(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchHTX(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(fetchBloFin(phase2Bases, limit), remainingMs).then(r => r ?? { data: new Map(), ok: false }),
  ]);`;

const NEW_BLOCK = `  const limit = pLimit(15);
  const deadline = Date.now() + remainingMs;
  const [okx, bitget, mexc, kucoin, bingx, htx, blofin] = await Promise.all([
    fetchOKX(phase2Bases, limit, deadline),
    fetchBitget(phase2Bases, limit, deadline),
    fetchMEXC(phase2Bases, limit, deadline),
    fetchKuCoin(phase2Bases, limit, deadline),
    fetchBingX(phase2Bases, limit, deadline),
    fetchHTX(phase2Bases, limit, deadline),
    fetchBloFin(phase2Bases, limit, deadline),
  ]);`;

if (text.includes(OLD_BLOCK)) {
  text = text.replace(OLD_BLOCK, NEW_BLOCK);
  console.log('Replaced performFetch block!');
} else {
  console.error('Could not find performFetch block!');
}

fs.writeFileSync('./src/app/api/funding-rates/route.ts', text);

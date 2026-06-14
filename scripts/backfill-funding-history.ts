import db from '../src/lib/db';

const TOP_BASES = [
  'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','TRX',
  'OP','ARB','INJ','WLD','SUI','APT','NEAR','LTC','UNI','ATOM',
  'TON','PEPE','DOT','FIL','ENA','TIA','SEI','JUP','ONDO','RUNE',
  'ORDI','BLUR','GMX','DYDX','PENDLE','AAVE','MANTA','ALT','JTO',
  'PYTH','WIF','BONK','FLOKI','BRETT','POPCAT','MEW','GOAT','PNUT',
  'ACT','VIRTUAL','AI16Z','FARTCOIN','IMX','SAND','MANA','GRT',
  'LDO','FTM','MATIC','OMG',
];

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('STEP 1: Adding unique index...');
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_history_unique ON funding_rate_history(symbol, exchange, recorded_at);`);
    console.log('Unique index idx_history_unique created successfully.');
  } catch (e: any) {
    console.error('Failed to create index:', e.message);
  }

  const now = Date.now();
  const days60 = 60 * 24 * 60 * 60 * 1000;
  const days14 = 14 * 24 * 60 * 60 * 1000;
  
  const startTime60 = now - days60;
  const startTime14 = now - days14;

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO funding_rate_history 
    (symbol, exchange, funding_rate, price, next_funding_time, funding_interval_hours, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  console.log('STEP 2: Starting backfill for 8 exchanges...');
  
  for (const base of TOP_BASES) {
    console.log(`\n--- Processing ${base} ---`);

    // 1. Binance
    try {
      const sym = `${base}USDT`;
      let currentStartTime = startTime60;
      let recordsAdded = 0;
      while (currentStartTime < now) {
        const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&startTime=${currentStartTime}&limit=1000`;
        const res = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        
        let maxTs = 0;
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.fundingRate);
            const ts = Number(d.fundingTime);
            const pr = Number(d.markPrice || 0);
            insertStmt.run(`${base}/USDT`, 'binance', rt, pr, null, 8, ts);
            if (ts > maxTs) maxTs = ts;
          }
        })();
        recordsAdded += data.length;
        await delay(250);
        if (data.length < 1000) break;
        currentStartTime = maxTs + 1;
      }
      console.log(`Binance: +${recordsAdded}`);
    } catch(e: any) { console.error(`Binance ${base} failed: ${e.message}`); }

    // 2. Bybit
    try {
      const sym = `${base}USDT`;
      let currentStartTime = startTime60;
      let recordsAdded = 0;
      while (currentStartTime < now) {
        const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&startTime=${currentStartTime}&limit=200`;
        const res = await fetch(url);
        const json = await res.json();
        const data = json?.result?.list;
        if (!Array.isArray(data) || data.length === 0) break;
        
        let maxTs = 0;
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.fundingRate);
            const ts = Number(d.fundingRateTimestamp);
            insertStmt.run(`${base}/USDT`, 'bybit', rt, 0, null, 8, ts);
            if (ts > maxTs) maxTs = ts;
          }
        })();
        recordsAdded += data.length;
        await delay(250);
        if (data.length < 200) break;
        currentStartTime = maxTs + 1;
      }
      console.log(`Bybit: +${recordsAdded}`);
    } catch(e: any) { console.error(`Bybit ${base} failed: ${e.message}`); }

    // 3. OKX
    try {
      const sym = `${base}-USDT-SWAP`;
      let currentAfter = '';
      let recordsAdded = 0;
      while (true) {
        const url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${sym}&limit=100${currentAfter ? '&after=' + currentAfter : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        const data = json?.data;
        if (!Array.isArray(data) || data.length === 0) break;
        
        let oldestTs = now;
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.fundingRate);
            const ts = Number(d.fundingTime);
            if (ts >= startTime60) {
              insertStmt.run(`${base}/USDT`, 'okx', rt, 0, null, 8, ts);
              recordsAdded++;
            }
            if (ts < oldestTs) oldestTs = ts;
          }
        })();
        if (oldestTs < startTime60) break;
        currentAfter = oldestTs.toString();
        await delay(250);
        if (data.length < 100) break;
      }
      console.log(`OKX: +${recordsAdded}`);
    } catch(e: any) { console.error(`OKX ${base} failed: ${e.message}`); }

    // 4. BITGET
    try {
      const sym = `${base}USDT`;
      let pageNo = 1;
      let recordsAdded = 0;
      while (true) {
        const url = `https://api.bitget.com/api/v2/mix/market/history-fund-rate?symbol=${sym}&productType=usdt-futures&pageSize=100&pageNo=${pageNo}`;
        const res = await fetch(url);
        const json = await res.json();
        const data = json?.data;
        if (!Array.isArray(data) || data.length === 0) break;
        
        let oldestTs = now;
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.fundingRate);
            const ts = Number(d.fundingTime);
            if (ts >= startTime60) {
              insertStmt.run(`${base}/USDT`, 'bitget', rt, 0, null, 8, ts);
              recordsAdded++;
            }
            if (ts < oldestTs) oldestTs = ts;
          }
        })();
        if (oldestTs < startTime60) break;
        await delay(250);
        if (data.length < 100) break;
        pageNo++;
      }
      console.log(`Bitget: +${recordsAdded}`);
    } catch(e: any) { console.error(`Bitget ${base} failed: ${e.message}`); }

    // 5. KUCOIN
    try {
      const sym = base === 'BTC' ? 'XBTUSDTM' : `${base}USDTM`;
      let currentStartTime = startTime60;
      let recordsAdded = 0;
      while (currentStartTime < now) {
        const currentEndTime = Math.min(now, currentStartTime + 15 * 24 * 60 * 60 * 1000); // 15 days chunk to be safe
        const url = `https://api-futures.kucoin.com/api/v1/contract/funding-rates?symbol=${sym}&from=${currentStartTime}&to=${currentEndTime}`;
        const res = await fetch(url);
        const json = await res.json();
        const data = json?.data;
        
        if (Array.isArray(data) && data.length > 0) {
          db.transaction(() => {
            for (const d of data) {
              const rt = Number(d.fundingRate);
              const ts = Number(d.timepoint);
              insertStmt.run(`${base}/USDT`, 'kucoin', rt, 0, null, 8, ts);
            }
          })();
          recordsAdded += data.length;
        }
        await delay(250);
        currentStartTime = currentEndTime + 1;
      }
      console.log(`KuCoin: +${recordsAdded}`);
    } catch(e: any) { console.error(`KuCoin ${base} failed: ${e.message}`); }

    // 6. HYPERLIQUID
    try {
      const body = { type: "fundingHistory", coin: base, startTime: startTime14, endTime: now };
      const url = `https://api.hyperliquid.xyz/info`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      let recordsAdded = 0;
      if (Array.isArray(data)) {
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.fundingRate);
            const ts = Number(d.time);
            insertStmt.run(`${base}/USDT`, 'hyperliquid', rt, 0, null, 1, ts);
          }
        })();
        recordsAdded = data.length;
      }
      console.log(`Hyperliquid: +${recordsAdded}`);
      await delay(250);
    } catch(e: any) { console.error(`Hyperliquid ${base} failed: ${e.message}`); }

    // 7. BITMEX
    try {
      const sym = `${base === 'BTC' ? 'XBT' : base}USDT`;
      let currentStartTime = startTime60;
      let recordsAdded = 0;
      while (currentStartTime < now) {
        const stIso = new Date(currentStartTime).toISOString();
        const url = `https://www.bitmex.com/api/v1/funding?symbol=${sym}&startTime=${encodeURIComponent(stIso)}&count=500&reverse=false`;
        const res = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        
        let maxTs = 0;
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.fundingRate);
            const ts = new Date(d.timestamp).getTime();
            insertStmt.run(`${base}/USDT`, 'bitmex', rt, 0, null, 8, ts);
            if (ts > maxTs) maxTs = ts;
          }
        })();
        recordsAdded += data.length;
        await delay(250);
        if (data.length < 500) break;
        currentStartTime = maxTs + 1;
      }
      console.log(`BitMEX: +${recordsAdded}`);
    } catch(e: any) { console.error(`BitMEX ${base} failed: ${e.message}`); }

    // 8. DYDX
    try {
      const ticker = `${base}-USD`;
      let currentBefore = new Date(now).toISOString();
      let earliestSeen = now;
      let recordsAdded = 0;
      while (true) {
        const url = `https://indexer.dydx.trade/v4/historicalFunding/${ticker}?effectiveBeforeOrAt=${encodeURIComponent(currentBefore)}&limit=100`;
        const res = await fetch(url);
        const json = await res.json();
        const data = json?.historicalFunding;
        if (!Array.isArray(data) || data.length === 0) break;
        
        db.transaction(() => {
          for (const d of data) {
            const rt = Number(d.rate);
            const pr = Number(d.price);
            const ts = new Date(d.effectiveAt).getTime();
            if (ts >= startTime14) {
              insertStmt.run(`${base}/USDT`, 'dydx', rt, pr, null, 1, ts);
              recordsAdded++;
            }
            if (ts < earliestSeen) earliestSeen = ts;
          }
        })();
        if (earliestSeen <= startTime14) break;
        currentBefore = new Date(earliestSeen - 1).toISOString();
        await delay(250);
        if (data.length < 100) break;
      }
      console.log(`dYdX: +${recordsAdded}`);
    } catch(e: any) { console.error(`dYdX ${base} failed: ${e.message}`); }

  }

  console.log('\\n--- Backfill complete! ---');
}

run().catch(console.error);

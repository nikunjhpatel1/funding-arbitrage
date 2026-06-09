import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// ─── API endpoints ────────────────────────────────────────────────────────────
// Batch exchanges (return all pairs in one call)
const BINANCE_PREMIUM = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const BINANCE_TICKER = 'https://fapi.binance.com/fapi/v1/ticker/24hr';
const BINANCE_FUND_INFO = 'https://fapi.binance.com/fapi/v1/fundingInfo';   // ← interval data
const BYBIT_TICKERS = 'https://api.bybit.com/v5/market/tickers?category=linear';
const GATE_CONTRACTS = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';
const BITMEX_INSTR = `https://www.bitmex.com/api/v1/instrument?filter=${encodeURIComponent('{"typ":"FFWCSX"}')}&count=500&reverse=false`;
const PHEMEX_TICKERS = 'https://api.phemex.com/md/v3/ticker/24hr/all';
const DELTA_PRODUCTS = 'https://api.delta.exchange/v2/products?contract_types=perpetual_futures';
const DELTA_TICKERS = 'https://api.delta.exchange/v2/tickers';
const DYDX_MARKETS = 'https://indexer.dydx.trade/v4/perpetualMarkets';
const HL_INFO = 'https://api.hyperliquid.xyz/info';

// Per-symbol exchanges (one request per pair)
const OKX_FUNDING = (b: string) => `https://www.okx.com/api/v5/public/funding-rate?instId=${b}-USDT-SWAP`;
const BITGET_FUND_RATE = (b: string) => `https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=${b}USDT&productType=usdt-futures`;
const MEXC_FUND_RATE = (b: string) => `https://contract.mexc.com/api/v1/contract/funding_rate/${b}_USDT`;
const KUCOIN_FUND_RATE = (sym: string) => `https://api-futures.kucoin.com/api/v1/funding-rate/${sym}/current`;
const BINGX_FUND_RATE = (b: string) => `https://open-api.bingx.com/openApi/swap/v2/quote/fundingRate?symbol=${b}-USDT`;
const HTX_FUND_RATE = (b: string) => `https://api.hbdm.com/swap-api/v1/swap_funding_rate?contract_code=${b}-USD`;
const BLOFIN_FUND_RATE = (b: string) => `https://openapi.blofin.com/api/v1/market/funding-rate?instId=${b}-USDT`;

const FETCH_TIMEOUT_MS = 12_000;

// ─── Exported types ───────────────────────────────────────────────────────────
export interface FundingRateEntry {
  id: string;
  symbol: string;
  baseAsset: string;
  logoColor: string;
  logoText: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  /** Funding interval in hours from Binance fundingInfo (1 | 4 | 8). Default 8. */
  fundingIntervalHours: number;
  // ── Exchange rates — NEVER capped, NEVER filtered, null = no data ──────────
  binance: number | null;
  bybit: number | null;
  okx: number | null;
  bitget: number | null;
  kucoin: number | null;
  gateio: number | null;
  mexc: number | null;
  bingx: number | null;
  htx: number | null;
  bitmex: number | null;
  dydx: number | null;
  hyperliquid: number | null;
  phemex: number | null;
  blofin: number | null;
  delta: number | null;
  // ─────────────────────────────────────────────────────────────────────────
  maxSpread: number;
  opportunity: 'hot' | 'mild' | 'low';
  nextFunding: string;
  exchangeErrors: string[];
}

export interface ApiResponse {
  data: FundingRateEntry[];
  updatedAt: string;
  exchangeStatus: Record<string, 'ok' | 'error'>;
}

// ─── Logo colours for well-known tokens ──────────────────────────────────────
const ASSET_COLORS: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', BNB: '#f3ba2f',
  XRP: '#346aa9', DOGE: '#c2a633', ADA: '#0033ad', AVAX: '#e84142',
  LINK: '#2a5ada', TRX: '#ff0013', OP: '#ff0420', ARB: '#12aaff',
  INJ: '#00b4d4', WLD: '#5865f2', SUI: '#4da2ff', APT: '#2dc2b0',
  NEAR: '#00c08b', LTC: '#bfbbbb', UNI: '#ff007a', ATOM: '#6f4caf',
  TON: '#0098ea', PEPE: '#2ea033', DOT: '#e6007a', FIL: '#0090ff',
  ENA: '#9f1239', TIA: '#7c3aed', SEI: '#b91c1c', JUP: '#e0812e',
  ONDO: '#1a56db', RUNE: '#33ff99', ORDI: '#f7931a', BLUR: '#ff6600',
  GMX: '#00d4ff', DYDX: '#6966ff', PENDLE: '#20c997', AAVE: '#2ebac6',
  MANTA: '#1daef5', ALT: '#9d50ff', JTO: '#19fb9b', PYTH: '#9b59b6',
  WIF: '#f39c12', BONK: '#ff6b35', FLOKI: '#f5a623', BRETT: '#e74c3c',
  POPCAT: '#1abc9c', MEW: '#3498db', GOAT: '#95a5a6', PNUT: '#e67e22',
  ACT: '#2c3e50', VIRTUAL: '#8e44ad', AI16Z: '#27ae60', FARTCOIN: '#e74c3c',
};

/** Deterministic hue-based colour for any unknown token */
function logoColorFor(base: string): string {
  if (ASSET_COLORS[base]) return ASSET_COLORS[base];
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (Math.imul(31, h) + base.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 65%, 55%)`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a rate value; returns null for any invalid / undefined input. Never caps. */
function parseRate(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function opportunityLevel(spread: number): 'hot' | 'mild' | 'low' {
  if (spread >= 0.005) return 'hot';   // ≥ 0.5%
  if (spread >= 0.001) return 'mild';  // ≥ 0.1%
  return 'low';
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Internal data shapes ─────────────────────────────────────────────────────
interface PriceStats {
  price: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  nextFunding: string;
}
interface BinanceData extends PriceStats { rate: number; }
interface SimpleRateData { rate: number; nextFunding?: string; }
interface DydxData extends PriceStats { rate: number; }

interface FetchResult<T> { data: Map<string, T>; ok: boolean; }
interface BinanceFetchResult extends FetchResult<BinanceData> {
  /** base → funding interval in hours (1 | 4 | 8) */
  intervalMap: Map<string, number>;
}

// ─── Exchange fetchers ────────────────────────────────────────────────────────

/**
 * Binance USDM Futures
 * Fetches ALL perpetual pairs + per-symbol funding intervals from /fapi/v1/fundingInfo.
 * Field: lastFundingRate from /fapi/v1/premiumIndex
 */
async function fetchBinance(): Promise<BinanceFetchResult> {
  const data = new Map<string, BinanceData>();
  const intervalMap = new Map<string, number>();
  try {
    const [premRes, tickRes, infoRes] = await Promise.all([
      fetchWithTimeout(BINANCE_PREMIUM),
      fetchWithTimeout(BINANCE_TICKER),
      fetchWithTimeout(BINANCE_FUND_INFO),
    ]);
    if (!premRes.ok) return { data, intervalMap, ok: false };

    // ── Build interval map from fundingInfo ───────────────────────────────────
    if (infoRes.ok) {
      const info: Array<{ symbol: string; fundingIntervalHours: number }> = await infoRes.json();
      for (const item of info) {
        if (!item.symbol.endsWith('USDT')) continue;
        intervalMap.set(item.symbol.slice(0, -4), item.fundingIntervalHours ?? 8);
      }
    }

    // ── Ticker map for price/volume ───────────────────────────────────────────
    const tickers: Array<{
      symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string;
    }> = tickRes.ok ? await tickRes.json() : [];
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    // ── Parse all USDT perps from premiumIndex ────────────────────────────────
    const premium: Array<{
      symbol: string; lastFundingRate: string; nextFundingTime: number; markPrice: string;
    }> = await premRes.json();

    for (const item of premium) {
      if (!item.symbol.endsWith('USDT')) continue;
      const base = item.symbol.slice(0, -4);
      const rate = parseRate(item.lastFundingRate);
      if (rate === null) continue;
      const tk = tickerMap.get(item.symbol);
      data.set(base, {
        rate,
        price: parseFloat(tk?.lastPrice ?? item.markPrice ?? '0'),
        priceChange24h: parseFloat(tk?.priceChangePercent ?? '0'),
        volume24h: parseFloat(tk?.quoteVolume ?? '0'),
        openInterest: 0,
        nextFunding: new Date(item.nextFundingTime).toISOString(),
      });
    }
    return { data, intervalMap, ok: data.size > 0 };
  } catch (e) {
    console.error('[Binance]', e instanceof Error ? e.message : e);
    return { data, intervalMap, ok: false };
  }
}

/**
 * Bybit Linear Perpetuals — ALL USDT pairs (batch)
 * Field: fundingRate from /v5/market/tickers
 */
async function fetchBybit(): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  try {
    const res = await fetchWithTimeout(BYBIT_TICKERS);
    if (!res.ok) return { data, ok: false };
    const json = await res.json();
    const list: Array<{ symbol: string; fundingRate: string; nextFundingTime: string }> =
      json?.result?.list ?? [];

    for (const item of list) {
      if (!item.symbol.endsWith('USDT')) continue;
      const base = item.symbol.slice(0, -4);
      const rate = parseRate(item.fundingRate);
      if (rate === null) continue;
      data.set(base, {
        rate,
        nextFunding: new Date(Number(item.nextFundingTime)).toISOString(),
      });
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[Bybit]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

/**
 * Gate.io USDT Futures — ALL pairs (batch)
 * Field: funding_rate from /api/v4/futures/usdt/contracts
 */
async function fetchGateio(): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  try {
    const res = await fetchWithTimeout(GATE_CONTRACTS);
    if (!res.ok) return { data, ok: false };
    const list: Array<{ name: string; funding_rate: string; next_funding_time: number }> =
      await res.json();

    for (const item of list) {
      if (!item.name.endsWith('_USDT')) continue;
      const base = item.name.slice(0, -5);
      const rate = parseRate(item.funding_rate);
      if (rate === null) continue;
      data.set(base, {
        rate,
        nextFunding: item.next_funding_time
          ? new Date(item.next_funding_time * 1000).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[Gate.io]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

/**
 * BitMEX — ALL FFWCSX (perpetual) instruments (batch)
 * Field: fundingRate from /api/v1/instrument
 */
async function fetchBitMEX(): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  try {
    const res = await fetchWithTimeout(BITMEX_INSTR);
    if (!res.ok) return { data, ok: false };
    const instruments: Array<{
      symbol: string; rootSymbol: string; quoteCurrency: string;
      fundingRate: number | null; fundingTimestamp: string | null;
    }> = await res.json();

    for (const inst of instruments) {
      if (inst.quoteCurrency !== 'USDT') continue;
      const base = inst.rootSymbol === 'XBT' ? 'BTC' : inst.rootSymbol;
      const rate = parseRate(inst.fundingRate);
      if (rate === null) continue;
      data.set(base, {
        rate,
        nextFunding: inst.fundingTimestamp
          ? new Date(inst.fundingTimestamp).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[BitMEX]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

/**
 * Phemex — ALL USDT perpetual tickers (batch)
 * Field: fundingRateEr (÷10^8) from /md/v3/ticker/24hr/all
 */
async function fetchPhemex(): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  try {
    const res = await fetchWithTimeout(PHEMEX_TICKERS);
    if (!res.ok) return { data, ok: false };
    const json = await res.json();
    if (json?.error) return { data, ok: false };

    const result = json?.result ?? json;
    const fields: string[] = result?.fields ?? [];
    const rawTicks: unknown[] = result?.tick ?? result?.data ?? [];

    const symIdx = fields.indexOf('symbol');
    const frErIdx = fields.indexOf('fundingRateEr');    // PRIMARY: ×10^8
    const frRrIdx = fields.indexOf('fundingRateRr');    // FALLBACK: decimal
    const nextFundIdx = fields.indexOf('nextFundingTimeEp');
    const isColumnar = fields.length > 0 && Array.isArray(rawTicks[0]);

    if (isColumnar) {
      for (const row of rawTicks as string[][]) {
        const sym = row[symIdx >= 0 ? symIdx : 0] ?? '';
        if (!sym.endsWith('USDT')) continue;
        const base = sym.slice(0, -4);

        let rate: number | null = null;
        if (frErIdx >= 0 && row[frErIdx] != null && row[frErIdx] !== '') {
          const er = parseRate(row[frErIdx]); if (er !== null) rate = er / 1e8;
        }
        if (rate === null && frRrIdx >= 0) rate = parseRate(row[frRrIdx]);
        if (rate === null) continue;

        const nextTs = nextFundIdx >= 0 ? Number(row[nextFundIdx]) : 0;
        data.set(base, {
          rate,
          nextFunding: nextTs > 0
            ? new Date(nextTs * 1000).toISOString()
            : new Date(Date.now() + 28_800_000).toISOString(),
        });
      }
    } else {
      for (const tick of rawTicks as Record<string, unknown>[]) {
        const sym = String(tick.symbol ?? '');
        if (!sym.endsWith('USDT')) continue;
        const base = sym.slice(0, -4);

        let rate: number | null = null;
        if (tick.fundingRateEr != null && tick.fundingRateEr !== '') {
          const er = parseRate(tick.fundingRateEr as string | number);
          if (er !== null) rate = er / 1e8;
        }
        if (rate === null && tick.fundingRateRr != null)
          rate = parseRate(tick.fundingRateRr as string | number);
        if (rate === null && tick.fundingRate != null)
          rate = parseRate(tick.fundingRate as string | number);
        if (rate === null) continue;

        const nextTs = Number(tick.nextFundingTimeEp ?? tick.nextFundingTime ?? 0);
        data.set(base, {
          rate,
          nextFunding: nextTs > 0
            ? new Date(nextTs > 1e12 ? nextTs : nextTs * 1000).toISOString()
            : new Date(Date.now() + 28_800_000).toISOString(),
        });
      }
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[Phemex]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

/**
 * Delta Exchange (Global) — ALL perps (batch, 2 calls)
 * Field: funding_rate from /v2/tickers
 */
async function fetchDelta(): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  try {
    const [prodRes, tickRes] = await Promise.all([
      fetchWithTimeout(DELTA_PRODUCTS),
      fetchWithTimeout(DELTA_TICKERS),
    ]);
    if (!prodRes.ok || !tickRes.ok) return { data, ok: false };

    const prodJson = await prodRes.json();
    const tickJson = await tickRes.json();

    const products: Array<{ symbol: string; underlying_asset?: { symbol: string } }> =
      prodJson?.result ?? [];
    const tickers: Array<{ symbol: string; funding_rate: string | number | null; next_funding_realization?: string }> =
      tickJson?.result ?? [];
    const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));

    for (const prod of products) {
      const underlying = prod.underlying_asset?.symbol ?? '';
      let base = underlying.replace(/^\./, '').toUpperCase();
      if (!base || base.length === 0) {
        const clean = prod.symbol.replace(/_/g, '');
        if (clean.endsWith('USDT')) base = clean.slice(0, -4);
        else if (clean.endsWith('USD')) base = clean.slice(0, -3);
      }
      if (!base) continue;

      const ticker = tickerMap.get(prod.symbol);
      if (!ticker) continue;
      const rate = parseRate(ticker.funding_rate);
      if (rate === null) continue;

      data.set(base, {
        rate,
        nextFunding: ticker.next_funding_realization
          ? new Date(ticker.next_funding_realization).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[Delta]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

/**
 * dYdX v4 — ALL active markets (batch)
 * Field: nextFundingRate from /v4/perpetualMarkets
 */
async function fetchDydx(): Promise<FetchResult<DydxData>> {
  const data = new Map<string, DydxData>();
  try {
    const res = await fetchWithTimeout(DYDX_MARKETS);
    if (!res.ok) return { data, ok: false };
    const json = await res.json();
    const markets: Record<string, {
      status: string; nextFundingRate: string; oraclePrice: string;
      priceChange24H: string; volume24H: string; openInterest: string;
      nextFundingAt?: string;
    }> = json?.markets ?? {};

    for (const [ticker, mkt] of Object.entries(markets)) {
      if (mkt.status !== 'ACTIVE') continue;
      const [base] = ticker.split('-');
      const rate = parseRate(mkt.nextFundingRate);
      if (rate === null) continue;
      const oraclePrice = parseFloat(mkt.oraclePrice || '0');
      data.set(base, {
        rate,
        price: oraclePrice,
        priceChange24h: oraclePrice
          ? parseFloat(mkt.priceChange24H) / oraclePrice * 100
          : 0,
        volume24h: parseFloat(mkt.volume24H),
        openInterest: parseFloat(mkt.openInterest) * oraclePrice,
        nextFunding: mkt.nextFundingAt ?? new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[dYdX]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

/**
 * Hyperliquid — ALL assets (batch POST)
 * Field: funding from POST /info {type:"metaAndAssetCtxs"}
 * Note: Hyperliquid funds every 1 hour. Rate is stored as 1h rate.
 * We display it as-is; the interval column will show "1h".
 */
async function fetchHyperliquid(): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  try {
    const res = await fetchWithTimeout(HL_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!res.ok) return { data, ok: false };
    const json = await res.json();
    const universe: Array<{ name: string }> = json?.[0]?.universe ?? [];
    const ctxs: Array<{ funding: string }> = json?.[1] ?? [];

    for (let i = 0; i < universe.length; i++) {
      const base = universe[i].name;
      // 1h raw rate; multiply ×8 to normalise to 8h equivalent for spread comparison
      const hourlyRate = parseRate(ctxs[i]?.funding);
      if (hourlyRate === null) continue;
      const nextHour = new Date();
      nextHour.setUTCMinutes(0, 0, 0);
      nextHour.setUTCHours(nextHour.getUTCHours() + 1);
      data.set(base, {
        rate: parseFloat((hourlyRate * 8).toFixed(8)),
        nextFunding: nextHour.toISOString(),
      });
    }
    return { data, ok: data.size > 0 };
  } catch (e) {
    console.error('[Hyperliquid]', e instanceof Error ? e.message : e);
    return { data, ok: false };
  }
}

// ─── Per-symbol fetchers (accept bases from Phase 1) ─────────────────────────

/**
 * OKX USDT-margined Swaps
 * Field: fundingRate from /api/v5/public/funding-rate
 */
async function fetchOKX(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => {
    try {
      const res = await fetchWithTimeout(OKX_FUNDING(base));
      if (!res.ok) return;
      const json = await res.json();
      const d = json?.data?.[0];
      if (!d) return;
      const rate = parseRate(d.fundingRate);
      if (rate === null) return;
      data.set(base, { rate, nextFunding: new Date(Number(d.fundingTime)).toISOString() });
      anySuccess = true;
    } catch { /* instrument may not exist on OKX */ }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * Bitget USDT Futures
 * Field: fundingRate from /api/v2/mix/market/current-fund-rate
 */
async function fetchBitget(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => {
    try {
      const res = await fetchWithTimeout(BITGET_FUND_RATE(base));
      if (!res.ok) return;
      const json = await res.json();
      if (json?.code !== '00000') return;
      const d = json?.data;
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
    } catch { }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * MEXC Contract
 * Field: fundingRate from /api/v1/contract/funding_rate/{symbol}
 */
async function fetchMEXC(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => {
    try {
      const res = await fetchWithTimeout(MEXC_FUND_RATE(base));
      if (!res.ok) return;
      const json = await res.json();
      if (!json?.success && json?.code !== 0) return;
      const d = json?.data;
      if (!d) return;
      const rate = parseRate(d.fundingRate);
      if (rate === null) return;
      data.set(base, {
        rate,
        nextFunding: d.nextSettleTime
          ? new Date(Number(d.nextSettleTime)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch { }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * KuCoin Futures
 * Field: fundingRate (→ value → predictedValue) from /api/v1/funding-rate/{symbol}/current
 */
async function fetchKuCoin(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  const kuCoinSym = (b: string) => b === 'BTC' ? 'XBTUSDTM' : `${b}USDTM`;

  await Promise.allSettled([...bases].map(async (base) => {
    try {
      const res = await fetchWithTimeout(KUCOIN_FUND_RATE(kuCoinSym(base)));
      if (!res.ok) return;
      const json = await res.json();
      if (json?.code !== '200000') return;
      const d = json?.data;
      if (!d) return;
      const rate = parseRate(d.fundingRate ?? d.value ?? d.predictedValue);
      if (rate === null) return;
      data.set(base, {
        rate,
        nextFunding: d.timePoint
          ? new Date(Number(d.timePoint)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch { }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * BingX USDT Perpetual
 * Field: fundingRate (→ lastFundingRate) from /openApi/swap/v2/quote/fundingRate
 */
async function fetchBingX(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => {
    try {
      const res = await fetchWithTimeout(BINGX_FUND_RATE(base));
      if (!res.ok) return;
      const json = await res.json();
      if (json?.code !== 0) return;
      const d = json?.data;
      if (!d) return;
      const rate = parseRate(d.fundingRate ?? d.lastFundingRate);
      if (rate === null) return;
      data.set(base, {
        rate,
        nextFunding: d.nextFundingTime
          ? new Date(Number(d.nextFundingTime)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch { }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * HTX (Huobi) Coin-margined Perpetual Swaps
 * Field: funding_rate from /swap-api/v1/swap_funding_rate?contract_code={BASE}-USD
 */
async function fetchHTX(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => {
    try {
      const res = await fetchWithTimeout(HTX_FUND_RATE(base));
      if (!res.ok) return;
      const json = await res.json();
      if (json?.status !== 'ok') return;
      const d = Array.isArray(json?.data) ? json.data[0] : json?.data;
      if (!d) return;
      const rate = parseRate(d.funding_rate ?? d.estimated_rate);
      if (rate === null) return;
      data.set(base, {
        rate,
        nextFunding: d.next_funding_time
          ? new Date(Number(d.next_funding_time)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch { }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * BloFin
 * Field: fundingRate from /api/v1/market/funding-rate?instId={BASE}-USDT
 */
async function fetchBloFin(bases: Iterable<string>): Promise<FetchResult<SimpleRateData>> {
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => {
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
        nextFunding: d.nextFundingTime
          ? new Date(Number(d.nextFundingTime)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch { }
  }));
  return { data, ok: anySuccess || data.size > 0 };
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function GET() {
  // ── Phase 1: all batch exchanges fire concurrently ────────────────────────
  // This also discovers ALL available bases for Phase 2 per-symbol fetches.
  const [binance, bybit, gateio, bitmex, phemex, delta, dydx, hyperliquid] = await Promise.all([
    fetchBinance(),
    fetchBybit(),
    fetchGateio(),
    fetchBitMEX(),
    fetchPhemex(),
    fetchDelta(),
    fetchDydx(),
    fetchHyperliquid(),
  ]);

  // Build the master base set from ALL batch results
  const allBases = new Set<string>();
  for (const [b] of binance.data) allBases.add(b);
  for (const [b] of bybit.data) allBases.add(b);
  for (const [b] of gateio.data) allBases.add(b);
  for (const [b] of bitmex.data) allBases.add(b);
  for (const [b] of phemex.data) allBases.add(b);
  for (const [b] of delta.data) allBases.add(b);
  for (const [b] of dydx.data) allBases.add(b);
  for (const [b] of hyperliquid.data) allBases.add(b);

  // ── Phase 2: per-symbol exchanges use the full base set ───────────────────
  const [okx, bitget, mexc, kucoin, bingx, htx, blofin] = await Promise.all([
    fetchOKX(allBases),
    fetchBitget(allBases),
    fetchMEXC(allBases),
    fetchKuCoin(allBases),
    fetchBingX(allBases),
    fetchHTX(allBases),
    fetchBloFin(allBases),
  ]);

  // Also add any bases discovered by per-symbol exchanges
  for (const [b] of okx.data) allBases.add(b);
  for (const [b] of bitget.data) allBases.add(b);
  for (const [b] of mexc.data) allBases.add(b);
  for (const [b] of kucoin.data) allBases.add(b);
  for (const [b] of bingx.data) allBases.add(b);
  for (const [b] of blofin.data) allBases.add(b);

  const exchangeStatus: Record<string, 'ok' | 'error'> = {
    binance: binance.ok ? 'ok' : 'error',
    bybit: bybit.ok ? 'ok' : 'error',
    okx: okx.ok ? 'ok' : 'error',
    bitget: bitget.ok ? 'ok' : 'error',
    kucoin: kucoin.ok ? 'ok' : 'error',
    gateio: gateio.ok ? 'ok' : 'error',
    mexc: mexc.ok ? 'ok' : 'error',
    bingx: bingx.ok ? 'ok' : 'error',
    htx: htx.ok ? 'ok' : 'error',
    bitmex: bitmex.ok ? 'ok' : 'error',
    dydx: dydx.ok ? 'ok' : 'error',
    hyperliquid: hyperliquid.ok ? 'ok' : 'error',
    phemex: phemex.ok ? 'ok' : 'error',
    blofin: blofin.ok ? 'ok' : 'error',
    delta: delta.ok ? 'ok' : 'error',
  };

  // ── Assemble entries ──────────────────────────────────────────────────────
  const entries: FundingRateEntry[] = [];

  for (const base of allBases) {
    const binD = binance.data.get(base);
    const byD = bybit.data.get(base);
    const okD = okx.data.get(base);
    const dyD = dydx.data.get(base);
    const hlD = hyperliquid.data.get(base);
    const bgD = bitget.data.get(base);
    const gtD = gateio.data.get(base);
    const mxD = mexc.data.get(base);
    const kcD = kucoin.data.get(base);
    const bxD = bingx.data.get(base);
    const hxD = htx.data.get(base);
    const bmD = bitmex.data.get(base);
    const pxD = phemex.data.get(base);
    const bfD = blofin.data.get(base);
    const dlD = delta.data.get(base);

    const binRate = binD?.rate ?? null;
    const byRate = byD?.rate ?? null;
    const okRate = okD?.rate ?? null;
    const dyRate = dyD?.rate ?? null;
    const hlRate = hlD?.rate ?? null;
    const bgRate = bgD?.rate ?? null;
    const gtRate = gtD?.rate ?? null;
    const mxRate = mxD?.rate ?? null;
    const kcRate = kcD?.rate ?? null;
    const bxRate = bxD?.rate ?? null;
    const hxRate = hxD?.rate ?? null;
    const bmRate = bmD?.rate ?? null;
    const pxRate = pxD?.rate ?? null;
    const bfRate = bfD?.rate ?? null;
    const dlRate = dlD?.rate ?? null;

    const validRates = [
      binRate, byRate, okRate, dyRate, hlRate,
      bgRate, gtRate, mxRate, kcRate, bxRate,
      hxRate, bmRate, pxRate, bfRate, dlRate,
    ].filter((r): r is number => r !== null);

    // Skip pairs with no data at all
    if (validRates.length === 0) continue;

    const maxSpread = validRates.length > 1
      ? parseFloat((Math.max(...validRates) - Math.min(...validRates)).toFixed(8))
      : 0;

    // Price / volume: Binance is primary, dYdX secondary
    const price = binD?.price ?? dyD?.price ?? 0;
    const priceChange24h = binD?.priceChange24h ?? dyD?.priceChange24h ?? 0;
    const volume24h = binD?.volume24h ?? dyD?.volume24h ?? 0;
    const openInterest = binD?.openInterest ?? dyD?.openInterest ?? 0;

    // Funding interval from Binance fundingInfo; default 8h
    const fundingIntervalHours = binance.intervalMap.get(base) ?? 8;

    // Earliest next funding across all exchanges with data
    const fundingTimes = [
      binD?.nextFunding, byD?.nextFunding, okD?.nextFunding, dyD?.nextFunding,
      hlD?.nextFunding, bgD?.nextFunding, gtD?.nextFunding, mxD?.nextFunding,
      kcD?.nextFunding, bxD?.nextFunding, hxD?.nextFunding, bmD?.nextFunding,
      pxD?.nextFunding, bfD?.nextFunding, dlD?.nextFunding,
    ].filter(Boolean) as string[];
    const nextFunding = fundingTimes.length > 0
      ? fundingTimes.reduce((a, b) => (new Date(a) < new Date(b) ? a : b))
      : new Date(Date.now() + 28_800_000).toISOString();

    const exchangeErrors: string[] = [];
    if (binRate === null && binance.ok) exchangeErrors.push('binance');
    if (byRate === null && bybit.ok) exchangeErrors.push('bybit');
    if (okRate === null && okx.ok) exchangeErrors.push('okx');
    if (dyRate === null && dydx.ok) exchangeErrors.push('dydx');
    if (hlRate === null && hyperliquid.ok) exchangeErrors.push('hyperliquid');

    entries.push({
      id: `${base}-USDT`,
      symbol: `${base}/USDT`,
      baseAsset: base,
      logoColor: logoColorFor(base),
      logoText: base.slice(0, 4),
      price,
      priceChange24h,
      volume24h,
      openInterest,
      fundingIntervalHours,
      binance: binRate,
      bybit: byRate,
      okx: okRate,
      bitget: bgRate,
      kucoin: kcRate,
      gateio: gtRate,
      mexc: mxRate,
      bingx: bxRate,
      htx: hxRate,
      bitmex: bmRate,
      dydx: dyRate,
      hyperliquid: hlRate,
      phemex: pxRate,
      blofin: bfRate,
      delta: dlRate,
      maxSpread,
      opportunity: opportunityLevel(maxSpread),
      nextFunding,
      exchangeErrors,
    });
  }

  // Default sort: highest spread first (best arbitrage opportunities at top)
  entries.sort((a, b) => b.maxSpread - a.maxSpread);

  return NextResponse.json(
    { data: entries, updatedAt: new Date().toISOString(), exchangeStatus } satisfies ApiResponse,
    { headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    } },
  );
}

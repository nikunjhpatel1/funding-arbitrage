import { NextResponse } from 'next/server';
import db from '@/lib/db';

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

// Per-exchange HTTP timeout: longer in dev (Windows DNS serialization overhead),
// tight in production to stay within Vercel Hobby's 10 s serverless limit.
const FETCH_TIMEOUT_MS = 8_000;

// ─── Caching & Rate Limiting ──────────────────────────────────────────────
const EXCHANGE_REFRESH_MS: Record<string, number> = {
  binance:     60_000,
  bybit:       60_000,
  okx:         120_000,
  bitget:      120_000,
  kucoin:      120_000,
  gateio:      120_000,
  mexc:        180_000,
  bingx:       180_000,
  htx:         180_000,
  bitmex:      300_000,
  dydx:        60_000,
  hyperliquid: 60_000,
  phemex:      180_000,
  blofin:      300_000,
  delta:       300_000,
};

const lastFetchTime: Record<string, number> = {};
const exchangeCache: Record<string, any> = {};
const CACHE_STALE_MS = 600_000;

function shouldFetch(exchange: string): boolean {
  const now = Date.now();
  const lastFetch = lastFetchTime[exchange] ?? 0;
  const interval = EXCHANGE_REFRESH_MS[exchange] ?? 120_000;
  return (now - lastFetch) >= interval;
}

function markFetched(exchange: string): void {
  lastFetchTime[exchange] = Date.now();
}

function getCachedOrFetch<T extends { ok: boolean }>(
  exchange: string,
  fetchFn: () => Promise<T>
): Promise<T & { fromCache?: boolean }> {
  if (!shouldFetch(exchange)) {
    const cached = exchangeCache[exchange];
    if (cached) return Promise.resolve({ ...cached, fromCache: true });
  }
  
  return fetchFn().then(result => {
    if (result.ok) {
      exchangeCache[exchange] = { ...result, timestamp: Date.now() };
      markFetched(exchange);
    } else {
      const cached = exchangeCache[exchange];
      if (cached && Date.now() - cached.timestamp < CACHE_STALE_MS) {
        return { ...cached, fromCache: true };
      }
    }
    return result;
  });
}

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
  exchangeIntervals: Record<string, number>;
  exchangePrices: Record<string, number>;
  exchangeNextFunding: Record<string, string>;
  maxSpread: number;
  opportunity: 'hot' | 'mild' | 'low';
  nextFunding: string;
  exchangeErrors: string[];
}

export interface ApiResponse {
  data: FundingRateEntry[];
  updatedAt: string;
  exchangeStatus: Record<string, 'ok' | 'stale' | 'error'>;
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

const DEFAULT_HEADERS = {
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries: number = 2,
  backoffMs: number = 1000
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...DEFAULT_HEADERS, ...(options.headers ?? {}) },
      signal: ctrl.signal,
      cache: 'no-store'
    });
    clearTimeout(timer);
    
    if (res.status === 429 && retries > 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '5') * 1000;
      await new Promise(r => setTimeout(r, Math.max(retryAfter, backoffMs)));
      return fetchWithRetry(url, options, retries - 1, backoffMs * 2);
    }
    
    return res;
  } catch (e) {
    clearTimeout(timer);
    if (retries > 0 && !(e instanceof Error && e.name === 'AbortError')) {
      await new Promise(r => setTimeout(r, backoffMs));
      return fetchWithRetry(url, options, retries - 1, backoffMs * 2);
    }
    throw e;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  return fetchWithRetry(url, options);
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
      // 1h raw rate
      const hourlyRate = parseRate(ctxs[i]?.funding);
      if (hourlyRate === null) continue;
      const nextHour = new Date();
      nextHour.setUTCMinutes(0, 0, 0);
      nextHour.setUTCHours(nextHour.getUTCHours() + 1);
      data.set(base, {
        rate: hourlyRate,
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
async function fetchOKX(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
    if (Date.now() > deadline) return;

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
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * Bitget USDT Futures
 * Field: fundingRate from /api/v2/mix/market/current-fund-rate
 */
async function fetchBitget(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
    if (Date.now() > deadline) return;

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
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * MEXC Contract
 * Field: fundingRate from /api/v1/contract/funding_rate/{symbol}
 */
async function fetchMEXC(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
    if (Date.now() > deadline) return;

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
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * KuCoin Futures
 * Field: fundingRate (→ value → predictedValue) from /api/v1/funding-rate/{symbol}/current
 */
async function fetchKuCoin(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  const kuCoinSym = (b: string) => b === 'BTC' ? 'XBTUSDTM' : `${b}USDTM`;

  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
    if (Date.now() > deadline) return;

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
    } catch { /* instrument may not exist on kucoin */ }
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * BingX USDT Perpetual
 * Field: fundingRate (→ lastFundingRate) from /openApi/swap/v2/quote/fundingRate
 */
async function fetchBingX(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
    if (Date.now() > deadline) return;

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
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * HTX (Huobi) Coin-margined Perpetual Swaps
 * Field: funding_rate from /swap-api/v1/swap_funding_rate?contract_code={BASE}-USD
 */
async function fetchHTX(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
    if (Date.now() > deadline) return;

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
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

/**
 * BloFin
 * Field: fundingRate from /api/v1/market/funding-rate?instId={BASE}-USDT
 */
async function fetchBloFin(bases: Iterable<string>, deadline: number): Promise<FetchResult<SimpleRateData>> {
  const limit = pLimit(20);
  const data = new Map<string, SimpleRateData>();
  let anySuccess = false;
  await Promise.allSettled([...bases].map(async (base) => limit(async () => {    if (Date.now() > deadline) return;
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
        nextFunding: d.nextFundingTime
          ? new Date(Number(d.nextFundingTime)).toISOString()
          : new Date(Date.now() + 28_800_000).toISOString(),
      });
      anySuccess = true;
    } catch { }
  })));
  return { data, ok: anySuccess || data.size > 0 };
}

// ─── Top coins for per-symbol Phase-2 fetches ─────────────────────────────────
// We only query per-symbol exchanges for well-known coins to avoid making
// hundreds of requests (which would time out on Vercel Hobby's 10 s limit).
const TOP_BASES = new Set([
  'BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','TRX',
  'OP','ARB','INJ','WLD','SUI','APT','NEAR','LTC','UNI','ATOM',
  'TON','PEPE','DOT','FIL','ENA','TIA','SEI','JUP','ONDO','RUNE',
  'ORDI','BLUR','GMX','DYDX','PENDLE','AAVE','MANTA','ALT','JTO',
  'PYTH','WIF','BONK','FLOKI','BRETT','POPCAT','MEW','GOAT','PNUT',
  'ACT','VIRTUAL','AI16Z','FARTCOIN','IMX','SAND','MANA','GRT',
  'LDO','FTM','MATIC','OMG',
]);

/** Race a promise against a timeout; resolves with null if time runs out. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const task = queue.shift()!;
      task();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────────
// In production we must finish within Vercel Hobby's 10 s function limit.
// In development there's no such constraint, so we use generous timeouts.

let oldGlobalCache: ApiResponse | null = null;
let globalLastFetchTime = 0;
let isFetching = false;

async function performFetch(budgetMs: number): Promise<ApiResponse> {
  const START = Date.now();
  const deadlineMs = Math.min(budgetMs * 0.9, 7000); // give it up to 7 seconds or 90% of budget

  // ── ALL EXCHANGES FIRE CONCURRENTLY ───────────
  // We use TOP_BASES for the per-symbol exchanges so they don't wait for batch ones to finish.
  const phase2Bases = TOP_BASES;
  const deadline = Date.now() + deadlineMs;

  const [
    binance, bybit, gateio, bitmex, phemex, delta, dydx, hyperliquid,
    okx, bitget, mexc, kucoin, bingx, htx, blofin
  ] = await Promise.all([
    // Batch
    withDeadline(getCachedOrFetch('binance', () => fetchBinance()), deadlineMs).then(r => r ?? { data: new Map(), intervalMap: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('bybit', () => fetchBybit()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('gateio', () => fetchGateio()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('bitmex', () => fetchBitMEX()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('phemex', () => fetchPhemex()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('delta', () => fetchDelta()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('dydx', () => fetchDydx()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    withDeadline(getCachedOrFetch('hyperliquid', () => fetchHyperliquid()), deadlineMs).then(r => r ?? { data: new Map(), ok: false }),
    // Per-symbol
    getCachedOrFetch('okx', () => fetchOKX(phase2Bases, deadline)),
    getCachedOrFetch('bitget', () => fetchBitget(phase2Bases, deadline)),
    getCachedOrFetch('mexc', () => fetchMEXC(phase2Bases, deadline)),
    getCachedOrFetch('kucoin', () => fetchKuCoin(phase2Bases, deadline)),
    getCachedOrFetch('bingx', () => fetchBingX(phase2Bases, deadline)),
    getCachedOrFetch('htx', () => fetchHTX(phase2Bases, deadline)),
    getCachedOrFetch('blofin', () => fetchBloFin(phase2Bases, deadline)),
  ]);

  // Build the master base set from all batch results
  const allBases = new Set<string>();
  for (const [b] of binance.data) allBases.add(b);
  for (const [b] of bybit.data) allBases.add(b);
  for (const [b] of gateio.data) allBases.add(b);
  for (const [b] of bitmex.data) allBases.add(b);
  for (const [b] of phemex.data) allBases.add(b);
  for (const [b] of delta.data) allBases.add(b);
  for (const [b] of dydx.data) allBases.add(b);
  for (const [b] of hyperliquid.data) allBases.add(b);

  // Also add any bases discovered by per-symbol exchanges
  for (const [b] of okx.data) allBases.add(b);
  for (const [b] of bitget.data) allBases.add(b);
  for (const [b] of mexc.data) allBases.add(b);
  for (const [b] of kucoin.data) allBases.add(b);
  for (const [b] of bingx.data) allBases.add(b);
  for (const [b] of blofin.data) allBases.add(b);

  const exchangeStatus: Record<string, 'ok' | 'stale' | 'error'> = {
    binance: binance.ok ? 'ok' : (binance as any).fromCache ? 'stale' : 'error',
    bybit: bybit.ok ? 'ok' : (bybit as any).fromCache ? 'stale' : 'error',
    okx: okx.ok ? 'ok' : (okx as any).fromCache ? 'stale' : 'error',
    bitget: bitget.ok ? 'ok' : (bitget as any).fromCache ? 'stale' : 'error',
    kucoin: kucoin.ok ? 'ok' : (kucoin as any).fromCache ? 'stale' : 'error',
    gateio: gateio.ok ? 'ok' : (gateio as any).fromCache ? 'stale' : 'error',
    mexc: mexc.ok ? 'ok' : (mexc as any).fromCache ? 'stale' : 'error',
    bingx: bingx.ok ? 'ok' : (bingx as any).fromCache ? 'stale' : 'error',
    htx: htx.ok ? 'ok' : (htx as any).fromCache ? 'stale' : 'error',
    bitmex: bitmex.ok ? 'ok' : (bitmex as any).fromCache ? 'stale' : 'error',
    dydx: dydx.ok ? 'ok' : (dydx as any).fromCache ? 'stale' : 'error',
    hyperliquid: hyperliquid.ok ? 'ok' : (hyperliquid as any).fromCache ? 'stale' : 'error',
    phemex: phemex.ok ? 'ok' : (phemex as any).fromCache ? 'stale' : 'error',
    blofin: blofin.ok ? 'ok' : (blofin as any).fromCache ? 'stale' : 'error',
    delta: delta.ok ? 'ok' : (delta as any).fromCache ? 'stale' : 'error',
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

    // Funding interval from Binance fundingInfo; default 8h
    const fundingIntervalHours = binance.intervalMap.get(base) ?? 8;
    const exchangeIntervals: Record<string, number> = {
      binance: fundingIntervalHours,
      bybit: 8,
      okx: 8,
      bitget: 8,
      kucoin: 8,
      gateio: 8,
      mexc: 8,
      bingx: 8,
      htx: 8,
      bitmex: 8,
      dydx: 1,
      hyperliquid: 1,
      phemex: 8,
      blofin: 8,
      delta: 8,
    };

    const normalizedRates = [
      binRate !== null ? binRate * (8 / exchangeIntervals.binance) : null,
      byRate !== null ? byRate * (8 / exchangeIntervals.bybit) : null,
      okRate !== null ? okRate * (8 / exchangeIntervals.okx) : null,
      dyRate !== null ? dyRate * (8 / exchangeIntervals.dydx) : null,
      hlRate !== null ? hlRate * (8 / exchangeIntervals.hyperliquid) : null,
      bgRate !== null ? bgRate * (8 / exchangeIntervals.bitget) : null,
      gtRate !== null ? gtRate * (8 / exchangeIntervals.gateio) : null,
      mxRate !== null ? mxRate * (8 / exchangeIntervals.mexc) : null,
      kcRate !== null ? kcRate * (8 / exchangeIntervals.kucoin) : null,
      bxRate !== null ? bxRate * (8 / exchangeIntervals.bingx) : null,
      hxRate !== null ? hxRate * (8 / exchangeIntervals.htx) : null,
      bmRate !== null ? bmRate * (8 / exchangeIntervals.bitmex) : null,
      pxRate !== null ? pxRate * (8 / exchangeIntervals.phemex) : null,
      bfRate !== null ? bfRate * (8 / exchangeIntervals.blofin) : null,
      dlRate !== null ? dlRate * (8 / exchangeIntervals.delta) : null,
    ].filter((r): r is number => r !== null);

    const maxSpread = normalizedRates.length > 1
      ? parseFloat((Math.max(...normalizedRates) - Math.min(...normalizedRates)).toFixed(8))
      : 0;

    // Price / volume: Binance is primary, dYdX secondary
    const price = binD?.price ?? dyD?.price ?? 0;
    const priceChange24h = binD?.priceChange24h ?? dyD?.priceChange24h ?? 0;
    const volume24h = binD?.volume24h ?? dyD?.volume24h ?? 0;
    const openInterest = binD?.openInterest ?? dyD?.openInterest ?? 0;


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
    if (bgRate === null && bitget.ok) exchangeErrors.push('bitget');
    if (gtRate === null && gateio.ok) exchangeErrors.push('gateio');
    if (mxRate === null && mexc.ok) exchangeErrors.push('mexc');
    if (kcRate === null && kucoin.ok) exchangeErrors.push('kucoin');
    if (bxRate === null && bingx.ok) exchangeErrors.push('bingx');
    if (hxRate === null && htx.ok) exchangeErrors.push('htx');
    if (bmRate === null && bitmex.ok) exchangeErrors.push('bitmex');
    if (pxRate === null && phemex.ok) exchangeErrors.push('phemex');
    if (bfRate === null && blofin.ok) exchangeErrors.push('blofin');
    if (dlRate === null && delta.ok) exchangeErrors.push('delta');

    const exchangePrices: Record<string, number> = {};
    if (binRate !== null) exchangePrices.binance = binD?.price ?? price;
    if (byRate !== null) exchangePrices.bybit = (byD as any)?.price ?? price;
    if (okRate !== null) exchangePrices.okx = (okD as any)?.price ?? price;
    if (bgRate !== null) exchangePrices.bitget = (bgD as any)?.price ?? price;
    if (kcRate !== null) exchangePrices.kucoin = (kcD as any)?.price ?? price;
    if (gtRate !== null) exchangePrices.gateio = (gtD as any)?.price ?? price;
    if (mxRate !== null) exchangePrices.mexc = (mxD as any)?.price ?? price;
    if (bxRate !== null) exchangePrices.bingx = (bxD as any)?.price ?? price;
    if (hxRate !== null) exchangePrices.htx = (hxD as any)?.price ?? price;
    if (bmRate !== null) exchangePrices.bitmex = (bmD as any)?.price ?? price;
    if (dyRate !== null) exchangePrices.dydx = dyD?.price ?? price;
    if (hlRate !== null) exchangePrices.hyperliquid = (hlD as any)?.price ?? price;
    if (pxRate !== null) exchangePrices.phemex = (pxD as any)?.price ?? price;
    if (bfRate !== null) exchangePrices.blofin = (bfD as any)?.price ?? price;
    if (dlRate !== null) exchangePrices.delta = (dlD as any)?.price ?? price;

    const exchangeNextFunding: Record<string, string> = {};
    if (binD?.nextFunding) exchangeNextFunding.binance = binD.nextFunding;
    if (byD?.nextFunding) exchangeNextFunding.bybit = byD.nextFunding;
    if (okD?.nextFunding) exchangeNextFunding.okx = okD.nextFunding;
    if (bgD?.nextFunding) exchangeNextFunding.bitget = bgD.nextFunding;
    if (kcD?.nextFunding) exchangeNextFunding.kucoin = kcD.nextFunding;
    if (gtD?.nextFunding) exchangeNextFunding.gateio = gtD.nextFunding;
    if (mxD?.nextFunding) exchangeNextFunding.mexc = mxD.nextFunding;
    if (bxD?.nextFunding) exchangeNextFunding.bingx = bxD.nextFunding;
    if (hxD?.nextFunding) exchangeNextFunding.htx = hxD.nextFunding;
    if (bmD?.nextFunding) exchangeNextFunding.bitmex = bmD.nextFunding;
    if (dyD?.nextFunding) exchangeNextFunding.dydx = dyD.nextFunding;
    if (hlD?.nextFunding) exchangeNextFunding.hyperliquid = hlD.nextFunding;
    if (pxD?.nextFunding) exchangeNextFunding.phemex = pxD.nextFunding;
    if (bfD?.nextFunding) exchangeNextFunding.blofin = bfD.nextFunding;
    if (dlD?.nextFunding) exchangeNextFunding.delta = dlD.nextFunding;

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
      exchangeIntervals,
      exchangePrices,
      exchangeNextFunding,
      maxSpread,
      opportunity: opportunityLevel(maxSpread),
      nextFunding,
      exchangeErrors,
    });
  }

  // Default sort: highest spread first (best arbitrage opportunities at top)
  entries.sort((a, b) => b.maxSpread - a.maxSpread);

  return { data: entries, updatedAt: new Date().toISOString(), exchangeStatus };
}

export async function GET() {
  const now = Date.now();
  
  if (oldGlobalCache && now - globalLastFetchTime < 10_000) {
    return NextResponse.json(oldGlobalCache, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    });
  }

  if (isFetching && oldGlobalCache) {
    // If multiple concurrent requests happen during fetch, return cache
    return NextResponse.json(oldGlobalCache, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    });
  }

  isFetching = true;
  try {
    oldGlobalCache = await performFetch(28_000);
    globalLastFetchTime = Date.now();
    
    // Asynchronously save historical data and update positions so we don't block response
    saveHistoricalData(oldGlobalCache.data).catch(console.error);
    try {
      updatePaperPositions(oldGlobalCache.data);
    } catch (e) {
      console.error(e);
    }
  } finally {
    isFetching = false;
  }
  
  return NextResponse.json(oldGlobalCache, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    }
  });
}

// ─── Historical Data Save ───────────────────────────────────────────────────
export async function saveHistoricalData(entries: FundingRateEntry[]) {
  try {
    const now = Date.now();
      
    const stmt = db.prepare(`
      INSERT INTO funding_rate_history 
      (symbol, exchange, funding_rate, price, next_funding_time, funding_interval_hours, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    interface HistoryRow {
      symbol: string;
      exchange: string;
      funding_rate: number;
      price: number;
      next_funding_time: number | null;
      funding_interval_hours: number;
      recorded_at: number;
    }

    const insertMany = db.transaction((rows: HistoryRow[]) => {
      for (const row of rows) {
        stmt.run(
          row.symbol, row.exchange, row.funding_rate, row.price, 
          row.next_funding_time, row.funding_interval_hours, row.recorded_at
        );
      }
    });

    const rows: HistoryRow[] = [];
    const exchangesList = [
      'binance', 'bybit', 'okx', 'bitget', 'kucoin', 'gateio', 'mexc',
      'bingx', 'htx', 'bitmex', 'dydx', 'hyperliquid', 'phemex', 'blofin', 'delta'
    ];

    for (const entry of entries) {
      for (const ex of exchangesList) {
        const rate = entry[ex as keyof FundingRateEntry];
        if (typeof rate === 'number' && rate !== null) {
          const interval = entry.exchangeIntervals?.[ex] ?? 8;
          const nextFunding = entry.exchangeNextFunding?.[ex] ? new Date(entry.exchangeNextFunding[ex]).getTime() : null;
          rows.push({
            symbol: entry.symbol,
            exchange: ex,
            funding_rate: rate,
            price: entry.price,
            next_funding_time: nextFunding,
            funding_interval_hours: interval,
            recorded_at: now
          });
        }
      }
    }

    insertMany(rows);
    console.log(`[SQLite] Saved ${rows.length} rows to funding_rate_history`);
  } catch (e) {
    console.error('[SQLite] Failed to save historical data', e);
  }
}

// ─── Paper Trading Accrual Engine ───────────────────────────────────────────
function updatePaperPositions(rates: FundingRateEntry[]) {
  try {
    const positions = db.prepare(`SELECT * FROM paper_positions WHERE status = 'OPEN'`).all() as any[];
    console.log('[Paper Trading] Running accrual for', positions.length, 'positions');
    
    if (positions.length === 0) return;
    
    const now = Date.now();
    const updateStmt = db.prepare(`
      UPDATE paper_positions 
      SET long_funding_received = long_funding_received + ?,
          long_funding_paid = long_funding_paid + ?,
          long_funding = long_funding_received - long_funding_paid,
          short_funding_received = short_funding_received + ?,
          short_funding_paid = short_funding_paid + ?,
          short_funding = short_funding_received - short_funding_paid,
          funding_events_count = funding_events_count + ?,
          last_funding_accrual_time = ?
      WHERE id = ?
    `);

    db.transaction((posList: any[]) => {
      for (const pos of posList) {
        const rateData = rates.find(r => r.symbol === pos.symbol);
        if (!rateData) continue;

        const longRate = rateData[pos.long_exchange as keyof FundingRateEntry] as number | null;
        const shortRate = rateData[pos.short_exchange as keyof FundingRateEntry] as number | null;

        console.log(
          '[Funding]', pos.symbol,
          'longRate:', longRate,
          'shortRate:', shortRate,
          'longNext:', pos.long_next_funding_time,
          'now:', now
        );

        // Emergency fallback requested by user: 
        // If position has been open > 1 hour with NO funding, force accrue based on elapsed hours.
        const oneHourMs = 3600_000;
        const positionAge = now - pos.entry_time;
        const noFundingReceived = (pos.long_funding_received === 0 && pos.long_funding_paid === 0 && pos.short_funding_received === 0 && pos.short_funding_paid === 0);

        if (positionAge > oneHourMs && noFundingReceived) {
          const elapsedHours = positionAge / 3600_000;
          
          const longInterval = pos.long_funding_interval_hours ?? 8;
          const longIntervals = Math.floor(elapsedHours / longInterval);
          
          const shortInterval = pos.short_funding_interval_hours ?? 8;
          const shortIntervals = Math.floor(elapsedHours / shortInterval);

          if (longIntervals > 0 || shortIntervals > 0) {
            let longRcv = 0, longPaid = 0;
            let shortRcv = 0, shortPaid = 0;
            
            const longNotional = pos.notional_per_leg;
            const shortNotional = pos.notional_per_leg;
            
            // If rate > 0, longs pay shorts
            if (longRate != null && longIntervals > 0) {
              const amt = Math.abs(longRate) * longNotional * longIntervals;
              if (longRate > 0) longPaid += amt; else longRcv += amt;
            }
            if (shortRate != null && shortIntervals > 0) {
              const amt = Math.abs(shortRate) * shortNotional * shortIntervals;
              // If rate > 0, shorts receive from longs
              if (shortRate > 0) shortRcv += amt; else shortPaid += amt;
            }
            
            const totalIntervals = Math.max(longIntervals, shortIntervals);
            
            console.log(
              '[Emergency Funding]', 
              pos.symbol, 
              'intervals:', totalIntervals,
              'longRcv:', longRcv, 'longPaid:', longPaid,
              'shortRcv:', shortRcv, 'shortPaid:', shortPaid
            );

            updateStmt.run(longRcv, longPaid, shortRcv, shortPaid, totalIntervals, now, pos.id);
          }
        }
      }
    })(positions);
    
  } catch (e) {
    console.error('[Paper Trading] Accrual engine error', e);
  }
}


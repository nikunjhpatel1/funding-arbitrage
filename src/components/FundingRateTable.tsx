'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Flame,
  Minus,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Clock,
  SlidersHorizontal,
  LayoutList,
  TrendingUp,
  Eye,
  Calculator,
} from 'lucide-react';
import type { FundingRateEntry } from '@/app/api/cron/scanner/route';
import ProfitSimulatorModal from './ProfitSimulatorModal';
import { useDebouncedPrices } from '@/hooks/useDebouncedPrices';
import { usePriceStream } from '@/hooks/usePriceStream';
import { usePriceStore } from '@/store/prices';
import { TAKER_FEES } from '@/lib/constants';
import { calculateSlippage } from '@/lib/slippage';

const AUTO_REFRESH_SEC = 300;

/* ─── Option definitions ─────────────────────────────────────────────────── */
const PAIR_LIMIT_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Top 10',    value: 10   },
  { label: 'Top 25',    value: 25   },
  { label: 'Top 50',    value: 50   },
  { label: 'Top 100',   value: 100  },
  { label: 'All Pairs', value: null },
];

const MIN_SPREAD_OPTIONS: { label: string; value: number; pct: string }[] = [
  { label: 'Any spread', value: 0,      pct: 'any'  },
  { label: '≥ 0.5%',    value: 0.005,  pct: '0.5%' },
  { label: '≥ 1%',      value: 0.01,   pct: '1%'   },
  { label: '≥ 2%',      value: 0.02,   pct: '2%'   },
];

const MIN_VOLUME_OPTIONS: { label: string; value: number }[] = [
  { label: 'Any vol',  value: 0          },
  { label: '≥ $1M',   value: 1_000_000  },
  { label: '≥ $10M',  value: 10_000_000 },
  { label: '≥ $50M',  value: 50_000_000 },
  { label: '≥ $100M', value: 100_000_000},
];

const POSITION_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: '$1k', value: 1000 },
  { label: '$5k', value: 5000 },
  { label: '$10k', value: 10000 },
  { label: '$25k', value: 25000 },
];

const INTERVAL_OPTIONS: { label: string; value: IntervalFilter }[] = [
  { label: 'All',  value: 'all' },
  { label: '1h',   value: '1'   },
  { label: '4h',   value: '4'   },
  { label: '8h',   value: '8'   },
];

/* ─── Exchange registry ──────────────────────────────────────────────────── */
// Ordered by global popularity / trading volume
const ALL_EXCHANGES: { key: keyof FundingRateEntry; label: string; group: 'top10' | 'more' }[] = [
  { key: 'binance',     label: 'Binance',     group: 'top10' },
  { key: 'bybit',       label: 'Bybit',       group: 'top10' },
  { key: 'okx',         label: 'OKX',         group: 'top10' },
  { key: 'bitget',      label: 'Bitget',      group: 'top10' },
  { key: 'kucoin',      label: 'KuCoin',      group: 'top10' },
  { key: 'gateio',      label: 'Gate.io',     group: 'top10' },
  { key: 'mexc',        label: 'MEXC',        group: 'top10' },
  { key: 'bingx',       label: 'BingX',       group: 'top10' },
  { key: 'htx',         label: 'HTX',         group: 'top10' },
  { key: 'bitmex',      label: 'BitMEX',      group: 'top10' },
  { key: 'dydx',        label: 'dYdX',        group: 'more'  },
  { key: 'hyperliquid', label: 'Hyperliquid', group: 'more'  },
  { key: 'phemex',      label: 'Phemex',      group: 'more'  },
  { key: 'blofin',      label: 'BloFin',      group: 'more'  },
  { key: 'delta',       label: 'Delta',       group: 'more'  },
];

// Default: top 10 most popular by trading volume
const DEFAULT_VISIBLE = new Set<string>(
  ALL_EXCHANGES.filter((e) => e.group === 'top10').map((e) => e.key as string),
);

/* ─── Helpers ────────────────────────────────────────────────────────────── */
/** Format a funding rate. If intervalHours is provided, show the interval badge. */
function fmtRate(r: number | null, intervalHours?: number) {
  if (r === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const pct = (r * 100).toFixed(4);
  const cls = r > 0 ? 'rate-positive' : r < 0 ? 'rate-negative' : 'rate-neutral';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span className={cls}>{r > 0 ? '+' : ''}{pct}%</span>
      {intervalHours !== undefined && (
        <span className="interval-badge">{intervalHours}H</span>
      )}
    </span>
  );
}

/** Compute annualized rate: rate × (8760 / intervalHours) */
function annualizedRate(rate: number, intervalHours: number): string {
  const annual = rate * (8760 / intervalHours) * 100;
  const sign = annual >= 0 ? '+' : '';
  return `${sign}${annual.toFixed(1)}% p.a.`;
}

function fmtPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1)    return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function fmtLarge(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n.toFixed(0)}`;
}

function fmtNextFunding(isoStr: string) {
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return '00:00';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
type SortKey =
  | 'symbol' | 'price' | 'maxSpread' | 'expectedNetApr' | 'netFundingAnnualized' | 'totalFeesUsd' | 'totalSlippageUsd' | 'volume24h' | 'liquidityScore' | 'tradeabilityScore'
  | 'binance' | 'bybit' | 'okx' | 'bitget' | 'kucoin' | 'gateio'
  | 'mexc' | 'bingx' | 'htx' | 'bitmex'
  | 'dydx' | 'hyperliquid' | 'phemex' | 'blofin' | 'delta';

type SortDir   = 'asc' | 'desc';
type OppFilter = 'all' | 'hot' | 'mild' | 'low';
type IntervalFilter = 'all' | '1' | '4' | '8';

export type EnrichedRow = FundingRateEntry & {
  computedSpread:      number;
  computedOpportunity: 'hot' | 'mild' | 'low';
  bestLongExchange?:   string;
  bestShortExchange?:  string;
  netFundingAnnualized?: number;
  totalFeesUsd?: number;
  totalSlippageUsd?: number;
  expectedDailyReturn?: number;
  expectedWeeklyReturn?: number;
  expectedNetApr?: number;
  liquidityScore?: number;
  tradeabilityScore?: number;
};

const EXCHANGE_INTERVALS: Record<string, number> = {
  binance:     8, // will be overridden by row data
  bybit:       8,
  okx:         8,
  bitget:      8,
  kucoin:      8,
  gateio:      8,
  mexc:        8,
  bingx:       8,
  htx:         8,
  bitmex:      8,
  dydx:        1,
  hyperliquid: 1,
  phemex:      8,
  blofin:      8,
  delta:       8,
};

function computeSpread(
  row: FundingRateEntry,
  keys: string[],
  livePrices: any[]
): number {
  try {
    // We compute spread based on real-time prices for active exchanges
    const pricesForExchanges = keys
      .map((k) => {
        const live = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === k);
        return live?.markPrice;
      })
      .filter((p): p is number => p != null && p > 0 && !isNaN(p) && isFinite(p));

    if (pricesForExchanges.length < 2) return 0;
    
    const maxPrice = Math.max(...pricesForExchanges);
    const minPrice = Math.min(...pricesForExchanges);
    const spread = (maxPrice - minPrice) / minPrice; // ratio (equivalent to % / 100)
    
    return parseFloat(spread.toFixed(8));
  } catch {
    return 0;
  }
}

/** New opportunity tiers: Hot ≥ 0.5% | Mild ≥ 0.1% | Low < 0.1% */
function computeOpportunity(spread: number): 'hot' | 'mild' | 'low' {
  if (spread >= 0.005) return 'hot';
  if (spread >= 0.001) return 'mild';
  return 'low';
}

interface Props {
  data: FundingRateEntry[];
  onRefresh: () => void;
  isRefreshing: boolean;
  updatedAt: string;
  exchangeStatus: Record<string, 'ok' | 'stale' | 'error'>;
  onEnrichedDataChange?: (data: EnrichedRow[]) => void;
  positionSize: number;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function FundingRateTable({
  data, onRefresh, isRefreshing, updatedAt, exchangeStatus, onEnrichedDataChange, positionSize
}: Props) {
  // Initialize SSE connection globally, but we don't subscribe to its state here
  const { isConnected: isLiveConnected } = usePriceStream();
  // Read debounced prices for top-level sorting
  const debouncedPricesMap = useDebouncedPrices(1000);
  const livePrices = useMemo(() => Object.values(debouncedPricesMap), [debouncedPricesMap]);
  const liveStatuses = usePriceStore(state => state.statuses);
  
  const getMergedStatus = (exKey: string) => {
    const wsStatusObj = liveStatuses.find(s => s.exchange === exKey);
    const restStatus = exchangeStatus[exKey];
    if (wsStatusObj) {
      return wsStatusObj.status === 'Connected' ? 'ok' : 'error';
    }
    return restStatus;
  };

  const prevDeps = useRef({ data, activeExchangeKeys: null as any, livePrices, positionSize, onEnrichedDataChange });

  useEffect(() => {
    console.log('[DEBUG] FundingRateTable rendered. data changed?', prevDeps.current.data !== data, 'livePrices changed?', prevDeps.current.livePrices !== livePrices);
    prevDeps.current = { data, activeExchangeKeys: null, livePrices, positionSize, onEnrichedDataChange };
  });


  // Safety check - if data is invalid return empty
  if (!data || !Array.isArray(data)) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '3rem',
        color: 'var(--text-muted)' 
      }}>
        No data available. Click Refresh.
      </div>
    );
  }

  // ── Filter / sort state ───────────────────────────────────────────────────
  const [sortKey,    setSortKey]   = useState<SortKey>('expectedNetApr');
  const [sortDir,    setSortDir]   = useState<SortDir>('desc');
  const [oppFilter,  setOppFilter] = useState<OppFilter>('all');
  const [intervalFilter, setIntervalFilter] = useState<IntervalFilter>('all');
  const [search,     setSearch]    = useState('');
  const [pairLimit,  setPairLimit] = useState<number | null>(50);
  const [minSpread,  setMinSpread] = useState<number>(0);
  const [minVolume,  setMinVolume] = useState<number>(0);

  const [selectedSlippageRow, setSelectedSlippageRow] = useState<EnrichedRow | null>(null);

  // ── Exchange selector ─────────────────────────────────────────────────────
  const [visibleExchanges, setVisibleExchanges] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [dropdownOpen,     setDropdownOpen]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Horizontal scroll shadows + drag-to-scroll ────────────────────────────
  const scrollOuterRef = useRef<HTMLDivElement>(null);
  const scrollInnerRef = useRef<HTMLDivElement>(null);
  const [shadowLeft,  setShadowLeft]  = useState(false);
  const [shadowRight, setShadowRight] = useState(true);
  // drag state stored in refs to avoid re-render on every mousemove
  const isDragging   = useRef(false);
  const dragStartX   = useRef(0);
  const dragScrollX  = useRef(0);

  const updateShadows = useCallback(() => {
    const el = scrollInnerRef.current;
    if (!el) return;
    setShadowLeft(el.scrollLeft > 8);
    setShadowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = scrollInnerRef.current;
    if (!el) return;
    updateShadows();
    el.addEventListener('scroll', updateShadows, { passive: true });
    const ro = new ResizeObserver(updateShadows);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateShadows); ro.disconnect(); };
  }, [updateShadows]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag with primary button; ignore clicks on interactive elements
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, label, a, th')) return;
    isDragging.current  = true;
    dragStartX.current  = e.clientX;
    dragScrollX.current = scrollInnerRef.current?.scrollLeft ?? 0;
    scrollInnerRef.current?.classList.add('dragging');
    e.preventDefault();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !scrollInnerRef.current) return;
      const dx = e.clientX - dragStartX.current;
      scrollInnerRef.current.scrollLeft = dragScrollX.current - dx;
    };
    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      scrollInnerRef.current?.classList.remove('dragging');
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  // ── Countdown / flash ──────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SEC);
  const [flashRows,  setFlashRows] = useState(false);
  const prevUpdatedAt = useRef(updatedAt);

  useEffect(() => {
    if (updatedAt !== prevUpdatedAt.current) {
      prevUpdatedAt.current = updatedAt;
      setCountdown(AUTO_REFRESH_SEC);
      setFlashRows(true);
      const t = setTimeout(() => setFlashRows(false), 600);
      return () => clearTimeout(t);
    }
  }, [updatedAt]);

  useEffect(() => {
    const id = setInterval(() =>
      setCountdown((c) => (c <= 1 ? AUTO_REFRESH_SEC : c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Derived active exchange list ──────────────────────────────────────────
  const activeExchanges = useMemo(
    () => ALL_EXCHANGES.filter((ex) => visibleExchanges.has(ex.key as string)),
    [visibleExchanges],
  );

  /** Plain string keys of currently visible exchanges, for spread computation */
  const activeExchangeKeys = useMemo(
    () => activeExchanges.map((ex) => ex.key as string),
    [activeExchanges],
  );

  /**
   * Enrich every raw row with client-side spread + opportunity.
   * Recomputes whenever the selected exchange set changes — no server round-trip needed.
   */
  const enrichedData = useMemo((): EnrichedRow[] => {
    try {
      return data.map((row) => {
        try {
          const cs = computeSpread(
            row, activeExchangeKeys, livePrices
          );
          
          const liveBinance = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === 'binance');
          const liveBitget = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === 'bitget');
          const liveDelta = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === 'delta');
          const newPrice = liveBinance?.markPrice || liveBitget?.markPrice || liveDelta?.markPrice || row.price;

          // --- Phase 2: Net Opportunity Engine ---
          let bestLong: string | undefined;
          let bestShort: string | undefined;
          let minRate = Infinity;
          let maxRate = -Infinity;
          
          for (const ex of activeExchangeKeys) {
            const rate = row[ex as keyof FundingRateEntry];
            if (typeof rate === 'number' && !isNaN(rate)) {
              let interval = EXCHANGE_INTERVALS[ex] ?? 8;
              if (ex === 'binance') interval = row.fundingIntervalHours ?? 8;
              if (interval <= 0) interval = 8;
              
              const annualized = rate * (8760 / interval);
              if (annualized < minRate) { minRate = annualized; bestLong = ex; }
              if (annualized > maxRate) { maxRate = annualized; bestShort = ex; }
            }
          }

          let netFundingAnnualized = 0;
          let totalFeesUsd = 0;
          let totalSlippageUsd = 0;
          let expectedDailyReturn = 0;
          let expectedWeeklyReturn = 0;
          let expectedNetApr = 0;
          let liquidityScore = 0;
          let tradeabilityScore = 0;

          if (bestLong && bestShort && bestLong !== bestShort) {
            netFundingAnnualized = (maxRate - minRate) * positionSize;
            
            // Fees
            const feeLong = TAKER_FEES[bestLong] ?? 0.0005;
            const feeShort = TAKER_FEES[bestShort] ?? 0.0005;
            totalFeesUsd = positionSize * (feeLong + feeShort) * 2; // entry + exit
            
            // Slippage & Liquidity (Orderbook-based)
            const pLong = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === bestLong);
            const pShort = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === bestShort);
            
            if (pLong?.bids && pLong?.asks && pShort?.bids && pShort?.asks) {
              const slipLong = calculateSlippage(pLong as any, 'buy', positionSize, pLong.markPrice || row.price);
              const slipShort = calculateSlippage(pShort as any, 'sell', positionSize, pShort.markPrice || row.price);
              
              // Exit slippage (inverse side)
              const exitSlipLong = calculateSlippage(pLong as any, 'sell', positionSize, pLong.markPrice || row.price);
              const exitSlipShort = calculateSlippage(pShort as any, 'buy', positionSize, pShort.markPrice || row.price);
              
              totalSlippageUsd = slipLong.executionCostUSD + slipShort.executionCostUSD + exitSlipLong.executionCostUSD + exitSlipShort.executionCostUSD;
              
              const top5LongAsks = pLong.asks.slice(0, 5).reduce((acc, [p, s]) => acc + p*s, 0);
              const top5LongBids = pLong.bids.slice(0, 5).reduce((acc, [p, s]) => acc + p*s, 0);
              const top5ShortAsks = pShort.asks.slice(0, 5).reduce((acc, [p, s]) => acc + p*s, 0);
              const top5ShortBids = pShort.bids.slice(0, 5).reduce((acc, [p, s]) => acc + p*s, 0);
              
              const totalAvailable = top5LongAsks + top5LongBids + top5ShortAsks + top5ShortBids;
              const targetCoverage = positionSize * 4; // entry+exit for both legs
              liquidityScore = Math.min(100, Math.round((totalAvailable / (targetCoverage || 1)) * 100));
            } else {
              // Fallback BBO
              const calcSlip = (p: any, side: 'buy'|'sell') => {
                if (p && p.markPrice && p.markPrice > 0) {
                  if (side === 'buy' && p.ask && p.ask > p.markPrice) return ((p.ask - p.markPrice) / p.markPrice) * positionSize;
                  if (side === 'sell' && p.bid && p.bid < p.markPrice) return ((p.markPrice - p.bid) / p.markPrice) * positionSize;
                }
                return positionSize * 0.0005;
              };
              totalSlippageUsd = (calcSlip(pLong, 'buy') + calcSlip(pShort, 'sell')) * 2;
              liquidityScore = 0;
            }
            
            expectedDailyReturn = (netFundingAnnualized / 365) - totalFeesUsd - totalSlippageUsd;
            expectedWeeklyReturn = (netFundingAnnualized / 52) - totalFeesUsd - totalSlippageUsd;
            
            // APR amortized over 30 days.
            const fixedCosts = totalFeesUsd + totalSlippageUsd;
            const annualizedNetProfit = netFundingAnnualized - (fixedCosts * (365 / 30));
            expectedNetApr = (annualizedNetProfit / positionSize); // as a decimal
            
            // Tradeability Score (1-100)
            const aprScore = Math.min(100, Math.max(0, expectedNetApr * 100));
            tradeabilityScore = Math.round((liquidityScore * 0.4) + (aprScore * 0.4) + 20); // 20 baseline for active
          }

          return { 
            ...row, 
            price: newPrice,
            computedSpread: isNaN(cs) ? 0 : cs, 
            computedOpportunity: computeOpportunity(isNaN(cs) ? 0 : cs),
            bestLongExchange: bestLong,
            bestShortExchange: bestShort,
            netFundingAnnualized,
            totalFeesUsd,
            totalSlippageUsd,
            expectedDailyReturn,
            expectedWeeklyReturn,
            expectedNetApr,
            liquidityScore,
            tradeabilityScore
          };
        } catch {
          return { 
            ...row, 
            computedSpread: 0, 
            computedOpportunity: 'low' as const,
          };
        }
      });
    } catch {
      return [];
    }
  }, [data, activeExchangeKeys, livePrices, positionSize]);

  const prevEnrichedRef = useRef<string>('');

  useEffect(() => {
    if (!onEnrichedDataChange || enrichedData.length === 0) return;
    
    // Create a simple hash of the enriched data to avoid reference equality loops
    // and only update parent when the actual data changes.
    const hash = enrichedData.map(r => `${r.symbol}:${r.computedSpread.toFixed(6)}`).join('|');
    
    if (hash !== prevEnrichedRef.current) {
      prevEnrichedRef.current = hash;
      onEnrichedDataChange(enrichedData);
    }
  }, [enrichedData, onEnrichedDataChange]);




  // ── Exchange toggle helpers ───────────────────────────────────────────────
  const toggleExchange = useCallback((key: string) => {
    setVisibleExchanges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectAll   = useCallback(() =>
    setVisibleExchanges(new Set(ALL_EXCHANGES.map((e) => e.key as string))), []);
  const resetDefault = useCallback(() =>
    setVisibleExchanges(new Set(DEFAULT_VISIBLE)), []);

  // ── Sort / filter pipeline ────────────────────────────────────────────────
  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  const visibleRows = useMemo((): EnrichedRow[] => {
    let rows = [...enrichedData];

    // Filter by computed opportunity (client-side, reflects selected exchanges)
    if (oppFilter !== 'all') rows = rows.filter((r) => r.computedOpportunity === oppFilter);

    if (intervalFilter !== 'all') {
      const intervalNum = parseInt(intervalFilter, 10);
      rows = rows.filter((r) => 
        activeExchanges.some(ex => 
          (r.exchangeIntervals?.[ex.key as string] ?? 8) === intervalNum && r[ex.key as keyof FundingRateEntry] !== null
        )
      );
    }

    // Filter by computed spread (not server-side maxSpread)
    if (minSpread > 0) rows = rows.filter((r) => r.computedSpread >= minSpread);

    // Filter by minimum 24h volume
    if (minVolume > 0) rows = rows.filter((r) => r.volume24h >= minVolume);

    // Symbol search
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.symbol.toLowerCase().includes(q) || r.baseAsset.toLowerCase().includes(q));
    }

    // Sort — when sorting by maxSpread, use the client-computed spread
    rows.sort((a, b) => {
      let av: number | string | null;
      let bv: number | string | null;
      if (sortKey === 'maxSpread') {
        av = a.computedSpread;
        bv = b.computedSpread;
      } else if (sortKey === 'expectedNetApr') {
        av = a.expectedNetApr ?? 0;
        bv = b.expectedNetApr ?? 0;
      } else if (sortKey === 'netFundingAnnualized') {
        av = a.netFundingAnnualized ?? 0;
        bv = b.netFundingAnnualized ?? 0;
      } else if (sortKey === 'totalFeesUsd') {
        av = a.totalFeesUsd ?? 0;
        bv = b.totalFeesUsd ?? 0;
      } else if (sortKey === 'totalSlippageUsd') {
        av = a.totalSlippageUsd ?? 0;
        bv = b.totalSlippageUsd ?? 0;
      } else if (sortKey === 'liquidityScore') {
        av = a.liquidityScore ?? 0;
        bv = b.liquidityScore ?? 0;
      } else if (sortKey === 'tradeabilityScore') {
        av = a.tradeabilityScore ?? 0;
        bv = b.tradeabilityScore ?? 0;
      } else {
        av = a[sortKey] as number | string | null;
        bv = b[sortKey] as number | string | null;
      }
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string')
        return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? av - (bv as number) : (bv as number) - av;
    });

    if (pairLimit !== null) rows = rows.slice(0, pairLimit);
    return rows;
  }, [enrichedData, oppFilter, intervalFilter, minSpread, minVolume, search, sortKey, sortDir, pairLimit, activeExchanges]);

  useEffect(() => {
    const symbolsToStream = visibleRows.map(r => r.symbol.replace('/', ''));
    if (symbolsToStream.length === 0) return;

    const timer = setTimeout(() => {
      fetch('/api/prices/update-symbols', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbolsToStream }),
      }).catch(() => {});
    }, 1000);

    return () => clearTimeout(timer);
  }, [visibleRows]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0
    ? totalSize - virtualRows[virtualRows.length - 1].end
    : 0;

  const totalAfterFilters = useMemo(() => {
    let rows = [...enrichedData];
    if (oppFilter !== 'all') rows = rows.filter((r) => r.computedOpportunity === oppFilter);
    // FIX H-6: Use same interval filter logic as visibleRows (per-exchange intervals, not row-level fundingIntervalHours)
    if (intervalFilter !== 'all') {
      const intervalNum = parseInt(intervalFilter, 10);
      rows = rows.filter((r) =>
        activeExchanges.some(ex =>
          (r.exchangeIntervals?.[ex.key as string] ?? 8) === intervalNum && r[ex.key as keyof FundingRateEntry] !== null
        )
      );
    }
    if (minSpread > 0)       rows = rows.filter((r) => r.computedSpread >= minSpread);
    if (minVolume > 0)       rows = rows.filter((r) => r.volume24h >= minVolume);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) =>
        r.symbol.toLowerCase().includes(q) || r.baseAsset.toLowerCase().includes(q));
    }
    return rows.length;
  }, [enrichedData, oppFilter, intervalFilter, minSpread, minVolume, search, activeExchanges]);

  // ── Sub-components ────────────────────────────────────────────────────────
  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <ChevronsUpDown size={11} style={{ opacity: 0.35 }} />;
    return sortDir === 'desc'
      ? <ChevronDown size={11} style={{ color: 'var(--accent-blue)' }} />
      : <ChevronUp   size={11} style={{ color: 'var(--accent-blue)' }} />;
  }


  const progressPct       = ((AUTO_REFRESH_SEC - countdown) / AUTO_REFRESH_SEC) * 100;
  const activeFiltersCount =
    (oppFilter !== 'all' ? 1 : 0) + (minSpread > 0 ? 1 : 0) +
    (minVolume > 0 ? 1 : 0) + (pairLimit !== null ? 1 : 0) + (search ? 1 : 0) +
    (intervalFilter !== 'all' ? 1 : 0);
  // Market + Price + exchanges + MaxSpread + NetAPR + NetFunding + Fees + Slippage + Interval + 24hVol + NextFunding + Opp + Trade
  const totalCols = 2 + activeExchanges.length + 10;

  return (
    <>
      {/* ═══════════════════════════════ CONTROL PANEL ══════════════════════════════ */}
      <div className="control-panel">
        <div className="control-panel-inner">
          <div className="control-group">
            <div className="control-label">
              <LayoutList size={13} style={{ color: 'var(--accent-blue)' }} />
              Results
            </div>
            <div className="control-pills" role="group" aria-label="Number of pairs to display">
              {PAIR_LIMIT_OPTIONS.map((opt) => {
                const active = pairLimit === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    className={`cpill ${active ? 'cpill-active' : ''}`}
                    onClick={() => setPairLimit(opt.value)}
                    aria-pressed={active}
                    id={`pair-limit-${opt.value ?? 'all'}`}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>

          <div className="control-divider" aria-hidden="true" />

          <div className="control-group">
            <div className="control-label">
              <TrendingUp size={13} style={{ color: 'var(--positive)' }} />
              Min Spread
            </div>
            <div className="control-pills" role="group" aria-label="Minimum spread filter">
              {MIN_SPREAD_OPTIONS.map((opt) => {
                const active = minSpread === opt.value;
                return (
                  <button
                    key={opt.pct}
                    className={`cpill ${active ? 'cpill-active cpill-green' : ''}`}
                    onClick={() => setMinSpread(opt.value)}
                    aria-pressed={active}
                    id={`min-spread-${opt.pct}`}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>

          <div className="control-divider" aria-hidden="true" />

          <div className="control-group">
            <div className="control-label">
              <Clock size={13} style={{ color: '#a78bfa' }} />
              Interval
            </div>
            <div className="control-pills" role="group" aria-label="Funding interval filter">
              {INTERVAL_OPTIONS.map((opt) => {
                const active = intervalFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    className={`cpill ${active ? 'cpill-active cpill-purple' : ''}`}
                    onClick={() => setIntervalFilter(opt.value)}
                    aria-pressed={active}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>

          <div className="control-divider" aria-hidden="true" />

          <div className="control-group">
            <div className="control-label">
              <Eye size={13} style={{ color: 'var(--warning)' }} />
              Min 24h Vol
            </div>
            <div className="control-pills" role="group" aria-label="Minimum 24h volume filter">
              {MIN_VOLUME_OPTIONS.map((opt) => {
                const active = minVolume === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    className={`cpill ${active ? 'cpill-active cpill-orange' : ''}`}
                    onClick={() => setMinVolume(opt.value)}
                    aria-pressed={active}
                    id={`min-vol-${opt.value}`}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <button
              className="reset-filters-btn"
              onClick={() => { setPairLimit(null); setMinSpread(0); setMinVolume(0); setOppFilter('all'); setIntervalFilter('all'); setSearch(''); }}
              aria-label="Reset all filters"
              id="reset-filters-btn"
            >
              <SlidersHorizontal size={11} />
              Reset {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* ═════════════════════════════ EXCHANGE SELECTOR ════════════════════════════ */}
      <div className="exchange-selector-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <div className="exchange-selector-label">
            <Eye size={13} style={{ color: 'var(--accent-blue)' }} />
            Exchanges
          </div>

          <div className="exchange-selector-wrap" ref={dropdownRef} style={{ maxWidth: '300px' }}>
          <button
            className="exchange-selector-btn"
            onClick={() => setDropdownOpen((v) => !v)}
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
            id="exchange-selector-btn"
          >
            <span className="ex-count-badge">{visibleExchanges.size} / {ALL_EXCHANGES.length}</span>
            <span className="ex-pills-preview">
              {activeExchanges.slice(0, 5).map((ex) => (
                <span key={ex.key as string} className="ex-preview-pill">{ex.label}</span>
              ))}
              {activeExchanges.length > 5 && (
                <span className="ex-preview-pill ex-preview-more">+{activeExchanges.length - 5}</span>
              )}
            </span>
            <ChevronDown
              size={13}
              style={{
                marginLeft: 'auto', flexShrink: 0, transition: 'transform 0.2s',
                transform: dropdownOpen ? 'rotate(180deg)' : 'none',
              }}
            />
          </button>

          {dropdownOpen && (
            <div className="exchange-dropdown" role="listbox" aria-multiselectable="true">
              <div className="ex-dd-header">
                <span>Toggle Exchanges</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="ex-dd-action" onClick={selectAll}>All</button>
                  <button className="ex-dd-action" onClick={resetDefault}>Top 10</button>
                </div>
              </div>

              {/* Top 10 group */}
              <div className="ex-dd-group-label">Top 10 by Volume</div>
              <div className="ex-dd-grid">
                {ALL_EXCHANGES.filter((e) => e.group === 'top10').map((ex) => {
                  const checked = visibleExchanges.has(ex.key as string);
                  const status  = getMergedStatus(ex.key as string);
                  return (
                    <label key={ex.key as string} className={`ex-dd-item ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        id={`ex-check-${ex.key as string}`}
                        checked={checked}
                        onChange={() => toggleExchange(ex.key as string)}
                        className="ex-dd-checkbox"
                      />
                      <span className="ex-dd-name">{ex.label}</span>
                      <span className={`ex-status-dot ${status === 'ok' ? 'ok' : status === 'error' ? 'error' : ''}`} />
                    </label>
                  );
                })}
              </div>

              {/* More group */}
              <div className="ex-dd-group-label" style={{ marginTop: 4 }}>Derivatives / Other</div>
              <div className="ex-dd-grid">
                {ALL_EXCHANGES.filter((e) => e.group === 'more').map((ex) => {
                  const checked = visibleExchanges.has(ex.key as string);
                  const status  = getMergedStatus(ex.key as string);
                  return (
                    <label key={ex.key as string} className={`ex-dd-item ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        id={`ex-check-${ex.key as string}`}
                        checked={checked}
                        onChange={() => toggleExchange(ex.key as string)}
                        className="ex-dd-checkbox"
                      />
                      <span className="ex-dd-name">{ex.label}</span>
                      <span className={`ex-status-dot ${status === 'ok' ? 'ok' : status === 'error' ? 'error' : ''}`} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── WS Live Status Indicators ── */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
            Live Stream {isLiveConnected ? '🟢' : '🔴'}
          </div>
          {liveStatuses.map(s => (
            <div key={s.exchange} style={{ 
              display: 'flex', alignItems: 'center', gap: '4px', 
              background: 'rgba(255,255,255,0.03)', padding: '3px 8px', 
              borderRadius: '999px', fontSize: '0.65rem', border: '1px solid var(--border)' 
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{s.exchange}</span>
              <span className={`ex-status-dot ${s.status === 'Connected' ? 'ok' : 'error'}`} />
              <span className="mono" style={{ color: 'var(--text-muted)' }}>{s.latencyMs}ms</span>
              {s.reconnectCount > 0 && <span style={{ color: 'var(--warning)' }}>(R:{s.reconnectCount})</span>}
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* ══════════════════════════════════ TOOLBAR ═════════════════════════════════ */}
      <div className="section-header">
        <h2 className="section-title">
          <span>Funding Rates</span>
          <span className="pill pill-neutral">
            {visibleRows.length}
            {totalAfterFilters > visibleRows.length && ` / ${totalAfterFilters}`}
            {' '}pairs
          </span>
        </h2>

        <div className="toolbar">
          <div className="filter-tabs" role="group" aria-label="Opportunity filter">
            {(['all', 'hot', 'mild', 'low'] as OppFilter[]).map((f) => (
              <button
                key={f}
                className={`filter-tab ${oppFilter === f ? 'active' : ''}`}
                onClick={() => setOppFilter(f)}
                aria-pressed={oppFilter === f}
              >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
          </div>

          <div className="search-box" role="search">
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search funding rates by symbol"
              id="funding-search"
            />
          </div>

          <div className="refresh-widget" aria-label={`Auto-refreshes in ${countdown}s`}>
            <div className="refresh-ring-wrap" title={`Next auto-refresh in ${countdown}s`}>
              <svg width="28" height="28" viewBox="0 0 28 28" className="refresh-ring-svg">
                <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
                <circle
                  cx="14" cy="14" r="11" fill="none"
                  stroke={isRefreshing ? 'var(--accent-blue)' : 'var(--positive)'}
                  strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 11}`}
                  strokeDashoffset={`${2 * Math.PI * 11 * (1 - progressPct / 100)}`}
                  transform="rotate(-90 14 14)"
                  style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
                />
              </svg>
              <span className="refresh-ring-label mono">{isRefreshing ? '…' : `${countdown}`}</span>
            </div>
            <button
              className="btn btn-ghost refresh-btn"
              onClick={() => { onRefresh(); setCountdown(AUTO_REFRESH_SEC); }}
              disabled={isRefreshing}
              aria-label="Refresh funding rates now"
              id="refresh-now-btn"
            >
              <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }} />
              {isRefreshing ? 'Updating…' : 'Refresh now'}
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="auto-refresh-bar" aria-hidden="true">
        <div
          className="auto-refresh-fill"
          style={{
            width: `${progressPct}%`,
            background: isRefreshing ? 'var(--accent-blue)' : 'var(--positive)',
            transition: isRefreshing ? 'none' : 'width 0.9s linear, background 0.3s',
          }}
        />
      </div>

      {/* ════════════════════════════════ TABLE ══════════════════════════════════════ */}
      <div
        ref={scrollOuterRef}
        className={`table-scroll-outer${shadowLeft ? ' shadow-left' : ''}${!shadowRight ? ' shadow-right-off' : ''}`}
      >
        <div
          ref={(node) => {
            scrollInnerRef.current = node;
            tableContainerRef.current = node;
          }}
          className="table-overflow"
          onMouseDown={onMouseDown}
          style={{
            width: '100%',
            overflowX: 'auto',
            overflowY: 'auto',
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch',
            cursor: 'grab',
            height: '600px',
            position: 'relative'
          }}
        >
          <div className={`table-wrapper ${flashRows ? 'flash' : ''}`} style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
            <table className="funding-table" aria-label="Crypto funding rates table">
            <thead>
              <tr>
                <th
                  onClick={() => handleSort('symbol')}
                  className={sortKey === 'symbol' ? 'sorted' : ''}
                  style={{ paddingRight: 4, width: '160px', minWidth: '160px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    Market <SortIcon k="symbol" />
                  </span>
                </th>
                <th className={`right ${sortKey === 'price' ? 'sorted' : ''}`} onClick={() => handleSort('price')} style={{ paddingLeft: 4, width: '110px', minWidth: '110px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Price <SortIcon k="price" />
                  </span>
                </th>

                <th 
                  className={`right ${sortKey === 'maxSpread' ? 'sorted' : ''}`} 
                  onClick={() => handleSort('maxSpread')} 
                  style={{ width: '110px', minWidth: '110px' }}
                  title="Spread normalized to 8h equivalent. Shows estimated net funding profit per 8h period if you go Long on lowest rate exchange and Short on highest rate exchange. Hover individual rate cells for raw rates."
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Max Spread ⓘ <SortIcon k="maxSpread" />
                  </span>
                </th>

                <th 
                  className={`right ${sortKey === 'expectedNetApr' ? 'sorted' : ''}`} 
                  onClick={() => handleSort('expectedNetApr')} 
                  style={{ width: '100px', minWidth: '100px' }}
                  title="Estimated Net APR factoring in funding spread, fixed fees, and estimated BBO slippage. Amortized over a 30-day holding period."
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Net APR <SortIcon k="expectedNetApr" />
                  </span>
                </th>

                <th 
                  className={`right ${sortKey === 'netFundingAnnualized' ? 'sorted' : ''}`} 
                  onClick={() => handleSort('netFundingAnnualized')} 
                  style={{ width: '100px', minWidth: '100px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Net Funding <SortIcon k="netFundingAnnualized" />
                  </span>
                </th>

                <th 
                  className={`right ${sortKey === 'totalFeesUsd' ? 'sorted' : ''}`} 
                  onClick={() => handleSort('totalFeesUsd')} 
                  style={{ width: '90px', minWidth: '90px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Fees <SortIcon k="totalFeesUsd" />
                  </span>
                </th>

                <th 
                  className={`right ${sortKey === 'totalSlippageUsd' ? 'sorted' : ''}`} 
                  onClick={() => handleSort('totalSlippageUsd')} 
                  style={{ width: '90px', minWidth: '90px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Slippage <SortIcon k="totalSlippageUsd" />
                  </span>
                </th>
                
                <th className="right" style={{ width: '80px', minWidth: '80px' }}>Trade</th>

                <th className={`right ${sortKey === 'liquidityScore' ? 'sorted' : ''}`} onClick={() => handleSort('liquidityScore')} style={{ width: '100px', minWidth: '100px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Liquidity <SortIcon k="liquidityScore" />
                  </span>
                </th>

                <th className={`right ${sortKey === 'tradeabilityScore' ? 'sorted' : ''}`} onClick={() => handleSort('tradeabilityScore')} style={{ width: '110px', minWidth: '110px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Tradeability <SortIcon k="tradeabilityScore" />
                  </span>
                </th>

                <th className="right" style={{ width: '120px', minWidth: '120px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <Clock size={10} style={{ opacity: 0.5 }} /> Next Funding
                  </span>
                </th>

                {activeExchanges.map((ex) => {
                  const isDown = exchangeStatus[ex.key as string] === 'error';
                  return (
                    <th
                      key={ex.key as string}
                      className={`right ${sortKey === ex.key ? 'sorted' : ''} ${isDown ? 'exchange-down' : ''}`}
                      onClick={() => handleSort(ex.key as SortKey)}
                      title={isDown ? `${ex.label} data unavailable` : undefined}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        {isDown && <AlertTriangle size={10} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                        {ex.label}
                        <SortIcon k={ex.key as SortKey} />
                      </span>
                    </th>
                  );
                })}

                <th className="right" title="Funding interval from Binance. Hover a rate cell for annualized return.">
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <Clock size={10} style={{ opacity: 0.6 }} /> Interval
                  </span>
                </th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="skeleton-row" style={{ opacity: Math.max(0.1, 1 - i * 0.06) }}>
                    <td colSpan={totalCols} style={{ padding: '8px 16px' }}>
                      <div className="skeleton-pulse" />
                    </td>
                  </tr>
                ))
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} style={{ 
                    textAlign: 'center', 
                    padding: '3rem', 
                    color: 'var(--text-muted)' 
                  }}>
                    <div style={{ marginBottom: 8 }}>
                      <SlidersHorizontal size={20} style={{ opacity: 0.3 }} />
                    </div>
                    No pairs match the current filters.{' '}
                    <button
                      style={{ 
                        background: 'none', border: 'none', 
                        color: 'var(--accent-blue)', cursor: 'pointer', 
                        textDecoration: 'underline', fontSize: 'inherit' 
                      }}
                      onClick={() => { 
                        setPairLimit(null); setMinSpread(0); 
                        setMinVolume(0); setOppFilter('all'); setIntervalFilter('all');
                        setSearch(''); 
                      }}
                    >Reset filters</button>
                  </td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <tr>
                      <td 
                        colSpan={totalCols} 
                        style={{ height: `${paddingTop}px`, padding: 0, border: 'none' }} 
                      />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const row = visibleRows[virtualRow.index];
                    return (
                      <MemoizedRow
                        key={row.id}
                        row={row}
                        virtualRow={virtualRow}
                        measureElement={rowVirtualizer.measureElement}
                        activeExchanges={activeExchanges}
                        livePrices={livePrices}
                        onSlippageClick={() => setSelectedSlippageRow(row)}
                      />
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td 
                        colSpan={totalCols} 
                        style={{ height: `${paddingBottom}px`, padding: 0, border: 'none' }} 
                      />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div style={{
          width: '100%',
          marginTop: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', userSelect: 'none' }}>
            ← Scroll →
          </span>
          <input
            type="range"
            min="0"
            max="100"
            defaultValue="0"
            style={{
              width: '100%',
              accentColor: 'var(--accent-blue)',
              cursor: 'pointer',
              height: '4px',
            }}
            onChange={(e) => {
              const tableEl = document.querySelector('.table-overflow') as HTMLElement;
              if (tableEl) {
                const maxScroll = tableEl.scrollWidth - tableEl.clientWidth;
                tableEl.scrollLeft = (Number(e.target.value) / 100) * maxScroll;
              }
            }}
          />
        </div>
      </div>

      {/* ── Footer meta ──────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: '0.75rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
        fontSize: '0.72rem', color: 'var(--text-muted)',
      }}>
        <span>
          Showing{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>{visibleRows.length}</strong>
          {totalAfterFilters !== visibleRows.length && (
            <> of <strong style={{ color: 'var(--text-secondary)' }}>{totalAfterFilters}</strong></>
          )}{' '}
          of <strong style={{ color: 'var(--text-secondary)' }}>{data.length}</strong> pairs
          {minSpread > 0 && <> · spread ≥ {(minSpread * 100).toFixed(1)}%</>}
          {minVolume > 0 && <> · vol ≥ {fmtLarge(minVolume)}</>}
          {' '}· Sorted by max spread · {activeExchanges.length} exchange{activeExchanges.length !== 1 ? 's' : ''} visible
          {' '}· Hover a rate for annualised return
        </span>
        <span>
          Prices updating live · Rates refresh in{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>{Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</strong>
        </span>
      </div>

      {selectedSlippageRow && (
        <ProfitSimulatorModal 
          row={selectedSlippageRow} 
          positionSize={positionSize} 
          onClose={() => setSelectedSlippageRow(null)} 
          activeExchanges={activeExchanges as { key: string; label: string; group?: string }[]}
        />
      )}

      {/* ── Scoped styles ────────────────────────────────────────────────────── */}
      <style>{`
        /* ── Interval badge (shown next to Binance rate) ── */
        .interval-badge {
          display: inline-flex; align-items: center;
          padding: 1px 5px; border-radius: 4px;
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em;
          background: rgba(99,102,241,0.15); color: #818cf8;
          border: 1px solid rgba(99,102,241,0.25); white-space: nowrap; flex-shrink: 0;
        }

        /* ── Interval column cell ── */
        .interval-cell { display: flex; justify-content: flex-end; }
        .interval-pill {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 32px; padding: 2px 7px; border-radius: 5px;
          font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em;
          cursor: default; white-space: nowrap;
        }
        .interval-pill.ivl-1h  { background: rgba(239,68,68,0.15);  color: #f87171; border: 1px solid rgba(239,68,68,0.3);  }
        .interval-pill.ivl-4h  { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); }
        .interval-pill.ivl-8h  { background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); }
        /* fallback for any other interval */
        .interval-pill { background: rgba(99,102,241,0.12); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.2); }

        /* ── Rate cell with tooltip ── */
        .rate-cell { cursor: help; }

        /* ── Orange volume pill ── */
        .cpill-active.cpill-orange {
          background: #f59e0b; border-color: #f59e0b;
          box-shadow: 0 0 14px rgba(245,158,11,0.35);
        }

        .cpill-active.cpill-purple {
          background: #7c3aed;
          border-color: #7c3aed;
          box-shadow: 0 0 14px rgba(124,58,237,0.35);
        }

        /* ── Control Panel ── */
        .control-panel {
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1rem 1.25rem;
          margin-bottom: 0.75rem;
          transition: border-color 0.2s;
        }
        .control-panel:hover { border-color: var(--border-bright); }
        .control-panel-inner { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .control-group       { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .control-label {
          display: flex; align-items: center; gap: 5px;
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--text-muted); white-space: nowrap;
        }
        .control-pills { display: flex; gap: 4px; flex-wrap: wrap; }
        .cpill {
          padding: 5px 13px; border-radius: 999px; font-size: 0.78rem; font-weight: 600;
          cursor: pointer; border: 1px solid var(--border); background: transparent;
          color: var(--text-secondary); transition: all 0.18s ease; white-space: nowrap;
        }
        .cpill:hover:not(.cpill-active) {
          color: var(--text-primary); border-color: var(--border-bright);
          background: rgba(255,255,255,0.04);
        }
        .cpill-active {
          background: var(--accent-blue); border-color: var(--accent-blue);
          color: #fff; box-shadow: 0 0 14px rgba(59,130,246,0.35);
        }
        .cpill-active.cpill-green {
          background: var(--positive); border-color: var(--positive);
          box-shadow: 0 0 14px rgba(16,185,129,0.35);
        }
        .control-divider { width: 1px; height: 32px; background: var(--border); flex-shrink: 0; }
        .reset-filters-btn {
          display: inline-flex; align-items: center; gap: 5px; margin-left: auto;
          padding: 5px 12px; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
          cursor: pointer; border: 1px solid rgba(244,63,94,0.3);
          background: var(--negative-bg); color: var(--negative);
          transition: all 0.18s ease; white-space: nowrap;
        }
        .reset-filters-btn:hover {
          background: rgba(244,63,94,0.18); border-color: rgba(244,63,94,0.5);
        }

        /* ── Exchange Selector ── */
        .exchange-selector-bar {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 0.75rem; flex-wrap: wrap;
        }
        .exchange-selector-label {
          display: flex; align-items: center; gap: 5px;
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--text-muted); white-space: nowrap; flex-shrink: 0;
        }
        .exchange-selector-wrap {
          position: relative; flex: 1; min-width: 0; max-width: 780px;
        }
        .exchange-selector-btn {
          display: flex; align-items: center; gap: 8px; width: 100%;
          padding: 7px 14px; background: rgba(255,255,255,0.03);
          border: 1px solid var(--border); border-radius: var(--radius-md);
          cursor: pointer; color: var(--text-primary); font-size: 0.8rem;
          font-weight: 500; transition: all 0.18s ease; overflow: hidden;
        }
        .exchange-selector-btn:hover {
          border-color: var(--border-bright); background: rgba(255,255,255,0.06);
        }
        .ex-count-badge {
          font-size: 0.72rem; font-weight: 700; color: var(--accent-blue);
          white-space: nowrap; flex-shrink: 0;
          background: rgba(59,130,246,0.1); padding: 2px 8px;
          border-radius: 999px; border: 1px solid rgba(59,130,246,0.2);
        }
        .ex-pills-preview {
          display: flex; gap: 4px; flex-wrap: nowrap; overflow: hidden; flex: 1;
        }
        .ex-preview-pill {
          display: inline-flex; align-items: center; padding: 2px 8px;
          border-radius: 999px; font-size: 0.68rem; font-weight: 600;
          background: rgba(255,255,255,0.06); color: var(--text-secondary);
          border: 1px solid var(--border); white-space: nowrap; flex-shrink: 0;
        }
        .ex-preview-more {
          background: rgba(255,255,255,0.03); color: var(--text-muted);
        }

        /* ── Dropdown ── */
        .exchange-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: var(--surface); border: 1px solid var(--border-bright);
          border-radius: var(--radius-lg);
          box-shadow: 0 20px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.3);
          z-index: 200; overflow: hidden; animation: dd-in 0.18s ease;
        }
        @keyframes dd-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ex-dd-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border-bottom: 1px solid var(--border);
          font-size: 0.75rem; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .ex-dd-action {
          padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 600;
          cursor: pointer; border: 1px solid var(--border); background: transparent;
          color: var(--text-secondary); transition: all 0.15s ease;
        }
        .ex-dd-action:hover {
          border-color: var(--accent-blue); color: var(--accent-blue);
          background: rgba(59,130,246,0.08);
        }
        .ex-dd-group-label {
          padding: 8px 14px 4px;
          font-size: 0.65rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--text-muted);
        }
        .ex-dd-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 2px; padding: 0 8px 8px;
        }
        .ex-dd-item {
          display: flex; align-items: center; gap: 8px; padding: 8px 10px;
          border-radius: var(--radius-sm); cursor: pointer;
          font-size: 0.82rem; font-weight: 500; color: var(--text-secondary);
          transition: all 0.15s ease; border: 1px solid transparent; user-select: none;
        }
        .ex-dd-item:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); border-color: var(--border); }
        .ex-dd-item.checked { background: rgba(59,130,246,0.08); color: var(--text-primary); border-color: rgba(59,130,246,0.2); }
        .ex-dd-checkbox { width: 15px; height: 15px; cursor: pointer; accent-color: var(--accent-blue); flex-shrink: 0; }
        .ex-dd-name { flex: 1; white-space: nowrap; }
        .ex-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--border); }
        .ex-status-dot.ok    { background: var(--positive); box-shadow: 0 0 5px var(--positive); }
        .ex-status-dot.error { background: var(--negative); box-shadow: 0 0 5px var(--negative); }

        /* ── Refresh widget ── */
        .refresh-widget { display: flex; align-items: center; gap: 8px; }
        .refresh-ring-wrap { position: relative; width: 28px; height: 28px; flex-shrink: 0; }
        .refresh-ring-svg  { display: block; }
        .refresh-ring-label {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-size: 0.6rem; font-weight: 700; color: var(--text-secondary);
        }
        .refresh-btn { padding: 6px 12px; font-size: 0.78rem; white-space: nowrap; }

        /* ── Progress bar ── */
        .auto-refresh-bar {
          height: 2px; background: rgba(255,255,255,0.06);
          border-radius: 1px; margin-bottom: 0.75rem; overflow: hidden;
        }
        .auto-refresh-fill { height: 100%; border-radius: 1px; }

        /* ── Flash ── */
        @keyframes flash-table {
          0%   { box-shadow: 0 0 0 1px var(--positive); }
          100% { box-shadow: 0 4px 24px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3); }
        }
        .table-wrapper.flash { animation: flash-table 0.6s ease-out forwards; }

        @keyframes price-flash {
          0%   { color: var(--accent-blue); text-shadow: 0 0 8px rgba(59,130,246,0.8); }
          100% { color: inherit; text-shadow: none; }
        }
        .price-updated {
          animation: price-flash 0.8s ease-out;
        }

        /* ── General ── */
        @keyframes spin { to { transform: rotate(360deg); } }
        .exchange-down { opacity: 0.55; }

        .funding-table {
          width: max-content;
          min-width: 100%;
          border-collapse: collapse;
        }
        .funding-table th:first-child,
        .funding-table td:first-child {
          width: 180px;
          min-width: 180px;
          max-width: 180px;
          padding-right: 8px;
        }
        .funding-table th:nth-child(2),
        .funding-table td:nth-child(2) {
          width: 120px;
          min-width: 120px;
          max-width: 120px;
          padding-left: 8px;
        }
        .funding-table th:nth-child(3),
        .funding-table td:nth-child(3) {
          width: 110px;
          min-width: 110px;
          max-width: 110px;
        }
        .funding-table th.right,
        .funding-table td.right {
          width: 100px;
          min-width: 90px;
        }
        .symbol-cell {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .symbol-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 120px;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .symbol-sub {
          font-size: 0.7rem;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .token-logo {
          width: 32px;
          height: 32px;
          min-width: 32px;
          max-width: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.6rem;
          font-weight: 800;
          border: 1px solid;
          flex-shrink: 0;
        }

        .table-overflow {
          position: relative;
          width: 100%;
          overflow-x: auto;
          overflow-y: visible;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
        }
        .table-overflow::-webkit-scrollbar {
          height: 6px;
        }
        .table-overflow::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.04);
          border-radius: 3px;
        }
        .table-overflow::-webkit-scrollbar-thumb {
          background: rgba(59,130,246,0.4);
          border-radius: 3px;
        }
        .table-overflow::-webkit-scrollbar-thumb:hover {
          background: rgba(59,130,246,0.7);
        }
        .funding-table thead th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--surface);
        }

        @media (max-width: 768px) {
          .control-divider { display: none; }
          .reset-filters-btn { margin-left: 0; }
          .exchange-selector-bar { flex-direction: column; align-items: flex-start; }
          .exchange-selector-wrap { width: 100%; max-width: 100%; }
          .ex-dd-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </>
  );
}

function OppBadge({ opp }: { opp: FundingRateEntry['opportunity'] }) {
  if (opp === 'hot')  return <span className="opp-badge hot"><Flame size={10} /> Hot</span>;
  if (opp === 'mild') return <span className="opp-badge mild"><Minus size={10} /> Mild</span>;
  return <span className="opp-badge low">Low</span>;
}

const MemoizedRow = memo(({
  row,
  virtualRow,
  measureElement,
  activeExchanges,
  livePrices,
  onSlippageClick
}: {
  row: EnrichedRow;
  virtualRow: VirtualItem;
  measureElement: (element: Element | null) => void;
  activeExchanges: typeof ALL_EXCHANGES;
  livePrices: any[];
  onSlippageClick: () => void;
  }) => {
  const cleanSymbol = row.symbol.replace('/', '');
  const rowPrice = usePriceStore((state) => state.pricesMap[`${cleanSymbol}-${row.bestLongExchange}`]?.markPrice 
    || state.pricesMap[`${cleanSymbol}-${row.bestShortExchange}`]?.markPrice 
    || Object.values(state.pricesMap).find(p => p.symbol === cleanSymbol)?.markPrice 
    || row.price);
    
  const [flashPrice, setFlashPrice] = useState(false);
  const prevPrice = useRef(rowPrice);

  useEffect(() => {
    if (rowPrice !== prevPrice.current) {
      prevPrice.current = rowPrice;
      setFlashPrice(true);
      const t = setTimeout(() => setFlashPrice(false), 800);
      return () => clearTimeout(t);
    }
  }, [rowPrice]);

  return (
    <tr 
      key={row.id}
      data-index={virtualRow.index}
      ref={measureElement}
    >
      <td style={{ paddingRight: 4 }}>
        <div className="symbol-cell">
          <div
            className="token-logo"
            style={{
              background: row.logoColor + '22',
              borderColor: row.logoColor + '44',
              color: row.logoColor,
            }}
          >{row.logoText.slice(0, 4)}</div>
          <div>
            <div className="symbol-name">{row.symbol}</div>
            <div className="symbol-sub">Perpetual</div>
          </div>
        </div>
      </td>

      <td className="right" style={{ paddingLeft: 4 }}>
        <div className={`mono ${flashPrice ? 'price-updated' : ''}`} style={{ 
          fontSize: '0.875rem', fontWeight: 600, transition: 'color 0.2s'
        }}>
          {fmtPrice(rowPrice)}
        </div>
        <div style={{
          fontSize: '0.72rem', marginTop: 1,
          color: row.priceChange24h >= 0 
            ? 'var(--positive)' : 'var(--negative)',
        }}>
          {row.priceChange24h >= 0 ? '+' : ''}
          {row.priceChange24h.toFixed(2)}%
        </div>
      </td>

      <td className="right">
        <div
          style={{ fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}
          className={
            row.computedSpread >= 0.005 ? 'rate-positive'
            : row.computedSpread >= 0.001 ? ''
            : 'rate-neutral'
          }
        >
          {(row.computedSpread * 100).toFixed(4)}%
        </div>
        <div className="spread-bar-bg">
          <div
            className="spread-bar-fill"
            style={{
              width: `${Math.min(100, row.computedSpread * 10000)}%`,
              background:
                row.computedSpread >= 0.005 ? 'var(--positive)'
                : row.computedSpread >= 0.001 ? 'var(--warning)'
                : 'var(--text-muted)',
            }}
          />
        </div>
        {(() => {
          const normalizedRates = activeExchanges
            .map(ex => {
              const rate = row[ex.key as keyof FundingRateEntry] as number | null;
              if (rate === null) return null;
              const interval = row.exchangeIntervals?.[ex.key as string] ?? 8;
              return {
                key: ex.key as string,
                label: ex.label,
                rate,
                normalized: rate * (8 / interval),
                interval,
              };
            })
            .filter((e): e is NonNullable<typeof e> => e !== null)
            .sort((a, b) => a.normalized - b.normalized);
          
          if (normalizedRates.length < 2) return null;
          
          const longEx = normalizedRates[0]; // most negative = go long
          const shortEx = normalizedRates[normalizedRates.length - 1]; // most positive
          
          return (
            <div style={{ 
              fontSize: '0.62rem', 
              color: 'var(--text-muted)',
              marginTop: 2,
              display: 'flex',
              gap: 4,
              justifyContent: 'flex-end'
            }}>
              <span style={{ color: 'var(--positive)' }}>
                L: {longEx.label}
              </span>
              <span>/</span>
              <span style={{ color: 'var(--negative)' }}>
                S: {shortEx.label}
              </span>
            </div>
          );
        })()}
      </td>

      {/* ── Net Opportunity Engine Columns ── */}
      <td className="right" title={`Expected Daily: $${row.expectedDailyReturn?.toFixed(2)} | Weekly: $${row.expectedWeeklyReturn?.toFixed(2)}`}>
        {row.expectedNetApr !== undefined && row.expectedNetApr > 0 ? (
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
            {(row.expectedNetApr * 100).toFixed(2)}%
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>—</div>
        )}
      </td>

      <td className="right mono" style={{ fontSize: '0.8rem', color: 'var(--positive)' }}>
        {row.netFundingAnnualized ? `+$${row.netFundingAnnualized.toFixed(2)}` : '—'}
      </td>

      <td className="right mono" style={{ fontSize: '0.8rem', color: 'var(--negative)' }}>
        {row.totalFeesUsd ? `-$${row.totalFeesUsd.toFixed(2)}` : '—'}
      </td>

      <td className="right mono" style={{ fontSize: '0.8rem', color: 'var(--negative)' }}>
        {row.totalSlippageUsd ? `-$${row.totalSlippageUsd.toFixed(2)}` : '—'}
      </td>

      <td className="right">
        <a
          href={`/trade/${row.baseAsset}-USDT`}
          className="action-btn"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          aria-label={`Trade ${row.symbol}`}
          onClick={() => {
            try {
              localStorage.setItem('tradeCoinData', JSON.stringify(row));
            } catch {}
          }}
        >
          <ExternalLink size={11} />
          Trade
        </a>
      </td>

      <td className="right">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <div style={{ fontWeight: 600, color: row.liquidityScore && row.liquidityScore >= 80 ? 'var(--positive)' : row.liquidityScore && row.liquidityScore >= 40 ? 'var(--warning)' : 'var(--negative)' }}>
            {row.liquidityScore ? `${row.liquidityScore}/100` : '—'}
          </div>
          <button 
            onClick={onSlippageClick}
            style={{ 
              background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', 
              color: 'var(--accent-blue)', padding: '3px 8px', borderRadius: '4px',
              fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <Calculator size={10} /> Simulate
          </button>
        </div>
      </td>

      <td className="right">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <div style={{ 
            fontWeight: 800, fontSize: '0.85rem',
            color: row.tradeabilityScore && row.tradeabilityScore >= 80 ? 'var(--positive)' : row.tradeabilityScore && row.tradeabilityScore >= 50 ? 'var(--warning)' : 'var(--negative)' 
          }}>
            {row.tradeabilityScore ? row.tradeabilityScore : '—'}
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Score</span>
        </div>
      </td>

      <td className="right">
        <span className="mono" style={{ 
          fontSize: '0.8rem', 
          color: 'var(--text-secondary)' 
        }}>
          {fmtNextFunding(row.nextFunding)}
        </span>
      </td>

      {activeExchanges.map((ex) => {
        let rate = row[ex.key as keyof FundingRateEntry] as number | null;
        const live = livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === ex.key);
        if (live?.fundingRate !== undefined) {
          rate = live.fundingRate;
        }

        const intervalHours = row.exchangeIntervals?.[ex.key as string] ?? 8;
        let tooltipText: string | undefined;
        if (rate !== null) {
          const normalizedRate = rate * (8 / intervalHours);
          const rawPct = (rate * 100).toFixed(4);
          const normPct = (normalizedRate * 100).toFixed(4);
          tooltipText = `Raw: ${rate > 0 ? '+' : ''}${rawPct}% per ${intervalHours}h\n8h equiv: ${normalizedRate > 0 ? '+' : ''}${normPct}%\nAnnualized: ${annualizedRate(rate, intervalHours)}`;
        }
        return (
          <td
            key={ex.key as string}
            className="right rate-cell"
            title={tooltipText}
          >
            {fmtRate(rate, intervalHours)}
          </td>
        );
      })}

      <td className="right">
        <div
          className="interval-cell"
          title={`Funds every ${row.fundingIntervalHours}h`}
        >
          <span className={`interval-pill ivl-${row.fundingIntervalHours}h`}>
            {row.fundingIntervalHours}h
          </span>
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  return prev.row === next.row && prev.activeExchanges === next.activeExchanges;
});

MemoizedRow.displayName = 'MemoizedRow';

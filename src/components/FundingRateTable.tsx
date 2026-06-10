'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import type { FundingRateEntry } from '@/app/api/funding-rates/route';

const AUTO_REFRESH_SEC = 30;

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
        <span className="interval-badge">{intervalHours}h</span>
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
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
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
  | 'symbol' | 'price' | 'maxSpread' | 'volume24h'
  | 'binance' | 'bybit' | 'okx' | 'bitget' | 'kucoin' | 'gateio'
  | 'mexc' | 'bingx' | 'htx' | 'bitmex'
  | 'dydx' | 'hyperliquid' | 'phemex' | 'blofin' | 'delta';

type SortDir   = 'asc' | 'desc';
type OppFilter = 'all' | 'hot' | 'mild' | 'low';
type IntervalFilter = 'all' | '1' | '4' | '8';

/** FundingRateEntry enriched with client-side computed spread + opportunity */
type EnrichedRow = FundingRateEntry & {
  computedSpread:      number;
  computedOpportunity: 'hot' | 'mild' | 'low';
};

/** Compute spread across a specific set of exchange keys, ignoring null values */
function computeSpread(row: FundingRateEntry, keys: string[]): number {
  const rates = keys
    .map((k) => row[k as keyof FundingRateEntry] as number | null)
    .filter((r): r is number => r !== null);
  if (rates.length < 2) return 0;
  return parseFloat((Math.max(...rates) - Math.min(...rates)).toFixed(8));
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
  exchangeStatus: Record<string, 'ok' | 'error'>;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function FundingRateTable({
  data, onRefresh, isRefreshing, updatedAt, exchangeStatus,
}: Props) {

  // ── Filter / sort state ───────────────────────────────────────────────────
  const [sortKey,    setSortKey]   = useState<SortKey>('maxSpread');
  const [sortDir,    setSortDir]   = useState<SortDir>('desc');
  const [oppFilter,  setOppFilter] = useState<OppFilter>('all');
  const [intervalFilter, setIntervalFilter] = useState<IntervalFilter>('all');
  const [search,     setSearch]    = useState('');
  const [pairLimit,  setPairLimit] = useState<number | null>(null);
  const [minSpread,  setMinSpread] = useState<number>(0);
  const [minVolume,  setMinVolume] = useState<number>(0);

  // ── Exchange selector ─────────────────────────────────────────────────────
  const [visibleExchanges, setVisibleExchanges] = useState<Set<string>>(new Set(DEFAULT_VISIBLE));
  const [dropdownOpen,     setDropdownOpen]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  const enrichedData = useMemo((): EnrichedRow[] =>
    data.map((row) => {
      const cs = computeSpread(row, activeExchangeKeys);
      return { ...row, computedSpread: cs, computedOpportunity: computeOpportunity(cs) };
    }),
    [data, activeExchangeKeys],
  );

  // ── Exchange toggle helpers ───────────────────────────────────────────────
  const toggleExchange = useCallback((key: string) => {
    setVisibleExchanges((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
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
      rows = rows.filter((r) => 
        String(r.fundingIntervalHours) === intervalFilter
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
  }, [enrichedData, oppFilter, intervalFilter, minSpread, minVolume, search, sortKey, sortDir, pairLimit]);

  const totalAfterFilters = useMemo(() => {
    let rows = [...enrichedData];
    if (oppFilter !== 'all') rows = rows.filter((r) => r.computedOpportunity === oppFilter);
    if (intervalFilter !== 'all') {
      rows = rows.filter((r) => 
        String(r.fundingIntervalHours) === intervalFilter
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
  }, [enrichedData, oppFilter, intervalFilter, minSpread, minVolume, search]);

  // ── Sub-components ────────────────────────────────────────────────────────
  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <ChevronsUpDown size={11} style={{ opacity: 0.35 }} />;
    return sortDir === 'desc'
      ? <ChevronDown size={11} style={{ color: 'var(--accent-blue)' }} />
      : <ChevronUp   size={11} style={{ color: 'var(--accent-blue)' }} />;
  }

  function OppBadge({ opp }: { opp: FundingRateEntry['opportunity'] }) {
    if (opp === 'hot')  return <span className="opp-badge hot"><Flame size={10} /> Hot</span>;
    if (opp === 'mild') return <span className="opp-badge mild"><Minus size={10} /> Mild</span>;
    return <span className="opp-badge low">Low</span>;
  }

  const progressPct       = ((AUTO_REFRESH_SEC - countdown) / AUTO_REFRESH_SEC) * 100;
  const activeFiltersCount =
    (oppFilter !== 'all' ? 1 : 0) + (minSpread > 0 ? 1 : 0) +
    (minVolume > 0 ? 1 : 0) + (pairLimit !== null ? 1 : 0) + (search ? 1 : 0) +
    (intervalFilter !== 'all' ? 1 : 0);
  // Market + Price + exchanges + MaxSpread + Interval + 24hVol + NextFunding + Opp + Trade
  const totalCols = 2 + activeExchanges.length + 6;

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
        <div className="exchange-selector-label">
          <Eye size={13} style={{ color: 'var(--accent-blue)' }} />
          Exchanges
        </div>

        <div className="exchange-selector-wrap" ref={dropdownRef}>
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
                  const status  = exchangeStatus[ex.key as string];
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
                  const status  = exchangeStatus[ex.key as string];
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
          ref={scrollInnerRef}
          className="table-overflow"
          onMouseDown={onMouseDown}
          style={{ cursor: 'grab' }}
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

                <th className={`right ${sortKey === 'maxSpread' ? 'sorted' : ''}`} onClick={() => handleSort('maxSpread')} style={{ width: '110px', minWidth: '110px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    Max Spread <SortIcon k="maxSpread" />
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
                <th className={`right ${sortKey === 'volume24h' ? 'sorted' : ''}`} onClick={() => handleSort('volume24h')}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    24h Vol <SortIcon k="volume24h" />
                  </span>
                </th>
                <th className="right">
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <Clock size={10} style={{ opacity: 0.5 }} /> Next Funding
                  </span>
                </th>
                <th className="right">Opportunity</th>
                <th className="right">Trade</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    <div style={{ marginBottom: 8 }}><SlidersHorizontal size={20} style={{ opacity: 0.3 }} /></div>
                    No pairs match the current filters.{' '}
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', textDecoration: 'underline', fontSize: 'inherit' }}
                      onClick={() => { setPairLimit(null); setMinSpread(0); setMinVolume(0); setOppFilter('all'); setIntervalFilter('all'); setSearch(''); }}
                    >Reset filters</button>
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, i) => (
                  <tr key={row.id} style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}>
                    <td style={{ paddingRight: 4 }}>
                      <div className="symbol-cell">
                        <div
                          className="token-logo"
                          style={{
                            background:  row.logoColor + '22',
                            borderColor: row.logoColor + '44',
                            color:       row.logoColor,
                          }}
                        >{row.logoText.slice(0, 4)}</div>
                        <div>
                          <div className="symbol-name">{row.symbol}</div>
                          <div className="symbol-sub">Perpetual</div>
                        </div>
                      </div>
                    </td>

                    <td className="right" style={{ paddingLeft: 4 }}>
                      <div className="mono" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                        {fmtPrice(row.price)}
                      </div>
                      <div style={{
                        fontSize: '0.72rem', marginTop: 1,
                        color: row.priceChange24h >= 0 ? 'var(--positive)' : 'var(--negative)',
                      }}>
                        {row.priceChange24h >= 0 ? '+' : ''}{row.priceChange24h.toFixed(2)}%
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
                            /* 1% spread = full bar; scaled so 0.5% ≈ 50% */
                            width: `${Math.min(100, row.computedSpread * 10000)}%`,
                            background:
                              row.computedSpread >= 0.005 ? 'var(--positive)'
                              : row.computedSpread >= 0.001 ? 'var(--warning)'
                              : 'var(--text-muted)',
                          }}
                        />
                      </div>
                    </td>

                    {activeExchanges.map((ex) => {
                      const rate = row[ex.key] as number | null;
                      // Show interval badge only on the Binance column
                      const isBinance = ex.key === 'binance';
                      const intervalHours = isBinance ? row.fundingIntervalHours : undefined;
                      const tooltipText = rate !== null
                        ? `Annualized: ${annualizedRate(rate, row.fundingIntervalHours)}`
                        : undefined;
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

                    {/* ── Interval column ─────────────────────────────────────────── */}
                    <td className="right">
                      <div
                        className="interval-cell"
                        title={`Funds every ${row.fundingIntervalHours}h · Annualized rate (Binance): ${row.binance !== null ? annualizedRate(row.binance, row.fundingIntervalHours) : 'N/A'}`}
                      >
                        <span className={`interval-pill ivl-${row.fundingIntervalHours}h`}>
                          {row.fundingIntervalHours}h
                        </span>
                      </div>
                    </td>

                    <td className="right mono" style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                      {fmtLarge(row.volume24h)}
                    </td>

                    <td className="right">
                      <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {fmtNextFunding(row.nextFunding)}
                      </span>
                    </td>

                    <td className="right"><OppBadge opp={row.computedOpportunity} /></td>

                    <td className="right">
                      <button
                        className="action-btn"
                        aria-label={`Trade ${row.symbol}`}
                        id={`trade-${row.symbol.replace('/', '-')}`}
                      >
                        <ExternalLink size={11} style={{ display: 'inline', marginRight: 3 }} />
                        Trade
                      </button>
                    </td>
                  </tr>
                ))
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
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
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
          Last updated:{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>{new Date(updatedAt).toLocaleTimeString()}</strong>
          {' '}· Auto-refreshes every {AUTO_REFRESH_SEC}s
        </span>
      </div>

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

        /* ── General ── */
        @keyframes spin { to { transform: rotate(360deg); } }
        .exchange-down { opacity: 0.55; }

        .funding-table {
          width: 100%;
          border-collapse: collapse;
        }
        .funding-table th:first-child,
        .funding-table td:first-child {
          width: 160px;
          min-width: 160px;
          max-width: 160px;
        }
        .funding-table th:nth-child(2),
        .funding-table td:nth-child(2) {
          width: 110px;
          min-width: 110px;
          max-width: 110px;
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
          overflow: hidden;
        }
        .symbol-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 110px;
        }
        .token-logo {
          width: 32px;
          height: 32px;
          min-width: 32px;
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
          height: 8px;
        }
        .table-overflow::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
        }
        .table-overflow::-webkit-scrollbar-thumb {
          background: rgba(99,130,246,0.5);
          border-radius: 4px;
        }
        .table-overflow::-webkit-scrollbar-thumb:hover {
          background: rgba(99,130,246,0.8);
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

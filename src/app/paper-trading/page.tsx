'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Wallet, History, AlertTriangle, ArrowRightLeft, Target, Trophy, ChevronDown, ChevronUp, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import type { PaperPosition } from '@/app/api/paper-trading/route';
import { type OrderBook, calculateSlippage } from '@/lib/slippage';

const TAKER_FEES: Record<string, number> = {
  binance:     0.0004,
  bybit:       0.0006,
  okx:         0.0005,
  bitget:      0.0006,
  kucoin:      0.0006,
  gateio:      0.0005,
  mexc:        0.0000,
  bingx:       0.0005,
  htx:         0.0005,
  bitmex:      0.00075,
  dydx:        0.0005,
  hyperliquid: 0.00035,
  phemex:      0.0006,
  blofin:      0.0005,
  delta:       0.0005,
};

// ─── Utility: position net PnL helper ────────────────────────────────────────
function calcClosedPnl(p: PaperPosition) {
  const netPricePnl = (p.long_realized_pnl || 0) + (p.short_realized_pnl || 0);
  const netFunding  = (p.long_funding || 0) + (p.short_funding || 0);
  const totalFees   = (p.long_fees   || 0) + (p.short_fees   || 0);
  return netPricePnl + netFunding - totalFees;
}

const renderTimer = (nextFundingISO: string | number | null | undefined, intervalHours: number, nowMs: number) => {
  if (!nextFundingISO) return '—';
  let diff = new Date(nextFundingISO).getTime() - nowMs;
  const intervalMs = intervalHours * 3600_000;
  if (diff < 0 && intervalMs > 0) {
    diff = intervalMs - (Math.abs(diff) % intervalMs);
  }
  if (diff < 0) return '0h 0m 0s';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Two-row label/value grid cell used inside expanded detail panels */
const DetailRow = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
  <>
    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{label}</div>
    <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem', color: valueColor ?? 'var(--text-primary)' }}>{value}</div>
  </>
);

const Divider = () => <div style={{ borderTop: '1px solid var(--border)', gridColumn: 'span 2', margin: '4px 0' }} />;

/** Per-leg detail panel (used in both active + closed positions) */
const LegPanel = ({
  label,
  color,
  exchange,
  entryPrice,
  currentPrice,
  closePrice,
  liqPrice,
  notional,
  pricePnl,
  fundingReceived,
  fundingPaid,
  netFunding,
  fees,
  legUnrealized,
  isClosed,
}: {
  label: string; color: string; exchange: string;
  entryPrice: number; currentPrice: number; closePrice?: number | null;
  liqPrice: number; notional: number;
  pricePnl: number; fundingReceived: number; fundingPaid: number; netFunding: number;
  fees: number; legUnrealized: number; isClosed: boolean;
  timer?: string;
}) => (
  <div style={{ background: 'var(--bg-deep)', padding: 14, borderRadius: 8, borderLeft: `3px solid ${color}` }}>
    <div style={{ fontWeight: 700, color, marginBottom: 10, fontSize: '0.9rem' }}>
      {label}: {exchange.toUpperCase()}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px' }}>
      <DetailRow label="Entry Price"     value={`$${entryPrice.toFixed(4)}`} />
      {isClosed && closePrice != null
        ? <DetailRow label="Close Price" value={`$${closePrice.toFixed(4)}`} />
        : <DetailRow label="Current Price" value={`$${currentPrice.toFixed(4)}`} />
      }
      <DetailRow label="Liq Price" value={`$${liqPrice.toFixed(4)}`} valueColor="var(--negative)" />
      <DetailRow label="Size" value={`$${notional.toFixed(2)}`} />
      <Divider />
      <DetailRow label="Price PnL"  value={`${pricePnl >= 0 ? '+' : ''}$${pricePnl.toFixed(4)}`} valueColor={pricePnl >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      <DetailRow label="Funding Rcv" value={`+$${fundingReceived.toFixed(4)}`} valueColor="var(--positive)" />
      <DetailRow label="Funding Paid" value={`-$${fundingPaid.toFixed(4)}`}    valueColor="var(--negative)" />
      <DetailRow label="Net Funding"  value={`${netFunding >= 0 ? '+' : ''}$${netFunding.toFixed(4)}`} valueColor={netFunding >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      <DetailRow label="Fees" value={`-$${fees.toFixed(4)}`} valueColor="var(--negative)" />
      {timer && <DetailRow label="Next Funding" value={timer} valueColor="var(--accent-blue)" />}
      <Divider />
      <div style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.82rem' }}>{isClosed ? 'Realized:' : 'Unrealized:'}</div>
      <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: legUnrealized >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
        {legUnrealized >= 0 ? '+' : ''}${legUnrealized.toFixed(4)}
      </div>
    </div>
  </div>
);

/** Net Arbitrage summary panel */
const NetArbPanel = ({
  basisSpreadUsd,
  basisSpreadPct,
  longPricePnl,
  shortPricePnl,
  netPricePnl,
  fundingReceived,
  fundingPaid,
  netFunding,
  totalFees,
  netPnl,
  isClosed,
}: {
  basisSpreadUsd: number; basisSpreadPct: number;
  longPricePnl: number; shortPricePnl: number; netPricePnl: number;
  fundingReceived: number; fundingPaid: number; netFunding: number;
  totalFees: number; netPnl: number; isClosed: boolean;
  apr?: number; breakevenText?: string;
}) => (
  <div style={{ background: 'var(--bg-deep)', padding: 14, borderRadius: 8, borderLeft: '3px solid var(--accent-blue)' }}>
    <div style={{ fontWeight: 700, color: 'var(--accent-blue)', marginBottom: 10, fontSize: '0.9rem' }}>
      Net Arbitrage Summary
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 8px' }}>
      <DetailRow label="Basis Spread" value={`$${basisSpreadUsd.toFixed(4)} (${basisSpreadPct >= 0 ? '+' : ''}${basisSpreadPct.toFixed(3)}%)`} />
      <Divider />
      <DetailRow label="Long Price PnL"  value={`${longPricePnl >= 0 ? '+' : ''}$${longPricePnl.toFixed(4)}`} valueColor={longPricePnl >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      <DetailRow label="Short Price PnL" value={`${shortPricePnl >= 0 ? '+' : ''}$${shortPricePnl.toFixed(4)}`} valueColor={shortPricePnl >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      <DetailRow label="Net Price PnL"   value={`${netPricePnl >= 0 ? '+' : ''}$${netPricePnl.toFixed(4)}`} valueColor={netPricePnl >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      <Divider />
      <DetailRow label="Funding Received" value={`+$${fundingReceived.toFixed(4)}`} valueColor="var(--positive)" />
      <DetailRow label="Funding Paid"     value={`-$${fundingPaid.toFixed(4)}`}     valueColor="var(--negative)" />
      <DetailRow label="Net Funding"      value={`${netFunding >= 0 ? '+' : ''}$${netFunding.toFixed(4)}`} valueColor={netFunding >= 0 ? 'var(--positive)' : 'var(--negative)'} />
      <Divider />
      <DetailRow label="Total Fees" value={`-$${totalFees.toFixed(4)}`} valueColor="var(--negative)" />
      {apr != null && <DetailRow label="Est. APR" value={`${apr.toFixed(2)}%`} valueColor="var(--positive)" />}
      {breakevenText && <DetailRow label="Break even" value={breakevenText} valueColor="var(--text-primary)" />}
      <Divider />
      <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.88rem' }}>{isClosed ? 'Net Realized PnL:' : 'Net Unrealized PnL:'}</div>
      <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, fontSize: '0.88rem', color: netPnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
        {netPnl >= 0 ? '+' : ''}${netPnl.toFixed(4)}
      </div>
    </div>
  </div>
);


// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaperTradingPage() {
  const [positions, setPositions]       = useState<PaperPosition[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expandedPos, setExpandedPos]   = useState<string | null>(null);

  // New Position Form
  const [symbol, setSymbol]             = useState('BTC/USDT');
  const [longExchange, setLongExchange] = useState('binance');
  const [shortExchange, setShortExchange] = useState('bybit');
  const [capital, setCapital]           = useState(1000);
  const [leverage, setLeverage]         = useState(5);

  // Autocomplete
  const [allSymbols, setAllSymbols]     = useState<string[]>([]);
  const [searchQuery, setSearchQuery]   = useState('BTC/USDT');
  const [suggestions, setSuggestions]   = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  // Slippage / orderbook
  const [orderbooks, setOrderbooks]     = useState<Record<string, OrderBook>>({});
  const [obLoading, setObLoading]       = useState(false);

  // Market data & timer
  const [marketData, setMarketData]     = useState<any[]>([]);
  const [nowTimer, setNowTimer]         = useState(Date.now());

  // Live prices per leg
  interface LivePrice {
    longPrice: number;
    shortPrice: number;
  }
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});

  const fetchLivePrices = useCallback(async (openPositions: PaperPosition[]) => {
    const updates: Record<string, LivePrice> = {};
    await Promise.allSettled(
      openPositions.map(async (pos) => {
        const [longRes, shortRes] = await Promise.all([
          fetch(`/api/price?exchange=${pos.long_exchange}&symbol=${pos.symbol}`),
          fetch(`/api/price?exchange=${pos.short_exchange}&symbol=${pos.symbol}`),
        ]);
        const longData = await longRes.json();
        const shortData = await shortRes.json();
        
        updates[pos.id] = {
          longPrice: longData.price || pos.long_entry_price,
          shortPrice: shortData.price || pos.short_entry_price,
        };
      })
    );
    setLivePrices(updates);
  }, []);

  // ── Data fetchers ──────────────────────────────────────────────────────────
  const fetchPositions = async () => {
    try {
      const res  = await fetch('/api/paper-trading');
      const json = await res.json();
      if (json.success) setPositions(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSymbols = async () => {
    try {
      const res  = await fetch('/api/funding-rates');
      const json = await res.json();
      if (json.data) {
        setMarketData(json.data);
        setAllSymbols(json.data.map((d: any) => d.symbol));
      }
    } catch (e) {
      console.error('Failed to fetch symbols', e);
    }
  };

  useEffect(() => {
    fetchPositions();
    fetchSymbols();
    const interval = setInterval(() => { fetchPositions(); fetchSymbols(); }, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const openPos = positions.filter((p: PaperPosition) => p.status === 'OPEN');
    if (openPos.length === 0) return;
    
    fetchLivePrices(openPos);
    const id = setInterval(() => fetchLivePrices(openPos), 30_000);
    return () => clearInterval(id);
  }, [positions, fetchLivePrices]);

  useEffect(() => {
    const timer = setInterval(() => setNowTimer(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Stable string keys prevent infinite loop (objects recreated on every render)
  useEffect(() => {
    if (!symbol || !longExchange || !shortExchange) return;
    const fetchOB = async () => {
      setObLoading(true);
      try {
        const res  = await fetch(`/api/orderbook?symbol=${symbol}&exchanges=${longExchange},${shortExchange}`);
        const json = await res.json();
        if (json.success) setOrderbooks(json.data);
      } catch (e) { console.error(e); }
      finally { setObLoading(false); }
    };
    fetchOB();
    const interval = setInterval(fetchOB, 30000);
    return () => clearInterval(interval);
  }, [symbol, longExchange, shortExchange]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sym = params.get('symbol');
    const long = params.get('long');
    const short = params.get('short');
    if (sym) { setSymbol(sym); setSearchQuery(sym); }
    if (long) setLongExchange(long);
    if (short) setShortExchange(short);
  }, []);

  // ── Autocomplete handlers ──────────────────────────────────────────────────
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearchQuery(v); setSymbol(v);
    setSuggestions(allSymbols.filter(s => s.toLowerCase().includes(v.toLowerCase()) || s.split('/')[0].toLowerCase().includes(v.toLowerCase())).slice(0, 10));
    setShowSuggestions(true); setActiveSuggestionIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && activeSuggestionIndex < suggestions.length - 1) setActiveSuggestionIndex(i => i + 1);
    else if (e.key === 'ArrowUp' && activeSuggestionIndex > 0) setActiveSuggestionIndex(i => i - 1);
    else if (e.key === 'Enter' && showSuggestions && suggestions.length > 0) {
      e.preventDefault(); setSearchQuery(suggestions[activeSuggestionIndex]); setSymbol(suggestions[activeSuggestionIndex]); setShowSuggestions(false);
    } else if (e.key === 'Escape') setShowSuggestions(false);
  };

  const selectSuggestion = (s: string) => { setSearchQuery(s); setSymbol(s); setShowSuggestions(false); };

  // ── Open / Close position ──────────────────────────────────────────────────
  const openPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (longExchange === shortExchange) { alert('Long and Short exchange cannot be the same'); return; }
    if (capital < 10)    { alert('Minimum capital is $10'); return; }
    if (leverage < 1 || leverage > 125) { alert('Leverage must be between 1x and 125x'); return; }

    const market = marketData.find(m => m.symbol === symbol);
    if (!market) { alert('No funding data available for this symbol'); return; }

    const longRate  = market[longExchange];
    const shortRate = market[shortExchange];
    if (typeof longRate !== 'number' || typeof shortRate !== 'number') {
      alert('No funding data available on selected exchanges'); return;
    }

    let longNextTime   = 0, shortNextTime   = 0;
    let longIntervalHours = 8, shortIntervalHours = 8;
    const longRateAtEntry  = longRate;
    const shortRateAtEntry = shortRate;

    longIntervalHours  = market.exchangeIntervals?.[longExchange]  ?? 8;
    shortIntervalHours = market.exchangeIntervals?.[shortExchange] ?? 8;

    if (market.exchangeNextFundingTimes) {
      const ln = market.exchangeNextFundingTimes[longExchange];
      if (ln) longNextTime = new Date(ln).getTime();
      const sn = market.exchangeNextFundingTimes[shortExchange];
      if (sn) shortNextTime = new Date(sn).getTime();
    }

    // STRICT: require exchange-specific mark prices — NEVER use shared market.price fallback.
    // If an exchange doesn't list this token, market.price (from another exchange) would make
    // both entry prices identical, which is a silent data corruption.
    const longEntryPrice  = market.exchangePrices?.[longExchange];
    const shortEntryPrice = market.exchangePrices?.[shortExchange];

    if (longEntryPrice == null) {
      alert(`❌ ${longExchange.toUpperCase()} does not have a price for ${symbol}. This token may not be listed on ${longExchange.toUpperCase()} perpetuals.\n\nPlease select a different Long exchange that lists this token.`);
      return;
    }
    if (shortEntryPrice == null) {
      alert(`❌ ${shortExchange.toUpperCase()} does not have a price for ${symbol}. This token may not be listed on ${shortExchange.toUpperCase()} perpetuals.\n\nPlease select a different Short exchange that lists this token.`);
      return;
    }
    if (longEntryPrice === shortEntryPrice) {
      // Prices are identical — this typically means both came from the same data source.
      // Log a warning but still allow the trade (they could genuinely be equal momentarily).
      console.warn(`[PaperTrading] Warning: ${longExchange} and ${shortExchange} entry prices are identical ($${longEntryPrice}) for ${symbol}. Data may be from same source.`);
    }

    try {
      const res  = await fetch('/api/paper-trading', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol, longExchange, shortExchange, capital, leverage,
          longEntryPrice, shortEntryPrice,
          longNextTime, shortNextTime, longIntervalHours, shortIntervalHours,
          longRateAtEntry, shortRateAtEntry,
        }),
      });
      const json = await res.json();
      if (!json.success && json.error) alert(`Failed to open position: ${json.error}`);
      else fetchPositions();
    } catch (e) { console.error(e); }
  };

  const closePosition = async (p: PaperPosition) => {
    const market = marketData.find(m => m.symbol === p.symbol);
    // Per-leg fallback: use each leg's stored entry price, NOT the shared market.price.
    // This ensures long/short close prices remain independent even without exchange-specific data.
    const currLong  = market?.exchangePrices?.[p.long_exchange]  ?? p.long_entry_price;
    const currShort = market?.exchangePrices?.[p.short_exchange] ?? p.short_entry_price;
    try {
      await fetch(`/api/paper-trading/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longClosePrice: currLong, shortClosePrice: currShort }),
      });
      fetchPositions();
    } catch (e) { console.error(e); }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const activePositions = positions.filter(p => p.status === 'OPEN');
  const closedPositions = positions.filter(p => p.status === 'CLOSED');

  // Aggregate metrics
  const totalFundingReceived = positions.reduce((s, p) => s + (p.long_funding_received || 0) + (p.short_funding_received || 0), 0);
  const totalFundingPaid     = positions.reduce((s, p) => s + (p.long_funding_paid     || 0) + (p.short_funding_paid     || 0), 0);
  const totalFeesPaid        = positions.reduce((s, p) => s + (p.long_fees || 0) + (p.short_fees || 0), 0);

  let totalNetPnL = 0;
  for (const p of closedPositions) totalNetPnL += calcClosedPnl(p);
  for (const p of activePositions) {
    const market    = marketData.find(m => m.symbol === p.symbol);
    // Fallback to per-leg stored entry price — never share market.price across both legs
    const currLong  = market?.exchangePrices?.[p.long_exchange]  ?? p.long_entry_price;
    const currShort = market?.exchangePrices?.[p.short_exchange] ?? p.short_entry_price;
    totalNetPnL += ((currLong  - p.long_entry_price)  / p.long_entry_price)  * p.notional_per_leg
                 + ((p.short_entry_price - currShort) / p.short_entry_price) * p.notional_per_leg
                 + (p.long_funding || 0) + (p.short_funding || 0)
                 - (p.long_fees   || 0) - (p.short_fees   || 0);
  }

  const winningTrades = closedPositions.filter(p => calcClosedPnl(p) > 0);
  const winRate = closedPositions.length > 0 ? (winningTrades.length / closedPositions.length) * 100 : 0;
  // FIX: ROI denominator = capital (single margin deposit), NOT capital×2
  const avgROI = closedPositions.length > 0
    ? closedPositions.reduce((s, p) => s + (calcClosedPnl(p) / p.capital * 100), 0) / closedPositions.length
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '2rem 1rem', maxWidth: 1300, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
        <div style={{ background: 'rgba(59,130,246,0.15)', padding: 12, borderRadius: 12, color: 'var(--accent-blue)' }}>
          <Activity size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Paper Trading Simulator</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Risk-free funding rate arbitrage. Delta-neutral positions accrue real funding continuously.
          </p>
        </div>
      </div>

      {/* Metrics Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: '2rem' }}>
        {[
          { icon: <Wallet size={16} />, label: 'Total Net PnL', value: `${totalNetPnL >= 0 ? '+' : ''}$${totalNetPnL.toFixed(4)}`, color: totalNetPnL >= 0 ? 'var(--positive)' : 'var(--negative)' },
          { icon: <TrendingUp size={16} />, label: 'Funding Received', value: `+$${totalFundingReceived.toFixed(4)}`, color: 'var(--positive)' },
          { icon: <TrendingDown size={16} />, label: 'Funding Paid', value: `-$${totalFundingPaid.toFixed(4)}`, color: 'var(--negative)' },
          { icon: <Target size={16} />, label: 'Net Funding', value: `${(totalFundingReceived - totalFundingPaid) >= 0 ? '+' : ''}$${(totalFundingReceived - totalFundingPaid).toFixed(4)}`, color: 'var(--accent-blue)' },
          { icon: <AlertTriangle size={16} />, label: 'Total Fees Paid', value: `-$${totalFeesPaid.toFixed(2)}`, color: 'var(--negative)' },
          { icon: <Trophy size={16} />, label: 'Win Rate & Avg ROI', value: `${winRate.toFixed(1)}%`, sub: `(${avgROI > 0 ? '+' : ''}${avgROI.toFixed(2)}% Avg)`, color: 'var(--text-primary)' },
        ].map((m, i) => (
          <div key={i} className="stat-card" style={{ padding: '1.25rem', background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', marginBottom: 10 }}>
              {m.icon} <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>{m.label}</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: m.color, fontFamily: 'monospace' }}>
              {m.value}
              {m.sub && <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: 4 }}>{m.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* Left Col: Open Position Form */}
        <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 16, border: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowRightLeft size={18} color="var(--accent-blue)" /> Open Trade
          </h2>
          <form onSubmit={openPosition} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Symbol */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Symbol</label>
              <input
                type="text" value={searchQuery} onChange={handleSearchChange} onKeyDown={handleKeyDown}
                onFocus={() => { if (searchQuery && allSymbols.length > 0) { setSuggestions(allSymbols.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10)); setShowSuggestions(true); } }}
                onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
                placeholder="Search symbol" required
                style={{ width: '100%', background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8, outline: 'none' }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, padding: 0, listStyle: 'none', maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                  {suggestions.map((s, idx) => (
                    <li key={s} onClick={() => selectSuggestion(s)} onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      style={{ padding: '10px 12px', cursor: 'pointer', fontSize: '0.9rem', background: idx === activeSuggestionIndex ? 'rgba(59,130,246,0.1)' : 'transparent', color: idx === activeSuggestionIndex ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Exchange selects */}
            {[
              { label: 'Long Leg Exchange', labelColor: 'var(--positive)', val: longExchange, set: setLongExchange },
              { label: 'Short Leg Exchange', labelColor: 'var(--negative)', val: shortExchange, set: setShortExchange },
            ].map(({ label, labelColor, val, set }) => (
              <div key={label}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: labelColor, marginBottom: 6, fontWeight: 600 }}>{label}</label>
                <select value={val} onChange={e => set(e.target.value)} required
                  style={{ width: '100%', background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8, outline: 'none' }}>
                  {Object.keys(TAKER_FEES).map(ex => <option key={ex} value={ex}>{ex.toUpperCase()}</option>)}
                </select>
              </div>
            ))}

            {/* Capital / Leverage */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Capital ($)', min: 10, max: 10000000, val: capital, set: setCapital },
                { label: 'Leverage (x)', min: 1, max: 125, val: leverage, set: setLeverage },
              ].map(({ label, min, max, val, set }) => (
                <div key={label}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>{label}</label>
                  <input type="number" min={min} max={max} step="1" value={val} onChange={e => set(Number(e.target.value))} required
                    style={{ width: '100%', background: 'var(--bg-deep)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: 8, outline: 'none' }} />
                </div>
              ))}
            </div>

            {/* Trade preview / slippage */}
            <div style={{ padding: '12px', background: 'var(--bg-deep)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem' }}>
              {/* Exchange-specific prices — strict, no market.price fallback */}
              {(() => {
                const market = marketData.find(m => m.symbol === symbol);
                // Strict: only show prices that actually come from each specific exchange
                const lp = market?.exchangePrices?.[longExchange];   // undefined if exchange doesn't list token
                const sp = market?.exchangePrices?.[shortExchange];  // undefined if exchange doesn't list token
                const longMissing  = market != null && lp == null;
                const shortMissing = market != null && sp == null;
                const basis    = (lp != null && sp != null) ? sp - lp : null;
                const basisPct = (lp != null && sp != null && lp > 0) ? (sp / lp - 1) * 100 : null;
                return (
                  <>
                    {/* Long price row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Long entry price ({longExchange}):</span>
                      {longMissing
                        ? <span style={{ color: 'var(--negative)', fontWeight: 600 }}>❌ Not listed on {longExchange.toUpperCase()}</span>
                        : <span style={{ fontFamily: 'monospace', color: 'var(--positive)' }}>{lp != null ? `$${lp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                      }
                    </div>
                    {/* Short price row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Short entry price ({shortExchange}):</span>
                      {shortMissing
                        ? <span style={{ color: 'var(--negative)', fontWeight: 600 }}>❌ Not listed on {shortExchange.toUpperCase()}</span>
                        : <span style={{ fontFamily: 'monospace', color: 'var(--negative)' }}>{sp != null ? `$${sp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—'}</span>
                      }
                    </div>
                    {/* Hard block warning */}
                    {(longMissing || shortMissing) && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 6, padding: '8px 10px', marginTop: 6, color: 'var(--negative)', fontSize: '0.78rem' }}>
                        <AlertTriangle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span>Cannot open trade: select exchanges that both list <strong>{symbol}</strong> perpetuals.</span>
                      </div>
                    )}
                    {/* Basis spread — only shown when both prices are exchange-specific */}
                    {basis != null && basisPct != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 4, marginTop: 4 }}>
                        <span>Basis spread:</span>
                        <span style={{ fontFamily: 'monospace' }}>${basis.toFixed(4)} ({basisPct >= 0 ? '+' : ''}{basisPct.toFixed(4)}%)</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                  </>
                );
              })()}

              {/* Exposure */}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Total Exposure</span>
                <span style={{ fontFamily: 'monospace' }}>${(capital * leverage * 2).toFixed(2)} (${capital * leverage} per leg)</span>
              </div>

            </div>

            {(() => {
              const market = marketData.find(m => m.symbol === symbol);
              const canTrade = market?.exchangePrices?.[longExchange] != null && market?.exchangePrices?.[shortExchange] != null;
              return (
                <button type="submit" disabled={!canTrade}
                  style={{ width: '100%', background: canTrade ? 'var(--accent-blue)' : 'rgba(100,100,100,0.3)', color: canTrade ? '#fff' : 'var(--text-muted)', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: canTrade ? 'pointer' : 'not-allowed', marginTop: 4, transition: 'all 0.2s' }}>
                  {canTrade ? 'Open Simulated Trade' : '⚠ Select exchanges that list this token'}
                </button>
              );
            })()}
          </form>
        </div>

        {/* Right Col: Tables */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ─── Active Positions ─────────────────────────────────────────── */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--positive)', boxShadow: '0 0 8px var(--positive)' }} />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Active Positions ({activePositions.length})</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {['Symbol', 'Capital', 'Basis Spread', 'Net Price PnL', 'Net Funding', 'Total Fees', 'Net Unrealized PnL', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activePositions.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No active positions.</td></tr>
                  ) : activePositions.map(p => {
                    const market = marketData.find(m => m.symbol === p.symbol);
                    // Fix: Use per-leg live prices fetched every 30s instead of market.price
                    const currLong      = livePrices[p.id]?.longPrice  ?? p.long_entry_price;
                    const currShort     = livePrices[p.id]?.shortPrice ?? p.short_entry_price;
                    
                    const longPriceIsLive  = !!livePrices[p.id]?.longPrice;
                    const shortPriceIsLive = !!livePrices[p.id]?.shortPrice;

                    const basisUsd      = currShort - currLong;
                    const basisPct      = currLong > 0 ? (currShort / currLong - 1) * 100 : 0;

                    const longPricePnl  = p.long_entry_price > 0
                      ? ((currLong  - p.long_entry_price)  / p.long_entry_price)  * p.notional_per_leg
                      : 0;
                    const shortPricePnl = p.short_entry_price > 0
                      ? ((p.short_entry_price - currShort) / p.short_entry_price) * p.notional_per_leg
                      : 0;
                    const netPricePnl   = longPricePnl + shortPricePnl;

                    const longFundRcv   = p.long_funding_received  || 0;
                    const longFundPaid  = p.long_funding_paid       || 0;
                    const shortFundRcv  = p.short_funding_received  || 0;
                    const shortFundPaid = p.short_funding_paid      || 0;
                    const totalRcv      = longFundRcv  + shortFundRcv;
                    const totalPaid     = longFundPaid + shortFundPaid;
                    const netFunding    = (p.long_funding || 0) + (p.short_funding || 0);

                    const totalFees     = (p.long_fees || 0) + (p.short_fees || 0);
                    const netUnrealized = netPricePnl + netFunding - totalFees;

                    const MMR            = 0.005;
                    const longLiqPrice   = p.long_entry_price  * (1 - (1 / p.leverage) + MMR);
                    const shortLiqPrice  = p.short_entry_price * (1 + (1 / p.leverage) - MMR);

                    const longNextISO = market?.exchangeNextFunding?.[p.long_exchange] ?? p.long_next_funding_time;
                    const shortNextISO = market?.exchangeNextFunding?.[p.short_exchange] ?? p.short_next_funding_time;
                    const longTimer = renderTimer(longNextISO, p.long_funding_interval_hours || 8, nowTimer);
                    const shortTimer = renderTimer(shortNextISO, p.short_funding_interval_hours || 8, nowTimer);

                    const longRate = market?.[p.long_exchange] ?? p.long_rate_at_entry ?? 0;
                    const shortRate = market?.[p.short_exchange] ?? p.short_rate_at_entry ?? 0;
                    
                    const totalFeesCalculated = (p.long_fees || 0) + (p.short_fees || 0) 
                      + p.notional_per_leg * (TAKER_FEES[p.long_exchange] ?? 0.0005) 
                      + p.notional_per_leg * (TAKER_FEES[p.short_exchange] ?? 0.0005) 
                      + p.notional_per_leg * 2 * 0.0005;

                    const netFundingPerEvent = p.notional_per_leg * Math.abs(longRate - shortRate);
                    let breakevenText = 'N/A';
                    if (netFundingPerEvent > 0) {
                      const beEvents = totalFeesCalculated / netFundingPerEvent;
                      const beDays = (beEvents * (p.long_funding_interval_hours || 8)) / 24;
                      breakevenText = `~${Math.ceil(beEvents)} events (~${beDays.toFixed(1)} days)`;
                    }

                    const apr = Math.abs(longRate - shortRate) * (8760 / (p.long_funding_interval_hours || 8)) * 100;

                    const isExpanded    = expandedPos === p.id;

                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', fontSize: '0.88rem', background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 700, cursor: 'pointer', color: 'var(--accent-blue)', whiteSpace: 'nowrap' }} onClick={() => setExpandedPos(isExpanded ? null : p.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{p.symbol} {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{p.leverage}x · {p.long_exchange.toUpperCase()} / {p.short_exchange.toUpperCase()}</div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600 }}>${p.capital.toLocaleString()}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.leverage}x → ${p.notional_per_leg.toLocaleString()}/leg</div>
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            <span style={{ color: basisUsd >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                              {basisUsd >= 0 ? '+' : ''}${basisUsd.toFixed(4)}
                            </span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({basisPct >= 0 ? '+' : ''}{basisPct.toFixed(4)}%)</div>
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: netPricePnl >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                            {netPricePnl >= 0 ? '+' : ''}${netPricePnl.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            <div style={{ color: netFunding >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>
                              {netFunding >= 0 ? '+' : ''}${netFunding.toFixed(4)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--positive)' }}>+${totalRcv.toFixed(4)} rcv</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--negative)' }}>-${totalPaid.toFixed(4)} paid</div>
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--negative)', whiteSpace: 'nowrap' }}>-${totalFees.toFixed(4)}</td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: netUnrealized >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                            {netUnrealized >= 0 ? '+' : ''}${netUnrealized.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <button onClick={() => closePosition(p)}
                              style={{ padding: '6px 12px', background: 'rgba(244,63,94,0.1)', color: 'var(--negative)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 6, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                              Close
                            </button>
                          </td>
                        </tr>

                        {/* Expanded: 3-panel breakdown */}
                        {isExpanded && (
                          <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                            <td colSpan={8} style={{ padding: '16px' }}>
                              {/* Price source warning */}
                              {(!longPriceIsLive || !shortPriceIsLive) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: 'var(--warning)', fontSize: '0.82rem' }}>
                                  <AlertTriangle size={14} />
                                  <span>
                                    {!longPriceIsLive && !shortPriceIsLive
                                      ? `No live price data for ${p.long_exchange.toUpperCase()} or ${p.short_exchange.toUpperCase()}. Current prices shown are entry prices — neither exchange lists this token with live data.`
                                      : !longPriceIsLive
                                      ? `No live price for ${p.long_exchange.toUpperCase()} — showing entry price as current. ${p.long_exchange.toUpperCase()} may not list ${p.symbol} perpetuals.`
                                      : `No live price for ${p.short_exchange.toUpperCase()} — showing entry price as current. ${p.short_exchange.toUpperCase()} may not list ${p.symbol} perpetuals.`
                                    }
                                  </span>
                                </div>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                                <LegPanel
                                  label="Long Leg" color="var(--positive)" exchange={p.long_exchange}
                                  entryPrice={p.long_entry_price} currentPrice={currLong} liqPrice={longLiqPrice}
                                  notional={p.notional_per_leg} pricePnl={longPricePnl}
                                  fundingReceived={longFundRcv} fundingPaid={longFundPaid} netFunding={p.long_funding || 0}
                                  fees={p.long_fees} legUnrealized={longPricePnl + (p.long_funding || 0) - p.long_fees}
                                  isClosed={false} timer={longTimer}
                                />
                                <LegPanel
                                  label="Short Leg" color="var(--negative)" exchange={p.short_exchange}
                                  entryPrice={p.short_entry_price} currentPrice={currShort} liqPrice={shortLiqPrice}
                                  notional={p.notional_per_leg} pricePnl={shortPricePnl}
                                  fundingReceived={shortFundRcv} fundingPaid={shortFundPaid} netFunding={p.short_funding || 0}
                                  fees={p.short_fees} legUnrealized={shortPricePnl + (p.short_funding || 0) - p.short_fees}
                                  isClosed={false} timer={shortTimer}
                                />
                                <NetArbPanel
                                  basisSpreadUsd={basisUsd} basisSpreadPct={basisPct}
                                  longPricePnl={longPricePnl} shortPricePnl={shortPricePnl} netPricePnl={netPricePnl}
                                  fundingReceived={totalRcv} fundingPaid={totalPaid} netFunding={netFunding}
                                  totalFees={totalFees} netPnl={netUnrealized} isClosed={false}
                                  apr={apr} breakevenText={breakevenText}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Trade History ─────────────────────────────────────────────── */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <History size={18} color="var(--text-muted)" />
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Trade History</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    {['Symbol / Status', 'Duration', 'Net Price PnL', 'Funding Rcv', 'Funding Paid', 'Net Funding', 'Total Fees', 'Net Realized PnL', 'ROI'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No trade history.</td></tr>
                  ) : closedPositions.map(p => {
                    const isLiquidated   = p.close_reason === 'LIQUIDATED';
                    const netPricePnl    = (p.long_realized_pnl || 0) + (p.short_realized_pnl || 0);
                    const fundRcv        = (p.long_funding_received || 0) + (p.short_funding_received || 0);
                    const fundPaid       = (p.long_funding_paid    || 0) + (p.short_funding_paid    || 0);
                    const netFunding     = (p.long_funding || 0) + (p.short_funding || 0);
                    const totalFees      = (p.long_fees || 0) + (p.short_fees || 0);
                    const netRealizedPnl = netPricePnl + netFunding - totalFees;
                    // FIX: ROI = netPnl / capital (NOT capital*2)
                    const roi            = p.capital > 0 ? (netRealizedPnl / p.capital) * 100 : 0;

                    let durationStr = '—';
                    if (p.close_time) {
                      const ms = p.close_time - p.entry_time;
                      const d = Math.floor(ms / 86400000), h2 = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
                      durationStr = `${d > 0 ? d + 'd ' : ''}${h2 > 0 ? h2 + 'h ' : ''}${m}m`;
                    }

                    const isExpanded = expandedPos === p.id;

                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', fontSize: '0.88rem', opacity: 0.9, background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setExpandedPos(isExpanded ? null : p.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                              {p.symbol} {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              {isLiquidated ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(244,63,94,0.15)', color: 'var(--negative)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                  <Zap size={10} /> LIQUIDATED
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(100,100,100,0.15)', color: 'var(--text-muted)', borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', fontWeight: 600 }}>
                                  CLOSED
                                </span>
                              )}
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.leverage}x</span>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            <div style={{ color: 'var(--text-primary)' }}>{durationStr}</div>
                            <div>{new Date(p.entry_time).toLocaleString()}</div>
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: netPricePnl >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                            {netPricePnl >= 0 ? '+' : ''}${netPricePnl.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--positive)', whiteSpace: 'nowrap' }}>+${fundRcv.toFixed(4)}</td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--negative)', whiteSpace: 'nowrap' }}>-${fundPaid.toFixed(4)}</td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: netFunding >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                            {netFunding >= 0 ? '+' : ''}${netFunding.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: 'var(--negative)', whiteSpace: 'nowrap' }}>-${totalFees.toFixed(4)}</td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: netRealizedPnl >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                            {netRealizedPnl >= 0 ? '+' : ''}${netRealizedPnl.toFixed(4)}
                          </td>
                          <td style={{ padding: '12px 14px', fontFamily: 'monospace', color: roi >= 0 ? 'var(--positive)' : 'var(--negative)', whiteSpace: 'nowrap' }}>
                            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                          </td>
                        </tr>

                        {/* Expanded: 3-panel breakdown for closed position */}
                        {isExpanded && (() => {
                          const MMR           = 0.005;
                          const longLiqPrice  = p.long_entry_price  * (1 - (1 / p.leverage) + MMR);
                          const shortLiqPrice = p.short_entry_price * (1 + (1 / p.leverage) - MMR);
                          const longPricePnl  = p.long_realized_pnl  || 0;
                          const shortPricePnl = p.short_realized_pnl || 0;
                          const longFundRcv   = p.long_funding_received  || 0;
                          const longFundPaid  = p.long_funding_paid      || 0;
                          const shortFundRcv  = p.short_funding_received || 0;
                          const shortFundPaid = p.short_funding_paid     || 0;
                          const totalRcv      = longFundRcv + shortFundRcv;
                          const totalPaid     = longFundPaid + shortFundPaid;
                          const basisUsd      = (p.short_entry_price || 0) - (p.long_entry_price || 0);
                          const basisPct      = p.long_entry_price > 0 ? (p.short_entry_price / p.long_entry_price - 1) * 100 : 0;

                          return (
                            <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
                              <td colSpan={9} style={{ padding: '16px' }}>
                                {isLiquidated && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: 'var(--negative)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <Zap size={16} /> Position was liquidated. Exit prices were clamped to liquidation price.
                                  </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                                  <LegPanel
                                    label="Long Leg" color="var(--positive)" exchange={p.long_exchange}
                                    entryPrice={p.long_entry_price} currentPrice={p.long_close_price ?? p.long_entry_price}
                                    closePrice={p.long_close_price} liqPrice={longLiqPrice}
                                    notional={p.notional_per_leg} pricePnl={longPricePnl}
                                    fundingReceived={longFundRcv} fundingPaid={longFundPaid} netFunding={p.long_funding || 0}
                                    fees={p.long_fees} legUnrealized={longPricePnl + (p.long_funding || 0) - p.long_fees}
                                    isClosed={true}
                                  />
                                  <LegPanel
                                    label="Short Leg" color="var(--negative)" exchange={p.short_exchange}
                                    entryPrice={p.short_entry_price} currentPrice={p.short_close_price ?? p.short_entry_price}
                                    closePrice={p.short_close_price} liqPrice={shortLiqPrice}
                                    notional={p.notional_per_leg} pricePnl={shortPricePnl}
                                    fundingReceived={shortFundRcv} fundingPaid={shortFundPaid} netFunding={p.short_funding || 0}
                                    fees={p.short_fees} legUnrealized={shortPricePnl + (p.short_funding || 0) - p.short_fees}
                                    isClosed={true}
                                  />
                                  <NetArbPanel
                                    basisSpreadUsd={basisUsd} basisSpreadPct={basisPct}
                                    longPricePnl={longPricePnl} shortPricePnl={shortPricePnl} netPricePnl={netPricePnl}
                                    fundingReceived={totalRcv} fundingPaid={totalPaid} netFunding={netFunding}
                                    totalFees={totalFees} netPnl={netRealizedPnl} isClosed={true}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>


    </div>
  );
}

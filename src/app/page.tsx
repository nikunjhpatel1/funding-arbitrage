'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import StatsGrid from '@/components/StatsGrid';
import FundingRateTable, { type EnrichedRow } from '@/components/FundingRateTable';

interface FundingRateEntry {
  id: string;
  symbol: string;
  baseAsset: string;
  logoColor: string;
  logoText: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  openInterest: number;
  fundingIntervalHours: number;
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
  maxSpread: number;
  opportunity: 'hot' | 'mild' | 'low';
  nextFunding: string;
  exchangeErrors: string[];
  exchangeIntervals: Record<string, number>;
  exchangePrices: Record<string, number>;
  exchangeNextFundingTimes?: Record<string, string | undefined>;
}

interface ApiResponse {
  data: FundingRateEntry[];
  updatedAt: string;
  exchangeStatus: Record<string, 'ok' | 'stale' | 'error'>;
}

const EXCHANGE_LABELS: Record<string, string> = {
  binance: 'Binance', bybit: 'Bybit', okx: 'OKX',
  bitget: 'Bitget', kucoin: 'KuCoin', gateio: 'Gate.io',
  mexc: 'MEXC', bingx: 'BingX', htx: 'HTX', bitmex: 'BitMEX',
  dydx: 'dYdX', hyperliquid: 'Hyperliquid', phemex: 'Phemex',
  blofin: 'BloFin', delta: 'Delta',
};

export default function HomePage() {
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitial, setIsInitial] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrichedData, setEnrichedData] = useState<EnrichedRow[]>([]);
  const [mounted, setMounted] = useState(false);
  const [positionSize, setPositionSize] = useState<number>(1000);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000);
      const res = await fetch('/api/funding-rates', {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (json && Array.isArray(json.data)) {
        setApiData(json);
      } else {
        throw new Error('Invalid data format received');
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setError('Request timed out - please try refreshing');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to fetch data');
      }
    } finally {
      setIsRefreshing(false);
      setIsInitial(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => {
      fetchData();
    }, 500);
    return () => clearTimeout(timer);
  }, [mounted, fetchData]);

  useEffect(() => {
    const id = setInterval(fetchData, 300_000);
    return () => clearInterval(id);
  }, [fetchData]);

  // DO NOT add any other setInterval for now
  // The price refresh can be added later
  // once the main data loads correctly

  return (
    <>
      <section className="hero animate-fade-up">
        <div className="hero-eyebrow">
          <TrendingUp size={12} />
          Real-Time Arbitrage Intelligence
        </div>
        <h1 className="hero-title">
          <span>Funding Rate </span>
          <span className="gradient-text">Arbitrage</span>
          <br />
          <span>Made Simple</span>
        </h1>
        <p className="hero-subtitle">
          Live funding rates from <strong>15 exchanges</strong> — Binance, Bybit, OKX, 
          Bitget, KuCoin, Gate.io, MEXC, BingX, HTX, BitMEX, dYdX, Hyperliquid, Phemex, 
          BloFin & Delta Exchange. Fetches <strong>all 200–400+ perpetual pairs</strong>, 
          sorted by max spread.
        </p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="exchange-status-bar" style={{ marginBottom: 0 }}>
          {Object.entries(EXCHANGE_LABELS).map(([key, label]) => {
            const status = apiData?.exchangeStatus?.[key];
            return (
              <div key={key} className={`exchange-status-chip ${
                status === 'error' ? 'error' : status === 'stale' ? 'stale' : status === 'ok' ? 'ok' : 'loading'
              }`}>
                {status === 'ok' ? <CheckCircle2 size={11} /> :
                 status === 'stale' ? <AlertTriangle size={11} /> :
                 status === 'error' ? <XCircle size={11} /> :
                 <Loader2 size={11} className="spin" />}
                {label}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Est. Position Size:</span>
          <select 
            value={positionSize} 
            onChange={e => setPositionSize(Number(e.target.value))}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontWeight: 600, cursor: 'pointer' }}
          >
            <option value="100">$100</option>
            <option value="500">$500</option>
            <option value="1000">$1,000</option>
            <option value="5000">$5,000</option>
            <option value="10000">$10,000</option>
            <option value="25000">$25,000</option>
          </select>
        </div>
      </div>

      {apiData && enrichedData.length > 0 && <StatsGrid data={enrichedData} />}

      {error && (
        <div style={{
          background: 'rgba(244,63,94,0.1)',
          border: '1px solid rgba(244,63,94,0.3)',
          borderRadius: '8px', padding: '12px 16px',
          color: '#f43f5e', display: 'flex',
          alignItems: 'center', gap: 8,
          marginBottom: '1rem', fontSize: '0.875rem',
        }}>
          <AlertTriangle size={14} />
          {error} —
          <button onClick={fetchData} style={{
            background: 'none', border: 'none',
            color: '#60a5fa', cursor: 'pointer',
            textDecoration: 'underline',
          }}>Try again</button>
        </div>
      )}

      {isInitial && !error && !apiData && (
        <div style={{
          textAlign: 'center', padding: '4rem 0',
          color: 'var(--text-muted)', fontSize: '0.9rem',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 10,
        }}>
          <Loader2 size={18} className="spin" 
            style={{ color: 'var(--accent-blue)' }} />
          Fetching live rates from 15 exchanges…
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
            (may take a few seconds)
          </span>
        </div>
      )}

      {apiData && apiData.data.length > 0 && (
        <FundingRateTable
          data={apiData.data}
          onRefresh={fetchData}
          isRefreshing={isRefreshing}
          updatedAt={apiData.updatedAt}
          exchangeStatus={apiData.exchangeStatus}
          onEnrichedDataChange={setEnrichedData}
          positionSize={positionSize}
        />
      )}

      <style>{`
        .exchange-status-bar {
          display: flex; align-items: center;
          gap: 6px; flex-wrap: wrap; margin-bottom: 1.5rem;
        }
        .exchange-status-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 999px;
          font-size: 0.68rem; font-weight: 600;
          border: 1px solid transparent;
        }
        .exchange-status-chip.ok {
          background: rgba(16,185,129,0.1);
          color: #10b981;
          border-color: rgba(16,185,129,0.25);
        }
        .exchange-status-chip.stale {
          background: rgba(245,158,11,0.1);
          color: #f59e0b;
          border-color: rgba(245,158,11,0.25);
        }
        .exchange-status-chip.error {
          background: rgba(244,63,94,0.1);
          color: #f43f5e;
          border-color: rgba(244,63,94,0.25);
        }
        .exchange-status-chip.loading {
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          border-color: var(--border);
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

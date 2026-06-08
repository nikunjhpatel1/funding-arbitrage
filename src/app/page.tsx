'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { FundingRateEntry } from '@/app/api/funding-rates/route';
import StatsGrid from '@/components/StatsGrid';
import FundingRateTable from '@/components/FundingRateTable';

interface ApiResponse {
  data: FundingRateEntry[];
  updatedAt: string;
  exchangeStatus: Record<string, 'ok' | 'error'>;
}

// Ordered to match ALL_EXCHANGES in FundingRateTable
const EXCHANGE_LABELS: Record<string, string> = {
  binance:     'Binance',
  bybit:       'Bybit',
  okx:         'OKX',
  bitget:      'Bitget',
  kucoin:      'KuCoin',
  gateio:      'Gate.io',
  mexc:        'MEXC',
  bingx:       'BingX',
  htx:         'HTX',
  bitmex:      'BitMEX',
  dydx:        'dYdX',
  hyperliquid: 'Hyperliquid',
  phemex:      'Phemex',
  blofin:      'BloFin',
  delta:       'Delta',
};

export default function HomePage() {
  const [apiData,      setApiData]      = useState<ApiResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitial,    setIsInitial]    = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/funding-rates', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse = await res.json();
      setApiData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      setIsRefreshing(false);
      setIsInitial(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <>
      {/* ─── Hero ── */}
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
          Live funding rates from <strong>15 exchanges</strong> — Binance, Bybit, OKX, Bitget,
          KuCoin, Gate.io, MEXC, BingX, HTX, BitMEX, dYdX, Hyperliquid, Phemex, BloFin &amp; Delta Exchange.
          Fetches <strong>all 200–400+ perpetual pairs</strong>, sorted by max spread.
          Funding intervals (1h/4h/8h) shown per coin — hover any rate for its annualized return.
        </p>
      </section>

      {/* ─── Exchange Status Bar ── */}
      <div className="exchange-status-bar animate-fade-up">
        {Object.entries(EXCHANGE_LABELS).map(([key, label]) => {
          const status    = apiData?.exchangeStatus?.[key];
          const isLoading = isInitial && !apiData;
          return (
            <div
              key={key}
              className={`exchange-status-chip ${
                status === 'error' ? 'error' : status === 'ok' ? 'ok' : 'loading'
              }`}
              title={status === 'error' ? `${label} data unavailable` : `${label} data live`}
            >
              {isLoading ? (
                <Loader2 size={11} className="spin" />
              ) : status === 'ok' ? (
                <CheckCircle2 size={11} />
              ) : status === 'error' ? (
                <XCircle size={11} />
              ) : (
                <Loader2 size={11} className="spin" />
              )}
              {label}
            </div>
          );
        })}
      </div>

      {/* ─── Stats ── */}
      {apiData && <StatsGrid data={apiData.data} />}

      {/* ─── Error ── */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--negative-bg)', border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: 'var(--radius-md)', padding: '12px 16px', color: 'var(--negative)',
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: '1rem', fontSize: '0.875rem',
          }}
        >
          <AlertTriangle size={14} />
          Failed to reach the aggregation API: {error}
        </div>
      )}

      {/* ─── Loading skeleton ── */}
      {isInitial && !error && (
        <div style={{
          textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)',
          fontSize: '0.9rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 10,
        }}>
          <Loader2 size={18} className="spin" style={{ color: 'var(--accent-blue)' }} />
          Fetching live rates from 15 exchanges…
        </div>
      )}

      {/* ─── Table ── */}
      {apiData && (
        <FundingRateTable
          data={apiData.data}
          onRefresh={fetchData}
          isRefreshing={isRefreshing}
          updatedAt={apiData.updatedAt}
          exchangeStatus={apiData.exchangeStatus}
        />
      )}

      <style>{`
        .exchange-status-bar {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 1.5rem;
        }
        .exchange-status-chip {
          display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px;
          border-radius: 999px; font-size: 0.68rem; font-weight: 600;
          border: 1px solid transparent; transition: all 0.3s ease;
        }
        .exchange-status-chip.ok      { background: var(--positive-bg);  color: var(--positive);  border-color: rgba(16,185,129,0.25); }
        .exchange-status-chip.error   { background: var(--negative-bg);  color: var(--negative);  border-color: rgba(244,63,94,0.25);  }
        .exchange-status-chip.loading { background: rgba(255,255,255,0.04); color: var(--text-muted); border-color: var(--border); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

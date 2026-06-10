'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import StatsGrid from '@/components/StatsGrid';
import FundingRateTable from '@/components/FundingRateTable';

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
}

interface ApiResponse {
  data: FundingRateEntry[];
  updatedAt: string;
  exchangeStatus: Record<string, 'ok' | 'error'>;
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
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [fetchData]);

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

      <div className="exchange-status-bar animate-fade-up">
        {Object.entries(EXCHANGE_LABELS).map(([key, label]) => {
          const status = apiData?.exchangeStatus?.[key];
          return (
            <div key={key} className={`exchange-status-chip ${
              status === 'error' ? 'error' : status === 'ok' ? 'ok' : 'loading'
            }`}>
              {status === 'ok' ? <CheckCircle2 size={11} /> :
               status === 'error' ? <XCircle size={11} /> :
               <Loader2 size={11} className="spin" />}
              {label}
            </div>
          );
        })}
      </div>

      {apiData && <StatsGrid data={apiData.data} />}

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

      {isInitial && !error && (
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
            (may take up to 30 seconds)
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

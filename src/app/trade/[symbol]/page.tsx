'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const HistoricalCharts = dynamic(() => import('@/components/HistoricalCharts'), { ssr: false });
import { 
  ArrowLeft, TrendingUp, TrendingDown, 
  ExternalLink, AlertTriangle, Zap,
  BarChart2
} from 'lucide-react';
import type { FundingRateEntry } from '@/app/api/funding-rates/route';

const EXCHANGE_URLS: Record<string, (sym: string) => string> = {
  binance:     (s) => `https://www.binance.com/en/futures/${s}USDT`,
  bybit:       (s) => `https://www.bybit.com/trade/usdt/${s}USDT`,
  okx:         (s) => `https://www.okx.com/trade-swap/${s.toLowerCase()}-usdt-swap`,
  bitget:      (s) => `https://www.bitget.com/futures/usdt/${s}USDT`,
  kucoin:      (s) => `https://www.kucoin.com/futures/trade/${s}USDTM`,
  gateio:      (s) => `https://www.gate.io/futures/usdt/${s}_USDT`,
  mexc:        (s) => `https://futures.mexc.com/exchange/${s}_USDT`,
  bingx:       (s) => `https://bingx.com/en/perpetual/${s}-USDT/`,
  htx:         (s) => `https://www.htx.com/futures/swap/#${s}-USDT`,
  bitmex:      (s) => `https://www.bitmex.com/app/trade/${s}USDT`,
  dydx:        (s) => `https://dydx.trade/trade/${s}-USD`,
  hyperliquid: (s) => `https://app.hyperliquid.xyz/trade/${s}`,
  phemex:      (s) => `https://phemex.com/trade/${s}USDT`,
  blofin:      (s) => `https://blofin.com/futures/${s}-USDT`,
  delta:       (s) => `https://www.delta.exchange/futures/${s}-perpetual`,
};

const EXCHANGE_LABELS: Record<string, string> = {
  binance: 'Binance', bybit: 'Bybit', okx: 'OKX',
  bitget: 'Bitget', kucoin: 'KuCoin', gateio: 'Gate.io',
  mexc: 'MEXC', bingx: 'BingX', htx: 'HTX', bitmex: 'BitMEX',
  dydx: 'dYdX', hyperliquid: 'Hyperliquid', phemex: 'Phemex',
  blofin: 'BloFin', delta: 'Delta',
};

function fmtRate(r: number | null) {
  if (r === null) return '—';
  const pct = (r * 100).toFixed(4);
  return `${r > 0 ? '+' : ''}${pct}%`;
}

function fmtPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function fmtLarge(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function calculateOpportunityScore(
  spread: number,
  vol: number,
  longExchange: string,
  shortExchange: string,
  intervalHours: number
) {
  // Spread (40%): A 0.5% absolute spread gives full 40 points
  const spreadScore = Math.min(40, (spread / 0.005) * 40);

  // Liquidity (30%): Log scale for volume
  let liqScore = 0;
  if (vol > 1e9) liqScore = 30; // > $1B
  else if (vol > 1e8) liqScore = 20 + ((vol - 1e8) / 9e8) * 10;
  else if (vol > 1e7) liqScore = 10 + ((vol - 1e7) / 9e7) * 10;
  else if (vol > 1e6) liqScore = 5;

  // Exchange Quality (15%)
  const topTier = ['binance', 'bybit', 'okx', 'hyperliquid'];
  const midTier = ['bitget', 'kucoin', 'gateio'];
  let exqScore = 0;
  const scoreEx = (ex: string) => {
    if (topTier.includes(ex)) return 7.5;
    if (midTier.includes(ex)) return 5;
    return 3;
  };
  exqScore += scoreEx(longExchange);
  exqScore += scoreEx(shortExchange);

  // Stability (15%): standard 8h funding is most predictable
  const stabScore = intervalHours === 8 ? 15 : intervalHours === 4 ? 10 : 5;

  const total = Math.round(spreadScore + liqScore + exqScore + stabScore);
  return Math.min(100, Math.max(0, total));
}

function getScoreInfo(score: number) {
  if (score >= 80) return { label: 'Excellent', color: 'var(--positive)' };
  if (score >= 60) return { label: 'Good', color: '#60a5fa' };
  if (score >= 40) return { label: 'Moderate', color: 'var(--warning)' };
  return { label: 'Poor', color: 'var(--negative)' };
}

export default function TradePage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params?.symbol as string)?.replace('-', '/') ?? '';
  const baseAsset = symbol.split('/')[0] ?? '';

  const [coinData, setCoinData] = useState<FundingRateEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [tradeAmount, setTradeAmount] = useState<number>(1000);
  const [leverage, setLeverage] = useState<number>(5);
  const [longExchange, setLongExchange] = useState<string>('');
  const [shortExchange, setShortExchange] = useState<string>('');

  useEffect(() => {
    async function load() {
      // 1. Try local storage first
      try {
        const cached = localStorage.getItem('tradeCoinData');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.baseAsset === baseAsset) {
            setCoinData(parsed);
            setupExchanges(parsed);
            setLoading(false);
            return;
          }
        }
      } catch { }

      // 2. Fallback to API if not in local storage
      try {
        const res = await fetch('/api/funding-rates', { cache: 'no-store' });
        const json = await res.json();
        const found = json.data?.find(
          (d: FundingRateEntry) => d.baseAsset === baseAsset
        );
        if (found) {
          setCoinData(found);
          setupExchanges(found);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    function setupExchanges(found: FundingRateEntry) {
      const rates = Object.entries(EXCHANGE_LABELS)
        .map(([key]) => {
          const rawRate = found[key as keyof FundingRateEntry] as number | null;
          let normRate: number | null = null;
          if (rawRate !== null) {
            const interval = found.exchangeIntervals?.[key] ?? 8;
            normRate = rawRate * (8 / interval);
          }
          return { key, rate: normRate };
        })
        .filter(e => e.rate !== null)
        .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
      
      if (rates.length >= 2) {
        // Automatically select the best exchanges (lowest for long, highest for short)
        setLongExchange(rates[0].key);
        setShortExchange(rates[rates.length - 1].key);
      }
    }

    load();
  }, [baseAsset]);

  const longRate = coinData && longExchange ? 
    coinData[longExchange as keyof FundingRateEntry] as number | null 
    : null;
  const shortRate = coinData && shortExchange ? 
    coinData[shortExchange as keyof FundingRateEntry] as number | null 
    : null;
    
  const shortInterval = (coinData?.exchangeIntervals?.[shortExchange]) ?? 8;
  const longInterval = (coinData?.exchangeIntervals?.[longExchange]) ?? 8;
  
  const normalizedShortRate = shortRate !== null ? shortRate * (8 / shortInterval) : null;
  const normalizedLongRate = longRate !== null ? longRate * (8 / longInterval) : null;

  const spread = (normalizedLongRate !== null && normalizedShortRate !== null) 
    ? (normalizedShortRate - normalizedLongRate) 
    : 0;
    
  const positionSize = tradeAmount * leverage;
  
  let estimatedProfitDaily = 0;
  if (shortRate !== null && longRate !== null) {
    estimatedProfitDaily = 
      (shortRate * positionSize * (24 / shortInterval)) - 
      (longRate * positionSize * (24 / longInterval));
  }

  const aprDaily = positionSize > 0 ? (estimatedProfitDaily / positionSize) * 100 : 0;
  const aprMonthly = aprDaily * 30;
  const aprYearly = aprDaily * 365;

  const estimatedProfitMonthly = estimatedProfitDaily * 30;
  const estimatedProfitYearly = estimatedProfitDaily * 365;

  // 8h Equivalent Profit (Daily / 3) to represent a standard "Event"
  const estimatedProfitPerFunding = estimatedProfitDaily / 3;

  const scoreSpread = aprDaily / 100 / 3; // 8h equivalent absolute spread
  const avgInterval = (shortInterval + longInterval) / 2;
  const oppScore = coinData 
    ? calculateOpportunityScore(scoreSpread, coinData.volume24h, longExchange, shortExchange, avgInterval)
    : 0;
  const scoreInfo = getScoreInfo(oppScore);

  const availableExchanges = coinData 
    ? Object.entries(EXCHANGE_LABELS)
        .filter(([key]) => 
          coinData[key as keyof FundingRateEntry] !== null
        )
    : [];

  if (loading) return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ width: '100%', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 32 }} className="pulse"></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div style={{ height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: 16 }} className="pulse"></div>
        <div style={{ height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: 16 }} className="pulse"></div>
      </div>
      <div style={{ height: '200px', background: 'rgba(255,255,255,0.05)', borderRadius: 16, marginBottom: 24 }} className="pulse"></div>
      <style>{`
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 0.3; } 100% { opacity: 0.6; } }
        .pulse { animation: pulse 1.5s infinite ease-in-out; }
      `}</style>
    </div>
  );

  if (!coinData) return (
    <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
      <AlertTriangle size={48} style={{ marginBottom: 16, opacity: 0.3, margin: '0 auto' }}/>
      <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>No data found for {baseAsset}</div>
      <p style={{ marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>The coin may have been delisted or is not supported by our tracked exchanges.</p>
      <button 
        onClick={() => router.back()}
        className="btn btn-primary"
        style={{ marginTop: 24 }}
      >
        <ArrowLeft size={16}/> Go Back
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>
      
      {/* Header Section */}
      <div style={{ 
        display: 'flex', alignItems: 'center', 
        gap: 16, marginBottom: '2.5rem',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={() => router.back()}
          className="btn-ghost"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8,
            cursor: 'pointer', fontSize: '0.85rem',
          }}
        >
          <ArrowLeft size={14}/> Back
        </button>
        <div
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: coinData.logoColor + '22',
            border: `1px solid ${coinData.logoColor}44`,
            color: coinData.logoColor,
            display: 'flex', alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 800,
            boxShadow: `0 0 20px ${coinData.logoColor}22`
          }}
        >{coinData.logoText.slice(0, 4)}</div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            {coinData.symbol}
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Perpetual Futures · Arbitrage Analysis
          </div>
        </div>
        
        {/* Opportunity Score Badge */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: 'var(--shadow-card)'
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>Opp. Score</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: scoreInfo.color, lineHeight: 1.1 }}>
              {oppScore}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/100</span>
            </div>
          </div>
          <div style={{ 
            padding: '4px 10px', borderRadius: 20, 
            background: scoreInfo.color + '15', 
            color: scoreInfo.color, 
            fontSize: '0.75rem', fontWeight: 700 
          }}>
            {scoreInfo.label}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: '2.5rem' }}>
        
        {/* LONG Exchange Recommendation */}
        <div className="stat-card" style={{ 
          borderColor: 'rgba(16,185,129,0.2)', 
          boxShadow: '0 8px 32px rgba(16,185,129,0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: 'rgba(16,185,129,0.15)', padding: 6, borderRadius: 8, color: 'var(--positive)' }}>
                <TrendingUp size={18}/>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--positive)' }}>
                Best Long Exchange
              </span>
            </div>
            <div className="pill pill-positive">BUY / LONG ↑</div>
          </div>
          
          <select
            value={longExchange}
            onChange={e => setLongExchange(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-primary)',
              fontSize: '1rem', fontWeight: 600, marginBottom: 20,
              cursor: 'pointer', outline: 'none'
            }}
          >
            {availableExchanges.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Funding Rate used</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem', color: longRate !== null && longRate < 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {fmtRate(longRate)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Current Price</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1rem' }}>
                {fmtPrice(coinData.price)}
              </span>
            </div>
          </div>

          <a
            href={EXCHANGE_URLS[longExchange]?.(baseAsset) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              width: '100%', justifyContent: 'center', marginTop: 20,
              background: 'rgba(16,185,129,0.1)', color: 'var(--positive)',
              border: '1px solid rgba(16,185,129,0.2)'
            }}
          >
            Open {EXCHANGE_LABELS[longExchange]} <ExternalLink size={14}/>
          </a>
        </div>

        {/* SHORT Exchange Recommendation */}
        <div className="stat-card" style={{ 
          borderColor: 'rgba(244,63,94,0.2)',
          boxShadow: '0 8px 32px rgba(244,63,94,0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ background: 'rgba(244,63,94,0.15)', padding: 6, borderRadius: 8, color: 'var(--negative)' }}>
                <TrendingDown size={18}/>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--negative)' }}>
                Best Short Exchange
              </span>
            </div>
            <div className="pill pill-negative">SELL / SHORT ↓</div>
          </div>
          
          <select
            value={shortExchange}
            onChange={e => setShortExchange(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-primary)',
              fontSize: '1rem', fontWeight: 600, marginBottom: 20,
              cursor: 'pointer', outline: 'none'
            }}
          >
            {availableExchanges.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Funding Rate used</span>
              <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem', color: shortRate !== null && shortRate > 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {fmtRate(shortRate)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Current Price</span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '1rem' }}>
                {fmtPrice(coinData.price)}
              </span>
            </div>
          </div>

          <a
            href={EXCHANGE_URLS[shortExchange]?.(baseAsset) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
            style={{
              width: '100%', justifyContent: 'center', marginTop: 20,
              background: 'rgba(244,63,94,0.1)', color: 'var(--negative)',
              border: '1px solid rgba(244,63,94,0.2)'
            }}
          >
            Open {EXCHANGE_LABELS[shortExchange]} <ExternalLink size={14}/>
          </a>
        </div>
      </div>

      {/* APR and Profit Calculator Section */}
      <div className="stat-card" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2rem' }}>
          <div style={{ background: 'var(--accent-blue-glow)', padding: 8, borderRadius: 8, color: 'var(--accent-blue)' }}>
            <BarChart2 size={20}/>
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Enhanced Profit Calculator</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 32, marginBottom: '2.5rem' }}>
          {/* Controls */}
          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              Trade Amount (USDT)
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[500, 1000, 5000, 10000].map(amt => (
                <button
                  key={amt}
                  onClick={() => setTradeAmount(amt)}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    border: '1px solid',
                    borderColor: tradeAmount === amt ? 'var(--accent-blue)' : 'var(--border)',
                    background: tradeAmount === amt ? 'var(--accent-blue-glow)' : 'transparent',
                    color: tradeAmount === amt ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  ${amt >= 1000 ? `${amt/1000}K` : amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="10"
              value={tradeAmount}
              onChange={e => setTradeAmount(Number(e.target.value))}
              onBlur={e => {
                let val = Number(e.target.value);
                if (isNaN(val) || val < 10) val = 10;
                setTradeAmount(val);
              }}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
              }}
              placeholder="Custom amount..."
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              Leverage
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[1, 2, 3, 5, 10].map(lev => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  style={{
                    padding: '8px 12px', borderRadius: 8,
                    border: '1px solid',
                    borderColor: leverage === lev ? 'var(--warning)' : 'var(--border)',
                    background: leverage === lev ? 'var(--warning-bg)' : 'transparent',
                    color: leverage === lev ? 'var(--warning)' : 'var(--text-secondary)',
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  {lev}x
                </button>
              ))}
            </div>
            <div style={{
              padding: '12px 14px', background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border)', borderRadius: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Total Position Size</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                {fmtLarge(positionSize)}
              </span>
            </div>
          </div>
        </div>

        {/* APR & Estimations Grid */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: 16, borderTop: '1px solid var(--border)', paddingTop: '2rem' 
        }}>
          {[
            { label: 'Current Spread', value: `${(spread * 100).toFixed(4)}%`, sub: 'Difference', color: spread >= 0 ? 'var(--positive)' : 'var(--negative)' },
            { label: 'Daily APR', value: `${aprDaily.toFixed(2)}%`, sub: 'Est. Return (24h)', color: aprDaily >= 0 ? '#60a5fa' : 'var(--negative)' },
            { label: 'Monthly APR', value: `${aprMonthly.toFixed(2)}%`, sub: 'Est. Return (30d)', color: aprMonthly >= 0 ? '#a78bfa' : 'var(--negative)' },
            { label: 'Annual APR', value: `${aprYearly.toFixed(2)}%`, sub: 'Est. Return (365d)', color: aprYearly >= 0 ? 'var(--accent-blue)' : 'var(--negative)' },
          ].map((item, idx) => (
            <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color, fontFamily: 'monospace', marginBottom: 4 }}>{item.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.sub}</div>
            </div>
          ))}
          
          <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--border)', margin: '8px 0' }} />

          {[
            { label: 'Est. Profit (Event)', value: estimatedProfitPerFunding >= 0 ? `$${estimatedProfitPerFunding.toFixed(2)}` : `-$${Math.abs(estimatedProfitPerFunding).toFixed(2)}`, sub: 'Per 8h equivalent event', color: estimatedProfitPerFunding >= 0 ? 'var(--positive)' : 'var(--negative)' },
            { label: 'Est. Profit (Daily)', value: estimatedProfitDaily >= 0 ? `$${estimatedProfitDaily.toFixed(2)}` : `-$${Math.abs(estimatedProfitDaily).toFixed(2)}`, sub: '24h Profit', color: estimatedProfitDaily >= 0 ? '#60a5fa' : 'var(--negative)' },
            { label: 'Est. Profit (Monthly)', value: estimatedProfitMonthly >= 0 ? `$${estimatedProfitMonthly.toFixed(2)}` : `-$${Math.abs(estimatedProfitMonthly).toFixed(2)}`, sub: '30d Profit', color: estimatedProfitMonthly >= 0 ? '#a78bfa' : 'var(--negative)' },
            { label: 'Est. Profit (Annual)', value: estimatedProfitYearly >= 0 ? `$${estimatedProfitYearly.toFixed(2)}` : `-$${Math.abs(estimatedProfitYearly).toFixed(2)}`, sub: '365d Profit', color: estimatedProfitYearly >= 0 ? 'var(--accent-blue)' : 'var(--negative)' },
          ].map((item, idx) => (
            <div key={idx} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: item.color, fontFamily: 'monospace', marginBottom: 4 }}>{item.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <HistoricalCharts symbol={coinData.symbol} baseAsset={coinData.baseAsset} />

      {/* Execution Action */}
      <div style={{
        background: 'linear-gradient(180deg, rgba(59,130,246,0.1) 0%, rgba(59,130,246,0.02) 100%)',
        border: '1px solid rgba(59,130,246,0.3)',
        borderRadius: 16, padding: '2rem',
        textAlign: 'center', boxShadow: '0 10px 40px rgba(59,130,246,0.1)'
      }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-primary)' }}>Execute Arbitrage Trade</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto 24px', lineHeight: 1.5 }}>
          This will open both <strong style={{ color: 'var(--positive)' }}>{EXCHANGE_LABELS[longExchange]}</strong> and <strong style={{ color: 'var(--negative)' }}>{EXCHANGE_LABELS[shortExchange]}</strong> in new tabs so you can place your long and short positions manually.
        </p>
        <button
          onClick={() => {
            window.open(EXCHANGE_URLS[longExchange]?.(baseAsset), '_blank');
            setTimeout(() => {
              window.open(EXCHANGE_URLS[shortExchange]?.(baseAsset), '_blank');
            }, 500);
          }}
          className="btn btn-primary"
          style={{
            padding: '16px 32px', fontSize: '1.1rem', fontWeight: 700, 
            boxShadow: '0 0 30px rgba(59,130,246,0.4)', border: 'none', cursor: 'pointer', color: 'white', borderRadius: 8
          }}
        >
          <Zap size={20} style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'text-bottom' }}/>
          Open Both Exchanges
        </button>
        <div style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          ⚠️ Always verify prices and funding rates on the exchange before executing. Not financial advice.
        </div>
      </div>

    </div>
  );
}

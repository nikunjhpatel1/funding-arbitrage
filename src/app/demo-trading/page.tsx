'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Zap, AlertTriangle, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';

function DemoTradingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const symbol = searchParams.get('symbol') || '';
  const longExchange = searchParams.get('long') || '';
  const shortExchange = searchParams.get('short') || '';

  const [longPrice, setLongPrice] = useState(0);
  const [shortPrice, setShortPrice] = useState(0);
  const [spread, setSpread] = useState(0);
  const [apr, setApr] = useState(0);
  
  const [capital, setCapital] = useState('1000');
  const [leverage, setLeverage] = useState('1');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!symbol) return;
      try {
        const baseAsset = symbol.split('/')[0];
        const res = await fetch('/api/funding-rates', { cache: 'no-store' });
        const json = await res.json();
        const found = json.data?.find((d: any) => d.baseAsset === baseAsset);
        if (found) {
          const lPrice = found.exchangePrices?.[longExchange] ?? found.price ?? 0;
          const sPrice = found.exchangePrices?.[shortExchange] ?? found.price ?? 0;
          setLongPrice(lPrice);
          setShortPrice(sPrice);
          
          const lRate = found[longExchange] ?? 0;
          const sRate = found[shortExchange] ?? 0;
          const lInterval = found.exchangeIntervals?.[longExchange] ?? 8;
          const sInterval = found.exchangeIntervals?.[shortExchange] ?? 8;
          
          const normLRate = lRate * (8 / lInterval);
          const normSRate = sRate * (8 / sInterval);
          
          setSpread((normSRate - normLRate) * 100);
          
          const dailyProfit = (sRate * (24 / sInterval)) - (lRate * (24 / lInterval));
          setApr(dailyProfit * 365 * 100);
        }
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [symbol, longExchange, shortExchange]);

  const capitalNum = parseFloat(capital) || 0;
  const leverageNum = parseFloat(leverage) || 1;
  const notional = capitalNum * leverageNum;
  const estimatedFee = notional * 0.001;
  const estimatedDailyProfit = (notional * (apr / 100)) / 365;

  async function handleExecute() {
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch('/api/demo-trade/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          longExchange,
          shortExchange,
          capital: capitalNum,
          leverage: leverageNum,
          longPrice,
          shortPrice,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ success: false, error: e.message });
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#22c55e' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <button
        onClick={() => router.back()}
        className="btn-ghost"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8,
          cursor: 'pointer', fontSize: '0.85rem', marginBottom: '1.5rem',
        }}
      >
        <ArrowLeft size={14}/> Back
      </button>

      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 16, padding: '2rem',
        width: '100%',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Zap size={22} color="#22c55e" />
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              DEMO MODE
            </h2>
          </div>
        </div>

        {/* Warning */}
        <div style={{
          background: 'rgba(34,197,94,0.15)',
          border: '1px solid rgba(34,197,94,0.4)',
          borderRadius: 8, padding: '0.75rem 1rem',
          display: 'flex', gap: '0.75rem', marginBottom: '1.5rem',
        }}>
          <AlertTriangle size={18} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#22c55e', lineHeight: 1.5, fontWeight: 600 }}>
            Testnet Only, No Real Money. This execution only interacts with Binance Testnet and Bybit Testnet APIs.
          </p>
        </div>

        {/* Trade Details */}
        <div style={{
          background: 'var(--bg-primary)', borderRadius: 10,
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            {symbol} Arbitrage
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Long Exchange</div>
            <div style={{ color: '#22c55e', fontWeight: 600, textTransform: 'capitalize' }}>{longExchange} Testnet</div>
            <div style={{ color: 'var(--text-secondary)' }}>Short Exchange</div>
            <div style={{ color: '#3b82f6', fontWeight: 600, textTransform: 'capitalize' }}>{shortExchange} Testnet</div>
            
            <div style={{ color: 'var(--text-secondary)' }}>Long Price (Live)</div>
            <div style={{ color: 'var(--text-primary)' }}>${longPrice.toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Short Price (Live)</div>
            <div style={{ color: 'var(--text-primary)' }}>${shortPrice.toLocaleString()}</div>
            
            <div style={{ color: 'var(--text-secondary)' }}>Live Spread</div>
            <div style={{ color: '#22c55e', fontWeight: 600 }}>{spread.toFixed(4)}%</div>
            <div style={{ color: 'var(--text-secondary)' }}>Est. APR</div>
            <div style={{ color: '#22c55e', fontWeight: 600 }}>{apr.toFixed(2)}%</div>
          </div>
        </div>

        {/* Capital & Leverage */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
              Virtual Capital (USD)
            </label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
              Leverage (x)
            </label>
            <input
              type="number"
              value={leverage}
              onChange={e => setLeverage(e.target.value)}
              min="1" max="50"
              style={{
                width: '100%', padding: '12px 14px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Trade Summary */}
        <div style={{
          background: 'var(--bg-primary)', borderRadius: 10,
          padding: '1rem', marginBottom: '1.5rem',
          fontSize: '0.9rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Total Exposure</div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${(notional * 2).toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Per Leg Notional</div>
            <div style={{ color: 'var(--text-primary)' }}>${notional.toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Est. Entry Fees</div>
            <div style={{ color: '#ef4444' }}>-${estimatedFee.toFixed(2)}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Est. Daily Profit</div>
            <div style={{ color: '#22c55e', fontWeight: 600 }}>+${estimatedDailyProfit.toFixed(2)}</div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div style={{
            background: result.success ? '#22c55e15' : '#ef444415',
            border: `1px solid ${result.success ? '#22c55e40' : '#ef444440'}`,
            borderRadius: 8, padding: '1rem', marginBottom: '1.5rem',
          }}>
            {result.success ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 700 }}>
                <CheckCircle size={18} /> Demo Trade executed successfully!
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontWeight: 700, marginBottom: 8 }}>
                  <XCircle size={18} /> Execution failed
                </div>
                {result.errors?.map((e: string, i: number) => (
                  <div key={i} style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: 4 }}>{e}</div>
                ))}
                {result.error && <div style={{ fontSize: '0.85rem', color: '#ef4444', marginTop: 8 }}>{result.error}</div>}
              </div>
            )}
          </div>
        )}

        {/* Execute Button */}
        {!result?.success && (
          <button
            onClick={handleExecute}
            disabled={executing || capitalNum <= 0}
            style={{
              width: '100%', padding: '16px',
              background: executing ? 'rgba(34,197,94,0.5)' : '#22c55e',
              border: 'none', borderRadius: 10,
              color: '#000', fontWeight: 800, fontSize: '1.1rem',
              cursor: executing || capitalNum <= 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
          >
            {executing ? (
              <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Executing Demo Trade...</>
            ) : (
              <><Zap size={20} /> Confirm &amp; Execute Demo Trade</>
            )}
          </button>
        )}

        {result?.success && (
          <button onClick={() => router.push('/positions')} style={{
            width: '100%', padding: '16px',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.4)',
            borderRadius: 10, color: '#22c55e',
            fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer',
          }}>
            View Positions
          </button>
        )}
      </div>
    </div>
  );
}

export default function DemoTradingPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#22c55e' }} /></div>}>
      <DemoTradingContent />
    </Suspense>
  );
}

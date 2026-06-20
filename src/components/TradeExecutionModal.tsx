'use client';

import { useState } from 'react';
import { X, Zap, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  longExchange: string;
  shortExchange: string;
  longPrice: number;
  shortPrice: number;
  spread: number;
  apr: number;
};

export default function TradeExecutionModal({
  isOpen, onClose, symbol, longExchange, shortExchange,
  longPrice, shortPrice, spread, apr,
}: Props) {
  const [capital, setCapital] = useState('1000');
  const [leverage, setLeverage] = useState('1');
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!isOpen) return null;

  const capitalNum = parseFloat(capital) || 0;
  const leverageNum = parseFloat(leverage) || 1;
  const notional = capitalNum * leverageNum;
  const estimatedFee = notional * 0.001;
  const estimatedDailyProfit = (notional * (apr / 100)) / 365;

  async function handleExecute() {
    setExecuting(true);
    setResult(null);
    try {
      const res = await fetch('/api/trade/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trade-secret': process.env.NEXT_PUBLIC_TRADE_API_SECRET || '' },
        body: JSON.stringify({
          symbol,
          longExchange,
          shortExchange,
          capital: capitalNum,
          leverage: leverageNum,
          longPrice,
          shortPrice,
          mode: 'live',
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

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 16, padding: '2rem',
        width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Zap size={22} color="#f59e0b" />
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Execute Real Trade
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Warning */}
        <div style={{
          background: '#f59e0b15',
          border: '1px solid #f59e0b40',
          borderRadius: 8, padding: '0.75rem 1rem',
          display: 'flex', gap: '0.75rem', marginBottom: '1.5rem',
        }}>
          <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#f59e0b', lineHeight: 1.5 }}>
            {`This will place REAL trades with REAL money on ${longExchange} and ${shortExchange}. Verify the opportunity before confirming.`}
          </p>
        </div>

        {/* Trade Details */}
        <div style={{
          background: 'var(--bg-primary)', borderRadius: 10,
          padding: '1rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
            {symbol}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.85rem' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Long Exchange</div>
            <div style={{ color: '#00ff94', fontWeight: 600, textTransform: 'capitalize' }}>{longExchange}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Short Exchange</div>
            <div style={{ color: '#ff4444', fontWeight: 600, textTransform: 'capitalize' }}>{shortExchange}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Long Price</div>
            <div style={{ color: 'var(--text-primary)' }}>${longPrice.toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Short Price</div>
            <div style={{ color: 'var(--text-primary)' }}>${shortPrice.toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Spread</div>
            <div style={{ color: '#00ff94', fontWeight: 600 }}>{spread.toFixed(4)}%</div>
            <div style={{ color: 'var(--text-secondary)' }}>Est. APR</div>
            <div style={{ color: '#00ff94', fontWeight: 600 }}>{apr.toFixed(2)}%</div>
          </div>
        </div>

        {/* Capital & Leverage */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Capital (USD)
            </label>
            <input
              type="number"
              value={capital}
              onChange={e => setCapital(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Leverage (x)
            </label>
            <input
              type="number"
              value={leverage}
              onChange={e => setLeverage(e.target.value)}
              min="1" max="10"
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>



        {/* Trade Summary */}
        <div style={{
          background: 'var(--bg-primary)', borderRadius: 10,
          padding: '1rem', marginBottom: '1.5rem',
          fontSize: '0.85rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Total Exposure</div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>${(notional * 2).toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Per Leg Notional</div>
            <div style={{ color: 'var(--text-primary)' }}>${notional.toLocaleString()}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Est. Entry Fees</div>
            <div style={{ color: '#ff4444' }}>-${estimatedFee.toFixed(2)}</div>
            <div style={{ color: 'var(--text-secondary)' }}>Est. Daily Profit</div>
            <div style={{ color: '#00ff94', fontWeight: 600 }}>+${estimatedDailyProfit.toFixed(2)}</div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div style={{
            background: result.success ? '#00ff9415' : '#ff444415',
            border: `1px solid ${result.success ? '#00ff9440' : '#ff444440'}`,
            borderRadius: 8, padding: '1rem', marginBottom: '1rem',
          }}>
            {result.success ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#00ff94', fontWeight: 600 }}>
                <CheckCircle size={18} /> Trades executed successfully!
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ff4444', fontWeight: 600, marginBottom: 6 }}>
                  <XCircle size={18} /> Execution failed
                </div>
                {result.errors?.map((e: string, i: number) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: '#ff4444', marginTop: 4 }}>{e}</div>
                ))}
                {result.error && <div style={{ fontSize: '0.8rem', color: '#ff4444' }}>{result.error}</div>}
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
              width: '100%', padding: '14px',
              background: executing ? '#f59e0b80' : '#f59e0b',
              border: 'none', borderRadius: 10,
              color: '#000', fontWeight: 800, fontSize: '1rem',
              cursor: executing || capitalNum <= 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {executing ? (
              <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Executing...</>
            ) : (
              <><Zap size={18} /> Confirm &amp; Execute Real Trade</>
            )}
          </button>
        )}

        {result?.success && (
          <button onClick={onClose} style={{
            width: '100%', padding: '14px',
            background: '#00ff9420', border: '1px solid #00ff9440',
            borderRadius: 10, color: '#00ff94',
            fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
          }}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

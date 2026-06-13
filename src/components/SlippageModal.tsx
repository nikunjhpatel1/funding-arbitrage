'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import type { EnrichedRow } from '@/components/FundingRateTable';
import { type OrderBook, calculateSlippage } from '@/lib/slippage';

interface Props {
  row: EnrichedRow;
  positionSize: number;
  onClose: () => void;
  activeExchanges: { key: string; label: string }[];
}

export default function SlippageModal({ row, positionSize, onClose, activeExchanges }: Props) {
  const [orderbooks, setOrderbooks] = useState<Record<string, OrderBook>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Find the best long and short exchanges from the active exchanges
  const sortedExchanges = [...activeExchanges]
    .map(ex => ({ key: ex.key, label: ex.label, rate: row[ex.key as keyof EnrichedRow] as number | null }))
    .filter(ex => ex.rate !== null) as { key: string; label: string; rate: number }[];

  // FIX H-3: In funding rate arb, LONG = lowest rate (pay least/receive most), SHORT = highest rate (collect most).
  // Previous code had these backwards (long picked highest, short picked lowest).
  const longExchange  = sortedExchanges.length > 0 ? sortedExchanges.reduce((prev, curr) => (curr.rate < prev.rate ? curr : prev)) : null;
  const shortExchange = sortedExchanges.length > 0 ? sortedExchanges.reduce((prev, curr) => (curr.rate > prev.rate ? curr : prev)) : null;

  // CRITICAL FIX: Extract stable string keys for useEffect dependencies.
  // longExchange/shortExchange are NEW objects on every render (.reduce() creates new refs),
  // so using them directly in deps would cause infinite re-fetch loops.
  const longExchangeKey  = longExchange?.key  ?? null;
  const shortExchangeKey = shortExchange?.key ?? null;

  useEffect(() => {
    if (!longExchangeKey || !shortExchangeKey) {
      setLoading(false);
      return;
    }

    const fetchOB = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/orderbook?symbol=${row.symbol}&exchanges=${longExchangeKey},${shortExchangeKey}`);
        const json = await res.json();
        if (json.success) {
          setOrderbooks(json.data);
        } else {
          setError(json.error || 'Failed to fetch order books');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch');
      } finally {
        setLoading(false);
      }
    };

    fetchOB();
  // Only re-fetch when symbol or the exchange keys change (stable strings, not object refs)
  }, [row.symbol, longExchangeKey, shortExchangeKey]);

  const targetNotional = positionSize;

  const lOb = longExchange ? orderbooks[longExchange.key] : null;
  const sOb = shortExchange ? orderbooks[shortExchange.key] : null;

  const longSlip = calculateSlippage(lOb, 'buy', targetNotional);
  const shortSlip = calculateSlippage(sOb, 'sell', targetNotional);

  const netEntryCost = longSlip.executionCostUSD + shortSlip.executionCostUSD;
  const netExitCost = netEntryCost; // Approx
  const totalExpectedSlippageCost = netEntryCost + netExitCost;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px',
        width: '90%', maxWidth: '400px', padding: '24px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        position: 'relative'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer'
        }}>
          <X size={20} />
        </button>

        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
          Est. Slippage for <span style={{ color: 'var(--accent-blue)' }}>{row.symbol}</span>
        </h3>

        <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Position Size: <strong style={{ color: 'var(--text-primary)' }}>${positionSize.toLocaleString()}</strong> per leg
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', padding: '20px 0' }}>
            <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Fetching live order books...
          </div>
        ) : error ? (
          <div style={{ color: 'var(--negative)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : !longExchange || !shortExchange ? (
          <div style={{ color: 'var(--warning)' }}>Not enough exchanges with valid rates to compute spread.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
                Long Leg ({longExchange.label})
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Buy Slippage</span>
                <span style={{ fontFamily: 'monospace', color: longSlip.executionCostUSD > 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
                  {lOb ? `-${longSlip.executionCostUSD.toFixed(2)} (${longSlip.slippagePercent.toFixed(3)}%)` : 'Data Unavailable'}
                </span>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 700 }}>
                Short Leg ({shortExchange.label})
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Sell Slippage</span>
                <span style={{ fontFamily: 'monospace', color: shortSlip.executionCostUSD > 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
                  {sOb ? `-${shortSlip.executionCostUSD.toFixed(2)} (${shortSlip.slippagePercent.toFixed(3)}%)` : 'Data Unavailable'}
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Net Entry Cost</span>
              <span style={{ fontFamily: 'monospace', color: netEntryCost > 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
                ${netEntryCost.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Net Exit Cost (Est)</span>
              <span style={{ fontFamily: 'monospace', color: netExitCost > 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
                ${netExitCost.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 700, marginTop: '4px' }}>
              <span style={{ color: 'var(--text-primary)' }}>Total Expected Slippage</span>
              <span style={{ fontFamily: 'monospace', color: totalExpectedSlippageCost > 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
                ${totalExpectedSlippageCost.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

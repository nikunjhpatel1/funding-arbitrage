'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Calculator, ArrowRight, DollarSign, Activity } from 'lucide-react';
import type { EnrichedRow } from '@/components/FundingRateTable';
import { usePriceStore } from '@/store/prices';
import { calculateSlippage } from '@/lib/slippage';
import { TAKER_FEES } from '@/lib/constants';

interface Props {
  row: EnrichedRow;
  positionSize: number;
  onClose: () => void;
  activeExchanges: { key: string; label: string }[];
}

const SIZE_OPTIONS = [1000, 5000, 10000, 25000];

export default function ProfitSimulatorModal({ row, positionSize: initialSize, onClose, activeExchanges }: Props) {
  const [simSize, setSimSize] = useState(initialSize);
  const [customSize, setCustomSize] = useState<string>('');
  
  // Convert pricesMap values to array for the modal
  const pricesMap = usePriceStore(state => state.pricesMap);
  const livePrices = useMemo(() => Object.values(pricesMap), [pricesMap]);

  useEffect(() => {
    if (!SIZE_OPTIONS.includes(simSize)) {
      setCustomSize(simSize.toString());
    } else {
      setCustomSize('');
    }
  }, [simSize]);

  // Find the best long and short exchanges from the active exchanges
  const sortedExchanges = useMemo(() => {
    return [...activeExchanges]
      .map(ex => {
        const rate = row[ex.key as keyof EnrichedRow] as number | null;
        const interval = row.exchangeIntervals?.[ex.key] ?? 8;
        return { 
          key: ex.key, 
          label: ex.label, 
          rate,
          interval,
          annualized: rate !== null ? rate * (8760 / interval) : null
        };
      })
      .filter(ex => ex.rate !== null && ex.annualized !== null) as { key: string; label: string; rate: number; interval: number; annualized: number }[];
  }, [activeExchanges, row]);

  const longExchange  = sortedExchanges.length > 0 ? sortedExchanges.reduce((prev, curr) => (curr.annualized < prev.annualized ? curr : prev)) : null;
  const shortExchange = sortedExchanges.length > 0 ? sortedExchanges.reduce((prev, curr) => (curr.annualized > prev.annualized ? curr : prev)) : null;

  // Real-time Orderbook Calculations
  const lOb = longExchange ? livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === longExchange.key) : null;
  const sOb = shortExchange ? livePrices.find(p => p.symbol === row.symbol.replace('/', '') && p.exchange === shortExchange.key) : null;

  const longSlip = calculateSlippage(lOb as any, 'buy', simSize, row.price);
  const shortSlip = calculateSlippage(sOb as any, 'sell', simSize, row.price);
  const exitLongSlip = calculateSlippage(lOb as any, 'sell', simSize, row.price);
  const exitShortSlip = calculateSlippage(sOb as any, 'buy', simSize, row.price);

  const totalSlippageCost = longSlip.executionCostUSD + shortSlip.executionCostUSD + exitLongSlip.executionCostUSD + exitShortSlip.executionCostUSD;

  // Fees Calculation
  const feeLong = longExchange ? (TAKER_FEES[longExchange.key] ?? 0.0005) : 0;
  const feeShort = shortExchange ? (TAKER_FEES[shortExchange.key] ?? 0.0005) : 0;
  const totalFeesCost = (simSize * feeLong + simSize * feeShort) * 2; // entry + exit

  // Funding Calculation
  const dailyLongRate = longExchange ? longExchange.rate * (24 / longExchange.interval) : 0;
  const dailyShortRate = shortExchange ? shortExchange.rate * (24 / shortExchange.interval) : 0;

  const longSideCashFlow = -dailyLongRate * simSize;
  const shortSideCashFlow = dailyShortRate * simSize;

  const fundingReceived = Math.max(0, longSideCashFlow) + Math.max(0, shortSideCashFlow);
  const fundingPaid = Math.abs(Math.min(0, longSideCashFlow)) + Math.abs(Math.min(0, shortSideCashFlow));
  const dailyNetFunding = fundingReceived - fundingPaid;

  // Profit Timelines
  const fixedCosts = totalFeesCost + totalSlippageCost;
  
  const expectedProfit1d = (dailyNetFunding * 1) - fixedCosts;
  const expectedProfit7d = (dailyNetFunding * 7) - fixedCosts;
  const expectedProfit30d = (dailyNetFunding * 30) - fixedCosts;

  // ROI metrics (based on single leg size, or total capital? Usually ROI is calculated against 1x position size because of leverage, but technically it's against total deployed margin. We will use simSize as total capital per leg, so 1x capital is simSize, or simSize * 2? The prompt states "Allow users to estimate ... based on deployed capital", typically "Position Size: $10,000" implies $10k long and $10k short. Let's use simSize as the base divisor for APR/ROI matching table logic).
  const expectedDailyReturn = (dailyNetFunding * 1) - (fixedCosts * (1 / 30)); // Amortized for daily ROI to not look insanely negative
  const expectedWeeklyReturn = (dailyNetFunding * 7) - (fixedCosts * (7 / 30));
  const expectedMonthlyReturn = (dailyNetFunding * 30) - fixedCosts;
  
  const roi1d = (expectedDailyReturn / simSize) * 100;
  const roi7d = (expectedWeeklyReturn / simSize) * 100;
  const roi30d = (expectedMonthlyReturn / simSize) * 100;
  const aprAnnual = ((dailyNetFunding * 365 - fixedCosts * (365 / 30)) / simSize) * 100;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: '16px'
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px',
        width: '100%', maxWidth: '640px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: '24px', right: '24px', background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s'
          }}>
            <X size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Calculator size={22} style={{ color: 'var(--accent-blue)' }} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
              Profit Simulator <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>| {row.symbol}</span>
            </h3>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '4px' }}>Position Size (per leg):</span>
            {SIZE_OPTIONS.map(val => (
              <button
                key={val}
                onClick={() => setSimSize(val)}
                className={`sim-pill ${simSize === val ? 'active' : ''}`}
              >
                ${val / 1000}k
              </button>
            ))}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>$</span>
              <input
                type="number"
                placeholder="Custom"
                value={customSize}
                onChange={(e) => {
                  setCustomSize(e.target.value);
                  const parsed = parseInt(e.target.value, 10);
                  if (!isNaN(parsed) && parsed > 0) setSimSize(parsed);
                }}
                className={`sim-input ${customSize !== '' ? 'active' : ''}`}
                style={{ paddingLeft: '20px', width: '90px' }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '24px', overflowY: 'auto' }}>
          {(!longExchange || !shortExchange) ? (
            <div style={{ color: 'var(--warning)', textAlign: 'center', padding: '2rem 0' }}>
              Not enough exchanges with valid rates to simulate this pair.
            </div>
          ) : (
            <>
              {/* Expected Profit Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                <div className="profit-card">
                  <div className="profit-card-label">24h Profit</div>
                  <div className={`profit-card-val ${expectedProfit1d >= 0 ? 'pos' : 'neg'}`}>
                    {expectedProfit1d >= 0 ? '+' : ''}${expectedProfit1d.toFixed(2)}
                  </div>
                  <div className={`profit-card-roi ${roi1d >= 0 ? 'pos' : 'neg'}`}>
                    {roi1d >= 0 ? '+' : ''}{roi1d.toFixed(2)}% ROI
                  </div>
                </div>
                <div className="profit-card">
                  <div className="profit-card-label">7d Profit</div>
                  <div className={`profit-card-val ${expectedProfit7d >= 0 ? 'pos' : 'neg'}`}>
                    {expectedProfit7d >= 0 ? '+' : ''}${expectedProfit7d.toFixed(2)}
                  </div>
                  <div className={`profit-card-roi ${roi7d >= 0 ? 'pos' : 'neg'}`}>
                    {roi7d >= 0 ? '+' : ''}{roi7d.toFixed(2)}% ROI
                  </div>
                </div>
                <div className="profit-card highlight">
                  <div className="profit-card-label">30d Profit</div>
                  <div className={`profit-card-val ${expectedProfit30d >= 0 ? 'pos' : 'neg'}`}>
                    {expectedProfit30d >= 0 ? '+' : ''}${expectedProfit30d.toFixed(2)}
                  </div>
                  <div className={`profit-card-roi ${roi30d >= 0 ? 'pos' : 'neg'}`}>
                    {roi30d >= 0 ? '+' : ''}{roi30d.toFixed(2)}% ROI
                  </div>
                </div>
              </div>

              {/* Detailed Breakdown */}
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)', padding: '16px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={14} /> Trade Breakdown
                </div>
                
                <div className="breakdown-row">
                  <span className="b-label">Exchanges</span>
                  <span className="b-val" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: 'var(--positive)' }}>Long: {longExchange.label}</span>
                    <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--negative)' }}>Short: {shortExchange.label}</span>
                  </span>
                </div>

                <div className="breakdown-row">
                  <span className="b-label">Daily Funding Received</span>
                  <span className="b-val" style={{ color: 'var(--positive)' }}>+${fundingReceived.toFixed(2)}</span>
                </div>

                <div className="breakdown-row">
                  <span className="b-label">Daily Funding Paid</span>
                  <span className="b-val" style={{ color: fundingPaid > 0 ? 'var(--negative)' : 'var(--text-primary)' }}>-${fundingPaid.toFixed(2)}</span>
                </div>

                <div className="breakdown-row highlight-row">
                  <span className="b-label" style={{ color: 'var(--text-primary)' }}>Net Daily Funding</span>
                  <span className="b-val" style={{ color: dailyNetFunding >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 700 }}>
                    {dailyNetFunding >= 0 ? '+' : ''}${dailyNetFunding.toFixed(2)}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

                <div className="breakdown-row">
                  <span className="b-label">Entry Fees (Est)</span>
                  <span className="b-val" style={{ color: 'var(--negative)' }}>-${(totalFeesCost / 2).toFixed(2)}</span>
                </div>

                <div className="breakdown-row">
                  <span className="b-label">Exit Fees (Est)</span>
                  <span className="b-val" style={{ color: 'var(--negative)' }}>-${(totalFeesCost / 2).toFixed(2)}</span>
                </div>

                <div className="breakdown-row highlight-row">
                  <span className="b-label" style={{ color: 'var(--text-primary)' }}>Total Fees</span>
                  <span className="b-val" style={{ color: 'var(--negative)', fontWeight: 700 }}>-${totalFeesCost.toFixed(2)}</span>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

                <div className="breakdown-row">
                  <span className="b-label">Entry Slippage (Live)</span>
                  <span className="b-val" style={{ color: 'var(--negative)' }}>-${(longSlip.executionCostUSD + shortSlip.executionCostUSD).toFixed(2)}</span>
                </div>

                <div className="breakdown-row">
                  <span className="b-label">Exit Slippage (Live)</span>
                  <span className="b-val" style={{ color: 'var(--negative)' }}>-${(exitLongSlip.executionCostUSD + exitShortSlip.executionCostUSD).toFixed(2)}</span>
                </div>

                <div className="breakdown-row highlight-row">
                  <span className="b-label" style={{ color: 'var(--text-primary)' }}>Total Slippage Cost</span>
                  <span className="b-val" style={{ color: 'var(--negative)', fontWeight: 700 }}>-${totalSlippageCost.toFixed(2)}</span>
                </div>
                
                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0' }} />

                <div className="breakdown-row">
                  <span className="b-label" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Estimated Net APR</span>
                  <span className="b-val" style={{ color: aprAnnual >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 800, fontSize: '1.1rem' }}>
                    {aprAnnual >= 0 ? '+' : ''}{aprAnnual.toFixed(2)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        .sim-pill {
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }
        .sim-pill:hover {
          background: rgba(255,255,255,0.08);
          color: var(--text-primary);
        }
        .sim-pill.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
          color: #fff;
          box-shadow: 0 0 12px rgba(59,130,246,0.4);
        }
        .sim-input {
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
          color: var(--text-primary);
          outline: none;
          transition: all 0.2s ease;
        }
        .sim-input:focus {
          border-color: var(--accent-blue);
          background: rgba(59,130,246,0.05);
        }
        .sim-input.active {
          border-color: var(--accent-blue);
          box-shadow: 0 0 12px rgba(59,130,246,0.2);
        }
        .profit-card {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .profit-card.highlight {
          background: rgba(59,130,246,0.05);
          border-color: rgba(59,130,246,0.3);
        }
        .profit-card-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .profit-card-val {
          font-size: 1.5rem;
          font-weight: 800;
          font-family: 'JetBrains Mono', monospace;
          margin-bottom: 4px;
        }
        .profit-card-val.pos { color: var(--positive); }
        .profit-card-val.neg { color: var(--negative); }
        
        .profit-card-roi {
          font-size: 0.8rem;
          font-weight: 600;
        }
        .profit-card-roi.pos { color: var(--positive); }
        .profit-card-roi.neg { color: var(--negative); }

        .breakdown-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 0.85rem;
        }
        .breakdown-row .b-label {
          color: var(--text-secondary);
        }
        .breakdown-row .b-val {
          font-family: 'JetBrains Mono', monospace;
        }
        .highlight-row {
          background: rgba(255,255,255,0.03);
          padding: 6px 8px;
          border-radius: 6px;
          margin: 2px -8px;
        }
      `}</style>
    </div>
  );
}

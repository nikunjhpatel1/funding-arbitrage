'use client';

import { useState, useEffect } from 'react';
import { Target, Clock, Calculator, ShieldAlert, BadgeCheck } from 'lucide-react';
import type { HistoricalFundingItem, HistoricalFundingResponse } from '@/app/api/funding-rates/history/route';

interface OpportunityAnalysisProps {
  symbol: string;
  baseAsset: string;
  liveSpread: number; // The absolute spread: shortRate - longRate
  positionSize: number;
  volume24h: number;
  longExchange: string;
  shortExchange: string;
  avgIntervalHours: number; // e.g. 8
}

function calculateTimeUntilNextFunding(intervalHours: number): number {
  const now = new Date();
  const hours = now.getUTCHours();
  
  // Standard UTC funding hours: 0, 8, 16 for 8h intervals
  if (intervalHours === 8) {
    if (hours < 8) return 8 - hours - (now.getUTCMinutes() / 60);
    if (hours < 16) return 16 - hours - (now.getUTCMinutes() / 60);
    return 24 - hours - (now.getUTCMinutes() / 60);
  } else if (intervalHours === 4) {
    const nextHour = Math.ceil((hours + 1) / 4) * 4;
    return nextHour - hours - (now.getUTCMinutes() / 60);
  }
  // Fallback, pretend 1 hour remaining
  return 1;
}

export default function OpportunityAnalysis({
  symbol,
  liveSpread,
  positionSize,
  volume24h,
  avgIntervalHours
}: OpportunityAnalysisProps) {
  const [feeRate, setFeeRate] = useState<number>(0.05); // 0.05%
  const [data, setData] = useState<HistoricalFundingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/funding-rates/history?symbol=${encodeURIComponent(symbol)}&period=30d`);
        const json: HistoricalFundingResponse = await res.json();
        setData(json.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [symbol]);

  // Compute Historical Metrics
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  const data7d = data.filter(d => (now - new Date(d.timestamp).getTime()) <= 7 * dayMs);
  
  const avgSpread7d = data7d.length > 0 ? data7d.reduce((sum, d) => sum + d.spread, 0) / data7d.length : liveSpread;
  const avgSpread30d = data.length > 0 ? data.reduce((sum, d) => sum + d.spread, 0) / data.length : liveSpread;
  
  // Volatility (Standard Deviation of spread)
  let variance = 0;
  if (data.length > 1) {
    const sqDiffs = data.map(d => Math.pow(d.spread - avgSpread30d, 2));
    variance = sqDiffs.reduce((sum, v) => sum + v, 0) / data.length;
  }
  const volatility = Math.sqrt(variance);
  
  // FIX H-1: An arb trade has TWO legs (long + short), each paying a taker fee.
  // Entry: open long + open short = 2 × positionSize × feeRate
  // Exit:  close long + close short = 2 × positionSize × feeRate
  const entryFee = 2 * positionSize * (feeRate / 100);
  const exitFee  = 2 * positionSize * (feeRate / 100);
  const totalFees = entryFee + exitFee;
  
  const estimatedDailyReturn = positionSize * liveSpread * (24 / avgIntervalHours);
  const estimatedWeeklyReturn = estimatedDailyReturn * 7;
  const estimatedMonthlyReturn = estimatedDailyReturn * 30;
  
  const netWeeklyIncome = estimatedWeeklyReturn - totalFees;
  const netMonthlyIncome = estimatedMonthlyReturn - totalFees;
  const estimatedROI = positionSize > 0 ? (netMonthlyIncome / positionSize) * 100 : 0;
  
  // Break-even: only meaningful when daily return is strictly positive
  // FIX M-4: Guard against zero or negative daily return to avoid Infinity / negative days.
  let breakevenDays = 0;
  if (estimatedDailyReturn > 0) {
    breakevenDays = totalFees / estimatedDailyReturn;
  } else {
    breakevenDays = Infinity; // spread is not profitable — never breaks even
  }

  // Opportunity Score
  let score = 0;
  
  // 1. Spread (40%) -> Max 40 points if spread >= 0.5% per period
  const spreadScore = Math.min(40, (liveSpread / 0.005) * 40);
  
  // 2. Liquidity (20%) -> Max 20 points if Vol > 1B
  let liqScore = 0;
  if (volume24h > 1e9) liqScore = 20;
  else if (volume24h > 1e8) liqScore = 15;
  else if (volume24h > 1e7) liqScore = 10;
  else if (volume24h > 1e6) liqScore = 5;
  
  // 3. Historical Consistency (30%) -> Penalty for high volatility relative to spread
  // If volatility is 0, full 30 points.
  let histScore = 30;
  if (avgSpread30d > 0) {
    const coeffOfVar = volatility / avgSpread30d;
    // if CoV > 1, very volatile. Deduct points.
    histScore = Math.max(0, 30 - (coeffOfVar * 15));
  }
  
  // 4. Time Until Next Funding (10%) -> Max 10 points if < 1 hour
  const hoursUntil = calculateTimeUntilNextFunding(avgIntervalHours);
  const timeScore = Math.max(0, 10 - (hoursUntil * (10 / avgIntervalHours)));
  
  score = Math.round(spreadScore + liqScore + histScore + timeScore);
  score = Math.max(0, Math.min(100, score));

  // Determine Label
  let scoreLabel = 'Avoid';
  let scoreColor = 'var(--negative)';
  if (score >= 80) { scoreLabel = 'Excellent Opportunity'; scoreColor = 'var(--positive)'; }
  else if (score >= 60) { scoreLabel = 'Good Opportunity'; scoreColor = '#60a5fa'; }
  else if (score >= 40) { scoreLabel = 'Neutral'; scoreColor = 'var(--warning)'; }

  if (loading) {
    return (
      <div style={{ padding: '2rem', background: 'var(--bg-card)', borderRadius: 16, marginTop: '2.5rem' }}>
        <div style={{ height: 200, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }} className="pulse" />
      </div>
    );
  }

  return (
    <div className="stat-card" style={{ marginTop: '2.5rem', padding: '2rem', background: 'linear-gradient(180deg, rgba(139,92,246,0.03) 0%, rgba(0,0,0,0) 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(139,92,246,0.15)', padding: 8, borderRadius: 8, color: 'var(--accent-purple)' }}>
            <Target size={20} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>Opportunity Analysis</h2>
        </div>
        
        {/* Opp Score Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.2)', padding: '6px 16px', borderRadius: 24, border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Score</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: scoreColor }}>{score}</span>
          <div style={{ background: `${scoreColor}15`, color: scoreColor, padding: '4px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 700 }}>
            {scoreLabel}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        
        {/* Left Column: Fees & Math */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Fee Configuration</span>
              <Calculator size={16} color="var(--text-muted)" />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flex: 1 }}>Fee Rate (Entry & Exit)</label>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-deep)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <input 
                  type="number" 
                  step="0.01" 
                  value={feeRate} 
                  onChange={e => setFeeRate(Number(e.target.value))} 
                  style={{ width: 60, background: 'none', border: 'none', color: 'var(--text-primary)', outline: 'none', textAlign: 'right', fontSize: '0.9rem', fontFamily: 'monospace' }}
                />
                <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>%</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Entry Fee Estimate</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--negative)' }}>${entryFee.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>Exit Fee Estimate</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--negative)' }}>${exitFee.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', paddingTop: 12, borderTop: '1px solid var(--border)', fontWeight: 600 }}>
              <span>Total Fees to Overcome</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--negative)' }}>${totalFees.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Break-even & ROI</span>
              <Clock size={16} color="var(--text-muted)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Days to Break-Even</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: (breakevenDays > 30 || !isFinite(breakevenDays)) ? 'var(--negative)' : 'var(--accent-blue)', fontFamily: 'monospace' }}>
                  {estimatedDailyReturn > 0 ? (isFinite(breakevenDays) ? breakevenDays.toFixed(1) : '∞') : '∞'} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>days</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Est. Net ROI (30d)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: estimatedROI > 0 ? 'var(--positive)' : 'var(--negative)', fontFamily: 'monospace' }}>
                  {estimatedROI > 0 ? '+' : ''}{estimatedROI.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Historical & Returns */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Historical Consistency</span>
              {volatility < 0.001 ? <BadgeCheck size={16} color="var(--positive)" /> : <ShieldAlert size={16} color="var(--warning)" />}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>7-Day Average Spread</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: avgSpread7d > 0 ? 'var(--positive)' : 'var(--text-primary)' }}>{(avgSpread7d * 100).toFixed(4)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>30-Day Average Spread</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: avgSpread30d > 0 ? 'var(--positive)' : 'var(--text-primary)' }}>{(avgSpread30d * 100).toFixed(4)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Spread Volatility (Std Dev)</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: volatility > 0.002 ? 'var(--negative)' : 'var(--warning)' }}>{(volatility * 100).toFixed(4)}%</span>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Net Expected Income (Post-Fees)</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>7-Day Net</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color: netWeeklyIncome > 0 ? 'var(--positive)' : 'var(--negative)' }}>
                  {netWeeklyIncome > 0 ? '+' : ''}${netWeeklyIncome.toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-deep)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>30-Day Net</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color: netMonthlyIncome > 0 ? 'var(--positive)' : 'var(--negative)' }}>
                  {netMonthlyIncome > 0 ? '+' : ''}${netMonthlyIncome.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

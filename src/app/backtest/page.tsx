'use client';

import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import { Play, TrendingUp, Activity, Crosshair, DollarSign, Percent, AlertTriangle, Clock } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function BacktestPage() {
  const [params, setParams] = useState({
    symbol: 'BTCUSDT',
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
    leverage: 1,
    minSpreadPct: 5,
    closeSpreadPct: 0,
    slippagePct: 0.05
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any>(null);

  const runBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run backtest');
      
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams({ ...params, [e.target.name]: e.target.value });
  };

  const MetricCard = ({ title, value, icon: Icon, color = 'var(--text-primary)', sub }: any) => (
    <div style={{ background: 'var(--bg-deep)', padding: 20, borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{title}</div>
        <Icon size={16} color="var(--text-muted)" />
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
      <Navbar />

      <main style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem' }}>
        
        {/* Sidebar Inputs */}
        <div style={{ background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border)', alignSelf: 'start' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={20} color="var(--accent-blue)" />
            Simulation Config
          </h2>

          <form onSubmit={runBacktest} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Symbol</label>
              <input type="text" name="symbol" value={params.symbol} onChange={handleChange} 
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Start Date</label>
                <input type="date" name="startDate" value={params.startDate} onChange={handleChange} 
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: '0.85rem' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>End Date</label>
                <input type="date" name="endDate" value={params.endDate} onChange={handleChange} 
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: '0.85rem' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Capital ($)</label>
                <input type="number" name="initialCapital" value={params.initialCapital} onChange={handleChange} 
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Leverage</label>
                <input type="number" name="leverage" value={params.leverage} onChange={handleChange} min="1" max="100"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Min Spread (%)</label>
                <input type="number" name="minSpreadPct" value={params.minSpreadPct} onChange={handleChange} step="0.1"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Close Spread (%)</label>
                <input type="number" name="closeSpreadPct" value={params.closeSpreadPct} onChange={handleChange} step="0.1"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Slippage / Leg (%)</label>
              <input type="number" name="slippagePct" value={params.slippagePct} onChange={handleChange} step="0.01"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-dark)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }} />
            </div>

            <button type="submit" disabled={loading}
              style={{ marginTop: '1rem', width: '100%', padding: '12px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Simulating...' : <><Play size={16} fill="currentColor" /> Run Backtest</>}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: '1rem', padding: '10px 14px', background: 'rgba(244,63,94,0.1)', color: 'var(--negative)', borderRadius: 8, fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} /> {error}
            </div>
          )}
        </div>

        {/* Results Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {results ? (
            <>
              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <MetricCard title="Net PnL" value={`$${results.metrics.totalProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`} 
                  color={results.metrics.totalProfit >= 0 ? 'var(--positive)' : 'var(--negative)'} icon={DollarSign} />
                <MetricCard title="ROI" value={`${results.metrics.roi.toFixed(2)}%`} 
                  color={results.metrics.roi >= 0 ? 'var(--positive)' : 'var(--negative)'} icon={TrendingUp} sub={`CAGR: ${results.metrics.cagr.toFixed(2)}%`} />
                <MetricCard title="Max Drawdown" value={`${results.metrics.maxDrawdown.toFixed(2)}%`} 
                  color="var(--negative)" icon={AlertTriangle} />
                <MetricCard title="Win Rate" value={`${results.metrics.winRate.toFixed(1)}%`} 
                  color="var(--text-primary)" icon={Crosshair} sub={`${results.metrics.tradesCount} total trades`} />
                
                <MetricCard title="Funding Earned" value={`+$${results.metrics.totalFundingEarned.toLocaleString(undefined, {minimumFractionDigits:2})}`} color="var(--positive)" icon={DollarSign} />
                <MetricCard title="Funding Paid" value={`-$${results.metrics.totalFundingPaid.toLocaleString(undefined, {minimumFractionDigits:2})}`} color="var(--negative)" icon={DollarSign} />
                <MetricCard title="Total Fees" value={`-$${results.metrics.totalFees.toLocaleString(undefined, {minimumFractionDigits:2})}`} color="var(--negative)" icon={Percent} />
                <MetricCard title="Sharpe Ratio" value={results.metrics.sharpeRatio} color="var(--accent-blue)" icon={Activity} sub={`Profit Factor: ${results.metrics.profitFactor.toFixed(2)}`} />
              </div>

              {/* Equity Curve */}
              <div style={{ background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem' }}>Equity Curve</h3>
                <div style={{ height: 300, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.equityCurve.map((d: any) => ({
                      ...d,
                      timeFormatted: new Date(d.timestamp).toLocaleDateString() + ' ' + new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="timeFormatted" stroke="var(--text-muted)" fontSize={12} tickMargin={10} minTickGap={50} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => `$${v.toLocaleString()}`} domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                        itemStyle={{ color: 'var(--accent-blue)', fontWeight: 700 }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Equity']}
                        labelStyle={{ color: 'var(--text-muted)', marginBottom: 5 }}
                      />
                      <Line type="monotone" dataKey="equity" stroke="var(--accent-blue)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: 'var(--accent-blue)', stroke: 'var(--bg-deep)', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trade Log */}
              <div style={{ background: 'var(--bg-deep)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Trade Log</h3>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Entry Time</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Exit Time</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Exchanges (L / S)</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Notional</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Funding Net</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Fees + Slip</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Price PnL</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Net PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.tradeLog.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No trades executed during this period.</td></tr>
                      ) : results.tradeLog.map((t: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: '#fff' }}>
                          <td style={{ padding: '12px 16px' }}>{new Date(t.entryTime).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
                          <td style={{ padding: '12px 16px' }}>{new Date(t.exitTime).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                            <span style={{ color: 'var(--positive)' }}>{t.longExchange.toUpperCase()}</span> / <span style={{ color: 'var(--negative)' }}>{t.shortExchange.toUpperCase()}</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>${t.notional.toLocaleString()}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: t.fundingNet >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {t.fundingNet >= 0 ? '+' : ''}${t.fundingNet.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--negative)' }}>
                            -${t.feesNet.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: t.pricePnlNet >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {t.pricePnlNet >= 0 ? '+' : ''}${t.pricePnlNet.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: t.netPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {t.netPnL >= 0 ? '+' : ''}${t.netPnL.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12, padding: '4rem' }}>
              <Activity size={48} color="var(--border)" style={{ marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>Ready to Backtest</h3>
              <p style={{ textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>Configure your strategy parameters on the left and run the backtest to simulate historical performance using high-resolution funding rate data.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

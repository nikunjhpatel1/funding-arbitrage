'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import SymbolSearch from '@/components/SymbolSearch';
import { Play, TrendingUp, Activity, Crosshair, DollarSign, Percent, AlertTriangle, ArrowRightLeft, Download, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ComposedChart, Bar, Cell } from 'recharts';

import { TAKER_FEES } from '@/lib/constants';

export default function BacktestPage() {
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [longExchange, setLongExchange] = useState('binance');
  const [shortExchange, setShortExchange] = useState('bybit');
  const [params, setParams] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate:   new Date().toISOString().split('T')[0],
    initialCapital: 10000,
    leverage:       1,
    closeSpreadPct: 0,
    slippagePct:    0.05,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [results, setResults] = useState<any>(null);
  
  // Live rates for selectors
  const [marketData, setMarketData] = useState<any[]>([]);
  const [rateMode, setRateMode] = useState<'bps' | 'apy'>('bps');

  useEffect(() => {
    fetch('/api/funding-rates')
      .then(r => r.json())
      .then(json => {
        if (json.data) setMarketData(json.data);
      })
      .catch(console.error);
  }, []);

  const getLiveRate = (exchange: string) => {
    const m = marketData.find(d => d.symbol === symbol);
    if (!m) return null;
    const rate = m[exchange];
    return typeof rate === 'number' ? rate : null;
  };

  const setDateRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setParams({
      ...params,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    });
  };

  const handleSwap = () => {
    setLongExchange(shortExchange);
    setShortExchange(longExchange);
  };

  const runBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (longExchange === shortExchange) {
      setError('Long and Short exchanges must be different.');
      return;
    }
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, longExchange, shortExchange, ...params }),
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

  const exportCSV = () => {
    if (!results || !results.tradeLog) return;
    const headers = ['Date', 'Event', 'Long Rate', 'Short Rate', 'Spread (bps)', 'Funding PnL', 'Cumulative PnL'];
    const rows = results.tradeLog.map((t: any) => [
      new Date(t.timestamp).toISOString(),
      t.event,
      t.longRate,
      t.shortRate,
      t.spreadBps,
      t.fundingEventPnL,
      t.cumNetPnL
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `backtest_${symbol.replace('/','_')}_${longExchange}_${shortExchange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-dark)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: '#fff',
    boxSizing: 'border-box',
    outline: 'none',
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
      <main style={{ padding: '2rem', maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: '320px 1fr', gap: '2rem' }}>

        {/* ── Sidebar Inputs ──────────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border)', alignSelf: 'start' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={20} color="var(--accent-blue)" />
            Simulation Config
          </h2>

          <form onSubmit={runBacktest} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* ── Symbol autocomplete ── */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                Symbol
              </label>
              <SymbolSearch
                value={symbol}
                onChange={setSymbol}
                placeholder="e.g. BTC/USDT"
                inputStyle={{ ...inputStyle, fontSize: '0.9rem' }}
              />
            </div>

            {/* ── Time Range ── */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Time Range</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[1, 7, 30, 90].map(days => {
                  const dEnd = new Date().toISOString().split('T')[0];
                  const dStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  const isActive = params.startDate === dStart && params.endDate === dEnd;
                  return (
                    <button key={days} type="button" onClick={() => setDateRange(days)}
                      style={{ flex: 1, padding: '6px 0', background: isActive ? 'var(--accent-blue)' : 'var(--bg-dark)', color: isActive ? '#fff' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                      {days}d
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <input type="date" name="startDate" value={params.startDate} onChange={handleChange} style={{ ...inputStyle, fontSize: '0.8rem' }} />
                <input type="date" name="endDate" value={params.endDate} onChange={handleChange} style={{ ...inputStyle, fontSize: '0.8rem' }} />
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

            {/* ── Long / Short Exchanges ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--positive)', marginBottom: 6, fontWeight: 600 }}>Long Exchange</label>
                <select value={longExchange} onChange={e => setLongExchange(e.target.value)} style={inputStyle}>
                  {Object.keys(TAKER_FEES).map(ex => <option key={ex} value={ex}>{ex.toUpperCase()}</option>)}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                  Live rate: {getLiveRate(longExchange) !== null ? `${(getLiveRate(longExchange)! * 10000).toFixed(2)} bps` : 'N/A'}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', margin: '-8px 0', zIndex: 2 }}>
                <button type="button" onClick={handleSwap} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '50%', padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <ArrowRightLeft size={16} />
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--negative)', marginBottom: 6, fontWeight: 600 }}>Short Exchange</label>
                <select value={shortExchange} onChange={e => setShortExchange(e.target.value)} style={inputStyle}>
                  {Object.keys(TAKER_FEES).map(ex => <option key={ex} value={ex}>{ex.toUpperCase()}</option>)}
                </select>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                  Live rate: {getLiveRate(shortExchange) !== null ? `${(getLiveRate(shortExchange)! * 10000).toFixed(2)} bps` : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

            {/* ── Capital & Leverage ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Capital ($)</label>
                <input type="number" name="initialCapital" value={params.initialCapital} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Leverage</label>
                <input type="number" name="leverage" value={params.leverage} onChange={handleChange} min="1" max="100" style={inputStyle} />
              </div>
            </div>

            {/* ── Close Spread & Slippage ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }} title="Close position early if spread compresses below this %">Close Spread (%)</label>
                <input type="number" name="closeSpreadPct" value={params.closeSpreadPct} onChange={handleChange} step="0.1" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Slippage/Leg (%)</label>
                <input type="number" name="slippagePct" value={params.slippagePct} onChange={handleChange} step="0.01" style={inputStyle} />
              </div>
            </div>

            <button type="submit" disabled={loading}
              style={{ marginTop: '1rem', width: '100%', padding: '12px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Simulating…' : <><Play size={16} fill="currentColor" /> Run Backtest</>}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: '1rem', padding: '10px 14px', background: 'rgba(244,63,94,0.1)', color: 'var(--negative)', borderRadius: 8, fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
            </div>
          )}
        </div>

        {/* ── Results Area ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {results ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <a 
                  href={`/paper-trading?symbol=${encodeURIComponent(symbol)}&long=${longExchange}&short=${shortExchange}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(59,130,246,0.1)', color: 'var(--accent-blue)', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none', transition: 'background 0.2s' }}
                >
                  Continue in Paper Trading <ExternalLink size={16} />
                </a>
              </div>

              {/* Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <MetricCard title="Total PnL"
                  value={`$${results.metrics.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  color={results.metrics.totalProfit >= 0 ? 'var(--positive)' : 'var(--negative)'} icon={DollarSign}
                  sub={`${results.metrics.roi.toFixed(2)}% ROI`} />
                <MetricCard title="Funding PnL"
                  value={`${results.metrics.totalFundingPnL >= 0 ? '+' : ''}$${results.metrics.totalFundingPnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  color={results.metrics.totalFundingPnL >= 0 ? 'var(--positive)' : 'var(--negative)'} icon={TrendingUp} />
                <MetricCard title="Price PnL"
                  value={`${results.metrics.totalPricePnL >= 0 ? '+' : ''}$${results.metrics.totalPricePnL.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  color={results.metrics.totalPricePnL >= 0 ? 'var(--positive)' : 'var(--negative)'} icon={Activity} />
                <MetricCard title="Total Exec Cost"
                  value={`-$${results.metrics.totalExecCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                  color="var(--negative)" icon={Percent} />
              </div>

              {/* Chart 1: Funding Rate & Spread */}
              <div style={{ background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Funding Rate & Spread</h3>
                  <div style={{ display: 'flex', background: 'var(--bg-dark)', borderRadius: 6, padding: 2 }}>
                    <button onClick={() => setRateMode('bps')} style={{ padding: '4px 12px', border: 'none', background: rateMode === 'bps' ? 'var(--bg-card)' : 'transparent', color: rateMode === 'bps' ? '#fff' : 'var(--text-muted)', borderRadius: 4, fontSize: '0.8rem', cursor: 'pointer' }}>BPS</button>
                    <button onClick={() => setRateMode('apy')} style={{ padding: '4px 12px', border: 'none', background: rateMode === 'apy' ? 'var(--bg-card)' : 'transparent', color: rateMode === 'apy' ? '#fff' : 'var(--text-muted)', borderRadius: 4, fontSize: '0.8rem', cursor: 'pointer' }}>APY</button>
                  </div>
                </div>
                <div style={{ height: 300, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={results.chartData.map((d: any) => ({
                      ...d,
                      timeFormatted: new Date(d.timestamp).toLocaleDateString() + ' ' + new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      longVal: rateMode === 'bps' ? d.longRate * 10000 : d.longRate * (8760/8) * 100,
                      shortVal: rateMode === 'bps' ? d.shortRate * 10000 : d.shortRate * (8760/8) * 100,
                      spreadVal: rateMode === 'bps' ? d.spreadBps : d.annualizedSpread
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="timeFormatted" stroke="var(--text-muted)" fontSize={12} tickMargin={10} minTickGap={50} />
                      <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => v.toFixed(2)} domain={['auto', 'auto']} />
                      <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => v.toFixed(2)} domain={['auto', 'auto']} hide />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                        formatter={(value: any, name: any) => [`${Number(value).toFixed(4)}${rateMode === 'apy' ? '%' : ''}`, name]}
                        labelStyle={{ color: 'var(--text-muted)', marginBottom: 5 }}
                      />
                      <ReferenceLine y={0} yAxisId="left" stroke="var(--border)" strokeDasharray="3 3" />
                      <Bar dataKey="spreadVal" yAxisId="left" name="Spread">
                        {results.chartData.map((entry: any, index: number) => {
                          const val = rateMode === 'bps' ? entry.spreadBps : entry.annualizedSpread;
                          return <Cell key={`cell-${index}`} fill={val >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(244, 63, 94, 0.3)'} />;
                        })}
                      </Bar>
                      <Line type="monotone" dataKey="longVal" yAxisId="left" name={`Long (${longExchange})`} stroke="var(--positive)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="shortVal" yAxisId="left" name={`Short (${shortExchange})`} stroke="var(--negative)" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: PnL Over Time */}
              <div style={{ background: 'var(--bg-deep)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--border)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem' }}>PnL Over Time</h3>
                <div style={{ height: 300, width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={results.chartData.map((d: any) => ({
                      ...d,
                      timeFormatted: new Date(d.timestamp).toLocaleDateString() + ' ' + new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="timeFormatted" stroke="var(--text-muted)" fontSize={12} tickMargin={10} minTickGap={50} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => `$${v.toLocaleString()}`} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff' }}
                        formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name]}
                        labelStyle={{ color: 'var(--text-muted)', marginBottom: 5 }}
                      />
                      <ReferenceLine y={0} stroke="var(--border)" />
                      <ReferenceLine y={results.metrics.totalExecCost * -1} stroke="rgba(244,63,94,0.5)" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'Breakeven Cost', fill: 'var(--text-muted)', fontSize: 10 }} />
                      <Line type="monotone" dataKey="cumNetPnL" name="Cumulative Net PnL" stroke="var(--accent-blue)" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="cumLongPnL" name="Long Leg PnL (Est)" stroke="var(--positive)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                      <Line type="monotone" dataKey="cumShortPnL" name="Short Leg PnL (Est)" stroke="var(--negative)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Trade Log */}
              <div style={{ background: 'var(--bg-deep)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Settlement Log</h3>
                  <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                    <Download size={14} /> Export CSV
                  </button>
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-deep)' }}>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date/Time</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600 }}>Event</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Long Rate</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Short Rate</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Spread (bps)</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Funding PnL</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Cum PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.tradeLog.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No settlement events in this period.</td></tr>
                      ) : results.tradeLog.map((t: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: '#fff' }}>
                          <td style={{ padding: '12px 16px' }}>{new Date(t.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, background: t.event === 'ENTRY' ? 'rgba(59,130,246,0.2)' : t.event === 'EXIT' ? 'rgba(244,63,94,0.2)' : 'rgba(255,255,255,0.1)', color: t.event === 'ENTRY' ? 'var(--accent-blue)' : t.event === 'EXIT' ? 'var(--negative)' : 'var(--text-primary)' }}>
                              {t.event}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>{(t.longRate * 10000).toFixed(2)} bps</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace' }}>{(t.shortRate * 10000).toFixed(2)} bps</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: t.spreadBps >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {t.spreadBps >= 0 ? '+' : ''}{t.spreadBps.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', color: t.fundingEventPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {t.fundingEventPnL >= 0 ? '+' : ''}${t.fundingEventPnL.toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: t.cumNetPnL >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                            {t.cumNetPnL >= 0 ? '+' : ''}${t.cumNetPnL.toFixed(2)}
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
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: 8 }}>Ready to Backtest Pair</h3>
              <p style={{ textAlign: 'center', maxWidth: 400, lineHeight: 1.5 }}>
                Configure your strategy parameters on the left and run the backtest to simulate the performance of this specific exchange pair over time.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

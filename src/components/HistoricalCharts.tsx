'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Activity, CalendarClock } from 'lucide-react';
import type { HistoricalFundingItem, HistoricalFundingResponse } from '@/app/api/funding-rates/history/route';

interface HistoricalChartsProps {
  symbol: string;
  baseAsset: string;
}

const COLORS = [
  '#f7931a', '#627eea', '#9945ff', '#f3ba2f', '#346aa9',
  '#c2a633', '#0033ad', '#e84142', '#2a5ada', '#ff0013',
  '#ff0420', '#12aaff', '#00b4d4', '#5865f2', '#4da2ff',
];

// Custom tooltip to show Best Long / Short
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const p = payload[0].payload as HistoricalFundingItem;
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 16, borderRadius: 12, boxShadow: 'var(--shadow-card)', fontSize: '0.85rem', minWidth: 280 }}>
        <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{new Date(p.timestamp).toLocaleString()}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'rgba(16,185,129,0.05)', padding: 10, borderRadius: 8, border: '1px solid rgba(16,185,129,0.1)' }}>
            <div style={{ color: 'var(--positive)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 4 }}>Best Long</div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{p.bestLong}</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace' }}>
              {p.exchanges[p.bestLong] !== null ? `${(p.exchanges[p.bestLong]! * 100).toFixed(4)}%` : '—'}
            </div>
          </div>
          <div style={{ background: 'rgba(244,63,94,0.05)', padding: 10, borderRadius: 8, border: '1px solid rgba(244,63,94,0.1)' }}>
            <div style={{ color: 'var(--negative)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 4 }}>Best Short</div>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{p.bestShort}</div>
            <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace' }}>
              {p.exchanges[p.bestShort] !== null ? `${(p.exchanges[p.bestShort]! * 100).toFixed(4)}%` : '—'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Spread Difference</div>
          <div style={{ fontWeight: 800, fontFamily: 'monospace', color: p.spread >= 0 ? '#60a5fa' : 'var(--negative)' }}>{(p.spread * 100).toFixed(4)}%</div>
        </div>
      </div>
    );
  }
  return null;
};

export default function HistoricalCharts({ symbol }: HistoricalChartsProps) {
  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  const [data, setData] = useState<HistoricalFundingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/funding-rates/history?symbol=${encodeURIComponent(symbol)}&period=${period}`);
        const json: HistoricalFundingResponse = await res.json();
        setData(json.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [symbol, period]);

  // Extract all exchange names from data if any exists
  const exchanges = data.length > 0 ? Object.keys(data[0].exchanges) : [];

  if (loading) {
    return (
      <div style={{ padding: '2rem 1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: 16, marginTop: '2.5rem' }}>
        <div style={{ height: 400, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }} className="pulse" />
        <style>{`
          @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 0.3; } 100% { opacity: 0.6; } }
          .pulse { animation: pulse 1.5s infinite ease-in-out; }
        `}</style>
      </div>
    );
  }

  // EMPTY STATE
  if (data.length === 0) {
    return (
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 16 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={20} color="var(--accent-blue)" /> Historical Analysis
          </h2>
          
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {(['24h', '7d', '30d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '6px 16px', background: period === p ? 'var(--accent-blue-glow)' : 'transparent',
                  color: period === p ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase'
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '3rem 2rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', color: '#60a5fa', marginBottom: 24, position: 'relative', zIndex: 2 }}>
            <CalendarClock size={32} />
          </div>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 12px 0', position: 'relative', zIndex: 2 }}>Historical Data Collection Starting</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto 32px', lineHeight: 1.5, position: 'relative', zIndex: 2 }}>
            We have just initialized the time-series database architecture. Historical funding rate tracking for <strong style={{ color: 'var(--text-primary)' }}>{symbol}</strong> is now active. Check back soon for detailed 7D, 30D, and 1Y charts!
          </p>
          
          {/* Placeholder blurred chart */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%', opacity: 0.15, filter: 'blur(4px)', pointerEvents: 'none', zIndex: 1, maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)' }}>
            <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
              <polyline points="0,80 10,75 20,60 30,65 40,70 50,40 60,30 70,45 80,40 90,25 100,20" fill="none" stroke="#60a5fa" strokeWidth="2" />
              <polyline points="0,90 10,88 20,80 30,82 40,85 50,60 60,50 70,65 80,70 90,55 100,40" fill="none" stroke="var(--negative)" strokeWidth="2" />
              <polyline points="0,70 10,65 20,40 30,55 40,50 50,30 60,20 70,35 80,30 90,15 100,10" fill="none" stroke="var(--positive)" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 16 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={20} color="var(--accent-blue)" /> Historical Analysis
        </h2>
        
        {/* Period Selector */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
          {(['24h', '7d', '30d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '6px 16px', background: period === p ? 'var(--accent-blue-glow)' : 'transparent',
                color: period === p ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: 'none', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase'
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Statistics */}
      {(() => {
        let highest = -Infinity;
        let lowest = Infinity;
        let total = 0;
        let count = 0;

        data.forEach(d => {
          Object.values(d.exchanges).forEach(rate => {
            if (rate !== null && rate !== undefined) {
              if (rate > highest) highest = rate;
              if (rate < lowest) lowest = rate;
              total += rate;
              count++;
            }
          });
        });

        const avg = count > 0 ? total / count : 0;
        if (highest === -Infinity) highest = 0;
        if (lowest === Infinity) lowest = 0;

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="stat-card" style={{ padding: '1.2rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>Average Funding</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{(avg * 100).toFixed(4)}%</div>
            </div>
            <div className="stat-card" style={{ padding: '1.2rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>Highest Funding</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--positive)', fontFamily: 'monospace' }}>{(highest * 100).toFixed(4)}%</div>
            </div>
            <div className="stat-card" style={{ padding: '1.2rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>Lowest Funding</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--negative)', fontFamily: 'monospace' }}>{(lowest * 100).toFixed(4)}%</div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        
        {/* Funding Rate History */}
        <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Funding Rate History</h3>
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={t => new Date(t).toLocaleDateString()} 
                  stroke="var(--text-muted)" 
                  fontSize={12} 
                  tickMargin={10} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={v => `${(v * 100).toFixed(2)}%`} 
                  stroke="var(--text-muted)" 
                  fontSize={12} 
                  domain={['auto', 'auto']} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 20 }} />
                
                {exchanges.map((ex, i) => (
                  <Line 
                    key={ex} 
                    type="monotone" 
                    dataKey={`exchanges.${ex}`} 
                    name={ex} 
                    stroke={COLORS[i % COLORS.length]} 
                    strokeWidth={2} 
                    dot={false} 
                    activeDot={{ r: 4, strokeWidth: 0 }} 
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spread History */}
        <div className="stat-card" style={{ padding: '1.5rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Arbitrage Spread Tracking</h3>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSpread" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={t => new Date(t).toLocaleDateString()} 
                  stroke="var(--text-muted)" 
                  fontSize={12} 
                  tickMargin={10} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={v => `${(v * 100).toFixed(2)}%`} 
                  stroke="var(--text-muted)" 
                  fontSize={12} 
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any) => [`${(Number(value) * 100).toFixed(4)}%`, 'Spread']}
                  labelFormatter={(t) => new Date(t).toLocaleString()}
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-card)' }}
                  itemStyle={{ color: '#60a5fa', fontWeight: 700 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="spread" 
                  stroke="#60a5fa" 
                  fillOpacity={1} 
                  fill="url(#colorSpread)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

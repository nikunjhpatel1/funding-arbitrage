'use client';

import { useState, useEffect } from 'react';
import { Activity, ShieldAlert, DollarSign, TrendingUp, History, List, XCircle, Play } from 'lucide-react';

export default function TradingDashboard({ mode }: { mode: 'paper' | 'demo' | 'live' }) {
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    equity: '$0.00', openPositions: 0, closedTrades: 0,
    winRate: '0%', realizedPnl: '+$0.00', unrealizedPnl: '$0.00',
  });
  const [positions, setPositions] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/trading/stats?mode=${mode}`);
        const json = await res.json();
        if (json.success) {
          const d = json.data;
          const fmt = (n: number) => (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2);
          setStats({
            equity: `$${Number(d.equity).toFixed(2)}`,
            openPositions: d.openPositions,
            closedTrades: d.closedTrades,
            winRate: d.winRate,
            realizedPnl: fmt(d.realizedPnl),
            unrealizedPnl: fmt(d.unrealizedPnl),
          });
          setPositions(d.positions || []);
          setLogs(d.logs || []);
        }
      } catch (e) {
        console.error('Failed to fetch trading stats', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [mode]);

  return (
    <div className="page-wrapper">
      <div className="bg-grid"></div>
      <div className="bg-radial-1"></div>
      <div className="bg-radial-2"></div>
      
      <main className="main-content content-layer" style={{ paddingTop: '2.5rem' }}>
        
        {/* Header Section */}
        <div className="section-header" style={{ marginBottom: '2.5rem', alignItems: 'flex-start' }}>
          <div>
            <div className="hero-eyebrow" style={{ 
              borderColor: mode === 'live' ? 'rgba(244,63,94,0.3)' : mode === 'paper' ? 'rgba(148,163,184,0.3)' : 'rgba(59,130,246,0.3)',
              background: mode === 'live' ? 'rgba(244,63,94,0.08)' : mode === 'paper' ? 'rgba(148,163,184,0.08)' : 'rgba(59,130,246,0.08)',
              color: mode === 'live' ? 'var(--negative)' : mode === 'paper' ? 'var(--neutral)' : 'var(--accent-blue)',
            }}>
              {mode === 'paper' && <Activity size={14} />}
              {mode === 'demo' && <Activity size={14} />}
              {mode === 'live' && <ShieldAlert size={14} />}
              {mode === 'paper' ? 'Paper Trading Environment' : mode === 'demo' ? 'Demo Trading Environment' : 'Live Trading Environment'}
            </div>
            
            <h1 className="hero-title" style={{ fontSize: '2.5rem', margin: '0 0 0.5rem 0', textAlign: 'left' }}>
              {mode === 'paper' ? 'Paper Trading' : mode === 'demo' ? 'Demo Trading' : 'Live Trading'}
            </h1>
            
            <p className="hero-subtitle" style={{ margin: '0', textAlign: 'left', maxWidth: '800px', fontSize: '1rem' }}>
              {mode === 'paper' && 'Fully simulated trading using historical and live data without exchange connections.'}
              {mode === 'demo' && 'Executing real orders on exchange testnet/demo accounts. No real money at risk.'}
              {mode === 'live' && <span style={{ color: 'var(--negative)', fontWeight: 700 }}><ShieldAlert size={16} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> WARNING: REAL MONEY MODE. REAL FUNDS ARE AT RISK.</span>}
            </p>
          </div>
          
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            {mode !== 'paper' && (
              <button className="btn btn-ghost" style={{ 
                color: 'var(--negative)', 
                borderColor: 'rgba(244,63,94,0.4)', 
                background: 'rgba(244,63,94,0.1)' 
              }}>
                <XCircle size={16} /> Close All Positions
              </button>
            )}
            <button className="btn btn-primary">
              <Play size={16} fill="currentColor" /> Execute {mode === 'paper' ? 'Paper' : mode === 'demo' ? 'Demo' : 'Live'} Arbitrage
            </button>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="stats-grid animate-fade-up">
          <div className="stat-card blue">
            <div className="stat-label"><DollarSign size={14} /> Total Equity</div>
            <div className="stat-value">{stats.equity}</div>
          </div>
          <div className="stat-card purple">
            <div className="stat-label"><Activity size={14} /> Open Positions</div>
            <div className="stat-value">{stats.openPositions}</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-label"><History size={14} /> Closed Trades</div>
            <div className="stat-value">{stats.closedTrades}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label"><TrendingUp size={14} /> Win Rate</div>
            <div className="stat-value" style={{ color: 'var(--positive)' }}>{stats.winRate}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Realized PnL</div>
            <div className="stat-value rate-positive">{stats.realizedPnl}</div>
          </div>
          <div className="stat-card red">
            <div className="stat-label">Unrealized PnL</div>
            <div className="stat-value rate-negative">{stats.unrealizedPnl}</div>
          </div>
        </div>

        {/* Main Content Sections */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }} className="animate-fade-up-1">
          
          {/* Left Column: Positions & History */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Open Positions */}
            <div className="table-wrapper" style={{ padding: '1.5rem' }}>
              <div className="section-header" style={{ marginBottom: '1rem' }}>
                <h2 className="section-title"><Activity size={18} color="var(--accent-blue)" /> Open Positions</h2>
                <div className="filter-tabs">
                  <button className="filter-tab active">All</button>
                  <button className="filter-tab">In Profit</button>
                  <button className="filter-tab">In Loss</button>
                </div>
              </div>
              {positions.length === 0 ? (
                <div style={{ background: 'var(--bg-deep)', borderRadius: 'var(--radius-md)', padding: '3rem 2rem', textAlign: 'center', border: '1px dashed var(--border)' }}>
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No open positions found.</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Execute an arbitrage trade to see it here.</div>
                </div>
              ) : (
                <div>
                  {positions.map((pos: any) => (
                    <div key={pos.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pos.symbol}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{pos.exchange} · {pos.side}</span>
                      <span style={{ color: (pos.unrealized_pnl || 0) >= 0 ? 'var(--positive)' : 'var(--negative)', fontWeight: 600 }}>
                        {(pos.unrealized_pnl || 0) >= 0 ? '+' : ''}${Number(pos.unrealized_pnl || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trade History */}
            <div className="table-wrapper" style={{ padding: '1.5rem' }}>
              <div className="section-header" style={{ marginBottom: '1rem' }}>
                <h2 className="section-title"><History size={18} color="var(--accent-purple)" /> Trade History</h2>
              </div>
              <div style={{ background: 'var(--bg-deep)', borderRadius: 'var(--radius-md)', padding: '3rem 2rem', textAlign: 'center', border: '1px dashed var(--border)' }}>
                <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>No trade history available.</div>
              </div>
            </div>

          </div>

          {/* Right Column: Execution Logs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="table-wrapper" style={{ padding: '1.5rem', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
              <div className="section-header" style={{ marginBottom: '1rem' }}>
                <h2 className="section-title"><List size={18} color="var(--positive)" /> Execution Logs</h2>
              </div>
              <div style={{ 
                flex: 1, background: 'var(--bg-deep)', borderRadius: 'var(--radius-md)', padding: '1rem', 
                border: '1px solid var(--border)', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.8rem',
                overflowY: 'auto'
              }}>
                {logs.length === 0 ? (
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ color: 'var(--accent-blue)' }}>&gt;</span>
                    <span style={{ color: 'var(--text-muted)' }}>Waiting for execution...</span>
                  </div>
                ) : (
                  logs.map((log: any) => (
                    <div key={log.id} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        [{new Date(log.created_at).toLocaleTimeString()}]
                      </span>
                      <span style={{
                        color: log.log_level === 'ERROR' ? 'var(--negative)' : log.log_level === 'WARN' ? '#F7A600' : 'var(--text-secondary)'
                      }}>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

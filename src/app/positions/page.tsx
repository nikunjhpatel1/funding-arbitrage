'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function PositionsPage() {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<string | null>(null);

  useEffect(() => {
    fetchPositions();
  }, []);

  async function fetchPositions() {
    setLoading(true);
    const { data, error } = await supabase
      .from('live_positions')
      .select('*')
      .order('opened_at', { ascending: false });
      
    if (data) setPositions(data);
    setLoading(false);
  }

  async function handleClosePosition(positionId: string) {
    if (!confirm('Are you sure you want to close this position? This will execute market orders to close both legs.')) return;
    
    setClosing(positionId);
    try {
      const res = await fetch('/api/trade/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId })
      });
      const data = await res.json();
      if (data.success) {
        alert('Position closed successfully');
        fetchPositions();
      } else {
        alert(`Failed to close position: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
    setClosing(null);
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-primary)' }}>Loading positions...</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: 'var(--text-primary)' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 700, marginBottom: '2rem' }}>Open Positions</h1>
      
      {positions.length === 0 ? (
        <div style={{ padding: '2rem', background: 'var(--bg-secondary)', borderRadius: 12, textAlign: 'center' }}>
          No positions found.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '1rem' }}>Symbol</th>
                <th style={{ padding: '1rem' }}>Long Ex.</th>
                <th style={{ padding: '1rem' }}>Short Ex.</th>
                <th style={{ padding: '1rem' }}>Size</th>
                <th style={{ padding: '1rem' }}>Entry Long</th>
                <th style={{ padding: '1rem' }}>Entry Short</th>
                <th style={{ padding: '1rem' }}>Status</th>
                <th style={{ padding: '1rem' }}>Open Time</th>
                <th style={{ padding: '1rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '1rem', fontWeight: 600 }}>{pos.long_symbol || pos.symbol}</td>
                  <td style={{ padding: '1rem' }}>{pos.long_exchange}</td>
                  <td style={{ padding: '1rem' }}>{pos.short_exchange}</td>
                  <td style={{ padding: '1rem' }}>${pos.capital} ({pos.quantity})</td>
                  <td style={{ padding: '1rem' }}>{pos.entry_price_long}</td>
                  <td style={{ padding: '1rem' }}>{pos.entry_price_short}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      padding: '4px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
                      background: pos.status === 'OPEN' ? '#00ff9415' : '#88888815',
                      color: pos.status === 'OPEN' ? '#00ff94' : '#888888'
                    }}>
                      {pos.status}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {new Date(pos.opened_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {pos.status === 'OPEN' && (
                      <button
                        onClick={() => handleClosePosition(pos.id)}
                        disabled={closing === pos.id}
                        style={{
                          padding: '8px 12px',
                          background: closing === pos.id ? '#ff444480' : '#ff4444',
                          border: 'none', borderRadius: 6, color: '#fff',
                          cursor: closing === pos.id ? 'not-allowed' : 'pointer',
                          fontWeight: 600
                        }}
                      >
                        {closing === pos.id ? 'Closing...' : 'Close Position'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

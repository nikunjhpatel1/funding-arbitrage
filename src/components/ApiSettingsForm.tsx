'use client';

import { useState, useEffect } from 'react';
import { Shield, Key, CheckCircle, XCircle, Loader2, Trash2, Eye, EyeOff, Zap } from 'lucide-react';

const BASE_EXCHANGES = [
  { id: 'binance', baseName: 'Binance', color: '#F0B90B', demoSupported: false },
  { id: 'bybit',   baseName: 'Bybit',   color: '#F7A600', demoSupported: true  },
  { id: 'okx',     baseName: 'OKX',     color: '#FFFFFF', demoSupported: false },
  { id: 'bitget',  baseName: 'Bitget',  color: '#00CDD7', demoSupported: false },
  { id: 'delta',   baseName: 'Delta',   color: '#6A2A82', demoSupported: false },
];

type ExchangeKey = {
  id: string;
  exchange: string;
  is_active: boolean;
  tested_at: number | null;
  created_at: number;
  updated_at: number;
  apiKey?: string;
  secret?: string;
};

type FormState = {
  apiKey: string;
  secret: string;
  showKey: boolean;
  showSecret: boolean;
  saving: boolean;
  testing: boolean;
  error: string | null;
  success: string | null;
};

const defaultForm = (): FormState => ({
  apiKey: '', secret: '', showKey: false, showSecret: false,
  saving: false, testing: false, error: null, success: null,
});

export default function ApiSettingsForm({ mode }: { mode: 'demo' | 'live' }) {
  const [savedKeys, setSavedKeys] = useState<ExchangeKey[]>([]);
  const [forms, setForms] = useState<Record<string, FormState>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, { testing: boolean; result: 'connected' | 'error' | null; message: string }>>({});

  useEffect(() => { fetchKeys(); }, [mode]);

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/api-keys?mode=${mode}`);
      const data = await res.json();
      if (data.success) {
        setSavedKeys(data.data);
        const newForms: Record<string, FormState> = {};
        data.data.forEach((keyRow: ExchangeKey) => {
          newForms[keyRow.exchange] = {
            ...defaultForm(),
            apiKey: keyRow.apiKey || '',
            secret: keyRow.secret || '',
          };
        });
        setForms(prev => ({ ...prev, ...newForms }));
      }
    } finally {
      setLoading(false);
    }
  }

  function getForm(exchange: string): FormState {
    return forms[exchange] || defaultForm();
  }

  function updateForm(exchange: string, patch: Partial<FormState>) {
    setForms(prev => ({ ...prev, [exchange]: { ...getForm(exchange), ...patch } }));
  }

  function getSavedKey(exchange: string) {
    return savedKeys.find(k => k.exchange === exchange) || null;
  }

  async function handleSave(exchange: string) {
    const form = getForm(exchange);
    if (!form.apiKey.trim() || !form.secret.trim()) {
      updateForm(exchange, { error: 'Both API Key and Secret are required' });
      return;
    }
    updateForm(exchange, { saving: true, error: null, success: null });
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, apiKey: form.apiKey.trim(), secret: form.secret.trim(), mode }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      updateForm(exchange, { saving: false, success: 'Keys saved successfully!' });
      fetchKeys();
    } catch (e: any) {
      updateForm(exchange, { saving: false, error: e.message });
    }
  }

  async function handleDelete(exchange: string) {
    if (!confirm(`Remove API keys for ${exchange}?`)) return;
    setDeleting(exchange);
    try {
      await fetch('/api/settings/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, mode }),
      });
      fetchKeys();
    } finally {
      setDeleting(null);
    }
  }

  async function handleTest(exchange: string) {
    setTestStatus(prev => ({ ...prev, [exchange]: { testing: true, result: null, message: '' } }));
    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exchange, mode }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus(prev => ({ ...prev, [exchange]: { testing: false, result: 'connected', message: '🟢 Connected' } }));
      } else {
        const err: string = data.error || '';
        let label = '🔴 Connection Failed';
        if (/invalid.*key|api.key.*invalid|invalid api/i.test(err)) label = '🔴 Invalid Key';
        else if (/permission|futures|not enabled|restricted|kyc/i.test(err)) label = '🔴 Futures Permission Missing';
        else if (/ip|whitelist/i.test(err)) label = '🔴 IP Not Whitelisted';
        setTestStatus(prev => ({ ...prev, [exchange]: { testing: false, result: 'error', message: label } }));
      }
    } catch (e: any) {
      setTestStatus(prev => ({ ...prev, [exchange]: { testing: false, result: 'error', message: '🔴 Network Error' } }));
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '2rem' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <a href="/settings/demo-apis" style={{
              fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '8px',
              background: mode === 'demo' ? 'var(--accent-primary)' : 'transparent',
              color: mode === 'demo' ? '#000' : 'var(--text-secondary)',
              textDecoration: 'none'
            }}>Demo APIs</a>
            <a href="/settings/live-apis" style={{
              fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '8px',
              background: mode === 'live' ? '#ff4444' : 'transparent',
              color: mode === 'live' ? '#fff' : 'var(--text-secondary)',
              textDecoration: 'none'
            }}>Live APIs</a>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Shield size={28} color={mode === 'live' ? '#ff4444' : "var(--accent-primary)"} />
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              {mode === 'demo' ? 'Demo Trading APIs' : 'Live Trading APIs'}
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
            {mode === 'live' && <span style={{ color: '#ff4444', fontWeight: 'bold' }}>WARNING: REAL MONEY MODE. </span>}
            Your keys are encrypted before storage and never exposed in the browser.
            Enable Futures trading only — never enable withdrawals.
          </p>
        </div>

        {/* Exchange Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {BASE_EXCHANGES.map(ex => {
              // In demo mode, only show exchanges that have a real demo environment
              if (mode === 'demo' && !ex.demoSupported) return null;
              const name = mode === 'demo' ? `${ex.baseName} Demo (api-demo.bybit.com)` : ex.baseName;
              const saved = getSavedKey(ex.id);
              const form = getForm(ex.id);
              return (
                <div key={ex.id} style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: '1.5rem',
                }}>
                  {/* Exchange Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: ex.color, flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {name}
                      </span>
                      {saved ? (
                        <span style={{
                          background: '#00ff9420', color: '#00ff94',
                          border: '1px solid #00ff9440',
                          borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600,
                        }}>
                          ✓ CONNECTED
                        </span>
                      ) : (
                        <span style={{
                          background: '#ffffff10', color: 'var(--text-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 20, padding: '2px 10px', fontSize: '0.72rem',
                        }}>
                          NOT CONNECTED
                        </span>
                      )}
                    </div>

                  </div>

                  {/* Last saved info */}
                  {saved && (
                    <div style={{ marginBottom: '1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Last updated: {new Date(saved.updated_at).toLocaleString()}
                    </div>
                  )}

                  {/* Input Fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={form.showKey ? 'text' : 'password'}
                        placeholder="API Key"
                        value={form.apiKey}
                        onChange={e => updateForm(ex.id, { apiKey: e.target.value })}
                        style={{
                          width: '100%', padding: '10px 40px 10px 12px',
                          background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                          borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button onClick={() => updateForm(ex.id, { showKey: !form.showKey })}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        {form.showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={form.showSecret ? 'text' : 'password'}
                        placeholder="Secret Key"
                        value={form.secret}
                        onChange={e => updateForm(ex.id, { secret: e.target.value })}
                        style={{
                          width: '100%', padding: '10px 40px 10px 12px',
                          background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                          borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button onClick={() => updateForm(ex.id, { showSecret: !form.showSecret })}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        {form.showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Error / Success */}
                  {form.error && (
                    <div style={{ marginTop: '0.75rem', color: '#ff4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <XCircle size={14} /> {form.error}
                    </div>
                  )}
                  {form.success && (
                    <div style={{ marginTop: '0.75rem', color: '#00ff94', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={14} /> {form.success}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginTop: '1.2rem' }}>
                    <button
                      onClick={() => handleSave(ex.id)}
                      disabled={form.saving}
                      className="btn btn-primary"
                      style={{ justifyContent: 'center', padding: '12px' }}
                    >
                      {form.saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Key size={16} />}
                      Save
                    </button>
                    
                    <button
                      onClick={() => handleDelete(ex.id)}
                      disabled={!saved || deleting === ex.id}
                      className="btn btn-ghost"
                      style={{ 
                        justifyContent: 'center', padding: '12px',
                        color: saved ? '#ff4444' : 'var(--text-muted)',
                        borderColor: saved ? 'rgba(255,68,68,0.3)' : 'var(--border)'
                      }}
                    >
                      {deleting === ex.id ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={16} />}
                      Delete
                    </button>

                    <button
                      onClick={() => handleTest(ex.id)}
                      disabled={!saved || testStatus[ex.id]?.testing}
                      className="btn btn-ghost"
                      style={{ 
                        justifyContent: 'center', padding: '12px',
                        color: saved ? 'var(--text-primary)' : 'var(--text-muted)'
                      }}
                    >
                      {testStatus[ex.id]?.testing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={16} />}
                      Test Connection
                    </button>
                  </div>
                  
                  {/* Test Connection Result */}
                  {testStatus[ex.id]?.result && (
                    <div style={{
                      marginTop: '1rem', fontSize: '0.85rem', fontWeight: 600,
                      textAlign: 'center', padding: '0.75rem', borderRadius: '8px',
                      background: testStatus[ex.id].result === 'connected' ? 'rgba(0,255,148,0.1)' : 'rgba(255,68,68,0.1)',
                      color: testStatus[ex.id].result === 'connected' ? '#00ff94' : '#ff4444',
                      border: `1px solid ${testStatus[ex.id].result === 'connected' ? 'rgba(0,255,148,0.2)' : 'rgba(255,68,68,0.2)'}`
                    }}>
                      {testStatus[ex.id].message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {mode === 'demo' && (
            <div style={{
              marginTop: '1.5rem', padding: '1rem 1.25rem',
              background: 'rgba(247,166,0,0.08)',
              border: '1px solid rgba(247,166,0,0.3)',
              borderRadius: 10, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.7
            }}>
              <strong style={{ color: '#F7A600' }}>ℹ️ About Demo Trading:</strong><br />
              Only <strong>Bybit Demo</strong> is supported. It uses real market prices with virtual money.<br />
              Create a demo account at <strong>bybit.com → Demo Trading</strong> and generate API keys there.<br />
              Do NOT use Bybit Testnet keys — those have fake prices. Use Bybit Demo account keys only.
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

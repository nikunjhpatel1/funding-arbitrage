const fs = require('fs');

let content = fs.readFileSync('scratch_paper.tsx', 'utf-8');

// Replace PaperPosition with UnifiedPosition
content = content.replace(/type \{ PaperPosition \} from '@\/app\/api\/paper-trading\/route';/g, `type { PaperPosition } from '@/app/api/paper-trading/route';\nexport type UnifiedPosition = PaperPosition & { trade_mode?: string };`);
content = content.replace(/PaperPosition\[\]/g, 'UnifiedPosition[]');
content = content.replace(/PaperPosition/g, 'UnifiedPosition');

// Update fetchPositions
content = content.replace(/fetch\('\/api\/paper-trading'\)/g, `fetch('/api/positions/unified')`);

// Replace openPosition parameters
content = content.replace(/const openPosition = async \(e: React\.FormEvent\) => \{/g, `
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<'demo' | 'live'>('demo');
  const [isExecuting, setIsExecuting] = useState(false);

  const requestExecute = (e: React.FormEvent, mode: 'demo' | 'live') => {
    e.preventDefault();
    if (mode === 'live') {
      setLiveConfirmOpen(true);
      setPendingMode('live');
    } else {
      executePosition('demo');
    }
  };

  const executePosition = async (mode: 'demo' | 'live') => {
    setIsExecuting(true);
`);

// Inside openPosition, change the POST endpoint and add mode
content = content.replace(/const res  = await fetch\('\/api\/paper-trading', \{/g, `const res  = await fetch('/api/trade/execute', {`);

content = content.replace(/body: JSON\.stringify\(\{([\s\S]*?)shortRateAtEntry,([\s\S]*?)\}\),/g, `body: JSON.stringify({$1shortRateAtEntry,$2mode,\n          longPrice: longEntryPrice,\n          shortPrice: shortEntryPrice\n        }),`);

// Replace the submit button
content = content.replace(/\{canTrade \? 'Open Simulated Trade' : '⚠ Select exchanges that list this token'\}/g, `{canTrade ? 'Execute Trade' : '⚠ Select exchanges that list this token'}`);

const newButtons = `
            {/* Action Buttons */}
            {(() => {
              const market = marketData.find(m => m.symbol === symbol);
              const canTrade = market?.exchangePrices?.[longExchange] != null && market?.exchangePrices?.[shortExchange] != null;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 4 }}>
                  <button type="button" disabled={!canTrade || isExecuting} onClick={(e) => requestExecute(e, 'demo')}
                    style={{ background: canTrade ? '#3b82f6' : 'rgba(100,100,100,0.3)', color: canTrade ? '#fff' : 'var(--text-muted)', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: canTrade ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}>
                    {isExecuting ? 'Executing...' : 'Execute Demo Trade'}
                  </button>
                  <button type="button" disabled={!canTrade || isExecuting} onClick={(e) => requestExecute(e, 'live')}
                    style={{ background: canTrade ? '#ef4444' : 'rgba(100,100,100,0.3)', color: canTrade ? '#fff' : 'var(--text-muted)', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 700, cursor: canTrade ? 'pointer' : 'not-allowed', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    {isExecuting ? 'Executing...' : <><AlertTriangle size={16} /> Execute Live Trade</>}
                  </button>
                </div>
              );
            })()}
`;

// Remove the old button and insert the new buttons
content = content.replace(/<button type="submit" disabled=\{!canTrade\}([\s\S]*?)<\/button>/g, newButtons);

// Close the executePosition function properly
content = content.replace(/fetchPositions\(\);\n    \} catch \(e\) \{ console\.error\(e\); \}/g, `fetchPositions();\n    } catch (e) { console.error(e); } finally { setIsExecuting(false); setLiveConfirmOpen(false); }`);

// Add Confirmation Modal JSX before final </div>
const modalJSX = `
      {/* Live Confirmation Modal */}
      {liveConfirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 420 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', color: '#ef4444', margin: '0 0 1rem 0' }}>
              <AlertTriangle size={24} /> Confirm LIVE Trade
            </h2>
            <p style={{ color: 'var(--text-primary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              You are about to place a <strong>REAL trade</strong> using <strong>LIVE funds</strong> on {longExchange} and {shortExchange}.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => executePosition('live')} disabled={isExecuting} style={{ flex: 1, padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                {isExecuting ? 'Executing...' : 'CONFIRM LIVE TRADE'}
              </button>
              <button onClick={() => setLiveConfirmOpen(false)} disabled={isExecuting} style={{ flex: 1, padding: '12px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(/<\/div>\n  \);\n\}\n$/, modalJSX + `\n    </div>\n  );\n}\n`);

// Replace form onSubmit
content = content.replace(/<form onSubmit=\{openPosition\}/g, `<form onSubmit={(e) => e.preventDefault()}`);

// Display Mode Badge in Active Positions table
content = content.replace(/<td style=\{\{ padding: '12px 14px', fontWeight: 700, cursor: 'pointer', color: 'var\(--accent-blue\)', whiteSpace: 'nowrap' \}\} onClick=\{\(\) => setExpandedPos\(isExpanded \? null : p\.id\)\}>([\s\S]*?)<div style=\{\{ fontSize: '0.72rem', color: 'var\(--text-muted\)', fontWeight: 400 \}\}>\{p.leverage\}x · \{p.long_exchange.toUpperCase\(\)\} \/ \{p.short_exchange.toUpperCase\(\)\}<\/div>/g, 
  `<td style={{ padding: '12px 14px', fontWeight: 700, cursor: 'pointer', color: 'var(--accent-blue)', whiteSpace: 'nowrap' }} onClick={() => setExpandedPos(isExpanded ? null : p.id)}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {p.trade_mode === 'demo' ? <span style={{ background: '#3b82f630', color: '#3b82f6', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem' }}>DEMO</span> : <span style={{ background: '#ef444430', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem' }}>LIVE</span>}
      {p.symbol} {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
    </div>
    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>{p.leverage}x · {p.long_exchange.toUpperCase()} / {p.short_exchange.toUpperCase()}</div>`
);


fs.writeFileSync('scratch_paper2.tsx', content);

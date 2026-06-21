// Raw payload probe — logs first message from each exchange to confirm field names
import WebSocket from 'ws';

function probe(name: string, url: string, onOpen: (ws: WebSocket) => void) {
  const ws = new WebSocket(url);
  ws.on('error', (e) => console.log(`[${name}] ERROR:`, e.message));
  ws.on('open', () => { setTimeout(() => onOpen(ws), 100); });
  ws.on('message', (raw: Buffer | string) => {
    const text = raw.toString();
    if (text === 'pong' || text === 'ping') return;
    try {
      const d = JSON.parse(text);
      // Skip ack messages
      if (d.op === 'pong' || d.op === 'ping') return;
      if (d.event === 'subscribe' || d.type === 'subscriptions' || d.result?.status === 'success') return;
      if (d.type === 'welcome' || d.type === 'ack') return;
      console.log(`\n[${name}] RAW TICKER PAYLOAD:`);
      console.log(JSON.stringify(d, null, 2).slice(0, 1200));
    } catch {}
  });
  ws.on('close', () => {});
  return ws;
}

// Bybit — tickers.BTCUSDT to get full snapshot
const bybit = probe('BYBIT', 'wss://stream.bybit.com/v5/public/linear', (ws) => {
  ws.send(JSON.stringify({ op: 'subscribe', args: ['tickers.BTCUSDT'] }));
});

// Bitget — ticker channel for USDT-FUTURES  
const bitget = probe('BITGET', 'wss://ws.bitget.com/v2/ws/public', (ws) => {
  ws.send(JSON.stringify({ op: 'subscribe', args: [{ instType: 'USDT-FUTURES', channel: 'ticker', instId: 'BTCUSDT' }] }));
});

// Delta — v2/ticker for BTCUSDT
const delta = probe('DELTA', 'wss://socket.delta.exchange', (ws) => {
  ws.send(JSON.stringify({ type: 'subscribe', payload: { channels: [{ name: 'v2/ticker', symbols: ['BTCUSDT'] }] } }));
});

// KuCoin — try /contractMarket/snapshot which may have funding rate
async function probeKucoin() {
  const res = await fetch('https://api-futures.kucoin.com/api/v1/bullet-public', { method: 'POST' });
  const d = await res.json() as any;
  const token = d?.data?.token;
  const endpoint = d?.data?.instanceServers?.[0]?.endpoint;
  if (!token) { console.log('[KUCOIN] token fetch failed'); return; }
  const ws = new WebSocket(`${endpoint}?token=${token}`);
  ws.on('error', (e: Error) => console.log('[KUCOIN] ERROR:', e.message));
  ws.on('open', () => {
    setTimeout(() => {
      // Subscribe to snapshot topic which includes funding rate
      ws.send(JSON.stringify({ id: '1', type: 'subscribe', topic: '/contractMarket/snapshot:BTCUSDTM', privateChannel: false, response: true }));
      // Also try the dedicated funding rate topic
      ws.send(JSON.stringify({ id: '2', type: 'subscribe', topic: '/contract/fundingRate:BTCUSDTM', privateChannel: false, response: true }));
    }, 100);
  });
  ws.on('message', (raw: Buffer | string) => {
    const text = raw.toString();
    try {
      const d = JSON.parse(text);
      if (d.type === 'welcome' || d.type === 'ack') return;
      console.log('\n[KUCOIN] RAW PAYLOAD:');
      console.log(JSON.stringify(d, null, 2).slice(0, 1200));
    } catch {}
  });
  return ws;
}

probeKucoin();

setTimeout(() => {
  bybit?.close();
  bitget?.close();
  delta?.close();
  console.log('\n--- PROBE COMPLETE ---');
  process.exit(0);
}, 12000);

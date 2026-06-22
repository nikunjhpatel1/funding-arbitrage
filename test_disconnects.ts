import { WebSocket } from 'ws';

function testWS(name: string, url: string) {
  const ws = new WebSocket(url);
  ws.on('open', () => console.log(`[${name}] Connected`));
  ws.on('close', (code, reason) => console.log(`[${name}] Closed: Code ${code}, Reason: ${reason.toString() || 'None'}`));
  ws.on('error', (err) => console.log(`[${name}] Error:`, err.message));
}

// BingX
testWS('BingX', 'wss://open-api-swap.bingx.com/swap-market');

// Phemex
testWS('Phemex', 'wss://phemex.com/ws');

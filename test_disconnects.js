const WebSocket = require('ws');

function testWS(name, url) {
  const ws = new WebSocket(url);
  ws.on('open', () => console.log(`[${name}] Connected`));
  ws.on('close', (code, reason) => console.log(`[${name}] Closed: Code ${code}, Reason: ${reason.toString() || 'None'}`));
  ws.on('error', (err) => console.log(`[${name}] Error:`, err.message));
}

testWS('BingX', 'wss://open-api-ws.bingx.com/swap-market');
testWS('Phemex', 'wss://vapi.phemex.com/ws');

setTimeout(() => process.exit(0), 10000);

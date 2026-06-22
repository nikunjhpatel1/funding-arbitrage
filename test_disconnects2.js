const WebSocket = require('ws');

function testWS(name, url, subscribeFn) {
  const ws = new WebSocket(url);
  ws.on('open', () => {
    console.log(`[${name}] Connected`);
    if (subscribeFn) subscribeFn(ws);
  });
  ws.on('close', (code, reason) => console.log(`[${name}] Closed: Code ${code}, Reason: ${reason.toString() || 'None'}`));
  ws.on('error', (err) => console.log(`[${name}] Error:`, err.message));
  ws.on('message', (data) => console.log(`[${name}] MSG:`, data.toString().substring(0, 50)));
}

// BingX
testWS('BingX', 'wss://open-api-ws.bingx.com/swap-market', (ws) => {
  ws.send(JSON.stringify({ id: "bingx_test", reqType: "sub", dataType: "BTC-USDT@ticker" }));
});

// Phemex
testWS('Phemex', 'wss://vapi.phemex.com/ws', (ws) => {
  ws.send(JSON.stringify({ id: 12345, method: "tick.subscribe", params: [".BTC"] }));
});

setTimeout(() => {
  console.log('Test complete.');
  process.exit(0);
}, 45000);

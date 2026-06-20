import WebSocket from 'ws';

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

// Same logic as ws-manager
const deltaSymbols = symbols.flatMap(s => [
  s,
  s.includes('_') ? s : s.replace('USDT', '_USDT').replace('USD', '_USD')
]);

const ws = new WebSocket('wss://socket.delta.exchange');

const results = {
  connected: false,
  payloadSent: null,
  rawMessages: [],
  bestBids: {},
  bestAsks: {}
};

ws.on('open', () => {
  results.connected = true;
  
  const payload = {
    type: 'subscribe',
    payload: {
      channels: [
        {
          name: 'v2/ticker',
          symbols: deltaSymbols
        },
        {
          name: 'l2_orderbook',
          symbols: deltaSymbols
        }
      ]
    }
  };
  
  results.payloadSent = payload;
  ws.send(JSON.stringify(payload));
  console.log('[LOG] Sent payload:', JSON.stringify(payload));
});

let messageCount = 0;

ws.on('message', (data) => {
  const msgStr = data.toString();
  const parsed = JSON.parse(msgStr);
  
  if (messageCount < 10) {
    results.rawMessages.push(parsed);
  }
  
  messageCount++;

  if (parsed.type === 'v2/ticker' && parsed.symbol) {
    if (parsed.best_bid) results.bestBids[parsed.symbol] = parsed.best_bid;
    if (parsed.best_ask) results.bestAsks[parsed.symbol] = parsed.best_ask;
  } else if (parsed.type === 'l2_orderbook' && parsed.symbol) {
    if (parsed.buy && parsed.buy.length > 0) results.bestBids[parsed.symbol] = parsed.buy[0].price;
    if (parsed.sell && parsed.sell.length > 0) results.bestAsks[parsed.symbol] = parsed.sell[0].price;
  }
  
  // Stop after 3 seconds
  if (messageCount > 50) {
    finish();
  }
});

ws.on('error', (e) => {
  console.error('[ERROR]', e);
});

const timeout = setTimeout(() => {
  finish();
}, 5000);

function finish() {
  clearTimeout(timeout);
  ws.close();
  console.log('\n[RESULTS]');
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

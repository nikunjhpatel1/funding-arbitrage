import WebSocket from 'ws';

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

try {
  console.log("Connecting to Bybit WebSocket...");
  const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

  ws.onopen = () => {
    console.log("Connected to Bybit. Sending subscriptions...");
    const args = symbols.flatMap(s => [
      `tickers.${s}`,
      `orderbook.50.${s}`,
    ]);
    ws.send(JSON.stringify({ op: 'subscribe', args }));

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'ping' }));
      }
    }, 20000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data.toString());
    if (data.op === 'pong' || data.op === 'ping') return;
    
    if (data.topic && data.data) {
      console.log(`Received data for topic: ${data.topic}`);
    } else {
      console.log("Received other message:", event.data.toString());
    }
  };

  ws.onclose = (event) => {
    console.log(`Bybit connection closed. Code: ${event.code}, Reason: ${event.reason}`);
    process.exit(0);
  };

  ws.onerror = (err) => {
    console.log('[WS] Bybit error:', err.message);
    ws.close();
  };

  setTimeout(() => {
    console.log("Timeout reached. Closing connection.");
    ws.close();
  }, 10000);

} catch (e) {
  console.error("Caught error during Bybit connection setup:", e);
}

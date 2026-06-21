import WebSocket from 'ws';

const ws = new WebSocket('wss://vapi.phemex.com/ws');
ws.on('open', () => {
  console.log('Opened');
  try {
    ws.send(JSON.stringify({ id: 1, method: 'tick_p.subscribe', params: ['BTCUSDT'] }));
    console.log('Sent');
  } catch(e) {
    console.error('Send error:', e);
  }
});
ws.on('message', (data) => console.log('Msg:', data.toString().slice(0, 100)));
ws.on('error', (e) => console.error('WS Error:', e.message));
ws.on('close', () => console.log('Closed'));

setTimeout(() => { ws.close(); process.exit(0); }, 5000);

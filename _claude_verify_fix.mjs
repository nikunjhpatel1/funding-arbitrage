import zlib from 'zlib';

function testPhemex() {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://ws.phemex.com');
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; console.log('[Phemex] TIMEOUT - no message in 8s'); ws.close(); resolve(); }
    }, 8000);
    ws.onopen = () => {
      console.log('[Phemex] Connected, subscribing...');
      ws.send(JSON.stringify({ id: 1, method: 'tick_p.subscribe', params: ['BTCUSD'] }));
    };
    ws.onmessage = (event) => {
      console.log('[Phemex] Message:', event.data.toString().slice(0, 300));
      if (!done) { done = true; clearTimeout(timer); ws.close(); resolve(); }
    };
    ws.onerror = (e) => console.log('[Phemex] Error:', e?.message || e);
    ws.onclose = (e) => {
      console.log('[Phemex] Closed. Code:', e?.code, 'Reason:', e?.reason);
      if (!done) { done = true; clearTimeout(timer); resolve(); }
    };
  });
}

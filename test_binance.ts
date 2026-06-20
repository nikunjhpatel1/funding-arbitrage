import { wsManager } from './src/lib/ws-manager.js';
wsManager.connectAll();
setTimeout(() => {
  const p = wsManager.getPrices().find(p => p.exchange === 'binance' && p.symbol === 'BTCUSDT');
  console.log('FINAL_PRICE:', JSON.stringify(p, null, 2));
  process.exit(0);
}, 5000);

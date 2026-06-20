import { wsManager } from './src/lib/ws-manager.js';

process.on('uncaughtException', (err) => {
  // Ignore async socket errors
});

// Attempt to connect, ignoring errors from broken adapters
try {
  wsManager.connectAll();
} catch (e) {}

// Wait for prices to accumulate
setTimeout(() => {
  const btcEntries = wsManager.getPrices().filter(p => p.symbol === 'BTCUSDT' && p.markPrice > 0);
  if (btcEntries.length >= 2) {
    const pricesForExchanges = btcEntries.map(p => p.markPrice as number);
    const maxPrice = Math.max(...pricesForExchanges);
    const minPrice = Math.min(...pricesForExchanges);
    const spread = (maxPrice - minPrice) / minPrice; // ratio
    
    console.log('[DEBUG_BTC_SPREAD]', {
      inputs: pricesForExchanges,
      maxPrice,
      minPrice,
      computedSpread: parseFloat(spread.toFixed(8))
    });
  } else {
    console.log('Not enough data collected for BTCUSDT');
  }
  process.exit(0);
}, 6000);

import { WebSocketManager } from './src/lib/ws-manager.js';
import { usePrices } from './src/store/prices.js';

const wsManager = new WebSocketManager();

// Only keep the problematic exchanges
const targets = ['binance', 'kucoin', 'htx'];
Array.from(wsManager['adapters'].keys()).forEach(key => {
  if (!targets.includes(key)) {
    wsManager['adapters'].delete(key);
  }
});

// We want to trace Binance, KuCoin, and HTX. 
// We will monkey patch their onmessage or add custom logs.

wsManager['adapters'].forEach((adapter, name) => {
  const originalUpdatePrice = adapter.updatePrice.bind(adapter);
  
  // Intercept updatePrice to trace what gets passed to Zustand
  adapter.updatePrice = (symbol: string, updates: any, timestamp: number) => {
    if (updates.fundingRate !== undefined) {
      console.log(`\n--- TRACE [${name.toUpperCase()}] ---`);
      console.log(`[1] Raw update payload extracted:`, JSON.stringify(updates));
      
      originalUpdatePrice(symbol, updates, timestamp);
      
      // Let's check what Zustand store received
      const sym = symbol.toUpperCase().replace(/[-_]/g, '');
      const key = `${adapter['exchangeName']}:${sym}`;
      const storeState = usePrices.getState().pricesMap[key];
      
      console.log(`[2] UnifiedPrice in store:`, JSON.stringify(storeState));
      console.log(`------------------------------\n`);
    } else {
      originalUpdatePrice(symbol, updates, timestamp);
    }
  };
});

wsManager.connectAll();

console.log("Waiting 65 seconds for KuCoin's 60s funding interval and Binance/HTX data...\n");

setTimeout(() => {
  console.log("Diagnostic run complete.");
  process.exit(0);
}, 65000);

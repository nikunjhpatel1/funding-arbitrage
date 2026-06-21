import { wsManager } from './src/lib/ws-manager';

console.log('Testing CoinSwitch adapter...');
wsManager.connectAll();
wsManager.on('priceUpdate', (price) => {
  if (price.exchange === 'coinswitch') {
    console.log('[CoinSwitch Live Data]', price.symbol, price.markPrice, price.fundingRate, price.bid, price.ask);
  }
});

setTimeout(() => {
  console.log('Test complete.');
  process.exit(0);
}, 15000);

import { calculateSlippage, type OrderBook } from '../src/lib/slippage';

const mockOrderBook: OrderBook = {
  bids: [
    [64400, 0.5],
    [64300, 1.0],
    [64200, 2.0],
    [64000, 5.0],
  ],
  asks: [
    [64600, 0.5],
    [64700, 1.0],
    [64800, 2.0],
    [65000, 5.0],
  ],
};

const markPrice = 64500;

console.log('--- Slippage Test ---');
console.log('Mark Price:', markPrice);

const sizes = [100, 10000, 50000, 200000];

console.log('\n--- LONG (BUY) ---');
for (const size of sizes) {
  const res = calculateSlippage(mockOrderBook, 'buy', size, markPrice);
  console.log(`Size: $${size}`);
  console.log(`  Dynamic Mark: $${res.markPriceUsed.toFixed(2)}`);
  console.log(`  Fill Price: $${res.averageFillPrice.toFixed(2)}`);
  console.log(`  Slippage %: ${res.slippagePercent.toFixed(4)}%`);
  console.log(`  Slippage $: $${res.executionCostUSD.toFixed(2)} (${res.classification})`);
}

console.log('\n--- SHORT (SELL) ---');
for (const size of sizes) {
  const res = calculateSlippage(mockOrderBook, 'sell', size, markPrice);
  console.log(`Size: $${size}`);
  console.log(`  Dynamic Mark: $${res.markPriceUsed.toFixed(2)}`);
  console.log(`  Fill Price: $${res.averageFillPrice.toFixed(2)}`);
  console.log(`  Slippage %: ${res.slippagePercent.toFixed(4)}%`);
  console.log(`  Slippage $: $${res.executionCostUSD.toFixed(2)} (${res.classification})`);
}

import { wsManager } from './src/lib/ws-manager';

console.log("Listening for broadcast...");

wsManager.on('broadcast', (payloadStr) => {
  const data = JSON.parse(payloadStr);
  const delta = data.prices && Object.values(data.prices).find((p: any) => p.exchange === 'delta');
  
  if (delta && (delta.bid || delta.ask)) {
    console.log("\n[SUCCESS] Delta Data Received from unified stream:");
    console.log(JSON.stringify(delta, null, 2));
    process.exit(0);
  }
});

setTimeout(() => {
  console.log("Timeout waiting for Delta data.");
  process.exit(1);
}, 10000);

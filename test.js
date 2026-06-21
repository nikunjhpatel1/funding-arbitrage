const http = require('http');
const req = http.get('http://localhost:3001/api/prices/stream', (res) => {
  let out = '';
  res.on('data', (d) => {
    out += d.toString();
    if (out.includes('coinswitch') && out.includes('"latencyMs":') && !out.includes('"latencyMs":0')) {
      console.log('CoinSwitch has latency > 0! Verified.');
      process.exit(0);
    }
  });
  setTimeout(() => {
    console.log('Timeout. Data:', out);
    process.exit(0);
  }, 10000);
});

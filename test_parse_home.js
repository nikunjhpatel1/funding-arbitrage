const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\HP\\.gemini\\antigravity-ide\\brain\\73248a6f-6cd6-4576-b9aa-5f93c6ecf307\\.system_generated\\steps\\517\\content.md', 'utf8');

c = c.substring(c.indexOf('{'));
const json = JSON.parse(c);
const home = json.data.find(d => d.symbol === 'HOME/USDT') || json.data.find(d => d.baseAsset === 'HOME');
if (home) {
  console.log('HOME data:', JSON.stringify(home, null, 2));
} else {
  console.log('HOME not found');
}

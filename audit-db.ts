import db from './src/lib/db';

const totalRows = db.prepare('SELECT COUNT(*) as count FROM funding_history').get() as any;
const lastRecord = db.prepare('SELECT timestamp FROM funding_history ORDER BY timestamp DESC LIMIT 1').get() as any;
const sampleBtc = db.prepare("SELECT DISTINCT symbol FROM funding_history WHERE symbol LIKE '%BTC%' LIMIT 5").all();

console.log(JSON.stringify({
  totalRows: totalRows.count,
  lastTimestamp: lastRecord ? new Date(lastRecord.timestamp).toISOString() : null,
  sampleBtc
}, null, 2));

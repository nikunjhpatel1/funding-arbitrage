const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'funding_history.db');
const db = new Database(dbPath);

try {
  db.exec('ALTER TABLE paper_positions ADD COLUMN long_next_funding_time INTEGER;');
  console.log('Added long_next_funding_time');
} catch(e) {
  console.log('Column long_next_funding_time may already exist', e.message);
}

try {
  db.exec('ALTER TABLE paper_positions ADD COLUMN short_next_funding_time INTEGER;');
  console.log('Added short_next_funding_time');
} catch(e) {
  console.log('Column short_next_funding_time may already exist', e.message);
}

db.close();

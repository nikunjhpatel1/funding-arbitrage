import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'funding_history.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');

// Define schema
const initSql = `
  CREATE TABLE IF NOT EXISTS funding_history (
    timestamp INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    funding_rate REAL,
    funding_interval INTEGER,
    mark_price REAL,
    volume_24h REAL,
    PRIMARY KEY (timestamp, symbol, exchange)
  );

  CREATE INDEX IF NOT EXISTS idx_funding_history_symbol_time ON funding_history(symbol, timestamp);
`;

db.exec(initSql);

export default db;

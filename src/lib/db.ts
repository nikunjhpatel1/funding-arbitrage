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
// Prevent SQLITE_BUSY errors in concurrent serverless environments
db.pragma('busy_timeout = 5000');
// Improve write performance
db.pragma('synchronous = NORMAL');
// Cache size: 8 MB
db.pragma('cache_size = -8000');

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
  CREATE INDEX IF NOT EXISTS idx_funding_history_time ON funding_history(timestamp);

  CREATE TABLE IF NOT EXISTS funding_rate_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    funding_rate REAL,
    price REAL,
    next_funding_time INTEGER,
    funding_interval_hours REAL,
    recorded_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_lookup ON funding_rate_history(symbol, exchange, recorded_at);


`;

db.exec(initSql);



// ─── Data Retention Policy ────────────────────────────────────────────────────
// Keep only the last 90 days of historical funding data.
// Called once per process startup and periodically during background refreshes.
const RETENTION_MS = 90 * 24 * 3600 * 1000; // 90 days

export function pruneOldHistory(): void {
  try {
    const cutoff = Date.now() - RETENTION_MS;
    const result = db.prepare('DELETE FROM funding_history WHERE timestamp < ?').run(cutoff);
    if (result.changes > 0) {
      console.log(`[SQLite] Pruned ${result.changes} old funding history rows (> 90 days)`);
      // Reclaim space after large deletions
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
  } catch (e) {
    console.error('[SQLite] Failed to prune old history', e);
  }
}

// Run once at startup to clean up any accumulated old data
pruneOldHistory();

export default db;

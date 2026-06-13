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

    CREATE TABLE IF NOT EXISTS paper_positions (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      capital REAL NOT NULL,
      leverage REAL NOT NULL,
      notional_per_leg REAL NOT NULL,
      entry_time INTEGER NOT NULL,
      close_time INTEGER,
      status TEXT DEFAULT 'OPEN',
      
      long_exchange TEXT NOT NULL,
      long_entry_price REAL,
      long_close_price REAL,
      long_funding REAL DEFAULT 0,
      long_fees REAL NOT NULL,
      long_realized_pnl REAL,
      long_next_funding_time INTEGER,
      long_funding_interval_hours REAL DEFAULT 8,
      long_rate_at_entry REAL,
      
      short_exchange TEXT NOT NULL,
      short_entry_price REAL,
      short_close_price REAL,
      short_funding REAL DEFAULT 0,
      short_fees REAL NOT NULL,
      short_realized_pnl REAL,
      short_next_funding_time INTEGER,
      short_funding_interval_hours REAL DEFAULT 8,
      short_rate_at_entry REAL,
      
      funding_events_count INTEGER DEFAULT 0,
      last_funding_accrual_time INTEGER
    );
`;

db.exec(initSql);

// ─── Safe column migrations ────────────────────────────────────────────────────
// Use ALTER TABLE only if the column does not yet exist (safe to re-run).
const addColumnIfMissing = (table: string, column: string, definition: string) => {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.find(c => c.name === column)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      console.log(`[SQLite] Added column ${table}.${column}`);
    }
  } catch (e) {
    console.error(`[SQLite] Failed to add ${table}.${column}:`, e);
  }
};

// close_reason: 'MANUAL' | 'LIQUIDATED'
addColumnIfMissing('paper_positions', 'close_reason', "TEXT DEFAULT 'MANUAL'");
// Granular funding tracking: separate received vs paid per leg
addColumnIfMissing('paper_positions', 'long_funding_received',  'REAL DEFAULT 0');
addColumnIfMissing('paper_positions', 'long_funding_paid',      'REAL DEFAULT 0');
addColumnIfMissing('paper_positions', 'short_funding_received', 'REAL DEFAULT 0');
addColumnIfMissing('paper_positions', 'short_funding_paid',     'REAL DEFAULT 0');

// Additional column guarantees from user request
addColumnIfMissing('paper_positions', 'long_entry_price', 'REAL');
addColumnIfMissing('paper_positions', 'short_entry_price', 'REAL');
addColumnIfMissing('paper_positions', 'long_rate_at_entry', 'REAL');
addColumnIfMissing('paper_positions', 'short_rate_at_entry', 'REAL');
addColumnIfMissing('paper_positions', 'notional_per_leg', 'REAL');
addColumnIfMissing('paper_positions', 'entry_fee', 'REAL DEFAULT 0');
addColumnIfMissing('paper_positions', 'funding_events_count', 'INTEGER DEFAULT 0');
addColumnIfMissing('paper_positions', 'long_funding_interval_hours', 'REAL DEFAULT 8');
addColumnIfMissing('paper_positions', 'short_funding_interval_hours', 'REAL DEFAULT 8');


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

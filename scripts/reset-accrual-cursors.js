#!/usr/bin/env node
/**
 * One-time migration: reset last_funding_accrual_time → entry_time for all
 * OPEN positions so the new cursor-based accrual engine backfills every missed
 * funding interval from position open to now.
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'funding_history.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Reset the cursor to entry_time so all intervals since open are re-counted
const resetResult = db
  .prepare("UPDATE paper_positions SET last_funding_accrual_time = entry_time WHERE status = 'OPEN'")
  .run();

console.log(`[Migration] Reset last_funding_accrual_time for ${resetResult.changes} open position(s) to entry_time`);

// Show current state
const positions = db
  .prepare(`SELECT id, symbol, long_exchange, short_exchange,
            entry_time, last_funding_accrual_time,
            long_funding_received, long_funding_paid,
            short_funding_received, short_funding_paid
            FROM paper_positions WHERE status = 'OPEN'`)
  .all();

if (positions.length === 0) {
  console.log('[Migration] No open positions found.');
} else {
  for (const p of positions) {
    const ageHours = ((Date.now() - p.entry_time) / 3_600_000).toFixed(1);
    console.log(`  Position: ${p.symbol} | ${p.long_exchange.toUpperCase()} long / ${p.short_exchange.toUpperCase()} short`);
    console.log(`    Age: ${ageHours}h`);
    console.log(`    Long:  rcv=$${(p.long_funding_received  || 0).toFixed(6)}  paid=$${(p.long_funding_paid  || 0).toFixed(6)}`);
    console.log(`    Short: rcv=$${(p.short_funding_received || 0).toFixed(6)}  paid=$${(p.short_funding_paid || 0).toFixed(6)}`);
    console.log(`    cursor reset to entry_time → next API call will backfill ~${ageHours}h of intervals`);
  }
}

db.close();
console.log('[Migration] Done. Restart the dev server (it should already be running) and wait for the next /api/funding-rates poll to trigger accrual.');

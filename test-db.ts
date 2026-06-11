import db from './src/lib/db';

const result = db.prepare('SELECT DISTINCT symbol FROM funding_history LIMIT 5').all();
console.log(result);

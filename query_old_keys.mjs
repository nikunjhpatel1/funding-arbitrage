import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function runQuery() {
  const { data, error } = await supabase
    .from('exchange_api_keys')
    .select('exchange, mode, is_active, created_at, updated_at');

  if (error) {
    console.error("Error executing query:", error);
  } else {
    console.table(data);
  }
}

runQuery();

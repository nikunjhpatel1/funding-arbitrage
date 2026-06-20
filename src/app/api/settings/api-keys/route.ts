import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { encrypt, decrypt } from '@/lib/encryption';
import crypto from 'crypto';

function getTableName(mode: string | null) {
  if (mode === 'demo') return 'demo_exchange_api_keys';
  if (mode === 'live') return 'live_exchange_api_keys';
  throw new Error('Invalid mode. Must be "demo" or "live"');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode');
    const tableName = getTableName(mode);

    const { data, error } = await supabase
      .from(tableName)
      .select('id, exchange, is_active, tested_at, created_at, updated_at, api_key_encrypted, secret_encrypted')
      .order('exchange');

    if (error) throw error;

    const decryptedData = data.map(row => ({
      id: row.id,
      exchange: row.exchange,
      is_active: row.is_active,
      tested_at: row.tested_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      apiKey: row.api_key_encrypted ? decrypt(row.api_key_encrypted) : '',
      secret: row.secret_encrypted ? decrypt(row.secret_encrypted) : '',
    }));

    return NextResponse.json({ success: true, data: decryptedData });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { exchange, apiKey, secret, mode } = await req.json();

    if (!exchange || !apiKey || !secret || !mode) {
      return NextResponse.json({ error: 'exchange, apiKey, secret, and mode are required' }, { status: 400 });
    }

    const tableName = getTableName(mode);
    const apiKeyEncrypted = encrypt(apiKey);
    const secretEncrypted = encrypt(secret);
    const now = Date.now();

    const { data: existing } = await supabase
      .from(tableName)
      .select('id')
      .eq('exchange', exchange)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from(tableName)
        .update({
          api_key_encrypted: apiKeyEncrypted,
          secret_encrypted: secretEncrypted,
          updated_at: now,
          tested_at: null,
        })
        .eq('exchange', exchange);

      if (error) throw error;
      return NextResponse.json({ success: true, action: 'updated' });
    }

    const { error } = await supabase
      .from(tableName)
      .insert({
        id: crypto.randomUUID(),
        exchange,
        api_key_encrypted: apiKeyEncrypted,
        secret_encrypted: secretEncrypted,
        is_active: true,
        created_at: now,
        updated_at: now,
      });

    if (error) throw error;
    return NextResponse.json({ success: true, action: 'created' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { exchange, mode } = await req.json();

    if (!exchange || !mode) {
      return NextResponse.json({ error: 'exchange and mode are required' }, { status: 400 });
    }

    const tableName = getTableName(mode);

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('exchange', exchange);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

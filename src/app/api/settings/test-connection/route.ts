import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import { USDMClient } from 'binance';
import { RestClientV5 } from 'bybit-api';
import crypto from 'crypto';

function getTableName(mode: string) {
  if (mode === 'demo') return 'demo_exchange_api_keys';
  if (mode === 'live') return 'live_exchange_api_keys';
  throw new Error('Invalid mode. Must be "demo" or "live"');
}

async function getKeys(exchange: string, mode: string): Promise<{ apiKey: string; secret: string }> {
  const tableName = getTableName(mode);
  const { data: keyRow, error } = await supabase
    .from(tableName)
    .select('api_key_encrypted, secret_encrypted')
    .eq('exchange', exchange)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !keyRow) throw new Error(`No active API keys found for ${exchange} in ${mode} mode`);
  return {
    apiKey: decrypt(keyRow.api_key_encrypted),
    secret: decrypt(keyRow.secret_encrypted),
  };
}

async function testBinance(apiKey: string, secret: string, mode: string) {
  const client = new USDMClient({
    api_key: apiKey,
    api_secret: secret,
    ...(mode === 'demo' ? { baseUrl: 'https://testnet.binancefuture.com' } : {}),
  });
  await client.getAccountInformation();
}

async function testBybit(apiKey: string, secret: string, mode: string) {
  const client = new RestClientV5({
    key: apiKey,
    secret,
    testnet: mode === 'demo',
  });

  try {
    const res = await client.getQueryApiKey();

    if (res.retCode !== 0) {
      throw new Error(res.retMsg || 'Bybit connection failed');
    }

    return true;

  } catch (error) {
    console.error('BYBIT TEST ERROR:', error);
    throw error;
  }
}

async function testDelta(apiKey: string, secret: string, mode: string) {
  const baseUrl = mode === 'demo' ? 'https://testnet-api.delta.exchange' : 'https://api.delta.exchange';
  const method = 'GET';
  const path = '/v2/wallet/balances';
  const timestamp = Date.now().toString();
  const signaturePayload = method + timestamp + path + ''; // empty query and body for GET /balances

  const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Accept': 'application/json',
      'api-key': apiKey,
      'timestamp': timestamp,
      'signature': signature
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Delta connection failed: ${res.status} ${res.statusText} - ${errorText}`);
  }

  const data = await res.json();
  if (data.success !== true) {
    throw new Error(`Delta API Error: ${JSON.stringify(data.error || data)}`);
  }
}

export async function POST(req: Request) {
  try {
    const { exchange, mode } = await req.json();
    if (!exchange || !mode) return NextResponse.json({ success: false, error: 'Missing exchange or mode' }, { status: 400 });

    const { apiKey, secret } = await getKeys(exchange, mode);

    switch (exchange) {
      case 'binance': await testBinance(apiKey, secret, mode); break;
      case 'bybit':   await testBybit(apiKey, secret, mode);   break;
      case 'delta':   await testDelta(apiKey, secret, mode);   break;
      default: return NextResponse.json({ success: false, error: `Unsupported exchange: ${exchange}` });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[test-connection] ${e.message}`);
    return NextResponse.json({ success: false, error: e.message });
  }
}

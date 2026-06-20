import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

const TABLE_NAME = 'demo_exchange_api_keys';

export async function POST(req: Request) {
  try {
    const { exchange } = await req.json();
    if (!exchange) return NextResponse.json({ error: 'exchange is required' }, { status: 400 });

    const { data: keyData, error: fetchErr } = await supabase
      .from(TABLE_NAME)
      .select('api_key_encrypted, secret_encrypted')
      .eq('exchange', exchange)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!keyData) return NextResponse.json({ error: 'Keys not found' }, { status: 404 });

    const apiKey = decrypt(keyData.api_key_encrypted);
    const secret = decrypt(keyData.secret_encrypted);

    // Test connection logic
    let isConnected = false;

    if (exchange === 'binance') {
      const timestamp = Date.now();
      const query = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', secret).update(query).digest('hex');
      
      const res = await fetch(`https://testnet.binancefuture.com/fapi/v1/account?${query}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': apiKey,
        }
      });
      const data = await res.json();
      if (data.code && data.code < 0) {
        return NextResponse.json({ success: false, error: data.msg || 'Invalid keys' });
      }
      isConnected = true;
    } else if (exchange === 'bybit') {
      const timestamp = Date.now();
      const recvWindow = 5000;
      const payload = `${timestamp}${apiKey}${recvWindow}`;
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const res = await fetch(`https://api-demo.bybit.com/v5/user/query-api`, {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp.toString(),
          'X-BAPI-SIGN': signature,
          'X-BAPI-RECV-WINDOW': recvWindow.toString(),
        }
      });
      const data = await res.json();
      if (data.retCode !== 0) {
        return NextResponse.json({ success: false, error: data.retMsg || 'Invalid keys' });
      }
      isConnected = true;
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported demo exchange' });
    }

    if (isConnected) {
      await supabase
        .from(TABLE_NAME)
        .update({ tested_at: Date.now() })
        .eq('exchange', exchange);
      
      return NextResponse.json({ success: true });
    }

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

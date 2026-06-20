import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import { RestClientV5 } from 'bybit-api';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('exchange_api_keys')
      .select('api_key_encrypted, secret_encrypted')
      .eq('exchange', 'bybit')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'No Bybit keys found in database' });
    }

    const apiKey = decrypt(data.api_key_encrypted);
    const secret = decrypt(data.secret_encrypted);

    const client = new RestClientV5({ key: apiKey, secret, testnet: true });
    const result = await client.getWalletBalance({ accountType: 'UNIFIED' });

    return NextResponse.json({ success: true, balance: result });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

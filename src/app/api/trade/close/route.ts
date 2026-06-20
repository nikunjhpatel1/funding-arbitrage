import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import { USDMClient } from 'binance';
import { RestClientV5 } from 'bybit-api';

async function logExecution(level: string, message: string, positionId?: string | null) {
  await supabase.from('execution_logs').insert({
    position_id: positionId || null,
    log_level: level,
    message: message
  }).catch(e => console.error("Failed to write to execution_logs:", e));
}

async function getBinanceKeys(): Promise<{ apiKey: string; secret: string }> {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  if (isTestnet) {
    const apiKey = process.env.BINANCE_TESTNET_API_KEY;
    const secret = process.env.BINANCE_TESTNET_SECRET;
    if (!apiKey || !secret) throw new Error('BINANCE_TESTNET_API_KEY / BINANCE_TESTNET_SECRET not set in env');
    return { apiKey, secret };
  }
  const { data, error } = await supabase
    .from('exchange_api_keys')
    .select('api_key_encrypted, secret_encrypted')
    .eq('exchange', 'binance')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error || !data) throw new Error('No API keys found for binance');
  return { apiKey: decrypt(data.api_key_encrypted), secret: decrypt(data.secret_encrypted) };
}

async function getBybitKeys(): Promise<{ apiKey: string; secret: string }> {
  const isTestnet = process.env.BYBIT_TESTNET === 'true';
  if (isTestnet) {
    const apiKey = process.env.BYBIT_API_KEY;
    const secret = process.env.BYBIT_SECRET;
    if (!apiKey || !secret) throw new Error('BYBIT_API_KEY / BYBIT_SECRET not set in env');
    return { apiKey, secret };
  }
  const { data, error } = await supabase
    .from('exchange_api_keys')
    .select('api_key_encrypted, secret_encrypted')
    .eq('exchange', 'bybit')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error || !data) throw new Error('No API keys found for bybit');
  return { apiKey: decrypt(data.api_key_encrypted), secret: decrypt(data.secret_encrypted) };
}

async function executeBinanceFuturesOrder(apiKey: string, secret: string, symbol: string, side: 'BUY' | 'SELL', quantity: number) {
  const isTestnet = process.env.BINANCE_TESTNET === 'true';
  const client = new USDMClient({
    api_key: apiKey,
    api_secret: secret,
    ...(isTestnet ? { baseUrl: 'https://testnet.binancefuture.com' } : {})
  });
  const binanceSymbol = symbol.replace('/', '');
  return await client.submitNewOrder({ symbol: binanceSymbol, side, type: 'MARKET', quantity });
}

async function executeBybitFuturesOrder(apiKey: string, secret: string, symbol: string, side: 'Buy' | 'Sell', quantity: number) {
  const isTestnet = process.env.BYBIT_TESTNET === 'true';
  const client = new RestClientV5({
    key: apiKey,
    secret,
    testnet: isTestnet,
  });
  const bybitSymbol = symbol.replace('/', '');
  return await client.submitOrder({ category: 'linear', symbol: bybitSymbol, side, orderType: 'Market', qty: quantity.toString() });
}

export async function POST(req: Request) {
  try {
    const { positionId } = await req.json();
    if (!positionId) return NextResponse.json({ error: 'Missing positionId' }, { status: 400 });

    const { data: position, error: posError } = await supabase
      .from('real_positions')
      .select('*')
      .eq('id', positionId)
      .single();

    if (posError || !position) throw new Error('Position not found');
    if (position.status !== 'OPEN') throw new Error('Position is not OPEN');

    const longExchange = position.long_exchange;
    const shortExchange = position.short_exchange;
    const symbol = position.long_symbol;
    const qty = Number(position.quantity);

    let longKeys, shortKeys;
    try {
      longKeys = longExchange === 'binance' ? await getBinanceKeys() : await getBybitKeys();
      shortKeys = shortExchange === 'binance' ? await getBinanceKeys() : await getBybitKeys();
    } catch (e: any) {
      await logExecution('ERROR', `Key decryption failed for closing: ${e.message}`, positionId);
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }

    const results: any = { longClose: null, shortClose: null, errors: [] };

    // Close Long Leg -> SELL
    try {
      if (longExchange === 'binance') {
        results.longClose = await executeBinanceFuturesOrder(longKeys.apiKey, longKeys.secret, symbol, 'SELL', qty);
      } else if (longExchange === 'bybit') {
        results.longClose = await executeBybitFuturesOrder(longKeys.apiKey, longKeys.secret, symbol, 'Sell', qty);
      }
    } catch (e: any) {
      const msg = `Close Long Leg (${longExchange}) failed: ${e.message}`;
      results.errors.push(msg);
      await logExecution('ERROR', msg, positionId);
    }

    // Close Short Leg -> BUY
    try {
      if (shortExchange === 'binance') {
        results.shortClose = await executeBinanceFuturesOrder(shortKeys.apiKey, shortKeys.secret, symbol, 'BUY', qty);
      } else if (shortExchange === 'bybit') {
        results.shortClose = await executeBybitFuturesOrder(shortKeys.apiKey, shortKeys.secret, symbol, 'Buy', qty);
      }
    } catch (e: any) {
      const msg = `Close Short Leg (${shortExchange}) failed: ${e.message}`;
      results.errors.push(msg);
      await logExecution('ERROR', msg, positionId);
    }

    if (results.errors.length > 0) {
      return NextResponse.json({ success: false, errors: results.errors }, { status: 500 });
    }

    // Update Status
    await supabase.from('real_positions').update({ status: 'CLOSED', closed_at: new Date().toISOString() }).eq('id', positionId);
    
    // Log history
    await supabase.from('real_trade_history').insert([
      {
        position_id: positionId,
        event_type: 'EXIT_LONG',
        exchange: longExchange,
        order_id: results.longClose?.orderId?.toString() || results.longClose?.result?.orderId?.toString() || null,
        quantity: qty
      },
      {
        position_id: positionId,
        event_type: 'EXIT_SHORT',
        exchange: shortExchange,
        order_id: results.shortClose?.orderId?.toString() || results.shortClose?.result?.orderId?.toString() || null,
        quantity: qty
      }
    ]).catch(e => console.error("Failed to log close history:", e));
    
    await logExecution('INFO', `Successfully closed position ${positionId}`, positionId);

    return NextResponse.json({ success: true, results });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

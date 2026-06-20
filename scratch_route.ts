import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

async function getDecryptedKeys(exchange: string, mode: string) {
  const table = mode === 'demo' ? 'demo_exchange_api_keys' : 'live_exchange_api_keys';
  const { data, error } = await supabase
    .from(table)
    .select('api_key_encrypted, secret_encrypted')
    .eq('exchange', exchange)
    .eq('is_active', true)
    .single();

  if (error || !data) throw new Error(`No ${mode} API keys found for ${exchange}`);

  return {
    apiKey: decrypt(data.api_key_encrypted),
    secret: decrypt(data.secret_encrypted),
  };
}

async function executeBinanceOrder(apiKey: string, secret: string, symbol: string, side: string, quantity: number, mode: string) {
  const binanceSymbol = symbol.replace('/', '');
  const timestamp = Date.now();
  const queryString = `symbol=${binanceSymbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
  
  const signature = crypto.createHmac('sha256', secret).update(queryString).digest('hex');
  const baseUrl = mode === 'demo' ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  
  const res = await fetch(`${baseUrl}/fapi/v1/order?${queryString}&signature=${signature}`, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  });
  
  const data = await res.json();
  if (!res.ok || data.code < 0) throw new Error(`Binance error: ${JSON.stringify(data)}`);
  return data;
}

async function executeBybitOrder(apiKey: string, secret: string, symbol: string, side: string, quantity: number, mode: string) {
  const bybitSymbol = symbol.replace('/', '');
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const body = JSON.stringify({
    category: 'linear',
    symbol: bybitSymbol,
    side,
    orderType: 'Market',
    qty: quantity.toString(),
  });
  
  const signPayload = timestamp + apiKey + recvWindow + body;
  const signature = crypto.createHmac('sha256', secret).update(signPayload).digest('hex');
  
  // Actually, Bybit uses api-testnet.bybit.com
  const baseUrl = mode === 'demo' ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';

  const res = await fetch(`${baseUrl}/v5/order/create`, {
    method: 'POST',
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-SIGN-METHOD': 'HMAC-SHA256',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json',
    },
    body,
  });
  
  const data = await res.json();
  if (data.retCode !== 0) throw new Error(`Bybit error: ${JSON.stringify(data)}`);
  return data;
}

function calculateQuantity(notionalUSD: number, price: number): number {
  if (price <= 0) throw new Error('Invalid price');
  const rawQty = notionalUSD / price;
  return Math.floor(rawQty * 1000) / 1000;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, longExchange, shortExchange, capital, leverage, longPrice, shortPrice, mode } = body;

    if (!symbol || !longExchange || !shortExchange || !capital || !leverage || !mode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (mode !== 'demo' && mode !== 'live') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }

    const supportedExchanges = ['binance', 'bybit'];
    if (!supportedExchanges.includes(longExchange) || !supportedExchanges.includes(shortExchange)) {
      return NextResponse.json({ 
        error: `Only Binance and Bybit supported. Got: ${longExchange}, ${shortExchange}` 
      }, { status: 400 });
    }

    const notionalPerLeg = Number(capital) * Number(leverage);
    const results: any = { long: null, short: null, errors: [] };

    // Execute Long leg
    try {
      const longKeys = await getDecryptedKeys(longExchange, mode);
      const longQty = calculateQuantity(notionalPerLeg, Number(longPrice));
      console.log(`[Trade] Long: ${longExchange} BUY ${longQty} ${symbol} @ ${longPrice} (${mode})`);

      if (longExchange === 'binance') {
        results.long = await executeBinanceOrder(longKeys.apiKey, longKeys.secret, symbol, 'BUY', longQty, mode);
      } else {
        results.long = await executeBybitOrder(longKeys.apiKey, longKeys.secret, symbol, 'Buy', longQty, mode);
      }
      console.log(`[Trade] Long leg success:`, results.long);
    } catch (e: any) {
      console.error(`[Trade] Long leg failed:`, e.message);
      results.errors.push(`Long leg (${longExchange}) failed: ${e.message}`);
    }

    // Execute Short leg
    try {
      const shortKeys = await getDecryptedKeys(shortExchange, mode);
      const shortQty = calculateQuantity(notionalPerLeg, Number(shortPrice));
      console.log(`[Trade] Short: ${shortExchange} SELL ${shortQty} ${symbol} @ ${shortPrice} (${mode})`);

      if (shortExchange === 'binance') {
        results.short = await executeBinanceOrder(shortKeys.apiKey, shortKeys.secret, symbol, 'SELL', shortQty, mode);
      } else {
        results.short = await executeBybitOrder(shortKeys.apiKey, shortKeys.secret, symbol, 'Sell', shortQty, mode);
      }
      console.log(`[Trade] Short leg success:`, results.short);
    } catch (e: any) {
      console.error(`[Trade] Short leg failed:`, e.message);
      results.errors.push(`Short leg (${shortExchange}) failed: ${e.message}`);
    }

    const success = results.errors.length === 0;

    if (success) {
      // Create position record since execution was successful
      const table = mode === 'demo' ? 'demo_positions' : 'live_positions';
      const id = crypto.randomUUID();
      const entryTime = Date.now();
      
      const { error: insertError } = await supabase
        .from(table)
        .insert({
          id,
          symbol,
          capital,
          leverage,
          notional_per_leg: notionalPerLeg,
          entry_time: entryTime,
          status: 'OPEN',
          long_exchange: longExchange,
          long_entry_price: longPrice,
          long_mark_price: longPrice,
          long_fill_price: longPrice, // Simplified for now since we're using Market orders
          long_fees: notionalPerLeg * 0.0005, // Approximation
          long_funding_interval_hours: 8,
          long_funding: 0,
          short_exchange: shortExchange,
          short_entry_price: shortPrice,
          short_mark_price: shortPrice,
          short_fill_price: shortPrice,
          short_fees: notionalPerLeg * 0.0005,
          short_funding_interval_hours: 8,
          short_funding: 0,
          funding_events_count: 0,
          last_funding_accrual_time: entryTime,
          trade_mode: mode
        });
        
      if (insertError) {
        console.error('Failed to insert position:', insertError);
        // We still return success: true for the execution, but log the DB error
      }
    }

    return NextResponse.json({ success, long: results.long, short: results.short, errors: results.errors });

  } catch (error: any) {
    console.error('[Trade] Fatal error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

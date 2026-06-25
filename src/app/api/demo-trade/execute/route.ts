import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';
import crypto from 'crypto';

const TABLE_NAME = 'demo_exchange_api_keys';

async function getDecryptedKeys(exchange: string) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('api_key_encrypted, secret_encrypted')
    .eq('exchange', exchange)
    .eq('is_active', true)
    .single();

  if (error || !data) throw new Error(`No testnet API keys found for ${exchange}`);

  return {
    apiKey: decrypt(data.api_key_encrypted),
    secret: decrypt(data.secret_encrypted),
  };
}

async function executeBinanceTestnetOrder(_apiKey: string, _secret: string, _symbol: string, _side: string, _quantity: number) {
  throw new Error('Binance does not support demo trading. Use Bybit Demo instead.');
}

async function executeBybitTestnetOrder(apiKey: string, secret: string, symbol: string, side: string, quantity: number) {
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
  
  const baseUrl = 'https://api-demo.bybit.com'; // HARDCODED TESTNET

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
  if (data.retCode !== 0) throw new Error(`Bybit Testnet error: ${JSON.stringify(data)}`);
  return data;
}

function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.floor(value * factor) / factor;
}

async function getBinanceQuantityPrecision(symbol: string, baseUrl: string): Promise<number> {
  const res = await fetch(`${baseUrl}/fapi/v1/exchangeInfo`);
  const data = await res.json();
  const symbolInfo = data.symbols.find((s: any) => s.symbol === symbol);
  if (!symbolInfo) return 3; // fallback
  const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');
  if (!lotSizeFilter) return 3;
  const stepSize = parseFloat(lotSizeFilter.stepSize);
  const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
  return precision;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { symbol, longExchange, shortExchange, capital, leverage, longPrice, shortPrice } = body;

    if (!symbol || !longExchange || !shortExchange || !capital || !leverage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supportedExchanges = ['bybit'];
    if (!supportedExchanges.includes(longExchange) || !supportedExchanges.includes(shortExchange)) {
      return NextResponse.json({ 
        error: `Only Bybit is supported for demo mode. Binance has no demo environment. Got: ${longExchange}, ${shortExchange}` 
      }, { status: 400 });
    }

    const notionalPerLeg = Number(capital) * Number(leverage);
    const results: any = { long: null, short: null, errors: [] };

    // Execute Long leg
    try {
      const longKeys = await getDecryptedKeys(longExchange);
      let longQty = notionalPerLeg / Number(longPrice);

      if (longExchange === 'binance') {
        const binanceSymbol = symbol.replace('/', '');
        const precision = await getBinanceQuantityPrecision(binanceSymbol, 'https://fapi.binance.com');
        longQty = roundToPrecision(longQty, precision);
        console.log(`[Demo Trade] Long: ${longExchange} BUY ${longQty} ${symbol} @ ${longPrice}`);
        results.long = await executeBinanceTestnetOrder(longKeys.apiKey, longKeys.secret, symbol, 'BUY', longQty);
      } else {
        longQty = roundToPrecision(longQty, 3); // Fallback for Bybit
        console.log(`[Demo Trade] Long: ${longExchange} BUY ${longQty} ${symbol} @ ${longPrice}`);
        results.long = await executeBybitTestnetOrder(longKeys.apiKey, longKeys.secret, symbol, 'Buy', longQty);
      }
      console.log(`[Demo Trade] Long leg success:`, results.long);
    } catch (e: any) {
      console.error(`[Demo Trade] Long leg failed:`, e.message);
      results.errors.push(`Long leg (${longExchange}) failed: ${e.message}`);
    }

    // Execute Short leg
    try {
      const shortKeys = await getDecryptedKeys(shortExchange);
      let shortQty = notionalPerLeg / Number(shortPrice);

      if (shortExchange === 'binance') {
        const binanceSymbol = symbol.replace('/', '');
        const precision = await getBinanceQuantityPrecision(binanceSymbol, 'https://fapi.binance.com');
        shortQty = roundToPrecision(shortQty, precision);
        console.log(`[Demo Trade] Short: ${shortExchange} SELL ${shortQty} ${symbol} @ ${shortPrice}`);
        results.short = await executeBinanceTestnetOrder(shortKeys.apiKey, shortKeys.secret, symbol, 'SELL', shortQty);
      } else {
        shortQty = roundToPrecision(shortQty, 3); // Fallback for Bybit
        console.log(`[Demo Trade] Short: ${shortExchange} SELL ${shortQty} ${symbol} @ ${shortPrice}`);
        results.short = await executeBybitTestnetOrder(shortKeys.apiKey, shortKeys.secret, symbol, 'Sell', shortQty);
      }
      console.log(`[Demo Trade] Short leg success:`, results.short);
    } catch (e: any) {
      console.error(`[Demo Trade] Short leg failed:`, e.message);
      results.errors.push(`Short leg (${shortExchange}) failed: ${e.message}`);
    }

    const success = results.errors.length === 0;

    return NextResponse.json({ success, long: results.long, short: results.short, errors: results.errors });

  } catch (error: any) {
    console.error('[Demo Trade] Fatal error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { supabase } from './supabase';
import { decrypt } from './encryption';
import { TradingMode } from './trading-mode';
import crypto from 'crypto';

interface ExecuteParams {
  mode: TradingMode;
  exchange: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
}

// ─── BYBIT RAW FETCH ────────────────────────────────────────────
function bybitBaseUrl(mode: TradingMode): string {
  return mode === TradingMode.DEMO
    ? 'https://api-demo.bybit.com'
    : 'https://api.bybit.com';
}

function bybitSign(secret: string, ts: number, apiKey: string, recv: number, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${ts}${apiKey}${recv}${body}`).digest('hex');
}

async function bybitPost(url: string, apiKey: string, secret: string, body: Record<string, any>): Promise<any> {
  const ts = Date.now();
  const recv = 5000;
  const bodyStr = JSON.stringify(body);
  const sign = bybitSign(secret, ts, apiKey, recv, bodyStr);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': sign,
      'X-BAPI-TIMESTAMP': ts.toString(),
      'X-BAPI-RECV-WINDOW': recv.toString(),
      'X-BAPI-SIGN-TYPE': '2',
    },
    body: bodyStr,
  });
  const json = await res.json();
  if (json.retCode !== 0) throw new Error(`Bybit error: ${json.retMsg}`);
  return json;
}

// ─── BINANCE RAW FETCH ───────────────────────────────────────────
function binanceSign(secret: string, query: string): string {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function binancePost(apiKey: string, secret: string, path: string, params: Record<string, string>): Promise<any> {
  const base = 'https://fapi.binance.com';
  const allParams = { ...params, timestamp: Date.now().toString() };
  const qs = new URLSearchParams(allParams).toString();
  const sig = binanceSign(secret, qs);
  const res = await fetch(`${base}${path}?${qs}&signature=${sig}`, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  const json = await res.json();
  if (json.code && Number(json.code) < 0) throw new Error(`Binance error: ${json.msg}`);
  return json;
}

async function binanceGet(apiKey: string, secret: string, path: string, params: Record<string, string>): Promise<any> {
  const base = 'https://fapi.binance.com';
  const allParams = { ...params, timestamp: Date.now().toString() };
  const qs = new URLSearchParams(allParams).toString();
  const sig = binanceSign(secret, qs);
  const res = await fetch(`${base}${path}?${qs}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  return res.json();
}

// ─── MAIN CLASS ──────────────────────────────────────────────────
export class ExecutionEngine {

  static async executeTrade(params: ExecuteParams) {
    const { mode, exchange, symbol, side, quantity } = params;

    if (mode === TradingMode.PAPER) {
      return this.executePaperTrade(exchange, symbol, side, quantity);
    }

    // Block Binance in DEMO mode — Binance has no real demo environment
    if (mode === TradingMode.DEMO && exchange === 'binance') {
      throw new Error(
        'Binance does not support real demo trading. Please use Bybit Demo (api-demo.bybit.com) instead.'
      );
    }

    const isLive = mode === TradingMode.LIVE;
    if (isLive && quantity <= 0) throw new Error('Quantity must be greater than 0 for live trading.');

    const keyTableName = isLive ? 'live_exchange_api_keys' : 'demo_exchange_api_keys';

    const { data: keyRow, error } = await supabase
      .from(keyTableName)
      .select('api_key_encrypted, secret_encrypted')
      .eq('exchange', exchange)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !keyRow) {
      throw new Error(`No active ${mode} API keys found for ${exchange}. Please add them in Settings → ${isLive ? 'Live' : 'Demo'} APIs.`);
    }

    const apiKey = decrypt(keyRow.api_key_encrypted);
    const secret = decrypt(keyRow.secret_encrypted);
    const cleanSymbol = symbol.replace('/', '');
    let currentPrice = 0;

    // ─── BYBIT ───────────────────────────────────────────────────
    if (exchange === 'bybit') {
      const base = bybitBaseUrl(mode);

      await bybitPost(`${base}/v5/order/create`, apiKey, secret, {
        category: 'linear',
        symbol: cleanSymbol,
        side,
        orderType: 'Market',
        qty: quantity.toString(),
      });

      const tickerRes = await fetch(`${base}/v5/market/tickers?category=linear&symbol=${cleanSymbol}`);
      const tickerJson = await tickerRes.json();
      currentPrice = parseFloat(tickerJson?.result?.list?.[0]?.markPrice ?? '0');

    // ─── BINANCE (Live only) ──────────────────────────────────────
    } else if (exchange === 'binance') {
      await binancePost(apiKey, secret, '/fapi/v1/order', {
        symbol: cleanSymbol,
        side: side.toUpperCase(),
        type: 'MARKET',
        quantity: quantity.toString(),
      });

      const priceData = await binanceGet(apiKey, secret, '/fapi/v1/premiumIndex', { symbol: cleanSymbol });
      currentPrice = parseFloat(priceData.markPrice ?? '0');

    } else {
      throw new Error(`Exchange "${exchange}" is not supported yet.`);
    }

    // ─── WRITE TO DATABASE ────────────────────────────────────────
    const prefix = isLive ? 'live' : 'demo';
    const positionId = crypto.randomUUID();
    const now = Date.now();

    const { error: posError } = await supabase.from(`${prefix}_positions`).insert({
      id: positionId,
      exchange,
      symbol,
      side,
      quantity,
      entry_price: currentPrice,
      current_price: currentPrice,
      unrealized_pnl: 0,
      realized_pnl: 0,
      status: 'OPEN',
      opened_at: now,
    });
    if (posError) throw posError;

    await supabase.from(`${prefix}_trade_history`).insert({
      id: crypto.randomUUID(),
      position_id: positionId,
      exchange, symbol, side, quantity,
      price: currentPrice,
      event_type: 'ORDER_FILLED',
      created_at: now,
    });

    await supabase.from(`${prefix}_execution_logs`).insert({
      id: crypto.randomUUID(),
      position_id: positionId,
      log_level: 'INFO',
      message: `[${mode.toUpperCase()}] ${side} ${quantity} ${symbol} @ $${currentPrice} on ${exchange}`,
      created_at: now,
    });

    return { success: true, positionId, currentPrice };
  }

  private static async executePaperTrade(
    exchange: string, symbol: string, side: 'Buy' | 'Sell', quantity: number
  ) {
    return { success: true, message: 'Paper trade recorded' };
  }
}

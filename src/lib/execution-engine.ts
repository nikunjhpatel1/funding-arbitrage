import { supabase } from './supabase';
import { decrypt } from './encryption';
import { TradingMode } from './trading-mode';
import crypto from 'crypto';
import { USDMClient } from 'binance';
import { RestClientV5 } from 'bybit-api';

interface ExecuteParams {
  mode: TradingMode;
  exchange: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
}

export class ExecutionEngine {
  
  static async executeTrade(params: ExecuteParams) {
    const { mode, exchange, symbol, side, quantity } = params;

    // 1. PAPER MODE (Simulation)
    if (mode === TradingMode.PAPER) {
      return this.executePaperTrade(exchange, symbol, side, quantity);
    }

    // 2. LIVE / DEMO MODE
    const isLive = mode === TradingMode.LIVE;
    const keyTableName = isLive ? 'live_exchange_api_keys' : 'demo_exchange_api_keys';
    
    // Safety check for Live
    if (isLive) {
      if (quantity <= 0) throw new Error('Quantity must be greater than 0');
      // Additional capital / position checks would go here.
    }

    // Fetch API keys
    const { data: keyRow, error } = await supabase
      .from(keyTableName)
      .select('api_key_encrypted, secret_encrypted')
      .eq('exchange', exchange)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !keyRow) {
      throw new Error(`No active ${mode} API keys found for ${exchange}`);
    }

    const apiKey = decrypt(keyRow.api_key_encrypted);
    const secret = decrypt(keyRow.secret_encrypted);

    // Connect & Execute
    let currentPrice = 0;
    
    if (exchange === 'binance') {
      const client = new USDMClient({
        api_key: apiKey,
        api_secret: secret,
        ...(mode === TradingMode.DEMO ? { baseUrl: 'https://testnet.binancefuture.com' } : {}),
      });
      // Place order
      const order = await client.submitNewOrder({
        symbol: symbol.replace('/', ''),
        side: side.toUpperCase() as 'BUY' | 'SELL',
        type: 'MARKET',
        quantity: quantity,
      });
      
      // Get execution price (fallback to simple ticker if not instantly filled in market order response)
      // Usually averagePrice is in the response for MARKET orders if filled.
      currentPrice = parseFloat(order.avgPrice || '0');
      if (currentPrice === 0) {
        const ticker = await client.getMarkPrice({ symbol: symbol.replace('/', '') });
        currentPrice = parseFloat(ticker.markPrice as string);
      }
    } else if (exchange === 'bybit') {
      const client = new RestClientV5({
        key: apiKey,
        secret,
        testnet: mode === TradingMode.DEMO,
      });
      const res = await client.submitOrder({
        category: 'linear',
        symbol: symbol.replace('/', ''),
        side: side,
        orderType: 'Market',
        qty: quantity.toString(),
      });
      if (res.retCode !== 0) throw new Error(res.retMsg);
      
      const ticker = await client.getTickers({ category: 'linear', symbol: symbol.replace('/', '') });
      currentPrice = parseFloat(ticker.result.list[0].markPrice);
    } else {
      throw new Error(`Exchange ${exchange} execution not implemented yet`);
    }

    // Write to Database
    const positionTableName = isLive ? 'live_positions' : 'demo_positions';
    const historyTableName = isLive ? 'live_trade_history' : 'demo_trade_history';
    const logTableName = isLive ? 'live_execution_logs' : 'demo_execution_logs';
    
    const positionId = crypto.randomUUID();
    const now = Date.now();

    const { error: posError } = await supabase.from(positionTableName).insert({
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
      opened_at: now
    });
    if (posError) throw posError;

    await supabase.from(historyTableName).insert({
      id: crypto.randomUUID(),
      position_id: positionId,
      exchange,
      symbol,
      side,
      quantity,
      price: currentPrice,
      event_type: 'ORDER_FILLED',
      created_at: now
    });

    await supabase.from(logTableName).insert({
      id: crypto.randomUUID(),
      position_id: positionId,
      log_level: 'INFO',
      message: `Executed ${side} ${quantity} ${symbol} @ ${currentPrice}`,
      created_at: now
    });

    return { success: true, positionId, currentPrice };
  }

  private static async executePaperTrade(exchange: string, symbol: string, side: 'Buy' | 'Sell', quantity: number) {
    // For paper trading, fetch mock current price and insert
    // (This normally goes to a different table, but keeping it concise here)
    return { success: true, message: 'Paper trade executed' };
  }
}

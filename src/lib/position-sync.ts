import { supabase } from './supabase';
import { decrypt } from './encryption';
import { RestClientV5 } from 'bybit-api';
import { TradingMode } from './trading-mode';

async function bybitDemoGet(apiKey: string, secret: string, path: string): Promise<any> {
  const timestamp = Date.now();
  const recvWindow = 5000;
  const payload = '';
  const signStr = `${timestamp}${apiKey}${recvWindow}${payload}`;
  const sign = (await import('crypto')).createHmac('sha256', secret).update(signStr).digest('hex');
  const res = await fetch(`https://api-demo.bybit.com${path}`, {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-TIMESTAMP': String(timestamp),
      'X-BAPI-SIGN': sign,
      'X-BAPI-RECV-WINDOW': String(recvWindow),
    },
  });
  return res.json();
}

export class PositionSync {
  
  static async syncDemoPositions() {
    await this.syncPositions(TradingMode.DEMO);
  }

  static async syncLivePositions() {
    await this.syncPositions(TradingMode.LIVE);
  }

  private static async syncPositions(mode: TradingMode) {
    if (mode === TradingMode.PAPER) return;

    const isLive = mode === TradingMode.LIVE;
    const keyTableName = isLive ? 'live_exchange_api_keys' : 'demo_exchange_api_keys';
    const positionTableName = isLive ? 'live_positions' : 'demo_positions';

    // 1. Fetch active keys
    const { data: keys, error: keysError } = await supabase
      .from(keyTableName)
      .select('exchange, api_key_encrypted, secret_encrypted')
      .eq('is_active', true);
      
    if (keysError || !keys) return;

    // 2. Fetch open positions from DB
    const { data: openPositions, error: posError } = await supabase
      .from(positionTableName)
      .select('*')
      .eq('status', 'OPEN');
      
    if (posError || !openPositions || openPositions.length === 0) return;

    // Group DB positions by exchange
    const positionsByExchange = openPositions.reduce((acc: any, pos: any) => {
      acc[pos.exchange] = acc[pos.exchange] || [];
      acc[pos.exchange].push(pos);
      return acc;
    }, {});

    // Sync exchange by exchange
    for (const key of keys) {
      const exchangePositions = positionsByExchange[key.exchange];
      if (!exchangePositions || exchangePositions.length === 0) continue;

      const apiKey = decrypt(key.api_key_encrypted);
      const secret = decrypt(key.secret_encrypted);

      try {
        if (key.exchange === 'binance') {
          if (mode === TradingMode.DEMO) {
            console.warn('[PositionSync] Binance has no demo environment — skipping demo sync for Binance.');
            continue;
          }
          // Live Binance: raw fetch + HMAC
          const crypto = await import('crypto');
          const ts = Date.now();
          const recvWindow = 5000;
          const query = `timestamp=${ts}&recvWindow=${recvWindow}`;
          const sig = crypto.createHmac('sha256', secret).update(query).digest('hex');
          const res = await fetch(
            `https://fapi.binance.com/fapi/v2/account?${query}&signature=${sig}`,
            { headers: { 'X-MBX-APIKEY': apiKey } }
          );
          const accInfo = await res.json();
          if (!accInfo.positions) continue;
          const activePos = accInfo.positions.filter((p: any) => parseFloat(String(p.positionAmt)) !== 0);

          for (const dbPos of exchangePositions) {
            const sym = dbPos.symbol.replace('/', '');
            const remotePos = activePos.find((p: any) => p.symbol === sym);
            if (remotePos) {
              await supabase.from(positionTableName).update({
                unrealized_pnl: parseFloat(String(remotePos.unrealizedProfit)),
                current_price: parseFloat(String(remotePos.entryPrice)),
              }).eq('id', dbPos.id);
            } else {
              await supabase.from(positionTableName).update({
                status: 'CLOSED',
                closed_at: Date.now(),
              }).eq('id', dbPos.id);
            }
          }

        } else if (key.exchange === 'bybit') {
          if (mode === TradingMode.DEMO) {
            // Bybit demo — use api-demo.bybit.com via raw fetch
            const posData = await bybitDemoGet(apiKey, secret, '/v5/position/list?category=linear&settleCoin=USDT');
            if (posData.retCode !== 0) continue;
            const activePos = (posData.result?.list || []).filter((p: any) => parseFloat(p.size) > 0);

            for (const dbPos of exchangePositions) {
              const sym = dbPos.symbol.replace('/', '');
              const remotePos = activePos.find((p: any) => p.symbol === sym);
              if (remotePos) {
                await supabase.from(positionTableName).update({
                  unrealized_pnl: parseFloat(String(remotePos.unrealisedPnl)),
                  current_price: parseFloat(String(remotePos.markPrice)),
                }).eq('id', dbPos.id);
              } else {
                await supabase.from(positionTableName).update({
                  status: 'CLOSED',
                  closed_at: Date.now(),
                }).eq('id', dbPos.id);
              }
            }
          } else {
            // Bybit live — use RestClientV5 (no testnet flag)
            const client = new RestClientV5({ key: apiKey, secret });
            const posInfo = await client.getPositionInfo({ category: 'linear', settleCoin: 'USDT' });
            const activePos = posInfo.result.list.filter(p => parseFloat(p.size) > 0);

            for (const dbPos of exchangePositions) {
              const sym = dbPos.symbol.replace('/', '');
              const remotePos = activePos.find(p => p.symbol === sym);
              if (remotePos) {
                await supabase.from(positionTableName).update({
                  unrealized_pnl: parseFloat(String(remotePos.unrealisedPnl)),
                  current_price: parseFloat(String(remotePos.markPrice)),
                }).eq('id', dbPos.id);
              } else {
                await supabase.from(positionTableName).update({
                  status: 'CLOSED',
                  closed_at: Date.now(),
                }).eq('id', dbPos.id);
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error syncing positions for ${key.exchange} in ${mode} mode:`, err);
      }
    }
  }
}

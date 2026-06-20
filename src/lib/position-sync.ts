import { supabase } from './supabase';
import { decrypt } from './encryption';
import { USDMClient } from 'binance';
import { RestClientV5 } from 'bybit-api';
import { TradingMode } from './trading-mode';

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
          const client = new USDMClient({
            api_key: apiKey,
            api_secret: secret,
            ...(mode === TradingMode.DEMO ? { baseUrl: 'https://testnet.binancefuture.com' } : {}),
          });
          
          const accInfo = await client.getAccountInformation();
          const activePos = accInfo.positions.filter(p => parseFloat(p.positionAmt) !== 0);

          for (const dbPos of exchangePositions) {
            const sym = dbPos.symbol.replace('/', '');
            const remotePos = activePos.find(p => p.symbol === sym);
            
            if (remotePos) {
              await supabase.from(positionTableName).update({
                unrealized_pnl: parseFloat(remotePos.unrealizedProfit),
                current_price: parseFloat(remotePos.entryPrice), // or Mark price
              }).eq('id', dbPos.id);
            } else {
              // Position closed on exchange directly
              await supabase.from(positionTableName).update({
                status: 'CLOSED',
                closed_at: Date.now()
              }).eq('id', dbPos.id);
            }
          }

        } else if (key.exchange === 'bybit') {
          const client = new RestClientV5({
            key: apiKey,
            secret,
            testnet: mode === TradingMode.DEMO,
          });

          const posInfo = await client.getPositionInfo({ category: 'linear', settleCoin: 'USDT' });
          const activePos = posInfo.result.list.filter(p => parseFloat(p.size) > 0);

          for (const dbPos of exchangePositions) {
            const sym = dbPos.symbol.replace('/', '');
            const remotePos = activePos.find(p => p.symbol === sym);

            if (remotePos) {
              await supabase.from(positionTableName).update({
                unrealized_pnl: parseFloat(remotePos.unrealisedPnl),
                current_price: parseFloat(remotePos.markPrice),
              }).eq('id', dbPos.id);
            } else {
              await supabase.from(positionTableName).update({
                status: 'CLOSED',
                closed_at: Date.now()
              }).eq('id', dbPos.id);
            }
          }
        }
      } catch (err) {
        console.error(`Error syncing positions for ${key.exchange} in ${mode} mode:`, err);
      }
    }
  }
}

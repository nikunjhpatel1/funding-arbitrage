import { EventEmitter } from 'events';
import { io as ioV4, Socket as SocketV4 } from 'socket.io-client-v4';

export type ExchangeName = 'binance' | 'bitget' | 'delta' | 'coinswitch' | string;

export interface UnifiedPrice {
  symbol: string;      // e.g. BTCUSDT
  exchange: ExchangeName;
  markPrice?: number;
  bid?: number;
  ask?: number;
  bids?: [number, number][]; // [price, size_in_base_asset]
  asks?: [number, number][]; // [price, size_in_base_asset]
  timestamp: number;
  fundingRate?: number;
  nextFunding?: string;
}

export interface WsStatus {
  exchange: ExchangeName;
  status: 'Connected' | 'Reconnecting' | 'Disconnected';
  lastUpdate: number;
  latencyMs: number;
  reconnectCount: number;
}

// Get symbols from environment or fallback
const getSymbols = (): string[] => {
  const envSymbols = process.env.STREAM_SYMBOLS;
  if (envSymbols) {
    return envSymbols.split(',').map(s => s.trim().toUpperCase());
  }
  return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
};

abstract class ExchangeAdapter {
  protected ws: WebSocket | null = null;
  protected pingInterval: NodeJS.Timeout | null = null;
  
  constructor(
    public readonly name: ExchangeName,
    public symbols: string[],
    protected manager: WebSocketManager
  ) {}

  abstract connect(): void;
  
  protected disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      this.ws.close();
      this.ws = null;
    }
  }

  protected updatePrice(symbol: string, updates: Partial<UnifiedPrice>, timestamp: number) {

    this.manager.updatePrice(this.name, symbol, updates, timestamp);
  }

  protected updateStatus(status: WsStatus['status'], reconnectCount?: number) {
    this.manager.updateStatus(this.name, { status, reconnectCount });
  }

  private reconnectTimer: NodeJS.Timeout | null = null;

  protected triggerReconnect() {
    console.log(`[WS] ${this.name} disconnected, reconnecting...`);
    this.disconnect();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = this.manager.reconnect(this.name, () => {
      this.reconnectTimer = null;
      this.connect();
    });
  }
}

class BinanceAdapter extends ExchangeAdapter {
  connect() {
    try {
      const streams = ['!markPrice@arr@1s'];
      this.symbols.forEach(s => {
        streams.push(`${s.toLowerCase()}@depth20@100ms`);
      });
      const streamsParam = streams.join('/');
      this.ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${streamsParam}`);

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data.toString());
          const streamName = rawData.stream;
          const data = rawData.data;

          if (!data) return;

          if (streamName === '!markPrice@arr@1s' && Array.isArray(data)) {
            for (const item of data) {
              const symbol = item.s;
              if (this.symbols.includes(symbol)) {
                const updates: Partial<UnifiedPrice> = {};
                if (item.p) updates.markPrice = parseFloat(item.p);
                if (item.r) updates.fundingRate = parseFloat(item.r);
                if (item.T) updates.nextFunding = new Date(item.T).toISOString();
                this.updatePrice(symbol, updates, item.E || Date.now());
              }
            }
          } else if (streamName && streamName.includes('@depth')) {
            const symbol = data.s || streamName.split('@')[0].toUpperCase();
            if (!symbol) return;
            const bids = (data.b || []).slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
            const asks = (data.a || []).slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
            const updates: Partial<UnifiedPrice> = { bids, asks };
            if (bids.length > 0) updates.bid = bids[0][0];
            if (asks.length > 0) updates.ask = asks[0][0];
            this.updatePrice(symbol, updates, data.E || Date.now());
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class BitgetAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://ws.bitget.com/v2/ws/public');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        const args = this.symbols.map(s => ({
          instType: 'USDT-FUTURES',
          channel: 'ticker',
          instId: s
        })).concat(this.symbols.map(s => ({
          instType: 'USDT-FUTURES',
          channel: 'books15',
          instId: s
        })));
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 'subscribe', args }));
        }

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('ping');
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        const msg = event.data.toString();
        if (msg === 'pong') return;

        try {
          const data = JSON.parse(msg);
          if (data.data && data.data.length > 0) {
            for (const item of data.data) {
              const updates: Partial<UnifiedPrice> = {};
              const channel = data.arg?.channel;

              if (channel === 'books15') {
                // Orderbook channel — bids/asks only
                if (item.bids && item.bids.length > 0) {
                  updates.bids = item.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                  updates.bid = updates.bids[0][0];
                }
                if (item.asks && item.asks.length > 0) {
                  updates.asks = item.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                  updates.ask = updates.asks[0][0];
                }
              } else {
                // Ticker channel — full snapshot including bid/ask/funding
                if (item.markPrice) updates.markPrice = parseFloat(item.markPrice);
                if (item.bidPr) updates.bid = parseFloat(item.bidPr);
                if (item.askPr) updates.ask = parseFloat(item.askPr);
                if (item.fundingRate) {
                  updates.fundingRate = parseFloat(item.fundingRate);

                }
                if (item.nextFundingTime) updates.nextFunding = new Date(parseInt(item.nextFundingTime)).toISOString();
              }

              if (Object.keys(updates).length > 0) {
                this.updatePrice(item.instId || data.arg?.instId, updates, item.ts ? parseInt(item.ts, 10) : Date.now());
              }
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class DeltaAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://socket.delta.exchange');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'subscribe',
            payload: {
              channels: [
                {
                  name: 'v2/ticker',
                  symbols: this.symbols
                },
                {
                  name: 'l2_orderbook',
                  symbols: this.symbols
                }
              ]
            }
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          const updates: Partial<UnifiedPrice> = {};
          
          if (data.type === 'v2/ticker') {
            if (data.mark_price) updates.markPrice = parseFloat(data.mark_price);
            if (data.best_bid) updates.bid = parseFloat(data.best_bid);
            if (data.best_ask) updates.ask = parseFloat(data.best_ask);
            if (data.funding_rate) {
              updates.fundingRate = parseFloat(data.funding_rate);

            }
            if (data.next_funding_at) updates.nextFunding = data.next_funding_at;
          } else if (data.type === 'l2_orderbook') {
            if (data.buy && data.buy.length > 0) {
              updates.bids = data.buy.slice(0, 5).map((x: any) => [parseFloat(x.limit_price), parseFloat(x.size)]) as [number, number][];
              updates.bid = updates.bids[0][0];
            }
            if (data.sell && data.sell.length > 0) {
              updates.asks = data.sell.slice(0, 5).map((x: any) => [parseFloat(x.limit_price), parseFloat(x.size)]) as [number, number][];
              updates.ask = updates.asks[0][0];
            }
          }
          
          if (Object.keys(updates).length > 0 && data.symbol) {
            this.updatePrice(data.symbol, updates, data.timestamp ? data.timestamp / 1000 : Date.now());
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class OkxAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        const args = this.symbols.flatMap(s => {
          const instId = s.replace('USDT', '-USDT-SWAP');
          return [
            { channel: 'mark-price', instId },
            { channel: 'books5', instId },
            { channel: 'funding-rate', instId },
          ];
        });
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 'subscribe', args }));
        }

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('ping');
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        const msg = event.data.toString();
        if (msg === 'pong') return;

        try {
          const data = JSON.parse(msg);
          if (data.data && data.data.length > 0 && data.arg) {
            const instId = data.arg.instId as string;
            const symbol = instId.replace('-USDT-SWAP', 'USDT');
            for (const item of data.data) {
              const updates: Partial<UnifiedPrice> = {};
              if (data.arg.channel === 'mark-price' && item.markPx) {
                updates.markPrice = parseFloat(item.markPx);
              } else if (data.arg.channel === 'funding-rate') {
                if (item.fundingRate) updates.fundingRate = parseFloat(item.fundingRate);
                if (item.nextFundingTime) updates.nextFunding = new Date(parseInt(item.nextFundingTime)).toISOString();
              } else if (data.arg.channel === 'books5') {
                if (item.bids && item.bids.length > 0) {
                  updates.bids = item.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                  updates.bid = updates.bids[0][0];
                }
                if (item.asks && item.asks.length > 0) {
                  updates.asks = item.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                  updates.ask = updates.asks[0][0];
                }
              }
              if (Object.keys(updates).length > 0) {
                this.updatePrice(symbol, updates, item.ts ? parseInt(item.ts, 10) : Date.now());
              }
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class BybitAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            const args = this.symbols.flatMap(s => [
              `tickers.${s}`,
              `orderbook.50.${s}`,
            ]);
            this.ws.send(JSON.stringify({ op: 'subscribe', args }));
          }
        }, 100);

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ op: 'ping' }));
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.op === 'pong' || data.op === 'ping') return;

          if (data.topic && data.data) {
            const updates: Partial<UnifiedPrice> = {};
            let symbol = '';

            if (data.topic.startsWith('tickers.')) {
              symbol = data.topic.replace('tickers.', '');
              if (data.data.markPrice) updates.markPrice = parseFloat(data.data.markPrice);
              if (data.data.bid1Price) updates.bid = parseFloat(data.data.bid1Price);
              if (data.data.ask1Price) updates.ask = parseFloat(data.data.ask1Price);
              // fundingRate is present in the initial snapshot (type='snapshot') and occasionally in delta updates
              if (data.data.fundingRate !== undefined && data.data.fundingRate !== '') {
                updates.fundingRate = parseFloat(data.data.fundingRate);

              }
              if (data.data.nextFundingTime) updates.nextFunding = new Date(parseInt(data.data.nextFundingTime)).toISOString();
            } else if (data.topic.startsWith('orderbook.')) {
              symbol = data.topic.split('.').pop() as string;
              const d = data.data;
              if (d.b && d.b.length > 0) {
                updates.bids = d.b.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                updates.bid = updates.bids[0][0];
              }
              if (d.a && d.a.length > 0) {
                updates.asks = d.a.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                updates.ask = updates.asks[0][0];
              }
            }

            if (symbol && Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, data.ts || Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = (err) => {
        console.log('[WS] Bybit error:', err);
        this.ws?.close();
      };
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class KucoinAdapter extends ExchangeAdapter {
  async connect() {
    try {
      const tokenRes = await fetch('https://api-futures.kucoin.com/api/v1/bullet-public', { method: 'POST' });
      const tokenData = await tokenRes.json();
      const token = tokenData?.data?.token;
      const endpoint = tokenData?.data?.instanceServers?.[0]?.endpoint;
      console.log('[WS] KuCoin token fetched:', token ? 'success' : 'failed', 'endpoint:', endpoint);
      if (!token || !endpoint) throw new Error('Failed to get KuCoin token');

      this.ws = new WebSocket(`${endpoint}?token=${token}`);

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.symbols.forEach(s => {
              const kucoinSymbol = s.replace('USDT', 'USDTM');
              this.ws?.send(JSON.stringify({
                id: Date.now(),
                type: 'subscribe',
                topic: `/contractMarket/tickerV2:${kucoinSymbol}`,
                privateChannel: false,
                response: true,
              }));
              this.ws?.send(JSON.stringify({
                id: Date.now() + 1,
                type: 'subscribe',
                topic: `/contractMarket/level2Depth5:${kucoinSymbol}`,
                privateChannel: false,
                response: true,
              }));
              // Dedicated instrument topic for funding rate and mark price
              this.ws?.send(JSON.stringify({
                id: Date.now() + 2,
                type: 'subscribe',
                topic: `/contract/instrument:${kucoinSymbol}`,
                privateChannel: false,
                response: true,
              }));
            });
          }
        }, 100);

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.type !== 'message' || !data.data) return;

          const updates: Partial<UnifiedPrice> = {};
          const symbol = (data.topic?.split(':')[1] || '').replace('USDTM', 'USDT');

          if (data.subject === 'tickerV2') {
            if (data.data.bestBidPrice) updates.bid = parseFloat(data.data.bestBidPrice);
            if (data.data.bestAskPrice) updates.ask = parseFloat(data.data.bestAskPrice);
          } else if (data.subject === 'level2') {
            if (data.data.bids && data.data.bids.length > 0) {
              updates.bids = data.data.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
            }
            if (data.data.asks && data.data.asks.length > 0) {
              updates.asks = data.data.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
            }
          } else if (data.subject === 'mark.index.price') {
            // /contract/instrument:{symbol} topic
            if (data.data.fundingRate !== undefined) {
              updates.fundingRate = parseFloat(data.data.fundingRate);
            }
            if (data.data.markPrice !== undefined) {
              updates.markPrice = parseFloat(data.data.markPrice);
            }
          } else if (data.subject === 'funding.rate') {

            if (data.data.fundingRate !== undefined) {
              updates.fundingRate = parseFloat(data.data.fundingRate);

            }
          }

          if (symbol && Object.keys(updates).length > 0) {
            const rawTs = data.data.ts || data.data.timePoint || Date.now();
            const timestamp = rawTs > 1e15 ? Math.floor(rawTs / 1000000) : rawTs;
            this.updatePrice(symbol, updates, timestamp);
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      console.log('[WS] KuCoin connection error:', e);
      this.triggerReconnect();
    }
  }
}

class BingxAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://open-api-ws.bingx.com/swap-market');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.symbols.forEach(s => {
              const bingxSymbol = s.replace('USDT', '-USDT');
              this.ws?.send(JSON.stringify({
                id: Date.now().toString(),
                reqType: 'sub',
                dataType: `${bingxSymbol}@markPrice`,
              }));
              this.ws?.send(JSON.stringify({
                id: (Date.now() + 1).toString(),
                reqType: 'sub',
                dataType: `${bingxSymbol}@depth20`,
              }));
            });
          }
        }, 100);
      };

      this.ws.onmessage = async (event) => {
        try {
          let raw = event.data;
          // BingX sends gzip-compressed binary frames in browsers this needs decompression,
          // but in Node.js ws library it may already be a Buffer/string. Try plain parse first.
          let text: string;
          if (typeof raw === 'string') {
            text = raw;
          } else {
            text = raw.toString();
          }

          if (text === 'Ping') {
            this.ws?.send('Pong');
            return;
          }

          const data = JSON.parse(text);
          if (data.dataType && data.data) {
            const symbol = (data.dataType.split('@')[0] || '').replace('-USDT', 'USDT');
            const updates: Partial<UnifiedPrice> = {};

            if (data.dataType.includes('markPrice') && data.data.markPrice) {
              updates.markPrice = parseFloat(data.data.markPrice);
            } else if (data.dataType.includes('depth')) {
              if (data.data.bids && data.data.bids.length > 0) {
                updates.bids = data.data.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                updates.bid = updates.bids[0][0];
              }
              if (data.data.asks && data.data.asks.length > 0) {
                updates.asks = data.data.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                updates.ask = updates.asks[0][0];
              }
            }

            if (symbol && Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class BitmexAdapter extends ExchangeAdapter {
  private symbolMap(s: string): string {
    return s.replace('BTCUSDT', 'XBTUSD').replace('USDT', 'USD');
  }
  private reverseSymbolMap(s: string): string {
    return s.replace('XBTUSD', 'BTCUSDT').replace(/USD$/, 'USDT');
  }

  connect() {
    try {
      this.ws = new WebSocket('wss://ws.bitmex.com/realtime');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        const args = this.symbols.flatMap(s => {
          const bitmexSymbol = this.symbolMap(s);
          return [`instrument:${bitmexSymbol}`, `orderBook10:${bitmexSymbol}`];
        });
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 'subscribe', args }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.table === 'instrument' && data.data && data.data.length > 0) {
            for (const item of data.data) {
              const updates: Partial<UnifiedPrice> = {};
              if (item.markPrice) updates.markPrice = item.markPrice;
              if (item.bidPrice) updates.bid = item.bidPrice;
              if (item.askPrice) updates.ask = item.askPrice;
              if (Object.keys(updates).length > 0 && item.symbol) {
                const symbol = this.reverseSymbolMap(item.symbol);
                this.updatePrice(symbol, updates, Date.now());
              }
            }
          } else if (data.table === 'orderBook10' && data.data && data.data.length > 0) {
            for (const item of data.data) {
              const updates: Partial<UnifiedPrice> = {};
              if (item.bids && item.bids.length > 0) {
                updates.bids = item.bids.slice(0, 5).map((x: any) => [x[0], x[1]]) as [number, number][];
                updates.bid = updates.bids[0][0];
              }
              if (item.asks && item.asks.length > 0) {
                updates.asks = item.asks.slice(0, 5).map((x: any) => [x[0], x[1]]) as [number, number][];
                updates.ask = updates.asks[0][0];
              }
              if (Object.keys(updates).length > 0 && item.symbol) {
                const symbol = this.reverseSymbolMap(item.symbol);
                this.updatePrice(symbol, updates, Date.now());
              }
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class PhemexAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://vapi.phemex.com/ws');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.symbols.forEach((s, idx) => {
              const phemexSymbol = s;
              this.ws?.send(JSON.stringify({
                id: idx + 1,
                method: 'tick_p.subscribe',
                params: [phemexSymbol],
              }));
              this.ws?.send(JSON.stringify({
                id: idx + 1000,
                method: 'orderbook_p.subscribe',
                params: [phemexSymbol],
              }));
            });
          }
        }, 100);

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ id: 9999, method: 'server.ping', params: [] }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());

          if (data.tick_p && data.symbol) {
            const symbol = data.symbol;
            const updates: Partial<UnifiedPrice> = {};
            if (data.tick_p.markPriceRp) updates.markPrice = parseFloat(data.tick_p.markPriceRp);
            if (data.tick_p.bidRp) updates.bid = parseFloat(data.tick_p.bidRp);
            if (data.tick_p.askRp) updates.ask = parseFloat(data.tick_p.askRp);
            if (data.tick_p.fundingRateRp) updates.fundingRate = parseFloat(data.tick_p.fundingRateRp) / 1e8;
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, Date.now());
            }
          } else if (data.orderbook_p && data.symbol) {
            const symbol = data.symbol;
            const ob = data.orderbook_p;
            const updates: Partial<UnifiedPrice> = {};
            if (ob.bidsRp && ob.bidsRp.length > 0) {
              updates.bids = ob.bidsRp.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
              updates.bid = updates.bids[0][0];
            }
            if (ob.asksRp && ob.asksRp.length > 0) {
              updates.asks = ob.asksRp.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
              updates.ask = updates.asks[0][0];
            }
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class GateioAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://fx-ws.gateio.ws/v4/ws/usdt');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        const payload = this.symbols.map(s => s.replace('USDT', '_USDT'));
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            time: Math.floor(Date.now() / 1000),
            channel: 'futures.tickers',
            event: 'subscribe',
            payload
          }));
          
          payload.forEach(contract => {
            this.ws?.send(JSON.stringify({
              time: Math.floor(Date.now() / 1000),
              channel: 'futures.order_book',
              event: 'subscribe',
              payload: [contract, '5', '0']
            }));
          });
        }

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              time: Math.floor(Date.now() / 1000),
              channel: 'futures.ping'
            }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.event === 'update' && data.channel === 'futures.tickers' && data.result) {
            const results = Array.isArray(data.result) ? data.result : [data.result];
            for (const item of results) {
              if (!item.contract) continue;
              const symbol = item.contract.replace('_USDT', 'USDT');
              const updates: Partial<UnifiedPrice> = {};
              if (item.mark_price) updates.markPrice = parseFloat(item.mark_price);
              if (item.funding_rate) updates.fundingRate = parseFloat(item.funding_rate);
              if (Object.keys(updates).length > 0) {
                this.updatePrice(symbol, updates, item.t || Date.now());
              }
            }
          } else if ((data.event === 'all' || data.event === 'update') && data.channel === 'futures.order_book' && data.result) {
            const item = data.result;
            if (!item.contract) return;
            const symbol = item.contract.replace('_USDT', 'USDT');
            const updates: Partial<UnifiedPrice> = {};
            if (item.bids && item.bids.length > 0) {
              updates.bids = item.bids.slice(0, 5).map((x: any) => [parseFloat(x.p), parseFloat(x.s)]) as [number, number][];
              updates.bid = updates.bids[0][0];
            }
            if (item.asks && item.asks.length > 0) {
              updates.asks = item.asks.slice(0, 5).map((x: any) => [parseFloat(x.p), parseFloat(x.s)]) as [number, number][];
              updates.ask = updates.asks[0][0];
            }
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, item.t || Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class MexcAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://contract.mexc.com/edge');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        this.symbols.forEach(s => {
          const symbol = s.replace('USDT', '_USDT');
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'sub.ticker', param: { symbol } }));
            this.ws.send(JSON.stringify({ method: 'sub.depth', param: { symbol } }));
          }
        });

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.channel === 'push.ticker' && data.data) {
            const symbol = data.symbol.replace('_USDT', 'USDT');
            const updates: Partial<UnifiedPrice> = {};
            if (data.data.fairPrice) updates.markPrice = parseFloat(data.data.fairPrice);
            if (data.data.bid1) updates.bid = parseFloat(data.data.bid1);
            if (data.data.ask1) updates.ask = parseFloat(data.data.ask1);
            if (data.data.fundingRate !== undefined) updates.fundingRate = parseFloat(data.data.fundingRate);
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, data.ts || Date.now());
            }
          } else if (data.channel === 'push.depth' && data.data) {
            const symbol = data.symbol.replace('_USDT', 'USDT');
            const updates: Partial<UnifiedPrice> = {};
            if (data.data.bids && data.data.bids.length > 0) {
              updates.bids = data.data.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
              updates.bid = updates.bids[0][0];
            }
            if (data.data.asks && data.data.asks.length > 0) {
              updates.asks = data.data.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
              updates.ask = updates.asks[0][0];
            }
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, data.ts || Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class HtxAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://api.hbdm.com/linear-swap-ws');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.symbols.forEach((s, i) => {
              const symbol = s.replace('USDT', '-USDT');
              this.ws?.send(JSON.stringify({ sub: `market.${symbol}.bbo`, id: `bbo_${i}` }));
              this.ws?.send(JSON.stringify({ sub: `public.${symbol}.funding_rate`, id: `fr_${i}` }));
            });
          }
        }, 100);
      };

      this.ws.onmessage = async (event) => {
        try {
          const dataStr = event.data.toString();
          let parsed;
          if (typeof process !== 'undefined' && process.release?.name === 'node') {
            const zlib = require('zlib');
            try {
              let buf;
              if (Buffer.isBuffer(event.data)) {
                 buf = event.data;
              } else if (event.data instanceof ArrayBuffer) {
                 buf = Buffer.from(event.data);
              } else if (event.data && typeof event.data.arrayBuffer === 'function') {
                 buf = Buffer.from(await event.data.arrayBuffer());
              } else {
                 buf = Buffer.from(event.data as any);
              }
              parsed = JSON.parse(zlib.unzipSync(buf).toString());
            } catch (err) {
              return;
            }
          } else {
             // In browser environment, handled automatically or needs pako
             return; 
          }
          
          if (parsed.ping) {
            this.ws?.send(JSON.stringify({ pong: parsed.ping }));
            return;
          }

          if (parsed.ch) {
            const parts = parsed.ch.split('.');
            if (parts.length >= 3) {
              const symbol = parts[1].replace('-USDT', 'USDT');
              const updates: Partial<UnifiedPrice> = {};

              if (parts[2] === 'mark_price' && parsed.tick) {
                if (parsed.tick.mark_price) updates.markPrice = parseFloat(parsed.tick.mark_price);
              } else if (parts[2] === 'bbo' && parsed.tick) {
                if (parsed.tick.bid && parsed.tick.bid.length >= 2) {
                  updates.bid = parseFloat(parsed.tick.bid[0]);
                  updates.bids = [[updates.bid, parseFloat(parsed.tick.bid[1])]];
                }
                if (parsed.tick.ask && parsed.tick.ask.length >= 2) {
                  updates.ask = parseFloat(parsed.tick.ask[0]);
                  updates.asks = [[updates.ask, parseFloat(parsed.tick.ask[1])]];
                }
              } else if (parts[2] === 'funding_rate' && parsed.tick) {

                if (parsed.tick.funding_rate) {
                  updates.fundingRate = parseFloat(parsed.tick.funding_rate);

                }
              }

              if (Object.keys(updates).length > 0) {
                this.updatePrice(symbol, updates, parsed.ts || Date.now());
              }
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class HyperliquidAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        this.symbols.forEach(s => {
          const coin = s.replace('USDT', '');
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin } }));
            this.ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } }));
          }
        });

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.channel === 'activeAssetCtx' && msg.data) {
            const symbol = msg.data.coin + 'USDT';
            const updates: Partial<UnifiedPrice> = {};
            if (msg.data.ctx.markPx) updates.markPrice = parseFloat(msg.data.ctx.markPx);
            if (msg.data.ctx.funding) updates.fundingRate = parseFloat(msg.data.ctx.funding);
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, Date.now());
            }
          } else if (msg.channel === 'l2Book' && msg.data) {
            const symbol = msg.data.coin + 'USDT';
            const updates: Partial<UnifiedPrice> = {};
            const bids = msg.data.levels[0];
            const asks = msg.data.levels[1];
            if (bids && bids.length > 0) {
              updates.bids = bids.slice(0, 5).map((x: any) => [parseFloat(x.px), parseFloat(x.sz)]) as [number, number][];
              updates.bid = updates.bids[0][0];
            }
            if (asks && asks.length > 0) {
              updates.asks = asks.slice(0, 5).map((x: any) => [parseFloat(x.px), parseFloat(x.sz)]) as [number, number][];
              updates.ask = updates.asks[0][0];
            }
            if (Object.keys(updates).length > 0) {
              this.updatePrice(symbol, updates, msg.data.time || Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
  }
}

class BlofinAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://openapi.blofin.com/ws/public');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        const argsTickers = this.symbols.map(s => ({ channel: 'tickers', instId: s.replace('USDT', '-USDT') }));
        const argsBooks = this.symbols.map(s => ({ channel: 'books', instId: s.replace('USDT', '-USDT') }));
        const argsFunding = this.symbols.map(s => ({ channel: 'funding-rate', instId: s.replace('USDT', '-USDT') }));
        
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 'subscribe', args: argsTickers }));
          this.ws.send(JSON.stringify({ op: 'subscribe', args: argsBooks }));
          this.ws.send(JSON.stringify({ op: 'subscribe', args: argsFunding }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data.toString());
          if (msg.arg && msg.data) {
            const symbol = msg.arg.instId.replace('-USDT', 'USDT');
            const updates: Partial<UnifiedPrice> = {};
            
            if (msg.arg.channel === 'tickers' && msg.data.length > 0) {
              const item = msg.data[0];
              if (item.last) updates.markPrice = parseFloat(item.last);
              if (item.bidPrice) updates.bid = parseFloat(item.bidPrice);
              if (item.askPrice) updates.ask = parseFloat(item.askPrice);
            } else if (msg.arg.channel === 'funding-rate' && msg.data.length > 0) {
              const item = msg.data[0];
              if (item.fundingRate) updates.fundingRate = parseFloat(item.fundingRate);
              if (item.fundingTime) updates.nextFunding = new Date(parseInt(item.fundingTime)).toISOString();
            } else if (msg.arg.channel === 'books' && msg.data) {
              if (msg.data.bids && msg.data.bids.length > 0) {
                updates.bids = msg.data.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                updates.bid = updates.bids[0][0];
              }
              if (msg.data.asks && msg.data.asks.length > 0) {
                updates.asks = msg.data.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                updates.ask = updates.asks[0][0];
              }
            }

            if (Object.keys(updates).length > 0) {
              const ts = msg.data.ts ? parseInt(msg.data.ts) : (msg.data[0]?.ts ? parseInt(msg.data[0].ts) : Date.now());
              this.updatePrice(symbol, updates, ts || Date.now());
            }
          }
        } catch (e) {}
      };

      this.ws.onclose = () => this.triggerReconnect();
      this.ws.onerror = () => this.ws?.close();
    } catch (e) {
      this.triggerReconnect();
    }
    }
  }

  class CoinSwitchAdapter extends ExchangeAdapter {
    private socket: SocketV4 | null = null;
    
    connect() {
      try {
        this.socket = ioV4('wss://ws.coinswitch.co/exchange_2', {
          path: '/pro/realtime-rates-socket/futures/exchange_2',
          transports: ['websocket'],
        });
  
        this.socket.on('connect', () => {
          this.updateStatus('Connected', 0);
          console.log('[CoinSwitch] Connected! Subscribing to:', this.symbols);
          this.symbols.forEach(s => {
            this.socket?.emit('FETCH_TICKER_INFO_CS_PRO', { event: 'subscribe', pair: s });
          });
        });
  
        this.socket.on('cs_pro_ticker_info', (msg: any) => {
          console.log('[CoinSwitch RAW]', msg);
          try {
            const updates: Partial<UnifiedPrice> = {};
            if (msg.p) updates.markPrice = parseFloat(msg.p);
            if (msg.r) updates.fundingRate = parseFloat(msg.r);
            if (msg.c) {
              updates.bid = parseFloat(msg.c);
              updates.ask = parseFloat(msg.c);
            }
            if (msg.T) {
               updates.nextFunding = new Date(parseInt(msg.T)).toISOString();
            }
            if (Object.keys(updates).length > 0 && msg.i) {
              this.updatePrice(msg.i, updates, Date.now());
            }
          } catch (e) {}
        });
  
        this.socket.on('disconnect', () => this.triggerReconnect());
        this.socket.on('connect_error', () => {
          this.socket?.disconnect();
          this.triggerReconnect();
        });
      } catch (e) {
        this.triggerReconnect();
      }
    }
  
    protected disconnect() {
      super.disconnect();
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
    }
  }
  
  export class WebSocketManager extends EventEmitter {
  private adapters: Map<ExchangeName, ExchangeAdapter> = new Map();
  private statuses: Map<ExchangeName, WsStatus> = new Map();
  private prices: Map<string, UnifiedPrice> = new Map(); // key: "EXCHANGE:SYMBOL"
  
  // Buffers for delta streaming
  private deltaPrices: Map<string, UnifiedPrice> = new Map();
  private statusesChanged: boolean = false;


  constructor() {
    super();
    const symbols = getSymbols();
    
    this.registerAdapter(new BinanceAdapter('binance', symbols, this));
    this.registerAdapter(new BitgetAdapter('bitget', symbols, this));
    this.registerAdapter(new DeltaAdapter('delta', symbols, this));
    this.registerAdapter(new OkxAdapter('okx', symbols, this));
    this.registerAdapter(new BybitAdapter('bybit', symbols, this));
    this.registerAdapter(new KucoinAdapter('kucoin', symbols, this));
    this.registerAdapter(new BingxAdapter('bingx', symbols, this));
    this.registerAdapter(new BitmexAdapter('bitmex', symbols, this));
    this.registerAdapter(new PhemexAdapter('phemex', symbols, this));
    this.registerAdapter(new GateioAdapter('gate', symbols, this));
    this.registerAdapter(new MexcAdapter('mexc', symbols, this));
    this.registerAdapter(new HtxAdapter('htx', symbols, this));
    this.registerAdapter(new HyperliquidAdapter('hyperliquid', symbols, this));
    this.registerAdapter(new BlofinAdapter('blofin', symbols, this));
    this.registerAdapter(new CoinSwitchAdapter('coinswitch', symbols, this));
    
    // Broadcast flush interval
    setInterval(() => {
      if (this.deltaPrices.size > 0 || this.statusesChanged) {
        const payload = JSON.stringify({
          prices: Array.from(this.deltaPrices.values()),
          statuses: this.statusesChanged ? this.getStatuses() : undefined
        });
        
        this.deltaPrices.clear();
        this.statusesChanged = false;
        
        this.emit('broadcast', payload);
      }
    }, 100);
  }

  private registerAdapter(adapter: ExchangeAdapter) {
    this.adapters.set(adapter.name, adapter);
    this.statuses.set(adapter.name, {
      exchange: adapter.name,
      status: 'Disconnected',
      lastUpdate: 0,
      latencyMs: 0,
      reconnectCount: 0,
    });
  }

  public updateStatus(ex: ExchangeName, partial: Partial<WsStatus>) {
    const current = this.statuses.get(ex)!;
    this.statuses.set(ex, { ...current, ...partial });
    this.statusesChanged = true;
    this.emit('statusUpdate', this.statuses.get(ex));
  }

  public updatePrice(ex: ExchangeName, symbol: string, updates: Partial<UnifiedPrice>, timestamp: number) {
    const sym = symbol.toUpperCase().replace(/[-_]/g, '');
    const key = `${ex}:${sym}`;
    
    const existing = this.prices.get(key) || { symbol: sym, exchange: ex, timestamp };
    const newPrice: UnifiedPrice = { ...existing, ...updates, timestamp };
    this.prices.set(key, newPrice);
    this.deltaPrices.set(key, newPrice);
    
    const now = Date.now();
    const currentStatus = this.statuses.get(ex)!;
    const latencyMs = now - timestamp > 0 ? now - timestamp : currentStatus.latencyMs;
    
    this.updateStatus(ex, { 
      lastUpdate: now,
      latencyMs
    });
    

    
    this.emit('priceUpdate', newPrice);
    if (ex === 'binance' && Object.keys(updates).includes('fundingRate')) {
      // debug log removed
    }
    if (ex === 'binance') {
      // debug log removed
    }
  }

  public getPrices() {
    return Array.from(this.prices.values());
  }

  public getStatuses() {
    return Array.from(this.statuses.values());
  }

  public reconnect(ex: ExchangeName, connectFn: () => void): NodeJS.Timeout {
    const current = this.statuses.get(ex);
    const count = (current && typeof current.reconnectCount === 'number' && !isNaN(current.reconnectCount)) 
      ? current.reconnectCount 
      : 0;

    this.updateStatus(ex, { 
      status: 'Reconnecting', 
      reconnectCount: count + 1 
    });
    
    let delay = Math.min(1000 * Math.pow(2, count), 30000);
    if (isNaN(delay) || delay < 1000) delay = 1000; // Force valid >=1s delay
    
    return setTimeout(connectFn, delay);
  }

  public connectAll() {
    for (const adapter of this.adapters.values()) {
      adapter.connect();
    }
  }

  public updateSymbols(newSymbols: string[]) {
    const uniqueSymbols = Array.from(new Set(newSymbols.map(s => s.toUpperCase())));
    
    let delay = 0;
    for (const adapter of this.adapters.values()) {
      const currentSet = new Set(adapter.symbols);
      const newSet = new Set(uniqueSymbols);
      
      const isDifferent = currentSet.size !== newSet.size || 
        [...currentSet].some(s => !newSet.has(s));
      
      if (isDifferent) {
        (adapter as any).symbols = uniqueSymbols;
        const adapterToReconnect = adapter;
        setTimeout(() => {
          try {
            adapterToReconnect.connect();
          } catch (e) {
            console.error(`[WS] Failed to reconnect ${adapterToReconnect.name}:`, e);
          }
        }, delay);
        delay += 300;
      }
    }
  }
}

// Ensure singleton instance in Next.js development (prevents HMR from spawning multiple connections)
const globalForWs = global as unknown as { wsManager: WebSocketManager };

export const wsManager = globalForWs.wsManager || new WebSocketManager();

if (process.env.NODE_ENV !== 'production') {
  globalForWs.wsManager = wsManager;
}

// Initiate connections on first load if not already connected
if (wsManager.getStatuses().every(s => s.status === 'Disconnected')) {
  wsManager.connectAll();
}


class GateioAdapter extends ExchangeAdapter {
  connect() {
    try {
      this.ws = new WebSocket('wss://fx-ws.gateio.ws/v4/ws/usdt');

      this.ws.onopen = () => {
        this.updateStatus('Connected', 0);
        const payload = this.symbols.map(s => s.replace('USDT', '_USDT'));
        
        this.ws?.send(JSON.stringify({
          time: Math.floor(Date.now() / 1000),
          channel: 'futures.tickers',
          event: 'subscribe',
          payload
        }));
        
        this.ws?.send(JSON.stringify({
          time: Math.floor(Date.now() / 1000),
          channel: 'futures.order_book',
          event: 'subscribe',
          payload: [...payload, '5', '0']
        }));

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
          } else if (data.event === 'all' && data.channel === 'futures.order_book' && data.result) {
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
          this.ws?.send(JSON.stringify({ method: 'sub.ticker', param: { symbol } }));
          this.ws?.send(JSON.stringify({ method: 'sub.depth', param: { symbol } }));
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
        this.symbols.forEach((s, i) => {
          const symbol = s.replace('USDT', '-USDT');
          this.ws?.send(JSON.stringify({ sub: `market.${symbol}.detail`, id: `detail_${i}` }));
          this.ws?.send(JSON.stringify({ sub: `market.${symbol}.depth.step0`, id: `depth_${i}` }));
        });
      };

      this.ws.onmessage = async (event) => {
        try {
          const dataStr = event.data.toString();
          let parsed;
          if (typeof process !== 'undefined' && process.release?.name === 'node') {
            const zlib = require('zlib');
            try {
              const buf = Buffer.isBuffer(event.data) ? event.data : Buffer.from(event.data as any);
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

              if (parts[2] === 'detail' && parsed.tick) {
                if (parsed.tick.close) updates.markPrice = parseFloat(parsed.tick.close);
                if (parsed.tick.bid && parsed.tick.bid[0]) updates.bid = parseFloat(parsed.tick.bid[0]);
                if (parsed.tick.ask && parsed.tick.ask[0]) updates.ask = parseFloat(parsed.tick.ask[0]);
              } else if (parts[2] === 'depth' && parsed.tick) {
                if (parsed.tick.bids && parsed.tick.bids.length > 0) {
                  updates.bids = parsed.tick.bids.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                  updates.bid = updates.bids[0][0];
                }
                if (parsed.tick.asks && parsed.tick.asks.length > 0) {
                  updates.asks = parsed.tick.asks.slice(0, 5).map((x: any) => [parseFloat(x[0]), parseFloat(x[1])]) as [number, number][];
                  updates.ask = updates.asks[0][0];
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
          this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin } }));
          this.ws?.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } }));
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
        
        this.ws?.send(JSON.stringify({ op: 'subscribe', args: argsTickers }));
        this.ws?.send(JSON.stringify({ op: 'subscribe', args: argsBooks }));
        this.ws?.send(JSON.stringify({ op: 'subscribe', args: argsFunding }));
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

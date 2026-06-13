// Binance WebSocket for real-time mark price

// Binance WebSocket for real-time mark price
// wss://fstream.binance.com/ws/!markPrice@arr@1s
// Updates every 1 second for ALL pairs

// Bybit WebSocket for real-time tickers  
// wss://stream.bybit.com/v5/public/linear
// Subscribe to tickers.BTCUSDT etc

// Store latest rates in memory cache
const liveRates: Record<string, Record<string, number>> = {
  binance: {},
  bybit: {},
};

let binanceWs: WebSocket | null = null;
let bybitWs: WebSocket | null = null;

function connectBinanceWs() {
  binanceWs = new WebSocket(
    'wss://fstream.binance.com/ws/!markPrice@arr@1s'
  );
  
  binanceWs.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item.s?.endsWith('USDT')) {
          const base = item.s.slice(0, -4);
          liveRates.binance[base] = 
            parseFloat(item.r); // funding rate
        }
      });
    }
  };

  binanceWs.onclose = () => {
    // Reconnect after 2 seconds
    setTimeout(connectBinanceWs, 2000);
  };
}

export function getLiveRates() {
  return liveRates;
}

// Initialize WebSocket connections
connectBinanceWs();



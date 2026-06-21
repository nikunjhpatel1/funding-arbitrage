export type ExchangeGroup = 'top10' | 'more';

export interface ExchangeConfig {
  id: string;
  name: string;
  color: string;
  group: ExchangeGroup;
}

export const ALL_EXCHANGES_CONFIG: ExchangeConfig[] = [
  { id: 'binance',     name: 'Binance',      color: '#F0B90B', group: 'top10' },
  { id: 'bybit',       name: 'Bybit',        color: '#F3A10A', group: 'top10' },
  { id: 'okx',         name: 'OKX',          color: '#000000', group: 'top10' },
  { id: 'bitget',      name: 'Bitget',       color: '#00D1C6', group: 'top10' },
  { id: 'kucoin',      name: 'KuCoin',       color: '#24AE8F', group: 'top10' },
  { id: 'gateio',      name: 'Gate.io',      color: '#1763F7', group: 'top10' },
  { id: 'mexc',        name: 'MEXC',         color: '#2AB27A', group: 'top10' },
  { id: 'bingx',       name: 'BingX',        color: '#1A3EE8', group: 'top10' },
  { id: 'htx',         name: 'HTX',          color: '#0B2344', group: 'top10' },
  { id: 'bitmex',      name: 'BitMEX',       color: '#0A315D', group: 'top10' },
  { id: 'dydx',        name: 'dYdX',         color: '#6966FF', group: 'more' },
  { id: 'hyperliquid', name: 'Hyperliquid',  color: '#3CD8A8', group: 'more' },
  { id: 'phemex',      name: 'Phemex',       color: '#2040E0', group: 'more' },
  { id: 'blofin',      name: 'BloFin',       color: '#2A2E39', group: 'more' },
  { id: 'delta',       name: 'Delta',        color: '#5500FF', group: 'more' },
  { id: 'coinswitch',  name: 'CoinSwitch',   color: '#0F52BA', group: 'more' },
];

export const EXCHANGE_NAMES: Record<string, string> = Object.fromEntries(
  ALL_EXCHANGES_CONFIG.map(ex => [ex.id, ex.name])
);

export const EXCHANGE_IDS = ALL_EXCHANGES_CONFIG.map(ex => ex.id);

export const TOTAL_EXCHANGES = ALL_EXCHANGES_CONFIG.length;

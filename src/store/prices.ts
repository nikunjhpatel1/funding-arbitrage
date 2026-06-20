import { create } from 'zustand';
import type { UnifiedPrice, WsStatus } from '@/lib/ws-manager';

interface PriceStore {
  pricesMap: Record<string, UnifiedPrice>;
  statuses: WsStatus[];
  isConnected: boolean;
  setPrices: (prices: UnifiedPrice[]) => void;
  setStatuses: (statuses: WsStatus[]) => void;
  setIsConnected: (connected: boolean) => void;
}

export const usePriceStore = create<PriceStore>((set) => ({
  pricesMap: {},
  statuses: [],
  isConnected: false,
  setPrices: (prices) => {
    set((state) => {
      const pricesMap = { ...state.pricesMap };
      for (const p of prices) {
        pricesMap[`${p.symbol}-${p.exchange}`] = p;
      }
      return { pricesMap };
    });
  },
  setStatuses: (statuses) => set({ statuses }),
  setIsConnected: (isConnected) => set({ isConnected }),
}));

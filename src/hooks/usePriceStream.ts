import { useEffect } from 'react';
import { usePriceStore } from '@/store/prices';

export function usePriceStream() {
  const isConnected = usePriceStore(state => state.isConnected);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      es = new EventSource('/api/prices/stream');

      es.onopen = () => {
        usePriceStore.getState().setIsConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.prices) usePriceStore.getState().setPrices(data.prices);
          if (data.statuses) usePriceStore.getState().setStatuses(data.statuses);
        } catch (e) {
          console.error('Failed to parse SSE data', e);
        }
      };

      es.onerror = () => {
        usePriceStore.getState().setIsConnected(false);
        es?.close();
        reconnectTimer = setTimeout(connect, 2000); // Reconnect after 2s
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (es) {
        es.close();
      }
    };
  }, []);

  return { isConnected };
}

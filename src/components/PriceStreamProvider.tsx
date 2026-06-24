'use client';

import { useEffect, useRef } from 'react';
import { usePriceStore } from '@/store/prices';

export default function PriceStreamProvider({ children }: { children: React.ReactNode }) {
  const symbolsRegistered = useRef(false);

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
        } catch {}
      };
      es.onerror = () => {
        usePriceStore.getState().setIsConnected(false);
        es?.close();
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    if (!symbolsRegistered.current) {
      symbolsRegistered.current = true;
      fetch('/api/funding-rates')
        .then(r => r.json())
        .then(json => {
          const rows: any[] = json?.data || [];
          if (rows.length > 0) {
            const symbols = Array.from(
              new Set(rows.map((r: any) => (r.symbol || '').replace('/', '').toUpperCase()))
            );
            fetch('/api/prices/update-symbols', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }

    return () => {
      clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, []);

  return <>{children}</>;
}

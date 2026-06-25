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

    let retryCount = 0;
    const maxRetries = 5;
    const retryDelays = [2000, 5000, 10000, 20000, 30000];

    const registerSymbols = () => {
      if (symbolsRegistered.current) return;
      fetch('/api/funding-rates')
        .then(r => r.json())
        .then(json => {
          const rows: any[] = json?.data || [];
          if (rows.length > 0) {
            const symbols = Array.from(
              new Set(
                rows.map((r: any) => 
                  (r.symbol || '').replace('/', '').toUpperCase()
                ).filter(Boolean)
              )
            );
            return fetch('/api/prices/update-symbols', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbols }),
            }).then(() => {
              symbolsRegistered.current = true;
              console.log(
                `[PriceStream] Registered ${symbols.length} symbols`
              );
            });
          } else if (retryCount < maxRetries) {
            const delay = retryDelays[retryCount] || 30000;
            retryCount++;
            console.log(
              `[PriceStream] No symbols yet, retrying in ${delay}ms ` +
              `(attempt ${retryCount}/${maxRetries})`
            );
            reconnectTimer = setTimeout(registerSymbols, delay);
          }
        })
        .catch(() => {
          if (retryCount < maxRetries) {
            const delay = retryDelays[retryCount] || 30000;
            retryCount++;
            reconnectTimer = setTimeout(registerSymbols, delay);
          }
        });
    };

    registerSymbols();

    return () => {
      clearTimeout(reconnectTimer);
      if (es) es.close();
    };
  }, []);

  return <>{children}</>;
}

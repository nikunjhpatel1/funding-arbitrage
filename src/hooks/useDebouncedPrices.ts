import { useEffect, useState } from 'react';
import { usePriceStore } from '@/store/prices';

export function useDebouncedPrices(delayMs = 1000) {
  const [debouncedMap, setDebouncedMap] = useState(() => usePriceStore.getState().pricesMap);

  useEffect(() => {
    const interval = setInterval(() => {
      setDebouncedMap(usePriceStore.getState().pricesMap);
    }, delayMs);
    return () => clearInterval(interval);
  }, [delayMs]);

  return debouncedMap;
}

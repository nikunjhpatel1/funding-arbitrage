export interface OrderBook {
  bids: [number, number][]; // [price, size_in_base_asset]
  asks: [number, number][]; // [price, size_in_base_asset]
}

export interface SlippageResult {
  averageFillPrice: number;
  slippagePercent: number;
  executionCostUSD: number;
  fullyFilled: boolean;
  filledNotional: number;
  markPriceUsed: number;
  classification: 'Positive Slippage' | 'Negative Slippage' | 'Neutral';
}

export function calculateSlippage(
  orderbook: OrderBook | null,
  side: 'buy' | 'sell',
  targetNotionalUSD: number,
  markPrice: number
): SlippageResult {
  if (!orderbook || targetNotionalUSD <= 0 || !markPrice) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
      markPriceUsed: markPrice || 0,
      classification: 'Neutral',
    };
  }

  let dynamicMarkPrice = markPrice;
  
  // Ensure strict ordering just in case API returns unsorted data
  const bids = orderbook.bids ? [...orderbook.bids].sort((a, b) => b[0] - a[0]) : []; // Descending
  const asks = orderbook.asks ? [...orderbook.asks].sort((a, b) => a[0] - b[0]) : []; // Ascending

  if (bids.length > 0 && asks.length > 0) {
    const bestBid = bids[0][0];
    const bestAsk = asks[0][0];
    dynamicMarkPrice = (bestBid + bestAsk) / 2;
  }

  if (!dynamicMarkPrice) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
      markPriceUsed: 0,
      classification: 'Neutral',
    };
  }

  // Determine which side of the book to cross
  // Buy -> cross the asks (we buy from sellers)
  // Sell -> cross the bids (we sell to buyers)
  const levels = side === 'buy' ? asks : bids;
  
  if (!levels || levels.length === 0) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
      markPriceUsed: dynamicMarkPrice,
      classification: 'Neutral',
    };
  }

  // Best price is the top of the book
  const bestPrice = levels[0][0];
  if (bestPrice <= 0) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
      markPriceUsed: dynamicMarkPrice,
      classification: 'Neutral',
    };
  }

  let remainingNotional = targetNotionalUSD;
  let totalCostBase = 0;
  let totalCostQuote = 0;

  for (const [price, size] of levels) {
    const levelNotional = price * size;
    
    if (levelNotional >= remainingNotional) {
      // We can completely fill the remaining order at this level
      const baseNeeded = remainingNotional / price;
      totalCostBase += baseNeeded;
      totalCostQuote += remainingNotional;
      remainingNotional = 0;
      break;
    } else {
      // Consume the entire level
      totalCostBase += size;
      totalCostQuote += levelNotional;
      remainingNotional -= levelNotional;
    }
  }

  // If the book is completely consumed but there is remaining notional,
  // we apply a harsh synthetic penalty to the remainder to accurately reflect the lack of liquidity.
  if (remainingNotional > 0.0001 && levels.length > 0) {
    const worstPrice = levels[levels.length - 1][0];
    // Add a 1% penalty to the worst price for the remaining notional
    const penalizedPrice = side === 'buy' ? worstPrice * 1.01 : worstPrice * 0.99;
    const baseNeeded = remainingNotional / Math.max(0.000001, penalizedPrice);
    totalCostBase += baseNeeded;
    totalCostQuote += remainingNotional;
    remainingNotional = 0;
  }

  const fullyFilled = remainingNotional <= 0.0001;
  const filledNotional = targetNotionalUSD - remainingNotional;
  
  if (totalCostBase === 0) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
      markPriceUsed: dynamicMarkPrice,
      classification: 'Neutral',
    };
  }

  const averageFillPrice = totalCostQuote / totalCostBase;
  
  // Calculate slippage relative to the dynamically calculated mark price
  let slippagePercent = 0;
  if (side === 'buy') {
    slippagePercent = ((averageFillPrice - dynamicMarkPrice) / dynamicMarkPrice) * 100;
  } else {
    slippagePercent = ((dynamicMarkPrice - averageFillPrice) / dynamicMarkPrice) * 100;
  }

  // Execution cost in USD
  const quantity = totalCostBase; // Amount filled in base asset
  let executionCostUSD = 0;
  if (side === 'buy') {
    executionCostUSD = (averageFillPrice - dynamicMarkPrice) * quantity;
  } else {
    executionCostUSD = (dynamicMarkPrice - averageFillPrice) * quantity;
  }
  
  let classification: 'Positive Slippage' | 'Negative Slippage' | 'Neutral' = 'Neutral';
  if (executionCostUSD > 0) classification = 'Positive Slippage';
  else if (executionCostUSD < 0) classification = 'Negative Slippage';

  return {
    averageFillPrice,
    slippagePercent,
    executionCostUSD,
    fullyFilled,
    filledNotional,
    markPriceUsed: dynamicMarkPrice,
    classification,
  };
}

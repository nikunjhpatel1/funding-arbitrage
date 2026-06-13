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
}

export function calculateSlippage(
  orderbook: OrderBook | null,
  side: 'buy' | 'sell',
  targetNotionalUSD: number
): SlippageResult {
  if (!orderbook || targetNotionalUSD <= 0) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
    };
  }

  // Determine which side of the book to cross
  // Buy -> cross the asks (we buy from sellers)
  // Sell -> cross the bids (we sell to buyers)
  const levels = side === 'buy' ? orderbook.asks : orderbook.bids;
  
  if (!levels || levels.length === 0) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
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

  const fullyFilled = remainingNotional <= 0.0001;
  const filledNotional = targetNotionalUSD - remainingNotional;
  
  if (totalCostBase === 0) {
    return {
      averageFillPrice: 0,
      slippagePercent: 0,
      executionCostUSD: 0,
      fullyFilled: false,
      filledNotional: 0,
    };
  }

  const averageFillPrice = totalCostQuote / totalCostBase;
  
  // Calculate slippage relative to the best price
  // For buy: slippage = (avgFillPrice - bestPrice) / bestPrice
  // For sell: slippage = (bestPrice - avgFillPrice) / bestPrice
  let slippagePercent = 0;
  if (side === 'buy') {
    slippagePercent = ((averageFillPrice - bestPrice) / bestPrice) * 100;
  } else {
    slippagePercent = ((bestPrice - averageFillPrice) / bestPrice) * 100;
  }

  // Execution cost in USD is the notional difference
  // Buy: we pay more quote currency
  // Sell: we receive less quote currency
  const executionCostUSD = (slippagePercent / 100) * filledNotional;

  return {
    averageFillPrice,
    slippagePercent,
    executionCostUSD,
    fullyFilled,
    filledNotional,
  };
}

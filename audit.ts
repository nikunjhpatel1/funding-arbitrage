// In node 24, native WebSocket is fine if we don't double connect
async function runAudit() {
  const { wsManager } = await import('./src/lib/ws-manager.js');

  console.log("Starting Verification Audit...");
  console.log("Waiting 8 seconds for data collection from auto-connected exchanges...\n");

  // Wait 8 seconds to accumulate messages and ensure funding interval updates (like 1s arrays) arrive
  await new Promise(resolve => setTimeout(resolve, 8000));

  const statuses = wsManager.getStatuses();
  const prices = wsManager.getPrices();

  const targetExchanges = [
    'binance', 'bybit', 'okx', 'bitget', 'kucoin', 'delta', 'gate', 
    'mexc', 'hyperliquid', 'blofin', 'phemex', 'htx', 'bingx'
  ];

  const results: any = {};
  
  targetExchanges.forEach(ex => {
    const statusObj = statuses.find((s: any) => s.exchange === ex) || { status: 'Disconnected', reconnectCount: 0, lastUpdate: 0 };
    const exPrices = prices.filter((p: any) => p.exchange === ex);
    const samplePrice = exPrices[0] || {};
    
    const hasPrices = exPrices.length > 0;
    const hasFunding = exPrices.some((p: any) => p.fundingRate !== undefined);
    const hasDepth = exPrices.some((p: any) => p.bids && p.bids.length > 0);

    results[ex] = {
      connectionStatus: statusObj.status,
      lastMessageTimestamp: statusObj.lastUpdate,
      reconnectCount: statusObj.reconnectCount,
      subscriptionSuccess: statusObj.lastUpdate > 0 && hasPrices,
      symbolCount: exPrices.length,
      fundingSource: hasFunding ? 'websocket' : 'REST fallback',
      depthSource: hasDepth ? 'websocket' : 'REST fallback',
      sampleBid: samplePrice.bid || (samplePrice.bids ? samplePrice.bids[0]?.[0] : undefined),
      sampleAsk: samplePrice.ask || (samplePrice.asks ? samplePrice.asks[0]?.[0] : undefined),
      sampleFunding: samplePrice.fundingRate,
      hasPrices,
      hasFunding,
      hasDepth
    };
  });

  console.log("================= AUDIT RESULTS =================\n");

  for (const ex of targetExchanges) {
    const r = results[ex];
    console.log(`--- ${ex.toUpperCase()} ---`);
    console.log(`WebSocket connection status: ${r.connectionStatus}`);
    console.log(`Last message timestamp: ${r.lastMessageTimestamp}`);
    console.log(`Subscription success status: ${r.subscriptionSuccess}`);
    console.log(`Current symbol count: ${r.symbolCount}`);
    console.log(`Funding rate source: ${r.fundingSource}`);
    console.log(`Orderbook depth source: ${r.depthSource}`);
    console.log(`Current bid/ask values received: Bid: ${r.sampleBid}, Ask: ${r.sampleAsk}`);
    console.log(`Current funding rate received: ${r.sampleFunding}`);
    console.log(`Reconnect count: ${r.reconnectCount}`);
    console.log("");
  }

  console.log("================= ISSUES IDENTIFIED =================\n");

  const connectedNotReceiving = targetExchanges.filter(ex => results[ex].connectionStatus === 'Connected' && !results[ex].hasPrices);
  console.log("* Connected but not receiving data:", connectedNotReceiving.join(', ') || 'None');

  const receivingPricesNotFunding = targetExchanges.filter(ex => results[ex].hasPrices && !results[ex].hasFunding);
  console.log("* Receiving prices but not funding:", receivingPricesNotFunding.join(', ') || 'None');

  const receivingFundingNotDepth = targetExchanges.filter(ex => results[ex].hasFunding && !results[ex].hasDepth);
  console.log("* Receiving funding but not orderbook depth:", receivingFundingNotDepth.join(', ') || 'None');

  const usingRestFallback = targetExchanges.filter(ex => results[ex].connectionStatus === 'Connected' && (!results[ex].hasFunding || !results[ex].hasDepth));
  console.log("* Using REST fallback instead of WebSocket:", usingRestFallback.join(', ') || 'None');

  process.exit(0);
}

runAudit().catch(console.error);

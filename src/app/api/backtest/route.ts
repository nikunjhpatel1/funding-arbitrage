import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { TAKER_FEES } from '../paper-trading/route';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      symbol, 
      startDate, 
      endDate, 
      initialCapital, 
      leverage, 
      minSpreadPct, 
      closeSpreadPct, 
      slippagePct 
    } = body;

    const startTs = new Date(startDate).getTime();
    const endTs = new Date(endDate).getTime();

    // 1. Fetch historical data
    const rows = db.prepare(`
      SELECT * FROM funding_rate_history 
      WHERE symbol = ? AND recorded_at >= ? AND recorded_at <= ? 
      ORDER BY recorded_at ASC
    `).all(symbol, startTs, endTs) as any[];

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No historical data found for this period.' }, { status: 400 });
    }

    // 2. Group by recorded_at
    const snapshots: Record<number, Record<string, any>> = {};
    for (const row of rows) {
      if (!snapshots[row.recorded_at]) snapshots[row.recorded_at] = {};
      snapshots[row.recorded_at][row.exchange] = row;
    }

    const timestamps = Object.keys(snapshots).map(Number).sort((a, b) => a - b);

    // 3. Backtest State
    let equity = Number(initialCapital);
    let peakEquity = equity;
    let currentPosition: any = null;
    
    const tradeLog: any[] = [];
    const equityCurve: any[] = [];

    // Metrics
    let totalFundingEarned = 0;
    let totalFundingPaid = 0;
    let totalFees = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let maxDrawdown = 0;

    let lastTime = timestamps[0];

    // 4. Simulation Loop
    for (const t of timestamps) {
      const snapshot = snapshots[t];
      const dtHours = (t - lastTime) / 3600000;
      lastTime = t;

      const exchanges = Object.keys(snapshot);
      if (exchanges.length < 2) continue;

      // Continuous funding accrual
      if (currentPosition && dtHours > 0) {
        const longEx = currentPosition.long_exchange;
        const shortEx = currentPosition.short_exchange;
        
        const longData = snapshot[longEx] || currentPosition.last_long_data;
        const shortData = snapshot[shortEx] || currentPosition.last_short_data;

        if (longData) currentPosition.last_long_data = longData;
        if (shortData) currentPosition.last_short_data = shortData;

        // Approximate funding accrual
        const longInterval = longData?.funding_interval_hours || 8;
        const shortInterval = shortData?.funding_interval_hours || 8;

        const longRate = longData?.funding_rate ?? 0;
        const shortRate = shortData?.funding_rate ?? 0;

        const notional = currentPosition.notional;

        const longFundingAmt = (dtHours / longInterval) * longRate * notional;
        const shortFundingAmt = (dtHours / shortInterval) * shortRate * notional;

        // Long leg receives funding if rate < 0, pays if rate > 0
        currentPosition.long_funding -= longFundingAmt; 
        if (longFundingAmt < 0) {
          totalFundingEarned += Math.abs(longFundingAmt);
        } else {
          totalFundingPaid += Math.abs(longFundingAmt);
        }

        // Short leg receives funding if rate > 0, pays if rate < 0
        currentPosition.short_funding += shortFundingAmt;
        if (shortFundingAmt > 0) {
          totalFundingEarned += Math.abs(shortFundingAmt);
        } else {
          totalFundingPaid += Math.abs(shortFundingAmt);
        }

        // Check Exit Condition
        // Annualized spread
        const annualizedSpread = (shortRate * (8760 / shortInterval) * 100) - (longRate * (8760 / longInterval) * 100);

        if (annualizedSpread <= closeSpreadPct) {
          // Close Position
          const exitLongPrice = longData?.price ?? currentPosition.entry_long_price;
          const exitShortPrice = shortData?.price ?? currentPosition.entry_short_price;

          const longPricePnl = ((exitLongPrice - currentPosition.entry_long_price) / currentPosition.entry_long_price) * notional;
          const shortPricePnl = ((currentPosition.entry_short_price - exitShortPrice) / currentPosition.entry_short_price) * notional;
          
          const exitFeesLong = notional * (TAKER_FEES[longEx] ?? 0.0006);
          const exitFeesShort = notional * (TAKER_FEES[shortEx] ?? 0.0006);
          const exitSlippage = notional * (slippagePct / 100) * 2;
          
          const exitCost = exitFeesLong + exitFeesShort + exitSlippage;
          totalFees += exitCost;

          const tradeNet = longPricePnl + shortPricePnl + currentPosition.long_funding + currentPosition.short_funding - currentPosition.entry_cost - exitCost;
          
          equity += tradeNet;

          if (tradeNet > 0) {
            winningTrades++;
            grossProfit += tradeNet;
          } else {
            losingTrades++;
            grossLoss += Math.abs(tradeNet);
          }

          tradeLog.push({
            entryTime: currentPosition.entry_time,
            exitTime: t,
            longExchange: longEx,
            shortExchange: shortEx,
            notional,
            netPnL: tradeNet,
            fundingNet: currentPosition.long_funding + currentPosition.short_funding,
            feesNet: currentPosition.entry_cost + exitCost,
            pricePnlNet: longPricePnl + shortPricePnl
          });

          currentPosition = null;
        }
      }

      // Entry Condition
      if (!currentPosition) {
        let bestSpread = -Infinity;
        let bestLongEx = '';
        let bestShortEx = '';

        for (let i = 0; i < exchanges.length; i++) {
          for (let j = 0; j < exchanges.length; j++) {
            if (i === j) continue;
            const exLong = exchanges[i];
            const exShort = exchanges[j];

            const longRate = snapshot[exLong].funding_rate;
            const longInterval = snapshot[exLong].funding_interval_hours || 8;
            
            const shortRate = snapshot[exShort].funding_rate;
            const shortInterval = snapshot[exShort].funding_interval_hours || 8;

            if (longRate == null || shortRate == null) continue;

            // Longing the lowest rate, Shorting the highest rate
            const annSpread = (shortRate * (8760 / shortInterval) * 100) - (longRate * (8760 / longInterval) * 100);

            if (annSpread > bestSpread) {
              bestSpread = annSpread;
              bestLongEx = exLong;
              bestShortEx = exShort;
            }
          }
        }

        if (bestSpread >= minSpreadPct && bestLongEx && bestShortEx) {
          // Fixed size based on initial capital to avoid compounding complexities unless requested
          const notional = equity * leverage;
          
          const entryFeesLong = notional * (TAKER_FEES[bestLongEx] ?? 0.0006);
          const entryFeesShort = notional * (TAKER_FEES[bestShortEx] ?? 0.0006);
          const entrySlippage = notional * (slippagePct / 100) * 2;
          const entryCost = entryFeesLong + entryFeesShort + entrySlippage;

          totalFees += entryCost;

          currentPosition = {
            entry_time: t,
            long_exchange: bestLongEx,
            short_exchange: bestShortEx,
            notional,
            entry_long_price: snapshot[bestLongEx].price,
            entry_short_price: snapshot[bestShortEx].price,
            long_funding: 0,
            short_funding: 0,
            entry_cost: entryCost,
            last_long_data: snapshot[bestLongEx],
            last_short_data: snapshot[bestShortEx]
          };
        }
      }

      // Equity curve calculation
      let currentEquity = equity;
      if (currentPosition) {
        const exitLongPrice = snapshot[currentPosition.long_exchange]?.price ?? currentPosition.entry_long_price;
        const exitShortPrice = snapshot[currentPosition.short_exchange]?.price ?? currentPosition.entry_short_price;

        const longPricePnl = ((exitLongPrice - currentPosition.entry_long_price) / currentPosition.entry_long_price) * currentPosition.notional;
        const shortPricePnl = ((currentPosition.entry_short_price - exitShortPrice) / currentPosition.entry_short_price) * currentPosition.notional;
        
        currentEquity += longPricePnl + shortPricePnl + currentPosition.long_funding + currentPosition.short_funding - currentPosition.entry_cost;
      }

      if (currentEquity > peakEquity) peakEquity = currentEquity;
      const drawdown = ((peakEquity - currentEquity) / peakEquity) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      equityCurve.push({
        timestamp: t,
        equity: currentEquity
      });
    }

    // Force close at end if still open
    if (currentPosition) {
      const exitCost = currentPosition.notional * (TAKER_FEES[currentPosition.long_exchange] ?? 0.0006) + 
                       currentPosition.notional * (TAKER_FEES[currentPosition.short_exchange] ?? 0.0006) + 
                       currentPosition.notional * (slippagePct / 100) * 2;
      totalFees += exitCost;
      
      const tradeNet = currentPosition.long_funding + currentPosition.short_funding - currentPosition.entry_cost - exitCost;
      equity += tradeNet;

      if (tradeNet > 0) {
        winningTrades++;
        grossProfit += tradeNet;
      } else {
        losingTrades++;
        grossLoss += Math.abs(tradeNet);
      }
      
      tradeLog.push({
        entryTime: currentPosition.entry_time,
        exitTime: timestamps[timestamps.length - 1],
        longExchange: currentPosition.long_exchange,
        shortExchange: currentPosition.short_exchange,
        notional: currentPosition.notional,
        netPnL: tradeNet,
        fundingNet: currentPosition.long_funding + currentPosition.short_funding,
        feesNet: currentPosition.entry_cost + exitCost,
        pricePnlNet: 0
      });
    }

    const totalProfit = equity - initialCapital;
    const roi = (totalProfit / initialCapital) * 100;
    
    const daysElapsed = (endTs - startTs) / (1000 * 60 * 60 * 24);
    const yearsElapsed = daysElapsed / 365;
    const cagr = yearsElapsed > 0 ? (Math.pow(equity / initialCapital, 1 / yearsElapsed) - 1) * 100 : 0;
    
    const winRate = (winningTrades + losingTrades) > 0 ? (winningTrades / (winningTrades + losingTrades)) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    // Sharpe ratio estimation (Risk free rate ~ 0)
    // We can approximate it from the equity curve variance, but for now simple proxy:
    // Annualized Return / (Max Drawdown / 2) -> just an approximation
    const sharpeRatio = (cagr / (maxDrawdown || 1)).toFixed(2);

    return NextResponse.json({
      metrics: {
        totalProfit,
        totalFundingEarned,
        totalFundingPaid,
        totalFees,
        roi,
        cagr,
        winRate,
        profitFactor,
        maxDrawdown,
        sharpeRatio: Number(sharpeRatio),
        tradesCount: winningTrades + losingTrades
      },
      equityCurve,
      tradeLog: tradeLog.sort((a, b) => b.exitTime - a.exitTime) // latest first
    });

  } catch (error: any) {
    console.error('Backtest error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

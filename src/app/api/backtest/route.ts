import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

import { TAKER_FEES } from '@/lib/constants';

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
      longExchange,
      shortExchange,
      closeSpreadPct, 
      slippagePct 
    } = body;

    if (!longExchange || !shortExchange) {
      return NextResponse.json({ error: 'longExchange and shortExchange are required' }, { status: 400 });
    }

    const parseDate = (dStr: string) => {
      if (!dStr) return 0;
      const parts = dStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const [yyyy, mm, dd] = parts;
          return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
        }
        const [dd, mm, yyyy] = parts;
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
      }
      return new Date(dStr).getTime();
    };
    const startTs = parseDate(startDate);
    const endTs = parseDate(endDate);

    // ── Symbol normalization ─────────────────────────────────────────────────
    let dbSymbol = (symbol as string).trim().toUpperCase();

    if (!dbSymbol.includes('/')) {
      const quotes = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'BUSD'];
      for (const q of quotes) {
        if (dbSymbol.endsWith(q)) {
          dbSymbol = dbSymbol.slice(0, -q.length) + '/' + q;
          break;
        }
      }
    }

    console.log(`[Backtest] symbol="${symbol}" → normalized="${dbSymbol}", range=${startTs}–${endTs}`);

    // 1. Fetch historical data
    const { data: rows, error: fetchError } = await supabase
      .from('funding_rate_history')
      .select('*')
      .eq('symbol', dbSymbol)
      .gte('recorded_at', startTs)
      .lte('recorded_at', endTs)
      .order('recorded_at', { ascending: true });

    if (fetchError) {
      console.error('[Supabase] Backtest fetch error', fetchError);
      return NextResponse.json({ 
        error: `No historical data available yet. The system collects funding rate data every 15 minutes. Try selecting a more recent date range, or check back after the system has been running for a few hours. Technical detail: ${fetchError.message}` 
      }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      // Fetch available symbols for helpful error message
      const { data: available } = await supabase
        .from('funding_rate_history')
        .select('symbol')
        .gte('recorded_at', startTs)
        .lte('recorded_at', endTs)
        .limit(50);
        
      const uniqueSymbols = available ? Array.from(new Set(available.map(r => r.symbol))).slice(0, 10).join(', ') : '';
      
      return NextResponse.json(
        {
          error: `No historical data found for "${dbSymbol}" between ${startDate} and ${endDate}. ` +
                 `The system collects snapshots every 15 minutes via the cron job. ` +
                 `Available symbols in this range: ${uniqueSymbols || 'none yet — system may need more time to collect data.'}. ` +
                 `Tip: Try running /api/cron/snapshot manually to trigger an immediate data collection.`,
        },
        { status: 400 }
      );
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
    
    // Position state
    let entryLongPrice = 0;
    let entryShortPrice = 0;
    let notional = 0;
    let positionOpen = false;
    let isClosed = false; // flag to stop further simulation after early exit
    
    let cumFundingReceived = 0;
    let cumFundingPaid = 0;
    let totalExecCost = 0;
    
    let lastTime = timestamps[0];

    const chartData: any[] = [];
    const tradeLog: any[] = [];

    // 4. Simulation Loop
    for (const t of timestamps) {
      if (isClosed) break; // if position was closed early via closeSpreadPct, stop

      const snapshot = snapshots[t];
      const longData = snapshot[longExchange];
      const shortData = snapshot[shortExchange];

      // We need data for both exchanges to proceed (or we use last known rate if we wanted, but strict is safer)
      // For now, skip timestamps where one exchange is missing.
      if (!longData || !shortData) continue;

      const dtHours = (t - lastTime) / 3600000;
      lastTime = t;

      const longRate = longData.funding_rate;
      const shortRate = shortData.funding_rate;
      const longInterval = longData.funding_interval_hours || 8;
      const shortInterval = shortData.funding_interval_hours || 8;
      
      const longPrice = longData.price;
      const shortPrice = shortData.price;

      // Handle invalid $0 prices
      if (longPrice <= 0 || shortPrice <= 0) {
        continue; // Skip invalid prices
      }

      // Calculate spread in BPS
      const spreadBps = (shortRate - longRate) * 10000;
      const annualizedSpread = (shortRate * (8760 / shortInterval) * 100) - (longRate * (8760 / longInterval) * 100);

      if (!positionOpen) {
        // Enter Position
        entryLongPrice = longPrice;
        entryShortPrice = shortPrice;
        notional = equity * leverage;
        
        const entryFeesLong = notional * (TAKER_FEES[longExchange] ?? 0.0006);
        const entryFeesShort = notional * (TAKER_FEES[shortExchange] ?? 0.0006);
        const entrySlippage = notional * (slippagePct / 100) * 2;
        const entryCost = entryFeesLong + entryFeesShort + entrySlippage;

        totalExecCost += entryCost;
        equity -= entryCost;
        
        positionOpen = true;

        chartData.push({
          timestamp: t,
          longRate,
          shortRate,
          spreadBps,
          annualizedSpread,
          equity,
          cumNetPnL: equity - initialCapital,
          cumLongPnL: 0,
          cumShortPnL: 0
        });

        tradeLog.push({
          timestamp: t,
          longRate,
          shortRate,
          spreadBps,
          fundingEventPnL: 0,
          cumNetPnL: equity - initialCapital,
          event: 'ENTRY'
        });
        
        continue;
      }

      // Continuous funding accrual
      let fundingEventPnL = 0;
      if (dtHours > 0) {
        const longFundingAmt = (dtHours / longInterval) * longRate * notional;
        const shortFundingAmt = (dtHours / shortInterval) * shortRate * notional;

        // Long leg receives funding if rate < 0, pays if rate > 0
        if (longFundingAmt < 0) {
          cumFundingReceived += Math.abs(longFundingAmt);
          fundingEventPnL += Math.abs(longFundingAmt);
        } else {
          cumFundingPaid += Math.abs(longFundingAmt);
          fundingEventPnL -= Math.abs(longFundingAmt);
        }

        // Short leg receives funding if rate > 0, pays if rate < 0
        if (shortFundingAmt > 0) {
          cumFundingReceived += Math.abs(shortFundingAmt);
          fundingEventPnL += Math.abs(shortFundingAmt);
        } else {
          cumFundingPaid += Math.abs(shortFundingAmt);
          fundingEventPnL -= Math.abs(shortFundingAmt);
        }
      }

      // Price PnL
      const longPricePnl = ((longPrice - entryLongPrice) / entryLongPrice) * notional;
      const shortPricePnl = ((entryShortPrice - shortPrice) / entryShortPrice) * notional;
      const currentPricePnl = longPricePnl + shortPricePnl;

      const currentNetFunding = cumFundingReceived - cumFundingPaid;
      
      // Current equity BEFORE exit costs
      let currentEquity = initialCapital - totalExecCost + currentNetFunding + currentPricePnl;

      // Check early exit condition
      let exitTriggered = false;
      if (closeSpreadPct > 0 && annualizedSpread <= closeSpreadPct) {
        exitTriggered = true;
        isClosed = true;
      }

      if (exitTriggered) {
        // Apply exit costs
        const exitFeesLong = notional * (TAKER_FEES[longExchange] ?? 0.0006);
        const exitFeesShort = notional * (TAKER_FEES[shortExchange] ?? 0.0006);
        const exitSlippage = notional * (slippagePct / 100) * 2;
        const exitCost = exitFeesLong + exitFeesShort + exitSlippage;
        
        totalExecCost += exitCost;
        currentEquity -= exitCost;
      }

      equity = currentEquity;
      if (equity > peakEquity) peakEquity = equity;

      chartData.push({
        timestamp: t,
        longRate,
        shortRate,
        spreadBps,
        annualizedSpread,
        equity,
        cumNetPnL: equity - initialCapital,
        cumLongPnL: longPricePnl + currentNetFunding / 2, // approximation for chart
        cumShortPnL: shortPricePnl + currentNetFunding / 2
      });

      if (fundingEventPnL !== 0 || exitTriggered) {
        tradeLog.push({
          timestamp: t,
          longRate,
          shortRate,
          spreadBps,
          fundingEventPnL,
          cumNetPnL: equity - initialCapital,
          event: exitTriggered ? 'EXIT' : 'ACCRUAL'
        });
      }
    }

    // Force close at end if still open
    if (positionOpen && !isClosed) {
      const lastSnapshot = chartData[chartData.length - 1];
      const exitFeesLong = notional * (TAKER_FEES[longExchange] ?? 0.0006);
      const exitFeesShort = notional * (TAKER_FEES[shortExchange] ?? 0.0006);
      const exitSlippage = notional * (slippagePct / 100) * 2;
      const exitCost = exitFeesLong + exitFeesShort + exitSlippage;
      
      totalExecCost += exitCost;
      equity -= exitCost;
      
      if (lastSnapshot) {
        lastSnapshot.equity = equity;
        lastSnapshot.cumNetPnL = equity - initialCapital;
      }

      tradeLog.push({
        timestamp: lastTime,
        longRate: lastSnapshot?.longRate ?? 0,
        shortRate: lastSnapshot?.shortRate ?? 0,
        spreadBps: lastSnapshot?.spreadBps ?? 0,
        fundingEventPnL: 0,
        cumNetPnL: equity - initialCapital,
        event: 'EXIT'
      });
    }

    const totalProfit = equity - initialCapital;
    const roi = (totalProfit / initialCapital) * 100;
    
    const daysElapsed = (endTs - startTs) / (1000 * 60 * 60 * 24);
    const yearsElapsed = daysElapsed / 365;
    const cagr = yearsElapsed > 0 ? (Math.pow(Math.max(equity / initialCapital, 0), 1 / yearsElapsed) - 1) * 100 : 0;
    
    // We don't have separate "trades" in the same way, we just have one continuous position
    const maxDrawdown = peakEquity > 0 ? ((peakEquity - Math.min(...chartData.map(d => d.equity))) / peakEquity) * 100 : 0;

    const sharpeRatio = maxDrawdown > 0 ? (cagr / (maxDrawdown / 2)).toFixed(2) : '0.00';
    
    // Calculate final price PnL
    const lastPoint = chartData[chartData.length - 1];
    const finalPricePnl = lastPoint ? (lastPoint.cumLongPnL + lastPoint.cumShortPnL - (cumFundingReceived - cumFundingPaid)) : 0; // approximation
    // Let's accurately calculate it: Total PnL = Funding PnL + Price PnL - Fees
    // Therefore Price PnL = Total PnL - Funding PnL + Fees
    const exactPricePnL = totalProfit - (cumFundingReceived - cumFundingPaid) + totalExecCost;

    return NextResponse.json({
      metrics: {
        totalProfit,
        totalFundingPnL: cumFundingReceived - cumFundingPaid,
        totalPricePnL: exactPricePnL,
        totalExecCost,
        roi,
        cagr,
        maxDrawdown,
        sharpeRatio: Number(sharpeRatio) || 0
      },
      chartData,
      tradeLog: tradeLog.sort((a, b) => b.timestamp - a.timestamp) // latest first
    });

  } catch (error: unknown) {
    console.error('Backtest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

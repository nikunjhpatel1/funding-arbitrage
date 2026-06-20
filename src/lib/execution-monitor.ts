import { supabase } from './supabase';
import { TradingMode } from './trading-mode';
import crypto from 'crypto';

export enum OrderState {
  NEW = 'NEW',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELED = 'CANCELED',
  REJECTED = 'REJECTED'
}

export class ExecutionMonitor {
  static async logExecution(mode: TradingMode, positionId: string | null, level: 'INFO' | 'WARN' | 'ERROR', message: string) {
    if (mode === TradingMode.PAPER) return; // Add paper logs later if needed

    const isLive = mode === TradingMode.LIVE;
    const logTableName = isLive ? 'live_execution_logs' : 'demo_execution_logs';

    try {
      await supabase.from(logTableName).insert({
        id: crypto.randomUUID(),
        position_id: positionId,
        log_level: level,
        message,
        created_at: Date.now()
      });
    } catch (e) {
      console.error(`Failed to write execution log for ${mode}:`, e);
    }
  }

  static async monitorOrderStatus(mode: TradingMode, orderId: string, exchange: string) {
    // Advanced webhook / websocket polling goes here
    // For now, this acts as an interface that gets called when order status updates are received
    this.logExecution(mode, null, 'INFO', `Monitoring initiated for order ${orderId} on ${exchange}`);
  }
}

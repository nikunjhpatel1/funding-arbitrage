'use client';

import { Activity, DollarSign, Zap, TrendingUp } from 'lucide-react';
import type { EnrichedRow } from './FundingRateTable';

interface Props {
  data: EnrichedRow[];
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function fmtLarge(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export default function StatsGrid({ data }: Props) {
  const hotCount = data.filter((d) => d.computedOpportunity === 'hot').length;
  const avgSpread = data.reduce((s, d) => s + d.computedSpread, 0) / (data.length || 1);
  const totalVol = data.reduce((s, d) => s + d.volume24h, 0);
  const maxOpp = data.reduce((best, d) => (d.computedSpread > best.computedSpread ? d : best), data[0]);

  return (
    <div className="stats-grid">
      {/* Hot Opportunities */}
      <div className="stat-card green animate-fade-up animate-fade-up-1">
        <div className="stat-label">
          <Zap size={12} style={{ color: 'var(--positive)' }} />
          Hot Opportunities
        </div>
        <div className="stat-value" style={{ color: 'var(--positive)' }}>
          {hotCount}
        </div>
        <div className="stat-delta">
          {data.length} pairs tracked total
        </div>
      </div>

      {/* Avg Spread */}
      <div className="stat-card blue animate-fade-up animate-fade-up-2">
        <div className="stat-label">
          <Activity size={12} style={{ color: 'var(--accent-blue)' }} />
          Avg Max Spread
        </div>
        <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>
          {fmt(avgSpread * 100, 3)}%
        </div>
        <div className="stat-delta">per 8-hour funding period</div>
      </div>

      {/* Total Volume */}
      <div className="stat-card purple animate-fade-up animate-fade-up-3">
        <div className="stat-label">
          <DollarSign size={12} style={{ color: 'var(--accent-purple)' }} />
          24h Volume
        </div>
        <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>
          {fmtLarge(totalVol)}
        </div>
        <div className="stat-delta">across all tracked pairs</div>
      </div>

      {/* Best Opportunity */}
      <div className="stat-card green animate-fade-up animate-fade-up-4">
        <div className="stat-label">
          <TrendingUp size={12} style={{ color: 'var(--positive)' }} />
          Best Spread
        </div>
        <div className="stat-value" style={{ color: 'var(--positive)' }}>
          {maxOpp ? fmt(maxOpp.computedSpread * 100, 3) + '%' : '—'}
        </div>
        <div className="stat-delta">
          {maxOpp ? maxOpp.symbol : ''}
        </div>
      </div>
    </div>
  );
}

import { TrendingUp } from 'lucide-react';
import { TOTAL_EXCHANGES } from '@/lib/exchanges';

export default function Footer() {
  return (
    <footer className="footer content-layer">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <TrendingUp size={13} style={{ opacity: 0.5 }} />
        <span>
          © 2026 FundingArb. Live data from {TOTAL_EXCHANGES} exchanges. For personal use only.
        </span>
      </div>
    </footer>
  );
}

import { TrendingUp } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="footer content-layer">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <TrendingUp size={13} style={{ opacity: 0.5 }} />
        <span>
          © {new Date().getFullYear()} FundingArb. Data is simulated for demonstration purposes.
          Not financial advice.
        </span>
      </div>
    </footer>
  );
}

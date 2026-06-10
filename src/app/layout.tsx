import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'FundingArb – Crypto Funding Rate Arbitrage Platform',
  description:
    'Real-time funding rate data across perpetual exchanges. Identify arbitrage opportunities, monitor spreads, and maximize yield from funding rate differentials.',
  keywords: ['crypto', 'funding rate', 'arbitrage', 'perpetuals', 'DeFi', 'trading'],
  openGraph: {
    title: 'FundingArb – Crypto Funding Rate Arbitrage Platform',
    description: 'Real-time funding rate arbitrage data across top perpetual exchanges.',
    type: 'website',
  },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Ambient background layers */}
        <div className="bg-grid" aria-hidden="true" />
        <div className="bg-radial-1" aria-hidden="true" />
        <div className="bg-radial-2" aria-hidden="true" />

        <div className="page-wrapper content-layer">
          <Navbar />
          <main className="main-content">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}

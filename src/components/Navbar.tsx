'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, Bell, Settings } from 'lucide-react';

const NAV_LINKS = [
  { href: '/',          label: 'Dashboard' },
  { href: '/markets',   label: 'Markets'   },
  { href: '/positions', label: 'Positions' },
  { href: '/alerts',    label: 'Alerts'    },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link href="/" className="navbar-brand">
          <div className="brand-icon">
            <TrendingUp size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <span className="brand-name gradient-text">FundingArb</span>
        </Link>

        {/* Nav links */}
        <nav aria-label="Main navigation">
          <ul className="navbar-links">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={pathname === link.href ? 'active' : ''}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Right side */}
        <div className="navbar-right">
          <div className="live-badge" aria-label="Live data active">
            <span className="live-dot" />
            <span>Live</span>
          </div>
          <button className="btn btn-ghost" aria-label="Notifications" title="Notifications">
            <Bell size={15} />
          </button>
          <button className="btn btn-ghost" aria-label="Settings" title="Settings">
            <Settings size={15} />
          </button>
          <button className="btn btn-primary">
            Connect Wallet
          </button>
        </div>
      </div>
    </header>
  );
}

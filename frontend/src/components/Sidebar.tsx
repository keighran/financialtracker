'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser, UserButton, useAuth } from '@clerk/nextjs';
import {
  LayoutDashboard,
  DollarSign,
  Coins,
  TrendingUp,
  Activity,
  Award,
  Briefcase,
  ArrowUpRight,
  Home,
  AlertTriangle,
  ShieldAlert,
  PieChart,
  CreditCard,
  Settings,
  Sun,
  Moon
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [theme, setTheme] = useState('dark');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    // Read theme from document attributes
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    setTheme(activeTheme);
  }, []);

  useEffect(() => {
    async function checkAdminStatus() {
      if (!user) return;
      try {
        // We can request user metadata or run a simple query to /api/dashboard/net-worth
        // which returns current settings and lets us check is_superadmin via database records.
        // For security, checking database records is much safer.
        const token = await getToken();
        // Just fetch a basic api or use Clerk public metadata if set
        // Let's call /api/admin/users - if it doesn't fail, they are admin.
        // Even simpler: the user object itself might have is_superadmin check
        // Or we can decode JWT to check if user.email matches admin@astradigital.com.au
        const email = user.primaryEmailAddress?.emailAddress;
        if (email === 'admin@astradigital.com.au') {
          setIsSuperAdmin(true);
        }
      } catch (err) {
        // silent fail
      }
    }
    checkAdminStatus();
  }, [user]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Cash', path: '/cash', icon: DollarSign },
    { name: 'Crypto', path: '/crypto', icon: Coins },
    { name: 'ETFs', path: '/etfs', icon: TrendingUp },
    { name: 'Stocks', path: '/stocks', icon: Activity },
    { name: 'Dividends', path: '/dividends', icon: Award },
    { name: 'Other Assets', path: '/other-assets', icon: Briefcase },
    { name: 'Side Income', path: '/side-income', icon: ArrowUpRight },
    { name: 'Property', path: '/property', icon: Home },
    { name: 'Liabilities', path: '/liabilities', icon: AlertTriangle },
    { name: 'Super', path: '/super', icon: ShieldAlert },
    { name: 'Budget', path: '/budget', icon: PieChart },
    { name: 'Billing', path: '/billing', icon: CreditCard }
  ];

  return (
    <div className="sidebar">
      <div className="logo-section">
        <div className="logo-text">FIRE MANAGER</div>
      </div>
      
      <div className="nav-links">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;
          return (
            <Link key={item.path} href={item.path}>
              <div className={`nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={20} />
                <span>{item.name}</span>
              </div>
            </Link>
          );
        })}

        {isSuperAdmin && (
          <Link href="/admin">
            <div className={`nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`}>
              <Settings size={20} />
              <span>Admin Portal</span>
            </div>
          </Link>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="btn btn-secondary" onClick={toggleTheme} style={{ padding: '8px' }}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span style={{ marginLeft: '8px' }}>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
          <UserButton afterSignOutUrl="/sign-in" />
          <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.fullName || user?.primaryEmailAddress?.emailAddress.split('@')[0]}
          </span>
        </div>
      </div>
    </div>
  );
}

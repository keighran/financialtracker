'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { CreditCard, Check, Sparkles, AlertCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function Billing() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetchSub();
  }, [user]);

  useEffect(() => {
    if (searchParams.get('success')) {
      setMsg('Subscription updated successfully! Welcome to your new plan.');
    } else if (searchParams.get('canceled')) {
      setMsg('Stripe checkout was canceled.');
    }
  }, [searchParams]);

  const fetchSub = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      // Fetch user profile settings containing subscription status
      const data = await fetchWithAuth('/api/dashboard/net-worth', token);
      // Let's assume the subscription status is returned inside that or we can get it from there
      setSubStatus(data?.settings);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tier: string) => {
    if (!user) return;
    setLoadingTier(tier);
    try {
      const token = await getToken();
      const res = await fetchWithAuth('/api/billing/checkout?tier=' + tier, token, {
        method: 'POST'
      });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Billing error');
    } finally {
      setLoadingTier(null);
    }
  };

  const handlePortal = async () => {
    if (!user) return;
    try {
      const token = await getToken();
      const res = await fetchWithAuth('/api/billing/portal', token, {
        method: 'POST'
      });
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      console.error(err);
      alert('Could not open billing portal. Ensure you have an active subscription.');
    }
  };

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Subscription & Billing</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Choose a plan that fits your wealth-tracking complexity level.
          </p>
        </div>
      </div>

      {msg && (
        <div className="alert alert-info" style={{ marginBottom: '32px' }}>
          <Sparkles size={18} />
          <span>{msg}</span>
        </div>
      )}

      {/* Plans comparison cards */}
      <div className="grid-container" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', alignItems: 'stretch' }}>
        
        {/* FREE */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Free Tier</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Basic liquid asset aggregation and targets modeling.
          </p>
          <div style={{ fontSize: '2.5rem', fontFamily: 'Outfit', fontWeight: 800, marginBottom: '24px' }}>
            $0<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-secondary)' }}> / month</span>
          </div>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Cash Accounts CRUD</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Superannuation aggregation</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Simple net worth dashboard</li>
          </ul>

          <button className="btn btn-secondary" style={{ marginTop: 'auto', width: '100%' }} disabled>
            Active Plan
          </button>
        </div>

        {/* PRO */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px', borderColor: 'var(--accent-color)', boxShadow: '0 0 15px rgba(15, 118, 110, 0.1)' }}>
          <div style={{ position: 'absolute', top: '16px', right: '16px', backgroundColor: 'var(--accent-light)', color: 'var(--accent-color)', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
            RECOMMENDED
          </div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Pro Wealth</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Real-time equity feeds, property amortisations, and CGT calculators.
          </p>
          <div style={{ fontSize: '2.5rem', fontFamily: 'Outfit', fontWeight: 800, marginBottom: '24px' }}>
            $19<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-secondary)' }}> / month</span>
          </div>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> All Free features</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Crypto, ETF & Stocks ledgers</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Real Estate mortgages tracking</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> CGT FIFO FIFO engine</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Franked dividend gross-ups</li>
          </ul>

          <button className="btn btn-primary" style={{ marginTop: 'auto', width: '100%' }} onClick={() => handleUpgrade('PRO')} disabled={loadingTier !== null}>
            {loadingTier === 'PRO' ? 'Upgrading...' : 'Upgrade to Pro'}
          </button>
        </div>

        {/* ENTERPRISE */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '32px' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Enterprise</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Multiple portfolios, advanced projection curves, and personal tax advisory integration.
          </p>
          <div style={{ fontSize: '2.5rem', fontFamily: 'Outfit', fontWeight: 800, marginBottom: '24px' }}>
            $49<span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-secondary)' }}> / month</span>
          </div>
          
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> All Pro features</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Multi-portfolio isolation</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Negative Gearing projections</li>
            <li style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Check size={16} style={{ color: 'var(--success-color)' }} /> Priority Customer Support</li>
          </ul>

          <button className="btn btn-secondary" style={{ marginTop: 'auto', width: '100%' }} onClick={() => handleUpgrade('ENTERPRISE')} disabled={loadingTier !== null}>
            {loadingTier === 'ENTERPRISE' ? 'Upgrading...' : 'Get Enterprise'}
          </button>
        </div>

      </div>

      <div className="card" style={{ marginTop: '36px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Stripe Customer Billing Portal</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
          Manage your payments, view history, or change billing credentials directly through Stripe's secure portal interface.
        </p>
        <button className="btn btn-secondary" onClick={handlePortal}>
          Open Stripe Portal <CreditCard size={16} />
        </button>
      </div>
    </div>
  );
}

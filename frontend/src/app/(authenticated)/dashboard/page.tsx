'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { fetchWithAuth } from '@/lib/api';
import { Landmark, ArrowUpRight, TrendingUp, Sparkles, HelpCircle, Activity } from 'lucide-react';

export default function Dashboard() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nwData, setNwData] = useState<any>(null);
  const [fireData, setFireData] = useState<any>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      // Single combined endpoint returns net worth + settings + FIRE projection,
      // with net worth computed once on the backend.
      const overview = await fetchWithAuth('/api/dashboard/overview', token);
      setNwData(overview);
      setFireData(overview.fire);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const takeSnapshot = async () => {
    if (!user) return;
    setSnapshotLoading(true);
    setMsg('');
    try {
      const token = await getToken();
      await fetchWithAuth('/api/dashboard/snapshot', token, { method: 'POST' });
      setMsg('Monthly wealth snapshot recorded successfully!');
    } catch (err: any) {
      setMsg(`Failed to save snapshot: ${err.message}`);
    } finally {
      setSnapshotLoading(false);
    }
  };

  if (!mounted) return null;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Loading wealth data...</div>
      </div>
    );
  }

  // Fallbacks
  const summary = nwData?.summary || {
    cash: 0, superannuation: 0, equities: 0, crypto: 0, property: 0, other_assets: 0, mortgages: 0, liabilities: 0, total_assets: 0, total_debts: 0, net_worth: 0
  };
  const settings = nwData?.settings || { fire_target_annual_spend: 0, fire_safe_withdrawal_rate: 0.04 };
  const fireNumber = fireData?.fire_number || 0;
  const fireYear = fireData?.fire_year || -1;
  const annualSavings = fireData?.annual_savings || 0;

  // Pie chart data
  const pieData = [
    { name: 'Cash', value: parseFloat(summary.cash) },
    { name: 'Super', value: parseFloat(summary.superannuation) },
    { name: 'Equities', value: parseFloat(summary.equities) },
    { name: 'Crypto', value: parseFloat(summary.crypto) },
    { name: 'Property', value: parseFloat(summary.property) },
    { name: 'Other Assets', value: parseFloat(summary.other_assets) }
  ].filter(d => d.value > 0);

  const COLORS = ['#0f766e', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  // Projections
  const chartData = fireData?.projection || [];

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Wealth Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Welcome back, {user?.firstName || 'Wealth Tracker'}! Here is your active financial position.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={takeSnapshot} disabled={snapshotLoading}>
            {snapshotLoading ? 'Saving...' : 'Record Monthly Snapshot'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="alert alert-info" style={{ marginBottom: '24px' }}>
          <Sparkles size={18} />
          <span>{msg}</span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid-container">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Net Worth</span>
            <Landmark size={18} style={{ color: 'var(--accent-color)' }} />
          </div>
          <div className="metric-value">${summary.net_worth.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Assets: ${summary.total_assets.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span>
            <span>Debts: ${summary.total_debts.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Annual Savings Speed</span>
            <ArrowUpRight size={18} style={{ color: 'var(--success-color)' }} />
          </div>
          <div className="metric-value">${annualSavings.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Savings rate: ${Math.round(annualSavings / 12).toLocaleString('en-AU')} / month
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">FIRE Target</span>
            <TrendingUp size={18} style={{ color: 'var(--accent-color)' }} />
          </div>
          <div className="metric-value">${fireNumber.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {fireYear > 0 ? `Achievable in ${fireYear} years` : 'Savings insufficient or targets unconfigured'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '36px' }}>
        {/* Projections graph */}
        <div className="card">
          <h3 style={{ fontSize: '1.2rem', marginBottom: '24px' }}>40-Year Net Worth Projections</h3>
          <div style={{ height: '320px', width: '100%' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorNw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="year" name="Year" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value) => [`$${Number(value ?? 0).toLocaleString()}`, 'Value']} labelFormatter={(label) => `Year ${label}`} />
                  <Area type="monotone" dataKey="net_worth" stroke="var(--accent-color)" strokeWidth={2} fillOpacity={1} fill="url(#colorNw)" name="Projected Net Worth" />
                  <Area type="monotone" dataKey="target_fire_number" stroke="#f59e0b" strokeWidth={1} strokeDasharray="5 5" fill="none" name="Inflated FIRE Target" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                No projection data available. Add budget inputs to begin.
              </div>
            )}
          </div>
        </div>

        {/* Allocation */}
        <div className="card">
          <h3 style={{ fontSize: '1.2rem', marginBottom: '24px' }}>Asset Allocation</h3>
          <div style={{ height: '240px', width: '100%' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `$${Number(v ?? 0).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                No assets recorded yet.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', justifyContent: 'center', marginTop: '16px', fontSize: '0.85rem' }}>
            {pieData.map((d, index) => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: COLORS[index % COLORS.length] }} />
                <span style={{ color: 'var(--text-secondary)' }}>{d.name} ({Math.round(d.value / summary.total_assets * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Award, Plus, HelpCircle } from 'lucide-react';

export default function DividendsLedger() {
  const { user } = useUser();
  const [dividends, setDividends] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [accountId, setAccountId] = useState('');
  const [assetTicker, setAssetTicker] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [unitsHeld, setUnitsHeld] = useState('');
  const [frankingPercentage, setFrankingPercentage] = useState('100');
  const [isDrp, setIsDrp] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchDividendData();
  }, [user]);

  const fetchDividendData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getToken();
      const allAccounts = await fetchWithAuth('/api/ledgers/cash/accounts', token);
      setAccounts(allAccounts);
      if (allAccounts.length > 0) {
        setAccountId(allAccounts[0].id.toString());
      }
      
      const port = await fetchWithAuth('/api/ledgers/equities/portfolio', token);
      setPortfolio(port);
      if (port.length > 0) {
        setAssetTicker(port[0].ticker);
      }

      const summary = await fetchWithAuth('/api/tax-projections/dividends', token);
      setDividends(summary);
    } catch (err) {
      console.error('Error fetching dividend data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    if (portfolio.length > 0) {
      setAssetTicker(portfolio[0].ticker);
    }
    const today = new Date().toISOString().substring(0, 10);
    setPaymentDate(today);
    setNetAmount('');
    setUnitsHeld('');
    setFrankingPercentage('100');
    setIsDrp(false);
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await user.getToken();
      
      await fetchWithAuth('/api/ledgers/dividends', token, {
        method: 'POST',
        body: JSON.stringify({
          account_id: parseInt(accountId),
          asset_ticker: assetTicker,
          payment_date: new Date(paymentDate).toISOString(),
          net_amount: parseFloat(netAmount),
          units_held: parseFloat(unitsHeld),
          franking_percentage: parseFloat(frankingPercentage),
          is_drp: isDrp,
          notes
        })
      });
      
      setShowModal(false);
      fetchDividendData();
    } catch (err) {
      console.error('Error recording dividend:', err);
    }
  };

  const totalNet = dividends.reduce((sum, d) => sum + parseFloat(d.net_amount), 0);
  const totalFranking = dividends.reduce((sum, d) => sum + parseFloat(d.franking_credit), 0);
  const totalGrossed = dividends.reduce((sum, d) => sum + parseFloat(d.grossed_up_dividend), 0);
  const totalTaxPayable = dividends.reduce((sum, d) => sum + parseFloat(d.net_tax_payable), 0);

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Dividend Income</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Replicate dividend receipts, franking credit gross-ups, and net tax offsets.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal} disabled={portfolio.length === 0}>
          <Plus size={18} /> Record Dividend
        </button>
      </div>

      {portfolio.length === 0 && (
        <div className="alert alert-info" style={{ backgroundColor: 'rgba(217, 119, 6, 0.1)', borderColor: 'var(--warning-color)', color: 'var(--warning-color)', marginBottom: '24px' }}>
          <HelpCircle size={18} />
          <span>You must add equities (ETFs or Stocks) to your portfolio before you can log dividends.</span>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-title">Net Dividends Received</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalNet.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Franking Credits</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: 'var(--success-color)' }}>
            ${totalFranking.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Grossed-up Dividend</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalGrossed.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Net Tax Liability / Offset</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: totalTaxPayable <= 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
            ${totalTaxPayable.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '32px', backgroundColor: 'var(--accent-light)', borderColor: 'var(--accent-color)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <HelpCircle size={20} style={{ color: 'var(--accent-color)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--accent-color)', fontWeight: 500 }}>
            Australian franking credits represent company tax already paid. At tax time, your dividend income is grossed up, and you receive the credits as an offset against your personal income tax.
          </span>
        </div>
      </div>

      {/* History Table */}
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading dividends...</div>
        ) : dividends.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset</th>
                <th>Net Paid</th>
                <th>Franking Credit</th>
                <th>Grossed-up</th>
                <th>Tax on Gross</th>
                <th>Net Tax Payable</th>
                <th>After-Tax Income</th>
              </tr>
            </thead>
            <tbody>
              {dividends.map((d) => (
                <tr key={d.id}>
                  <td><strong>{new Date(d.date).toLocaleDateString('en-AU')}</strong></td>
                  <td>{d.ticker}</td>
                  <td>${parseFloat(d.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${parseFloat(d.franking_credit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${parseFloat(d.grossed_up_dividend).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${parseFloat(d.tax_payable).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: parseFloat(d.net_tax_payable) <= 0 ? 'var(--success-color)' : 'var(--text-primary)', fontWeight: 600 }}>
                    ${parseFloat(d.net_tax_payable).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ color: 'var(--success-color)', fontWeight: 600 }}>
                    ${parseFloat(d.after_tax_income).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No dividend payouts recorded.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Record Dividend Receipt</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Asset (from Portfolio)</label>
                  <select className="form-input" value={assetTicker} onChange={(e) => setAssetTicker(e.target.value)} required>
                    {portfolio.map(h => (
                      <option key={h.ticker} value={h.ticker}>{h.ticker} - {h.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Net Dividend Paid ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={netAmount}
                    onChange={(e) => setNetAmount(e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Franking Percentage (%)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={frankingPercentage}
                    onChange={(e) => setFrankingPercentage(e.target.value)}
                    min="0"
                    max="100"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Units Held at Ex-Date</label>
                  <input
                    type="number"
                    className="form-input"
                    value={unitsHeld}
                    onChange={(e) => setUnitsHeld(e.target.value)}
                    step="0.0001"
                    required
                  />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%', paddingTop: '32px' }}>
                  <input
                    type="checkbox"
                    checked={isDrp}
                    onChange={(e) => setIsDrp(e.target.checked)}
                    id="isDrp"
                  />
                  <label htmlFor="isDrp" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Reinvested (DRP)</label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Deposit Broker Account</label>
                <select className="form-input" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.institution})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input
                  type="text"
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Record Dividend
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

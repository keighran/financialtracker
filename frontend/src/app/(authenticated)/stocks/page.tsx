'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Activity, Plus, Trash2 } from 'lucide-react';

export default function StocksLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [accountId, setAccountId] = useState('');
  const [ticker, setTicker] = useState('ASX:CBA');
  const [assetName, setAssetName] = useState('Commonwealth Bank of Australia');
  const [txnType, setTxnType] = useState('Buy');
  const [date, setDate] = useState('');
  const [units, setUnits] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [fees, setFees] = useState('9.95');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchStockData();
  }, [user]);

  const fetchStockData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      // Brokerage-type investment accounts fund stock/ETF transactions.
      const investAccounts = await fetchWithAuth('/api/ledgers/investment/accounts', token);
      const brokerageAccounts = investAccounts.filter((a: any) => a.type === 'Brokerage');
      setAccounts(brokerageAccounts);
      if (brokerageAccounts.length > 0) {
        setAccountId(brokerageAccounts[0].id.toString());
      }

      const port = await fetchWithAuth('/api/ledgers/equities/portfolio', token);
      setPortfolio(port.filter((h: any) => h.asset_class === 'Stock'));
      
      const txs = await fetchWithAuth('/api/ledgers/transactions', token);
      setTransactions(txs.filter((t: any) => t.asset && t.asset.asset_class === 'Stock'));
    } catch (err) {
      console.error('Error fetching Stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setTicker('ASX:CBA');
    setAssetName('Commonwealth Bank of Australia');
    setTxnType('Buy');
    const today = new Date().toISOString().substring(0, 16);
    setDate(today);
    setUnits('');
    setPricePerUnit('');
    setFees('9.95');
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      let activeAccountId = accountId;
      if (!activeAccountId) {
        const defAcc = await fetchWithAuth('/api/ledgers/investment/accounts', token, {
          method: 'POST',
          body: JSON.stringify({
            name: 'Primary Brokerage Account',
            institution: 'CommSec / Selfwealth',
            asset_class: 'Stock',
            currency: 'AUD',
            notes: 'Main Share Broker Account'
          })
        });
        activeAccountId = defAcc.id.toString();
      }

      const parsedUnits = parseFloat(units);
      const parsedPrice = parseFloat(pricePerUnit);
      const parsedFees = parseFloat(fees);
      const amount = parsedUnits * parsedPrice;

      await fetchWithAuth('/api/ledgers/transactions', token, {
        method: 'POST',
        body: JSON.stringify({
          account_id: parseInt(activeAccountId),
          ticker,
          asset_name: assetName,
          type: txnType,
          asset_class: 'Stock',
          date: new Date(date).toISOString(),
          units: parsedUnits,
          price_per_unit: parsedPrice,
          amount,
          fees: parsedFees,
          notes
        })
      });
      
      setShowModal(false);
      fetchStockData();
    } catch (err) {
      console.error('Error saving Stock transaction:', err);
    }
  };

  const totalValue = portfolio.reduce((sum, h) => sum + parseFloat(h.market_value), 0);
  const totalCost = portfolio.reduce((sum, h) => sum + parseFloat(h.total_cost), 0);
  const totalGain = totalValue - totalCost;

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Individual Stocks</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Track direct equity allocations, average entry costs, and transaction histories.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Record Trade
        </button>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-title">Total Stocks Portfolio Value</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Invested Cost</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalCost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Net Gains</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: totalGain >= 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
            ${totalGain.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.25rem', margin: '32px 0 16px' }}>Current Stock Holdings</h2>
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>Loading portfolio...</div>
        ) : portfolio.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Stock Name</th>
                <th>Units</th>
                <th>Avg Cost</th>
                <th>Last Price</th>
                <th>Invested Capital</th>
                <th>Market Value</th>
                <th>Total Return</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((h) => (
                <tr key={h.ticker}>
                  <td><strong>{h.ticker}</strong></td>
                  <td>{h.name}</td>
                  <td>{parseFloat(h.units).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                  <td>${parseFloat(h.avg_cost).toFixed(2)}</td>
                  <td>${parseFloat(h.current_price).toFixed(2)}</td>
                  <td>${parseFloat(h.total_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${parseFloat(h.market_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ color: parseFloat(h.gain) >= 0 ? 'var(--success-color)' : 'var(--error-color)', fontWeight: 600 }}>
                    ${parseFloat(h.gain).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({parseFloat(h.gain_pct).toFixed(2)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No stock holdings registered. Click "Record Trade" to record an acquisition.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Record Stock Purchase/Sale</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Ticker Code</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    placeholder="e.g. ASX:CBA, NASDAQ:AAPL"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Transaction Type</label>
                  <select className="form-input" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                    <option value="Buy">Buy</option>
                    <option value="Sell">Sell</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Transaction Date</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Units</label>
                  <input
                    type="number"
                    className="form-input"
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    step="0.0001"
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Price per Unit ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={pricePerUnit}
                    onChange={(e) => setPricePerUnit(e.target.value)}
                    step="0.01"
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Brokerage Fee ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={fees}
                    onChange={(e) => setFees(e.target.value)}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Broker Account</label>
                <select className="form-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.institution})</option>
                  ))}
                  {accounts.length === 0 && <option value="">Auto-create brokerage account</option>}
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
                  Record Trade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

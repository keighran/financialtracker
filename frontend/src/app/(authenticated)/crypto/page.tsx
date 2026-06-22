'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Coins, Plus, Trash2 } from 'lucide-react';

export default function CryptoLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [accountId, setAccountId] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('BTC');
  const [tokenName, setTokenName] = useState('Bitcoin');
  const [txnType, setTxnType] = useState('Buy');
  const [date, setDate] = useState('');
  const [units, setUnits] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [fees, setFees] = useState('0');
  const [notes, setNotes] = useState('');

  // Coin reference list (from CoinGecko via backend) for the searchable picker
  const [coins, setCoins] = useState<any[]>([]);
  const [coinQuery, setCoinQuery] = useState('Bitcoin (BTC)');
  const [showCoinDropdown, setShowCoinDropdown] = useState(false);

  useEffect(() => {
    fetchCryptoData();
  }, [user]);

  const fetchCryptoData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      // Holdings come from accounts of type Brokerage/Crypto; keep only Crypto.
      const port = await fetchWithAuth('/api/ledgers/equities/portfolio', token);
      setPortfolio(port.filter((h: any) => h.asset_class === 'Crypto'));

      const txs = await fetchWithAuth('/api/ledgers/transactions', token);
      setTransactions(txs.filter((t: any) => t.asset && t.asset.asset_class === 'Crypto'));

      // Funding accounts for crypto are the Crypto-type investment accounts.
      const investAccounts = await fetchWithAuth('/api/ledgers/investment/accounts', token);
      const cryptoAccounts = investAccounts.filter((a: any) => a.type === 'Crypto');
      setAccounts(cryptoAccounts);
      if (cryptoAccounts.length > 0) {
        setAccountId(cryptoAccounts[0].id.toString());
      }

      // Load the coin reference list for the searchable picker (best-effort).
      try {
        const coinList = await fetchWithAuth('/api/ledgers/crypto/coins', token);
        setCoins(coinList);
      } catch (e) {
        console.warn('Coin list unavailable, falling back to manual entry.');
      }
    } catch (err) {
      console.error('Error fetching crypto data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setTokenSymbol('BTC');
    setTokenName('Bitcoin');
    setCoinQuery('Bitcoin (BTC)');
    setShowCoinDropdown(false);
    setTxnType('Buy');
    const today = new Date().toISOString().substring(0, 16);
    setDate(today);
    setUnits('');
    setPricePerUnit('');
    setFees('0');
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      
      // If no account exists, we create a default "Crypto Exchange" account of type CASH or CRYPTO
      let activeAccountId = accountId;
      if (!activeAccountId) {
        // Create a default Crypto investment account (type Crypto) so holdings
        // are picked up by the portfolio and net-worth calculations.
        const defAcc = await fetchWithAuth('/api/ledgers/investment/accounts', token, {
          method: 'POST',
          body: JSON.stringify({
            name: 'Crypto Exchange Wallet',
            institution: 'Binance / Coinbase',
            asset_class: 'Crypto',
            currency: 'AUD',
            notes: 'Auto-generated Wallet'
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
          ticker: tokenSymbol,
          asset_name: tokenName,
          type: txnType,
          asset_class: 'Crypto',
          date: new Date(date).toISOString(),
          units: parsedUnits,
          price_per_unit: parsedPrice,
          amount,
          fees: parsedFees,
          notes
        })
      });
      
      setShowModal(false);
      fetchCryptoData();
    } catch (err) {
      console.error('Error saving crypto transaction:', err);
    }
  };

  const totalValue = portfolio.reduce((sum, h) => sum + parseFloat(h.market_value), 0);
  const totalCost = portfolio.reduce((sum, h) => sum + parseFloat(h.total_cost), 0);
  const totalGain = totalValue - totalCost;

  const selectCoin = (c: any) => {
    setTokenSymbol(c.symbol);
    setTokenName(c.name);
    setCoinQuery(`${c.name} (${c.symbol})`);
    setShowCoinDropdown(false);
  };

  const coinFilter = coinQuery.trim().toLowerCase();
  const filteredCoins = (
    coinFilter
      ? coins.filter(
          (c) =>
            c.name.toLowerCase().includes(coinFilter) ||
            c.symbol.toLowerCase().includes(coinFilter)
        )
      : coins
  ).slice(0, 50);

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Cryptocurrency</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Track token transactions, average costs, and net values of holdings.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Record Transaction
        </button>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-title">Total Crypto Value</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Cost Basis</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalCost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Unrealised Gain</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: totalGain >= 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
            ${totalGain.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.25rem', margin: '32px 0 16px' }}>Active Crypto Holdings</h2>
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>Loading holdings...</div>
        ) : portfolio.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Units Held</th>
                <th>Avg Buy Price</th>
                <th>Current Price</th>
                <th>Total Cost</th>
                <th>Market Value</th>
                <th>Gain / Loss</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((h) => (
                <tr key={h.ticker}>
                  <td><strong>{h.ticker}</strong></td>
                  <td>{h.name}</td>
                  <td>{parseFloat(h.units).toFixed(6)}</td>
                  <td>${parseFloat(h.avg_cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                  <td>${parseFloat(h.current_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
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
            No active cryptocurrency holdings. Record a transaction to see your wallet metrics.
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '1.25rem', margin: '32px 0 16px' }}>Transaction History</h2>
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading transactions...</div>
        ) : transactions.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Units</th>
                <th>Price per Unit</th>
                <th>Amount</th>
                <th>Fees</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{t.asset?.ticker} ({t.asset?.name})</td>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: t.type === 'Buy' ? 'var(--accent-light)' : 'rgba(220, 38, 38, 0.1)',
                      color: t.type === 'Buy' ? 'var(--accent-color)' : 'var(--error-color)'
                    }}>
                      {t.type}
                    </span>
                  </td>
                  <td>{parseFloat(t.units).toFixed(6)}</td>
                  <td>${parseFloat(t.price_per_unit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                  <td>${parseFloat(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>${parseFloat(t.fees).toLocaleString()}</td>
                  <td>{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No transaction records found.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Record Cryptocurrency Transaction</h3>
            <form onSubmit={handleSubmit}>
              {coins.length > 0 ? (
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Cryptocurrency</label>
                  <input
                    type="text"
                    className="form-input"
                    value={coinQuery}
                    onChange={(e) => { setCoinQuery(e.target.value); setShowCoinDropdown(true); }}
                    onFocus={() => setShowCoinDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCoinDropdown(false), 150)}
                    placeholder="Search by name or symbol (e.g. Bitcoin, BTC)"
                    autoComplete="off"
                  />
                  {showCoinDropdown && filteredCoins.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, maxHeight: '220px', overflowY: 'auto', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', marginTop: '4px', boxShadow: 'var(--card-shadow)' }}>
                      {filteredCoins.map((c) => (
                        <div
                          key={c.id}
                          onMouseDown={() => selectCoin(c)}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.9rem', borderBottom: '1px solid var(--border-color)' }}
                        >
                          <strong>{c.symbol}</strong> <span style={{ color: 'var(--text-secondary)' }}>— {c.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Selected: <strong>{tokenSymbol}</strong> ({tokenName})
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Token Symbol</label>
                    <input
                      type="text"
                      className="form-input"
                      value={tokenSymbol}
                      onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                      placeholder="e.g. BTC, ETH"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Token Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder="e.g. Bitcoin, Ethereum"
                      required
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Transaction Type</label>
                  <select className="form-input" value={txnType} onChange={(e) => setTxnType(e.target.value)}>
                    <option value="Buy">Buy</option>
                    <option value="Sell">Sell</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Transaction Date & Time</label>
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
                    step="0.00000001"
                    min="0.00000001"
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
                    step="0.0001"
                    min="0"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Brokerage Fees ($)</label>
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
                <label className="form-label">Funding Account / Wallet</label>
                <select className="form-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.institution})</option>
                  ))}
                  {accounts.length === 0 && <option value="">Auto-create default Exchange Wallet</option>}
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
                  Save Transaction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

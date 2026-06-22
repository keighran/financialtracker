'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { ShieldAlert, Plus, Trash2, Edit3, Award } from 'lucide-react';

export default function SuperLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccModal, setShowAccModal] = useState(false);
  const [showHistModal, setShowHistModal] = useState(false);

  // Account form states
  const [editingAccId, setEditingAccId] = useState<number | null>(null);
  const [accName, setAccName] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accBalance, setAccBalance] = useState('0');
  const [accNotes, setAccNotes] = useState('');

  // History form states
  const [histDate, setHistDate] = useState('');
  const [histSetting, setHistSetting] = useState('High Growth 100%');
  const [histVoluntary, setHistVoluntary] = useState('0');
  const [histTotalValue, setHistTotalValue] = useState('0');

  useEffect(() => {
    fetchSuperData();
  }, [user]);

  const fetchSuperData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const accs = await fetchWithAuth('/api/ledgers/super/accounts', token);
      setAccounts(accs);
      const hist = await fetchWithAuth('/api/ledgers/super/history', token);
      setHistory(hist);
    } catch (err) {
      console.error('Error fetching super data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      const body = {
        name: accName,
        institution: accInstitution,
        balance: parseFloat(accBalance),
        notes: accNotes
      };

      if (editingAccId) {
        await fetchWithAuth(`/api/ledgers/super/accounts/${editingAccId}`, token, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await fetchWithAuth('/api/ledgers/super/accounts', token, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      
      setShowAccModal(false);
      fetchSuperData();
    } catch (err) {
      console.error('Error saving super account:', err);
    }
  };

  const handleHistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      const body = {
        record_date: new Date(histDate).toISOString(),
        super_setting: histSetting,
        voluntary_contribution: parseFloat(histVoluntary),
        total_value: parseFloat(histTotalValue)
      };

      await fetchWithAuth('/api/ledgers/super/history', token, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      
      setShowHistModal(false);
      fetchSuperData();
    } catch (err) {
      console.error('Error saving history record:', err);
    }
  };

  const handleAccDelete = async (id: number) => {
    if (!user || !confirm('Are you sure you want to delete this super account?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/ledgers/super/accounts/${id}`, token, {
        method: 'DELETE'
      });
      fetchSuperData();
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  const openAddAcc = () => {
    setEditingAccId(null);
    setAccName('');
    setAccInstitution('');
    setAccBalance('0');
    setAccNotes('');
    setShowAccModal(true);
  };

  const openEditAcc = (a: any) => {
    setEditingAccId(a.id);
    setAccName(a.name);
    setAccInstitution(a.institution || '');
    setAccBalance(a.current_valuation.toString());
    setAccNotes(a.notes || '');
    setShowAccModal(true);
  };

  const openAddHist = () => {
    const today = new Date().toISOString().substring(0, 10);
    setHistDate(today);
    setHistSetting('High Growth 100%');
    setHistVoluntary('0');
    setHistTotalValue('0');
    setShowHistModal(true);
  };

  const totalSuper = accounts.reduce((sum, a) => sum + parseFloat(a.current_valuation), 0);

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Superannuation</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Replicate personal retirement accounts and track monthly performance histories.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={openAddHist}>
            Record Month Log
          </button>
          <button className="btn btn-primary" onClick={openAddAcc}>
            <Plus size={18} /> Add Super Fund
          </button>
        </div>
      </div>

      <div className="grid-container">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Total Super Balance</span>
            <ShieldAlert size={18} style={{ color: 'var(--accent-color)' }} />
          </div>
          <div className="metric-value">${totalSuper.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      <h2 style={{ fontSize: '1.25rem', margin: '32px 0 16px' }}>Super Funds</h2>
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading funds...</div>
        ) : accounts.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Fund Name</th>
                <th>Provider</th>
                <th>Current Balance</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.institution}</td>
                  <td>${parseFloat(a.current_valuation).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                  <td>{a.notes}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" onClick={() => openEditAcc(a)} style={{ padding: '6px' }}>
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleAccDelete(a.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No super funds declared. Click "Add Super Fund" to register one.
          </div>
        )}
      </div>

      <h2 style={{ fontSize: '1.25rem', margin: '32px 0 16px' }}>Performance History Logs</h2>
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading history...</div>
        ) : history.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset Allocation / Setting</th>
                <th>Voluntary Contributions</th>
                <th>Total Value</th>
                <th>Gain from App</th>
                <th>Gain (%)</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.record_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</td>
                  <td>{h.super_setting}</td>
                  <td>${parseFloat(h.voluntary_contribution).toLocaleString()}</td>
                  <td>${parseFloat(h.total_value).toLocaleString()}</td>
                  <td style={{ color: parseFloat(h.gain) >= 0 ? 'var(--success-color)' : 'var(--error-color)', fontWeight: 600 }}>
                    ${parseFloat(h.gain).toLocaleString()}
                  </td>
                  <td style={{ color: parseFloat(h.gain) >= 0 ? 'var(--success-color)' : 'var(--error-color)', fontWeight: 600 }}>
                    {(parseFloat(h.gain_pct) * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No history logs recorded. Click "Record Month Log" to record the first entry.
          </div>
        )}
      </div>

      {showAccModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
              {editingAccId ? 'Edit Superannuation Fund' : 'Add Superannuation Fund'}
            </h3>
            <form onSubmit={handleAccSubmit}>
              <div className="form-group">
                <label className="form-label">Fund Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Provider</label>
                <input
                  type="text"
                  className="form-input"
                  value={accInstitution}
                  onChange={(e) => setAccInstitution(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Current Balance ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input
                  type="text"
                  className="form-input"
                  value={accNotes}
                  onChange={(e) => setAccNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAccModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Save Fund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHistModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Record Monthly Super Log</h3>
            <form onSubmit={handleHistSubmit}>
              <div className="form-group">
                <label className="form-label">Record Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={histDate}
                  onChange={(e) => setHistDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Asset Allocation / Setting</label>
                <input
                  type="text"
                  className="form-input"
                  value={histSetting}
                  onChange={(e) => setHistSetting(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Voluntary Contributions ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={histVoluntary}
                    onChange={(e) => setHistVoluntary(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Super Value ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={histTotalValue}
                    onChange={(e) => setHistTotalValue(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowHistModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

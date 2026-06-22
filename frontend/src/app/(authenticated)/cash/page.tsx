'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Landmark, Plus, Trash2, Edit3 } from 'lucide-react';

export default function CashLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  // Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('AUD');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, [user]);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const data = await fetchWithAuth('/api/ledgers/cash/accounts', token);
      setAccounts(data);
    } catch (err) {
      console.error('Error fetching cash accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setInstitution('');
    setBalance('0');
    setCurrency('AUD');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (acc: any) => {
    setEditingId(acc.id);
    setName(acc.name);
    setInstitution(acc.institution || '');
    setBalance(acc.current_valuation.toString());
    setCurrency(acc.currency || 'AUD');
    setNotes(acc.notes || '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      const body = {
        name,
        institution,
        balance: parseFloat(balance),
        currency,
        notes
      };

      if (editingId) {
        await fetchWithAuth(`/api/ledgers/cash/accounts/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await fetchWithAuth('/api/ledgers/cash/accounts', token, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      
      setShowModal(false);
      fetchAccounts();
    } catch (err) {
      console.error('Error saving cash account:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !confirm('Are you sure you want to delete this cash account?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/ledgers/cash/accounts/${id}`, token, {
        method: 'DELETE'
      });
      fetchAccounts();
    } catch (err) {
      console.error('Error deleting account:', err);
    }
  };

  const totalCash = accounts.reduce((sum, acc) => sum + parseFloat(acc.current_valuation), 0);

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Cash & Liquid Accounts</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage bank accounts, offset funds, and daily savings pools.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add Cash Account
        </button>
      </div>

      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', backgroundColor: 'var(--accent-light)', borderRadius: '12px', color: 'var(--accent-color)' }}>
            <Landmark size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Cash Holdings</div>
            <h2 style={{ fontSize: '2rem' }}>${totalCash.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</h2>
          </div>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading accounts...</div>
        ) : accounts.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Account Name</th>
                <th>Institution</th>
                <th>Currency</th>
                <th>Current Balance</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => (
                <tr key={acc.id}>
                  <td><strong>{acc.name}</strong></td>
                  <td>{acc.institution}</td>
                  <td>{acc.currency}</td>
                  <td>${parseFloat(acc.current_valuation).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                  <td>{acc.notes}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" onClick={() => openEditModal(acc)} style={{ padding: '6px' }}>
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleDelete(acc.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No cash accounts registered. Click "Add Cash Account" to start.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
              {editingId ? 'Edit Cash Account' : 'Add New Cash Account'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Account Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Institution</label>
                <input
                  type="text"
                  className="form-input"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Current Balance ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <input
                    type="text"
                    className="form-input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    required
                  />
                </div>
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
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

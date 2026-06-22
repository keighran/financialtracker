'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Briefcase, Plus, Trash2, Edit3 } from 'lucide-react';

export default function OtherAssetsLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [valuation, setValuation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchAssets();
  }, [user]);

  const fetchAssets = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const data = await fetchWithAuth('/api/ledgers/other-assets', token);
      setAssets(data);
    } catch (err) {
      console.error('Error fetching other assets:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setInstitution('');
    setValuation('0');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (a: any) => {
    setEditingId(a.id);
    setName(a.name);
    setInstitution(a.institution || '');
    setValuation(a.current_valuation.toString());
    setNotes(a.notes || '');
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
        current_valuation: parseFloat(valuation),
        notes
      };

      if (editingId) {
        await fetchWithAuth(`/api/ledgers/other-assets/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await fetchWithAuth('/api/ledgers/other-assets', token, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      
      setShowModal(false);
      fetchAssets();
    } catch (err) {
      console.error('Error saving other asset:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !confirm('Are you sure you want to delete this asset?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/ledgers/other-assets/${id}`, token, {
        method: 'DELETE'
      });
      fetchAssets();
    } catch (err) {
      console.error('Error deleting asset:', err);
    }
  };

  const totalValue = assets.reduce((sum, a) => sum + parseFloat(a.current_valuation), 0);

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Other Assets</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Track jewelry, cars, art, precious metals, and other non-liquid items.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add Other Asset
        </button>
      </div>

      <div className="card" style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ padding: '12px', backgroundColor: 'var(--accent-light)', borderRadius: '12px', color: 'var(--accent-color)' }}>
            <Briefcase size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Asset Value</div>
            <h2 style={{ fontSize: '2rem' }}>${totalValue.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</h2>
          </div>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading assets...</div>
        ) : assets.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Category / Institution</th>
                <th>Valuation</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.institution}</td>
                  <td>${parseFloat(a.current_valuation).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                  <td>{a.notes}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" onClick={() => openEditModal(a)} style={{ padding: '6px' }}>
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleDelete(a.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
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
            No assets registered. Click "Add Other Asset" to get started.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
              {editingId ? 'Edit Other Asset' : 'Add New Other Asset'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Asset Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category / Location</label>
                <input
                  type="text"
                  className="form-input"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Safe, Home, Business, Car"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Current Valuation ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={valuation}
                  onChange={(e) => setValuation(e.target.value)}
                  required
                  min="0"
                  step="0.01"
                />
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
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

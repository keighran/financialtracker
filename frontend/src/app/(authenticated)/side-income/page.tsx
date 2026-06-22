'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';

export default function SideIncomeLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [date, setDate] = useState('');
  const [sideIncome, setSideIncome] = useState('0');
  const [rentalIncome, setRentalIncome] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [user]);

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const data = await fetchWithAuth('/api/ledgers/side-income', token);
      setLogs(data);
    } catch (err) {
      console.error('Error fetching side income logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    const today = new Date().toISOString().substring(0, 10);
    setDate(today);
    setSideIncome('0');
    setRentalIncome('0');
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      await fetchWithAuth('/api/ledgers/side-income', token, {
        method: 'POST',
        body: JSON.stringify({
          record_date: new Date(date).toISOString(),
          side_income_1: parseFloat(sideIncome),
          rental_income_1: parseFloat(rentalIncome),
          notes
        })
      });
      setShowModal(false);
      fetchLogs();
    } catch (err) {
      console.error('Error saving side income:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !confirm('Are you sure you want to delete this log?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/ledgers/side-income/${id}`, token, {
        method: 'DELETE'
      });
      fetchLogs();
    } catch (err) {
      console.error('Error deleting side income:', err);
    }
  };

  // Calculations
  const totalSide = logs.reduce((sum, l) => sum + parseFloat(l.side_income_1), 0);
  const totalRental = logs.reduce((sum, l) => sum + parseFloat(l.rental_income_1), 0);
  const totalAmount = totalSide + totalRental;
  
  const avgMonthly = logs.length > 0 ? totalAmount / logs.length : 0;
  const yearlyPredicted = avgMonthly * 12;

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Side Income</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Record extra earnings from side hustles, consulting, or investment property rental margins.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Record Income Log
        </button>
      </div>

      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-title">Average Monthly Income</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${avgMonthly.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Predicted Yearly Side Income</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${yearlyPredicted.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Historical Side Income</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: 'var(--success-color)' }}>
            ${totalAmount.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>Loading logs...</div>
        ) : logs.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Side Income 1</th>
                <th>Rental Income 1</th>
                <th>Total Side ($)</th>
                <th>Notes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const total = parseFloat(l.side_income_1) + parseFloat(l.rental_income_1);
                return (
                  <tr key={l.id}>
                    <td><strong>{new Date(l.record_date).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</strong></td>
                    <td>${parseFloat(l.side_income_1).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                    <td>${parseFloat(l.rental_income_1).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                    <td>${total.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                    <td>{l.notes}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary" onClick={() => handleDelete(l.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No side income recorded. Click "Record Income Log" to start tracking.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Record Monthly Income</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Record Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Side Income ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={sideIncome}
                    onChange={(e) => setSideIncome(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Rental Income ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={rentalIncome}
                    onChange={(e) => setRentalIncome(e.target.value)}
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

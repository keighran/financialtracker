'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { ShieldAlert, Plus, Trash2, Edit3 } from 'lucide-react';

export default function LiabilitiesLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [liabilities, setLiabilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [startBalance, setStartBalance] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [paymentsPaid, setPaymentsPaid] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [monthlyPayment, setMonthlyPayment] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchLiabilities();
  }, [user]);

  const fetchLiabilities = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const data = await fetchWithAuth('/api/ledgers/liabilities', token);
      setLiabilities(data);
    } catch (err) {
      console.error('Error fetching liabilities:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setInstitution('');
    setStartBalance('0');
    setCurrentBalance('0');
    setPaymentsPaid('0');
    setInterestRate('0');
    setMonthlyPayment('0');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (l: any) => {
    setEditingId(l.id);
    setName(l.name);
    setInstitution(l.institution || '');
    setStartBalance(l.start_loan_balance.toString());
    setCurrentBalance(l.current_loan_balance.toString());
    setPaymentsPaid(l.payments_made_to_date.toString());
    setInterestRate((parseFloat(l.annual_interest_rate) * 100).toString());
    setMonthlyPayment(l.regular_payment_amount.toString());
    setNotes(l.notes || '');
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
        start_loan_balance: parseFloat(startBalance),
        current_loan_balance: parseFloat(currentBalance),
        payments_made_to_date: parseFloat(paymentsPaid),
        annual_interest_rate: parseFloat(interestRate) / 100,
        regular_payment_amount: parseFloat(monthlyPayment),
        notes
      };

      if (editingId) {
        await fetchWithAuth(`/api/ledgers/liabilities/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await fetchWithAuth('/api/ledgers/liabilities', token, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      
      setShowModal(false);
      fetchLiabilities();
    } catch (err) {
      console.error('Error saving liability:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !confirm('Are you sure you want to delete this liability?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/ledgers/liabilities/${id}`, token, {
        method: 'DELETE'
      });
      fetchLiabilities();
    } catch (err) {
      console.error('Error deleting liability:', err);
    }
  };

  const totalRemaining = liabilities.reduce((sum, l) => sum + parseFloat(l.current_loan_balance), 0);
  const totalPaid = liabilities.reduce((sum, l) => sum + parseFloat(l.payments_made_to_date), 0);
  const totalStart = liabilities.reduce((sum, l) => sum + parseFloat(l.start_loan_balance), 0);
  const paymentProgress = totalStart > 0 ? (totalPaid / totalStart) * 100 : 100;

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Liabilities & Debts</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Track outstanding loan balances, interest rates, and overall debt payoff progress.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add Liability
        </button>
      </div>

      <div className="card" style={{ marginBottom: '32px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ padding: '12px', backgroundColor: 'rgba(220, 38, 38, 0.1)', borderRadius: '12px', color: 'var(--error-color)' }}>
            <ShieldAlert size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Debts Remaining</span>
                <h2 style={{ fontSize: '1.75rem', marginTop: '4px' }}>${totalRemaining.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Payments Made</span>
                <h2 style={{ fontSize: '1.75rem', marginTop: '4px', color: 'var(--success-color)' }}>${totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2 })} AUD</h2>
              </div>
            </div>
            
            <div style={{ height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(paymentProgress, 100)}%`, backgroundColor: 'var(--accent-color)', transition: 'width 0.5s ease-out' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <span>Debt Paid Progress</span>
              <span>{paymentProgress.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading liabilities...</div>
        ) : liabilities.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Liability Name</th>
                <th>Institution</th>
                <th>Starting Loan</th>
                <th>Current Balance</th>
                <th>Interest Rate</th>
                <th>Monthly Repayment</th>
                <th>Paid to Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong></td>
                  <td>{l.institution}</td>
                  <td>${parseFloat(l.start_loan_balance).toLocaleString()}</td>
                  <td>${parseFloat(l.current_loan_balance).toLocaleString()}</td>
                  <td>{(parseFloat(l.annual_interest_rate) * 100).toFixed(2)}%</td>
                  <td>${parseFloat(l.regular_payment_amount).toLocaleString()}</td>
                  <td>${parseFloat(l.payments_made_to_date).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" onClick={() => openEditModal(l)} style={{ padding: '6px' }}>
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleDelete(l.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
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
            No liabilities recorded. Click "Add Liability" to start.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
              {editingId ? 'Edit Liability details' : 'Add New Liability'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Liability / Loan Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Lending Institution</label>
                <input
                  type="text"
                  className="form-input"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Starting Loan Balance ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={startBalance}
                    onChange={(e) => setStartBalance(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Loan Balance ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Interest Rate (%)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Payment ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={monthlyPayment}
                    onChange={(e) => setMonthlyPayment(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Payments to Date ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentsPaid}
                    onChange={(e) => setPaymentsPaid(e.target.value)}
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
                  Save Liability
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

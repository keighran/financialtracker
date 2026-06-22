'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Home, Plus, Trash2, Edit3, HelpCircle } from 'lucide-react';

export default function PropertyLedger() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);
  const [gearing, setGearing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [currentValuation, setCurrentValuation] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [netRental, setNetRental] = useState('0');
  
  // Mortgage info
  const [startBalance, setStartBalance] = useState('0');
  const [currentBalance, setCurrentBalance] = useState('0');
  const [paymentsPaid, setPaymentsPaid] = useState('0');
  const [interestRate, setInterestRate] = useState('5.5');
  const [monthlyPayment, setMonthlyPayment] = useState('0');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchProperties();
  }, [user]);

  const fetchProperties = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const data = await fetchWithAuth('/api/ledgers/properties', token);
      setProperties(data);
      
      const gear = await fetchWithAuth('/api/tax-projections/gearing', token);
      setGearing(gear);
    } catch (err) {
      console.error('Error fetching property assets:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setPurchaseValue('0');
    setCurrentValuation('0');
    setIsPrimary(false);
    setNetRental('0');
    setStartBalance('0');
    setCurrentBalance('0');
    setPaymentsPaid('0');
    setInterestRate('5.5');
    setMonthlyPayment('0');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (p: any) => {
    setEditingId(p.id);
    setName(p.name);
    setPurchaseValue(p.purchase_value.toString());
    setCurrentValuation(p.current_valuation.toString());
    setIsPrimary(p.is_primary_residence);
    setNetRental(p.net_rental_profit_to_date.toString());
    setStartBalance(p.start_loan_balance.toString());
    setCurrentBalance(p.current_loan_balance.toString());
    setPaymentsPaid(p.payments_made_to_date.toString());
    setInterestRate((parseFloat(p.annual_interest_rate) * 100).toString());
    setMonthlyPayment(p.regular_payment_amount.toString());
    setNotes(p.notes || '');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      const body = {
        name,
        purchase_value: parseFloat(purchaseValue),
        current_valuation: parseFloat(currentValuation),
        is_primary_residence: isPrimary,
        net_rental_profit_to_date: parseFloat(netRental),
        start_loan_balance: parseFloat(startBalance),
        current_loan_balance: parseFloat(currentBalance),
        payments_made_to_date: parseFloat(paymentsPaid),
        annual_interest_rate: parseFloat(interestRate) / 100,
        regular_payment_amount: parseFloat(monthlyPayment),
        notes
      };

      if (editingId) {
        await fetchWithAuth(`/api/ledgers/properties/${editingId}`, token, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
      } else {
        await fetchWithAuth('/api/ledgers/properties', token, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      
      setShowModal(false);
      fetchProperties();
    } catch (err) {
      console.error('Error saving property:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!user || !confirm('Are you sure you want to delete this property?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/ledgers/properties/${id}`, token, {
        method: 'DELETE'
      });
      fetchProperties();
    } catch (err) {
      console.error('Error deleting property:', err);
    }
  };

  // Totals calculations
  const totalPurchase = properties.reduce((sum, p) => sum + parseFloat(p.purchase_value), 0);
  const totalCurrent = properties.reduce((sum, p) => sum + parseFloat(p.current_valuation), 0);
  const totalGain = totalCurrent - totalPurchase;
  const totalMortgage = properties.reduce((sum, p) => sum + parseFloat(p.current_loan_balance), 0);
  const mortgagePaid = properties.reduce((sum, p) => sum + parseFloat(p.payments_made_to_date), 0);

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Property Assets</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Track real estate valuations, mortgage positions, and negative gearing tax deductions.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add Property
        </button>
      </div>

      {/* Property Overview Cards */}
      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-title">Total Purchase Value</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalPurchase.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Current Value</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalCurrent.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Total Gain</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: totalGain >= 0 ? 'var(--success-color)' : 'var(--error-color)' }}>
            ${totalGain.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Current Mortgage Balance</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${totalMortgage.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '32px', backgroundColor: 'var(--accent-light)', borderColor: 'var(--accent-color)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <HelpCircle size={20} style={{ color: 'var(--accent-color)' }} />
          <span style={{ fontSize: '0.875rem', color: 'var(--accent-color)', fontWeight: 500 }}>
            Property gains inside primary residences are generally CGT-exempt in Australia. Secondary investment properties are eligible for 50% CGT discounts if held for &gt; 365 days.
          </span>
        </div>
      </div>

      {/* Property List */}
      <div className="table-container">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading properties...</div>
        ) : properties.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Address / Name</th>
                <th>Primary Residence</th>
                <th>Purchase Value</th>
                <th>Current Value</th>
                <th>Mortgage Remaining</th>
                <th>Interest Rate</th>
                <th>Monthly Net Rent</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const gear = gearing.find((g: any) => g.property_name === p.name);
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td>{p.is_primary_residence ? 'Yes' : 'No'}</td>
                    <td>${parseFloat(p.purchase_value).toLocaleString()}</td>
                    <td>${parseFloat(p.current_valuation).toLocaleString()}</td>
                    <td>${parseFloat(p.current_loan_balance).toLocaleString()}</td>
                    <td>{(parseFloat(p.annual_interest_rate) * 100).toFixed(2)}%</td>
                    <td>
                      <span style={{ color: gear?.is_negatively_geared ? 'var(--error-color)' : 'var(--success-color)', fontWeight: 600 }}>
                        ${parseFloat(p.net_rental_profit_to_date).toLocaleString()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button className="btn btn-secondary" onClick={() => openEditModal(p)} style={{ padding: '6px' }}>
                          <Edit3 size={14} />
                        </button>
                        <button className="btn btn-secondary" onClick={() => handleDelete(p.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No properties recorded. Click "Add Property" to begin.
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
              {editingId ? 'Edit Property Details' : 'Add New Property'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Property Name / Address</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Purchase Value ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={purchaseValue}
                    onChange={(e) => setPurchaseValue(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Valuation ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={currentValuation}
                    onChange={(e) => setCurrentValuation(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '100%', paddingTop: '32px' }}>
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    id="isPrimary"
                  />
                  <label htmlFor="isPrimary" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Primary Place of Residence (PPoR)</label>
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Rental Net Income ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={netRental}
                    onChange={(e) => setNetRental(e.target.value)}
                  />
                </div>
              </div>

              <h4 style={{ margin: '16px 0 12px', fontSize: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Mortgage / Loan Details (Optional)</h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Starting Balance ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={startBalance}
                    onChange={(e) => setStartBalance(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Current Balance ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={currentBalance}
                    onChange={(e) => setCurrentBalance(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Principal Payments Paid ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={paymentsPaid}
                    onChange={(e) => setPaymentsPaid(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Annual Interest Rate (%)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Mortgage Payment ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={monthlyPayment}
                    onChange={(e) => setMonthlyPayment(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Save Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

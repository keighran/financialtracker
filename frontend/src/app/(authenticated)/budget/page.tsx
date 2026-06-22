'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { PieChart, Plus, Trash2, HelpCircle } from 'lucide-react';

export default function BudgetPlanner() {
  const { user } = useUser();
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [yearlyExpenses, setYearlyExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Forms
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState('Expenses');
  const [itemAmount, setItemAmount] = useState('');
  
  const [showYearlyModal, setShowYearlyModal] = useState(false);
  const [yearlyName, setYearlyName] = useState('');
  const [yearlyAmount, setYearlyAmount] = useState('');

  // Salary context (from user settings)
  const [salary, setSalary] = useState(0);
  const [payFreq, setPayFreq] = useState('Fortnightly');

  useEffect(() => {
    fetchBudgetData();
  }, [user]);

  const fetchBudgetData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getToken();
      const items = await fetchWithAuth('/api/ledgers/budget/items', token);
      setBudgetItems(items);
      
      const yearly = await fetchWithAuth('/api/ledgers/budget/yearly', token);
      setYearlyExpenses(yearly);
      
      // Get user settings for salary details
      const nw = await fetchWithAuth('/api/dashboard/net-worth', token);
      setSalary(parseFloat(nw?.settings?.employment_salary || 0));
    } catch (err) {
      console.error('Error fetching budget data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await user.getToken();
      await fetchWithAuth('/api/ledgers/budget/items', token, {
        method: 'POST',
        body: JSON.stringify({
          name: itemName,
          category: itemCategory,
          monthly_amount: parseFloat(itemAmount)
        })
      });
      setShowItemModal(false);
      fetchBudgetData();
    } catch (err) {
      console.error('Error saving budget item:', err);
    }
  };

  const handleYearlySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await user.getToken();
      await fetchWithAuth('/api/ledgers/budget/yearly', token, {
        method: 'POST',
        body: JSON.stringify({
          name: yearlyName,
          annual_cost: parseFloat(yearlyAmount)
        })
      });
      setShowYearlyModal(false);
      fetchBudgetData();
    } catch (err) {
      console.error('Error saving yearly item:', err);
    }
  };

  const handleItemDelete = async (id: number) => {
    if (!user || !confirm('Delete budget item?')) return;
    try {
      const token = await user.getToken();
      await fetchWithAuth(`/api/ledgers/budget/items/${id}`, token, {
        method: 'DELETE'
      });
      fetchBudgetData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleYearlyDelete = async (id: number) => {
    if (!user || !confirm('Delete yearly expense?')) return;
    try {
      const token = await user.getToken();
      await fetchWithAuth(`/api/ledgers/budget/yearly/${id}`, token, {
        method: 'DELETE'
      });
      fetchBudgetData();
    } catch (err) {
      console.error(err);
    }
  };

  // Calculations
  const monthlySalary = salary; // Stored as monthly equivalent on backend / onboarding completes
  const totalPlannedSpend = budgetItems
    .filter(i => i.category === 'Expenses')
    .reduce((sum, i) => sum + parseFloat(i.monthly_amount), 0);
    
  const totalYearlyExpenses = yearlyExpenses.reduce((sum, i) => sum + parseFloat(i.annual_cost), 0);
  const monthlyYearlyAllocation = totalYearlyExpenses / 12;

  const totalMonthlySpend = totalPlannedSpend + monthlyYearlyAllocation;
  const monthlySavings = Math.max(0, monthlySalary - totalMonthlySpend);
  const savingsRate = monthlySalary > 0 ? (monthlySavings / monthlySalary) * 100 : 0;

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Budget Planner</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Plan monthly cash allocations, set aside yearly bills, and forecast monthly savings.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => setShowYearlyModal(true)}>
            + Add Yearly Expense
          </button>
          <button className="btn btn-primary" onClick={() => setShowItemModal(true)}>
            <Plus size={18} /> Add Monthly Item
          </button>
        </div>
      </div>

      {/* Financial overview cards */}
      <div className="grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        <div className="card">
          <div className="card-title">Monthly Income (Base)</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px' }}>
            ${monthlySalary.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Monthly Outflows</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: 'var(--error-color)' }}>
            ${totalMonthlySpend.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Monthly Savings</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: 'var(--success-color)' }}>
            ${monthlySavings.toLocaleString('en-AU', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Savings Rate</div>
          <div className="metric-value" style={{ fontSize: '1.5rem', marginTop: '8px', color: 'var(--accent-color)' }}>
            {savingsRate.toFixed(1)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        
        {/* Monthly items list */}
        <div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Monthly Budget Items</h2>
          <div className="table-container">
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>Loading budget...</div>
            ) : budgetItems.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>% Allocation</th>
                    <th>Monthly amount</th>
                    <th>Weekly equivalent</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetItems.map((item) => {
                    const amount = parseFloat(item.monthly_amount);
                    const pct = monthlySalary > 0 ? (amount / monthlySalary) * 100 : 0;
                    const weekly = amount * 12 / 52;
                    return (
                      <tr key={item.id}>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.category}</td>
                        <td>{pct.toFixed(1)}%</td>
                        <td>${amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                        <td>${weekly.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary" onClick={() => handleItemDelete(item.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No planned items recorded.
              </div>
            )}
          </div>
        </div>

        {/* Yearly expenses */}
        <div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Yearly Expenses Buffer</h2>
          <div className="table-container">
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>Loading bills...</div>
            ) : yearlyExpenses.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Yearly Cost</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyExpenses.map((exp) => {
                    const cost = parseFloat(exp.annual_cost);
                    return (
                      <tr key={exp.id}>
                        <td>{exp.name}</td>
                        <td>${cost.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn btn-secondary" onClick={() => handleYearlyDelete(exp.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No yearly entries recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {showItemModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Add Monthly Budget Item</h3>
            <form onSubmit={handleItemSubmit}>
              <div className="form-group">
                <label className="form-label">Item Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Groceries, Netflix, Fuel"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-input" value={itemCategory} onChange={(e) => setItemCategory(e.target.value)}>
                  <option value="Expenses">Expenses</option>
                  <option value="Fun">Fun</option>
                  <option value="Savings">Savings</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Monthly Amount ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={itemAmount}
                  onChange={(e) => setItemAmount(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowItemModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showYearlyModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Add Yearly Expense (Bills)</h3>
            <form onSubmit={handleYearlySubmit}>
              <div className="form-group">
                <label className="form-label">Expense Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={yearlyName}
                  onChange={(e) => setYearlyName(e.target.value)}
                  placeholder="e.g. Car Registration, Private Health"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Annual Cost ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={yearlyAmount}
                  onChange={(e) => setYearlyAmount(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowYearlyModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Add Yearly Cost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

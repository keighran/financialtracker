'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useAuth } from '@clerk/nextjs';
import { ArrowRight, CheckCircle, Award, Target, Landmark, Wallet, PiggyBank, CreditCard } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

const TOTAL_STEPS = 7;

export default function Onboarding() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Settings
  const [salary, setSalary] = useState('85000');
  const [frequency, setFrequency] = useState('Fortnightly');
  const [targetSpend, setTargetSpend] = useState('60000');
  const [withdrawalRate, setWithdrawalRate] = useState('4'); // in %
  const [currentAge, setCurrentAge] = useState('30');
  const [retireAge, setRetireAge] = useState('50');

  // Ledger seeds (all optional)
  const [cashBalance, setCashBalance] = useState('');
  const [bankName, setBankName] = useState('');
  const [superBalance, setSuperBalance] = useState('');
  const [superFund, setSuperFund] = useState('');
  const [liabilityName, setLiabilityName] = useState('');
  const [liabilityBalance, setLiabilityBalance] = useState('');
  const [liabilityRate, setLiabilityRate] = useState('');

  const handleNext = () => setStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  const handleBack = () => setStep((prev) => Math.max(prev - 1, 1));

  const num = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const token = await getToken();

      // Seed optional ledger accounts first
      if (num(cashBalance) > 0) {
        await fetchWithAuth('/api/ledgers/cash/accounts', token, {
          method: 'POST',
          body: JSON.stringify({
            name: bankName || 'Everyday Account',
            institution: bankName || '',
            balance: num(cashBalance),
            currency: 'AUD',
            notes: 'Added during onboarding',
          }),
        });
      }

      if (num(superBalance) > 0) {
        await fetchWithAuth('/api/ledgers/super/accounts', token, {
          method: 'POST',
          body: JSON.stringify({
            name: superFund || 'Superannuation',
            institution: superFund || '',
            balance: num(superBalance),
            notes: 'Added during onboarding',
          }),
        });
      }

      if (num(liabilityBalance) > 0) {
        await fetchWithAuth('/api/ledgers/liabilities', token, {
          method: 'POST',
          body: JSON.stringify({
            name: liabilityName || 'Loan',
            start_loan_balance: num(liabilityBalance),
            current_loan_balance: num(liabilityBalance),
            payments_made_to_date: 0,
            annual_interest_rate: num(liabilityRate) / 100,
            regular_payment_amount: 0,
            notes: 'Added during onboarding',
          }),
        });
      }

      // Finalise settings — this also flags onboarding as complete
      await fetchWithAuth('/api/onboarding/complete', token, {
        method: 'POST',
        body: JSON.stringify({
          employment_salary: num(salary),
          pay_frequency: frequency,
          fire_target_annual_spend: num(targetSpend),
          fire_safe_withdrawal_rate: num(withdrawalRate) / 100,
          fire_current_age: parseInt(currentAge),
          fire_target_retire_age: parseInt(retireAge),
        }),
      });

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong during onboarding.');
      setLoading(false);
    }
  };

  const stepIcon = () => {
    switch (step) {
      case 1: return <Landmark size={28} />;
      case 2: return <Target size={28} />;
      case 3: return <Award size={28} />;
      case 4: return <Wallet size={28} />;
      case 5: return <PiggyBank size={28} />;
      case 6: return <CreditCard size={28} />;
      default: return <CheckCircle size={28} />;
    }
  };

  const fireNumber = num(targetSpend) / (num(withdrawalRate) / 100 || 0.04);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      backgroundColor: 'var(--bg-primary)'
    }}>
      <div className="card glass-card" style={{ maxWidth: '600px', width: '100%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-light)',
            color: 'var(--accent-color)',
            marginBottom: '16px'
          }}>
            {stepIcon()}
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Personal Wealth Setup</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Step {step} of {TOTAL_STEPS}</p>
          {/* Progress bar */}
          <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(step / TOTAL_STEPS) * 100}%`, background: 'var(--accent-color)', transition: 'width 0.3s' }} />
          </div>
        </div>

        {error && (
          <div className="alert alert-info" style={{ borderColor: 'var(--error-color)', color: 'var(--error-color)', backgroundColor: 'rgba(220, 38, 38, 0.1)' }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Let's configure your Income details</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Your regular employment salary acts as the starting baseline to track savings rate and compound speeds.
            </p>

            <div className="form-group">
              <label className="form-label">Annual Net/Gross Salary ($ AUD)</label>
              <input type="number" className="form-input" value={salary} onChange={(e) => setSalary(e.target.value)} min="0" />
            </div>

            <div className="form-group">
              <label className="form-label">Salary Frequency</label>
              <select className="form-input" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="Weekly">Weekly</option>
                <option value="Fortnightly">Fortnightly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>

            <button className="btn btn-primary" onClick={handleNext} style={{ width: '100%', marginTop: '16px' }}>
              Continue <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Your FIRE targets</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Define how much you expect to spend annually in retirement, and your safe withdrawal multiplier (typically 4% based on the Trinity study).
            </p>

            <div className="form-group">
              <label className="form-label">Target Annual Spend in Retirement ($ AUD)</label>
              <input type="number" className="form-input" value={targetSpend} onChange={(e) => setTargetSpend(e.target.value)} min="0" />
            </div>

            <div className="form-group">
              <label className="form-label">Safe Withdrawal Rate (% per year)</label>
              <input type="number" className="form-input" value={withdrawalRate} onChange={(e) => setWithdrawalRate(e.target.value)} step="0.1" min="1" max="10" />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>Continue <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Age & Retirement Timeline</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Provide your current age and target age to retire early. We'll use these to plot your projection curves.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Current Age</label>
                <input type="number" className="form-input" value={currentAge} onChange={(e) => setCurrentAge(e.target.value)} min="18" max="100" />
              </div>
              <div className="form-group">
                <label className="form-label">Target Retire Age</label>
                <input type="number" className="form-input" value={retireAge} onChange={(e) => setRetireAge(e.target.value)} min="18" max="100" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>Continue <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Cash & Savings</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Add your main bank balance to start tracking net worth. You can add more accounts later. <em>Optional — leave blank to skip.</em>
            </p>

            <div className="form-group">
              <label className="form-label">Bank / Account Name</label>
              <input type="text" className="form-input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. ING Everyday Saver" />
            </div>
            <div className="form-group">
              <label className="form-label">Current Balance ($ AUD)</label>
              <input type="number" className="form-input" value={cashBalance} onChange={(e) => setCashBalance(e.target.value)} placeholder="0" min="0" />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>Continue <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Superannuation</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Your super is a major part of your retirement picture. Add your current balance. <em>Optional — leave blank to skip.</em>
            </p>

            <div className="form-group">
              <label className="form-label">Super Fund Name</label>
              <input type="text" className="form-input" value={superFund} onChange={(e) => setSuperFund(e.target.value)} placeholder="e.g. AustralianSuper" />
            </div>
            <div className="form-group">
              <label className="form-label">Current Balance ($ AUD)</label>
              <input type="number" className="form-input" value={superBalance} onChange={(e) => setSuperBalance(e.target.value)} placeholder="0" min="0" />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>Continue <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Debts & Liabilities</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Track any loans (HECS-HELP, car, personal) so your net worth is accurate. <em>Optional — leave blank to skip.</em>
            </p>

            <div className="form-group">
              <label className="form-label">Liability Name</label>
              <input type="text" className="form-input" value={liabilityName} onChange={(e) => setLiabilityName(e.target.value)} placeholder="e.g. HECS-HELP Debt" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Current Balance ($ AUD)</label>
                <input type="number" className="form-input" value={liabilityBalance} onChange={(e) => setLiabilityBalance(e.target.value)} placeholder="0" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Interest Rate (% p.a.)</label>
                <input type="number" className="form-input" value={liabilityRate} onChange={(e) => setLiabilityRate(e.target.value)} placeholder="0" step="0.1" min="0" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>Back</button>
              <button className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>Review <ArrowRight size={18} /></button>
            </div>
          </div>
        )}

        {step === 7 && (
          <form onSubmit={handleSubmit}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Review & Finish</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Here's your starting position. You can edit everything later from the app.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Salary</span><strong>${num(salary).toLocaleString('en-AU')} ({frequency})</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Target spend / SWR</span><strong>${num(targetSpend).toLocaleString('en-AU')} @ {withdrawalRate}%</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Age → Retire</span><strong>{currentAge} → {retireAge}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Cash</span><strong>{num(cashBalance) > 0 ? `$${num(cashBalance).toLocaleString('en-AU')}` : '—'}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Super</span><strong>{num(superBalance) > 0 ? `$${num(superBalance).toLocaleString('en-AU')}` : '—'}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Liabilities</span><strong>{num(liabilityBalance) > 0 ? `$${num(liabilityBalance).toLocaleString('en-AU')}` : '—'}</strong></div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <CheckCircle size={20} style={{ color: 'var(--success-color)' }} />
              <div style={{ fontSize: '0.85rem' }}>
                <strong>FIRE Target number:</strong> ${fireNumber.toLocaleString('en-AU', { maximumFractionDigits: 0 })} AUD
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button type="button" className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
                {loading ? 'Setting up...' : 'Finish & Open Dashboard'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useAuth } from '@clerk/nextjs';
import { ArrowRight, CheckCircle, Award, Target, Landmark } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function Onboarding() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [salary, setSalary] = useState('85000');
  const [frequency, setFrequency] = useState('Fortnightly');
  const [targetSpend, setTargetSpend] = useState('60000');
  const [withdrawalRate, setWithdrawalRate] = useState('4'); // in %
  const [currentAge, setCurrentAge] = useState('30');
  const [retireAge, setRetireAge] = useState('50');

  const handleNext = () => {
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const token = await getToken();
      await fetchWithAuth('/api/onboarding/complete', token, {
        method: 'POST',
        body: JSON.stringify({
          employment_salary: parseFloat(salary),
          pay_frequency: frequency,
          fire_target_annual_spend: parseFloat(targetSpend),
          fire_safe_withdrawal_rate: parseFloat(withdrawalRate) / 100,
          fire_current_age: parseInt(currentAge),
          fire_target_retire_age: parseInt(retireAge)
        })
      });
      
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong during onboarding.');
    } finally {
      setLoading(false);
    }
  };

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
            {step === 1 && <Landmark size={28} />}
            {step === 2 && <Target size={28} />}
            {step === 3 && <Award size={28} />}
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Personal Wealth Setup</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Step {step} of 3</p>
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
              <input
                type="number"
                className="form-input"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                min="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Salary Frequency</label>
              <select
                className="form-input"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
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
              <input
                type="number"
                className="form-input"
                value={targetSpend}
                onChange={(e) => setTargetSpend(e.target.value)}
                min="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Safe Withdrawal Rate (% per year)</label>
              <input
                type="number"
                className="form-input"
                value={withdrawalRate}
                onChange={(e) => setWithdrawalRate(e.target.value)}
                step="0.1"
                min="1"
                max="10"
              />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>
                Back
              </button>
              <button className="btn btn-primary" onClick={handleNext} style={{ flex: 2 }}>
                Continue <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Age & Retirement Timeline</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
              Provide your current age and target age to retire early. We'll use these to plot your projection curves.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Current Age</label>
                <input
                  type="number"
                  className="form-input"
                  value={currentAge}
                  onChange={(e) => setCurrentAge(e.target.value)}
                  min="18"
                  max="100"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Target Retire Age</label>
                <input
                  type="number"
                  className="form-input"
                  value={retireAge}
                  onChange={(e) => setRetireAge(e.target.value)}
                  min="18"
                  max="100"
                />
              </div>
            </div>

            <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <CheckCircle size={20} style={{ color: 'var(--success-color)' }} />
              <div style={{ fontSize: '0.85rem' }}>
                <strong>FIRE Target number:</strong> ${(parseFloat(targetSpend) / (parseFloat(withdrawalRate) / 100)).toLocaleString('en-AU', { maximumFractionDigits: 0 })} AUD
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
              <button type="button" className="btn btn-secondary" onClick={handleBack} style={{ flex: 1 }}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 2 }}>
                {loading ? 'Submitting...' : 'Finish & Open Dashboard'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

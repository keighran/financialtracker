'use client';

import React, { useEffect, useState } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import { Settings, Users, Key, Plus, Trash2, Edit3 } from 'lucide-react';

export default function AdminPortal() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [apiConfigs, setApiConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // User Form states
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userTier, setUserTier] = useState('FREE');
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [userIsActive, setUserIsActive] = useState(true);
  
  // API Config Form states
  const [providerName, setProviderName] = useState('Twelve Data');
  const [apiUrl, setApiUrl] = useState('https://api.twelvedata.com');
  const [apiKey, setApiKey] = useState('');
  const [apiActive, setApiActive] = useState(true);
  const [apiDesc, setApiDesc] = useState('');

  useEffect(() => {
    fetchAdminData();
  }, [user, activeTab]);

  const fetchAdminData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (activeTab === 'users') {
        const uData = await fetchWithAuth('/api/admin/users', token);
        setUsersList(uData);
      } else {
        const cData = await fetchWithAuth('/api/admin/api-configs', token);
        setApiConfigs(cData);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      
      if (editingUserId) {
        // Update user
        await fetchWithAuth(`/api/admin/users/${editingUserId}?display_name=${userDisplayName}&is_superadmin=${userIsAdmin}&is_active=${userIsActive}&tier=${userTier}`, token, {
          method: 'PUT'
        });
      } else {
        // Create user
        await fetchWithAuth(`/api/admin/users?email=${userEmail}&display_name=${userDisplayName}&tier=${userTier}&is_superadmin=${userIsAdmin}`, token, {
          method: 'POST'
        });
      }
      
      setShowUserModal(false);
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Error processing user');
    }
  };

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/admin/api-configs?provider_name=${providerName}&api_url=${apiUrl}&api_key=${apiKey}&is_active=${apiActive}&description=${apiDesc}`, token, {
        method: 'POST'
      });
      setShowConfigModal(false);
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Error saving API config');
    }
  };

  const handleUserDelete = async (id: number) => {
    if (!user || !confirm('Permanently delete this user profile?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/admin/users/${id}`, token, { method: 'DELETE' });
      fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfigDelete = async (id: number) => {
    if (!user || !confirm('Delete this API pricing provider?')) return;
    try {
      const token = await getToken();
      await fetchWithAuth(`/api/admin/api-configs/${id}`, token, { method: 'DELETE' });
      fetchAdminData();
    } catch (err) {
      console.error(err);
    }
  };

  const openAddUser = () => {
    setEditingUserId(null);
    setUserEmail('');
    setUserDisplayName('');
    setUserTier('FREE');
    setUserIsAdmin(false);
    setUserIsActive(true);
    setShowUserModal(true);
  };

  const openEditUser = (u: any) => {
    setEditingUserId(u.id);
    setUserEmail(u.email);
    setUserDisplayName(u.display_name);
    setUserTier(u.subscription.tier);
    setUserIsAdmin(u.is_superadmin);
    setUserIsActive(u.is_active);
    setShowUserModal(true);
  };

  const openAddConfig = () => {
    setProviderName('Twelve Data');
    setApiUrl('https://api.twelvedata.com');
    setApiKey('');
    setApiActive(true);
    setApiDesc('');
    setShowConfigModal(true);
  };

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Superadmin Management</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
            Direct access to SaaS configurations, tenant credentials, and live data API keys.
          </p>
        </div>
        <div>
          {activeTab === 'users' ? (
            <button className="btn btn-primary" onClick={openAddUser}>
              <Plus size={18} /> Register Tenant User
            </button>
          ) : (
            <button className="btn btn-primary" onClick={openAddConfig}>
              <Plus size={18} /> Add API Source
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '32px' }}>
        <button
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('users')}
          style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, border: activeTab === 'users' ? 'none' : undefined }}
        >
          <Users size={16} /> User Management ({usersList.length})
        </button>
        <button
          className={`btn ${activeTab === 'apis' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('apis')}
          style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, border: activeTab === 'apis' ? 'none' : undefined }}
        >
          <Key size={16} /> Price Feed APIs
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading panel details...</div>
      ) : activeTab === 'users' ? (
        
        // Users Table
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Display Name</th>
                <th>Email Address</th>
                <th>Clerk UID</th>
                <th>Plan Tier</th>
                <th>Admin Status</th>
                <th>Account Status</th>
                <th>Created At</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.display_name}</strong></td>
                  <td>{u.email}</td>
                  <td><code style={{ fontSize: '0.8rem', opacity: 0.8 }}>{u.clerk_user_id}</code></td>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      backgroundColor: u.subscription.tier === 'ENTERPRISE' ? 'var(--accent-light)' : 'var(--bg-primary)',
                      color: u.subscription.tier === 'ENTERPRISE' ? 'var(--accent-color)' : 'var(--text-secondary)'
                    }}>
                      {u.subscription.tier}
                    </span>
                  </td>
                  <td>{u.is_superadmin ? 'Superadmin' : 'User'}</td>
                  <td>{u.is_active ? 'Active' : 'Disabled'}</td>
                  <td>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" onClick={() => openEditUser(u)} style={{ padding: '6px' }}>
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-secondary" onClick={() => handleUserDelete(u.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      ) : (

        // API Configurations Table
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Provider Name</th>
                <th>Base Endpoint URL</th>
                <th>API Credential Key</th>
                <th>Status</th>
                <th>Description</th>
                <th>Last Saved</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apiConfigs.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.provider_name}</strong></td>
                  <td><code>{c.api_url}</code></td>
                  <td><code>{c.api_key_masked}</code></td>
                  <td>{c.is_active ? 'Active' : 'Inactive'}</td>
                  <td>{c.description}</td>
                  <td>{new Date(c.updated_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary" onClick={() => handleConfigDelete(c.id)} style={{ padding: '6px', color: 'var(--error-color)' }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
              {editingUserId ? 'Edit User Credentials' : 'Register New Tenant User'}
            </h3>
            <form onSubmit={handleUserSubmit}>
              {!editingUserId && (
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={userDisplayName}
                  onChange={(e) => setUserDisplayName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">SaaS Subscription Plan Tier</label>
                <select className="form-input" value={userTier} onChange={(e) => setUserTier(e.target.value)}>
                  <option value="FREE">FREE</option>
                  <option value="PRO">PRO</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={userIsAdmin}
                    onChange={(e) => setUserIsAdmin(e.target.checked)}
                    id="userIsAdmin"
                  />
                  <label htmlFor="userIsAdmin" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Make Superadmin</label>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={userIsActive}
                    onChange={(e) => setUserIsActive(e.target.checked)}
                    id="userIsActive"
                  />
                  <label htmlFor="userIsActive" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Enable Account</label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowUserModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Submit Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Configure External API Provider</h3>
            <form onSubmit={handleConfigSubmit}>
              <div className="form-group">
                <label className="form-label">Provider Identifier Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="e.g. Twelve Data, CoinGecko"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Base API Endpoint URL</label>
                <input
                  type="text"
                  className="form-input"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="e.g. https://api.twelvedata.com"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Private API Credential Token (Key)</label>
                <input
                  type="password"
                  className="form-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API key"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">API Source Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={apiDesc}
                  onChange={(e) => setApiDesc(e.target.value)}
                  placeholder="e.g. Twelve Data Stock Price feeds endpoint"
                />
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={apiActive}
                  onChange={(e) => setApiActive(e.target.checked)}
                  id="apiActive"
                />
                <label htmlFor="apiActive" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Active pricing source</label>
              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '32px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfigModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
                  Save API Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

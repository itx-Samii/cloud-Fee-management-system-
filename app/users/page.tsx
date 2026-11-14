"use client";
import React, { useState, useEffect, useCallback } from 'react';

interface User {
  id: number;
  username: string;
  displayName: string;
  role: string;
  status: string;
  createdAt: string;
}

async function fetchUserList(): Promise<User[]> {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch user list. Ensure you are logged in as Administrator.');
  return res.json();
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Edit/Password Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Modify Profile Modal State
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [modifyUser, setModifyUser] = useState<User | null>(null);
  const [modifyDisplayName, setModifyDisplayName] = useState('');
  const [modifyUsername, setModifyUsername] = useState('');
  const [modifyLoading, setModifyLoading] = useState(false);

  const fetchUsers = useCallback(
    () =>
      fetchUserList()
        .then(setUsers)
        .catch((err) => setError(err instanceof TypeError ? 'System network error.' : err.message))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName, role: 'accountant' })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`User ${displayName} created successfully!`);
        setShowModal(false);
        setUsername('');
        setPassword('');
        setDisplayName('');
        fetchUsers();
      } else {
        setError(data.error || 'Failed to create user.');
      }
    } catch {
      setError('System network error.');
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      if (res.ok) {
        setSuccess('User status updated successfully.');
        fetchUsers();
      }
    } catch {
      setError('Failed to update status.');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedUser.id, password: newPassword })
      });
      if (res.ok) {
        setSuccess(`Password updated for ${selectedUser.displayName}.`);
        setShowEditModal(false);
        setNewPassword('');
      } else {
        setError('Failed to update password.');
      }
    } catch {
      setError('System network error.');
    }
  };

  const handleDeleteUser = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete user ${name}?`)) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccess('User deleted successfully.');
        fetchUsers();
      }
    } catch {
      setError('Failed to delete user.');
    }
  };

  const handleModifyUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modifyUser) return;
    setModifyLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modifyUser.id,
          displayName: modifyDisplayName.trim(),
          username: modifyUsername.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Operator "${modifyDisplayName}" updated successfully.`);
        setShowModifyModal(false);
        fetchUsers();
      } else {
        setError(data.error || 'Failed to update operator profile.');
      }
    } catch {
      setError('System network error.');
    } finally {
      setModifyLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Panel */}
      <div className="glass-panel" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>🛡️</span> Security & User Management
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage system operator roles, credentials, and access control.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', fontWeight: 600 }}
        >
          <span>➕</span> Create New User
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--danger)', color: 'var(--danger)', padding: '1rem', borderRadius: '12px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', color: '#22c55e', padding: '1rem', borderRadius: '12px', fontWeight: 600 }}>
          {success}
        </div>
      )}

      {/* Admin Card */}
      <div className="glass-panel" style={{ background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '1.5rem 2rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <div style={{ width: '56px', height: '56px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.4)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem' }}>
            👑
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Master Administrator</h3>
              <span style={{ padding: '0.2rem 0.6rem', background: 'rgba(99, 102, 241, 0.25)', color: '#c084fc', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>
                System Owner
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Username: <strong style={{ color: 'white', fontFamily: 'monospace' }}>admin</strong> • Unrestricted master access across all ERP modules.
            </p>
          </div>
        </div>
        <span style={{ padding: '0.35rem 0.85rem', background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700 }}>
          ● Always Active
        </span>
      </div>

      {/* Secondary Users Table */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1.5rem' }}>Operator Accounts (Accountants)</h2>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading user accounts...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No secondary operator accounts found. Click &quot;Create New User&quot; to add one.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700 }}>Operator Name</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700 }}>Username</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700 }}>Role</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700 }}>Created Date</th>
                  <th style={{ padding: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '1.25rem 1rem', fontWeight: 700, fontSize: '1.05rem', color: 'white' }}>{u.displayName}</td>
                    <td style={{ padding: '1.25rem 1rem', fontFamily: 'monospace', fontSize: '1rem', color: 'var(--text-muted)' }}>{u.username}</td>
                    <td style={{ padding: '1.25rem 1rem' }}>
                      <span style={{ padding: '0.35rem 0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: '#38bdf8', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '1.25rem 1rem' }}>
                      <button
                        onClick={() => handleToggleStatus(u.id, u.status)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '20px',
                          border: u.status === 'active' ? '1px solid #22c55e' : '1px solid #ef4444',
                          background: u.status === 'active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: u.status === 'active' ? '#22c55e' : '#ef4444',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s'
                        }}
                        title="Click to toggle Account Status"
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: u.status === 'active' ? '#22c55e' : '#ef4444' }}></span>
                        {u.status === 'active' ? 'Active (Click to Block)' : 'Blocked (Click to Unblock)'}
                      </button>
                    </td>
                    <td style={{ padding: '1.25rem 1rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '1.25rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setModifyUser(u);
                            setModifyDisplayName(u.displayName);
                            setModifyUsername(u.username);
                            setShowModifyModal(true);
                          }}
                          className="btn"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)' }}
                          title="Edit operator name and username"
                        >
                          ✏️ Modify
                        </button>
                        <button
                          onClick={() => { setSelectedUser(u); setShowEditModal(true); }}
                          className="btn"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.1)' }}
                        >
                          🔑 Reset Password
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.displayName)}
                          className="btn"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="workspace-modal no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '2.5rem', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Create Operator Account</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleAddUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>FULL OPERATOR NAME</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Muhammad Ahmed"
                  className="form-input"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', fontSize: '1rem' }}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>LOGIN USERNAME</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. ahmed_acc"
                  className="form-input"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', fontSize: '1rem', fontFamily: 'monospace' }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>PASSWORD</label>
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', fontSize: '1rem' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>ASSIGNED ROLE</label>
                <input
                  disabled
                  type="text"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#38bdf8', fontSize: '0.95rem', fontWeight: 700 }}
                  value="Accountant (Restricted Access)"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn"
                  style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.1)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '0.75rem 1.25rem', fontWeight: 600 }}
                >
                  Save User Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showEditModal && selectedUser && (
        <div className="workspace-modal no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '2.5rem', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Reset Operator Password</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>
                Set a new password for operator <strong style={{ color: 'white' }}>{selectedUser.displayName}</strong> ({selectedUser.username}).
              </p>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>NEW PASSWORD</label>
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  className="form-input"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', fontSize: '1rem' }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn"
                  style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.1)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '0.75rem 1.25rem', fontWeight: 600, background: '#10b981', borderColor: '#059669' }}
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modify Operator Modal */}
      {showModifyModal && modifyUser && (
        <div className="workspace-modal no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '450px', padding: '2.5rem', border: '1px solid rgba(59, 130, 246, 0.4)', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', borderRadius: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>✏️</span>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Modify Operator Profile</h3>
              </div>
              <button onClick={() => setShowModifyModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
            </div>

            <p style={{ margin: '0 0 1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
              Editing account: <strong style={{ color: '#60a5fa' }}>{modifyUser.username}</strong>
            </p>

            <form onSubmit={handleModifyUser} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>DISPLAY NAME</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Senior Accountant"
                  className="form-input"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'white', fontSize: '1rem' }}
                  value={modifyDisplayName}
                  onChange={(e) => setModifyDisplayName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>LOGIN USERNAME</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. accountant_brookfield"
                  className="form-input"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#38bdf8', fontSize: '1rem', fontFamily: 'monospace', fontWeight: 600 }}
                  value={modifyUsername}
                  onChange={(e) => setModifyUsername(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  ⚠️ Changing username will require a new login with the updated credentials.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModifyModal(false)}
                  className="btn"
                  style={{ padding: '0.75rem 1.25rem', background: 'rgba(255,255,255,0.1)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={modifyLoading}
                  style={{ padding: '0.75rem 1.5rem', fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', borderColor: '#1e40af', boxShadow: '0 8px 20px -5px rgba(59,130,246,0.4)' }}
                >
                  {modifyLoading ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

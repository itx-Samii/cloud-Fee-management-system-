"use client";
import React, { useState } from 'react';
import { reloadTo } from '@/lib/reloadTo';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const r = data.user?.role;
        reloadTo(r === 'superadmin' ? '/superadmin' : r === 'accountant' ? '/collection' : '/');
      } else {
        setError(data.error || 'Invalid credentials! Please try again.');
      }
    } catch {
      setError('System Error. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      width: '100vw',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '3rem 2.5rem',
        textAlign: 'center',
        animation: 'fadeIn 0.8s ease-out',
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        borderRadius: '24px'
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem',
          boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)'
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>

        <h1 style={{fontSize: '2rem', fontWeight: 700, color: 'white', marginBottom: '0.5rem'}}>School Pay ERP</h1>
        <p style={{marginBottom: '2.5rem', color: '#94a3b8', fontSize: '0.95rem'}}>Secure Cloud Enterprise Management System</p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group" style={{textAlign: 'left', margin: 0}}>
            <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Username</label>
            <input 
              required
              type="text" 
              className="form-input" 
              placeholder="e.g. admin or accountant"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'white',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                fontSize: '1rem',
                width: '100%',
                transition: 'all 0.2s'
              }}
            />
          </div>

          <div className="form-group" style={{textAlign: 'left', margin: 0}}>
            <label className="form-label" style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Password</label>
            <input 
              required
              type="password" 
              className="form-input" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'white',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                fontSize: '1rem',
                letterSpacing: '0.15em',
                width: '100%',
                transition: 'all 0.2s'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 500
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.9rem',
              fontSize: '1.05rem',
              fontWeight: 600,
              marginTop: '0.5rem',
              background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
              border: 'none',
              borderRadius: '12px',
              boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
              cursor: 'pointer',
              color: 'white',
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to System'}
          </button>
        </form>

        <div style={{marginTop: '2.5rem', fontSize: '0.8rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <span>Role-Based Security v14.5</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span> Cloud Atlas Connected
          </span>
        </div>
      </div>
    </div>
  );
}

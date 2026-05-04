"use client";
import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          background: 'var(--danger-bg)',
          border: '1px solid var(--danger)',
          borderRadius: '12px',
          margin: '2rem'
        }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {this.props.fallbackMessage || 'An unexpected error occurred. Please try refreshing the page.'}
          </p>
          <pre style={{
            textAlign: 'left',
            background: 'var(--bg-card)',
            padding: '1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            overflow: 'auto',
            maxHeight: '150px',
            color: 'var(--text-muted)',
            marginBottom: '1.5rem'
          }}>
            {this.state.error?.message}
          </pre>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

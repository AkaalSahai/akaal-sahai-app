import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const msg = this.state.error?.message || String(this.state.error)

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9', padding: 24,
      }}>
        <div style={{
          background: 'white', borderRadius: 16, padding: '32px 28px', maxWidth: 480,
          width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.08)', textAlign: 'center',
        }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 64, marginBottom: 20 }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '.88rem', color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
            The app encountered an unexpected error. Please refresh the page — your data is safe.
          </p>
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '10px 14px', marginBottom: 24, textAlign: 'left',
          }}>
            <code style={{ fontSize: '.75rem', color: '#dc2626', wordBreak: 'break-word' }}>{msg}</code>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#1e1a6e', color: 'white', border: 'none', borderRadius: 10,
              padding: '12px 28px', fontSize: '.9rem', fontWeight: 700, cursor: 'pointer',
              width: '100%',
            }}>
            Refresh Page
          </button>
        </div>
      </div>
    )
  }
}

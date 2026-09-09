import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

const STORAGE_KEY = 'pwa-install-dismissed'

function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
      <span style={{
        background: '#1e1a6e', color: 'white', borderRadius: '50%',
        width: 22, height: 22, display: 'inline-flex', flexShrink: 0,
        alignItems: 'center', justifyContent: 'center',
        fontSize: '.72rem', fontWeight: 700, marginTop: 1,
      }}>{n}</span>
      <span style={{ fontSize: '.82rem', color: '#374151', lineHeight: 1.6 }}>{children}</span>
    </div>
  )
}

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e1a6e"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
)

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#1e1a6e"
    style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }}>
    <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
  </svg>
)

export default function InstallPrompt() {
  const { user } = useAuth()
  const [show, setShow]               = useState(false)
  const [deferredPrompt, setDeferred] = useState(null)
  const [mode, setMode]               = useState(null) // 'android' | 'ios-safari' | 'ios-chrome'
  const [installing, setInstalling]   = useState(false)

  // Capture beforeinstallprompt as early as possible
  useEffect(() => {
    const early = (e) => { e.preventDefault(); window.__pwaInstallPrompt = e }
    window.addEventListener('beforeinstallprompt', early)
    return () => window.removeEventListener('beforeinstallprompt', early)
  }, [])

  useEffect(() => {
    if (!user) return
    if (sessionStorage.getItem(STORAGE_KEY)) return
    // If running standalone the app is installed — clear any stale 'never' flag and skip
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
    if (isStandalone) { localStorage.removeItem(STORAGE_KEY); return }
    // User explicitly said don't show again
    if (localStorage.getItem(STORAGE_KEY) === 'never') return

    const ua    = navigator.userAgent
    const ios   = /iphone|ipad|ipod/i.test(ua) && !('MSStream' in window)
    const crios = /crios/i.test(ua)   // Chrome on iOS
    const fxios = /fxios/i.test(ua)   // Firefox on iOS (similar to Chrome iOS)
    const safari = /safari/i.test(ua) && !/chrome|crios|fxios|edgios/i.test(ua)

    if (ios) {
      if (crios || fxios) { setMode('ios-chrome'); setShow(true) }
      else if (safari)    { setMode('ios-safari'); setShow(true) }
      // Other iOS browsers: skip (Edge iOS, etc.)
      return
    }

    // Android / desktop Chrome
    const handler = (e) => { e.preventDefault(); setDeferred(e); setMode('android'); setShow(true) }
    window.addEventListener('beforeinstallprompt', handler)
    if (window.__pwaInstallPrompt) {
      setDeferred(window.__pwaInstallPrompt); setMode('android'); setShow(true)
    }
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [user])

  async function handleInstall() {
    if (!deferredPrompt) return
    setInstalling(true)
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setInstalling(false)
    setDeferred(null)
  }

  function handleLater() { sessionStorage.setItem(STORAGE_KEY, '1'); setShow(false) }
  function handleNever() { localStorage.setItem(STORAGE_KEY, 'never'); setShow(false) }

  if (!show || !mode) return null

  const boxStyle = {
    background: '#f5f5fc', borderRadius: 12,
    padding: '14px 16px', marginBottom: 16,
  }

  return (
    <>
      <div onClick={handleLater} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
        zIndex: 9998, backdropFilter: 'blur(2px)',
      }} />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderRadius: '18px 18px 0 0',
        boxShadow: '0 -4px 32px rgba(0,0,0,.18)',
        zIndex: 9999, padding: '0 22px 36px',
        animation: 'slideUp .25s ease',
        maxWidth: 480, margin: '0 auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d1d5db' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 16px' }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14, flexShrink: 0,
            background: '#1e1a6e', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', fontWeight: 800, fontFamily: 'Georgia, serif',
          }}>AS</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '.97rem', color: '#0f0e2e' }}>
              Akaal Sahai Southall
            </div>
            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 2 }}>
              Add to your home screen for quick access
            </div>
          </div>
        </div>

        {/* ── Android ── */}
        {mode === 'android' && (
          <>
            <div style={{ ...boxStyle, fontSize: '.83rem', color: '#374151', lineHeight: 1.6 }}>
              Install the app for <strong>faster sign-in</strong>, offline access, and push notifications. Works just like a regular app — no App Store needed.
            </div>
            <button onClick={handleInstall} disabled={installing} style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: '#1e1a6e', color: 'white', fontWeight: 700,
              fontSize: '.92rem', cursor: 'pointer', marginBottom: 10,
              opacity: installing ? .7 : 1,
            }}>
              {installing ? 'Installing…' : 'Install App'}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleLater} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#64748b', fontWeight: 600, fontSize: '.83rem', cursor: 'pointer',
              }}>Maybe later</button>
              <button onClick={handleNever} style={{
                flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#94a3b8', fontWeight: 600, fontSize: '.83rem', cursor: 'pointer',
              }}>Don't show again</button>
            </div>
          </>
        )}

        {/* ── iPhone Safari ── */}
        {mode === 'ios-safari' && (
          <>
            <div style={boxStyle}>
              <Step n="1">Tap the <strong>Share</strong> button <ShareIcon /> at the bottom of Safari</Step>
              <Step n="2">Scroll down and tap <strong>"Add to Home Screen"</strong></Step>
              <Step n="3">Tap <strong>"Add"</strong> in the top right corner</Step>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleNever} style={{
                flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#64748b', fontWeight: 600, fontSize: '.84rem', cursor: 'pointer',
              }}>Don't show again</button>
              <button onClick={handleLater} style={{
                flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                background: '#1e1a6e', color: 'white', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer',
              }}>Got it</button>
            </div>
          </>
        )}

        {/* ── iPhone Chrome / Firefox ── */}
        {mode === 'ios-chrome' && (
          <>
            <div style={{
              background: '#fef8ec', border: '1px solid #fde68a',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              fontSize: '.78rem', color: '#92400e', lineHeight: 1.5,
            }}>
              <strong>Tip:</strong> For the best experience (full-screen, notifications), open this site in <strong>Safari</strong> instead and install from there.
            </div>
            <div style={boxStyle}>
              <div style={{ fontSize: '.8rem', fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                To install via Chrome:
              </div>
              <Step n="1">Tap the <strong>three dots</strong> <DotsIcon /> menu at the bottom right of Chrome</Step>
              <Step n="2">Tap <strong>"Add to Home Screen"</strong></Step>
              <Step n="3">Tap <strong>"Add"</strong> to confirm</Step>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleNever} style={{
                flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: 'white', color: '#64748b', fontWeight: 600, fontSize: '.84rem', cursor: 'pointer',
              }}>Don't show again</button>
              <button onClick={handleLater} style={{
                flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                background: '#1e1a6e', color: 'white', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer',
              }}>Got it</button>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { videosSupported, savedFolder, forgetFolder, chooseFolder, folderPermission, listVideos } from '../lib/projectorVideos'

// Video slides from a folder on the projector laptop (agreed 07-11-2026).
// See lib/projectorVideos.js. Only shows on Chrome/Edge (the laptop); phones
// and other browsers never see the button or any video slides.

const sameNames = (a, b) => a.length === b.length && a.every((v, i) => v.name === b[i].name)

// status: 'off' (unsupported) | 'none' (no folder) | 'allow' (needs a click
// after a restart) | 'missing' (folder moved/deleted) | 'ok'
export function useProjectorVideos() {
  const [status, setStatus] = useState(videosSupported() ? 'none' : 'off')
  const [folder, setFolder] = useState(null)
  const [videos, setVideos] = useState([])
  const [bad, setBad] = useState(() => new Set())   // files Chrome couldn't play - skipped

  const scan = useCallback(async handle => {
    try {
      const list = await listVideos(handle)
      setVideos(prev => sameNames(prev, list) ? prev : list)
      setStatus('ok')
    } catch {
      setVideos([])
      setStatus('missing')
    }
  }, [])

  useEffect(() => {
    if (!videosSupported()) return
    let live = true
    savedFolder().then(async handle => {
      if (!live || !handle) return
      setFolder(handle)
      const perm = await folderPermission(handle)
      if (!live) return
      if (perm === 'granted') scan(handle)
      else setStatus('allow')
    })
    return () => { live = false }
  }, [scan])

  // Pick up files added to or removed from the folder
  useEffect(() => {
    if (status !== 'ok' || !folder) return
    const t = setInterval(() => scan(folder), 30000)
    return () => clearInterval(t)
  }, [status, folder, scan])

  async function choose() {
    try {
      const handle = await chooseFolder()
      setFolder(handle)
      setBad(new Set())
      await scan(handle)
    } catch { /* cancelled */ }
  }

  async function allow() {
    if (!folder) return choose()
    if (await folderPermission(folder, true) === 'granted') scan(folder)
  }

  async function stop() {
    await forgetFolder()
    setFolder(null)
    setVideos([])
    setStatus('none')
  }

  const markBad = name => setBad(prev => new Set(prev).add(name))

  return { status, folderName: folder?.name, videos: videos.filter(v => !bad.has(v.name)), choose, allow, stop, markBad }
}

// Faint button in the bottom-left corner, like Log out in the bottom-right
export function VideoButton({ v }) {
  const [open, setOpen] = useState(false)
  if (v.status === 'off') return null
  const needsClick = v.status === 'allow' || v.status === 'missing'
  const label = {
    none: '🎬 Videos',
    allow: '🎬 Click to allow videos',
    missing: '🎬 Video folder not found - choose again',
    ok: `🎬 Videos: ${v.videos.length}`,
  }[v.status]
  const btn = {
    padding: '7px 14px', borderRadius: 8, border: '1px solid #3b3880', background: 'rgba(20,18,63,.85)',
    color: '#a5b4fc', fontSize: '.85rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  }
  function click() {
    if (v.status === 'none' || v.status === 'missing') v.choose()
    else if (v.status === 'allow') v.allow()
    else setOpen(o => !o)
  }
  return (
    <div className={needsClick ? undefined : 'proj-logout'}
      style={{ position: 'fixed', left: 16, bottom: 14, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      {open && v.status === 'ok' && (
        <div style={{ ...btn, cursor: 'default', display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
          <div>Folder: <b style={{ color: 'white' }}>{v.folderName}</b> - {v.videos.length} video{v.videos.length === 1 ? '' : 's'}</div>
          <div style={{ fontSize: '.75rem' }}>MP4 files, played in filename order (start names with 01, 02… to set the order).</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn} onClick={() => { setOpen(false); v.choose() }}>Choose another folder</button>
            <button style={btn} onClick={() => { setOpen(false); v.stop() }}>Stop using videos</button>
          </div>
        </div>
      )}
      <button onClick={click} style={needsClick ? { ...btn, background: '#f0a500', color: '#14123f', borderColor: '#f0a500' } : btn}>
        {label}
      </button>
    </div>
  )
}

// One video, as big as the slide allows, with sound when Chrome allows it.
// onDone(failed) when it ends, or straight away if it can't be played.
export function VideoSlide({ video, onDone }) {
  const ref = useRef(null)
  // Report only once per video - a broken file can fire both error and a failed play()
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const finished = useRef(false)
  const done = useRef(failed => { if (!finished.current) { finished.current = true; onDoneRef.current(failed) } })
  const [url, setUrl] = useState(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let live = true, u = null
    video.handle.getFile().then(f => {
      if (!live) return
      u = URL.createObjectURL(f)
      setUrl(u)
    }).catch(() => live && done.current(true))
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [video])

  useEffect(() => {
    const el = ref.current
    if (!el || !url) return
    el.muted = false
    // Chrome only plays sound after someone has clicked the page - until then play muted
    el.play().catch(() => {
      el.muted = true
      setMuted(true)
      el.play().catch(() => done.current(true))
    })
  }, [url])

  useEffect(() => {
    if (!muted) return
    const unmute = () => { if (ref.current) { ref.current.muted = false; setMuted(false) } }
    document.addEventListener('pointerdown', unmute)
    return () => document.removeEventListener('pointerdown', unmute)
  }, [muted])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {url && (
        <video ref={ref} src={url} playsInline onEnded={() => done.current(false)} onError={() => done.current(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
      )}
      {muted && (
        <div style={{ position: 'absolute', top: 12, right: 12, padding: '6px 12px', borderRadius: 8,
          background: 'rgba(20,18,63,.8)', color: '#a5b4fc', fontSize: '.9rem', fontWeight: 600 }}>
          🔇 Click anywhere for sound
        </div>
      )}
    </div>
  )
}

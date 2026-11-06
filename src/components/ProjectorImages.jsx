import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction } from '../lib/audit'
import { IMAGE_BUCKET, PER_SLIDE_OPTIONS, readNotices, imageSlides, imageUrl } from '../lib/projectorNotices'

// Settings -> Projector Pictures (agreed 06-11-2026): pictures shown on the
// projector, so many to a slide, laid out automatically. Files go in the
// projector-images bucket (admin-only upload); the list lives in site_settings.

const MAX_W = 1920, MAX_H = 1080

// Shrink to projector size before upload so the screen loads quickly
async function shrink(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#14123f'   // projector background behind any transparent parts
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
}

export default function ProjectorImages() {
  const { profile } = useAuth()
  const [images, setImages]     = useState(null)
  const [perSlide, setPerSlide] = useState(1)
  const [busy, setBusy]         = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('key, value')
      .in('key', ['projector_images', 'projector_images_per_slide']).then(({ data }) => {
        const n = readNotices(Object.fromEntries((data || []).map(r => [r.key, r.value])))
        setImages(n.images)
        setPerSlide(n.perSlide)
      })
  }, [])

  if (!images) return null

  async function persist(list, per = perSlide) {
    const { error } = await supabase.from('site_settings').upsert([
      { key: 'projector_images', value: JSON.stringify(list) },
      { key: 'projector_images_per_slide', value: String(per) },
    ])
    if (error) throw error
  }

  async function upload(files) {
    if (!files.length) return
    setBusy(true)
    const added = []
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        const blob = await shrink(file)
        const path = `${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        added.push({ id: path, path, caption: '', from: '', until: '', active: true })
      }
    } catch (err) {
      alert('Upload failed: ' + err.message)
    }
    if (added.length) {
      const list = [...images, ...added]
      try {
        await persist(list)
        setImages(list)
        logAction(profile, 'Added projector pictures', `${added.length} picture${added.length === 1 ? '' : 's'}`).catch(() => {})
      } catch (err) { alert('Save failed: ' + err.message) }
    }
    setBusy(false)
  }

  async function remove(im) {
    if (!confirm('Delete this picture from the projector? This cannot be undone.')) return
    setBusy(true)
    try {
      const { error } = await supabase.storage.from(IMAGE_BUCKET).remove([im.path])
      if (error) throw error
      const list = images.filter(x => x.id !== im.id)
      await persist(list)
      setImages(list)
      logAction(profile, 'Deleted projector picture', im.caption || null).catch(() => {})
    } catch (err) { alert('Delete failed: ' + err.message) }
    setBusy(false)
  }

  async function save() {
    setBusy(true)
    try {
      const list = images.map(im => ({ ...im, caption: im.caption.trim(), until: im.until && im.from && im.until < im.from ? im.from : im.until }))
      await persist(list)
      setImages(list)
      logAction(profile, 'Updated projector pictures', `${list.length} pictures, ${perSlide} per slide`).catch(() => {})
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) { alert('Save failed: ' + err.message) }
    setBusy(false)
  }

  const change = (id, k, v) => { setImages(list => list.map(im => im.id === id ? { ...im, [k]: v } : im)); setSaved(false) }
  const move = (i, d) => {
    setImages(list => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; return l })
    setSaved(false)
  }
  const slideCount = imageSlides(images, perSlide).length
  const showing = imageSlides(images, perSlide).flat().length
  const small = { fontSize: '.73rem', color: 'var(--muted)' }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>Projector Pictures</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>
          Posters and photos for the projector. They're laid out automatically and shown whole - never cropped.
        </div>
      </div>

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '9px 12px',
        fontSize: '.8rem', color: '#92400e', marginBottom: 14 }}>
        ⚠ Everyone in the hall sees the projector. Only use photos of children whose families have given photo consent.
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: '.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          Pictures per slide
          <select value={perSlide} onChange={e => { setPerSlide(Number(e.target.value)); setSaved(false) }}
            style={{ width: 'auto', padding: '5px 10px' }}>
            {PER_SLIDE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="btn btn-outline btn-sm" style={{ cursor: busy ? 'wait' : 'pointer', margin: 0 }}>
          {busy ? 'Working…' : '+ Upload pictures'}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} style={{ display: 'none' }}
            onChange={e => { upload([...e.target.files]); e.target.value = '' }} />
        </label>
        <span style={small}>
          {showing} showing now on {slideCount} slide{slideCount === 1 ? '' : 's'}
        </span>
      </div>

      {images.length === 0 && <div style={{ ...small, marginBottom: 12 }}>No pictures yet.</div>}
      {images.map((im, i) => (
        <div key={im.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0',
          borderTop: '1px solid var(--border)', opacity: im.active === false ? .55 : 1 }}>
          <img src={imageUrl(im.path)} alt="" style={{ width: 96, height: 64, objectFit: 'contain', borderRadius: 6,
            background: '#14123f', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input type="text" value={im.caption} placeholder="Caption (optional)" maxLength={80}
              onChange={e => change(im.id, 'caption', e.target.value)} style={{ padding: '5px 9px', fontSize: '.85rem' }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: '.78rem', color: 'var(--muted)' }}>
              From <input type="date" value={im.from} onChange={e => change(im.id, 'from', e.target.value)}
                style={{ width: 'auto', padding: '3px 6px', fontSize: '.78rem' }} />
              until <input type="date" value={im.until} min={im.from || undefined} onChange={e => change(im.id, 'until', e.target.value)}
                style={{ width: 'auto', padding: '3px 6px', fontSize: '.78rem' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={im.active !== false} style={{ width: 'auto', margin: 0 }}
                  onChange={e => change(im.id, 'active', e.target.checked)} />
                Show
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className="btn btn-outline btn-xs" disabled={i === 0} onClick={() => move(i, -1)} title="Move earlier">↑</button>
            <button className="btn btn-outline btn-xs" disabled={i === images.length - 1} onClick={() => move(i, 1)} title="Move later">↓</button>
            <button className="btn btn-outline btn-xs" disabled={busy} onClick={() => remove(im)} title="Delete"
              style={{ color: 'var(--danger)' }}>✕</button>
          </div>
        </div>
      ))}

      <div style={{ ...small, margin: '6px 0 12px' }}>
        Dates are optional - leave blank to show every day. Uploads and deletes save straight away; press Save for
        captions, dates, order and pictures per slide.
      </div>
      <button className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save Pictures'}
      </button>
    </div>
  )
}

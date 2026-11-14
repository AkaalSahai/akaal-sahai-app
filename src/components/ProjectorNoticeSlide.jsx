import { useLayoutEffect, useRef } from 'react'
import { NOTICE_SECTIONS, NOTICE_SIZES, NOTICE_FONTS } from '../lib/projectorNotices'

// One notice on a projector slide (14-11-2026): heading above a coloured box
// holding the main text, second text and a small bottom line. Each section
// has its own size, font and colour; line breaks are kept. Used by the
// projector and by the live preview in Settings -> Projector Screen, so the
// preview looks exactly like the projector.
//
// Text size: every section's size is a multiple of one base size. With
// "grow" on, the base is made as big as fits the slide (binary search);
// with it off, the base is a fixed 3% of the slide width - shrunk only if
// the text wouldn't otherwise fit.

const GOLD = '#f0a500'
const MAX_BASE = 0.14     // grow: largest base, as a share of slide width
const FIXED_BASE = 0.03   // grow off

const multOf = size => NOTICE_SIZES.find(s => s.key === size)?.mult || 1
const fontOf = font => NOTICE_FONTS.find(f => f.key === font) || NOTICE_FONTS[0]

function sectionStyle(sec, extra) {
  const f = fontOf(sec.font)
  return {
    fontSize: `calc(var(--notice-base) * ${multOf(sec.size)})`,
    fontFamily: f.family, fontWeight: f.weight, color: sec.color,
    lineHeight: 1.25, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', textAlign: 'center',
    ...extra,
  }
}

export default function ProjectorNoticeSlide({ notice }) {
  const slideRef = useRef(null), boxRef = useRef(null), innerRef = useRef(null)
  const n = notice
  const has = k => !!n[k]?.text?.trim()
  const textKey = NOTICE_SECTIONS.map(({ key }) => `${n[key]?.text}|${n[key]?.size}|${n[key]?.font}`).join('§')

  useLayoutEffect(() => {
    const slide = slideRef.current, box = boxRef.current, inner = innerRef.current
    if (!slide || !box || !inner) return
    const fit = () => {
      const w = slide.clientWidth || window.innerWidth
      const fits = px => {
        slide.style.setProperty('--notice-base', `${px}px`)
        return slide.scrollHeight <= slide.clientHeight + 1
          && inner.offsetHeight <= box.clientHeight + 1
          && inner.scrollWidth <= inner.clientWidth + 1
      }
      let lo = 4, hi = Math.max(lo, w * (n.grow ? MAX_BASE : FIXED_BASE))
      if (fits(hi)) return
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2
        if (fits(mid)) lo = mid; else hi = mid
      }
      slide.style.setProperty('--notice-base', `${lo}px`)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(slide)
    document.fonts?.ready.then(fit).catch(() => {})
    return () => ro.disconnect()
  }, [textKey, n.grow])

  const boxHasText = has('main') || has('second') || has('footer')

  return (
    <div ref={slideRef} data-notice-slide style={{ width: '100%', height: '100%', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 'calc(var(--notice-base, 20px) * 0.5)', boxSizing: 'border-box',
      justifyContent: boxHasText ? 'flex-start' : 'center' }}>
      {has('heading') && (
        <div style={sectionStyle(n.heading, { flexShrink: 0, lineHeight: 1.15 })}>{n.heading.text.trim()}</div>
      )}
      {boxHasText && (
        <div ref={boxRef} style={{ flex: 1, minHeight: 0, background: n.box, border: `2px solid ${GOLD}`, borderRadius: 22,
          padding: 'calc(var(--notice-base, 20px) * 0.6) calc(var(--notice-base, 20px) * 0.9)', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <div ref={innerRef} style={{ width: '100%', display: 'flex', flexDirection: 'column',
            gap: 'calc(var(--notice-base, 20px) * 0.55)' }}>
            {has('main')   && <div style={sectionStyle(n.main)}>{n.main.text.trim()}</div>}
            {has('second') && <div style={sectionStyle(n.second)}>{n.second.text.trim()}</div>}
            {has('footer') && <div style={sectionStyle(n.footer, { opacity: .95 })}>{n.footer.text.trim()}</div>}
          </div>
        </div>
      )}
      {/* Heading only: it sits in the middle of the slide; these just keep
          the measuring refs valid */}
      {!boxHasText && <div ref={boxRef} style={{ display: 'none' }}><div ref={innerRef} /></div>}
    </div>
  )
}

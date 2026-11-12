import { useLayoutEffect, useRef, useState } from 'react'
import { imageUrl, textPosition, shownSides, slideBottomText } from '../lib/projectorNotices'

// One picture on a projector slide, with optional text beside or below it
// (agreed 07-11-2026). Used by the projector and by the preview in
// Settings -> Projector Pictures. Sizes use container units (cqw/cqh), so the
// small preview is laid out exactly like the full-size projector.

const GOLD = '#f0a500', CARD_BG = '#1e1a6e'
const GURMUKHI_FONT = "'Noto Sans Gurmukhi', 'Raavi', 'Gurmukhi MN', system-ui, sans-serif"

// Biggest text size for each choice, as % of the slide width. Text is only
// ever made smaller than this when it wouldn't otherwise fit its panel.
const MAX_TEXT = { auto: 4.2, small: 1.6, medium: 2.2, large: 3 }
// Text across the bottom has the whole slide width, so it can be bigger
// (12-11-2026: medium bottom text looked small on the projector)
const MAX_BOTTOM_TEXT = { auto: 3.4, small: 2.2, medium: 3, large: 4 }
// Width of each text panel for the fixed choices: [one side, both sides]
const PANEL_WIDTH = { narrow: [26, 20], medium: [34, 25], wide: [42, 30] }
const AUTO_MIN_PANEL = 18   // auto width: each panel gets at least this much
const GAP = 2

// A projector picture that stays hidden until it has fully downloaded, then
// fades in - so a slow connection never shows half a picture (07-11-2026)
export function ProjectorImg({ src, alt, style, onLoad }) {
  const ref = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const done = el => { setLoaded(true); onLoad?.(el) }
  useLayoutEffect(() => {
    // Already in memory (loaded ahead) - the load event may have fired before React saw it
    const el = ref.current
    if (el?.complete && el.naturalWidth) done(el)
  }, [src])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <img ref={ref} src={src} alt={alt} decoding="async" onLoad={e => done(e.currentTarget)}
      style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity .4s ease' }} />
  )
}

// Shrinks the text until it fits its panel (binary search on font size);
// re-runs when the panel changes size, e.g. once the picture has loaded
function useFitText(boxRef, contentRef, maxFrac, text) {
  useLayoutEffect(() => {
    const box = boxRef.current, content = contentRef.current
    if (!box || !content) return
    const slide = box.closest('[data-picture-slide]')
    const fit = () => {
      const maxPx = (slide?.clientWidth || window.innerWidth) * maxFrac / 100
      const fits = px => {
        box.style.fontSize = `${px}px`
        return content.offsetHeight <= box.clientHeight && content.scrollWidth <= box.clientWidth
      }
      let lo = 6, hi = Math.max(lo, maxPx)
      if (fits(hi)) return
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        if (fits(mid)) lo = mid; else hi = mid
      }
      box.style.fontSize = `${lo}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    document.fonts?.ready.then(fit).catch(() => {})
    return () => ro.disconnect()
  }, [boxRef, contentRef, maxFrac, text])
}

function TextPanel({ side, size, style, center, sizes = MAX_TEXT, tight }) {
  const boxRef = useRef(null), contentRef = useRef(null)
  const heading = side.heading?.trim(), body = side.body?.trim()
  useFitText(boxRef, contentRef, sizes[size] || sizes.auto, `${heading}\n${body}`)
  const longBody = (body || '').length > 140
  return (
    <div style={{ background: CARD_BG, border: `2px solid ${GOLD}`, borderRadius: '1.4cqw',
      padding: tight ? '1.2cqh 2.4cqw' : '2cqh 1.6cqw',
      boxSizing: 'border-box', minWidth: 0, minHeight: 0, display: 'flex', ...style }}>
      <div ref={boxRef} style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex',
        flexDirection: 'column', justifyContent: 'center', fontFamily: GURMUKHI_FONT }}>
        <div ref={contentRef} style={{ flexShrink: 0, overflowWrap: 'break-word' }}>
          {heading && (
            <div style={{ fontSize: '1.35em', fontWeight: 800, color: GOLD, lineHeight: 1.15, textAlign: 'center',
              marginBottom: body ? '0.5em' : 0, whiteSpace: 'pre-wrap' }}>{heading}</div>
          )}
          {body && (
            <div style={{ fontWeight: 600, lineHeight: 1.4, whiteSpace: 'pre-wrap', color: 'white',
              textAlign: longBody && !center ? 'left' : 'center' }}>{body}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Height of the bottom text band, % of the slide height. Auto (12-11-2026):
// the band hugs the text - only as tall and wide as the text needs, never
// more than BAND_MAX - so the pictures get all the rest of the screen.
const BAND_HEIGHT = { narrow: 16, medium: 24, wide: 34 }
const BAND_MAX = 40

// Pictures (children) with "Text across the bottom" centred in a band under
// them all. Used for one picture here and for 2-6 pictures on the projector.
export function SlideWithBottomText({ text, children }) {
  if (!text) return children
  return (
    <div data-picture-slide style={{ width: '100%', height: '100%', containerType: 'size', display: 'flex',
      flexDirection: 'column', gap: '2cqh' }}>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      {BAND_HEIGHT[text.area] ? (
        <TextPanel side={text} size={text.size} center sizes={MAX_BOTTOM_TEXT}
          style={{ flex: `0 0 ${BAND_HEIGHT[text.area]}cqh` }} />
      ) : (
        <TextPanel side={text} size={text.size} center tight sizes={MAX_BOTTOM_TEXT}
          style={{ flex: '0 0 auto', alignSelf: 'center', maxWidth: '100%', maxHeight: `${BAND_MAX}cqh` }} />
      )}
    </div>
  )
}

export default function ProjectorPictureSlide({ im }) {
  return (
    <SlideWithBottomText text={slideBottomText([im])}>
      <PictureOnly im={im} />
    </SlideWithBottomText>
  )
}

function PictureOnly({ im }) {
  const [aspect, setAspect] = useState(null)   // width / height, known once loaded
  const pos = textPosition(im)
  const sides = shownSides(im)
  const panels = (sides.left ? 1 : 0) + (sides.right ? 1 : 0)
  const caption = pos === 'below' ? im.caption?.trim() : ''
  const size = im.textSize || 'auto'
  const width = PANEL_WIDTH[im.textWidth] ? im.textWidth : 'auto'

  const img = (
    <ProjectorImg src={imageUrl(im.path)} alt={caption || im.left?.heading || im.right?.heading || ''}
      onLoad={el => setAspect(el.naturalWidth / el.naturalHeight || null)}
      style={{ maxWidth: '100%', maxHeight: caption ? 'calc(100% - 9cqh)' : '100%', minHeight: 0, objectFit: 'contain',
        borderRadius: '1.2cqw', border: `2px solid ${GOLD}`, display: 'block', boxSizing: 'border-box' }} />
  )

  // Picture area: auto width hugs the picture (as tall as the slide) so the
  // text panels get every bit of space it doesn't need
  // text panels get every bit of space it doesn't need; a fixed text width
  // keeps the picture right beside the text, the pair centred
  let pictureStyle = { flex: '1 1 0', minWidth: 0 }
  let panelStyle = {}
  if (panels) {
    const panelW = width === 'auto' ? AUTO_MIN_PANEL : PANEL_WIDTH[width][panels === 2 ? 1 : 0]
    if (aspect) {
      const cap = `calc(100cqw - ${panels * (panelW + GAP)}cqw)`
      pictureStyle = { flex: '0 0 auto', width: `min(${(aspect * 100).toFixed(2)}cqh, ${cap})`, minWidth: 0 }
    }
    panelStyle = width === 'auto' ? { flex: `1 1 ${panelW}cqw` } : { flex: `0 0 ${panelW}cqw` }
  }

  return (
    <div data-picture-slide style={{ width: '100%', height: '100%', containerType: 'size', display: 'flex',
      gap: `${GAP}cqw`, justifyContent: 'center', alignItems: 'stretch' }}>
      {sides.left && <TextPanel side={im.left} size={size} style={panelStyle} />}
      <div style={{ ...pictureStyle, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '1.5cqh', minHeight: 0 }}>
        {img}
        {caption && (
          <div style={{ fontSize: '2.3cqw', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, flexShrink: 0,
            color: 'white', fontFamily: GURMUKHI_FONT }}>{caption}</div>
        )}
      </div>
      {sides.right && <TextPanel side={im.right} size={size} style={panelStyle} />}
    </div>
  )
}

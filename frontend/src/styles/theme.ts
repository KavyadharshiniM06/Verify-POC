/**
 * MockBank Design Tokens — dark premium banking theme
 */
export const T = {
  // ── Core palette ──────────────────────────────────────────────────────────
  bg:          '#0d1117',   // page background — deep near-black
  bgSidebar:   '#0d1117',   // sidebar bg
  bgCard:      '#161b22',   // card / panel surface
  bgCardHover: '#1c2230',   // card hover
  bgInput:     '#1c2230',   // input/select background
  bgMuted:     '#21262d',   // muted surface (row stripes, tags)
  bgHighlight: '#1a2033',   // subtle highlight

  border:      '#30363d',   // standard border
  borderLight: '#21262d',   // very subtle row separator

  ink:         '#e6edf3',   // primary text — near-white
  inkSub:      '#8b949e',   // secondary / muted text
  inkLight:    '#484f58',   // very muted / disabled

  amber:       '#f0a500',   // primary CTA accent — golden amber
  amberDim:    '#c68400',   // hover state for amber
  amberLight:  'rgba(240,165,0,0.12)',   // amber tint bg
  amberBorder: 'rgba(240,165,0,0.30)',

  green:       '#3fb950',   // positive / success / credit
  greenLight:  'rgba(63,185,80,0.12)',
  greenBorder: 'rgba(63,185,80,0.30)',

  red:         '#f85149',   // error / danger / negative
  redLight:    'rgba(248,81,73,0.12)',
  redBorder:   'rgba(248,81,73,0.30)',

  blue:        '#58a6ff',   // info / link
  blueLight:   'rgba(88,166,255,0.12)',

  orange:      '#e09433',   // pending / warning
  orangeLight: 'rgba(224,148,51,0.12)',

  // ── Typography ─────────────────────────────────────────────────────────────
  fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',

  // ── Radii ──────────────────────────────────────────────────────────────────
  radiusCard:  '12px',
  radiusInner: '8px',
  radiusPill:  '999px',
  radiusBtn:   '8px',
  radiusInput: '8px',

  // ── Shadows ────────────────────────────────────────────────────────────────
  shadowCard: '0 1px 3px rgba(0,0,0,0.4)',
  shadowPop:  '0 8px 32px rgba(0,0,0,0.6)',
} as const

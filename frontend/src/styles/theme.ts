/**
 * MockBank Design Tokens — dark premium banking theme (Admin / HR Portal)
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

/**
 * Light theme tokens — Credit Analyst / Manager Portal
 * Used for non-Admin roles (Loan Approvals workspace).
 */
export const LT = {
  // ── Core palette ──────────────────────────────────────────────────────────
  bg:          '#f0f2f5',   // page background — soft off-white
  bgSidebar:   '#ffffff',   // sidebar — pure white
  bgCard:      '#ffffff',   // card / panel surface
  bgCardHover: '#f7f8fa',   // card hover
  bgInput:     '#f7f8fa',   // input/select background
  bgMuted:     '#f0f2f5',   // muted surface (row stripes, tags)
  bgHighlight: '#eef2ff',   // subtle highlight

  border:      '#d1d5db',   // standard border
  borderLight: '#e5e7eb',   // very subtle row separator

  ink:         '#111827',   // primary text — near-black
  inkSub:      '#4b5563',   // secondary / muted text
  inkLight:    '#9ca3af',   // very muted / disabled

  amber:       '#d97706',   // primary CTA — slightly darker amber for legibility on white
  amberDim:    '#b45309',
  amberLight:  'rgba(217,119,6,0.10)',
  amberBorder: 'rgba(217,119,6,0.30)',

  green:       '#059669',
  greenLight:  'rgba(5,150,105,0.10)',
  greenBorder: 'rgba(5,150,105,0.30)',

  red:         '#dc2626',
  redLight:    'rgba(220,38,38,0.10)',
  redBorder:   'rgba(220,38,38,0.30)',

  blue:        '#2563eb',
  blueLight:   'rgba(37,99,235,0.10)',

  orange:      '#d97706',
  orangeLight: 'rgba(217,119,6,0.10)',

  // ── Shared tokens ──────────────────────────────────────────────────────────
  fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',

  radiusCard:  '12px',
  radiusInner: '8px',
  radiusPill:  '999px',
  radiusBtn:   '8px',
  radiusInput: '8px',

  shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
  shadowPop:  '0 8px 32px rgba(0,0,0,0.15)',
} as const

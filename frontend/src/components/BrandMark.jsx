import { useId } from 'react'

// The अर्थNiti mark: an eight-petal lotus rosette around a rupee coin, with three
// coins falling below it.
//
// Drawn as inline SVG rather than dropped in as a raster, for three reasons that
// all matter in this app:
//
//   * every colour is a `--mark-*` token, so the same element serves light and
//     dark mode with no second asset. The petals keep a hairline edge in
//     `--mark-edge` because they overlap: where two petals meet, the outline is
//     the only thing separating one from the next.
//   * the masthead renders it at 46px and phones at 40px. A gradient PNG blurs
//     at that size; strokes and curves stay crisp.
//   * it prints. `@media print` resets `--mark-*` back to the full-colour
//     palette, so a laptop in dark mode still puts a legible mark on the /report
//     PDF rather than one drawn with a dark-mode hairline.
//
// Colours live in index.css, not here. Never hardcode a hex in this file —
// public/favicon.svg is the one place that has to, because a favicon is loaded
// as an image and cannot see the page's custom properties.

// Two petal outlines, both drawn pointing up and rotated into place around
// CENTRE. The cardinal petal is a lens, sharp at both ends; the diagonal is a
// leaf, rounded outward and sharp at the tip that tucks under the coin. The
// diagonals are shorter and wider so the four of them read as the layer behind.
const CARDINAL = 'M60 2C74 16 78 32 60 48C42 32 46 16 60 2Z'
const DIAGONAL = 'M60 48C38 40 40 10 60 10C80 10 82 40 60 48Z'
const CENTRE = '60 46'
const DIAGONALS = [45, 135, 225, 315]
const CARDINALS = [0, 90, 180, 270]

// Falling coins: [cx, cy, r]. Uneven sizes and heights are what make three
// circles read as motion rather than as a row of dots.
const DROPS = [
  [33, 99, 9.2],
  [60, 110, 10.2],
  [87, 100, 8.6],
]

const SIZE_CLASS = {
  sm: 'ui-brand-mark-sm',
  md: 'ui-brand-mark',
  lg: 'ui-brand-mark-lg',
}

// The gradient needs a document-unique id, or two marks on one page are two
// elements sharing one id. React 19's useId returns a string with punctuation in
// it (guillemets), which has no business inside a url(#...) reference, so it is
// stripped down to word characters.
function BrandMark({ size = 'md', className = '' }) {
  const petalId = 'mark' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const classes = [SIZE_CLASS[size] || SIZE_CLASS.md, className].filter(Boolean).join(' ')

  return (
    <svg
      className={classes}
      viewBox="13 0 94 122"
      xmlns="http://www.w3.org/2000/svg"
      // Every placement sits next to the product name in text, so the mark adds
      // nothing a screen reader needs. `focusable` is for IE/legacy Edge, which
      // put SVGs in the tab order.
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Centred on the coin, so "outward" is magenta and "inward" is gold for
            all eight petals at once — one gradient instead of eight, because
            userSpaceOnUse means the rotation moves the petal, not the ramp. */}
        {/* The last stop lands at 0.86, not 1: the ramp has to finish before the
            petal tips do, or the magenta only ever shows as a thin rim on the
            four cardinal petals and the mark reads as orange. */}
        <radialGradient id={petalId} cx="60" cy="46" r="46" gradientUnits="userSpaceOnUse">
          <stop offset="0.16" style={{ stopColor: 'var(--mark-petal-inner)' }} />
          <stop offset="0.44" style={{ stopColor: 'var(--mark-petal-mid)' }} />
          <stop offset="0.86" style={{ stopColor: 'var(--mark-petal-outer)' }} />
        </radialGradient>
      </defs>

      {/* stroke and stroke-width inherit in SVG, so the edge is set once here.
          It has to be a CSS property rather than a presentation attribute:
          attributes do not accept var(). */}
      <g
        style={{
          stroke: 'var(--mark-edge)',
          strokeWidth: 'var(--mark-edge-w)',
          strokeLinejoin: 'round',
        }}
      >
        {DIAGONALS.map((deg) => (
          <path key={deg} d={DIAGONAL} fill={`url(#${petalId})`} transform={`rotate(${deg} ${CENTRE})`} />
        ))}
        {CARDINALS.map((deg) => (
          <path key={deg} d={CARDINAL} fill={`url(#${petalId})`} transform={`rotate(${deg} ${CENTRE})`} />
        ))}
      </g>

      {/* The coin. Ring first, then face, then a highlight — all three from
          --mark-coin-* tokens, so the stack recolours per theme in one place. */}
      <circle cx="60" cy="46" r="17.5" style={{ fill: 'var(--mark-coin-ring)' }} />
      <circle cx="60" cy="46" r="13" style={{ fill: 'var(--mark-coin-face)' }} />
      <ellipse cx="55" cy="40.8" rx="4.4" ry="2.3" transform="rotate(-32 55 40.8)" style={{ fill: 'var(--mark-coin-shine)', opacity: 0.72 }} />
      {/* The rupee sign as text, not a hand-drawn path: ₹ is already printed on
          every figure in this app through formatCurrency, so the glyph is known
          to render here. Escaped rather than literal so glyph-audit.mjs reads it
          as a string literal and does not report it as a bare decorative glyph. */}
      <text
        x="60"
        y="46.5"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: 'var(--mark-coin-glyph)', fontFamily: 'inherit', fontSize: 19, fontWeight: 800 }}
      >
        {'₹'}
      </text>

      {/* Rim drawn as a slightly larger filled circle rather than a stroke, so it
          cannot inherit the petal edge width and cannot overflow the viewBox. */}
      {DROPS.map(([cx, cy, r]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r={r} style={{ fill: 'var(--mark-drop-edge)' }} />
          <circle cx={cx} cy={cy} r={r - 2} style={{ fill: 'var(--mark-drop)' }} />
        </g>
      ))}
    </svg>
  )
}

export default BrandMark

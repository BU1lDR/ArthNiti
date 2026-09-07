import { APP_NAME } from '../i18n/brand'

// The अर्थNiti wordmark for the utility strip: the two halves of the name in
// contrasting weights and warm tones, over a gold swoosh.
//
// Set as live text rather than as an image, for the reasons that decide most
// things in this app: it recolours itself for high contrast, it scales with
// --ui-scale, a screen reader reads it, and it does not blur on a projector.
//
// The name is split on the Devanagari/Latin boundary rather than being hardcoded
// twice, so `i18n/brand.js` stays the one place the product is spelled. The two
// halves ARE the wordmark's design — अर्थ heavier, Niti lighter — which is also
// why they are separate spans rather than one string with a font-weight.
const SPLIT = APP_NAME.indexOf('N')
const ARTH = SPLIT > 0 ? APP_NAME.slice(0, SPLIT) : APP_NAME
const NITI = SPLIT > 0 ? APP_NAME.slice(SPLIT) : ''

// The swoosh: a shallow rising curve with a bead at the tip, the way the logo
// draws it. preserveAspectRatio="none" lets it stretch to whatever width the
// name occupies, so it stays tucked under the word in every language's text
// scale instead of being sized against one of them.
function BrandWordmark({ className = '' }) {
  return (
    <span className={`ui-wordmark ${className}`.trim()}>
      <span className="ui-wordmark-text">
        <span className="ui-wordmark-arth">{ARTH}</span>
        {NITI && <span className="ui-wordmark-niti">{NITI}</span>}
      </span>
      <svg
        className="ui-wordmark-swoosh"
        viewBox="0 0 100 9"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M1 7.4C28 1.9 62 1.2 92 3.6"
          fill="none"
          style={{ stroke: 'var(--wordmark-swoosh)', strokeWidth: 'var(--wordmark-swoosh-w)', strokeLinecap: 'round' }}
          // The curve is drawn in a 100x9 box and then squashed by
          // preserveAspectRatio, so a plain stroke-width would be squashed with
          // it. vector-effect keeps the line the width it asks for.
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="95.5" cy="3.4" r="2.2" style={{ fill: 'var(--wordmark-dot)' }} />
      </svg>
    </span>
  )
}

export default BrandWordmark

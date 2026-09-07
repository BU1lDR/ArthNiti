// Charts, hand-rolled on the .ui-bar-* / .ui-unit-chart CSS.
//
// Deliberately not a charting library. Three reasons that all matter here:
// colours come from the theme tokens so dark mode and high contrast work with no
// extra code; the bars survive `window.print()`, where a JS library has already
// measured a screen-width container before the paper layout re-measures; and the
// number is always printed as text next to the bar, so the chart is decoration
// over a readable figure rather than the only place the value exists.
//
// That last point is the accessibility contract: the track carries
// aria-hidden="true" because the label and value above it already say the same
// thing to a screen reader.

const TONE_CLASS = {
  neutral: '',
  good: 'is-good',
  warn: 'is-warn',
  bad: 'is-bad',
}

function clamp(fraction) {
  if (typeof fraction !== 'number' || Number.isNaN(fraction)) return 0
  if (fraction < 0) return 0
  if (fraction > 1) return 1
  return fraction
}

// One labelled horizontal bar. `marks` places dashed threshold lines, used for
// the 30% and 50% repayment-pressure bands.
export function BarRow({ label, icon, valueText, fraction, tone = 'neutral', marks = [] }) {
  return (
    <div className="ui-bar-row">
      <div className="ui-bar-head">
        <span className="ui-bar-label">
          {icon && <span aria-hidden="true">{icon}</span>}
          {label}
        </span>
        <span className={`ui-bar-value ${tone === 'bad' ? 'is-bad' : ''}`}>{valueText}</span>
      </div>
      <div className="ui-bar-track" aria-hidden="true">
        <div
          className={`ui-bar-fill ${TONE_CLASS[tone] || ''}`}
          style={{ width: `${clamp(fraction) * 100}%` }}
        />
        {marks.map((mark) => (
          <span key={mark.at} className="ui-bar-mark" style={{ left: `${clamp(mark.at) * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

// A group of bars scaled against one shared maximum, so their lengths can be
// compared to each other. Scaling each bar to its own value would make ₹5,000
// and ₹5,00,000 draw identically — the most misleading thing a bar chart can do.
//
// Negative values do not get a bar. This used to scale on Math.abs, so a
// ₹10,000 loss drew exactly the bar a ₹10,000 profit drew, and in a group of
// {money in, money out, money left} a long bar means "plenty" to any reader who
// is not also parsing the minus sign — the favourable-misreading failure this
// codebase has shipped before. A shortfall is not a small amount of money, so it
// draws as an empty track; the printed value carries the sign and the magnitude.
// The scale is taken over the positive values alone for the same reason: a large
// loss must not stretch the axis and shrink every real bar beside it.
export function BarGroup({ items, caption }) {
  const amounts = items.map((item) => Number(item.value) || 0)
  const max = Math.max(...amounts.filter((amount) => amount > 0), 1)

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <BarRow
          key={item.label}
          label={item.label}
          icon={item.icon}
          valueText={item.valueText}
          fraction={amounts[index] > 0 ? amounts[index] / max : 0}
          tone={item.tone}
        />
      ))}
      {caption && <p className="ui-chart-caption">{caption}</p>}
    </div>
  )
}

// Counting pictures instead of reading a number. `total` icons are drawn and the
// first `filled` are coloured — this is the one chart on the page that works
// with no numeracy at all, which is why the results pages lead with it.
//
// `ariaLabel` is the screen-reader sentence. Callers pass a translated one; the
// fallback is English, so it stays a caller responsibility rather than a silently
// untranslated string. `role="img"` means the icons are read as one label, not as
// ten separate coin emoji.
export function UnitChart({ filled, total = 10, icon = '🪙', label, ariaLabel }) {
  const safeTotal = Math.max(1, Math.round(total))
  const safeFilled = Math.min(safeTotal, Math.max(0, Math.round(filled || 0)))

  return (
    <div>
      {label && <p className="ui-bar-label mb-2">{label}</p>}
      <div className="ui-unit-chart" role="img" aria-label={ariaLabel || `${safeFilled} of ${safeTotal}`}>
        {Array.from({ length: safeTotal }, (_, index) => (
          <span key={index} className={index < safeFilled ? 'is-filled' : ''}>
            {icon}
          </span>
        ))}
      </div>
    </div>
  )
}

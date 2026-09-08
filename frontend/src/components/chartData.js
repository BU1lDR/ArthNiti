// Chart data, not chart markup. It lives beside Charts.jsx rather than in it
// because `react-refresh/only-export-components` fails a component file that
// also exports a plain function — Fast Refresh cannot tell which export it is
// safe to hot-swap, so it gives up on the whole module. A `.js` sibling keeps
// the coupling to BarGroup's item shape visible without costing the refresh.
//
// Everything here returns an array in BarGroup's `items` shape:
//   { label, icon, value, valueText, tone }

// The scheme-fit chart's data, shared by /schemes and /analysis so the two pages
// cannot drift apart again — they had the same chart under different gates, and
// the ungated one was drawing the misreading the gated one existed to prevent.
//
// It is one bar per distinct match score, NOT one per scheme, and the bar length
// is how MANY schemes sit at that score. That inversion is forced by the scorer:
// only 90 (open nationwide) and 100 (names your state) are reachable, so
// per-scheme bars draw a dozen bars of at most two near-identical lengths — and
// on a category where every match scores 90 they draw a dozen *identical
// full-length* bars, which reads as a perfect fit for all twelve. Grouping says
// the one thing this data honestly can: how many of your matches are made for
// your state, and how many are open to everyone.
//
// Longer still means more of a good thing — more schemes you can walk in and
// apply for — and the fit itself is printed as the label, so bar length is never
// the only place a number exists.
//
// Returns [] when there is nothing to compare, so a caller's gate and its data
// are one expression and cannot disagree.
export function schemeFitItems(schemes, t) {
  const counts = new Map()

  for (const scheme of Array.isArray(schemes) ? schemes : []) {
    if (!scheme || typeof scheme !== 'object') continue
    const score = scheme.match_score
    // Number(null) is 0 and passes Number.isFinite, so guard the raw value —
    // a scheme with no score must be left out, not charted at zero.
    if (score === null || score === undefined || score === '') continue
    if (!Number.isFinite(Number(score))) continue
    counts.set(Number(score), (counts.get(Number(score)) || 0) + 1)
  }

  // A single bar cannot show a split, which is the only thing this chart says.
  if (counts.size < 2) return []

  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([score, count]) => ({
      label: t('sc.matchPct', { n: score }),
      icon: '🏛️',
      value: count,
      valueText: t('an.matches', { n: count }),
      tone: 'good',
    }))
}

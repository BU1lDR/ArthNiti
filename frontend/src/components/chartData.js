// Chart data, not chart markup. It lives beside Charts.jsx rather than in it
// because `react-refresh/only-export-components` fails a component file that
// also exports a plain function — Fast Refresh cannot tell which export it is
// safe to hot-swap, so it gives up on the whole module. A `.js` sibling keeps
// the coupling to BarGroup's item shape visible without costing the refresh.
//
// Everything here returns an array in BarGroup's `items` shape:
//   { label, icon, value, valueText, tone }

import { FIT_ORDER, fitLabel } from '../i18n/backendText'

// The scheme-fit chart's data, shared by /schemes and /analysis so the two pages
// cannot drift apart again — they had the same chart under different gates, and
// the ungated one was drawing the misreading the gated one existed to prevent.
//
// It is one bar per fit basis, NOT one per scheme, and the bar length is how MANY
// schemes have that basis. That inversion is forced by the scorer: every match is
// named for the reader's state alone, named for it among a few others, or for
// all of India, and nothing else separates them, so per-scheme bars draw a dozen
// bars of at most two lengths — and on a category where every match is
// nationwide, a dozen *identical full-length* bars, which reads as a perfect fit
// for all twelve. Grouping says the one thing this data honestly can: how many
// of your matches are made for your state (or your region), and how many are
// for everyone.
//
// It groups on `fit_basis`, not on `match_score`, and labels each bar with the
// fit words rather than "90% match" / "100% match". The score is 60 + 40 or
// 60 + 30 and checks no eligibility rule, so a percentage read as a chance of
// qualifying that nothing computes. The words come from fitLabel, the same map
// the cards use, so the chart and the cards cannot describe one scheme two ways.
//
// Longer means more schemes of that kind, and the count is printed beside each
// bar, so bar length is never the only place a number exists.
//
// Returns [] when there is nothing to compare, so a caller's gate and its data
// are one expression and cannot disagree.
const fitRank = (basis) => {
  const index = FIT_ORDER.indexOf(basis)
  return index === -1 ? FIT_ORDER.length : index
}

export function schemeFitItems(schemes, t) {
  const counts = new Map()

  for (const scheme of Array.isArray(schemes) ? schemes : []) {
    if (!scheme || typeof scheme !== 'object') continue
    // A scheme with no basis is left out rather than charted under a blank
    // label. The backend sends null only when neither geography branch ran,
    // which no real request reaches.
    const basis = String(scheme.fit_basis ?? '').trim().toLowerCase()
    if (!basis) continue
    counts.set(basis, (counts.get(basis) || 0) + 1)
  }

  // A single bar cannot show a split, which is the only thing this chart says.
  if (counts.size < 2) return []

  return [...counts.entries()]
    .sort((a, b) => fitRank(a[0]) - fitRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([basis, count]) => ({
      label: fitLabel(basis, t),
      icon: '🏛️',
      value: count,
      valueText: t('an.matches', { n: count }),
      tone: 'good',
    }))
}

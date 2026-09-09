// Why this exists: the landing backdrop was reported as "not visible in light
// mode" three times, and each attempt to fix it by eye traded one problem for
// another — raise the opacity and the hero copy stops being readable, add a
// contrast filter and the artwork's cream fills get pushed further toward the
// page white. Eyeballing a translucent layer over a near-white background does
// not work, because three attenuations multiply before anything reaches the
// screen and none of them are visible in the CSS:
//
//   1. per-element `opacity` inside the SVG (0.38 - 0.85 on most paths)
//   2. the `softTop` gradient mask, 0 at the top edge rising to 1 at the bottom
//   3. the CSS `opacity: var(--landing-art-opacity)` on .ui-hero::before
//
// So this models the whole chain numerically: parse every drawn element out of
// the SVG with its own opacity and its vertical position, run the CSS filter
// chain in sRGB (which is where the shorthand filter functions operate), blend
// at the product of the three alphas, and report two things that matter and
// cannot be seen by looking:
//
//   * how much of the drawing is perceptually present (dL* against the page)
//   * whether the hero text still clears WCAG AA over the *worst* patch of
//     artwork it can land on
//
// The second one is the constraint that kept every hand-tuned attempt failing.
// Run: node tools/verify/art-contrast.mjs
import { readFileSync } from 'node:fs'

const SVG = 'frontend/public/town-consulting.svg'
const PAGE_BG = '#F3F6FA'   // --color-bg, light theme
const HERO_TEXT = '#12233A' // --color-text, what the hero copy uses
const MUTED = '#4E6178'     // --color-text-muted, what it used to use

// The softTop mask stops, as authored in the SVG. Piecewise-linear between them.
const STOPS = [[0, 0], [0.3, 0.45], [0.62, 0.88], [1, 1]]
const maskAt = (f) => {
  for (let i = 1; i < STOPS.length; i++) {
    const [x0, y0] = STOPS[i - 1]
    const [x1, y1] = STOPS[i]
    if (f <= x1) return y0 + ((y1 - y0) * (f - x0)) / (x1 - x0)
  }
  return 1
}

// --- parse the drawing ------------------------------------------------------
// Group `fill` and `opacity` inherit, so the innermost open <g> is tracked. The
// vertical anchor is the median y in the element's geometry, which is only ever
// used to look up the mask ramp — precision beyond "which third of the drawing"
// buys nothing.
function parseElements(svgText) {
  const HEIGHT = 460 // the viewBox height
  const els = []
  let groupFill = null
  let groupOpacity = 1

  for (const line of svgText.split('\n')) {
    const open = line.match(/<g\s[^>]*>/)
    if (open) {
      const f = open[0].match(/fill="(#[0-9a-f]{6})"/i)
      const o = open[0].match(/opacity="([\d.]+)"/)
      if (f) groupFill = f[1]
      if (o) groupOpacity = Number(o[1])
    }
    if (/<\/g>/.test(line)) {
      groupFill = null
      groupOpacity = 1
    }
    if (!/<(path|rect|circle|ellipse|polygon)\b/.test(line)) continue

    const fill = line.match(/fill="(#[0-9a-f]{6})"/i)?.[1] || groupFill
    if (!fill) continue
    const own = line.match(/\sopacity="([\d.]+)"/)
    const opacity = own ? Number(own[1]) : groupOpacity

    const attrs = [...line.matchAll(/\bc?y="(-?\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]))
    const path = [...line.matchAll(/[MLC]\s?-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)]
      .map((m) => Number(m[1]))
      .filter((v) => v >= 0 && v <= HEIGHT)
    const ys = attrs.length ? attrs : path
    const y = ys.length ? ys.sort((a, b) => a - b)[Math.floor(ys.length / 2)] : HEIGHT / 2

    els.push({ fill, opacity, mask: maskAt(y / HEIGHT) })
  }
  return els
}

// --- colour ----------------------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const clamp = (v) => Math.min(1, Math.max(0, v))

// CSS shorthand filters operate in sRGB, not linear light. brightness() then
// contrast() compose to one affine map per channel: v * b * k + 0.5 * (1 - k).
const affine = (b, k) => (c) => c.map((v) => clamp(v * b * k + 0.5 * (1 - k)))
const saturate = (a) => (c) => {
  const [r, g, bl] = c
  const m = [
    0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a,
    0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a,
    0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a,
  ]
  return [
    m[0] * r + m[1] * g + m[2] * bl,
    m[3] * r + m[4] * g + m[5] * bl,
    m[6] * r + m[7] * g + m[8] * bl,
  ].map(clamp)
}

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminance = (c) => 0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2])
const lightness = (c) => {
  const y = luminance(c)
  return y <= 216 / 24389 ? y * (24389 / 27) : Math.cbrt(y) * 116 - 16
}
const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

// --- evaluate one filter/opacity combination -------------------------------
// `band` is the mean over the elements the mask actually intends to show. The
// top of the drawing is deliberately faded to nothing, so averaging over the
// whole file understates every configuration equally and hides the differences
// that matter.
const BAND = 0.6

function evaluate(els, bg, textColor, { brightness, sat, contrast, opacity }) {
  const page = hex(bg)
  const text = hex(textColor)
  const filter = (c) => affine(brightness, contrast)(saturate(sat)(c))
  let bandSum = 0
  let bandCount = 0
  let invisible = 0
  let maxDelta = 0
  let worstText = Infinity

  for (const el of els) {
    const alpha = el.opacity * el.mask * opacity
    const fg = filter(hex(el.fill))
    const out = page.map((p, i) => fg[i] * alpha + p * (1 - alpha))
    const delta = Math.abs(lightness(out) - lightness(page))
    maxDelta = Math.max(maxDelta, delta)
    worstText = Math.min(worstText, contrastRatio(text, out))
    if (el.mask >= BAND) {
      bandSum += delta
      bandCount += 1
      if (delta < 5) invisible += 1
    }
  }
  return {
    band: bandSum / bandCount,
    maxDelta,
    worstText,
    invisiblePct: (100 * invisible) / bandCount,
    bandCount,
  }
}

// --- is this script still describing the shipped page? ----------------------
// Everything below models town-consulting.svg specifically: its per-element
// opacities, and the softTop mask whose stops are transcribed at the top of this
// file. That makes it worthless the moment the backdrop is a different file —
// and worse than worthless, because it would keep printing confident numbers
// about an image nobody sees. The landing backdrop was replaced with an opaque
// JPEG on 8 Sept 2026, so this now refuses to run rather than lying. See
// tools/verify/hero-art.mjs, which measures whatever the page actually
// uses; the raster equivalent of this modelling lives there.
const CSS = readFileSync('frontend/src/index.css', 'utf8')
const shippedBackdrop = (CSS.match(/\.ui-hero::before[\s\S]*?background-image:\s*url\(["']?([^"')]+)/) || [])[1]
if (shippedBackdrop && !SVG.endsWith(shippedBackdrop.replace(/^\//, ''))) {
  console.error(`This script models ${SVG}, but .ui-hero::before now uses ${shippedBackdrop}.`)
  console.error('Its mask stops and per-element alphas do not describe that file, so every')
  console.error('number it prints would be about an image the page no longer shows.')
  console.error('Use tools/verify/hero-art.mjs instead — it reads the backdrop off the page.')
  process.exit(2)
}

// --- report ----------------------------------------------------------------
const els = parseElements(readFileSync(SVG, 'utf8'))
console.log(`${els.length} drawn elements parsed from ${SVG}\n`)

const SHIPPED = { brightness: 0.9, sat: 1.3, contrast: 1.08, opacity: 0.34 }
const before = evaluate(els, PAGE_BG, MUTED, SHIPPED)
console.log('BEFORE  brightness .9 saturate 1.3 contrast 1.08 opacity .34, copy at --color-text-muted')
console.log(`  mean dL* in the visible band : ${before.band.toFixed(1)}`)
console.log(`  invisible (dL* < 5)          : ${before.invisiblePct.toFixed(0)}% of ${before.bandCount} band elements`)
console.log(`  worst hero-copy contrast     : ${before.worstText.toFixed(2)}:1  ${before.worstText < 4.5 ? '<-- under the 4.5 AA floor' : ''}`)

// Constraints, in the order they bind:
//   worstText >= 4.5   hero copy stays AA over the darkest patch of artwork
//   invisible <= 6%    almost all of the intended-visible band actually shows
//   maxDelta  <= 34    still a backdrop, not a competing illustration
//   contrast in [.85, 1.05] and saturate >= 1.2 -- a heavy contrast() reduction
//   maximises measured visibility by flattening every fill toward mid-grey,
//   which scores well and looks like a grey smudge. Keeping contrast near
//   neutral preserves the drawing's own tonality, and saturate then has
//   something left to work with.
const candidates = []
for (let b = 0.5; b <= 1.201; b += 0.02) {
  for (let s = 1.2; s <= 1.71; s += 0.05) {
    for (let k = 0.85; k <= 1.051; k += 0.01) {
      for (let o = 0.3; o <= 1.001; o += 0.025) {
        const cfg = { brightness: +b.toFixed(2), sat: +s.toFixed(2), contrast: +k.toFixed(2), opacity: +o.toFixed(3) }
        const r = evaluate(els, PAGE_BG, HERO_TEXT, cfg)
        if (r.worstText < 4.5 || r.invisiblePct > 6 || r.maxDelta > 34) continue
        candidates.push({ ...cfg, ...r })
      }
    }
  }
}
candidates.sort((x, y) => y.band - x.band)
console.log(`\n${candidates.length} candidates clear all four constraints. Top by visibility:\n`)
console.log('bright  sat  contr  opac | band dL*  max   invis  hero-copy')
for (const c of candidates.slice(0, 10)) {
  console.log(
    `${c.brightness.toFixed(2)}   ${c.sat.toFixed(2)}  ${c.contrast.toFixed(2)}   ${c.opacity.toFixed(3)} |` +
      `   ${c.band.toFixed(1).padStart(4)}   ${c.maxDelta.toFixed(1).padStart(4)}   ${c.invisiblePct.toFixed(1)}%   ${c.worstText.toFixed(2)}:1`,
  )
}

// Dark mode is the reference the report was made against: whatever light mode
// lands on should be at least as present as dark mode already is.
const DARK_BG = '#081827'
const dark = evaluate(els, DARK_BG, '#EAF1F8', { brightness: 1.16, sat: 0.9, contrast: 1, opacity: 0.26 })
console.log(`\nDARK as shipped, for reference : band dL* ${dark.band.toFixed(1)}, invisible ${dark.invisiblePct.toFixed(0)}%`)

// Named shortlist. The sweep maximises measured visibility, which pushes toward
// a heavy brightness reduction — and that scores well while looking like a grey
// smudge, because halving every channel in sRGB takes the chroma with it. These
// trade a little visibility back for colour: saturate() barely moves luminance,
// so it is nearly free against all four constraints, and a higher brightness
// paired with a higher opacity keeps the hue while landing in the same place.
// Pass a config on the command line to check one:
//   node tools/verify/art-contrast.mjs 0.62 1.9 0.95 0.62
const SHORTLIST = [
  ['sweep optimum          ', { brightness: 0.5, sat: 1.4, contrast: 0.91, opacity: 0.5 }],
  ['more colour, mid        ', { brightness: 0.58, sat: 1.8, contrast: 0.94, opacity: 0.56 }],
  ['more colour, lighter    ', { brightness: 0.62, sat: 1.9, contrast: 0.95, opacity: 0.62 }],
  ['most colour             ', { brightness: 0.66, sat: 2.1, contrast: 0.96, opacity: 0.68 }],
]
const cli = process.argv.slice(2).map(Number)
if (cli.length === 4) {
  SHORTLIST.push(['command line            ', { brightness: cli[0], sat: cli[1], contrast: cli[2], opacity: cli[3] }])
}
console.log('\nShortlist, all against the same four constraints:\n')
console.log('config                    bright  sat  contr  opac | band dL*  max   invis  hero-copy')
for (const [label, cfg] of SHORTLIST) {
  const r = evaluate(els, PAGE_BG, HERO_TEXT, cfg)
  const ok = r.worstText >= 4.5 && r.invisiblePct <= 6 && r.maxDelta <= 34
  console.log(
    `${label}  ${cfg.brightness.toFixed(2)}   ${cfg.sat.toFixed(2)}  ${cfg.contrast.toFixed(2)}   ${cfg.opacity.toFixed(2)} |` +
      `   ${r.band.toFixed(1).padStart(4)}   ${r.maxDelta.toFixed(1).padStart(4)}   ${r.invisiblePct.toFixed(1)}%   ` +
      `${r.worstText.toFixed(2)}:1  ${ok ? '' : '<-- fails a constraint'}`,
  )
}

// What actually reaches the paper when someone prints /report?
//
// This is the one output nothing else in screenshots/verify/ can see. drive.mjs,
// mobile-audit and lang-layout all measure the SCREEN; the @media print block is
// a different stylesheet that no amount of screen measurement exercises. It has
// been "verified" only by reading index.css, and reading a print block is exactly
// as reliable as reading any other CSS — which is to say it tells you what the
// author intended, not what the engine does.
//
// Two of the three checks here found a real defect the first time they ran, and
// both are the same shape: a rule that looks correct and matches nothing.
//
//   1. DETAILS  — the print block hides `.ui-disclosure > summary` and sets
//      `.ui-disclosure-body { display: grid !important }`, intending to force a
//      collapsed <details> open so the detailed figures reach the PDF. But a
//      closed <details> is not hidden by a `display` rule on its children. In
//      Chromium the UA stylesheet puts `content-visibility: hidden` on the
//      `::details-content` pseudo-element that wraps them, and no `display`
//      declaration on a descendant can defeat that — the descendant is not laid
//      out at all. `!important` does not help, because it is not fighting a
//      display rule. So the figures silently vanish from the printed page: the
//      user carries a sheet to a bank with a section heading and no numbers.
//
//   2. CHROME   — the print block hides `.ui-footer`, and no element in the app
//      carries that class. The footer is `.ui-footer-gov` + `.ui-footer-bottom`
//      (App.jsx GovFooter). `.ui-footer` is a live rule in index.css that styles
//      nothing, so the selector list reads complete while the government footer,
//      helpline column and all, prints onto the page.
//
//   3. TOKENS   — `@media print` restates the whole `--mark-*` palette so that
//      what comes out of the printer does not depend on the theme the laptop was
//      in. That reset is invisible on screen by construction, so this is the only
//      place it can be checked. Run in dark as well as light, since dark is the
//      theme whose values the reset has to undo.
//
//      This check was itself incomplete in the same way the block it audits was:
//      it read the five palette tokens the reset already covered, which can only
//      ever confirm that the reset resets what it resets. Six tokens were
//      uncovered, and two of them draw on the sheet — --color-danger is the
//      shortfall figure and the `.ui-bar-value.is-bad` figure (#FFB4AB from a
//      dark laptop, 1.9:1 on white), --color-success fills the "good" bar
//      (#7CD9A5, all but gone) — so a red number and a green bar depended on the
//      theme the laptop was in. The assertion is now that EVERY palette token
//      resolves identically in every mode: exact, threshold-free, and it fails on
//      a token the reset forgets rather than on one it mishandles.
//
//      There were four modes here until 8 September 2026 — light and dark, each
//      with and without high contrast. High contrast was removed from the app, so
//      its two cases went; the invariance check is unchanged in form and still
//      compares dark against light, which is the pairing the reset exists for.
//
// The technique is `Emulation.setEmulatedMedia({media: 'print'})`, which swaps
// the engine's media evaluation without a print dialog, and then ordinary
// getBoundingClientRect / getComputedStyle. An element the print stylesheet has
// hidden measures 0x0; one it failed to hide measures its real box.
//
// Needs the Vite dev server up. Run from the repo root:
//   node tools/verify/print-audit.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9359
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/print')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-print')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Same seed the other drivers use, so /report is as full as it ever gets.
const SEED = {
  profile: { name: 'Lakshmi Devi', language: 'Tamil', dialect: '', literacyLevel: 'low' },
  business: {
    businessName: 'Lakshmi Tailors', category: 'tailoring', categoryOther: '',
    initialInvestment: '200000', monthlyRevenue: '30000',
    monthlyOperatingExpenses: '18000', employees: 2, existingDebt: 0,
  },
  location: {
    village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
    locationType: 'rural', marketType: ['village', 'weekly'], customers: 'Local families',
  },
  finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000' },
  result: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')),
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.sessionId = null
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('CDP socket error')))
    })
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      // Include the params CDP objected to. "Runtime.evaluate: Invalid parameters"
      // on its own names the method and nothing else, which is not enough to find
      // which of several evaluate calls in a loop sent the bad payload.
      if (msg.error) {
        slot.reject(new Error(`${slot.method}: ${msg.error.message}`
          + (msg.error.data ? ` (${msg.error.data})` : '')
          + ` | sent: ${JSON.stringify(slot.params).slice(0, 300)}`))
      }
      else slot.resolve(msg.result)
    })
  }

  send(method, params = {}, useSession = true) {
    const id = this.next++
    const envelope = { id, method, params }
    if (useSession && this.sessionId) envelope.sessionId = this.sessionId
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej, method, params })
      this.ws.send(JSON.stringify(envelope))
    })
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) {
      throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    }
    return r.result.value
  }
}

async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

// Everything below runs with media: print already emulated.
//
// `rendered` is the honest test for "did this reach the paper". An element the
// print sheet hid has no boxes at all; one it merely shrank still has a rect.
// Checking `display` would miss `content-visibility`, and checking
// `content-visibility` would miss `display` — a rect covers both, because a box
// is what the layout engine actually produced.
const PROBE = `(() => {
  const rendered = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0.5 && r.height > 0.5
  }
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return [Math.round(r.width), Math.round(r.height)]
  }

  // --- 1. do the collapsed <details> bodies reach the page? ---
  const details = [...document.querySelectorAll('details.ui-disclosure')]
  const disclosures = details.map((d) => {
    const body = d.querySelector('.ui-disclosure-body')
    // Count the leaf text the section is there to carry. If the body is not laid
    // out, its own rect is 0 AND none of its figures have boxes — the second half
    // matters because a zero-height grid with overflowing children would still
    // print something, and that is not what happens here.
    const items = body ? [...body.children] : []
    return {
      summary: (d.querySelector('summary')?.textContent || '').trim().slice(0, 40),
      openAttr: d.hasAttribute('open'),
      bodyBox: box(body),
      bodyRendered: rendered(body),
      childCount: items.length,
      childrenRendered: items.filter(rendered).length,
      // What the engine says about the wrapper the UA stylesheet targets.
      detailsContentVisibility: (() => {
        try { return getComputedStyle(d, '::details-content').contentVisibility || 'n/a' }
        catch { return 'unsupported' }
      })(),
      bodyDisplay: body ? getComputedStyle(body).display : null,
    }
  })

  // --- 2. is any app chrome still on the page? ---
  // The print block's own selector list, plus the classes the markup actually
  // uses. A class in the list that matches no element is reported separately
  // from an element that is present and visible: the first is a dead rule, the
  // second is ink on the paper. They usually come in pairs.
  const CHROME = [
    'ui-topbar', 'ui-utilitybar', 'ui-navbar', 'ui-progress', 'ui-breadcrumb',
    'ui-skip-link', 'ui-manual', 'ui-manual-overlay',
    'ui-footer', 'ui-footer-gov', 'ui-footer-inner', 'ui-footer-bottom',
    'ui-footer-bottom-inner', 'ui-masthead', 'ui-tricolour',
  ]
  const chrome = CHROME.map((cls) => {
    const els = [...document.querySelectorAll('.' + cls)]
    return { cls, count: els.length, visible: els.filter(rendered).length, box: box(els[0]) }
  })

  // --- 3. did the token reset take? ---
  // Note the names: --mark-petal-outer / -mid / -inner. An earlier version of
  // this probe asked for --mark-petal-a, which does not exist, and
  // getPropertyValue returns "" for an undefined custom property rather than
  // throwing — so it reported an empty string in all three cases and looked
  // like a finding-free result. Any new token added here must be spelled
  // against index.css, because a typo reads as "nothing wrong".
  const cs = getComputedStyle(document.documentElement)
  const tokens = {}
  for (const name of [
    '--mark-petal-outer', '--mark-petal-mid', '--mark-petal-inner',
    '--mark-coin-face', '--mark-edge',
    // The WHOLE colour palette, not the five the print block happened to reset
    // when this probe was written. Asking only about the covered tokens is a
    // tautology: it can only ever confirm that the reset resets what it resets.
    // --color-danger and --color-success were both uncovered and both draw on
    // the sheet (the shortfall figure, the is-bad/is-good bar), so the list has
    // to be the palette and the assertion has to be about the ones that differ.
    '--color-bg', '--color-surface', '--color-surface-soft',
    '--color-text', '--color-text-muted', '--color-border',
    '--color-btn', '--color-on-btn', '--color-primary', '--color-primary-strong',
    '--color-accent', '--color-on-accent', '--color-focus',
    '--color-danger', '--color-success',
  ]) {
    tokens[name] = cs.getPropertyValue(name).trim()
  }
  const emptyTokens = Object.entries(tokens).filter(([, v]) => !v).map(([k]) => k)

  // The same tokens again, resolved to rgb() by making the engine paint with
  // each one. getPropertyValue hands back the raw token TEXT — '#FFB4AB', or a
  // var() chain for the --mark-* set — which relLum cannot read and which
  // compares unequal across modes for reasons that are not about the colour. A
  // colour assigned to the 'color' property and read back is always
  // 'rgb(r, g, b)', which both compares and measures.
  // (No backticks in this comment: PROBE is a template literal, so one would
  // close it early. See the longer note further down.)
  const resolved = (() => {
    const probe = document.createElement('span')
    probe.style.position = 'absolute'
    probe.style.left = '-9999px'
    document.body.appendChild(probe)
    const out = {}
    for (const name of Object.keys(tokens)) {
      probe.style.color = ''
      probe.style.color = 'var(' + name + ')'
      out[name] = getComputedStyle(probe).color
    }
    probe.remove()
    return out
  })()
  // The mark is inline SVG reading those tokens through style={{fill: var(...)}},
  // so the resolved fill is the only proof the reset reached an element.
  const markPetal = (() => {
    const p = document.querySelector('.ui-brand-mark path, .ui-brand-mark ellipse, .ui-brand-mark circle')
    return p ? getComputedStyle(p).fill : null
  })()
  // The petals are filled from a gradient, so markPetal above is url("#markr0")
  // in every mode and cannot be tested as a colour. These are the paints that DO
  // resolve: the gradient's three stops carry style={{stopColor: var(--mark-
  // petal-*)}} and the coin ring a plain fill, so each is a real rgb triple and
  // each is a token the print reset has to have covered.
  const markPetalPaint = (() => {
    const out = {}
    const stops = document.querySelectorAll('.ui-brand-mark linearGradient stop, .ui-brand-mark radialGradient stop')
    stops.forEach((el, i) => { out['petal stop ' + (i + 1)] = getComputedStyle(el).stopColor })
    const ring = document.querySelector('.ui-brand-mark circle')
    if (ring) out['coin ring'] = getComputedStyle(ring).fill
    return out
  })()

  // What a reader would actually see on the sheet: the page's own background and
  // the body text drawn on it. Read off elements rather than off :root, because
  // that is where the cascade has finished resolving.
  // The surface has to be the first OPAQUE background up the ancestor chain, not
  // the nearest element's own. .ui-main computes to rgba(0,0,0,0) by design --
  // it is transparent and the page colour comes from body -- so reading it
  // directly reported "prints black" on a page that prints white, in all five
  // cases. A transparent background is an absence of paint, not black paint.
  //
  // NB: no backticks anywhere in this string. PROBE is a template literal, so a
  // backtick in a comment here closes it early; the tail then reparses as a
  // TAGGED template on whatever identifier precedes it, which silently re-entered
  // main() and sent Runtime.evaluate an expression of null.
  const paper = (() => {
    const opaqueBgOf = (start) => {
      for (let el = start; el; el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor
        const m = /rgba?\([^)]*?(?:,\s*([\d.]+))?\)$/.exec(bg)
        const alpha = m && m[1] !== undefined ? Number(m[1]) : 1
        if (alpha > 0.99) return { color: bg, from: el.className || el.tagName }
      }
      return { color: 'rgb(255, 255, 255)', from: 'canvas default' }
    }
    const main = document.querySelector('.ui-main') || document.body
    const text = document.querySelector('.ui-card') || main
    const surface = opaqueBgOf(text)
    return {
      surfaceColor: surface.color,
      surfaceFrom: String(surface.from).slice(0, 40),
      textColor: getComputedStyle(text).color,
    }
  })()

  return {
    theme: document.documentElement.getAttribute('data-theme'),
    disclosures, chrome, tokens, resolved, emptyTokens, markPetal, markPetalPaint, paper,
    breakInside: (() => {
      const c = document.querySelector('.ui-card')
      return c ? getComputedStyle(c).breakInside : null
    })(),
  }
})()`

// sRGB relative luminance from a computed `rgb(...)` / `rgba(...)` string, so a
// "does this print on white paper" assertion can be made on the resolved paint
// instead of on a token name.
function relLum(color) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(color || '')
  if (!m) return null
  const lin = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

// WCAG contrast ratio between two computed colour strings, for the tokens that
// draw TEXT on the sheet. A fill gets no ratio floor here on purpose: the amber
// warn bar is 1.7:1 on white by design and is legible as a bar because the track
// is bordered and the figure is printed beside it, so a floor on fills would
// report the design rather than a defect.
function ratio(a, b) {
  const la = relLum(a)
  const lb = relLum(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Both themes, because the print reset has to undo each one. This was four cases
// while high contrast existed, and `[data-contrast="high"][data-theme="dark"]`
// was the combination that failed — (0,2,0) beat the reset's three (0,1,0)
// selectors. The lesson survives the mode; see the PAPER check below.
const CASES = [
  { name: 'report-light', route: '/report', theme: 'light', lang: 'en' },
  { name: 'report-dark', route: '/report', theme: 'dark', lang: 'hi' },
  { name: 'analysis-light', route: '/analysis', theme: 'light', lang: 'en' },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const findings = []
  const report = []

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false,
    })

    for (const kase of CASES) {
      // Seed on the origin first, then navigate to the route, or the result page
      // renders its empty state and there is nothing to print.
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(900)
      await cdp.evaluate(`
        sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify({ v: 1, data: SEED }))});
        localStorage.setItem('sih-language', ${JSON.stringify(kase.lang)});
        localStorage.setItem('sih-theme', ${JSON.stringify(kase.theme)});
        localStorage.setItem('sih-textsize', 'md');
        localStorage.removeItem('sih-dialect');
        true;
      `)
      await cdp.send('Page.navigate', { url: APP + kase.route })
      await sleep(1400)

      // The whole point: evaluate the print stylesheet, not the screen one.
      await cdp.send('Emulation.setEmulatedMedia', { media: 'print' })
      await sleep(500)

      const m = await cdp.evaluate(PROBE)
      report.push({ ...kase, measured: m })

      console.log(`\n=== ${kase.name}  ${kase.route}  theme=${m.theme} contrast=${m.contrast}`)
      console.log(`    .ui-card break-inside: ${m.breakInside}`)

      console.log(`    <details class="ui-disclosure">  (${m.disclosures.length} on the page)`)
      for (const d of m.disclosures) {
        const state = d.bodyRendered ? 'PRINTS' : 'MISSING'
        console.log(`      [${state}] "${d.summary}"  body=${JSON.stringify(d.bodyBox)}`
          + `  children ${d.childrenRendered}/${d.childCount} rendered`
          + `  display=${d.bodyDisplay}  ::details-content content-visibility=${d.detailsContentVisibility}`)
        if (!d.bodyRendered || (d.childCount > 0 && d.childrenRendered === 0)) {
          findings.push({
            kind: 'DETAILS',
            case: kase.name,
            detail: `a collapsed <details> body does not reach the printed page ("${d.summary}"): `
              + `${d.childrenRendered} of ${d.childCount} figures laid out, `
              + `::details-content content-visibility=${d.detailsContentVisibility}`,
          })
        }
      }

      console.log('    chrome:')
      for (const c of m.chrome) {
        if (c.count === 0) {
          console.log(`      ${c.cls.padEnd(24)} no element carries this class  <-- dead rule`)
          continue
        }
        const flag = c.visible > 0 ? '  <-- PRINTS' : ''
        console.log(`      ${c.cls.padEnd(24)} ${c.count} element(s), ${c.visible} visible ${JSON.stringify(c.box)}${flag}`)
        if (c.visible > 0) {
          findings.push({
            kind: 'CHROME',
            case: kase.name,
            detail: `.${c.cls} is still laid out under media:print (${c.visible} of ${c.count} visible, `
              + `first box ${JSON.stringify(c.box)}) — app chrome on the paper`,
          })
        }
      }

      // Resolved, not raw: the --mark-* set is a var() chain in the raw text, so
      // the raw dump is the one form of this that cannot be compared or measured.
      console.log('    tokens (resolved under media:print):')
      for (const [k, v] of Object.entries(m.resolved)) {
        console.log(`      ${k.padEnd(24)} ${String(v).padEnd(22)} raw=${m.tokens[k]}`)
      }
      console.log(`    mark petal fill: ${m.markPetal}`)
      console.log(`    paper: surface=${m.paper.surfaceColor} (from ${m.paper.surfaceFrom})`
        + `  ink=${m.paper.textColor}`)

      if (m.emptyTokens.length) {
        findings.push({
          kind: 'PROBE',
          case: kase.name,
          detail: `${m.emptyTokens.join(', ')} resolved to nothing — misspelled against index.css, `
            + 'so this probe is measuring an absence rather than a value',
        })
      }

      // The check the token dump alone cannot make. `@media print` adds no
      // specificity, so each reset selector has to out-specify the screen rule it
      // undoes. The since-removed high-contrast mode is what proved it:
      // `[data-contrast="high"][data-theme="dark"]` is (0,2,0) while the reset
      // list was three (0,1,0) selectors, and dark + high contrast printed
      // white-and-yellow ink on a black page — the one sheet a user carries to a
      // bank. A compound selector is not redundant with its own parts, which is
      // as true of any pair someone adds next. Assert on the resolved paint, in
      // every mode, because that is the only form of the defect a reader sees.
      const paperL = relLum(m.paper.surfaceColor)
      const inkL = relLum(m.paper.textColor)
      if (paperL !== null && paperL < 0.6) {
        findings.push({
          kind: 'PAPER',
          case: kase.name,
          detail: `the page surface prints dark (${m.paper.surfaceColor} from ${m.paper.surfaceFrom}, `
            + `relative luminance ${paperL.toFixed(3)}) — the print token reset lost to a screen rule, `
            + 'so this sheet comes out of the printer as a black page',
        })
      }
      if (inkL !== null && inkL > 0.5) {
        findings.push({
          kind: 'PAPER',
          case: kase.name,
          detail: `body text prints light (${m.paper.textColor}, relative luminance `
            + `${inkL.toFixed(3)}) — near-invisible on white paper`,
        })
      }
      // --color-danger draws TEXT on this sheet, in two places: the money grid's
      // shortfall figure (ReportPage's MetricCard tone='bad') and .ui-bar-value
      // .is-bad in the charts. It went unreset for as long as the print block's
      // token list was curated, so from a dark laptop the figure printed #FFB4AB
      // — 1.9:1 on white, a number the reader cannot read at all, on the sheet
      // they carry to a bank. Measured against the paper this case actually
      // resolved, not against an assumed white, so a regression in the surface
      // reset does not quietly make this one pass.
      const dangerRatio = ratio(m.resolved['--color-danger'], m.paper.surfaceColor)
      if (dangerRatio !== null && dangerRatio < 4.5) {
        findings.push({
          kind: 'TOKENS',
          case: kase.name,
          detail: `--color-danger prints ${m.resolved['--color-danger']} on `
            + `${m.paper.surfaceColor} — ${dangerRatio.toFixed(2)}:1, under the 4.5:1 floor for `
            + 'text, and it draws the shortfall figure and the is-bad chart value',
        })
      }

      // The failure this guards is a logo that prints too pale to see on white —
      // what a #FFE000 petal from the removed dark-high-contrast palette did.
      //
      // It was written as a test for that literal hex, and it was INERT from the
      // day it was added. `markPetal` is the petals' computed `fill`, and the
      // petals are filled from a gradient, so it reads `url("#markr0")` in every
      // mode — no hex, nothing to match, and it reported clean on a page whose
      // logo could have been any colour at all. The generalised version had the
      // same hole for the same reason: a ratio against a url() is null.
      //
      // markPetalPaint is the fix — the gradient's own resolved stops plus the
      // coin ring, which ARE rgb triples because the stops carry
      // style={{stopColor: var(--mark-petal-*)}} and the ring a plain fill.
      //
      // The assertion is on the BEST of them, not on each. Holding every stop to
      // 3:1 fails the shipping mark: the petals are a designed gold-to-orange
      // gradient and the inner stop is #FBC02D, 1.66:1 on white. It is also wrong
      // on the merits — WCAG 1.4.11 exempts logotypes, and a gradient's pale end
      // is not what identifies the shape. What has to be true is that the mark is
      // visible AT ALL on paper, which is exactly what the #FFE000 failure broke:
      // high contrast collapsed all ten --mark-* tokens to the same yellow, so
      // every paint was 1.07:1 and the best of them was too.
      const paints = Object.entries(m.markPetalPaint || {})
      const bad = paints.filter(([, p]) => ratio(p, m.paper.surfaceColor) === null)
      if (!paints.length || bad.length) {
        findings.push({
          kind: 'PROBE',
          case: kase.name,
          detail: paints.length
            ? `the brand mark's ${bad.map(([k]) => k).join(', ')} resolved to a non-colour `
              + `(${bad.map(([, p]) => p).join(', ')}) — this check is measuring nothing, the way `
              + 'the url() version of it did'
            : 'no resolvable paint found on the brand mark, so this check measured nothing',
        })
      } else {
        const ranked = paints
          .map(([part, paint]) => ({ part, paint, r: ratio(paint, m.paper.surfaceColor) }))
          .sort((a, b) => b.r - a.r)
        const best = ranked[0]
        if (best.r < 3) {
          findings.push({
            kind: 'TOKENS',
            case: kase.name,
            detail: `every paint in the brand mark prints under 3:1 on ${m.paper.surfaceColor} — `
              + `the strongest is ${best.part} at ${best.paint}, ${best.r.toFixed(2)}:1. The logo `
              + 'on the sheet the user carries to a bank is all but invisible',
          })
        }
      }

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      writeFileSync(`${OUT}/${kase.name}.png`, Buffer.from(shot.data, 'base64'))
      await cdp.send('Emulation.setEmulatedMedia', { media: '' })
    }
    // The check that keeps the print block's token list HONEST rather than merely
    // present. Everything above asks "is this one token right"; this asks "is the
    // list complete", which is the form every failure of this block has actually
    // taken — the --mark-* set, then the six palette tokens after it, each time
    // "the ones nothing on /report drew with", right up until something did.
    //
    // The invariant is exact and cannot produce a false positive: under
    // media:print the sheet must not depend on the laptop's theme at all, so
    // every token must resolve to the same paint in every mode.
    // A token the reset forgot differs from the light case by construction, and a
    // token it covers cannot differ. No thresholds, no judgement.
    const baseline = report.find((r) => r.name === 'report-light')
    if (!baseline) {
      findings.push({
        kind: 'PROBE',
        case: '(cross-mode)',
        detail: 'no report-light case ran, so there is nothing to compare the other modes '
          + 'against — the token-invariance check did not execute',
      })
    } else {
      for (const r of report) {
        if (r.name === baseline.name) continue
        for (const [name, light] of Object.entries(baseline.measured.resolved)) {
          const here = r.measured.resolved[name]
          if (here === light) continue
          findings.push({
            kind: 'TOKENS',
            case: r.name,
            detail: `${name} resolves to ${here} under media:print but ${light} in report-light `
              + '— the print token reset does not cover it, so what comes out of the printer '
              + "depends on the theme the laptop happened to be in",
          })
        }
      }
    }
  } finally {
    edge.kill()
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify({ findings, report }, null, 2))

  console.log(`\n${'='.repeat(70)}`)
  if (!findings.length) {
    console.log(`0 findings across ${CASES.length} print renders — everything the print sheet`)
    console.log('claims to hide is hidden, and every disclosure body reaches the page.')
  } else {
    console.log(`${findings.length} finding(s):`)
    for (const f of findings) console.log(`  [${f.kind}] ${f.case}: ${f.detail}`)
  }
  console.log(`report.json and screenshots in ${OUT}`)
  process.exit(findings.length ? 1 : 0)
}

main()

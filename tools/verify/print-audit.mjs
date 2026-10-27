// What actually reaches the paper when someone prints /report?
//
// This is the one output nothing else in screenshots/verify/ can see. drive.mjs,
// mobile-audit and lang-layout all measure the SCREEN; the @media print block is
// a different stylesheet that no amount of screen measurement exercises. It has
// been "verified" only by reading index.css, and reading a print block is exactly
// as reliable as reading any other CSS — which is to say it tells you what the
// author intended, not what the engine does.
//
// Two of the first three checks here found a real defect the first time they
// ran, and both are the same shape: a rule that looks correct and matches
// nothing.
//
//   1. DETAILS  — the print block hides `.ui-disclosure > summary` and sets
//      `.ui-disclosure-body { display: grid !important }`, intending to force a
//      collapsed <details> open so the detailed figures reach the PDF. But a
//      closed <details> is not hidden by a `display` rule on its children. In
//      Chromium the UA stylesheet puts `content-visibility: hidden` on the
//      `::details-content` pseudo-element that wraps them, and no `display`
//      declaration on a descendant can defeat that — the descendant is not laid
//      painted at all. `!important` does not help, because it is not fighting a
//      display rule. So the figures silently vanish from the printed page: the
//      user carries a sheet to a bank with a section heading and no numbers.
//
//      The defect was diagnosed and never fixed, because the check could not see
//      it: it tested for a rect, and a content-visibility: hidden subtree still
//      reports one (see `painted` below). Made paint-aware on 26 Sept 2026, it
//      failed all six cases, including the retention text of the /privacy notice.
//      The fix is `.ui-disclosure::details-content { content-visibility: visible }`
//      in the print block, which reaches the pseudo-element the UA rule sits on.
//      Printed to PDF before the fix, /privacy's text operators went from 142 to
//      149 when the disclosure was opened by hand, so the missing text was real
//      and not an artefact of emulated media.
//
//   2. CHROME   — the print block hides `.ui-footer`, and no element in the app
//      carries that class. The footer is `.ui-footer-gov` + `.ui-footer-bottom`
//      (App.jsx GovFooter). `.ui-footer` is a live rule in index.css that styles
//      nothing, so the selector list reads complete while the government footer,
//      "Where to get help" column (common.helpTitle) and all, prints onto the
//      page.
//
//      This check's own list had the same hole until 1 Oct 2026. A CHROME class
//      that matched nothing was logged as a "dead rule" and passed, so an element
//      renamed in the markup printed under its new class while the old one
//      matched nothing. Now a CHROME class that no case renders is a PROBE fault
//      (unless CHROME_OFF_ROUTE gives the reason), and so is a class the print
//      block hides that CHROME does not list.
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
//   4. BREAK    — the print block gives every card-like block
//      `break-inside: avoid`, so a heading never lands at the foot of one page
//      and its sentences at the top of the next. Nothing checked it: the probe
//      logged the first .ui-card's value and never failed. Two parts now. Every
//      rendered element carrying a class in that list must compute `avoid`,
//      which catches a later rule or utility that overrides it. And each case
//      names the blocks that must be on its sheet (the privacy notice cards and
//      the retention disclosure on /privacy; the zero-income note, the consent
//      block and the short notice on /finance). Each one must be laid out and
//      compute `avoid` itself, whatever its class, so a new block that is not
//      card-like fails here instead of splitting quietly. A named block that is
//      in the DOM with no box under print is a HIDDEN finding: the sheet goes
//      out without it. One the DOM does not hold at all is a BLOCK fault, exit 2,
//      because then the break check measured nothing.
//
// The technique is `Emulation.setEmulatedMedia({media: 'print'})`, which swaps
// the engine's media evaluation without a print dialog, and then ordinary
// getBoundingClientRect / getComputedStyle. An element the print stylesheet has
// hidden measures 0x0; one it failed to hide measures its real box.
//
// Needs the Vite dev server up. Run from the repo root:
//   node tools/verify/print-audit.mjs
// Exit 0: nothing found. 1: a finding (DETAILS, CHROME, TOKENS, PAPER, BREAK,
// HIDDEN).
// 2: the run could not measure. report.json carries the same code as `exit`,
// and lists why under `faults`:
//   NOT-RENDERED  a case whose #main never held over 40 characters of text,
//                 polled for about 9 s, or whose page was Edge's own error page
//                 or an answer other than a 2xx
//   UNSEEDED      a page that does not hold its seed: a result route that
//                 loaded its empty state, or any case whose <html> has a
//                 data-theme or lang other than the case's (a renamed key, or
//                 the mount effects on / writing the last case's values back)
//   PROBE         a probe that says it measured nothing, or its own stale copy:
//                 a token that resolves to nothing, a brand mark with no
//                 resolvable paint, a page surface, body text or --color-danger
//                 colour relLum cannot read (a CSS Color 4 syntax such as
//                 oklch()), BREAK_AVOID out of step with index.css, a print-block
//                 hide list it cannot find or that names a class CHROME does not
//                 list, a CHROME class no case renders unless CHROME_OFF_ROUTE
//                 gives the reason, a CHROME_OFF_ROUTE entry some case does
//                 render, or no report-light case to compare the other modes
//                 against
//   BLOCK         a block the case requires matches nothing in the DOM: a stale
//                 selector, or a state the seed did not produce
// Anything that ends the run before its verdict also exits 2, and writes no
// report: the dev server down, the wrong working directory, a seed version
// AppContext no longer reads, a navigation that fails (the server gone
// mid-run), Edge's DevTools socket closing, or a crash.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9359
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/print')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-print')

// 0 means the run measured and found nothing, 1 a finding, and 2 that the run
// could not measure. Node's own exit on an uncaught error is 1, which reads as a
// finding, so anything thrown or rejected that nothing catches exits 2 instead.
// main() below has no catch of its own, so this is also its crash path.
process.on('uncaughtException', (err) => {
  console.error(err)
  crashExit()
})
// A crash exits 2 through this rather than process.exit(2) at once. For up to
// about 100 ms after fetch() reads a response, V8 can still be recompiling
// undici's WASM HTTP parser on a worker thread, and exiting in that window kills
// node with 0xC0000409 (Git Bash shows 127): neither 0, 1 nor 2. The wait
// blocks this thread, so nothing else of the run happens meanwhile.
// tools/README.md, Exit codes, has the measurements.
function crashExit() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  process.exit(2)
}
// A run that ends without reaching its verdict exits 2; the verdict at the end
// of main() overrides this. Until 30 Sept 2026 a CDP socket that closed under a
// pending send left that send unsettled, the event loop drained, and node
// exited 0 with no report.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/print-audit.mjs'))) {
  console.error(`print-audit: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/print-audit.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's
// goes once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, 'report.json'), { force: true })

// A server that is down used to surface as a crash inside the page (Edge's own
// error page refuses storage access), which exited 1 and read as a finding.
// It returns false with exitCode 2 set, and main() returns before Edge starts,
// so node exits on its own: process.exit() this soon after a fetch can abort
// it (see crashExit).
async function requireServer(url, start) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    await res.body?.cancel()
    if (res.ok) return true
    console.error(`print-audit: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`print-audit: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Same seed the other drivers use, so /report is as full as it ever gets.
const SEED = {
  profile: { name: 'Lakshmi Devi', language: 'Tamil', dialect: '' },
  business: {
    businessName: 'Lakshmi Tailors', category: 'tailoring', categoryOther: '',
    initialInvestment: '200000', monthlyRevenue: '30000',
    monthlyOperatingExpenses: '18000', existingDebt: 0,
  },
  location: {
    village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
    locationType: 'rural', marketType: ['village', 'weekly'], customers: 'Local families',
  },
  finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000' },
  result: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')),
}

// AppContext silently discards a payload whose v is not in its
// READABLE_VERSIONS, and /report and /analysis then print their empty states.
// Every field SEED and ZERO_INCOME_SEED carry is a version 4 field, so both say
// 4, and this refuses to start once AppContext stops reading 4.
const SEED_VERSION = 4
{
  const file = 'frontend/src/context/AppContext.jsx'
  const m = readFileSync(resolve(file), 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `print-audit: ${file} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite SEED in the current shape and raise SEED_VERSION.`
      : `print-audit: READABLE_VERSIONS not found in ${file}; update the parse in print-audit.mjs.`)
    process.exit(2)
  }
}

// A result route has to show the seeded result. The app writes its state back
// to sessionStorage once it has mounted, so a seed it discarded reads back with
// no result. Until the app mounts, the raw seed reads as seeded, which is why
// this is read only once the route has rendered (waitForRender).
const RESULT_ROUTES = ['/analysis', '/schemes', '/advisory', '/report']
const SEEDED = `(() => {
  try { return !!JSON.parse(sessionStorage.getItem('sih-application')).data.result } catch { return false }
})()`
// The theme and language the app applied, on every route: ThemeToggle sets
// data-theme on <html> and LanguageContext sets its lang, each from its
// localStorage key. index.html has lang="en" and no data-theme until the app
// mounts, so this too is read only once the route has rendered.
const SEEN = `({ theme: document.documentElement.getAttribute('data-theme'), lang: document.documentElement.lang })`

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.sessionId = null
    this.closed = false
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('CDP socket error')))
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed')))
    })
    // Edge gone (crashed, or killed under the run) closes the socket. No reply
    // is coming for anything still waiting, and a pending promise does not keep
    // node alive, so each one is rejected here rather than left to drain away.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
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
    // undici's send() on a socket that is not open drops the frame without
    // throwing, so the reply this would wait for could never come.
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(method + ': CDP socket closed'))
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
      // Bounded: a listener that accepts and never answers would otherwise hold
      // this for undici's five-minute header timeout.
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

// Page.navigate answers with errorText when the load itself failed, as it does
// with the connection refused once the dev server has gone. That page was never
// the app, so it throws: a fault that ends the run with exit 2, never a finding.
async function navigate(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`print-audit: ${url} did not load (${errorText}). Is the dev server still up?`)
}

// Polled as mobile-audit's is: the route has rendered once #main holds more
// than 40 characters of text, and it gets about 9 s. A probe that fails on a
// live socket (the document mid-swap) is retried; one that fails because the
// socket closed is rethrown, never read as a page still loading.
async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`).catch((err) => {
      if (cdp.closed) throw err
      return 0
    })
    if (len > 40) return true
    await sleep(120)
  }
  return false
}

// Vite answers every route with index.html and a 200, so Edge's own error page,
// or an answer other than a 2xx, is not the app whatever #main holds. A copy
// Edge revalidated (a 304 on the wire) still reads 200 here, as measured on 30
// Sept 2026, and a responseStatus of 0 means Edge recorded none. Returns why the
// page is not the app, or '' when neither says so, including when the probe
// failed on a live socket.
async function notTheApp(cdp) {
  const expression = `({ protocol: location.protocol, status: performance.getEntriesByType('navigation')[0]?.responseStatus || 0 })`
  const page = await cdp.evaluate(expression).catch((err) => {
    if (cdp.closed) throw err
    return null
  })
  if (page?.protocol === 'chrome-error:') return "it is Edge's own error page"
  if (page?.status && (page.status < 200 || page.status > 299)) return `the server answered HTTP ${page.status}`
  return ''
}

// Check 2's list: the print block's own hide list, plus the footer's two -inner
// classes. main() holds it to the stylesheet and to the markup. Every class the
// print block hides must be in it (printHideList), and every class in it must
// be carried by an element on at least one case, or on none for a reason in
// CHROME_OFF_ROUTE. A class missing from one page is not judged there, since it
// can be absent by design (.ui-progress on /privacy). A class that no case
// renders is a rename or a stale entry, and until 1 Oct 2026 it was only
// logged, as a "dead rule", while the element it named printed under its new
// class. .ui-topbar and .ui-footer, the pair the print block dropped for the
// same reason, went from here then: no markup carries either.
const CHROME = [
  'ui-utilitybar', 'ui-navbar', 'ui-progress', 'ui-breadcrumb',
  'ui-skip-link', 'ui-manual', 'ui-manual-overlay',
  'ui-footer-gov', 'ui-footer-inner', 'ui-footer-bottom',
  'ui-footer-bottom-inner', 'ui-masthead', 'ui-tricolour',
]
// Chrome the print block hides that no audited route renders, each with its
// reason. An entry that some case does render is a PROBE fault, because it
// would forgive a later rename of that class.
const CHROME_OFF_ROUTE = {
  'ui-manual': 'the instruction manual strip, rendered on / only',
  'ui-manual-overlay': 'the manual dialog, rendered on / only and only while it is open',
}

// Everything below runs with media: print already emulated.
//
// `rendered` tests for a box: an element the print sheet hid with `display`
// has none, and one it merely shrank still has a rect. It is not enough for
// "did this reach the paper". Content under `content-visibility: hidden` is not
// painted, yet getBoundingClientRect() lays it out on demand and returns its
// full rect. So DETAILS passed for as long as it existed while every collapsed
// disclosure body stayed off the paper: measured 26 Sept 2026, the closed
// /privacy disclosure's <details> was 2px tall under media:print while its body
// reported 766x253. `painted` adds checkVisibility(), which is false inside a
// content-visibility: hidden subtree as well as under display: none.
const PROBE = `(() => {
  const rendered = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0.5 && r.height > 0.5
  }
  const painted = (el) => rendered(el) && (typeof el.checkVisibility !== 'function' || el.checkVisibility())
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return [Math.round(r.width), Math.round(r.height)]
  }

  // --- 1. do the collapsed <details> bodies reach the page? ---
  const details = [...document.querySelectorAll('details.ui-disclosure')]
  const disclosures = details.map((d) => {
    const body = d.querySelector('.ui-disclosure-body')
    // Count the leaf text the section is there to carry. If the body is not
    // painted, neither is any of its figures. The second half matters because a
    // zero-height grid with overflowing children would still print something.
    // detailsBox is the <details> itself: it is only as tall as what it paints,
    // so a body that does not print leaves it at its border.
    const items = body ? [...body.children] : []
    return {
      summary: (d.querySelector('summary')?.textContent || '').trim().slice(0, 40),
      openAttr: d.hasAttribute('open'),
      bodyBox: box(body),
      detailsBox: box(d),
      bodyRendered: painted(body),
      childCount: items.length,
      childrenRendered: items.filter(painted).length,
      // What the engine says about the wrapper the UA stylesheet targets.
      detailsContentVisibility: (() => {
        try { return getComputedStyle(d, '::details-content').contentVisibility || 'n/a' }
        catch { return 'unsupported' }
      })(),
      bodyDisplay: body ? getComputedStyle(body).display : null,
    }
  })

  // --- 2. is any app chrome still on the page? ---
  // CHROME is the node-side list defined above PROBE, where main() checks it
  // against the print block and across the cases. Here a class that matches no
  // element is only counted; an element that is present and visible is ink on
  // the paper.
  const CHROME = ${JSON.stringify(CHROME)}
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
    // The wordmark and the book icon, added 11 Sept 2026. Both are fixed-asset
    // colour sets that differ per theme, and both were uncovered by the print
    // reset AND unasked-for here — so the invariance check was blind to them in
    // exactly the way it had already been blind to --color-danger. Neither one
    // draws on the sheet today (.ui-masthead and .ui-manual are display:none in
    // print), which is precisely the condition that hid the last two omissions.
    // Asking about them now means a future /report that shows the wordmark
    // cannot print theme-dependent ink without this failing first.
    '--wordmark-arth', '--wordmark-niti', '--wordmark-swoosh', '--wordmark-dot',
    '--book-cover', '--book-spine', '--book-band', '--book-seal',
    '--book-seal-rim', '--book-pages', '--book-pageline', '--book-sprout',
  ]) {
    tokens[name] = cs.getPropertyValue(name).trim()
  }
  const emptyTokens = Object.entries(tokens).filter(([, v]) => !v).map(([k]) => k)

  // The same tokens again, resolved by making the engine paint with each one.
  // getPropertyValue hands back the raw token TEXT — '#FFB4AB', or a var()
  // chain for the --mark-* set — which relLum cannot read and which compares
  // unequal across modes for reasons that are not about the colour. A colour
  // assigned to the 'color' property and read back is 'rgb(r, g, b)', or
  // 'rgba(r, g, b, a)' when it has alpha (--mark-edge), if it was written as a
  // hex, a name, rgb() or hsl(), and that both compares and measures. One
  // written in a CSS Color 4 syntax does not: oklch() and lab() read back as
  // themselves, and color-mix() in the space it mixes in, so a mix in srgb is
  // color(srgb 0.5 0 0.5), as read back in Edge on 1 Oct 2026. relLum reads
  // none of them, and main() records that as a PROBE fault for each colour it
  // measures.
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
        // Alpha comes only from a four-part rgba(). rgb() is opaque, and so is a
        // syntax this does not parse, which main() then faults on as a colour
        // relLum cannot read, rather than walk past it. The backslashes are
        // doubled because this is template-literal source and a lone one is
        // dropped before the page sees it: until 1 Oct 2026 this regex matched
        // no colour at all, every alpha read 1, and the walk never left its
        // first element.
        const m = /^rgba\\((?:[^,]+,){3}\\s*([\\d.]+)\\)$/.exec(bg)
        const alpha = m ? Number(m[1]) : 1
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
//
// /privacy is the notice itself, the page someone is most likely to print and
// keep, so it runs in both themes. /finance runs with a household income of
// exactly 0, the only state that renders the zero-income note.
const PRIVACY_BLOCKS = [
  { name: 'privacy notice cards', selector: 'main section.ui-card' },
  { name: 'retention disclosure', selector: 'main details.ui-disclosure' },
]
const FINANCE_BLOCKS = [
  { name: 'zero-income note', selector: '#household-zero-note' },
  { name: 'consent block', selector: '.ui-formsection:has(#consent-notice)' },
  { name: 'short notice', selector: '.ui-formsection:has(#consent-notice) .ui-notice:has(a[href="/privacy"])' },
]
const ZERO_INCOME_SEED = { ...SEED, finance: { ...SEED.finance, householdIncome: '0' } }
const CASES = [
  { name: 'report-light', route: '/report', theme: 'light', lang: 'en' },
  { name: 'report-dark', route: '/report', theme: 'dark', lang: 'hi' },
  { name: 'analysis-light', route: '/analysis', theme: 'light', lang: 'en' },
  { name: 'privacy-light', route: '/privacy', theme: 'light', lang: 'en', required: PRIVACY_BLOCKS },
  { name: 'privacy-dark', route: '/privacy', theme: 'dark', lang: 'hi', required: PRIVACY_BLOCKS },
  { name: 'finance-light', route: '/finance', theme: 'light', lang: 'en', seed: ZERO_INCOME_SEED, required: FINANCE_BLOCKS },
]

// The print block's own `break-inside: avoid` list, copied from index.css. A
// class added there has to be added here, or the sweep stops at the old list.
const BREAK_AVOID = [
  '.ui-card', '.ui-card-soft', '.ui-feature-card', '.ui-disclosure',
  '.ui-formsection', '.ui-notice', '.ui-bar-row', '.ui-unit-chart',
]
// The copy is compared with the stylesheet on every run, so it cannot drift:
// the selector list directly in front of `break-inside: avoid` inside
// `@media print`. null when the rule cannot be found, which is a PROBE fault
// (exit 2): the sweep would be checking a list the stylesheet no longer has.
function printAvoidList() {
  const css = readFileSync('frontend/src/index.css', 'utf8')
  const at = css.indexOf('@media print {')
  if (at < 0) return null
  const m = /((?:\s*\.[A-Za-z0-9_-]+\s*,)*\s*\.[A-Za-z0-9_-]+)\s*\{\s*break-inside:\s*avoid;/.exec(css.slice(at))
  return m ? m[1].split(',').map((s) => s.trim()) : null
}

// The print block's own hide list: the selectors of every rule inside
// `@media print` that sets `display: none !important`. main() requires every
// one of them to be a CHROME class, or a class added there is hidden by a rule
// this never measures. Every rule, not the first: a second one, added later for
// a new piece of chrome, would otherwise hide a class nothing here looks at.
// Comments go first, because the one above the first rule names two classes the
// list no longer has, and the block is cut at its own closing brace, so a rule
// after it cannot stand in. null when there is no such rule, which is a PROBE
// fault (exit 2) like the one above.
function printHideList() {
  const css = readFileSync('frontend/src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const at = css.indexOf('@media print {')
  if (at < 0) return null
  let end = css.indexOf('{', at)
  for (let depth = 0; end < css.length; end++) {
    if (css[end] === '{') depth++
    else if (css[end] === '}' && --depth === 0) break
  }
  const block = css.slice(css.indexOf('{', at) + 1, end)
  const rules = [...block.matchAll(/\{[^{}]*display:\s*none\s*!important[^{}]*\}/g)]
  if (!rules.length) return null
  return rules.flatMap((rule) => {
    const head = block.slice(0, rule.index)
    return head.slice(Math.max(head.lastIndexOf('{'), head.lastIndexOf('}')) + 1)
      .split(',').map((s) => s.trim())
  })
}

// Check 4. Runs under media:print, after PROBE. No backticks in here: this is a
// template literal, and one would close it early.
const breakProbe = (required) => `(() => {
  const rendered = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0.5 && r.height > 0.5
  }
  const describe = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''
    const id = el.id ? '#' + el.id : ''
    const text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
    return el.tagName.toLowerCase() + id + cls + (text ? ' "' + text + '"' : '')
  }
  const sweep = []
  const seen = new Set()
  for (const sel of ${JSON.stringify(BREAK_AVOID)}) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el) || !rendered(el)) continue
      seen.add(el)
      sweep.push({ sel, el: describe(el), breakInside: getComputedStyle(el).breakInside })
    }
  }
  const blocks = ${JSON.stringify(required || [])}.map(({ name, selector }) => {
    const els = [...document.querySelectorAll(selector)]
    const shown = els.filter(rendered)
    return {
      name, selector, count: els.length, rendered: shown.length,
      values: [...new Set(shown.map((el) => getComputedStyle(el).breakInside))],
      notAvoid: shown.filter((el) => getComputedStyle(el).breakInside !== 'avoid').map(describe),
    }
  })
  return { sweep, blocks }
})()`

async function main() {
  if (!(await requireServer(APP + '/', 'Start the Vite dev server first: npm run dev in ./frontend.'))) return
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
  // What the run could not measure, in the same shape as a finding. Any one of
  // them makes the exit 2, whatever was found.
  const faults = []
  const report = []

  const cssAvoid = printAvoidList()
  if (!cssAvoid || cssAvoid.join(',') !== BREAK_AVOID.join(',')) {
    faults.push({
      kind: 'PROBE',
      case: '(stylesheet)',
      detail: cssAvoid
        ? `the print block's break-inside: avoid list is ${cssAvoid.join(', ')}, and BREAK_AVOID here is `
          + `${BREAK_AVOID.join(', ')}. Copy the stylesheet's list, or the sweep checks the wrong classes`
        : 'no break-inside: avoid rule found inside @media print in frontend/src/index.css',
    })
  }
  // Check 2's list against the print block's. Every class that rule hides has
  // to be one CHROME asks for, or it could print again, or be renamed, and
  // nothing here would look.
  const cssHide = printHideList()
  const unlisted = cssHide ? cssHide.filter((sel) => !CHROME.some((cls) => sel === '.' + cls)) : []
  if (!cssHide || unlisted.length) {
    faults.push({
      kind: 'PROBE',
      case: '(stylesheet)',
      detail: cssHide
        ? `the print block hides ${unlisted.join(', ')}, which CHROME here does not list, so nothing `
          + 'checks that it stays off the paper. Add it to CHROME'
        : 'no display: none !important rule found inside @media print in frontend/src/index.css, '
          + 'so check 2 cannot be held to the list the stylesheet hides',
    })
  }

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
      // renders its empty state and there is nothing to print. The seed goes in
      // only once / has rendered and settled: its mount effects write the theme
      // and language they started with, the last case's, back to localStorage,
      // and a seed written before them is overwritten. What this cannot rule
      // out, the SEEN check below catches.
      await navigate(cdp, APP + '/')
      await waitForRender(cdp)
      await sleep(900)
      await cdp.evaluate(`
        sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify({ v: SEED_VERSION, data: kase.seed || SEED }))});
        localStorage.setItem('sih-language', ${JSON.stringify(kase.lang)});
        localStorage.setItem('sih-theme', ${JSON.stringify(kase.theme)});
        localStorage.setItem('sih-textsize', 'md');
        localStorage.removeItem('sih-dialect');
        true;
      `)
      await navigate(cdp, APP + kase.route)

      // Measured only once the app has rendered the route, on a page that is the
      // app's. The fixed 1400 ms that stood here alone is now the settle after
      // that: on its own it took the page on trust, and an app that never
      // mounted passed SEEDED on its raw seed and was measured as a print sheet.
      const drew = await waitForRender(cdp)
      const why = (await notTheApp(cdp)) || (drew ? '' : '#main never held more than 40 characters of text in about 9 s')
      if (why) {
        faults.push({ kind: 'NOT-RENDERED', case: kase.name, detail: `${kase.route} did not render the app: ${why}. Nothing on it was measured` })
        console.log(`\n=== ${kase.name}  ${kase.route}  ! NOT-RENDERED: ${why}`)
        continue
      }
      await sleep(1400)

      if (RESULT_ROUTES.includes(kase.route) && !(await cdp.evaluate(SEEDED))) {
        faults.push({ kind: 'UNSEEDED', case: kase.name, detail: `no result in the app's state, so ${kase.route} is its empty state and was not measured` })
        console.log(`\n=== ${kase.name}  ${kase.route}  ! UNSEEDED: the seed was not read`)
        continue
      }
      // On every case, the theme and language it is for, as the app applied
      // them. A seed the app did not take still measures clean: on 1 Oct 2026,
      // with both keys renamed, the run exited 0 with both dark cases printed
      // from the light theme and the four English cases in Hindi. The dark
      // cases exist to catch a dark token that survives into print, and that
      // was never looked at.
      const seen = await cdp.evaluate(SEEN)
      if (seen.theme !== kase.theme || seen.lang !== kase.lang) {
        const has = `theme ${seen.theme || '(none)'} and lang ${seen.lang || '(none)'}`
        faults.push({
          kind: 'UNSEEDED',
          case: kase.name,
          detail: `the page has ${has}, not theme ${kase.theme} and lang ${kase.lang}, so the app did not `
            + `take the seed and ${kase.route} was not measured`,
        })
        console.log(`\n=== ${kase.name}  ${kase.route}  ! UNSEEDED: ${has}, not ${kase.theme} and ${kase.lang}`)
        continue
      }

      // The whole point: evaluate the print stylesheet, not the screen one.
      await cdp.send('Emulation.setEmulatedMedia', { media: 'print' })
      await sleep(500)

      const m = await cdp.evaluate(PROBE)
      m.breaks = await cdp.evaluate(breakProbe(kase.required))
      report.push({ ...kase, measured: m })

      console.log(`\n=== ${kase.name}  ${kase.route}  theme=${m.theme}`)
      console.log(`    .ui-card break-inside: ${m.breakInside}`)

      // --- 4. break-inside: avoid ---
      const splits = m.breaks.sweep.filter((b) => b.breakInside !== 'avoid')
      console.log(`    break-inside: ${m.breaks.sweep.length} card-like block(s) on the sheet, ${splits.length} not avoid`)
      for (const b of splits) {
        findings.push({
          kind: 'BREAK',
          case: kase.name,
          detail: `${b.el} matches ${b.sel} but computes break-inside: ${b.breakInside} under media:print, `
            + 'so it can split across a page break',
        })
      }
      for (const b of m.breaks.blocks) {
        console.log(`      ${b.name.padEnd(22)} ${b.rendered}/${b.count} laid out, break-inside ${JSON.stringify(b.values)}  (${b.selector})`)
        if (!b.count) {
          faults.push({
            kind: 'BLOCK',
            case: kase.name,
            detail: `the ${b.name} (${b.selector}) matches nothing in the DOM, so its break-inside was not measured`,
          })
        } else if (!b.rendered) {
          findings.push({
            kind: 'HIDDEN',
            case: kase.name,
            detail: `the ${b.name} (${b.selector}) is in the DOM ${b.count} time(s) and has no box under media:print, `
              + 'so the printed sheet goes out without it',
          })
        }
        for (const el of b.notAvoid) {
          findings.push({
            kind: 'BREAK',
            case: kase.name,
            detail: `the ${b.name} ${el} computes break-inside other than avoid under media:print, `
              + 'so it can split across a page break',
          })
        }
      }

      console.log(`    <details class="ui-disclosure">  (${m.disclosures.length} on the page)`)
      for (const d of m.disclosures) {
        const state = d.bodyRendered ? 'PRINTS' : 'MISSING'
        console.log(`      [${state}] "${d.summary}"  body=${JSON.stringify(d.bodyBox)}  details=${JSON.stringify(d.detailsBox)}`
          + `  children ${d.childrenRendered}/${d.childCount} painted`
          + `  display=${d.bodyDisplay}  ::details-content content-visibility=${d.detailsContentVisibility}`)
        if (!d.bodyRendered || (d.childCount > 0 && d.childrenRendered === 0)) {
          findings.push({
            kind: 'DETAILS',
            case: kase.name,
            detail: `a collapsed <details> body does not reach the printed page ("${d.summary}"): `
              + `${d.childrenRendered} of ${d.childCount} figures painted, `
              + `::details-content content-visibility=${d.detailsContentVisibility}`,
          })
        }
      }

      console.log('    chrome:')
      for (const c of m.chrome) {
        // Not judged on one page, where a class can be absent by design
        // (.ui-progress on /privacy). The counts are added up across the cases
        // after the loop, where a class that no case renders is a PROBE fault.
        if (c.count === 0) {
          console.log(`      ${c.cls.padEnd(24)} none on this page`)
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
        faults.push({
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
      // A colour relLum cannot read is not a pass. It parses rgb() and rgba()
      // only, and a colour written in a CSS Color 4 syntax reads back in that
      // syntax, so the paper, ink and --color-danger checks below each went
      // quiet on one. On 1 Oct 2026, with the body text and --color-danger
      // restated under print as oklch() colours at 1.12:1 and 1.57:1 on white,
      // the run exited 0. An unreadable surface used to show up only as a
      // brand-mark fault, which named the wrong check; each one is named here.
      const dangerL = relLum(m.resolved['--color-danger'])
      for (const [what, colour, lum] of [
        ['the page surface', m.paper.surfaceColor, paperL],
        ['the body text', m.paper.textColor, inkL],
        ['--color-danger', m.resolved['--color-danger'], dangerL],
      ]) {
        if (lum === null) {
          faults.push({
            kind: 'PROBE',
            case: kase.name,
            detail: `${what} resolved to ${colour}, which relLum cannot read, so its contrast on the `
              + 'sheet was not measured',
          })
        }
      }
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
      //
      // Each paint is judged readable on its own, not through ratio(), which is
      // null whenever the surface is. An unreadable surface is its own fault
      // above: it used to come out here as the mark's, which named the wrong
      // check. Nor is the mark ranked on such a surface, where every ratio is
      // null.
      const paints = Object.entries(m.markPetalPaint || {})
      const bad = paints.filter(([, p]) => relLum(p) === null)
      if (!paints.length || bad.length) {
        faults.push({
          kind: 'PROBE',
          case: kase.name,
          detail: paints.length
            ? `the brand mark's ${bad.map(([k]) => k).join(', ')} resolved to a non-colour `
              + `(${bad.map(([, p]) => p).join(', ')}) — this check is measuring nothing, the way `
              + 'the url() version of it did'
            : 'no resolvable paint found on the brand mark, so this check measured nothing',
        })
      } else if (paperL !== null) {
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
      faults.push({
        kind: 'PROBE',
        case: '(cross-mode)',
        detail: 'report-light was not measured, so there is nothing to compare the other modes '
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

    // Check 2's list across the cases. A class absent from one page can be
    // absent by design, but one that no case renders is a rename or a stale
    // entry: the element it named prints under its new class, and nothing here
    // asks for that one. Judged only when every case was measured, since the
    // one that was not could be the one that renders it, and its own fault
    // already makes the run a 2.
    if (report.length === CASES.length) {
      console.log('\nchrome across all cases:')
      for (const cls of CHROME) {
        const total = report.reduce((n, r) => n + (r.measured.chrome.find((c) => c.cls === cls)?.count || 0), 0)
        const why = CHROME_OFF_ROUTE[cls]
        console.log(`  ${cls.padEnd(24)} ${total} element(s)${why ? `, off route: ${why}` : ''}`)
        if (total === 0 && !why) {
          faults.push({
            kind: 'PROBE',
            case: '(all cases)',
            detail: `.${cls} matches no element on any case: renamed in the markup, or a stale CHROME `
              + 'entry. Either way what it named is not checked, and under a new class it could print. '
              + 'Find the class the markup uses now, and fix CHROME and the print block to match',
          })
        } else if (total > 0 && why) {
          faults.push({
            kind: 'PROBE',
            case: '(all cases)',
            detail: `.${cls} is in CHROME_OFF_ROUTE (${why}), but ${total} element(s) carry it on the `
              + 'audited routes. Drop the entry, or it would forgive a later rename of that class',
          })
        }
      }
    } else {
      console.log(`\nchrome across all cases: not judged, ${report.length} of ${CASES.length} cases measured`)
    }
  } finally {
    edge.kill()
  }

  // A fault is not a print finding: the run did not measure what it names, so
  // it exits 2, not 1, whatever else it found. The findings beside it cover only
  // what it did measure.
  const exit = faults.length ? 2 : findings.length ? 1 : 0
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit, faults, findings, report }, null, 2))

  console.log(`\n${'='.repeat(70)}`)
  if (faults.length) {
    console.log(`${faults.length} instrument fault(s); the run did not measure what it names:`)
    for (const f of faults) console.log(`  [${f.kind}] ${f.case}: ${f.detail}`)
  }
  if (findings.length) {
    console.log(`${findings.length} finding(s):`)
    for (const f of findings) console.log(`  [${f.kind}] ${f.case}: ${f.detail}`)
  } else if (faults.length) {
    console.log('0 findings in what it did measure.')
  } else {
    console.log(`0 findings across ${CASES.length} print renders — everything the print sheet`)
    console.log('claims to hide is hidden, and every disclosure body reaches the page.')
  }
  console.log(`report.json and screenshots in ${OUT}`)
  process.exit(exit)
}

main()

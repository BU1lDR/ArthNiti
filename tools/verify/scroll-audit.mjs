// Does every route open at the TOP of the page?
//
// This is a single-page app, so the browser never resets the scroll offset on its
// own: react-router swaps the page component and the window stays exactly where it
// was. Every form step's Continue button sits at the bottom of a tall page, so
// tapping it landed the next step already scrolled past its own heading — reported
// as "some of the pages open from the middle of the webpage".
//
// None of the other verifiers can see this, and the reason is structural rather
// than an oversight: all of them navigate by URL and measure a page they loaded
// COLD, i.e. at offset 0 by definition. drive.mjs, mobile-audit.mjs,
// lang-layout.mjs, field-align.mjs, hero-geom.mjs and print-audit.mjs never
// perform an in-app navigation at all, so the one code path where the offset
// carries over is the one path none of them exercise. Their reports are
// byte-identical whether or not scroll is reset.
//
// Run the Vite dev server and the backend first (the /finance submit sends a
// real request), then: node tools/verify/scroll-audit.mjs
//   --broken   removes the fix at runtime and MUST exit 1
// Exit 0 means every hop, the back button and the anchor measured clean. 1 is
// reserved for findings (TOP, BACK, NO-NAV, ANCHOR), because under --broken it
// is the expected result. Exit 2 means the run proved nothing: under --broken, a
// hop that reported no TOP (every hop but the manual-dialog one must, and the
// verdict names each that did not) or no BACK; in either mode, a server that is
// not answering, a backend whose CORS preflight refuses the app's origin, the
// wrong working directory, a seed version AppContext no longer reads, two hops
// with the same label, a missing case_good.json, a result page that loaded
// without its seeded result (UNSEEDED), a case whose page could not be scrolled
// 200px or a back button that did not land on /analysis (INERT), a control not
// on the page (NO-CONTROL), a /finance submit that stayed put because its
// request failed, was still unanswered when the hop's wait ended, or was
// answered 5xx (NO-BACKEND: the backend went away, hung or failed mid-run), a
// navigation that failed, a CDP socket that closed, or a crash. A submit that
// stayed put although the backend answered it below 500, or that sent no
// request, is NO-NAV, a finding, with the status in its note. A 4xx counts as
// a finding, not a fault, on purpose: the page let FORMS_GOOD's answers through
// and the backend refused them, which a reader typing the same answers would
// meet too; if FORMS_GOOD has gone stale, update it. A run that stops before
// its verdict exits 2 as well. report.json carries the same code as `exit`;
// anything thrown (a crash, a missing fixture, a failed navigation, a closed
// socket), or a run that never started, leaves none.
//
// The refuter is not optional here. Three checks in this suite have reported a
// confident zero while watching nothing at all (SPLIT-FIGURE twice on visibly
// broken output, field-align's ORPHAN arm across 56 loads, and all ten CSS
// transitions inert for a day) — and this script's happy path is a stream of
// zeroes, which is exactly the shape that hides an inert probe.
//
// --broken restores the pre-fix behaviour faithfully rather than approximately:
// it stubs window.scrollTo to a no-op (the app's own reset) AND forces
// history.scrollRestoration back to 'auto' (the browser's async restore on
// back/forward). Note the probe therefore must not scroll with window.scrollTo
// itself — it assigns documentElement.scrollTop instead, which the stub cannot
// intercept.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// Own port and own profile dir, like every other script here, so this can run
// beside another one. 9222/9333/9337/9339/9341/9343/9347/9351/9355/9359/9361/
// 9363/9365 are taken; assetgen holds 9377 and svgcheck 9378.
const DEBUG_PORT = 9367
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/scroll')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-scroll')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BROKEN = process.argv.includes('--broken')
const BACKEND_HEALTH = 'http://127.0.0.1:8000/health'
// Where the /finance submit POSTs, on the same backend.
const ANALYSIS_RUN = new URL('/api/analysis/run', BACKEND_HEALTH).href

// 0 means the run measured and found nothing, 1 a finding (under --broken, the
// refuter fired), and 2 that the run could not measure. Node's own exit on an
// uncaught error is 1, which reads as a finding and under --broken as the pass,
// so anything thrown or rejected that nothing catches exits 2 instead.
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
// A run that ends without reaching its verdict exits 2. Before this, a CDP
// socket that closed under a pending send left the send unsettled, the event
// loop drained, and node exited 0 with no report. The verdict overrides it.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/scroll-audit.mjs'))) {
  console.error(`scroll-audit: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/scroll-audit.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's goes
// once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, 'report.json'), { force: true })

// A Vite that is down used to surface as a crash inside the page (Edge's own
// error page refuses storage access). A backend that is down surfaced as a
// NO-NAV finding on the /finance submit, which exited 1: under --broken, the pass.
// This sees either server only before Edge starts. A backend lost later in the
// run is NO-BACKEND, read from the submit's own request (see that hop in HOPS).
// It returns false with exitCode 2 set, and main() returns before Edge starts,
// so node exits on its own: process.exit() this soon after a fetch can abort
// it (see crashExit).
async function requireServer(url, start) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    await res.body?.cancel()
    if (res.ok) return true
    console.error(`scroll-audit: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`scroll-audit: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// The page POSTs /api/analysis/run from the app's origin. A backend that refuses
// that origin (production mode, or ARTHNITI_CORS_ORIGINS without it) still
// answers /health, and the /finance submit's request would then fail in the
// page. That used to read as a NO-NAV finding, which exited 1; it now reads as
// NO-BACKEND, a 2, but only once the run reaches that hop, and without naming
// CORS. So this sends the preflight Edge would, and wants a 2xx that allows the
// origin. The dev backend's CORS is a loopback regex, and Starlette echoes the
// origin back. This checks the backend on 8000 only: it does not follow
// VITE_API_BASE_URL, which the page honours. Same shape as requireServer, for
// the same reason.
async function requireCors(url, origin, start) {
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      signal: AbortSignal.timeout(5000),
    })
    await res.body?.cancel()
    const allowed = res.headers.get('access-control-allow-origin')
    if (res.ok && (allowed === origin || allowed === '*')) return true
    console.error(`scroll-audit: ${url} refused a POST from ${origin} (HTTP ${res.status}, access-control-allow-origin ${allowed ?? 'not sent'}). ${start}`)
  } catch (err) {
    console.error(`scroll-audit: nothing answered the CORS preflight at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// Mirrors FORMS in drive.mjs so the result pages render fully rather than as
// empty states — an empty page is short, and a short page cannot be scrolled,
// which would make every case here inert.
const FORMS_GOOD = {
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
  // No householdIncome, so it is sent as null and the zero-income confirmation
  // on /finance never appears: the submit-api hop ticks only the consent boxes.
  finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000' },
}

// AppContext silently discards a payload whose v is not in its
// READABLE_VERSIONS, and every result page then shows its empty state. Every
// field FORMS_GOOD carries is a version 4 field, so the seed says 4, and this
// refuses to start once AppContext stops reading 4.
const SEED_VERSION = 4
{
  const file = 'frontend/src/context/AppContext.jsx'
  const m = readFileSync(resolve(file), 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `scroll-audit: ${file} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite FORMS_GOOD in the current shape and raise SEED_VERSION.`
      : `scroll-audit: READABLE_VERSIONS not found in ${file}; update the parse in scroll-audit.mjs.`)
    process.exit(2)
  }
}

// A result route has to show the seeded result. The app writes its state back
// to sessionStorage once it has mounted, so a seed it discarded reads back with
// no result.
const RESULT_ROUTES = ['/analysis', '/schemes', '/advisory', '/report']
const SEEDED = `(() => {
  try { return !!JSON.parse(sessionStorage.getItem('sih-application')).data.result } catch { return false }
})()`

// Every control in the app that can change the route, one hop each.
//
// The first version of this file tested 8 hops, 7 of them nav-bar links, and
// called the result "every route opens at the top". That was a stronger claim
// than the matrix supported: the app has ELEVEN distinct classes of navigating
// control, and a nav link is the *easiest* of them — it sits at the top of the
// page, it is a plain <Link>, and it changes the path synchronously. The classes
// that could plausibly behave differently are exactly the ones that were missing:
//
//   continue    a form's Continue button calls navigate() programmatically from
//               a submit handler, not from a <Link> click
//   submit-api  /finance is the same shape but its navigate() fires AFTER an
//               awaited network call, so the layout effect runs in a different
//               task than the click. This is the single riskiest control in the
//               app and it was untested.
//   manual      the instruction dialog sets document.body.style.overflow =
//               'hidden' as a scroll lock, and its CTA navigates while that lock
//               may still be in effect. A locked viewport is exactly the
//               condition under which a scroll reset could silently no-op.
//   startover   the utility bar's ↺ opens a native <dialog> with showModal(),
//               and its confirm button runs resetApplication() then
//               navigate('/') from inside that modal. Two clicks: `pre` opens
//               the dialog, `find` confirms. The trigger itself no longer
//               navigates, so clicking only the trigger lands nowhere.
//   cta         the bottom-of-page buttons on the result pages — the controls
//               that sit at the LARGEST offset in the whole app
//   backlink    every page's own "← back" link
//   footer      the footer's generated journey links
//   breadcrumb / brand / login   the three chrome links outside the nav bar
//   404         the catch-all's two buttons
//
// `notice` and `consent` are not new mechanisms. They are the /privacy links in
// the short notice on /login and /profile and in the /finance consent block:
// plain <Link>s that also carry router state, the backlink mechanism. They are
// labelled apart only so the class list below shows that those links ran.
//
// `find` is a JS expression returning the element, rather than a bare selector,
// because several of these cannot be addressed by href alone: /analysis carries
// a[href="/finance"] twice (the back link at the top, the CTA at the bottom) and
// it is specifically the bottom one that matters here, so those hops take the
// LAST match inside .ui-main. Writing the expression out per hop keeps each row
// self-documenting instead of hiding the choice in a helper.
//
// `pre`, when present, is the same kind of expression: a control clicked after
// the source page has been scrolled and before `find` is looked up. The manual
// and startover hops use it to open a dialog; the submit-api hop uses it to
// tick the consent box. A `pre` that finds nothing is a NO-CONTROL finding, the
// same as a missing `find`.
const lastInMain = (href) =>
  `[...document.querySelectorAll('.ui-main a[href="${href}"]')].pop()`

// The page's own back link on /profile, /login and /privacy, the three whose
// back link goes to /. Not `.ui-main a[href="/"]`: the breadcrumb renders first
// inside <main> on every page but the landing one, so its Home link is always
// the first match, and those hops clicked the breadcrumb (which the breadcrumb
// hop already covers) and never the page's own link. Found by structure, not by
// href: the one link in <main>, outside the breadcrumb, whose first element is
// the aria-hidden ← glyph, which ProfilePage, LoginPage and PrivacyPage each
// render. So a back link that is gone, or a second one, reports NO-CONTROL, and
// one that goes somewhere other than the hop's `to` reports NO-NAV.
const OWN_BACK_LINK = `(() => {
  const own = [...document.querySelectorAll('.ui-main a')].filter((a) => !a.closest('.ui-breadcrumb') && a.firstElementChild?.matches('span[aria-hidden="true"]') && a.firstElementChild.textContent === '\\u2190')
  return own.length === 1 ? own[0] : null
})()`

const HOPS = [
  // Chrome. These work from any page, so each is paired with a tall source.
  { from: '/', to: '/profile', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/profile"]')` },
  { from: '/analysis', to: '/schemes', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/schemes"]')` },
  { from: '/schemes', to: '/advisory', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/advisory"]')` },
  { from: '/advisory', to: '/report', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/report"]')` },
  { from: '/report', to: '/analysis', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/analysis"]')` },
  { from: '/analysis', to: '/', via: 'brand', find: `document.querySelector('a.ui-brand')` },
  { from: '/schemes', to: '/', via: 'breadcrumb', find: `document.querySelector('.ui-breadcrumb a[href="/"]')` },
  { from: '/report', to: '/login', via: 'login', find: `document.querySelector('.ui-masthead a[href="/login"]')` },
  { from: '/advisory', to: '/business', via: 'footer', find: `document.querySelector('.ui-footer-inner a[href="/business"]')` },
  // The utility bar's start-over button. It opens a confirm dialog and does not
  // navigate by itself, so `pre` clicks it and `find` clicks the dialog's
  // confirm. The trigger is matched on the glyph rather than on its title, which
  // is translated, and it only exists once isStarted(data) is true, which the
  // seeded fixture satisfies.
  //
  // The confirm is found by structure, never by its label, which is translated
  // too: the open dialog holds exactly two buttons, "No" first (the one the
  // component focuses on opening, so Enter keeps the answers) and "Yes" second.
  // Anything other than two buttons returns null and reports as NO-CONTROL. If
  // the order were ever swapped, this would click "No", the dialog would close
  // with the answers kept, and the hop would report NO-NAV rather than pass.
  //
  // --broken still refutes this hop. The dialog sets no scroll lock (unlike the
  // manual below), and after "Yes" the trigger unmounts, so the dialog's
  // onClose focus() has nothing to focus and cannot scroll the page to the top.
  // If that ever changes, --broken's verdict names this hop and exits 2.
  {
    from: '/analysis', to: '/', via: 'startover',
    pre: `[...document.querySelectorAll('button.ui-utility-button')].find((b) => b.textContent.includes('\\u21BA'))`,
    find: `(() => { const b = [...document.querySelectorAll('dialog[open] button')]; return b.length === 2 ? b[1] : null })()`,
  },

  // The four form steps. Each Continue calls navigate() from its submit handler.
  { from: '/profile', to: '/business', via: 'continue', find: `document.querySelector('form button[type="submit"]')` },
  { from: '/business', to: '/location', via: 'continue', find: `document.querySelector('form button[type="submit"]')` },
  { from: '/location', to: '/finance', via: 'continue', find: `document.querySelector('form button[type="submit"]')` },
  // The API call is real, so this one needs a longer settle than a client-side
  // route change. The backend must be up for this hop; if it is not, the app
  // shows the error banner and stays put. The start-up probes see the backend
  // only before Edge starts, so a hop that stays put is judged by its own
  // request, which the page's fetch wrapper records (see main()): one that
  // failed, was still unanswered when `wait` ran out, or was answered 5xx is
  // NO-BACKEND, a 2, because the backend went away, hung or failed and the hop
  // measured nothing. One answered below 500, or no request at all, is NO-NAV,
  // a finding, with the status in its note (the header says why a 4xx counts).
  //
  // Nothing is sent until the consent box is ticked, and it starts unticked on
  // every load. `pre` returns the first unticked consent box for the harness to
  // click and clicks any others itself (the age box, when the build asks for
  // it). With no consent box at all it returns null, which reports NO-CONTROL:
  // the right signal, since a /finance that sends without asking is the defect.
  {
    from: '/finance', to: '/analysis', via: 'submit-api',
    pre: `(() => { const b = [...document.querySelectorAll('input[type=checkbox][data-consent]')].filter((x) => !x.checked); b.slice(1).forEach((x) => x.click()); return b[0] || null })()`,
    find: `document.querySelector('form button[type="submit"]')`, wait: 4000,
  },

  // Every page's own back link.
  { from: '/profile', to: '/', via: 'backlink', find: OWN_BACK_LINK },
  { from: '/business', to: '/profile', via: 'backlink', find: `document.querySelector('.ui-main a[href="/profile"]')` },
  { from: '/location', to: '/business', via: 'backlink', find: `document.querySelector('.ui-main a[href="/business"]')` },
  { from: '/finance', to: '/location', via: 'backlink', find: `document.querySelector('.ui-main a[href="/location"]')` },
  { from: '/analysis', to: '/finance', via: 'backlink', find: `document.querySelector('.ui-main a[href="/finance"]')` },
  { from: '/schemes', to: '/analysis', via: 'backlink', find: `document.querySelector('.ui-main a[href="/analysis"]')` },
  { from: '/advisory', to: '/schemes', via: 'backlink', find: `document.querySelector('.ui-main a[href="/schemes"]')` },
  { from: '/report', to: '/advisory', via: 'backlink', find: `document.querySelector('.ui-main a[href="/advisory"]')` },
  // /login lost three of its four fields (phone, address and email), so it gets
  // the short viewport the catch-all uses, for the reason given there.
  { from: '/login', to: '/', via: 'backlink', find: OWN_BACK_LINK, viewport: { width: 1280, height: 380 } },
  // Opened by URL, so the page carries no router state and its back link goes
  // to /, which is what a reader who opens /privacy directly must get. A back
  // link that went anywhere else from here would report NO-NAV.
  { from: '/privacy', to: '/', via: 'backlink', find: OWN_BACK_LINK },

  // The bottom-of-page CTAs on the result pages. These are the controls at the
  // largest offset anywhere in the app, which makes them the worst case for this
  // defect and the reason `lastInMain` exists.
  { from: '/analysis', to: '/schemes', via: 'cta', find: lastInMain('/schemes') },
  { from: '/analysis', to: '/advisory', via: 'cta', find: lastInMain('/advisory') },
  { from: '/analysis', to: '/finance', via: 'cta', find: lastInMain('/finance') },
  { from: '/schemes', to: '/advisory', via: 'cta', find: lastInMain('/advisory') },
  { from: '/schemes', to: '/analysis', via: 'cta', find: lastInMain('/analysis') },
  { from: '/advisory', to: '/report', via: 'cta', find: lastInMain('/report') },
  { from: '/advisory', to: '/schemes', via: 'cta', find: lastInMain('/schemes') },

  // The links to the privacy notice: the footer's bottom line on every page, and
  // the short notice on /login, /profile and /finance. /login and /profile are
  // short pages, so they get the catch-all's short viewport, for the reason given
  // there. On /finance the notice sits in the consent block above the submit, the
  // only /privacy link inside <main>.
  { from: '/advisory', to: '/privacy', via: 'footer', find: `document.querySelector('.ui-footer-bottom-inner a[href="/privacy"]')` },
  { from: '/login', to: '/privacy', via: 'notice', find: `document.querySelector('.ui-main a[href="/privacy"]')`, viewport: { width: 1280, height: 380 } },
  { from: '/profile', to: '/privacy', via: 'notice', find: `document.querySelector('.ui-main a[href="/privacy"]')`, viewport: { width: 1280, height: 380 } },
  { from: '/finance', to: '/privacy', via: 'consent', find: lastInMain('/privacy') },

  // The instruction dialog, opened from the landing strip. `pre` finds and clicks
  // the opener, which is what puts body overflow: hidden in effect; the CTA then
  // navigates out of a locked viewport.
  //
  // THIS HOP IS OVER-DETERMINED, AND IT IS THE ONE HOP --broken CANNOT REFUTE.
  // It passes with the fix removed, which was measured rather than assumed:
  // stubbing window.scrollTo and clicking a PLAIN landing link from the same
  // offset lands at 706px (the destination's max scroll — the defect), while the
  // same stub through this dialog lands at 0. scrollTo was called and swallowed
  // exactly once in both, so the refuter is working; the difference is the scroll
  // lock. InstructionManual.jsx restores body.style.overflow in a PASSIVE effect
  // cleanup, which runs after paint — so during the commit that swaps / for
  // /profile the body is still overflow: hidden, the viewport is momentarily not
  // scrollable, and Chromium RESETS the offset to 0 rather than clamping it to
  // the new maximum. Then the cleanup restores overflow and 0 stands.
  // So this hop verifies the user-visible outcome for the app's one
  // navigate-out-of-a-modal path, and proves nothing about useOpenAtTop. Keep it
  // for the former; do not read a --broken run's count as 38-of-38 refuted.
  // `refutable: false` is what exempts it, and only it, from the verdict's
  // check that --broken made every other hop report TOP.
  {
    from: '/', to: '/profile', via: 'manual', refutable: false,
    pre: `document.querySelector('button.ui-manual-open')`,
    find: `document.querySelector('.ui-manual-panel a[href="/profile"]')`,
  },

  // The catch-all. /login and * were the two routes that never appeared in the
  // matrix at all.
  //
  // These two carry their own viewport, and the reason is worth stating: the 404
  // page is short — one card between the chrome and the footer — so at 1280x720
  // it is only ~154px taller than the window and the instrument check correctly
  // reported both hops INERT, i.e. proving nothing. Shrinking the viewport for
  // these two cases is not weakening the test, it is the only way to give them
  // an offset to carry at all; without it the catch-all is the one route in the
  // app with no real coverage.
  //
  // The home button is looked for inside the card, so the breadcrumb's Home
  // link, the first a[href="/"] in <main>, cannot stand in for it. It is found
  // by its href rather than by position: the two buttons carry no other marker
  // (their labels are translated), and swapping them would then read as NO-NAV.
  // A home button that is gone, or no longer goes to /, reports NO-CONTROL.
  { from: '/no-such-page', to: '/', via: '404', find: `document.querySelector('.ui-main .ui-card a[href="/"]')`, viewport: { width: 1280, height: 380 } },
  { from: '/no-such-page', to: '/profile', via: '404', find: `document.querySelector('.ui-main a[href="/profile"]')`, viewport: { width: 1280, height: 380 } },
]

// Every finding names its hop by this label, and --broken's verdict checks for
// a TOP hop by hop by it, so two hops with one label would let either one's
// TOP stand for both. Checked before anything starts.
const hopLabel = (hop) => `${hop.from} -> ${hop.to} (${hop.via})`
{
  const labels = HOPS.map(hopLabel)
  const twice = labels.find((label, i) => labels.indexOf(label) !== i)
  if (twice) {
    console.error(`scroll-audit: two hops are both "${twice}". The verdict tells hops apart by this label; give each hop its own.`)
    process.exit(2)
  }
}

// Why the backend could not serve a hop's request, from what the page's fetch
// wrapper recorded for it (see main()), or null when it answered below 500 or
// no request was sent. A reason makes the hop NO-BACKEND, a 2.
function backendLost(post, waited) {
  if (post === 'pending') return `the request to /api/analysis/run was still unanswered after ${waited}ms: the backend hung, or answers slower than this hop waits`
  if (typeof post === 'string' && post.startsWith('failed')) return `the request to /api/analysis/run got no answer (${post}): the backend went away, or refuses this origin`
  if (typeof post === 'number' && post >= 500) return `the backend answered the request to /api/analysis/run with HTTP ${post}`
  return null
}

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
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
    // An Edge that dies mid-run closes this socket, and the send waiting on it
    // never settled. A pending promise does not keep node alive, so the loop
    // drained and the run ended with no verdict. Failing every one sends the
    // run to main()'s catch, which exits 2.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
    })
  }

  send(method, params = {}, useSession = true) {
    // A frame sent on a closed socket is dropped without an error, so its reply
    // could never come. Nothing sends before `ready`, so not OPEN means closed.
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(method + ': CDP socket closed'))
    const id = this.next++
    const envelope = { id, method, params }
    if (useSession && this.sessionId) envelope.sessionId = this.sessionId
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej, method })
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

async function main() {
  if (!(await requireServer(APP + '/', 'Start the Vite dev server first: npm run dev in ./frontend.'))) return
  if (!(await requireServer(BACKEND_HEALTH, 'Start the backend first: ../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 in ./backend.'))) return
  const origin = new URL(APP).origin
  if (!(await requireCors(ANALYSIS_RUN, origin, `Run the backend in development (ARTHNITI_ENV unset or development), with ARTHNITI_CORS_ORIGINS unset or naming ${origin}.`))) return
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    // Deliberately short, so every page is taller than the viewport and there is
    // always something to scroll. A 1200px-tall window makes several of these
    // pages fit entirely and every case goes inert.
    '--window-size=1280,720',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const findings = []
  const report = { broken: BROKEN, hops: [], anchor: null, back: null }

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // Unlike motion-audit's CSS refuter this one MUST land before the app's own
    // code runs — the fix is a layout effect, so patching after mount would be
    // too late for the first navigation. addScriptToEvaluateOnNewDocument is the
    // right hook precisely because it runs before any document script.
    if (BROKEN) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          window.scrollTo = function () {}
          try { window.history.scrollRestoration = 'auto' } catch {}
          Object.defineProperty(window.history, 'scrollRestoration', {
            get: () => 'auto', set: () => {}, configurable: true,
          })
        `,
      })
    }

    // Seed on EVERY document, not once up front. Four of the hops below are form
    // Continue buttons, and updateSection() deliberately clears `result` for the
    // business, location and finance sections — so one up-front seed would leave
    // every later result-page hop rendering an empty state, and an empty page is
    // short enough that the instrument check would report it INERT. Worse, that
    // would look like a coverage problem rather than what it is: the fixture
    // being consumed by an earlier case. Re-seeding before any app code runs
    // makes each hop independent of the ones before it.
    //
    // The try/catch is for about:blank, whose opaque origin throws on any
    // storage access.
    const payload = JSON.stringify({
      v: SEED_VERSION,
      data: { ...FORMS_GOOD, result: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')) },
    })
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          sessionStorage.setItem('sih-application', ${JSON.stringify(payload)})
          localStorage.setItem('sih-language', 'en')
          localStorage.setItem('sih-theme', 'light')
          localStorage.setItem('sih-textsize', 'md')
          localStorage.removeItem('sih-dialect')
        } catch {}
      `,
    })

    // What became of the /finance submit's request, for the submit-api hop to
    // read when it did not land (see that hop in HOPS). This replaces the page's
    // fetch before any app code runs, and api.js calls the global fetch, so the
    // wrapper sees its one request. window.__scrollAuditPost is null until a
    // request to /api/analysis/run, then 'pending', the answer's status once one
    // arrives, or 'failed: ' and the error's name and message. Only the latest
    // such request writes it. The app's move to /analysis is client-side, so the
    // window, and this value with it, survives the move.
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const realFetch = window.fetch
          let latest = 0
          window.__scrollAuditPost = null
          window.fetch = function (input) {
            const sent = realFetch.apply(window, arguments)
            let path = ''
            try { path = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href).pathname } catch {}
            if (path.endsWith('/api/analysis/run')) {
              const mine = ++latest
              window.__scrollAuditPost = 'pending'
              sent.then(
                (res) => { if (mine === latest) window.__scrollAuditPost = res.status },
                (err) => { if (mine === latest) window.__scrollAuditPost = 'failed: ' + (err && err.name ? err.name + ': ' + err.message : String(err)) },
              )
            }
            return sent
          }
        })()
      `,
    })

    // A navigation that failed still replies, with errorText set: a Vite that
    // went down mid-run answers net::ERR_CONNECTION_REFUSED here. That is a
    // fault, never a finding, so it throws to main()'s catch, which exits 2.
    const navigate = async (url) => {
      const { errorText } = await cdp.send('Page.navigate', { url })
      if (errorText) throw new Error(`scroll-audit: ${url} did not load (${errorText}). Is the Vite dev server still up?`)
    }

    // A warm-up load: Vite compiles on demand, and the first hit of a route is
    // far slower than the rest. Without this the first hop's fixed sleep can
    // expire mid-compile.
    await navigate(APP + '/')
    await sleep(1500)

    // An unseeded result page is short, so its hop usually reports INERT as
    // well; UNSEEDED names the cause.
    const goto = async (path) => {
      await navigate(APP + path)
      await sleep(900)
      if (RESULT_ROUTES.includes(path) && !(await cdp.evaluate(SEEDED))) {
        findings.push({ kind: 'UNSEEDED', hop: path, note: 'no result in the app\'s state: the seed was not read, so this is the empty state' })
      }
    }

    // Assigning scrollTop rather than calling window.scrollTo, because --broken
    // stubs scrollTo and the probe must keep working under its own refuter.
    const scrollToBottom = async () => {
      return cdp.evaluate(`(() => {
        const d = document.documentElement
        const max = d.scrollHeight - d.clientHeight
        d.scrollTop = max
        return { max, y: Math.round(window.scrollY) }
      })()`)
    }

    const offset = () => cdp.evaluate('Math.round(window.scrollY)')

    for (const hop of HOPS) {
      const label = hopLabel(hop)

      // Cleared unconditionally at the TOP of every iteration rather than at the
      // bottom of the ones that set it: three branches below `continue` out of
      // the case, and any of them would otherwise leak a short viewport into the
      // next hop, where it would silently change what that hop measured.
      await cdp.send('Emulation.clearDeviceMetricsOverride')
      if (hop.viewport) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { ...hop.viewport, deviceScaleFactor: 1, mobile: false })
      }

      await goto(hop.from)
      const before = await scrollToBottom()

      // `pre` runs AFTER the scroll, deliberately. The manual hop needs the
      // landing page already scrolled at the moment the dialog opens, because
      // opening it is what puts body overflow: hidden in effect — a lock applied
      // at offset 0 would test nothing. The startover hop needs the same order
      // for a plainer reason: its dialog's confirm is what navigates, so the
      // offset has to be in place before either click. The submit-api hop's
      // consent tick has no order of its own; the re-measure below still guards
      // against a click that moves the page.
      if (hop.pre) {
        const opened = await cdp.evaluate(`(() => {
          const el = ${hop.pre}
          if (!el) return { ok: false, why: 'opening control not found' }
          el.click()
          return { ok: true }
        })()`)
        if (!opened.ok) {
          findings.push({ kind: 'NO-CONTROL', hop: label, note: `${hop.via}: ${opened.why}` })
          report.hops.push({ ...hop, scrolledTo: before.y, after: null, error: opened.why })
          continue
        }
        await sleep(500)
      }

      // Re-measured after `pre` rather than reusing before.y, because a dialog
      // that moves focus can scroll the document out from under the case, and
      // then the hop would pass while proving nothing.
      const carried = hop.pre ? await offset() : before.y

      // The instrument check. If the source page could not scroll, the hop
      // proves nothing whether it passes or fails — a clean result from an inert
      // case is indistinguishable from a clean result from a working one, which
      // is the trap tools/README.md's last section is about.
      if (before.max < 200 || carried < 200) {
        findings.push({ kind: 'INERT', hop: label, note: `carried only ${carried}px of ${before.max}px scrollable; case proves nothing` })
        report.hops.push({ ...hop, scrolledTo: carried, scrollable: before.max, after: null, inert: true })
        continue
      }

      const clicked = await cdp.evaluate(`(() => {
        const el = ${hop.find}
        if (!el) return { ok: false, why: 'control not found' }
        el.click()
        return { ok: true, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) }
      })()`)

      if (!clicked.ok) {
        findings.push({ kind: 'NO-CONTROL', hop: label, note: `${hop.via}: ${clicked.why}` })
        report.hops.push({ ...hop, scrolledTo: carried, after: null, error: clicked.why })
        continue
      }

      await sleep(hop.wait ?? 700)
      const landedOn = await cdp.evaluate('location.pathname')
      const after = await offset()
      // What the fetch wrapper recorded. Null on every hop but the submit, the
      // only one that sends a request.
      const post = await cdp.evaluate('window.__scrollAuditPost ?? null')
      const lost = landedOn === hop.to ? null : backendLost(post, hop.wait ?? 700)

      if (lost) {
        findings.push({ kind: 'NO-BACKEND', hop: label, note: `stayed on ${landedOn}, because ${lost}` })
      } else if (landedOn !== hop.to) {
        const request = post !== null
          ? `; the request to /api/analysis/run was answered HTTP ${post}`
          : hop.via === 'submit-api' ? '; no request to /api/analysis/run was sent' : ''
        findings.push({ kind: 'NO-NAV', hop: label, note: `clicked ${clicked.tag} "${clicked.text}" but landed on ${landedOn}${request}` })
      } else if (after > 4) {
        // 4px of slack rather than an exact 0: a sub-pixel layout settle can
        // leave a rounded 1, and a false alarm on this check would be worse than
        // the tolerance, since the defect it watches for is hundreds of pixels.
        findings.push({ kind: 'TOP', hop: label, note: `${hop.to} opened at ${after}px, not at the top (came from ${carried}px)` })
      }
      report.hops.push({ ...hop, scrolledTo: carried, scrollable: before.max, landedOn, after, control: clicked.text, ...(post === null ? {} : { post }) })
    }

    // The last hop in HOPS carries a viewport override; the back and anchor arms
    // below must run at the real window size like every other case.
    await cdp.send('Emulation.clearDeviceMetricsOverride')

    // Back/forward. Left on the default 'auto', the browser restores the previous
    // offset asynchronously — possibly after the layout effect has already run —
    // so the defect comes back through the back button even with the effect in
    // place. This arm is what makes scrollRestoration: 'manual' load-bearing
    // rather than belt-and-braces.
    await goto('/analysis')
    const backFrom = await scrollToBottom()
    await cdp.evaluate(`document.querySelector('.ui-navbar a[href="/schemes"]').click()`)
    await sleep(700)
    await cdp.evaluate('window.history.back()')
    await sleep(900)
    const backTo = await cdp.evaluate('location.pathname')
    const backOffset = await offset()
    report.back = { scrolledTo: backFrom.y, landedOn: backTo, after: backOffset }
    if (backFrom.y < 200) {
      findings.push({ kind: 'INERT', hop: 'back button', note: `/analysis only scrolled to ${backFrom.y}px` })
    } else if (backTo === '/analysis' && backOffset > 4) {
      findings.push({ kind: 'BACK', hop: '/schemes -> back -> /analysis', note: `restored to ${backOffset}px instead of the top` })
    } else if (backTo !== '/analysis') {
      // The nav link did not push /schemes, or back went somewhere else. Either
      // way no offset came back through the back button, so this measured nothing.
      findings.push({ kind: 'INERT', hop: 'back button', note: `history.back() landed on ${backTo}, not /analysis` })
    }

    // The other direction, and the reason the fix guards on location.hash. A
    // same-page anchor must still jump to its target — a blanket scroll-to-top
    // would break "See how it works" on the landing page and the skip link, and
    // both would look like the fix working.
    await goto('/')
    const anchor = await cdp.evaluate(`(() => {
      const a = document.querySelector('a[href="#how-it-works"]')
      if (!a) return { ok: false, why: 'anchor link not found' }
      a.click()
      return { ok: true }
    })()`)
    await sleep(800)
    const anchorOffset = await offset()
    const sectionTop = await cdp.evaluate(`(() => {
      const s = document.getElementById('how-it-works')
      return s ? Math.round(s.getBoundingClientRect().top) : null
    })()`)
    report.anchor = { ...anchor, after: anchorOffset, sectionTopInViewport: sectionTop }
    if (!anchor.ok) {
      findings.push({ kind: 'NO-CONTROL', hop: '#how-it-works', note: anchor.why })
    } else if (anchorOffset < 100) {
      findings.push({ kind: 'ANCHOR', hop: '#how-it-works', note: `page stayed at ${anchorOffset}px — the scroll-to-top is defeating a same-page anchor` })
    }

    await cdp.send('Target.closeTarget', { targetId }, false)
  } finally {
    edge.kill()
  }

  // 1 means findings, and under --broken it is the expected result, so nothing
  // that proves the run worthless may exit with it. This used to exit 1 when
  // --broken found nothing, and counted any finding as the refuter firing: an
  // INERT or NO-CONTROL finding alone would have passed, and a plain run exited
  // 1 on either as if it were a defect. A case that could not scroll, a control
  // that is not on the page, and a submit the backend did not serve
  // (NO-BACKEND) measured nothing, so all three exit 2 in either mode.
  const unseeded = findings.filter((f) => f.kind === 'UNSEEDED')
  const unmeasured = findings.filter((f) => f.kind === 'INERT' || f.kind === 'NO-CONTROL' || f.kind === 'NO-BACKEND')
  // TOP comes only from the stubbed scrollTo. BACK can come from either half of
  // the refuter: with scrollTo stubbed, /schemes keeps the carried offset and
  // back leaves it there whatever scrollRestoration says. So requiring BACK
  // proves the back arm fires, not that forcing scrollRestoration matters.
  const missed = BROKEN ? ['TOP', 'BACK'].filter((k) => !findings.some((f) => f.kind === k)) : []
  // And TOP hop by hop. A TOP from any one hop used to satisfy `missed`, so a
  // hop the stub no longer reached, or one that ended in NO-NAV or NO-BACKEND
  // instead, passed as refuted. Every hop must report TOP but the manual one,
  // which --broken cannot refute (its entry in HOPS says why).
  const topHops = new Set(findings.filter((f) => f.kind === 'TOP').map((f) => f.hop))
  const unrefuted = BROKEN ? HOPS.filter((h) => h.refutable !== false).map(hopLabel).filter((l) => !topHops.has(l)) : []
  const exit = unseeded.length || unmeasured.length || missed.length || unrefuted.length ? 2 : findings.length > 0 ? 1 : 0
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ exit, ...report, findings, ...(BROKEN ? { unrefuted } : {}) }, null, 2))

  const inert = findings.filter((f) => f.kind === 'INERT').length
  for (const h of report.hops) {
    const mark = h.inert ? 'inert' : h.after === undefined || h.after === null ? '—' : `${h.after}px`
    const vp = h.viewport ? `  (viewport ${h.viewport.width}x${h.viewport.height})` : ''
    console.log(`  ${String(h.from).padEnd(14)} -> ${String(h.to).padEnd(10)} via ${h.via.padEnd(11)} from ${String(h.scrolledTo ?? '?').padStart(5)}px  opened at ${mark}${vp}`)
  }

  // Which classes of control actually ran. A per-hop pass list does not show
  // this, and the whole reason this file was rewritten is that its first version
  // tested two classes out of eleven while reading as complete coverage.
  const byClass = {}
  for (const h of report.hops) {
    byClass[h.via] ??= { ran: 0, inert: 0 }
    byClass[h.via].ran += 1
    if (h.inert) byClass[h.via].inert += 1
  }
  const classes = Object.entries(byClass)
    .map(([via, c]) => `${via} ${c.ran - c.inert}/${c.ran}`)
    .join('  ')
  console.log(`\n  control classes exercised (non-inert/total): ${classes}`)
  console.log(`  back button: /analysis at ${report.back?.scrolledTo}px -> /schemes -> back -> ${report.back?.landedOn} at ${report.back?.after}px`)
  console.log(`  #how-it-works anchor: page at ${report.anchor?.after}px, section ${report.anchor?.sectionTopInViewport}px from the viewport top`)
  console.log('')
  if (findings.length === 0) {
    console.log(`scroll-audit: ${report.hops.length} hops + back + anchor, 0 findings${BROKEN ? '  <-- --broken FAILED TO FIRE' : ''}`)
  } else {
    for (const f of findings) console.log(`  ${f.kind.padEnd(11)} ${f.hop} — ${f.note}`)
    console.log(`\nscroll-audit: ${findings.length} findings (${inert} inert)`)
  }
  console.log(`report: ${resolve(OUT, 'report.json')}`)
  if (unseeded.length) console.log(`scroll-audit: ${unseeded.length} result-page load(s) showed the empty state, so the run is incomplete.`)
  if (unmeasured.length) console.log(`scroll-audit: ${unmeasured.length} case(s) measured nothing (INERT, NO-CONTROL or NO-BACKEND), so the run is incomplete.`)
  if (missed.length) console.log(`scroll-audit: --broken removed the fix and this script did not report ${missed.join(' or ')}. The probe is inert.`)
  if (unrefuted.length) console.log(`scroll-audit: --broken removed the fix and ${unrefuted.length} hop(s) did not report TOP, so their plain-run pass proves nothing: ${unrefuted.join('; ')}`)
  process.exit(exit)
}

main().catch((err) => {
  console.error(err)
  // A crash is not a finding, and under --broken 1 is the pass.
  crashExit()
})

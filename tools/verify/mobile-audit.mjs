// Mobile-width audit. Same zero-dependency CDP plumbing as drive.mjs, but it
// emulates real phone viewports and measures the things that only go wrong on a
// narrow screen — none of which lint, build or the desktop driver can see.
//
// What it reports, in order of how badly each one hurts a rural user on a phone:
//
//   OVERFLOW  the page scrolls sideways (documentElement.scrollWidth > clientWidth).
//             This is the worst mobile defect there is: content sits off-screen,
//             the layout jitters under a thumb, and pinch-zoom becomes the only
//             way to read. It also names the widest offending elements, because
//             "the page is 40px too wide" is useless without knowing what did it.
//   TAP       interactive elements under 44x44 CSS px. That is the documented
//             minimum for a reliable thumb press; below it a user misses and
//             re-taps, which on a form page means abandoning the journey.
//   TINY      rendered text under 12px. The audience is low-literacy readers, so
//             small text is not a cosmetic issue.
//   CLIP      an element whose own content overflows it horizontally — a long
//             unbroken word (a district name, a scheme name, an email) pushing
//             out of its card.
//   SPLIT-     a standalone amount or percentage broken across two line boxes. "₹30,000"
//   FIGURE     rendered as "₹30,00" / "0" is not a cosmetic problem — the reader
//              parses a different number. Nothing else here can see it: nothing
//              overflows, nothing is clipped, the text is all present. It was a
//              live bug caused by overflow-wrap: anywhere on the cards meeting a
//              squeezed flex row, and it only appeared at the largest text scale
//              in Hindi, which is why the stress viewport exists.
//
// Widths: 360 is the common Android floor still in wide use in rural India, 390
// is a current iPhone, 412 a large Android. If it survives 360 it survives the
// rest, but all three are checked because a broken breakpoint often only bites in
// a narrow band.
//
// Every <details> on a page is opened before it is measured. A closed one still
// gives its contents boxes, but it paints none of them: they add nothing to the
// page's scroll width and their innerText is empty. So OVERFLOW and SPLIT-FIGURE
// could not see anything inside one (the /privacy retention text, the /finance
// EMI question). Measured 26 Sept 2026: a 300-character unbreakable word put in
// the closed /privacy disclosure left the page 360px wide; opened, it was 2285px.
//
// One load per width is not a plain page load: /finance after a submit with
// nothing ticked and a household income of exactly 0 (BLOCKED below). That is the
// only state that renders the zero-income note, its box and its error, and the
// consent error. Each of those elements has to be present, or the load fails as
// MISSING, because an audit of a box that never rendered measures nothing.
//
// Run the Vite dev server first, then:  node tools/verify/mobile-audit.mjs
// Exit 0: nothing found. 1: a finding: OVERFLOW, TAP, TINY, CLIP, SPLIT-FIGURE or
// PAGE-ERROR. 2: the run could not measure: the app is not answering, or stops
// mid-run (a navigation fails); the working directory is wrong; port 9333 is
// already answering; --out= does not start with "mobile"; AppContext no longer
// reads the seed's version; a load is NOT-RENDERED (#main never filled, Edge's
// own error page, or an answer outside 2xx), BLOCK-FAILED or MISSING; a result
// page lost its seed (UNSEEDED); Edge's DevTools socket closed under the audit;
// or the audit crashed, or ended any other way before its verdict.
// report.json carries the same code as `exit`; a crash, or a run that never
// started, leaves none.
//
// --url=http://localhost:5181   audit another copy of the app, for example a Vite
//                               started with the VITE_FIDUCIARY_* variables and
//                               VITE_REQUIRE_AGE_CHECK=true
// --out=mobile-fiduciary        write that run under screenshots/verify/<name>
//                               instead of screenshots/verify/mobile
// --expect-age                  the copy renders the age box: #consent-age and
//                               #consent-age-error are then required as well
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9333
const ARGS = process.argv.slice(2)
const argValue = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const APP = (argValue('url') || 'http://localhost:5173').replace(/\/+$/, '')
// A bare name under screenshots/verify only: main() deletes OUT recursively
// before it writes, so it must never be a path someone typed. It starts with
// "mobile" as well, so it can name neither another gate's folder (--out=lang
// would delete lang-layout's screenshots) nor an Edge profile.
const OUT_NAME = argValue('out') || 'mobile'
if (!/^mobile[A-Za-z0-9_-]*$/.test(OUT_NAME)) {
  console.error(`mobile-audit: --out= takes a folder name under screenshots/verify that starts with "mobile", not ${JSON.stringify(OUT_NAME)}`)
  process.exit(2)
}
const OUT = resolve('screenshots/verify', OUT_NAME)
const EXPECT_AGE = ARGS.includes('--expect-age')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-mobile')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Our Edge dies by PID and nothing else, never by image name, which would close
// the Edge the person running the gate has open. edge.kill() alone used to leak
// it: the msedge.exe we spawn relaunches itself through a compatibility layer and
// exits within a second, so the spawned PID is gone before we kill it.
// --edge-skip-compat-layer-relaunch stops that at the source, and ownEdgePids()
// is the fallback, finding the browser process that carries OUR profile path and
// no --type= (renderer, GPU and utility children all carry one; taskkill /T takes
// those with it). The path is anchored at a quote, a space or the end so it cannot
// match a longer profile dir that starts with this one. Same technique as
// drive.mjs and market-ui.mjs.
let edge = null
function ownEdgePids() {
  const script =
    "$p = [regex]::Escape($env:MOBILE_EDGE_PROFILE) + '(?=[\"\\s]|$)'; " +
    "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -and " +
    "$_.CommandLine -match $p -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.ProcessId }"
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, MOBILE_EDGE_PROFILE: PROFILE_DIR },
    encoding: 'utf8',
  })
  return (r.stdout || '').split(/\s+/).filter((s) => /^\d+$/.test(s)).map(Number)
}
function killOwnEdge() {
  const kill = (pid) => spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
  // A spawned PID that has already exited is skipped: it may belong to something else by now.
  if (edge && edge.exitCode === null && edge.signalCode === null) kill(edge.pid)
  edge = null
  for (const pid of ownEdgePids()) kill(pid)
}

// 0 means the run measured and found nothing, 1 a finding, and 2 that the run
// could not measure. Node's own exit on an uncaught error is 1, which reads as a
// finding, so anything thrown or rejected that nothing catches exits 2 instead.
process.on('uncaughtException', (err) => {
  console.error(err)
  killOwnEdge()
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
// socket that closed under a pending send left that send unsettled, the event
// loop drained, and node exited 0 with no report. The verdict overrides it.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/mobile-audit.mjs'))) {
  console.error(`mobile-audit: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/mobile-audit.mjs`)
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
    console.error(`mobile-audit: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`mobile-audit: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// The last entry is the one that actually stresses the layout. index.css has to
// survive two independent presentation switches, and the largest text scale on
// the narrowest screen is where a fixed-width box overflows again: 1.18x type in
// the same 336px container. Hindi too, because Devanagari sets taller and its
// words do not break where English ones do. If a mobile rule is going to fail,
// it fails here and nowhere else.
//
// It was three switches until 8 September 2026 — high contrast was the third arm
// of this case, and it went with the feature. The remaining combination is still
// what found four defects the three plain widths could not.
const VIEWPORTS = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  // 'lg' is the key TextSizeControl stores, not 'large' — TEXT_SCALES maps
  // sm/md/lg to 0.94/1/1.18.
  { name: '360-stress', width: 360, height: 740, theme: 'dark', textsize: 'lg', lang: 'hi' },
]

const ROUTES = ['/', '/login', '/profile', '/business', '/location', '/finance', '/analysis', '/schemes', '/advisory', '/report', '/privacy']

// Reuses the driver's real backend responses so the result pages are as long and
// as full as they get — a short page can hide an overflow a long one exposes.
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
// READABLE_VERSIONS, and every result page then shows its empty state. Every
// field SEED and BLOCKED_SEED carry is a version 4 field, so both say 4, and
// this refuses to start once AppContext stops reading 4.
const SEED_VERSION = 4
{
  const file = 'frontend/src/context/AppContext.jsx'
  const m = readFileSync(resolve(file), 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `mobile-audit: ${file} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite SEED in the current shape and raise SEED_VERSION.`
      : `mobile-audit: READABLE_VERSIONS not found in ${file}; update the parse in mobile-audit.mjs.`)
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

// The blocked /finance state: the same answers with a household income of exactly
// 0, then the submit button pressed with no box ticked. FinancePage checks the
// boxes before it sends anything, so no request goes out and no backend is
// needed. These are the elements that state has to render; any one absent is
// MISSING.
const BLOCKED_SEED = { ...SEED, finance: { ...SEED.finance, householdIncome: '0' } }
const BLOCKED_IDS = [
  'household-zero-note', 'household-zero-confirm', 'household-zero-error',
  'consent-notice', 'consent-error',
  ...(EXPECT_AGE ? ['consent-age', 'consent-age-error'] : []),
]
const BLOCK = `(async () => {
  const button = document.querySelector('#main form button[type="submit"]')
  if (!button) return 'no submit button in the /finance form'
  const boxes = [...document.querySelectorAll('input[type=checkbox][data-consent], input[type=checkbox][data-household-zero]')]
  if (boxes.some((b) => b.checked)) return 'a box was already ticked before the submit'
  button.click()
  for (let i = 0; i < 30 && !document.getElementById('consent-error'); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
  return ''
})()`

// Opens every <details> and says how many there were.
const OPEN_DETAILS = `(() => {
  const all = [...document.querySelectorAll('details')]
  for (const d of all) d.open = true
  return all.length
})()`

// --- minimal CDP client, session-aware --------------------------------------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.pageErrors = []
    this.sessionId = null
    this.closed = false

    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('CDP socket error')))
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed')))
    })

    // Edge gone (it died, or something killed it) closes the socket, and no
    // reply is coming for anything still waiting. Each of those rejects, so the
    // run stops as a crash instead of hanging on a send that never settles.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
    })

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'unknown')
      }
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
  }

  send(method, params = {}, useSession = true) {
    // A frame sent on a socket that is not open is dropped without a word, so its
    // reply would never come. Nothing sends before ready, so not open here means
    // closing or closed.
    if (this.ws.readyState !== WebSocket.OPEN) {
      this.closed = true
      return Promise.reject(new Error(method + ': CDP socket closed'))
    }
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
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
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

async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    // A page still loading can fail an evaluate, which only means not yet. A
    // closed socket means never, and stops the run.
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`)
      .catch((err) => { if (cdp.closed) throw err; return 0 })
    if (len > 40) return true
    await sleep(120)
  }
  return false
}

// A navigation Edge could not complete (the app stopped answering mid-run)
// replies with errorText. There is no page to audit after that, so it throws.
async function navigate(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`${url} did not load (${errorText}). Is the app still running?`)
}

// Why a load that navigated is still not the app: Edge's own error page, or an
// answer outside 2xx. A copy Edge revalidated (a 304 on the wire) still reads
// 200 here, as measured on 30 Sept 2026, and a responseStatus of 0 means Edge
// recorded none. '' when neither.
const LOAD_ERROR = `(() => {
  if (location.protocol === 'chrome-error:') return 'an Edge error page'
  const status = performance.getEntriesByType('navigation')[0]?.responseStatus || 0
  return status && (status < 200 || status > 299) ? 'HTTP ' + status : ''
})()`

// Runs in the page. Deliberately measures rather than inspects CSS: a rule can
// look right and still lose to the cascade, and only the used value is the truth.
const PROBE = `(() => {
  const doc = document.documentElement
  const vw = doc.clientWidth
  const out = { vw, scrollWidth: doc.scrollWidth, overflow: [], tap: [], tiny: [], clip: [], split: [] }
  // A standalone figure must occupy exactly one line box. "₹30,000" broken
  // across two lines renders as "₹30,00" then "0", which a reader parses as a
  // different number — and it is invisible to every other check here, because
  // nothing overflows and nothing is clipped. Anchored to the whole trimmed text
  // so a paragraph that merely mentions a figure and wraps normally is not caught.
  // A shortfall (-₹10,000: the sign leads) and a percentage are figures too.
  // Until 29 Sept 2026 this matched only a positive amount, so a split margin or
  // a split shortfall passed.
  const FIGURE = /^-?₹\\s?[\\d,]+(\\.\\d+)?$|^-?[\\d,]+(\\.\\d+)?%$/

  // An element inside a horizontal scroll container is SUPPOSED to have a rect
  // past the viewport — that is scrolled-out content, not overflow. The nav bar
  // scrolls on purpose (.ui-navbar-inner has overflow-x: auto), so without this
  // every nav link reported as OVERFLOW and buried the real findings.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    return false
  }

  const describe = (el) => {
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''
    const text = (el.innerText || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
    return el.tagName.toLowerCase() + cls + (text ? ' “' + text + '”' : '')
  }

  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    // .sr-only is a deliberately clipped 1px box, so it reports as CLIP on every
    // page and drowns the real findings. Skip it and anything inside it.
    if (el.closest('.sr-only')) continue
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue

    // Sticks out past the right edge, or starts left of it. 1px of tolerance for
    // subpixel rounding, which fires constantly and never matters.
    // r.right <= 0 means the element sits ENTIRELY off the left edge, which is
    // the standard way to park a skip link until it takes focus. It cannot widen
    // the document and cannot be seen, so it is not an overflow.
    if ((r.right > vw + 1 || (r.left < -1 && r.right > 0)) && !inScroller(el)) {
      out.overflow.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) })
    }

    // Its own content is wider than it is, with no way to scroll to it.
    // .ui-unit-chart spans are exempt: the coin box is sized in rem ON PURPOSE,
    // decoupled from the glyph's font-size, so that an empty slot's ring and a
    // filled coin stay the same size (see the comment on the rule in index.css).
    // An emoji's advance width is ~1.28em, so at the largest text scale the glyph
    // measures ~2px wider than its 1.6rem box — it overhangs a TRANSPARENT border
    // with overflow visible, so nothing is actually clipped or hidden. Sizing the
    // box to the glyph instead would grow every coin and re-couple the two.
    const coin = el.closest('.ui-unit-chart')
    if (!coin && el.scrollWidth > el.clientWidth + 1 && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
      out.clip.push({ el: describe(el), content: el.scrollWidth, box: el.clientWidth })
    }

    const interactive = el.matches('a[href], button, input, select, textarea, summary, [role="button"]')
    // An inline link inside a paragraph is a phrase, not a target, and padding it
    // to 44px would wreck the text. Only count links that stand alone.
    const inlineLink = el.tagName === 'A' && style.display.startsWith('inline') && el.closest('p, li')
    if (interactive && !inlineLink && (r.height < 43.5 || r.width < 43.5)) {
      out.tap.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height) })
    }

    // Only leaf text nodes, so a big container does not report its child's size.
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (ownText) {
      const px = parseFloat(style.fontSize)
      if (px && px < 12) out.tiny.push({ el: describe(el), px: Math.round(px * 10) / 10 })

      // Measure the TEXT, not the element. el.getClientRects() returns one rect
      // per line box only for inline elements — on a block or flex box it returns
      // a single rect however many lines the text wrapped to, which silently made
      // an earlier version of this check pass on a figure that was visibly split.
      // A Range over the contents reports the line boxes either way. Count
      // distinct tops rather than raw rects, since one line can yield several.
      const own = (el.innerText || '').trim()
      if (FIGURE.test(own)) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
        if (tops.size > 1) out.split.push({ el: describe(el), lines: tops.size })
      }
    }
  }

  const dedupe = (list, n) => {
    const seen = new Set()
    return list.filter((x) => { const k = x.el; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, n)
  }
  out.overflow = dedupe(out.overflow.sort((a, b) => b.right - a.right), 6)
  out.clip = dedupe(out.clip.sort((a, b) => (b.content - b.box) - (a.content - a.box)), 6)
  out.tap = dedupe(out.tap, 8)
  out.tiny = dedupe(out.tiny.sort((a, b) => a.px - b.px), 6)
  out.split = dedupe(out.split, 6)
  return out
})()`

async function main() {
  if (!(await requireServer(APP + '/', 'Start the app first: npm run dev in ./frontend, or the copy --url= names.'))) return
  // Something already answering on the debug port is another mobile-audit, or an
  // Edge a killed run left behind. Ours could not bind the port, browserWsUrl()
  // would attach to that browser, and killOwnEdge() would end it, because it
  // carries the same profile. So this stops before OUT is emptied or Edge starts.
  // A listener that accepts and never answers counts as taken. No
  // process.exit() here: this follows a fetch (see crashExit).
  const taken = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })
    .then(async (res) => { await res.body?.cancel(); return true }, (err) => err.name === 'TimeoutError')
  if (taken) {
    console.error(`mobile-audit: port ${DEBUG_PORT} is already answering: another mobile-audit, or an Edge a killed run left behind. End it by PID (netstat -ano | grep :${DEBUG_PORT}) and run again.`)
    process.exitCode = 2
    return
  }
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--edge-skip-compat-layer-relaunch',
    '--remote-allow-origins=*',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const report = []
  let problems = 0
  let faults = 0

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const vp of VIEWPORTS) {
      // Emulation, not just a window resize: mobile: true is what makes the
      // viewport meta tag apply, and without it every measurement is a desktop
      // measurement in a narrow window.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: true,
      })
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

      await navigate(cdp, APP + '/')
      await waitForRender(cdp)
      await cdp.evaluate(`
        sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify({ v: SEED_VERSION, data: SEED }))});
        localStorage.setItem('sih-language', ${JSON.stringify(vp.lang || 'en')});
        localStorage.setItem('sih-theme', ${JSON.stringify(vp.theme || 'light')});
        localStorage.setItem('sih-textsize', ${JSON.stringify(vp.textsize || 'md')});
        localStorage.removeItem('sih-dialect');
        true;
      `)

      // The blocked /finance load goes last: it re-seeds sessionStorage, and the
      // next width seeds again from the start.
      const loads = [
        ...ROUTES.map((route) => ({ route, state: '' })),
        { route: '/finance', state: 'blocked' },
      ]
      for (const { route, state } of loads) {
        cdp.pageErrors.length = 0
        let missing = []
        let blockError = ''
        if (state === 'blocked') {
          await cdp.evaluate(`sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify({ v: SEED_VERSION, data: BLOCKED_SEED }))}); true`)
        }
        await navigate(cdp, APP + route)
        const filled = await waitForRender(cdp)
        const loadError = await cdp.evaluate(LOAD_ERROR)
        const rendered = filled && !loadError
        await sleep(160)
        // null off the result routes, where there is nothing to check.
        const seeded = RESULT_ROUTES.includes(route) ? await cdp.evaluate(SEEDED) : null
        if (state === 'blocked') {
          blockError = await cdp.evaluate(BLOCK)
          await sleep(160)
        }
        const detailsOpened = await cdp.evaluate(OPEN_DETAILS)
        await sleep(120)
        if (state === 'blocked') {
          const present = await cdp.evaluate(`(${JSON.stringify(BLOCKED_IDS)}).filter((id) => {
            const el = document.getElementById(id)
            if (!el) return false
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0
          })`)
          missing = BLOCKED_IDS.filter((id) => !present.includes(id))
        }

        const probe = await cdp.evaluate(PROBE)
        const sideways = probe.scrollWidth > probe.vw + 1
        const bad = (sideways ? 1 : 0) + probe.tap.length + probe.tiny.length + probe.clip.length + probe.split.length
          + missing.length + (blockError ? 1 : 0)
        if (bad || !rendered || seeded === false || cdp.pageErrors.length) problems++
        // A load that measured nothing of what it names: no page, or a blocked
        // state that never came up.
        if (!rendered || blockError || missing.length) faults++

        const label = `${vp.name}${route.replace(/\//g, '_')}${state ? '-' + state : ''}`
        report.push({ viewport: vp.name, route, state, rendered, loadError, seeded, sideways, detailsOpened, missing, blockError, ...probe, pageErrors: [...cdp.pageErrors] })

        const flags = []
        if (!rendered) flags.push(loadError ? `NOT-RENDERED (${loadError})` : 'NOT-RENDERED')
        if (seeded === false) flags.push('UNSEEDED (the empty state)')
        if (blockError) flags.push(`BLOCK-FAILED (${blockError})`)
        if (missing.length) flags.push(`MISSING ${missing.map((id) => '#' + id).join(' ')}`)
        if (cdp.pageErrors.length) flags.push(`PAGE-ERROR x${cdp.pageErrors.length}`)
        if (sideways) flags.push(`OVERFLOW +${probe.scrollWidth - probe.vw}px`)
        if (probe.clip.length) flags.push(`CLIP x${probe.clip.length}`)
        if (probe.tap.length) flags.push(`TAP x${probe.tap.length}`)
        if (probe.tiny.length) flags.push(`TINY x${probe.tiny.length}`)
        if (probe.split.length) flags.push(`SPLIT-FIGURE x${probe.split.length}`)
        console.log(`${flags.length ? 'FAIL' : 'ok  '}  ${label.padEnd(26)} ${flags.join('  ')}`)

        for (const o of probe.overflow) console.log(`        overflow right=${o.right} w=${o.width}  ${o.el}`)
        for (const c of probe.clip) console.log(`        clip content=${c.content} box=${c.box}  ${c.el}`)
        for (const t of probe.tap) console.log(`        tap ${t.w}x${t.h}  ${t.el}`)
        for (const t of probe.tiny) console.log(`        tiny ${t.px}px  ${t.el}`)
        for (const s of probe.split) console.log(`        split-figure over ${s.lines} lines  ${s.el}`)

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        writeFileSync(`${OUT}/${label}.png`, Buffer.from(shot.data, 'base64'))
      }
    }
  } finally {
    killOwnEdge()
  }

  // A result page measured on its empty state is not a layout problem, and nor
  // is a page that never rendered or a blocked state that never came up: the run
  // did not measure what it names, so it exits 2, not 1.
  const unseeded = report.filter((r) => r.seeded === false).length
  const exit = unseeded || faults ? 2 : problems ? 1 : 0
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit, report }, null, 2))
  console.log(`\n${report.length} page loads across ${VIEWPORTS.length} phone widths, ${problems} with problems.`)
  console.log(`Screenshots and report.json in ${OUT}`)
  if (unseeded) console.log(`${unseeded} result-page load(s) showed the empty state: the seed was not read. The run is incomplete.`)
  if (faults) console.log(`${faults} load(s) were NOT-RENDERED, BLOCK-FAILED or MISSING: they measured nothing. The run is incomplete.`)
  process.exit(exit)
}

main().catch((err) => {
  console.error('MOBILE AUDIT ERROR:', err.message)
  killOwnEdge()
  crashExit()
})

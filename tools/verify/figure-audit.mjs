// Figure audit. Same zero-dependency CDP plumbing as mobile-audit.mjs. It fills
// /analysis and /report with the real backend's answers to the most extreme
// inputs the form accepts, and checks every standalone amount and percentage at
// every width and text size. A figure has to stay on one line, inside its box,
// and big enough to read.
//
// What it reports:
//
//   SPLIT     a figure broken across two line boxes. "₹1,00,00,00,000" split as
//             "₹1,00,00,00,0" and "00" reads as a different number.
//   OVER      a figure running out of the box it sits in, out of its card, or off
//             the screen. That is what a figure kept on one line does instead of
//             splitting if nothing makes it fit.
//   TINY      a figure under 12px, the floor mobile-audit holds all text to. It is
//             what shrinking to fit does if it goes too far.
//   SIDEWAYS  the page scrolls sideways.
//   PAGE-ERROR an uncaught exception on a page that mounted. Each one counts
//             once, at the first width probed after it arrived (one thrown
//             while the page loaded at the first width, one after the last
//             probe at the last), and its first line is printed.
//
// Why it exists. Measured 29 Sept 2026: the form accepts up to ₹100 crore, and at
// that size figures on the result pages broke mid-number in 26 of 432
// measurements. At the largest text size the monthly figure at the top of
// /analysis broke on a 360px phone, and three tiles broke at 1024 and 1100px:
// the funding gap on /analysis and the margin on both pages. The margin on
// /analysis also broke at 640px and at every width above 1100 at that size, and
// at 1024px at every size. No other gate saw them. mobile-audit looks
// for split figures, but only at phone widths, only on the ordinary answers in
// case_good.json, and until that day only for a positive amount.
// The fix is <Figure> (frontend/src/components/Figure.jsx) and .ui-figure in
// index.css: the figure stays on one line and shrinks when it would not fit.
//
// The cases are form answers, mapped to a request the way FinancePage.jsx maps
// them. The same answers are seeded with the response, because /report prints
// some of them (the EMI, the old debt) from the tab and not from the response.
// Each case names the figures it exists to produce; a load without them is
// MISSING, because it no longer tests what it was written for.
//
// Every <details> is opened before a page is measured. A closed one paints
// nothing, so a figure inside it has no line boxes to measure. The "detailed
// figures" disclosure on /report holds the longest percentage there is.
//
// /advisory and /schemes print no standalone figure, so they are not loaded. A
// probe of all four result pages on 29 Sept 2026 found 3,816 figures, every one
// of them on /analysis or /report.
//
// Needs the backend on 127.0.0.1:8000 and the Vite dev server, then:
//   node tools/verify/figure-audit.mjs
//
// --url=http://localhost:5181   audit another copy of the app
// --broken[=split|over|tiny]    undo the fix in the page, to prove the checks
//                               fire. The run must then exit 1.
//                               split (the default): the figures wrap at full size
//                                 again, as before the fix. Every case in
//                                 MUST_SPLIT has to report a SPLIT.
//                               over: they stay on one line and stop shrinking.
//                                 Every case in MUST_SPLIT has to report an OVER.
//                               tiny: they are forced to 9px. Every load has to
//                                 report a TINY.
//                               A refuter that does not fire where it has to exits
//                               2 and names the case or load it missed.
//
// Exit codes: 0 clean; 1 findings (the expected result under --broken); 2 the run
// did not measure what it names: the dev server or the backend was down, the
// working directory was wrong, --broken= named a refuter it does not have (or
// none), the backend refused a case, a navigation failed (the server gone
// mid-run), Edge or its DevTools socket went away, a page did not mount (even
// one that threw: its error is printed, but it measured nothing), a result page
// showed its empty state, a case's figures were missing, a refuter missed, the
// script crashed, or the run ended before its verdict. report.json carries the
// same code as `exit`; a crash, a failed navigation, a lost Edge, or a run that
// never started leaves none.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9375
const API = 'http://127.0.0.1:8000/api/analysis/run'
const ARGS = process.argv.slice(2)
const argValue = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const APP = (argValue('url') || 'http://localhost:5173').replace(/\/+$/, '')
// By the flag's presence, not its value: a bare --broken is split, and a
// --broken= with nothing after it is a name like any other, refused below
// rather than run as a plain run.
const BROKEN_ARG = ARGS.find((a) => a === '--broken' || a.startsWith('--broken='))
const BROKEN = !BROKEN_ARG ? '' : BROKEN_ARG === '--broken' ? 'split' : BROKEN_ARG.slice('--broken='.length)
const REFUTERS = {
  // Before the fix: the figure wraps, at the size of the line it sits in.
  split: '.ui-figure { white-space: normal !important; font-size: inherit !important }',
  // Kept on one line, but no longer shrunk to fit.
  over: '.ui-figure { font-size: inherit !important }',
  // Shrunk far past the floor.
  tiny: '.ui-figure { font-size: 9px !important }',
}
const OUT = resolve('screenshots/verify/figures')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-figures')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Our Edge dies by PID and nothing else, never by image name, which would close
// the Edge the person running the gate has open. Same technique as
// mobile-audit.mjs, which explains it: the spawned PID can be gone before we
// kill it, so the browser process carrying OUR profile path is found and killed
// with its children.
let edge = null
function ownEdgePids() {
  const script =
    "$p = [regex]::Escape($env:FIGURE_EDGE_PROFILE) + '(?=[\"\\s]|$)'; " +
    "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -and " +
    "$_.CommandLine -match $p -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.ProcessId }"
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, FIGURE_EDGE_PROFILE: PROFILE_DIR },
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

// 0 means the run measured and found nothing, 1 a finding (under --broken, the
// refuter fired), and 2 that the run could not measure. Node's own exit on an
// uncaught error is 1, which reads as a finding and under --broken as the pass,
// so anything thrown or rejected that nothing catches exits 2 instead. The
// notice import below is one: from the wrong directory it rejects.
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
// A run that ends without reaching its verdict exits 2; the verdict overrides
// this. Before it, a CDP socket that closed under a pending send left the send
// unsettled, the event loop drained, and node exited 0 with no report.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/figure-audit.mjs'))) {
  console.error(`figure-audit: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/figure-audit.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's
// goes once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, 'report.json'), { force: true })
// After the delete, so a mistyped --broken= cannot leave the last run's clean
// report standing as this run's. Own keys only: a name REFUTERS inherits, such
// as constructor, planted nothing and then exited 1, the pass.
if (BROKEN_ARG && !Object.hasOwn(REFUTERS, BROKEN)) {
  console.error(`--broken= takes ${Object.keys(REFUTERS).join(', ')}, not ${JSON.stringify(BROKEN)}`)
  process.exit(2)
}

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
    console.error(`figure-audit: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`figure-audit: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// The notice version the page sends is the one in the app's own module, as in
// refresh-cases.mjs.
const { NOTICE_VERSION } = await import(pathToFileURL(resolve('frontend/src/config/notice.js')).href)

// ₹100 crore, MAX_RUPEES in frontend/src/data/limits.js: the most any answer can be.
const MAX = '1000000000'
const PROFILE = { name: 'Lakshmi Devi', language: 'English', dialect: '' }
const LOCATION = {
  village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
  locationType: 'rural', marketType: ['village'], customers: '',
}
const business = (answers) => ({ businessName: 'Lakshmi Tailors', category: 'tailoring', categoryOther: '', existingDebt: 0, ...answers })

// The number fields take whole rupees only (no step on the inputs, so the
// browser refuses a decimal), and 1 is the smallest answer above 0. So these
// are the longest figures a real submit can put on the page.
const CASES = {
  // The longest positive amounts: ₹100 crore of profit and a ₹100 crore gap.
  big: {
    business: business({ initialInvestment: MAX, monthlyRevenue: MAX, monthlyOperatingExpenses: '0' }),
    finance: { availableCapital: '0', monthlyExpenses: '0', monthlyEmi: '0', householdIncome: '' },
    expect: ['₹1,00,00,00,000'],
  },
  // The longest negative percentage: a margin on ₹1 of revenue against ₹100 crore
  // of costs. And the household share of a ₹1 income paying ₹100 crore of EMI,
  // plus the new loan's EMI.
  loss: {
    business: business({ initialInvestment: MAX, monthlyRevenue: '1', monthlyOperatingExpenses: MAX, existingDebt: MAX }),
    finance: { availableCapital: '0', monthlyExpenses: MAX, monthlyEmi: MAX, householdIncome: '1' },
    expect: ['-99,99,99,99,900%', '1,02,22,44,44,800%'],
  },
  // The longest negative amount: no revenue at all, -₹1,00,00,00,000 a month.
  zero: {
    business: business({ initialInvestment: MAX, monthlyRevenue: '0', monthlyOperatingExpenses: MAX }),
    finance: { availableCapital: '0', monthlyExpenses: MAX, monthlyEmi: MAX, householdIncome: '0' },
    expect: ['-₹1,00,00,00,000'],
  },
  // The longest figure of all: the yearly return on a ₹1 investment, 19
  // characters. /report prints it inside the "detailed figures" disclosure.
  ratio: {
    business: business({ initialInvestment: '1', monthlyRevenue: MAX, monthlyOperatingExpenses: '1' }),
    finance: { availableCapital: '1', monthlyExpenses: '1', monthlyEmi: '999999998', householdIncome: '1' },
    expect: ['11,99,99,99,98,800%'],
  },
}
// The cases whose figures broke before the fix, or would: each has to fire under
// --broken=split and --broken=over. ratio does not. Its longest figures sit in
// rows that already had room for them, so they cannot prove a refuter works.
const MUST_SPLIT = ['big', 'loss', 'zero']

// What FinancePage.jsx sends for these answers, and the consent record it adds
// once its box is ticked. Keep this in step with the payload there.
function request(form) {
  const { business: b, finance: f } = form
  const householdIncome = String(f.householdIncome ?? '').trim()
  return {
    business_category: b.category === 'other' ? String(b.categoryOther || '').trim() : b.category,
    state: LOCATION.state,
    district: LOCATION.district || '',
    available_capital: Number(f.availableCapital) || 0,
    monthly_expenses: Number(f.monthlyExpenses) || 0,
    expected_monthly_revenue: Number(b.monthlyRevenue) || 0,
    monthly_emi: Number(f.monthlyEmi) || 0,
    // Blank is null, never 0: 0 is a household with no income at all.
    household_monthly_income: householdIncome === '' ? null : Number(householdIncome),
    initial_investment: Number(b.initialInvestment) || 0,
    monthly_operating_expenses: Number(b.monthlyOperatingExpenses) || 0,
    existing_debt: Number(b.existingDebt) || 0,
    location_type: LOCATION.locationType || 'rural',
    consent: { notice_version: NOTICE_VERSION, language: 'en', given_at: new Date().toISOString(), age_confirmed: null },
  }
}

// AppContext silently discards a payload whose v is not in its
// READABLE_VERSIONS, and every result page then shows its empty state. The
// sections below are version 4 sections, so this refuses to start once
// AppContext stops reading 4. Same guard as mobile-audit.mjs.
const SEED_VERSION = 4
{
  const file = 'frontend/src/context/AppContext.jsx'
  const m = readFileSync(resolve(file), 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `figure-audit: ${file} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite the seed in the current shape and raise SEED_VERSION.`
      : `figure-audit: READABLE_VERSIONS not found in ${file}; update the parse in figure-audit.mjs.`)
    process.exit(2)
  }
}

// The looks: the largest text size in English and in Hindi (whose labels are
// longer, and take room from the figures beside them), and the other two sizes.
// Digits are Latin in every language, so one other language would add nothing.
const LOOKS = [
  { name: 'en-md', lang: 'en', textsize: 'md' },
  { name: 'en-lg', lang: 'en', textsize: 'lg' },
  { name: 'hi-lg', lang: 'hi', textsize: 'lg' },
  { name: 'en-sm', lang: 'en', textsize: 'sm' },
]
const ROUTES = ['/analysis', '/report']
// Phones, then each side of the breakpoints the result pages change layout at:
// 640 (one column below, three above in the detail grid) and 1024 (the monthly
// figure's box leaves its own line for a column beside the summary). A grid
// cell is narrowest just past the width that adds a column.
const WIDTHS = [360, 412, 640, 641, 768, 800, 1023, 1024, 1100, 1280, 1440]

// A result page has to show the seeded result. The app writes its state back
// to sessionStorage once it has mounted, so a seed it discarded reads back with
// no result.
const SEEDED = `(() => {
  try { return !!JSON.parse(sessionStorage.getItem('sih-application')).data.result } catch { return false }
})()`

const OPEN_DETAILS = `(() => {
  const all = [...document.querySelectorAll('details')]
  for (const d of all) d.open = true
  return all.length
})()`

// --- minimal CDP client, session-aware (as in mobile-audit.mjs) ---------------
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

    // Edge gone: every call still waiting for its reply fails now. Nothing else
    // would ever settle it.
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
    // A frame sent on a socket that is not open is dropped without an error, so
    // its reply would never come.
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
    // A page mid-navigation can refuse an evaluate, which only means not yet. A
    // closed socket means Edge is gone, and polling on would hide that.
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`)
      .catch((err) => { if (cdp.closed) throw err; return 0 })
    if (len > 40) return true
    await sleep(120)
  }
  return false
}

// Runs in the page. A figure is an element whose own text is one whole amount
// or percentage and nothing else, as in mobile-audit's SPLIT-FIGURE, and whose
// visible text is that too, so a label that merely holds a figure is not one.
// Measured from the text's line boxes: a Range reports one rect per line for
// an inline and a block alike, where the element's own rects do not.
const PROBE = `(() => {
  const FIGURE = /^-?₹\\s?[\\d,]+(\\.\\d+)?$|^-?[\\d,]+(\\.\\d+)?%$/
  const doc = document.documentElement
  const vw = doc.clientWidth
  const out = { vw, scrollWidth: doc.scrollWidth, texts: [], split: [], over: [], tiny: [], shrunk: [] }
  const describe = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 4).join('.') : ''
    return el.tagName.toLowerCase() + cls
  }
  // Content scrolled out of a horizontal scroller is not overflow.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    return false
  }
  // The content box of an element, in viewport coordinates.
  const contentBox = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      left: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
      right: r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight),
    }
  }
  for (const el of document.querySelectorAll('#main *')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!own || !FIGURE.test(own) || (el.innerText || '').trim() !== own) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('.sr-only, details:not([open])')) continue
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.1 && r.height > 0.1)
    if (!rects.length) continue
    out.texts.push(own)
    const px = parseFloat(cs.fontSize)
    const at = { el: describe(el), text: own, px: Math.round(px * 100) / 100 }

    const lines = new Set(rects.map((r) => Math.round(r.top))).size
    if (lines > 1) out.split.push({ ...at, lines })

    // The boxes the text has to stay inside: the element's own box, or the
    // nearest box around it if it is an inline; the card; the screen.
    if (!inScroller(el)) {
      const left = Math.min(...rects.map((r) => r.left))
      const right = Math.max(...rects.map((r) => r.right))
      let box = el
      while (box.parentElement && getComputedStyle(box).display === 'inline') box = box.parentElement
      const limits = [['box', contentBox(box)], ['screen', { left: 0, right: vw }]]
      const card = el.closest('.ui-card, .ui-card-soft')
      if (card) limits.push(['card', contentBox(card)])
      for (const [name, lim] of limits) {
        const past = Math.max(right - lim.right, lim.left - left)
        if (past > 0.5) { out.over.push({ ...at, past: Math.round(past * 10) / 10, of: name }); break }
      }
    }

    if (px < 12) out.tiny.push(at)
    if (el.classList.contains('ui-figure')) {
      const parentPx = parseFloat(getComputedStyle(el.parentElement).fontSize)
      if (px < parentPx - 0.05) out.shrunk.push({ ...at, parentPx: Math.round(parentPx * 100) / 100 })
    }
  }
  return out
})()`

// null, with exitCode 2 set, when a case cannot be fetched: main() returns
// before Edge starts, as it does when requireServer fails.
async function fetchCases() {
  const results = {}
  for (const [name, form] of Object.entries(CASES)) {
    let res
    try {
      // 20 s, the app's own limit in api.js. The signal covers the body reads
      // below too, so a backend that stalls mid-answer cannot hold the run.
      res = await fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request(form)),
        signal: AbortSignal.timeout(20000),
      })
    } catch (err) {
      console.error(`figure-audit: the backend is not answering at ${API} (${err.cause?.code || err.message}). Start it first.`)
      process.exitCode = 2
      return null
    }
    if (!res.ok) {
      console.error(`figure-audit: case ${name}: HTTP ${res.status} ${await res.text()}`)
      process.exitCode = 2
      return null
    }
    results[name] = await res.json()
  }
  return results
}

async function main() {
  if (!(await requireServer(APP + '/', 'Start the app first: npm run dev in ./frontend, or the copy --url= names.'))) return
  const results = await fetchCases()
  if (!results) return
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
  const faults = []
  let shots = 0

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    let script = null
    for (const [name, form] of Object.entries(CASES)) {
      const payload = JSON.stringify({ v: SEED_VERSION, data: { profile: PROFILE, business: form.business, location: LOCATION, finance: form.finance, result: results[name] } })
      for (const look of LOOKS) {
        // Before the app's own code runs, on every load, so it hydrates from
        // the seed and in the look.
        if (script) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: script })
        ;({ identifier: script } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
          source: `try {
            sessionStorage.setItem('sih-application', ${JSON.stringify(payload)});
            localStorage.setItem('sih-language', ${JSON.stringify(look.lang)});
            localStorage.setItem('sih-theme', 'light');
            localStorage.setItem('sih-textsize', ${JSON.stringify(look.textsize)});
            localStorage.removeItem('sih-dialect');
          } catch {}`,
        }))

        for (const route of ROUTES) {
          // Loaded once at the first width, then resized: the layout is CSS
          // alone, so a resize lays it out as a load at that width would.
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: 900, deviceScaleFactor: 1, mobile: true })
          cdp.pageErrors.length = 0
          // A navigation that failed (the dev server gone mid-run) commits Edge's
          // own error page, which is not the app. The run stops here, as a crash.
          const { errorText } = await cdp.send('Page.navigate', { url: APP + route })
          if (errorText) throw new Error(`${APP + route} did not load (${errorText}); is the dev server still up?`)
          const rendered = await waitForRender(cdp)
          await sleep(200)
          const seeded = await cdp.evaluate(SEEDED)
          const detailsOpened = await cdp.evaluate(OPEN_DETAILS)
          if (BROKEN) {
            await cdp.evaluate(`(() => {
              const style = document.createElement('style')
              style.textContent = ${JSON.stringify(REFUTERS[BROKEN])}
              document.head.append(style)
              return true
            })()`)
          }
          const label = `${name.padEnd(5)} ${look.name} ${route}`
          // A fault even when the page threw: it measured nothing. The error is
          // named here, and printed as PAGE-ERROR below.
          const threw = cdp.pageErrors.length ? ` (the page threw: ${cdp.pageErrors[0].split('\n')[0]})` : ''
          if (!rendered) faults.push(`${label}: NOT-MOUNTED${threw}`)
          if (!seeded) faults.push(`${label}: UNSEEDED (the empty state)`)

          // Each page error goes in one row: the first probed after it arrived.
          // The list was emptied before this load, so the first row takes any
          // thrown while the page loaded. A copy of the whole list in every row
          // counted one error once for each width left.
          let errorsSeen = 0
          const rows = []
          for (const width of WIDTHS) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 })
            await sleep(120)
            const probe = await cdp.evaluate(PROBE)
            const missing = form.expect.filter((text) => !probe.texts.includes(text))
            if (missing.length) faults.push(`${label} ${width}: MISSING ${missing.join(' ')}`)
            const sideways = probe.scrollWidth > probe.vw + 1
            const pageErrors = cdp.pageErrors.slice(errorsSeen)
            errorsSeen = cdp.pageErrors.length
            const row = { case: name, look: look.name, route, width, rendered, seeded, detailsOpened, missing, sideways, ...probe, pageErrors }
            row.findings = probe.split.length + probe.over.length + probe.tiny.length + (sideways ? 1 : 0) + pageErrors.length
            rows.push(row)
            report.push(row)
            if (row.findings && shots < 12) {
              shots++
              const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
              writeFileSync(`${OUT}/${name}-${look.name}${route.replace(/\//g, '_')}-${width}.png`, Buffer.from(shot.data, 'base64'))
            }
          }
          // An error that arrived after the last probe, during its screenshot
          // (taken only when the row already has a finding), is this load's too,
          // and goes in the last row (report holds the same object). Left out, it
          // was missing from the count and the listing.
          const late = cdp.pageErrors.slice(errorsSeen)
          if (late.length) {
            rows.at(-1).pageErrors.push(...late)
            rows.at(-1).findings += late.length
          }

          // One line per case, look and route, then each finding once, with the
          // widths it was found at.
          const bad = rows.filter((r) => r.findings)
          const shrunk = rows.flatMap((r) => r.shrunk)
          const minPx = shrunk.length ? Math.min(...shrunk.map((s) => s.px)) : null
          const counts = ['split', 'over', 'tiny'].map((k) => [k, rows.reduce((n, r) => n + r[k].length, 0)]).filter(([, n]) => n)
          const sidewaysAt = rows.filter((r) => r.sideways).map((r) => r.width)
          const errors = cdp.pageErrors.length
          const flags = [
            ...counts.map(([k, n]) => `${k.toUpperCase()} x${n}`),
            ...(sidewaysAt.length ? [`SIDEWAYS at ${sidewaysAt.join(',')}`] : []),
            ...(errors ? [`PAGE-ERROR x${errors}`] : []),
          ]
          const figures = new Set(rows.flatMap((r) => r.texts)).size
          console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${label.padEnd(24)} ${figures} figures, ${shrunk.length ? `shrunk ${shrunk.length}x, smallest ${minPx}px` : 'none shrunk'}  ${flags.join('  ')}`)
          const seen = new Map()
          for (const r of rows) {
            for (const kind of ['split', 'over', 'tiny']) {
              for (const f of r[kind]) {
                const key = `${kind} ${f.text} ${f.el}${f.of ? ' of ' + f.of : ''}`
                if (!seen.has(key)) seen.set(key, [])
                seen.get(key).push(r.width)
              }
            }
            // A page error by its first line, at the width of the row that holds it.
            for (const e of r.pageErrors) {
              const key = `page-error ${e.split('\n')[0].slice(0, 200)}`
              if (!seen.has(key)) seen.set(key, [])
              seen.get(key).push(r.width)
            }
          }
          for (const [key, widths] of seen) console.log(`        ${key}  at ${widths.join(',')}`)
        }
      }
    }
  } finally {
    killOwnEdge()
  }

  const loads = new Set(report.map((r) => `${r.case} ${r.look} ${r.route}`)).size
  const bad = report.filter((r) => r.findings).length

  // Each refuter has to fire where the defect it plants must show.
  const misses = []
  if (BROKEN === 'tiny') {
    const byLoad = new Map()
    for (const r of report) {
      const key = `${r.case} ${r.look} ${r.route}`
      byLoad.set(key, (byLoad.get(key) || 0) + r.tiny.length)
    }
    for (const [key, n] of byLoad) if (!n) misses.push(key)
  } else if (BROKEN) {
    for (const name of MUST_SPLIT) {
      if (!report.some((r) => r.case === name && r[BROKEN].length)) misses.push(name)
    }
  }
  const exit = faults.length || misses.length ? 2 : BROKEN || bad ? 1 : 0
  // Written after the verdict, and with it, so a report on disk never reads as a
  // pass for a run that could not measure.
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit, report }, null, 2))

  console.log(`\n${report.length} measurements (${loads} page loads x ${WIDTHS.length} widths), ${bad} with findings.`)
  console.log(`report.json${shots ? ` and ${shots} screenshot(s)` : ''} in ${OUT}`)

  if (faults.length) {
    console.log(`\n${faults.length} instrument fault(s); the run did not measure what it names:`)
    for (const f of faults.slice(0, 20)) console.log('  ' + f)
    if (faults.length > 20) console.log(`  ... and ${faults.length - 20} more in the lines above`)
  } else if (misses.length) {
    console.log(`\n--broken=${BROKEN} did not report ${BROKEN.toUpperCase()} on: ${misses.join('; ')}. The check is inert there.`)
  } else if (BROKEN) {
    console.log(`\n--broken=${BROKEN}: the planted defect was reported ${BROKEN === 'tiny' ? 'on every load' : `in every case of ${MUST_SPLIT.join(', ')}`}.`)
  }
  process.exit(exit)
}

main().catch((err) => {
  console.error('FIGURE AUDIT ERROR:', err.message)
  killOwnEdge()
  crashExit()
})

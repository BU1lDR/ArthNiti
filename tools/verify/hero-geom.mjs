// Where does the hero backdrop's edge sit relative to the content that sits on
// it? The report was that the "Start my journey" button's left edge lands exactly
// on the artwork's left edge, and that the artwork's own edges read as a hard
// crop rather than a panel.
//
// Neither question can be answered from index.css. `.ui-hero::before` is pinned
// to `inset: 0`, so the artwork's box IS the section's border box — and the
// section has vertical padding (py-8 / lg:py-14) but NO horizontal padding, so
// the inset is ~56px at the top and 0px at the sides by construction. That much
// is readable. What is not readable is where each child actually lands once the
// grid, `items-center` and `min-h` have had their say, and how the radius reads
// against the size of the panel.
//
// So this measures, per width: the ::before box, the section box, the page
// container, and every hero child's gap to each of the four artwork edges.
//
// Run the Vite dev server first, then: node tools/verify/hero-geom.mjs
// A report, not a gate: it exits 0 once it has measured every case, and 2 when
// it could not: the dev server is down or went away mid-run (a navigation
// failed, or landed on Edge's error page or an error status), the working
// directory is wrong, the landing page is missing an element this measures (the
// hero's ::before artwork included) or renders one with no box, Edge never
// opened its DevTools port or the socket closed, the run ended short of its
// report, or the script crashed. It has no findings, so it never exits 1. A run
// that exits 2 leaves no report.json, so the one on disk always reads exit 0.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9355
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/hero-geom')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-geom')

// Node's own exit on an uncaught error is 1, which elsewhere in tools/verify
// means a finding, so anything thrown or rejected that nothing catches exits 2
// instead. main() has no catch, so this is also its crash path.
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
// A run that ends without writing its report exits 2. Before this, a CDP
// socket that closed under a pending send left that send unsettled, the event
// loop drained, and node exited 0 with no report. The exit at the end of main()
// overrides it.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/hero-geom.mjs'))) {
  console.error(`hero-geom: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/hero-geom.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's
// goes once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, 'report.json'), { force: true })

// A server that is down used to surface as a crash inside the page (Edge's own
// error page refuses storage access).
// It returns false with exitCode 2 set, and main() returns before Edge starts,
// so node exits on its own: process.exit() this soon after a fetch can abort
// it (see crashExit).
async function requireServer(url, start) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    await res.body?.cancel()
    if (res.ok) return true
    console.error(`hero-geom: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`hero-geom: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed before it opened')))
    })
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
    // Edge gone closes the socket, and a reply still pending will never come. It
    // has to fail: a pending promise does not keep node alive, so the run would
    // stop short of its report without a word.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
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

// Page.navigate answers with errorText when the load failed outright, for
// example with the connection refused because the dev server has gone. That is
// a run that cannot measure, so it throws, and the crash path exits 2.
async function navigate(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`navigating to ${url} failed: ${errorText}`)
}

// Read once the page has had time to load. Edge's own error page, or a
// navigation entry with a non-2xx status, is a page that did not render the app,
// so it throws as well. A status of 0 means the browser does not know it.
const NOT_RENDERED = `(() => {
  if (location.protocol === 'chrome-error:') return 'Edge showed its own error page'
  const status = performance.getEntriesByType('navigation')[0]?.responseStatus
  return status && (status < 200 || status > 299) ? 'the server answered HTTP ' + status : ''
})()`

async function requireRendered(cdp, url) {
  const why = await cdp.evaluate(NOT_RENDERED)
  if (why) throw new Error(`${url} did not render: ${why}`)
}

// A pseudo-element has no node, so its box cannot be measured with
// getBoundingClientRect. But `inset` resolves to used px in getComputedStyle, and
// the offsets are relative to the host's padding box — which for a `position:
// relative` host with no border is the border box. So the artwork's rect is
// derivable from the host's rect plus the four resolved insets, and that stays
// correct if the insets stop being 0.
const PROBE = [
  '(() => {',
  '  const hero = document.querySelector(".ui-hero")',
  '  if (!hero) throw new Error("no .ui-hero")',
  '  const hr = hero.getBoundingClientRect()',
  // A hero with no box would put every gap below against a zero-size artwork.
  '  if (!(hr.width > 0 && hr.height > 0)) throw new Error(".ui-hero has no box")',
  '  const cs = getComputedStyle(hero, "::before")',
  '  const num = (v) => (v === "auto" ? 0 : parseFloat(v) || 0)',
  '  const art = {',
  '    left: hr.left + num(cs.left),',
  '    top: hr.top + num(cs.top),',
  '    right: hr.right - num(cs.right),',
  '    bottom: hr.bottom - num(cs.bottom),',
  '  }',
  '  art.width = art.right - art.left',
  '  art.height = art.bottom - art.top',
  // getComputedStyle answers for a ::before that is not generated too, so the
  // artwork would silently measure as a box nothing paints.
  '  if (cs.content === "none" || cs.content === "normal") throw new Error(".ui-hero::before is not generated")',
  '  if (!(art.width > 0 && art.height > 0)) throw new Error(".ui-hero::before has no box")',
  '',
  // A missing .ui-main used to print as "left undefined" and record null.
  '  const main = document.querySelector(".ui-main")',
  '  if (!main) throw new Error("no .ui-main")',
  '  const mr = main.getBoundingClientRect()',
  '',
  // Every element that carries visible hero content, plus the two columns. The
  // gap that matters is to the artwork edge, not to the section edge.
  //
  // One that is missing, or has no box, is a page that did not render what this
  // measures, so it throws. It used to be skipped, and the report went on
  // without that row and gave no sign of it.
  '  const targets = []',
  '  const add = (sel, label) => {',
  '    const el = document.querySelector(sel)',
  '    if (!el) throw new Error(label + ": nothing matches " + sel)',
  '    const r = el.getBoundingClientRect()',
  '    if (!(r.width > 0 && r.height > 0)) throw new Error(label + ": " + sel + " has no box")',
  '    targets.push({',
  '      label,',
  '      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],',
  '      gapLeft: Math.round((r.left - art.left) * 10) / 10,',
  '      gapRight: Math.round((art.right - r.right) * 10) / 10,',
  '      gapTop: Math.round((r.top - art.top) * 10) / 10,',
  '      gapBottom: Math.round((art.bottom - r.bottom) * 10) / 10,',
  '    })',
  '  }',
  '  add(".ui-hero > div:first-child", "left column")',
  '  add(".ui-hero .ui-eyebrow", "eyebrow chip")',
  '  add(".ui-hero .ui-page-title", "h1")',
  '  add(".ui-hero .ui-page-subtitle", "subtitle")',
  '  add(".ui-hero a[href=\\"/profile\\"], .ui-hero a[href$=\\"/profile\\"]", "Start my journey")',
  '  add(".ui-hero a[href=\\"#how-it-works\\"]", "What we offer")',
  '  add(".ui-hero .ui-card", "right card")',
  '',
  '  const heroStyle = getComputedStyle(hero)',
  '  return {',
  '    viewport: innerWidth + "x" + innerHeight,',
  '    docScrollW: document.documentElement.scrollWidth,',
  '    docClientW: document.documentElement.clientWidth,',
  '    mainBox: [Math.round(mr.left), Math.round(mr.width)],',
  '    heroBox: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)],',
  '    heroPadding: heroStyle.paddingTop + " " + heroStyle.paddingRight + " " + heroStyle.paddingBottom + " " + heroStyle.paddingLeft,',
  '    artInset: cs.top + " " + cs.right + " " + cs.bottom + " " + cs.left,',
  '    artBox: [Math.round(art.left), Math.round(art.top), Math.round(art.width), Math.round(art.height)],',
  '    artRadius: cs.borderRadius,',
  '    artRadiusPx: Math.round(parseFloat(cs.borderTopLeftRadius) * 10) / 10,',
  '    radiusVsWidth: Math.round((parseFloat(cs.borderTopLeftRadius) / art.width) * 10000) / 100 + "% of the panel width",',
  '    targets,',
  '  }',
  '})()',
].join('\n')

const CASES = [
  { name: 'desktop-1440', width: 1440, height: 900, theme: 'dark', lang: 'en' },
  { name: 'desktop-1280', width: 1280, height: 860, theme: 'light', lang: 'en' },
  { name: 'laptop-1024', width: 1024, height: 800, theme: 'light', lang: 'en' },
  { name: 'tablet-800', width: 800, height: 900, theme: 'light', lang: 'en' },
  { name: 'phone-390', width: 390, height: 844, theme: 'light', lang: 'en', mobile: true },
  { name: 'phone-360-hi', width: 360, height: 800, theme: 'dark', lang: 'hi', mobile: true },
]

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

  const report = []
  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const kase of CASES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: kase.width, height: kase.height, deviceScaleFactor: 1, mobile: Boolean(kase.mobile),
      })
      await navigate(cdp, APP + '/')
      await sleep(900)
      await requireRendered(cdp, APP + '/')
      await cdp.evaluate([
        `localStorage.setItem('sih-theme', '${kase.theme}');`,
        `localStorage.setItem('sih-language', '${kase.lang}');`,
        `localStorage.setItem('sih-textsize', 'md');`,
        `localStorage.removeItem('sih-dialect');`,
        'true',
      ].join(''))
      await navigate(cdp, APP + '/')
      await sleep(1300)
      await requireRendered(cdp, APP + '/')

      const m = await cdp.evaluate(PROBE)
      console.log(`\n=== ${kase.name}  (${m.viewport})`)
      console.log(`    .ui-main            left ${m.mainBox[0]}  width ${m.mainBox[1]}`)
      console.log(`    .ui-hero box        ${m.heroBox.join(', ')}   padding ${m.heroPadding}`)
      console.log(`    ::before inset      ${m.artInset}`)
      console.log(`    artwork box         ${m.artBox.join(', ')}`)
      console.log(`    artwork radius      ${m.artRadius}  = ${m.artRadiusPx}px, ${m.radiusVsWidth}`)
      console.log(`    doc scrollW/clientW ${m.docScrollW} / ${m.docClientW}`)
      console.log(`    gaps from each child to the artwork edge (L / R / T / B):`)
      for (const t of m.targets) {
        console.log(`      ${t.label.padEnd(18)} ${String(t.gapLeft).padStart(7)} ${String(t.gapRight).padStart(7)} ${String(t.gapTop).padStart(7)} ${String(t.gapBottom).padStart(7)}`)
      }
      report.push({ ...kase, measured: m })

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      writeFileSync(`${OUT}/${kase.name}.png`, Buffer.from(shot.data, 'base64'))
    }
  } finally {
    edge.kill()
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit: 0, report }, null, 2))
  console.log(`\nreport.json and screenshots in ${OUT}`)
  // Explicit, or node waits: edge.kill() misses the browser Edge relaunches
  // itself as, and that browser's open DevTools socket keeps the loop alive. The
  // last fetch() was long before this, so exiting here is safe (see crashExit).
  process.exit(0)
}

main()

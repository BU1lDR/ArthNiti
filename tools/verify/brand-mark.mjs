// The brand mark has to survive both themes, and neither can be checked by
// reading index.css: every --mark-* value is a token, [data-theme="dark"]
// overrides one of them (--mark-edge), and what reaches the screen is the
// composite over whatever surface the mark sits on. A single wrong value gives a
// deep-plum hairline that vanishes against a navy masthead: invisible, and
// lint/build/parity all pass.
//
// It checked four combinations until 8 September 2026 — the two above plus light
// and dark high-contrast. High contrast collapsed all ten --mark-* tokens to
// `var(--color-btn)` over `var(--color-bg)`, which was the case worstEdge below
// was written for. The mode was removed from the app, so the modes went with it;
// worstEdge stays, because the petals overlap in colour too.
//
// So this measures the painted result. For each mode it rasterises the mark at
// 8x into a canvas over the surface colour it actually sits on, then reports:
//
//   * pctInk     — how much of the mark's box is perceptibly not the background.
//                  A mark that resolved to background-on-background reads ~0.
//   * worstEdge  — the smallest dL* between two ADJACENT painted regions across
//                  the middle of the flower. This is the one that catches the
//                  eight petals merging into one blob: they are all the same
//                  gradient, so pctInk looks perfect while the shape is gone. The
//                  petal hairlines are what have to show up here.
//   * markVsPage — dL* of the mark's dominant ink against the surface behind it.
//
// It also captures each mode so the mark can be looked at, which is the only way
// to judge whether a logo is any good.
//
// Run the Vite dev server first, then: node tools/verify/brand-mark.mjs
// Exit 0: nothing found. 1: a finding. 2: the run could not measure: the dev
// server is down or went away mid-run (a navigation failed, including the
// /login and /report captures), the working directory is wrong, a page did not
// settle into its mode within 15 s (no .ui-brand-mark, <html> without the
// mode's theme, language or text size, or fonts and two frames that never
// settled; the captures included), the mark uses no var() for its copy to
// inline, its rasterised copy does not decode, Edge's DevTools socket closed,
// the run ended without reaching its verdict, or the script crashed. The exit
// code is the whole verdict: there is no report.json.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9339
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/brand')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-brand')

// 0 means the run measured and found nothing, 1 a finding, and 2 that the run
// could not measure. Node's own exit on an uncaught error is 1, which reads as a
// finding, so anything thrown or rejected that nothing catches exits 2 instead.
// main() has no catch, so this is also its crash path.
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
// A run that ends without reaching its verdict exits 2, and the verdict at the
// end of main() overrides it. Before this, a CDP socket that closed under a
// pending send left that send unsettled, the event loop drained, and node
// exited 0, which for this script is the whole verdict.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/brand-mark.mjs'))) {
  console.error(`brand-mark: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/brand-mark.mjs`)
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
    console.error(`brand-mark: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`brand-mark: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
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
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed')))
    })
    // Edge gone: every send still waiting for a reply fails. A send settles
    // only from a reply, and a pending promise does not keep node alive, so
    // without this the run drained away short of its verdict.
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
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
  }

  send(method, params = {}, useSession = true) {
    // ws.send() on a closed socket drops the frame without an error, and the
    // reply it waits for would never come.
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

// Page.navigate answers with errorText when the load itself failed, as it does
// with the connection refused once the dev server has gone. That page was never
// the app, so it throws: a fault, never a finding.
async function navigate(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`${url} did not load (${errorText}). Is the dev server still up?`)
}

// How long a page gets to settle into its mode before the run gives up on it.
// Page.navigate answers when the navigation commits, before the app has
// mounted, and the theme, language and text size reach <html> in effects that
// run after the mark is already in the DOM. A fixed sleep measured whatever was
// there when it ran out: no mark on a slow mount, a 2 that blamed the page, or,
// ending after the mount but before those effects, the light tokens under the
// dark label, a verdict on a mode it never measured.
const SETTLE_MS = 15000

// One look at the page. It answers with what is still missing, as phrases, or
// [] once the page has settled. With no theme asked for, any theme will do:
// data-theme is set by the first render's effects, the same flush that writes
// the stored settings back, so nothing of that render lands after the run's
// own writes to localStorage.
function settledCheck(want, budgetMs) {
  return [
    '(async () => {',
    '  const want = ' + JSON.stringify(want),
    '  const html = document.documentElement',
    '  const unmet = () => {',
    '    const out = []',
    '    const theme = html.dataset.theme || ""',
    '    const scale = getComputedStyle(html).getPropertyValue("--ui-scale").trim()',
    '    if (document.readyState !== "complete") out.push("the document is still " + document.readyState)',
    '    if (!document.querySelector(want.selector)) out.push("no " + want.selector)',
    '    if (want.theme ? theme !== want.theme : !theme) out.push("data-theme is " + JSON.stringify(theme) + (want.theme ? ", not " + JSON.stringify(want.theme) : ""))',
    '    if ("lang" in want && html.lang !== want.lang) out.push("lang is " + JSON.stringify(html.lang) + ", not " + JSON.stringify(want.lang))',
    '    if ("scale" in want && scale !== want.scale) out.push("--ui-scale is " + JSON.stringify(scale) + ", not " + JSON.stringify(want.scale))',
    '    return out',
    '  }',
    '  const first = unmet()',
    '  if (first.length) return first',
    // No web font is loaded today, so fonts.ready is immediate. The two frames
    // put a paint of the settled page between here and the probe. Both are
    // bounded: a page that is not being painted never runs a frame.
    '  const painted = await Promise.race([',
    '    document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))),',
    '    new Promise(r => setTimeout(() => r(false), ' + budgetMs + ')),',
    '  ])',
    '  if (!painted) return ["the fonts and two frames did not settle"]',
    '  return unmet()',
    '})()',
  ].join('\n')
}

// Looks until the page has settled, for SETTLE_MS at most. A look that lands
// while its context is going away (a reload mid-check) throws in the page: not
// settled yet, and the next look decides. A closed socket is Edge gone: a fault.
async function waitForSettled(cdp, url, want) {
  const deadline = Date.now() + SETTLE_MS
  let unmet = ['no check ran']
  while (Date.now() < deadline) {
    const budget = Math.max(50, Math.min(5000, deadline - Date.now()))
    unmet = await cdp.evaluate(settledCheck(want, budget)).catch((err) => {
      if (cdp.closed) throw err
      return ['the check threw (' + err.message + ')']
    })
    if (!unmet.length) return
    await sleep(150)
  }
  throw new Error(`brand-mark: ${url} never settled in ${SETTLE_MS / 1000} s, so the run stopped before measuring or capturing it: ${unmet.join('; ')}`)
}

// Every mode stores the English text at the normal size: 'md', which
// TEXT_SCALES in App.jsx writes to <html> as a --ui-scale of '1'.
const SETTLED_EN_MD = { selector: '.ui-brand-mark', lang: 'en', scale: '1' }

// A plain joined string, not a template literal: the probe carries regex and
// escapes, and a template literal is where those quietly stop being what they
// look like.
const PROBE = [
  '(async () => {',
  '  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }',
  '  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])',
  '  const Ls = c => { const y = lum(c); return y <= 216 / 24389 ? y * (24389 / 27) : Math.cbrt(y) * 116 - 16 }',
  '  const parse = s => { const m = String(s).match(/[0-9.]+/g); return m ? m.slice(0, 3).map(Number) : null }',
  '',
  '  const mark = document.querySelector(".ui-brand-mark")',
  '  if (!mark) throw new Error("no .ui-brand-mark on this page")',
  '',
  // The surface the mark is painted over. background-color is transparent on the
  // masthead's own inner wrapper, so walk up until something opaque is found.
  '  let node = mark.parentElement, surface = null',
  '  while (node && !surface) {',
  '    const bg = parse(getComputedStyle(node).backgroundColor)',
  '    const a = String(getComputedStyle(node).backgroundColor).match(/[0-9.]+/g)',
  '    if (bg && !(a && a.length > 3 && Number(a[3]) === 0)) surface = bg',
  '    node = node.parentElement',
  '  }',
  '  if (!surface) surface = parse(getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim().replace(/^#(..)(..)(..)$/, (m,r,g,b) => parseInt(r,16)+","+parseInt(g,16)+","+parseInt(b,16)))',
  '',
  // Rasterise the LIVE svg, tokens already resolved, by serialising it with the
  // computed value of every custom property it uses inlined on its root.
  // XMLSerializer alone is not enough: an <img> from a data: URL is a separate
  // document and cannot see the page's custom properties, so every var() would
  // fall back to nothing. The names are read off the markup being copied rather
  // than listed here: a hand list missed any token the component gained later,
  // and the copy painted that layer in its inherited or initial colour, a mark
  // the page does not show. Markup with no var() at all has moved its colours
  // out of the tokens, most likely into a page stylesheet the copy cannot see:
  // a 2, not a verdict on a copy that may not match. The values are read on the
  // mark itself, so a token set on one of its ancestors is the one it paints.
  '  const cs = getComputedStyle(mark)',
  '  const NAMES = Array.from(new Set(Array.from(new XMLSerializer().serializeToString(mark).matchAll(/var\\(\\s*(--[\\w-]+)/g), m => m[1])))',
  '  if (!NAMES.length) throw new Error("the .ui-brand-mark uses no var(), so its colours are not in the markup its copy is made from")',
  // A name with no value is left out rather than inlined empty: an empty value
  // is still a value, and would stop a var(--x, fallback) falling back as it
  // does on the page.
  '  const vars = NAMES.filter(n => cs.getPropertyValue(n).trim() !== "").map(n => n + ":" + cs.getPropertyValue(n).trim()).join(";")',
  '  const clone = mark.cloneNode(true)',
  // The root's own style, should it ever get one, follows the tokens rather than being replaced by them.
  '  const own = clone.getAttribute("style")',
  '  clone.setAttribute("style", own ? vars + ";" + own : vars)',
  '  clone.setAttribute("width", "480")',
  '  clone.setAttribute("height", "628")',
  '  const svgText = new XMLSerializer().serializeToString(clone)',
  '  const img = new Image()',
  '  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText)',
  '  await img.decode()',
  '',
  '  const W = 480, H = 628',
  '  const cv = document.createElement("canvas")',
  '  cv.width = W; cv.height = H',
  '  const ctx = cv.getContext("2d")',
  '  ctx.fillStyle = "rgb(" + surface.join(",") + ")"',
  '  ctx.fillRect(0, 0, W, H)',
  '  ctx.drawImage(img, 0, 0, W, H)',
  '  const px = ctx.getImageData(0, 0, W, H).data',
  '  const at = (x, y) => { const i = (y * W + x) * 4; return [px[i], px[i+1], px[i+2]] }',
  '',
  '  const surfL = Ls(surface)',
  '  let ink = 0, total = 0, sumInk = [0,0,0], nInk = 0',
  '  for (let y = 0; y < H; y += 2) {',
  '    for (let x = 0; x < W; x += 2) {',
  '      total++',
  '      const c = at(x, y)',
  '      if (Math.abs(Ls(c) - surfL) >= 5) { ink++; sumInk[0]+=c[0]; sumInk[1]+=c[1]; sumInk[2]+=c[2]; nInk++ }',
  '    }',
  '  }',
  '  const meanInk = nInk ? sumInk.map(v => Math.round(v / nInk)) : surface',
  '',
  // Scan the horizontal line through the flower's widest point. Every time the
  // colour changes by a visible amount we are crossing a boundary; the smallest
  // step between two runs is how well the petals separate from each other.
  '  const rowY = Math.round(H * (46 / 123))',
  '  const runs = []',
  '  let prev = null',
  '  for (let x = 0; x < W; x++) {',
  '    const c = at(x, rowY)',
  '    const key = c.join(",")',
  '    if (!prev || prev.key !== key) { runs.push({ key: key, c: c, n: 1 }); prev = runs[runs.length-1] }',
  '    else prev.n++',
  '  }',
  // Runs under 3px are antialiasing between two real regions, not regions.
  '  const solid = runs.filter(r => r.n >= 3)',
  '  let worstEdge = Infinity',
  '  for (let i = 1; i < solid.length; i++) {',
  '    worstEdge = Math.min(worstEdge, Math.abs(Ls(solid[i].c) - Ls(solid[i-1].c)))',
  '  }',
  '',
  '  return {',
  '    surface: "rgb(" + surface.join(",") + ")",',
  '    petalOuter: cs.getPropertyValue("--mark-petal-outer").trim(),',
  '    edge: cs.getPropertyValue("--mark-edge").trim(),',
  '    edgeWidth: cs.getPropertyValue("--mark-edge-w").trim(),',
  '    pctInk: Math.round(100 * ink / total),',
  '    meanInk: "rgb(" + meanInk.join(",") + ")",',
  '    markVsPage: Math.round(Math.abs(Ls(meanInk) - surfL) * 10) / 10,',
  '    regions: solid.length,',
  '    worstEdge: solid.length > 1 ? Math.round(worstEdge * 10) / 10 : null,',
  '    png: cv.toDataURL("image/png"),',
  '  }',
  '})()',
].join('\n')

const MODES = [
  { name: 'light', theme: 'light' },
  { name: 'dark', theme: 'dark' },
]

// The mark must be clearly present against whatever it sits on, and its own
// internal boundaries must be visible or the eight petals are one blob.
const MIN_INK = 12        // % of the mark's box that is not background
const MIN_VS_PAGE = 12    // dL* of the mark's average ink against the surface
const MIN_EDGE = 3        // dL* between adjacent painted regions
const MIN_REGIONS = 5     // petals + coin crossed by the centre line

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

  let failures = 0
  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

    for (const mode of MODES) {
      await navigate(cdp, APP + '/')
      await waitForSettled(cdp, APP + '/', { selector: '.ui-brand-mark' })
      await cdp.evaluate([
        `localStorage.setItem('sih-theme', '${mode.theme}');`,
        `localStorage.setItem('sih-language', 'en');`,
        `localStorage.setItem('sih-textsize', 'md');`,
        `localStorage.removeItem('sih-dialect');`,
        'true',
      ].join(''))
      await navigate(cdp, APP + '/')
      await waitForSettled(cdp, APP + '/', { ...SETTLED_EN_MD, theme: mode.theme })

      const m = await cdp.evaluate(PROBE)
      const { png, ...report } = m
      console.log(`\n=== ${mode.name}`)
      for (const [k, v] of Object.entries(report)) console.log(`    ${k.padEnd(12)} ${v}`)

      const notes = []
      if (m.pctInk < MIN_INK) notes.push(`only ${m.pctInk}% of the mark's box is painted — it may be background-on-background`)
      if (m.markVsPage < MIN_VS_PAGE) notes.push(`mark averages dL* ${m.markVsPage} from the surface behind it`)
      if (m.regions < MIN_REGIONS) notes.push(`the centre line crosses only ${m.regions} distinct regions — the petals have merged`)
      if (m.worstEdge !== null && m.worstEdge < MIN_EDGE) notes.push(`adjacent regions differ by only dL* ${m.worstEdge}`)
      if (notes.length) {
        failures++
        for (const n of notes) console.log(`    FAIL  ${n}`)
      } else {
        console.log('    ok    present, and its own internal edges hold up')
      }

      writeFileSync(`${OUT}/mark-${mode.name}.png`, Buffer.from(png.split(',')[1], 'base64'))
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1440, height: 300, scale: 1 },
      })
      writeFileSync(`${OUT}/masthead-${mode.name}.png`, Buffer.from(shot.data, 'base64'))
    }

    // /login renders the large variant, and /report puts the mark on the sheet
    // that gets printed. Captured for eyeballing rather than measured again.
    for (const [route, file] of [['/login', 'login'], ['/report', 'report']]) {
      await cdp.evaluate("localStorage.setItem('sih-theme','light');true")
      await navigate(cdp, APP + route)
      await waitForSettled(cdp, APP + route, { ...SETTLED_EN_MD, theme: 'light' })
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1440, height: 700, scale: 1 },
      })
      writeFileSync(`${OUT}/page-${file}.png`, Buffer.from(shot.data, 'base64'))
    }
  } finally {
    edge.kill()
  }

  console.log(`\n${MODES.length} modes checked, ${failures} with problems.`)
  console.log(`Rasterised marks and page captures in ${OUT}`)
  process.exit(failures ? 1 : 0)
}

main()

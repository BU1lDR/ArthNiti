// The browser-side counterpart to art-contrast.mjs. That script models the
// compositing chain; this one confirms the model against pixels the browser
// actually painted, because a filter can be written correctly and still not
// reach the screen the way the maths said (a cascade loss, a stacking-context
// mistake, a token that resolved differently than expected).
//
// It renders whatever image the page says it is using into a canvas the size of
// the hero box, with the SAME computed filter and opacity the browser reports for
// .ui-hero::before, then reads the pixels back and measures:
//
//   * mean dL* against the page background, over the whole hero box
//   * what fraction of those pixels are perceptually present at all
//   * the hero copy's contrast ratio over the worst artwork pixel it can land
//     on — the constraint that makes this a trade-off rather than a free win
//
// Three things here were changed when the backdrop became an opaque JPEG on
// 8 Sept 2026, and each was a way this script could have kept passing while
// measuring the wrong thing:
//
//   * The image is read from the computed `background-image`, not named here.
//     It used to hardcode "/town-consulting.svg", so replacing the backdrop
//     would have left it measuring a file the page no longer shows — the same
//     silent-staleness trap as the driver's captured fixtures.
//   * The canvas mirrors `background-size: cover` over the element's own box.
//     It used to mirror a width-based size into a canvas of the image's aspect
//     ratio, which with `cover` would measure pixels the reader never sees
//     because they are cropped.
//   * BOTH luminance extremes are tracked, and the reported ratio is the worse
//     of the two. It used to keep only the darkest pixel, which is the right
//     worst case for dark text on a light page and the wrong one in dark mode,
//     where the copy is near-white and the danger is the cream starburst and the
//     white globe lines. Harmless with transparent line art; with an opaque
//     collage it would hide a real failure.
//
// The bottom 40% restriction is also gone: it existed because the SVG carried a
// softTop gradient mask that faded its own top edge to nothing. A JPEG has no
// mask and `cover` fills the box, so every pixel is artwork a reader can meet.
//
// Run the Vite dev server first, then:  node tools/verify/hero-art.mjs
// Exit 0: nothing found. 1: a finding. 2: the run could not measure: the dev
// server is down or went away mid-run (a navigation failed), the working
// directory is wrong, the page did not settle into the mode within 15 s (no
// hero, <html> without the mode's theme, language or text size, or fonts and
// two frames that never settled), the page has no backdrop, subtitle or chip
// row to measure, the backdrop does not decode, a colour does not parse
// (--color-bg included: one a canvas cannot resolve, or one that is not
// opaque), Edge's DevTools socket closed, the run ended without reaching its
// verdict, or the script crashed. The exit code is the whole verdict: there is
// no report.json.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9337
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/hero')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-hero')

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
if (!existsSync(resolve('tools/verify/hero-art.mjs'))) {
  console.error(`hero-art: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/hero-art.mjs`)
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
    console.error(`hero-art: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`hero-art: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
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
// run after the hero is already in the DOM. A fixed sleep measured whatever was
// there when it ran out: no hero on a slow mount, a 2 that blamed the page, or,
// ending after the mount but before those effects, the light tokens under the
// dark label and the normal text size under the large one, a verdict on a mode
// it never measured.
const SETTLE_MS = 15000
// The --ui-scale each text size leaves on <html>, as the string setProperty
// writes: a mirror of TEXT_SCALES in App.jsx. A size missing here, or a value
// that has drifted, reads as a page that never settled (2), never as a pass.
const SCALE = { sm: '0.94', md: '1', lg: '1.18' }

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
  throw new Error(`hero-art: ${url} never settled in ${SETTLE_MS / 1000} s, so nothing on it was measured: ${unmet.join('; ')}`)
}

// Kept as a plain string rather than a template literal: the probe is full of
// regex and escapes, and routing them through a template literal is where the
// bytes stop being what they look like.
const PROBE = [
  '(async () => {',
  '  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }',
  '  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])',
  '  const Ls = c => { const y = lum(c); return y <= 216 / 24389 ? y * (24389 / 27) : Math.cbrt(y) * 116 - 16 }',
  '  const ratio = (a, b) => { const s = [lum(a), lum(b)].sort((p, q) => q - p); return (s[0] + 0.05) / (s[1] + 0.05) }',
  // "rgb(18, 35, 58)" and "rgb(18 35 58 / 0.9)" both reduce to three numbers.
  '  const parse = s => { const m = String(s).match(/[0-9.]+/g); if (!m) throw new Error("unparseable colour: " + s); return m.slice(0, 3).map(Number) }',
  '',
  '  const hero = document.querySelector(".ui-hero")',
  '  if (!hero) throw new Error("no .ui-hero on this page")',
  '  const rect = hero.getBoundingClientRect()',
  // --color-bg is set on a wrapper, so html and body both compute transparent.
  // Read the token instead, and let a canvas turn it into the pixel it paints.
  // Sliced as #RRGGBB, an rgb(), a 3-digit hex or an oklch() token came out
  // with a NaN in it, the canvas ignored that fill and painted black, and every
  // mode failed on "0% of the artwork is perceptible": a finding the probe
  // itself produced. A token the canvas refuses, or one that is not opaque, is
  // a colour that does not parse: a 2.
  '  const token = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim()',
  '  const bgCv = document.createElement("canvas")',
  '  bgCv.width = 1; bgCv.height = 1',
  '  const bgCtx = bgCv.getContext("2d")',
  // A refused assignment leaves fillStyle as it was, so a token that reads back
  // the same over two different starting colours is one the canvas took.
  '  bgCtx.fillStyle = "#000000"; bgCtx.fillStyle = token; const took = bgCtx.fillStyle',
  '  bgCtx.fillStyle = "#ffffff"; bgCtx.fillStyle = token',
  '  if (!token || bgCtx.fillStyle !== took) throw new Error("unparseable --color-bg: " + JSON.stringify(token))',
  '  bgCtx.fillRect(0, 0, 1, 1)',
  '  const bgPx = bgCtx.getImageData(0, 0, 1, 1).data',
  '  if (bgPx[3] !== 255) throw new Error("--color-bg " + token + " is not opaque, so it is not the colour behind the hero")',
  '  const pageBg = [bgPx[0], bgPx[1], bgPx[2]]',
  '',
  '  const cs = getComputedStyle(hero, "::before")',
  // Read the backdrop off the page rather than naming a file here.
  '  const bi = String(cs.backgroundImage)',
  '  if (bi.indexOf("url(") < 0) throw new Error("no background-image on .ui-hero::before: " + bi)',
  '  const src = bi.slice(bi.indexOf("url(") + 4, bi.lastIndexOf(")")).replace(/["\']/g, "")',
  '  const img = new Image()',
  '  img.src = src',
  '  await img.decode()',
  '',
  // Mirror `background-size: cover` + `background-position: center` over the
  // element's own box: scale to the larger of the two ratios, centre the
  // overflow. The canvas IS the hero box, so what is measured is what is seen.
  '  const w = Math.max(1, Math.round(rect.width))',
  '  const h = Math.max(1, Math.round(rect.height))',
  '  const scale = Math.max(w / img.width, h / img.height)',
  '  const dw = img.width * scale, dh = img.height * scale',
  '  const cv = document.createElement("canvas")',
  '  cv.width = w; cv.height = h',
  '  const ctx = cv.getContext("2d")',
  '  ctx.fillStyle = "rgb(" + pageBg.join(",") + ")"',
  '  ctx.fillRect(0, 0, w, h)',
  '  ctx.filter = cs.filter === "none" ? "none" : cs.filter',
  '  ctx.globalAlpha = parseFloat(cs.opacity)',
  '  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)',
  '  const px = ctx.getImageData(0, 0, w, h).data',
  '',
  '  const bgL = Ls(pageBg)',
  '  let sum = 0, n = 0, visible = 0, maxD = 0',
  '  let darkL = Infinity, darkPx = pageBg, lightL = -Infinity, lightPx = pageBg',
  '  for (let y = 0; y < h; y += 2) {',
  '    for (let x = 0; x < w; x += 2) {',
  '      const i = (y * w + x) * 4',
  '      const c = [px[i], px[i + 1], px[i + 2]]',
  '      const L = Ls(c)',
  '      const d = Math.abs(L - bgL)',
  '      sum += d; n++',
  '      if (d >= 5) visible++',
  '      if (d > maxD) maxD = d',
  '      if (L < darkL) { darkL = L; darkPx = c }',
  '      if (L > lightL) { lightL = L; lightPx = c }',
  '    }',
  '  }',
  // A reader can land on either extreme, so report the worse of the two rather
  // than whichever one this particular theme happens to care about.
  '  const worstFor = (col) => { const c = parse(col); return Math.min(ratio(c, darkPx), ratio(c, lightPx)) }',
  '',
  '  const sub = document.querySelector(".ui-hero .ui-page-subtitle")',
  '  const rows = Array.from(document.querySelectorAll(".ui-hero div"))',
  '  const chipRow = rows.filter(d => typeof d.className === "string" && d.className.indexOf("flex-wrap") >= 0).pop()',
  '  if (!sub) throw new Error("no .ui-page-subtitle inside .ui-hero")',
  '  if (!chipRow) throw new Error("no chip row inside .ui-hero")',
  '',
  '  return {',
  '    backdrop: src.replace(location.origin, ""),',
  '    filter: cs.filter,',
  '    opacity: cs.opacity,',
  '    pageBg: "rgb(" + pageBg.join(",") + ")",',
  '    heroBox: w + "x" + h,',
  '    meanDeltaL: Math.round(sum / n * 10) / 10,',
  '    pctPresent: Math.round(100 * visible / n),',
  '    maxDeltaL: Math.round(maxD * 10) / 10,',
  '    darkestPatch: "rgb(" + darkPx.map(Math.round).join(",") + ")",',
  '    lightestPatch: "rgb(" + lightPx.map(Math.round).join(",") + ")",',
  '    subtitleColor: getComputedStyle(sub).color,',
  '    subtitleWorstRatio: Math.round(worstFor(getComputedStyle(sub).color) * 100) / 100,',
  '    chipColor: getComputedStyle(chipRow).color,',
  '    chipWorstRatio: Math.round(worstFor(getComputedStyle(chipRow).color) * 100) / 100,',
  '  }',
  '})()',
].join('\n')

const MODES = [
  { name: 'light', theme: 'light', lang: 'en' },
  { name: 'dark', theme: 'dark', lang: 'en' },
  { name: 'light-hindi-lg', theme: 'light', lang: 'hi', textsize: 'lg' },
]

// There was a fourth mode, light-highcontrast, until 8 September 2026. High
// contrast set --landing-art-opacity to 0 on purpose — it dropped decorative
// artwork entirely — so that mode was checked on the OPPOSITE assertion: the
// artwork had to be off. High contrast has been removed from the app, so no mode
// wants the artwork off any more, and the artOff branch below is inverted.

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
      await waitForSettled(cdp, APP + '/', { selector: '.ui-hero' })
      await cdp.evaluate([
        `localStorage.setItem('sih-theme', '${mode.theme}');`,
        `localStorage.setItem('sih-language', '${mode.lang}');`,
        `localStorage.setItem('sih-textsize', '${mode.textsize || 'md'}');`,
        `localStorage.removeItem('sih-dialect');`,
        'true',
      ].join(''))
      await navigate(cdp, APP + '/')
      await waitForSettled(cdp, APP + '/', { selector: '.ui-hero', theme: mode.theme, lang: mode.lang, scale: SCALE[mode.textsize || 'md'] ?? null })

      const m = await cdp.evaluate(PROBE)
      const artOff = parseFloat(m.opacity) === 0
      console.log(`\n=== ${mode.name}`)
      for (const [k, v] of Object.entries(m)) console.log(`    ${k.padEnd(19)} ${v}`)

      const notes = []
      // Zero opacity is a FAILURE now, not a mode. It used to gate the three
      // checks below, which was right while high contrast deliberately hid the
      // artwork — but with that mode gone the guard became a licence to skip
      // every assertion in this script: one stray `--landing-art-opacity: 0` and
      // all three modes would report "artwork off, as intended".
      if (artOff) notes.push('--landing-art-opacity is 0 — the backdrop is not painted at all')
      if (m.pctPresent < 40) notes.push(`only ${m.pctPresent}% of the artwork is perceptible`)
      if (m.subtitleWorstRatio < 4.5) notes.push(`subtitle ${m.subtitleWorstRatio}:1 is under AA`)
      if (m.chipWorstRatio < 4.5) notes.push(`chip row ${m.chipWorstRatio}:1 is under AA`)
      if (notes.length) {
        failures++
        for (const n of notes) console.log(`    FAIL  ${n}`)
      } else {
        console.log('    ok    visible and AA-clear')
      }

      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1440, height: 840, scale: 1 },
      })
      writeFileSync(`${OUT}/${mode.name}.png`, Buffer.from(shot.data, 'base64'))
    }
  } finally {
    edge.kill()
  }

  console.log(`\n${MODES.length} modes checked, ${failures} with problems.`)
  console.log(`Screenshots in ${OUT}`)
  process.exit(failures ? 1 : 0)
}

main()

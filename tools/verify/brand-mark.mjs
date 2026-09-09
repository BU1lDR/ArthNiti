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
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9339
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/brand')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-brand')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
  }

  send(method, params = {}, useSession = true) {
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
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

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
  // Rasterise the LIVE svg, tokens already resolved, by serialising it with its
  // computed --mark-* values inlined. XMLSerializer alone is not enough: an
  // <img> from a data: URL is a separate document and cannot see the page's
  // custom properties, so every var() would fall back to nothing.
  '  const cs = getComputedStyle(document.documentElement)',
  '  const NAMES = ["--mark-petal-outer","--mark-petal-mid","--mark-petal-inner","--mark-edge","--mark-edge-w","--mark-coin-ring","--mark-coin-face","--mark-coin-shine","--mark-coin-glyph","--mark-drop","--mark-drop-edge"]',
  '  const vars = NAMES.map(n => n + ":" + cs.getPropertyValue(n).trim()).join(";")',
  '  const clone = mark.cloneNode(true)',
  '  clone.setAttribute("style", vars)',
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
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(900)
      await cdp.evaluate([
        `localStorage.setItem('sih-theme', '${mode.theme}');`,
        `localStorage.setItem('sih-language', 'en');`,
        `localStorage.setItem('sih-textsize', 'md');`,
        `localStorage.removeItem('sih-dialect');`,
        'true',
      ].join(''))
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(1200)

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
      await cdp.send('Page.navigate', { url: APP + route })
      await sleep(1200)
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

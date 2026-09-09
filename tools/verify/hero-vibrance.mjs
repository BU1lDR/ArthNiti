// A tuning instrument for the landing backdrop, not a gate. hero-art.mjs asks
// "is the shipped setting visible and still AA-clear"; this one asks "which
// setting would be MORE VIBRANT without breaking either of those", which is a
// different question and needs a metric hero-art.mjs does not have.
//
// The missing metric is chroma. mean dL* is a LIGHTNESS distance from the page,
// so two settings can be identical on it and look nothing alike: halving
// saturation moves colour without moving lightness at all. Vibrance is C* in
// CIE LCh -- sqrt(a*^2 + b*^2) after the composite -- and that is the number
// this script adds. Every other figure it prints is computed exactly as
// hero-art.mjs computes it, deliberately, so a row here is comparable with that
// script's output rather than being a second opinion in different units.
//
// It sweeps CANDIDATES through the real composite instead of editing index.css
// once per guess: load the page once, read the page background, the hero box and
// the backdrop the page actually names, then re-composite in a canvas per
// candidate. The first row is whatever is currently shipped, so the deltas are
// legible.
//
// Three constraints have to hold at once and they pull against each other:
//
//   * chroma UP        -- the request
//   * mean dL* not down -- the artwork has to stay visible; see hero-art.mjs
//   * subtitle and chip contrast >= 4.5:1 -- AA over the WORST pixel the copy
//     can land on, which for an opaque photo is a real pixel, not an average
//
// The traps are the filter maths recorded in CLAUDE.md and in index.css above
// the filter: contrast(k) with k > 1 pushes everything above mid-grey toward
// white (backwards here, three quarters of this image is above mid-grey), and
// brightness is not a free vibrance lever either -- it multiplies the channels,
// so it scales the channel SPREAD as well as the level. brightness(0.5) is
// already costing half the chroma before saturate() sees the pixel.
//
// Run the Vite dev server first, then:
//   node tools/verify/hero-vibrance.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// Its own port and profile so this can run beside the other drivers.
// 9361, not 9359: print-audit.mjs already owns 9359, and every script here gets
// its own port and profile dir precisely so two of them can run at once.
const DEBUG_PORT = 9361
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/hero-vibrance')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-vibrance')

// opacity + filter pairs. `null` means "read the shipped value off the page",
// which is what makes the first row a baseline rather than a transcription of
// index.css that could go stale the moment someone edits it.
// Round 1 established which levers are free and which are not, and the result is
// sharper than "measure and see" -- it falls out of the composite arithmetic:
//
//   composite(v) = v * b * k + 0.5 * (1 - k)
//
// The worst pixel for dark hero copy is the densest halftone dot, and in this
// image that is TRUE BLACK. v = 0 annihilates both b and the saturate matrix, so
// neither brightness nor saturate can lift it -- only contrast(k < 1)'s additive
// term and the opacity blend can. Measured, exactly that: sub/chip held at
// 5.47:1 across saturate 1.2 -> 3.2 and across brightness 0.5 -> 0.62, and moved
// only when opacity or contrast moved.
//
//   saturate   free      -- luminance-preserving matrix, no effect on either
//                           constraint. This is the lever to spend.
//   brightness cheap     -- free on contrast, but lightens the artwork toward
//                           the page, so it is paid for in mean dL*.
//   opacity    expensive -- .46 -> 4.58:1, .52 -> 3.73:1 (below AA). Stays .40.
//   contrast   pinned    -- the one thing holding the black off zero. Above 1 it
//                           inverts (see index.css); below 0.91 it greys the
//                           image out, which fights vibrance directly.
//
// So round 2 pins opacity at 0.40 and pushes the two free-ish levers to find
// where saturate starts posterising (clip%) and how much dL* brightness costs.
const CANDIDATES = [
  { name: 'SHIPPED', opacity: null, filter: null },

  // saturate alone, pushed to the clipping ceiling.
  { name: 'sat 1.8', opacity: 0.4, filter: 'brightness(0.5) saturate(1.8) contrast(0.91)' },
  { name: 'sat 2.2', opacity: 0.4, filter: 'brightness(0.5) saturate(2.2) contrast(0.91)' },
  { name: 'sat 2.6', opacity: 0.4, filter: 'brightness(0.5) saturate(2.6) contrast(0.91)' },
  { name: 'sat 3.0', opacity: 0.4, filter: 'brightness(0.5) saturate(3) contrast(0.91)' },
  { name: 'sat 3.6', opacity: 0.4, filter: 'brightness(0.5) saturate(3.6) contrast(0.91)' },
  { name: 'sat 4.4', opacity: 0.4, filter: 'brightness(0.5) saturate(4.4) contrast(0.91)' },

  // brightness up at the safe opacity: free on text contrast, paid in dL*.
  { name: 'br .56 sat 2.6', opacity: 0.4, filter: 'brightness(0.56) saturate(2.6) contrast(0.91)' },
  { name: 'br .62 sat 2.6', opacity: 0.4, filter: 'brightness(0.62) saturate(2.6) contrast(0.91)' },
  { name: 'br .62 sat 3.0', opacity: 0.4, filter: 'brightness(0.62) saturate(3) contrast(0.91)' },
  { name: 'br .70 sat 3.0', opacity: 0.4, filter: 'brightness(0.7) saturate(3) contrast(0.91)' },
]

// A shortlist rendered on the live page and captured, because the number this
// script adds says how much colour is present and NOT whether it looks right.
// Round 1's own history is the warning: saturate(2.2) was rejected by eye as
// "lurid" on this collage while measuring perfectly well.
const SHOTS = ['SHIPPED', 'sat 2.2', 'sat 2.6', 'sat 3.0', 'sat 3.6', 'br .62 sat 2.6']

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

// A plain string, not a template literal: the probe is full of regex and
// escapes, and a template literal is where the bytes stop being what they look
// like.
const PROBE = [
  '(async () => {',
  '  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }',
  '  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])',
  '  const EPS = 216 / 24389, K = 24389 / 27',
  '  const f = t => t > EPS ? Math.cbrt(t) : (K * t + 16) / 116',
  '  const Ls = c => { const y = lum(c); return y <= EPS ? y * K : Math.cbrt(y) * 116 - 16 }',
  // Full Lab, because chroma needs a* and b*, not just L*. sRGB -> XYZ (D65)
  // with the same linearisation the luminance above uses.
  '  const chroma = c => {',
  '    const r = lin(c[0]), g = lin(c[1]), b = lin(c[2])',
  '    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047',
  '    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b',
  '    const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883',
  '    const fx = f(X), fy = f(Y), fz = f(Z)',
  '    const A = 500 * (fx - fy), B = 200 * (fy - fz)',
  '    return Math.sqrt(A * A + B * B)',
  '  }',
  '  const ratio = (a, b) => { const s = [lum(a), lum(b)].sort((p, q) => q - p); return (s[0] + 0.05) / (s[1] + 0.05) }',
  '  const parse = s => { const m = String(s).match(/[0-9.]+/g); if (!m) throw new Error("unparseable colour: " + s); return m.slice(0, 3).map(Number) }',
  '',
  '  const hero = document.querySelector(".ui-hero")',
  '  if (!hero) throw new Error("no .ui-hero on this page")',
  '  const rect = hero.getBoundingClientRect()',
  '  const token = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim()',
  '  const pageBg = [1, 3, 5].map(i => parseInt(token.slice(i, i + 2), 16))',
  '',
  '  const cs = getComputedStyle(hero, "::before")',
  '  const bi = String(cs.backgroundImage)',
  '  if (bi.indexOf("url(") < 0) throw new Error("no background-image on .ui-hero::before: " + bi)',
  '  const src = bi.slice(bi.indexOf("url(") + 4, bi.lastIndexOf(")")).replace(/["\']/g, "")',
  '  const img = new Image()',
  '  img.src = src',
  '  await img.decode()',
  '',
  // Mirror `background-size: cover` + `center` over the element's own box, so
  // what is measured is what is seen and not the pixels the crop discards.
  '  const w = Math.max(1, Math.round(rect.width))',
  '  const h = Math.max(1, Math.round(rect.height))',
  '  const scale = Math.max(w / img.width, h / img.height)',
  '  const dw = img.width * scale, dh = img.height * scale',
  '',
  '  const sub = document.querySelector(".ui-hero .ui-page-subtitle")',
  '  const rows = Array.from(document.querySelectorAll(".ui-hero div"))',
  '  const chipRow = rows.filter(d => typeof d.className === "string" && d.className.indexOf("flex-wrap") >= 0).pop()',
  '  if (!sub) throw new Error("no .ui-page-subtitle inside .ui-hero")',
  '  if (!chipRow) throw new Error("no chip row inside .ui-hero")',
  '  const subCol = parse(getComputedStyle(sub).color)',
  '  const chipCol = parse(getComputedStyle(chipRow).color)',
  '',
  '  const bgL = Ls(pageBg)',
  '  const bgC = chroma(pageBg)',
  '',
  // The filter chain's own reachable floor and ceiling, in 0-255, derived from
  // the b and k it is written with: composite(v) = v*b*k + 0.5*(1-k), evaluated
  // at v = 0 and v = 1 and clamped to the range.
  //
  // This exists because the FIRST version of the clipping check could not fire.
  // It tested the composited channel against 0 and 255, and with contrast(0.91)
  // the chain's own floor is 11.5/255 and its ceiling 127.5/255 -- nothing in the
  // image can ever reach either end of the byte range, so the check returned a
  // confident 0.0% at every saturation including 4.4. What posterisation actually
  // looks like downstream of a clamp is a channel PINNED AT THE CHAIN FLOOR, so
  // that is what to count. A real black pixel lands on the same value, which is
  // why the baseline row is non-zero and the verdict compares against it rather
  // than against zero.
  '  const ends = (filter) => {',
  '    const b = (filter.match(/brightness\\(([\\d.]+)\\)/) || [0, 1])[1] * 1',
  '    const k = (filter.match(/contrast\\(([\\d.]+)\\)/) || [0, 1])[1] * 1',
  '    const at = v => Math.max(0, Math.min(1, v * b * k + 0.5 * (1 - k))) * 255',
  '    return { lo: at(0), hi: at(1) }',
  '  }',
  '',
  '  const measure = (opacity, filter) => {',
  '    const end = ends(filter)',
  '    const cv = document.createElement("canvas")',
  '    cv.width = w; cv.height = h',
  '    const ctx = cv.getContext("2d")',
  '    ctx.fillStyle = "rgb(" + pageBg.join(",") + ")"',
  '    ctx.fillRect(0, 0, w, h)',
  '    ctx.filter = filter === "none" ? "none" : filter',
  '    ctx.globalAlpha = opacity',
  '    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)',
  '    const px = ctx.getImageData(0, 0, w, h).data',
  '    let sumD = 0, sumC = 0, n = 0, visible = 0, colourful = 0, maxD = 0, maxC = 0, clipped = 0',
  '    let darkL = Infinity, darkPx = pageBg, lightL = -Infinity, lightPx = pageBg',
  '    for (let y = 0; y < h; y += 2) {',
  '      for (let x = 0; x < w; x += 2) {',
  '        const i = (y * w + x) * 4',
  '        const c = [px[i], px[i + 1], px[i + 2]]',
  '        const L = Ls(c), C = chroma(c)',
  '        const d = Math.abs(L - bgL)',
  '        sumD += d; sumC += C; n++',
  '        if (d >= 5) visible++',
  // 4 C* units is about where a colour stops reading as "a grey with a hint of
  // something" at arm's length. The page itself sits at bgC, so this counts
  // pixels that are more colourful than the paper they are on.
  '        if (C >= bgC + 4) colourful++',
  // saturate() spreads the channels apart, and a channel driven past the ends of
  // the range is CLAMPED, not scaled back. Clamping is what turns "more colour"
  // into posterisation: detail inside a banknote or a petal collapses to one flat
  // patch, which is the mechanism behind "lurid" and the reason a chroma number
  // alone cannot pick a value.
  //
  // Invert the opacity blend to recover the pre-blend channel, then test it
  // against the chain's own ends rather than against 0/255 -- see ends() above
  // for why the byte-range version was inert.
  '        if (c.some((v, j) => { const pre = (v - pageBg[j] * (1 - opacity)) / opacity; return pre <= end.lo + 0.8 || pre >= end.hi - 0.8 })) clipped++',
  '        if (d > maxD) maxD = d',
  '        if (C > maxC) maxC = C',
  '        if (L < darkL) { darkL = L; darkPx = c }',
  '        if (L > lightL) { lightL = L; lightPx = c }',
  '      }',
  '    }',
  '    const worst = col => Math.min(ratio(col, darkPx), ratio(col, lightPx))',
  '    return {',
  '      meanDeltaL: Math.round(sumD / n * 10) / 10,',
  '      pctPresent: Math.round(100 * visible / n),',
  '      meanChroma: Math.round(sumC / n * 10) / 10,',
  '      maxChroma: Math.round(maxC * 10) / 10,',
  '      pctColourful: Math.round(100 * colourful / n),',
  '      pctClipped: Math.round(1000 * clipped / n) / 10,',
  '      sub: Math.round(worst(subCol) * 100) / 100,',
  '      chip: Math.round(worst(chipCol) * 100) / 100,',
  '      darkest: "rgb(" + darkPx.map(Math.round).join(",") + ")",',
  '      lightest: "rgb(" + lightPx.map(Math.round).join(",") + ")",',
  '    }',
  '  }',
  '',
  '  const shipped = { opacity: parseFloat(cs.opacity), filter: cs.filter }',
  '  const out = []',
  '  for (const cand of CANDIDATES_JSON) {',
  '    const opacity = cand.opacity === null ? shipped.opacity : cand.opacity',
  '    const filter = cand.filter === null ? shipped.filter : cand.filter',
  '    out.push(Object.assign({ name: cand.name, opacity, filter }, measure(opacity, filter)))',
  '  }',
  '  return { backdrop: src.replace(location.origin, ""), heroBox: w + "x" + h, pageBg: "rgb(" + pageBg.join(",") + ")", pageChroma: Math.round(bgC * 10) / 10, shipped, rows: out }',
  '})()',
].join('\n')

function pad(v, n) {
  return String(v).padEnd(n)
}

function lpad(v, n) {
  return String(v).padStart(n)
}

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

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

    // Light mode only, and on purpose: dark mode replaces the filter wholesale
    // and is documented as deliberately left alone, high contrast has the
    // artwork off entirely. The request is about light mode.
    await cdp.send('Page.navigate', { url: APP + '/' })
    await sleep(1100)
    await cdp.evaluate([
      "localStorage.setItem('sih-theme', 'light');",
      "localStorage.setItem('sih-language', 'en');",
      "localStorage.setItem('sih-textsize', 'md');",
      "localStorage.removeItem('sih-dialect');",
      'true',
    ].join(''))
    await cdp.send('Page.navigate', { url: APP + '/' })
    await sleep(1400)

    const probe = PROBE.replace('CANDIDATES_JSON', JSON.stringify(CANDIDATES))
    const r = await cdp.evaluate(probe)

    console.log(`backdrop     ${r.backdrop}`)
    console.log(`hero box     ${r.heroBox}`)
    console.log(`page         ${r.pageBg}  (C* ${r.pageChroma})`)
    console.log(`shipped      opacity ${r.shipped.opacity} · ${r.shipped.filter}\n`)

    const base = r.rows[0]
    console.log(`${pad('candidate', 18)}${lpad('op', 5)}${lpad('meanC*', 8)}${lpad('dC*', 7)}${lpad('col%', 6)}${lpad('clip%', 7)}${lpad('dL*', 7)}${lpad('pres%', 7)}${lpad('sub', 7)}  verdict`)
    for (const row of r.rows) {
      const dC = Math.round((row.meanChroma - base.meanChroma) * 10) / 10
      const notes = []
      if (row.sub < 4.5) notes.push(`sub ${row.sub}:1 under AA`)
      if (row.chip < 4.5) notes.push(`chip ${row.chip}:1 under AA`)
      if (row.pctPresent < 40) notes.push(`only ${row.pctPresent}% present`)
      if (row.meanDeltaL < base.meanDeltaL - 0.5) notes.push(`dL* down ${Math.round((base.meanDeltaL - row.meanDeltaL) * 10) / 10}`)
      if (row.pctClipped > base.pctClipped + 4) notes.push(`clipping ${row.pctClipped}% of pixels`)
      const verdict = notes.length ? 'NO  — ' + notes.join('; ') : (dC > 0 ? 'ok  — more vibrant' : 'ok')
      console.log(
        pad(row.name, 18) + lpad(row.opacity, 5) + lpad(row.meanChroma, 8) +
        lpad(dC > 0 ? '+' + dC : dC, 7) + lpad(row.pctColourful, 6) + lpad(row.pctClipped, 7) +
        lpad(row.meanDeltaL, 7) + lpad(row.pctPresent, 7) +
        lpad(row.sub, 7) + '  ' + verdict,
      )
    }

    writeFileSync(`${OUT}/report.json`, JSON.stringify(r, null, 2))
    console.log(`\nColumns: meanC* mean chroma over the composite (the vibrance figure), dC* its`)
    console.log('gain over the shipped row, col% pixels more colourful than the paper, clip%')
    console.log('pixels with a channel clamped pre-blend (posterisation), dL* lightness')
    console.log('distance from the page, sub worst-pixel copy contrast (AA = 4.5).')

    // The numbers narrow the field; they cannot pick inside it. Render the
    // shortlist on the real page and capture, so the choice is made on the
    // rendered collage rather than on a chroma figure that says nothing about
    // whether a halftone banknote has gone cartoon-green.
    const byName = new Map(r.rows.map((row) => [row.name, row]))
    for (const name of SHOTS) {
      const row = byName.get(name)
      if (!row) { console.log(`\n(no candidate named ${name} to capture)`); continue }
      // Wrapped in an IIFE: Runtime.evaluate runs at global scope and the
      // bindings SURVIVE between calls, so a bare `const` here threw
      // "Identifier already declared" on the second candidate.
      await cdp.evaluate([
        '(() => {',
        '  const prev = document.getElementById("vib-probe"); if (prev) prev.remove();',
        '  const el = document.createElement("style"); el.id = "vib-probe";',
        `  el.textContent = '.ui-hero::before { opacity: ${row.opacity} !important; filter: ${row.filter} !important; }';`,
        '  document.head.appendChild(el); return true',
        '})()',
      ].join('\n'))
      await sleep(260)
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1440, height: 820, scale: 1 },
      })
      const file = `${OUT}/${name.replace(/[^a-z0-9]+/gi, '-')}.png`
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      console.log(`shot  ${file}`)
    }
    console.log(`\nreport ${OUT}/report.json`)
  } finally {
    edge.kill()
  }
}

main()

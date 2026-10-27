// The instruction manual and the अर्थNiti wordmark, measured in both
// presentation modes — light and dark — plus a narrow stress viewport.
//
// It covered four modes until 8 September 2026; light and dark high-contrast
// went with the high-contrast feature itself. The measurements that were written
// FOR that mode all stay, because each one also catches a plain-theme failure —
// see the notes on the wordmark surface, the bead and the book's region count.
//
// Neither piece is reachable by the other drivers, and both have a failure mode
// that lint, build and parity all pass through:
//
//   * drive.mjs and mobile-audit.mjs only LOAD routes. The manual's panel opens
//     on a click, so everything inside it — twenty strings, a language select,
//     eight step rows, two buttons — is unmeasured by every existing script.
//   * The wordmark and the book icon resolve their colours through tokens, and
//     the pairing of ink and ground is what has to be right, not either half on
//     its own. Reading the CSS cannot tell you which way round it landed, because
//     both sides of the pair are var() indirections that resolve per theme. Only
//     the painted result can. This is not hypothetical: the wordmark's four
//     tokens had ONE colour case for three days, correct on the #08243F utility
//     strip they were tuned against, and the light half of that pair measured
//     1.65:1 and 1.09:1 the moment the wordmark moved to the white masthead.
//
// So this measures the painted result. Per mode:
//
//   WORDMARK  contrast of each half of the name, and of the swoosh, against
//             whatever surface it is actually sitting on. The selectors are
//             document-wide rather than scoped to a container, which is why this
//             check followed the wordmark from the utility strip into the
//             masthead on 11 Sept 2026 with no edit: it measures the element
//             wherever it is. That is also the trap — a container-scoped selector
//             would have gone quietly missing-and-passing instead.
//   PILL      that the prototype disclaimer is ABSENT. This check used to require
//             it. The owner asked for it off the page outright on 8 Sept 2026 and
//             restated that after the trade-off was put to them, so the check was
//             inverted rather than deleted: a stray re-add now fails the audit.
//   BOOK      the icon rasterised over the surface behind it, the same technique
//             brand-mark.mjs uses: an <img> from a data: URL is a separate
//             document and cannot see the page's custom properties, so the
//             computed --book-* values have to be inlined onto the clone first.
//   PANEL     opened, then every leaf text node checked for size and contrast,
//             every interactive element for a 44px box, and the document for
//             sideways scroll.
//
// Run the Vite dev server first, then: node tools/verify/manual-audit.mjs
// Exit 0: nothing found. 1: a finding, a click that did not open the panel and
// a trap that holds focus still among them. 2: the run could not measure: the
// dev server is down, the working directory is wrong, Edge's DevTools socket
// closed, a page did not load or rendered as Edge's error page or a status
// other than 2xx, a start target is not on the page (any part of the
// wordmark, the book icon, the open button), one Tab from the page body moved
// focus nowhere, the open panel vanished or had under two controls before its
// trap was measured, or the script crashed. A mode stops at its first fault.
// report.json carries the same code as `exit` and lists the faults; a crash,
// or a run that never started, leaves none.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9341
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/manual')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-manual')

// 0 means the run measured and found nothing, 1 a finding, and 2 that the run
// could not measure. Node's own exit on an uncaught error is 1, which reads as a
// finding, so anything thrown or rejected that nothing catches exits 2 instead.
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
// exited 0 with no report.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/manual-audit.mjs'))) {
  console.error(`manual-audit: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/manual-audit.mjs`)
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
    console.error(`manual-audit: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`manual-audit: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
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

// Plain joined strings, not template literals: these probes carry regex and
// escapes, and a template literal is where those quietly stop being what they
// look like.
const COLOUR_HELPERS = [
  '  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }',
  '  const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])',
  '  const Ls = c => { const y = lum(c); return y <= 216 / 24389 ? y * (24389 / 27) : Math.cbrt(y) * 116 - 16 }',
  '  const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round(((Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05)) * 100) / 100 }',
  '  const parse = s => { const m = String(s).match(/[-0-9.]+/g); return m ? m.slice(0, 3).map(Number) : null }',
  '  const alpha = s => { const m = String(s).match(/[-0-9.]+/g); return m && m.length > 3 ? Number(m[3]) : 1 }',
  // The colour actually behind an element: walk up until something opaque turns
  // up, because most wrappers in this app are transparent.
  '  const backdrop = el => {',
  '    let node = el',
  '    while (node) {',
  '      const bg = getComputedStyle(node).backgroundColor',
  '      if (alpha(bg) > 0.5) { const c = parse(bg); if (c) return c }',
  '      node = node.parentElement',
  '    }',
  '    return [255, 255, 255]',
  '  }',
]

// The chrome probe: the wordmark and the relocated prototype pill.
const CHROME_PROBE = [
  '(() => {',
  ...COLOUR_HELPERS,
  '  const out = {}',
  '  const arth = document.querySelector(".ui-wordmark-arth")',
  '  const niti = document.querySelector(".ui-wordmark-niti")',
  '  const wm = document.querySelector(".ui-wordmark-text")',
  '  const swoosh = document.querySelector(".ui-wordmark-swoosh path")',
  '  const bead = document.querySelector(".ui-wordmark-swoosh circle")',
  // Every element the checks below read, named by the selector that missed. An
  // absent one leaves its check measuring nothing: an absent swoosh or bead
  // would read as switched off and pass.
  '  const gone = [[arth, ".ui-wordmark-arth"], [niti, ".ui-wordmark-niti"], [wm, ".ui-wordmark-text"], [swoosh, ".ui-wordmark-swoosh path"], [bead, ".ui-wordmark-swoosh circle"]].filter(([el]) => !el).map(([, sel]) => sel)',
  '  if (gone.length) return { missing: "the wordmark (" + gone.join(", ") + ")" }',
  // Walked from the element, not read off a known constant. The surface under
  // the wordmark used to be the hardcoded #08243F utility strip; since 11 Sept
  // 2026 it is the masthead's var(--color-surface), which is #ffffff light and
  // #10273E dark. Naming the ground here rather than measuring it is what would
  // have made this check certify the move as safe when it was not.
  '  const ground = backdrop(arth)',
  '  out.groundColour = "rgb(" + ground.join(",") + ")"',
  '  out.arthText = arth.textContent',
  '  out.nitiText = niti.textContent',
  '  out.arthRatio = ratio(parse(getComputedStyle(arth).color), ground)',
  '  out.nitiRatio = ratio(parse(getComputedStyle(niti).color), ground)',
  // The swoosh is decoration, so it is reported rather than gated on 4.5 — but a
  // stroke that resolved to the ground colour would mean the token indirection
  // broke, and dL* 0 with a non-transparent stroke says exactly that.
  '  const sc = swoosh ? getComputedStyle(swoosh).stroke : "none"',
  '  out.swooshStroke = sc',
  '  out.swooshDeltaL = (sc === "none" || alpha(sc) === 0) ? null : Math.round(Math.abs(Ls(parse(sc)) - Ls(ground)) * 10) / 10',
  // The bead is the tip of the stroke. If the stroke is switched off for a mode
  // and the bead is not, it floats past the last letter with no line running
  // into it and reads as a full stop after the product name — which is how it
  // shipped into the first capture of the since-removed high-contrast mode.
  '  const bc = bead ? getComputedStyle(bead).fill : "none"',
  '  out.beadOrphaned = (sc === "none" || alpha(sc) === 0) && !(bc === "none" || alpha(bc) === 0)',
  '  out.wordmarkPx = Math.round(parseFloat(getComputedStyle(wm).fontSize) * 10) / 10',
  // A one-line name that wrapped to two lines is a broken wordmark; count line
  // boxes with a Range, since getClientRects on a non-inline box returns one
  // rect however many lines the text took.
  '  const rng = document.createRange(); rng.selectNodeContents(wm)',
  '  out.wordmarkLines = new Set([...rng.getClientRects()].map(r => Math.round(r.top))).size',
  '',
  // Inverted on 8 Sept 2026. This used to REQUIRE the prototype disclaimer in the
  // masthead; the owner asked for it off the page outright, restated after the
  // trade-off was put to them, so the check now guards the decision instead of the
  // old rule — a stray re-add of the element fails the audit rather than passing it.
  // See the note in CLAUDE.md before touching this.
  '  out.pillPresent = !!document.querySelector(".ui-prototype-pill")',
  '  return out',
  '})()',
].join('\n')

// The book icon, rasterised over the surface it sits on. Same approach as
// brand-mark.mjs: serialise the live SVG with its computed --book-* values
// inlined, because an <img> from a data: URL cannot see the host page's custom
// properties and every var() would fall back to nothing.
const BOOK_PROBE = [
  '(async () => {',
  ...COLOUR_HELPERS,
  '  const icon = document.querySelector(".ui-manual-icon")',
  '  if (!icon) return { missing: "the book icon (.ui-manual-icon)" }',
  '  const surface = backdrop(icon.parentElement)',
  '  const cs = getComputedStyle(document.documentElement)',
  '  const NAMES = ["--book-cover","--book-spine","--book-band","--book-seal","--book-seal-rim","--book-pages","--book-pageline","--book-sprout"]',
  '  const vars = NAMES.map(n => n + ":" + cs.getPropertyValue(n).trim()).join(";")',
  '  const clone = icon.cloneNode(true)',
  '  clone.setAttribute("style", vars)',
  '  clone.setAttribute("width", "360")',
  '  clone.setAttribute("height", "336")',
  '  const img = new Image()',
  '  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone))',
  '  await img.decode()',
  '',
  '  const W = 360, H = 336',
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
  '  let ink = 0, total = 0, sum = [0,0,0], n = 0',
  '  for (let y = 0; y < H; y += 2) {',
  '    for (let x = 0; x < W; x += 2) {',
  '      total++',
  '      const c = at(x, y)',
  '      if (Math.abs(Ls(c) - surfL) > 4) { ink++; sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; n++ }',
  '    }',
  '  }',
  '  const mean = n ? sum.map(v => Math.round(v / n)) : surface',
  '',
  // Distinct painted runs across the cover's middle, and the smallest step
  // between two adjacent ones. If the cover, band and seal ever resolve to the
  // same fill, pctInk stays perfect while the three merge into one rectangle —
  // this is the check that sees that. It was written for the high-contrast mode,
  // where every shape WAS the same ink; it outlives it because a token typo
  // produces the same collapse in a plain theme.
  '  const rowY = Math.round(H * 0.60)',
  '  const runs = []',
  '  for (let x = 0; x < W; x++) {',
  '    const c = at(x, rowY)',
  '    const key = c.map(v => Math.round(v / 8)).join(",")',
  '    if (!runs.length || runs[runs.length - 1].key !== key) runs.push({ key, c, len: 1 })',
  '    else runs[runs.length - 1].len++',
  '  }',
  '  const solid = runs.filter(r => r.len >= 3)',
  '  let worstEdge = null',
  '  for (let i = 1; i < solid.length; i++) {',
  '    const d = Math.abs(Ls(solid[i].c) - Ls(solid[i - 1].c))',
  '    if (worstEdge === null || d < worstEdge) worstEdge = d',
  '  }',
  '  return {',
  '    surface: "rgb(" + surface.join(",") + ")",',
  '    pctInk: Math.round((ink / total) * 100),',
  '    meanInk: "rgb(" + mean.join(",") + ")",',
  '    iconVsPage: Math.round(Math.abs(Ls(mean) - surfL) * 10) / 10,',
  '    regions: solid.length,',
  '    worstEdge: worstEdge === null ? null : Math.round(worstEdge * 10) / 10,',
  '    png: cv.toDataURL("image/png"),',
  '  }',
  '})()',
].join('\n')

// The opened panel: every leaf text node and every interactive control inside
// it. Deliberately scoped to the panel — the rest of the page is already covered
// by mobile-audit.mjs, and this is the part nothing else can reach.
const PANEL_PROBE = [
  '(() => {',
  ...COLOUR_HELPERS,
  '  const panel = document.querySelector(".ui-manual-panel")',
  '  if (!panel) return { missing: "panel" }',
  '  const findings = []',
  '  const strings = []',
  '',
  '  for (const el of panel.querySelectorAll("*")) {',
  '    const st = getComputedStyle(el)',
  '    if (st.display === "none" || st.visibility === "hidden") continue',
  '    const r = el.getBoundingClientRect()',
  '    if (r.width < 1 || r.height < 1) continue',
  '',
  // Leaf text only: an ancestor would report its child's text twice and its own
  // inherited colour, which is not what the reader sees.
  '    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(" ")',
  '    if (own) {',
  '      strings.push(own)',
  '      const px = parseFloat(st.fontSize)',
  '      if (px < 12) findings.push({ kind: "TINY", px: Math.round(px * 10) / 10, text: own.slice(0, 40) })',
  '      const fg = parse(st.color)',
  '      const bg = backdrop(el)',
  '      const rr = ratio(fg, bg)',
  // 3.0 for large/bold text, 4.5 otherwise — the WCAG AA split. Bold at >=18.66px
  // or plain at >=24px counts as large.
  '      const large = px >= 24 || (px >= 18.66 && Number(st.fontWeight) >= 700)',
  '      const floor = large ? 3 : 4.5',
  '      if (rr < floor) findings.push({ kind: "CONTRAST", ratio: rr, floor, px: Math.round(px * 10) / 10, text: own.slice(0, 40) })',
  '    }',
  '',
  '    if (el.matches("button, select, a[href], input")) {',
  '      if (r.width < 44 || r.height < 44) {',
  '        findings.push({ kind: "TAP", w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40) })',
  '      }',
  '    }',
  '  }',
  '',
  '  const doc = document.documentElement',
  '  if (doc.scrollWidth > doc.clientWidth + 1) findings.push({ kind: "OVERFLOW", by: doc.scrollWidth - doc.clientWidth })',
  '  if (panel.scrollWidth > panel.clientWidth + 1) findings.push({ kind: "CLIP", by: panel.scrollWidth - panel.clientWidth })',
  // A leaked t() key renders as its own dotted name. The panel is 20 fresh keys
  // in 8 languages, which is exactly where one gets typo\'d.
  '  const leaked = strings.filter(s => /^(man|nav|landing|common)\\.[a-zA-Z0-9.]+$/.test(s))',
  '  for (const k of leaked) findings.push({ kind: "LEAKED-KEY", text: k })',
  '',
  '  return {',
  '    findings,',
  '    strings: strings.length,',
  '    dialogRole: panel.getAttribute("role"),',
  '    modal: panel.getAttribute("aria-modal"),',
  '    focused: document.activeElement === panel || panel.contains(document.activeElement),',
  '    panelW: Math.round(panel.getBoundingClientRect().width),',
  '    panelH: Math.round(panel.getBoundingClientRect().height),',
  '    fitsViewport: panel.getBoundingClientRect().height <= window.innerHeight + 1,',
  '  }',
  '})()',
].join('\n')

// The panel claims aria-modal="true", and that claim has to be true. Without a
// focus trap a keyboard or screen-reader user tabs off the last control and walks
// the whole landing page behind an opaque scrim — every link announced, focusable
// and invisible. The reader most likely to open a guide called "how this works"
// is the one least able to work out what just happened.
//
// Nothing about that is visible in a screenshot, which is why it needed its own
// probe rather than an eye over the PNGs.
const TRAP_LIST = [
  '(() => {',
  '  const panel = document.querySelector(".ui-manual-panel")',
  '  if (!panel) return { missing: true }',
  // Deliberately NOT the component's own FOCUSABLE constant. A probe that reuses
  // the implementation's selector agrees with it by construction and would keep
  // passing if that selector were wrong.
  '  const sel = "a[href], button, select, input, textarea, [tabindex]"',
  '  const items = [...panel.querySelectorAll(sel)]',
  '    .filter(el => !el.disabled && el.getAttribute("tabindex") !== "-1")',
  '    .filter(el => el.getClientRects().length > 0)',
  '  return { count: items.length }',
  '})()',
].join('\n')

// Where focus actually is, and — the part that matters — whether it is still
// inside the panel.
const ACTIVE_DESC = [
  '(() => {',
  '  const panel = document.querySelector(".ui-manual-panel")',
  '  const el = document.activeElement',
  '  if (!el) return { desc: "<none>", inPanel: false }',
  '  const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\\s+/g, " ")',
  '  return {',
  '    desc: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "") + (label ? " " + label.slice(0, 24) : ""),',
  '    inPanel: !!panel && (el === panel || panel.contains(el)),',
  '  }',
  '})()',
].join('\n')

// rawKeyDown, not keyDown: Tab carries no character, and rawKeyDown is the type
// that produces the browser's own focus-navigation default action while still
// firing the page's keydown listener. That default action is the whole point —
// the component only calls preventDefault at the two ends of the cycle and lets
// the browser do the moves in between, so a probe that suppressed it would be
// testing nothing.
async function pressTab(cdp, shift) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type,
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
      modifiers: shift ? 8 : 0,
    })
  }
  await sleep(70)
}

// How the page load ended. Vite answers every route with index.html and a 200,
// so Edge's own error page, or any other status, means the server failed rather
// than the app. A copy Edge revalidated (a 304 on the wire) still reads 200
// here, as measured on 30 Sept 2026, and a status of 0 means Edge does not
// know it.
const LOAD_PROBE = '({ protocol: location.protocol, status: performance.getEntriesByType("navigation")[0]?.responseStatus || 0 })'

// The instrument check for the focus trap, made before the panel opens: one Tab
// from the page body, sent the way pressTab sends it, has to put focus somewhere
// (normally the skip link). If it does not, Edge is not acting on the key events,
// and the trap would read "focus never left the panel" off presses that moved
// nothing. TAB_MOVED blurs whatever the Tab reached, so the panel still opens
// with focus on the body.
const TAB_START = '(() => { document.activeElement?.blur(); window.__tabFrom = document.activeElement; return true })()'
const TAB_MOVED = '(() => { const el = document.activeElement; const moved = el !== window.__tabFrom; delete window.__tabFrom; el?.blur(); return moved })()'

// Clicks the button that opens the guide, or says it is not there. A bare
// .click() on a missing button threw inside the page and ended the run as a
// crash, with no report.
const OPEN_GUIDE = '(() => { const b = document.querySelector(".ui-manual-open"); if (!b) return false; b.click(); return true })()'

const MODES = [
  { name: 'light', theme: 'light', lang: 'en', size: 'md', w: 1440, h: 900, mobile: false },
  { name: 'dark', theme: 'dark', lang: 'en', size: 'md', w: 1440, h: 900, mobile: false },
  // The one that earns its keep: narrowest phone, largest text, dark and Hindi
  // all at once. The switches multiply, and a fixed box that survives each alone
  // overflows here. It carried high contrast as a fourth arm until 8 September
  // 2026 — the remaining three are still enough to have found four defects the
  // plain widths could not.
  { name: '360-stress', theme: 'dark', lang: 'hi', size: 'lg', w: 360, h: 740, mobile: true },
]

// The book must be clearly present and must not collapse into one rectangle.
const MIN_INK = 10
const MIN_VS_PAGE = 10
const MIN_REGIONS = 4
const MIN_EDGE = 3
// Body text on the wordmark's own surface; the two halves of the name are bold
// display text but
// still held to the plain-text floor, because a wordmark nobody can read is not
// a wordmark.
const MIN_TEXT_RATIO = 4.5

// One mode, measured. Returns its report entry: notes are findings, and fault,
// once set, is why the rest of the mode could not be measured. A mode stops at
// its first fault, so nothing is reported off a page already known to be wrong.
async function auditMode(cdp, mode) {
  const entry = { mode: mode.name, fault: null, chrome: null, book: null, panel: null, trap: null, notes: [] }
  const { notes } = entry
  const stop = (why) => {
    entry.fault = why
    return entry
  }

  // mobile: true is load-bearing on the narrow pass — without it the viewport
  // meta tag never applies and every measurement is a desktop measurement in
  // a narrow window.
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: mode.w, height: mode.h, deviceScaleFactor: mode.mobile ? 2 : 1, mobile: mode.mobile,
  })

  await navigate(cdp, APP + '/')
  await sleep(900)
  await cdp.evaluate([
    `localStorage.setItem('sih-theme', '${mode.theme}');`,
    `localStorage.setItem('sih-language', '${mode.lang}');`,
    `localStorage.setItem('sih-textsize', '${mode.size}');`,
    `localStorage.removeItem('sih-dialect');`,
    'true',
  ].join(''))
  await navigate(cdp, APP + '/')
  await sleep(1300)

  console.log(`\n=== ${mode.name}`)

  const load = await cdp.evaluate(LOAD_PROBE)
  if (load.protocol === 'chrome-error:') return stop(`${APP}/ never rendered: it is Edge's own error page. Is the dev server still up?`)
  if (load.status && (load.status < 200 || load.status > 299)) return stop(`${APP}/ never rendered: it answered HTTP ${load.status}`)

  // --- the wordmark and the relocated pill
  const chrome = await cdp.evaluate(CHROME_PROBE)
  entry.chrome = chrome
  if (chrome.missing) return stop(`${chrome.missing} is not on the page at all`)
  for (const [k, v] of Object.entries(chrome)) console.log(`    ${k.padEnd(14)} ${v}`)
  if (chrome.arthRatio < MIN_TEXT_RATIO) notes.push(`wordmark "${chrome.arthText}" is only ${chrome.arthRatio}:1 on ${chrome.groundColour}`)
  if (chrome.nitiRatio < MIN_TEXT_RATIO) notes.push(`wordmark "${chrome.nitiText}" is only ${chrome.nitiRatio}:1 on ${chrome.groundColour}`)
  if (chrome.swooshDeltaL !== null && chrome.swooshDeltaL < 3) notes.push(`the swoosh is painted but only dL* ${chrome.swooshDeltaL} from ${chrome.groundColour} — the token indirection is wrong`)
  if (chrome.beadOrphaned) notes.push('the swoosh is switched off but its bead is still painted — it reads as a full stop after the name')
  if (chrome.wordmarkLines > 1) notes.push(`the wordmark wrapped onto ${chrome.wordmarkLines} lines`)
  if (chrome.pillPresent) notes.push('the prototype disclaimer pill is back on the page — it was removed on the owner\'s instruction')

  // --- the book icon. The guard comes before png is touched: a missing icon
  // has no capture to write.
  const { png, ...book } = await cdp.evaluate(BOOK_PROBE)
  entry.book = book
  if (book.missing) return stop(`${book.missing} is not on the page at all`)
  for (const [k, v] of Object.entries(book)) console.log(`    ${k.padEnd(14)} ${v}`)
  writeFileSync(`${OUT}/book-${mode.name}.png`, Buffer.from(png.split(',')[1], 'base64'))
  if (book.pctInk < MIN_INK) notes.push(`only ${book.pctInk}% of the book icon is painted — it may be background-on-background`)
  if (book.iconVsPage < MIN_VS_PAGE) notes.push(`the book icon averages dL* ${book.iconVsPage} from the card behind it`)
  if (book.regions < MIN_REGIONS) notes.push(`the cover's centre line crosses only ${book.regions} regions — the seal and band have merged into it`)
  if (book.worstEdge !== null && book.worstEdge < MIN_EDGE) notes.push(`adjacent regions of the book differ by only dL* ${book.worstEdge}`)

  // The top 520px: utility strip, masthead, tricolour, nav. Named for the
  // chrome rather than for the strip, because the wordmark this capture
  // exists to eyeball moved from the first band into the second on 11 Sept
  // 2026 and the clip covers both either way.
  const chromeShot = await cdp.send('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 0, width: mode.w, height: Math.min(mode.h, 520), scale: 1 },
  })
  writeFileSync(`${OUT}/chrome-${mode.name}.png`, Buffer.from(chromeShot.data, 'base64'))

  // --- the Tab control, after the capture so a focused skip link is not in it
  await cdp.evaluate(TAB_START)
  await pressTab(cdp, false)
  if (!(await cdp.evaluate(TAB_MOVED))) {
    return stop('one Tab from the page body left focus where it was: Edge is not acting on the key events, so the focus trap cannot be measured')
  }

  // --- open it and measure the panel
  if (!(await cdp.evaluate(OPEN_GUIDE))) return stop('the open button (.ui-manual-open) is not on the page at all')
  await sleep(700)
  const panel = await cdp.evaluate(PANEL_PROBE)
  entry.panel = panel
  if (panel.missing) {
    notes.push('clicking the open button did not render the panel')
  } else {
    console.log(`    panel          ${panel.panelW}x${panel.panelH}  role=${panel.dialogRole} modal=${panel.modal} focused=${panel.focused} strings=${panel.strings}`)
    if (panel.dialogRole !== 'dialog' || panel.modal !== 'true') notes.push('the panel is not announced as a modal dialog')
    if (!panel.focused) notes.push('focus did not move into the panel when it opened')
    if (!panel.fitsViewport) notes.push(`the panel is ${panel.panelH}px tall in a ${mode.h}px viewport — its top will be unreachable`)
    for (const f of panel.findings) {
      notes.push(`${f.kind}  ` + Object.entries(f).filter(([k]) => k !== 'kind').map(([k, v]) => `${k}=${v}`).join(' '))
    }
  }

  const open = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(`${OUT}/panel-${mode.name}.png`, Buffer.from(open.data, 'base64'))
  // The trap, Escape and the focus hand-back all act on the panel. Without it
  // they would only restate the finding above as three more.
  if (panel.missing) return entry

  // --- the focus trap: Tab and Shift+Tab must both stay inside the panel. The
  // panel rendered a moment ago, so either guard here means the run lost what
  // it was measuring, not that the trap failed.
  const trap = await cdp.evaluate(TRAP_LIST)
  if (trap.missing) return stop('the panel was gone before the focus trap could be measured')
  if (trap.count < 2) return stop(`only ${trap.count} focusable control in the panel — the trap has nothing to cycle`)

  // Two full laps plus a couple of extra presses, so the wrap at each end is
  // crossed rather than merely approached.
  const steps = trap.count + 2
  const forward = []
  for (let i = 0; i < steps; i++) {
    await pressTab(cdp, false)
    forward.push(await cdp.evaluate(ACTIVE_DESC))
  }
  const back = []
  for (let i = 0; i < steps; i++) {
    await pressTab(cdp, true)
    back.push(await cdp.evaluate(ACTIVE_DESC))
  }

  const escaped = [...forward, ...back].filter((step) => !step.inPanel)
  // If Tab moved nothing at all, every step reports "still in the panel" and
  // the trap looks perfect while being untested: the same false zero this repo
  // has hit twice, with getClientRects() and with the font shorthand. The Tab
  // control proved the key events move focus, so focus that never travelled
  // here is the trap holding it still: a finding.
  const distinct = new Set(forward.map((step) => step.desc)).size

  entry.trap = { count: trap.count, distinct, forward, back }

  if (distinct < 2) {
    notes.push(
      `Tab never moved focus inside the panel (${distinct} distinct target over ${steps} presses), though it did before the panel opened — the trap is stuck`,
    )
  }
  if (escaped.length) {
    notes.push(
      `focus left the modal ${escaped.length}x: ${escaped.map((step) => step.desc).slice(0, 4).join(' | ')}`,
    )
  }
  if (!escaped.length && distinct >= 2) {
    console.log(`    trap           ${trap.count} stops, ${distinct} visited, focus never left the panel`)
  }

  // Escape has to close it, or a keyboard user is stuck behind the scrim.
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)
  const closed = await cdp.evaluate('!document.querySelector(".ui-manual-panel") && getComputedStyle(document.body).overflow !== "hidden"')
  if (!closed) notes.push('Escape did not close the panel, or the body scroll lock was left on')

  // Closing must hand focus back to the button that opened it. Escape used to
  // skip this and leave focus on a node it had just unmounted, which drops a
  // keyboard user at the top of the document to walk the whole chrome again.
  const restored = await cdp.evaluate(
    'document.activeElement === document.querySelector(".ui-manual-open")',
  )
  if (closed && !restored) {
    notes.push('closing with Escape did not return focus to the button that opened the guide')
  }
  return entry
}

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
  const faults = []
  const report = []
  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const mode of MODES) {
      const entry = await auditMode(cdp, mode)
      if (entry.notes.length) failures++
      for (const n of entry.notes) console.log(`    FAIL  ${n}`)
      if (entry.fault) {
        faults.push(`${mode.name}: ${entry.fault}`)
        console.log(`    FAULT ${entry.fault}`)
      } else if (!entry.notes.length) {
        console.log('    ok    wordmark, icon and panel hold up; no disclaimer pill')
      }
      report.push(entry)
    }
  } finally {
    edge.kill()
  }

  // A fault outranks a finding: a mode that could not be measured has not been
  // shown clean, whatever the others found.
  const exit = faults.length ? 2 : failures ? 1 : 0
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit, faults, report }, null, 2))
  console.log(`\n${MODES.length} modes checked, ${failures} with problems, ${faults.length} stopped by a fault.`)
  console.log(`Captures and report.json in ${OUT}`)
  process.exit(exit)
}

main().catch((error) => {
  console.error(error)
  // A crash is not a finding.
  crashExit()
})

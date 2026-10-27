// Does a form control line up with the one beside it, in every language?
//
// The other verifiers cannot see this. drive.mjs asks whether the right text
// rendered; mobile-audit asks whether a thumb can use it; lang-layout compares a
// page's *chrome* geometry against English. None of them look at two controls that
// share a grid row and are supposed to start on the same line.
//
// Three findings, all of them measured rather than read off the stylesheet:
//
//   MISALIGN  two controls in one grid row start at different heights, because one
//             question wrapped to more lines than the other and pushed its own box
//             down. English wraps one of /business's three questions at a laptop
//             width; every Indic translation is longer, so the pair separates in
//             more languages than it does in English.
//   ORPHAN    a required-field asterisk that did not stay with the last word of its
//             question. A space in the markup is a soft wrap opportunity, so the
//             marker was free to sit alone on a line of its own under the text —
//             and that extra line is itself a cause of MISALIGN.
//   PREFIX    the ₹ inside a money input is not centred on the box, or has drifted
//             outside the room its padding reserves.
//
// A fourth, NOT-FLEX, is read off the computed style: a .ui-field that is not a
// flex column cannot line its control up with its neighbour's. --broken flattens
// the column on purpose, so it is not reported there.
//
// Two things about the design are deliberate:
//
//   * It measures the *control* (input/select/textarea), never the wrapper. A
//     .ui-money-field wrapper's top sits 8px above its input's, so comparing
//     wrappers with plain inputs would compare two different things and report a
//     shift that is not on the screen.
//   * It reports, per row, how many line boxes each question took. If every row in
//     a run has questions of equal height then nothing was ever misaligned to catch
//     and a clean result means nothing — so an uneven row is counted as the
//     instrument check and its absence is called out, with a WARNING that does
//     not change the exit: the run did measure, it had nothing to catch.
//
// Pass --broken to put the defect back: the .ui-field column is flattened and a
// space is restored in front of every asterisk. That pass MUST fail. A check that
// has only ever been seen to pass has not been seen to work. It exits 1 only when
// what it planted is reported: BREAK_IT broke an asterisk on at least one load,
// MISALIGN fired, and under --sweep ORPHAN fired too (three coarse widths can miss
// ORPHAN's band; see --sweep below). PREFIX and NOT-FLEX are not planted and do
// not count. Anything less exits 2 and names what missed, so that neither a dead
// check nor a crash can be read as the refuter working.
//
// Run the Vite dev server first, then:  node tools/verify/field-align.mjs
// Exit 0: every load measured, nothing found. 1: a finding of any kind. 2: the
// run could not measure: the dev server is down or went away mid-run (a
// navigation failed), the working directory is wrong, a --sweep= or --case=
// value does not parse, a page is NOT-RENDERED (Chrome's error page or an
// answer other than 2xx, on / as well, where it skips the case; on a
// measured route also #main never drawing its text, or none of what the route
// is here for: .ui-field on /business, /location and /finance, the asterisk on
// /login), a load is UNSEEDED (its <html lang> or --ui-scale is not the case's,
// so the app did not take the settings written for it), no page was measured,
// the DevTools socket closed, the refuter missed, or the script crashed or
// stopped short of its verdict. report.json carries the same code as `exit` and
// names the faults and misses; a run that stops early (a crash, a failed
// navigation, a closed socket) or never started leaves none.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9351
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/fields')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-fields')
const BROKEN = process.argv.includes('--broken')

// 0 means the run measured and found nothing, 1 a finding (under --broken, the
// checks fired), and 2 that the run could not measure. Node's own exit on an
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
// A run that ends without reaching its verdict exits 2. Before this, a CDP socket
// that closed under a pending send left the send unsettled, the event loop
// drained, and node exited 0 with no report. The verdict overrides it.
process.exitCode = 2
// Every path in this file resolves against the working directory, and this one
// reads no repo file, so the wrong one would measure and write its report there.
if (!existsSync(resolve('tools/verify/field-align.mjs'))) {
  console.error(`field-align: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/field-align.mjs`)
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
    console.error(`field-align: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`field-align: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
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
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
    // Edge going away closes the socket under sends whose reply can never come.
    // A pending promise does not keep node alive, so they used to drain away
    // with the event loop and node exited 0 with no report. They fail instead.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
    })
  }

  send(method, params = {}, useSession = true) {
    // undici drops a frame sent on a socket that is not open, without throwing,
    // so this would wait for a reply that never comes. Nothing sends before ready.
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

async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    // A failed poll is the page between documents, so it is one more try. A closed
    // socket is not: polling on would turn it into a page that never drew.
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`).catch((err) => {
      if (cdp.closed) throw err
      return 0
    })
    if (len > 40) return true
    await sleep(120)
  }
  return false
}

// Chrome's error page, or an answer other than 2xx, is not the app whatever #main
// holds. A copy Edge revalidated (a 304 on the wire) still reads 200 here, as
// measured on 30 Sept 2026. responseStatus 0 means the browser does not know,
// which is not a fault.
const PAGE_STATE = `({ error: location.protocol === 'chrome-error:', status: performance.getEntriesByType('navigation')[0]?.responseStatus || 0 })`

// Loads an app URL and waits for it to draw. A navigation that failed outright
// (refused or reset: the dev server went away mid-run) throws, since nothing after
// it can measure. Returns whether #main drew and, when the page is not the app's,
// why.
async function visit(cdp, url, floor) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`field-align: ${url} did not load (${errorText}). Is the dev server still running?`)
  const since = Date.now()
  const drew = await waitForRender(cdp)
  // The fixed wait this replaced stays as a floor, because every recorded run
  // measured at it, and a late draw still gets a settle: the app sets the text
  // scale and <html lang> in effects that run after its first paint.
  await sleep(Math.max(200, floor - (Date.now() - since)))
  const { error, status } = await cdp.evaluate(PAGE_STATE)
  const fault = error ? `Chrome's own error page`
    : status && (status < 200 || status > 299) ? `HTTP ${status}` : ''
  return { drew, fault }
}

// Puts the two halves of the defect back, so the probe can be watched failing.
// The space is appended to the question's own text node rather than inserted as a
// new one, because that is what the JSX used to produce — a separate whitespace
// node would change which node .previousSibling finds and the probe would report a
// different problem than the one being reproduced.
const BREAK_IT = [
  '(() => {',
  '  const css = document.createElement("style")',
  '  css.textContent = ".ui-field { display: block !important } .ui-field > :first-child { margin-bottom: 0 !important } .ui-required { margin-left: 0 !important }"',
  '  document.head.appendChild(css)',
  '  let n = 0',
  '  for (const star of document.querySelectorAll(".ui-required")) {',
  '    const prev = star.previousSibling',
  '    if (prev && prev.nodeType === 3 && !prev.textContent.endsWith(" ")) { prev.textContent += " "; n++ }',
  '  }',
  '  return n',
  '})()',
].join('\n')

// Kept as a joined string array rather than a template literal, like the other
// probes here: it is full of quotes and the bytes should stay what they look like.
const PROBE = [
  '(() => {',
  '  const out = { fields: 0, stars: 0, rows: [], orphans: [], prefix: [], notFlex: [] }',
  '  const desc = (el) => {',
  '    const cls = String(el.className || "").split(" ").filter(Boolean).slice(0, 2).join(".")',
  '    return el.tagName.toLowerCase() + (cls ? "." + cls : "")',
  '  }',
  // A Range reports one rect per line box on a block element too; an element's own
  // getClientRects() only does that when it is inline. That difference has already
  // cost this repo a confident zero once (see the SPLIT-FIGURE note in CLAUDE.md).
  '  const lineCount = (el) => {',
  '    const r = document.createRange()',
  '    r.selectNodeContents(el)',
  '    const tops = new Set()',
  '    for (const rect of r.getClientRects()) tops.add(Math.round(rect.top))',
  '    return tops.size',
  '  }',
  '',
  '  const fields = [...document.querySelectorAll(".ui-field")]',
  '  out.fields = fields.length',
  '  for (const f of fields) {',
  '    if (getComputedStyle(f).display !== "flex") out.notFlex.push(desc(f))',
  '  }',
  '',
  // Group by (parent, own top): a grid row is exactly the set of cells that start
  // at the same y inside the same container. Keying the outer map on the element
  // itself avoids inventing ids for the DOM.
  '  const rows = new Map()',
  '  for (const f of fields) {',
  '    const control = f.querySelector("input, select, textarea")',
  '    if (!control) continue',
  '    const parent = f.parentElement',
  '    if (!rows.has(parent)) rows.set(parent, new Map())',
  '    const inner = rows.get(parent)',
  '    const key = String(Math.round(f.getBoundingClientRect().top))',
  '    if (!inner.has(key)) inner.set(key, [])',
  '    const question = f.firstElementChild',
  '    inner.get(key).push({',
  '      name: control.name || desc(control),',
  '      top: Math.round(control.getBoundingClientRect().top * 10) / 10,',
  '      lines: question ? lineCount(question) : 0,',
  '    })',
  '  }',
  '  for (const inner of rows.values()) {',
  '    for (const cells of inner.values()) {',
  '      if (cells.length < 2) continue',
  '      const tops = cells.map((c) => c.top)',
  '      out.rows.push({',
  '        names: cells.map((c) => c.name),',
  '        lines: cells.map((c) => c.lines),',
  '        dy: Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10,',
  '      })',
  '    }',
  '  }',
  '',
  '  out.stars = document.querySelectorAll(".ui-required").length',
  '  for (const star of document.querySelectorAll(".ui-required")) {',
  '    const where = desc(star.parentElement)',
  '    const prev = star.previousSibling',
  '    if (!prev || prev.nodeType !== 3 || !prev.textContent.trim()) {',
  '      out.orphans.push({ where, why: "no question text node in front of the marker" })',
  '      continue',
  '    }',
  '    const r = document.createRange()',
  '    r.setStart(prev, 0)',
  '    r.setEnd(prev, prev.textContent.length)',
  '    const rects = [...r.getClientRects()]',
  '    if (!rects.length) { out.orphans.push({ where, why: "the question drew no line boxes" }); continue }',
  '    const last = rects[rects.length - 1]',
  '    const box = star.getBoundingClientRect()',
  '    const sameLine = Math.abs(box.top - last.top) <= 3',
  '    const afterWord = box.left >= last.right - 1',
  '    if (!sameLine || !afterWord) {',
  '      const cs = getComputedStyle(star.parentElement)',
  '      out.orphans.push({',
  '        where,',
  '        tail: prev.textContent.trim().slice(-22),',
  '        why: sameLine ? "marker is not after the last word" : "marker dropped onto a line of its own",',
  '        markerTop: Math.round(box.top),',
  '        lastLineTop: Math.round(last.top),',
  // Which break opportunity did the browser take? `overflow-wrap: anywhere` is
  // inherited from .ui-card app-wide and lets Chromium split a token to fill a
  // line, which is a break the markup cannot remove by deleting a space.
  '        wrap: cs.overflowWrap + " / " + cs.wordBreak + " / " + cs.whiteSpace + " / " + cs.lineBreak,',
  '      })',
  '    }',
  '  }',
  '',
  '  for (const p of document.querySelectorAll(".ui-money-prefix")) {',
  '    const input = p.parentElement.querySelector("input")',
  '    if (!input) { out.prefix.push({ name: "?", why: "no input beside the marker" }); continue }',
  '    const pr = p.getBoundingClientRect()',
  '    const ir = input.getBoundingClientRect()',
  '    const pad = parseFloat(getComputedStyle(input).paddingLeft)',
  '    out.prefix.push({',
  '      name: input.name,',
  '      dy: Math.round(((pr.top + pr.height / 2) - (ir.top + ir.height / 2)) * 10) / 10,',
  '      inside: pr.left >= ir.left - 0.5 && pr.right <= ir.left + pad + 0.5,',
  '    })',
  '  }',
  '',
  '  return out',
  '})()',
].join('\n')

const ROUTES = ['/business', '/location', '/finance', '/login']
const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']
// What the app writes to --ui-scale on <html> for each text size:
// String(TEXT_SCALES[size]) in App.jsx. This is a copy. When the app's values
// change, every case at a changed size stops as UNSEEDED and prints the value
// it found.
const SCALES = { sm: '0.94', md: '1', lg: '1.18' }
// The case as the app applied it, read once #main has drawn. Both are set by
// effects that run on every route: LanguageContext sets <html lang> to the
// language code, and TextSizeControl in the utility bar sets the scale.
const SEEN = `({ lang: document.documentElement.lang, scale: document.documentElement.style.getPropertyValue('--ui-scale').trim() })`

// The viewport width is a blunt instrument on these pages and it took a failed run
// to notice: every form sits in a `max-w-4xl` section, so 1440, 1180 and 1000 all
// produce the SAME 896px section and byte-identical line breaking. Only two things
// really move where a question wraps — the text scale, and a viewport narrow enough
// that the section stops being capped (below ~930px) while the grid is still two
// columns (above the 640px `sm:` breakpoint).
const CASES = []
for (const lang of LANGS) {
  CASES.push({ lang, width: 1440, textsize: 'md' })
  CASES.push({ lang, width: 900, textsize: 'md' })
  CASES.push({ lang, width: 900, textsize: 'lg' })
}

// --sweep walks that responsive band 4px at a time on one page. Coarse widths cannot
// reproduce ORPHAN, because the marker only drops when the last line is full to
// within the width of a single asterisk — a band a few pixels wide that three
// arbitrary widths will miss. The sweep is how the check gets shown to work, and in
// the fixed build it is also much stronger evidence than three widths: it proves the
// marker holds at every width in the range, not just at the ones I happened to pick.
// --sweep walks the whole band; --sweep=856:944 walks part of it, which is what to
// use when re-checking a fix, since the widths that failed are already known and a
// full band is 132 loads of waiting to be told about the same few.
const SWEEP_FLAG = process.argv.find((a) => a === '--sweep' || a.startsWith('--sweep='))
const SWEEP = Boolean(SWEEP_FLAG)
const SWEEP_BAND = (SWEEP_FLAG || '').includes('=')
  ? SWEEP_FLAG.slice('--sweep='.length).split(':').map(Number)
  : [680, 940]
const [SWEEP_FROM, SWEEP_TO] = SWEEP_BAND

// --case=en:896 runs one configuration on one page, for when a finding needs a
// closer look and a 132-load sweep is three minutes of waiting to see it again.
const CASE_FLAG = process.argv.find((a) => a.startsWith('--case='))
const CASE_PARTS = (CASE_FLAG || '').slice('--case='.length).split(':')
const ONE_CASE = { lang: CASE_PARTS[0], width: Number(CASE_PARTS[1]), textsize: CASE_PARTS[2] || 'md' }

// Checked before main() fetches anything, so a plain process.exit(2) is safe. A
// value that did not parse used to run anyway: --sweep=900 left the band's end
// undefined, the loop made no load, and the run exited 0. Widths are whole pixels
// above 0 because Emulation.setDeviceMetricsOverride takes an integer and reads 0
// as no override at all. A language or size the app does not know would be
// measured as its default under this one's label.
const isWidth = (n) => Number.isInteger(n) && n > 0
if (SWEEP && !(SWEEP_BAND.length === 2 && isWidth(SWEEP_FROM) && isWidth(SWEEP_TO) && SWEEP_FROM <= SWEEP_TO)) {
  console.error(`field-align: ${SWEEP_FLAG} is not a band. Use --sweep for 680:940, or --sweep=FROM:TO in whole px with FROM <= TO.`)
  process.exit(2)
}
if (CASE_FLAG && !(CASE_PARTS.length <= 3 && LANGS.includes(ONE_CASE.lang) && isWidth(ONE_CASE.width) && Object.hasOwn(SCALES, ONE_CASE.textsize))) {
  console.error(`field-align: ${CASE_FLAG} is not a case. Use --case=LANG:WIDTH[:SIZE], LANG one of ${LANGS.join(' ')}, WIDTH in whole px, SIZE one of ${Object.keys(SCALES).join(' ')}.`)
  process.exit(2)
}

const SWEEP_CASES = []
if (SWEEP) {
  for (const lang of ['en', 'ta']) {
    for (let width = SWEEP_FROM; width <= SWEEP_TO; width += 4) SWEEP_CASES.push({ lang, width, textsize: 'md' })
  }
}

async function main() {
  if (!(await requireServer(APP + '/', 'Start the Vite dev server first: npm run dev in ./frontend.'))) return
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const cases = CASE_FLAG ? [ONE_CASE] : SWEEP ? SWEEP_CASES : CASES
  const routes = CASE_FLAG || SWEEP ? ['/business'] : ROUTES
  // --case wins over --sweep, and only the sweep owes the refuter an ORPHAN.
  const sweeping = SWEEP && !CASE_FLAG

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
  // Loads that could not be measured. Each one makes the run a 2.
  const faults = []
  const byKind = { MISALIGN: 0, ORPHAN: 0, PREFIX: 0, 'NOT-FLEX': 0 }
  let loads = 0
  let findings = 0
  let plantedLoads = 0
  let unevenRows = 0
  let worstPrefix = 0

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const kase of cases) {
      const tag = `${kase.lang}-${kase.width}${kase.textsize === 'md' ? '' : '-' + kase.textsize}`
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: kase.width, height: 1000, deviceScaleFactor: 1, mobile: false })
      // Only somewhere on the app's origin to write the case's settings from, so
      // whether it drew does not matter. A page that is not the app's cannot hold
      // them, and the case is skipped rather than measured in the last one's.
      const home = await visit(cdp, APP + '/', 900)
      if (home.fault) {
        faults.push(`${tag} /: NOT-RENDERED: ${home.fault}; the case was not run`)
        console.log(`FAULT ${tag} /  NOT-RENDERED: ${home.fault}; the case was not run`)
        continue
      }
      await cdp.evaluate([
        `localStorage.setItem('sih-language', '${kase.lang}');`,
        `localStorage.setItem('sih-textsize', '${kase.textsize}');`,
        `localStorage.setItem('sih-theme', 'light');`,
        'localStorage.removeItem(\'sih-dialect\');',
        'true',
      ].join(''))

      for (const route of routes) {
        const label = `${tag} ${route}`
        const page = await visit(cdp, APP + route, 1000)
        let fault = page.fault ? 'NOT-RENDERED: ' + page.fault
          : page.drew ? '' : 'NOT-RENDERED: #main never drew its text'
        let planted = 0
        let m = null
        if (!fault) {
          // A seed the app did not take (a renamed key, or its mount effects on /
          // writing the last case's settings back over this one's) would measure
          // another case under this one's label, and a clean one reads as a pass.
          const seen = await cdp.evaluate(SEEN)
          if (seen.lang !== kase.lang || seen.scale !== SCALES[kase.textsize]) {
            fault = `UNSEEDED: the page has lang ${seen.lang || '(none)'} and --ui-scale ${seen.scale || '(unset)'}, not ${kase.lang} and ${SCALES[kase.textsize]}`
          }
        }
        if (!fault) {
          // How many asterisks BREAK_IT broke: 0 on every load would mean the
          // ORPHAN half of the refuter planted nothing.
          if (BROKEN) planted = await cdp.evaluate(BREAK_IT)
          m = await cdp.evaluate(PROBE)
          // A load with none of what its route is here for measured nothing, and
          // would read as clean. The three form steps lay their questions out in
          // .ui-field. /login has one question, in no .ui-field, and is here for
          // its asterisk, so a .ui-field test would fault it on every load.
          const [subject, found] = route === '/login' ? ['.ui-required', m.stars] : ['.ui-field', m.fields]
          if (!found) fault = `NOT-RENDERED: no ${subject} on the page`
        }
        if (fault) {
          faults.push(`${label}: ${fault}`)
          console.log(`FAULT ${label}  ${fault}`)
          report.push({ ...kase, route, fault, measured: m })
          continue
        }
        loads++
        if (planted > 0) plantedLoads++

        const notes = []
        const note = (kind, text) => {
          byKind[kind]++
          notes.push(kind.padEnd(10) + text)
        }
        // --broken flattens the column on purpose, so this one is not news there.
        if (!BROKEN) for (const bad of m.notFlex) note('NOT-FLEX', `${bad} is not a flex column, so nothing aligns`)
        for (const row of m.rows) {
          if (new Set(row.lines).size > 1) unevenRows++
          if (row.dy > 1.5) note('MISALIGN', `${row.names.join(' / ')} start ${row.dy}px apart (questions took ${row.lines.join(' / ')} lines)`)
        }
        for (const o of m.orphans) note('ORPHAN', `${o.where}: ${o.why}${o.tail ? ' — "' + o.tail + '"' : ''}`)
        for (const p of m.prefix) {
          worstPrefix = Math.max(worstPrefix, Math.abs(p.dy || 0))
          if (p.why) note('PREFIX', `${p.name}: ${p.why}`)
          else if (Math.abs(p.dy) > 2) note('PREFIX', `${p.name}: ₹ is ${p.dy}px off the box's centre`)
          else if (!p.inside) note('PREFIX', `${p.name}: ₹ sits outside the padding reserved for it`)
        }

        if (notes.length) {
          findings += notes.length
          console.log(`FAIL  ${label}`)
          for (const n of notes) console.log(`        ${n}`)
        } else {
          console.log(`ok    ${label}  (${m.fields} fields, ${m.rows.length} paired rows, ${m.prefix.length} ₹ markers)`)
        }
        report.push({ ...kase, route, planted, notes, measured: m })
      }
    }
  } finally {
    edge.kill()
  }

  // What --broken planted and nothing reported. It used to pass on any finding
  // at all, so a dead MISALIGN check passed on ORPHAN's findings, or on a real
  // PREFIX. The sweep is the only mode that reliably reaches ORPHAN's band.
  const missed = []
  if (BROKEN) {
    if (!plantedLoads) missed.push('BREAK_IT (it broke no asterisk on any load)')
    if (!byKind.MISALIGN) missed.push('MISALIGN')
    if (sweeping && !byKind.ORPHAN) missed.push('ORPHAN')
  }
  // A load that could not be measured, a run that measured nothing and a
  // refuter that missed each make it a 2, whatever else was found.
  const exit = !loads || faults.length || missed.length ? 2 : findings ? 1 : 0
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit, broken: BROKEN, loads, findings, byKind, plantedLoads, unevenRows, faults, missed, report }, null, 2))

  const kinds = Object.entries(byKind).map(([kind, n]) => `${n} ${kind}`).join(', ')
  console.log(`\n${loads} page loads, ${findings} findings (${kinds}).`)
  console.log(`worst ₹ offset from a box's centre: ${worstPrefix}px`)
  // The instrument check. A run where every paired row had questions of equal
  // height never gave MISALIGN anything to find, so a clean result would say
  // nothing about the fix. It warns and leaves the exit alone: the run did
  // measure, and a 2 would say it could not.
  console.log(`rows where the two questions took a different number of lines: ${unevenRows}`)
  if (!unevenRows) console.log('WARNING: no uneven row in the whole run — the alignment check was never exercised.')
  if (faults.length) {
    console.log(`\n${faults.length} instrument fault(s); the run did not measure what they name:`)
    for (const f of faults.slice(0, 20)) console.log('  ' + f)
    if (faults.length > 20) console.log(`  ... and ${faults.length - 20} more in report.json`)
  }
  if (!loads) console.log('\nNo page was measured, so the run says nothing.')
  if (BROKEN) {
    if (missed.length) console.log(`\n--broken missed ${missed.join('; ')}. What it plants has to be reported; anything less is not the checks working.`)
    else if (exit === 1) console.log('\n--broken as expected: the checks fire when the defect is present.')
    else console.log('\n--broken: what it planted was reported, but not every load was measured, so this is not a pass.')
  }
  console.log(`report.json in ${OUT}`)
  process.exit(exit)
}

main().catch((err) => {
  console.error(err)
  // A crash is not a finding, and under --broken 1 is the pass.
  crashExit()
})

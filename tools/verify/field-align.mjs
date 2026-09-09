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
// Two things about the design are deliberate:
//
//   * It measures the *control* (input/select/textarea), never the wrapper. A
//     .ui-money-field wrapper's top sits 8px above its input's, so comparing
//     wrappers with plain inputs would compare two different things and report a
//     shift that is not on the screen.
//   * It reports, per row, how many line boxes each question took. If every row in
//     a run has questions of equal height then nothing was ever misaligned to catch
//     and a clean result means nothing — so an uneven row is counted as the
//     instrument check and its absence is called out.
//
// Pass --broken to put the defect back: the .ui-field column is flattened and a
// space is restored in front of every asterisk. That pass MUST fail. A check that
// has only ever been seen to pass has not been seen to work.
//
// Run the Vite dev server first, then:  node tools/verify/field-align.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9351
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/fields')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-fields')
const BROKEN = process.argv.includes('--broken')

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
  '  const out = { fields: 0, rows: [], orphans: [], prefix: [], notFlex: [] }',
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
const [SWEEP_FROM, SWEEP_TO] = (SWEEP_FLAG || '').includes('=')
  ? SWEEP_FLAG.split('=')[1].split(':').map(Number)
  : [680, 940]
const SWEEP_CASES = []
if (SWEEP) {
  for (const lang of ['en', 'ta']) {
    for (let width = SWEEP_FROM; width <= SWEEP_TO; width += 4) SWEEP_CASES.push({ lang, width, textsize: 'md' })
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  // --case=en:896 runs one configuration on one page, for when a finding needs a
  // closer look and a 132-load sweep is three minutes of waiting to see it again.
  const one = (process.argv.find((a) => a.startsWith('--case=')) || '').slice(7)
  const cases = one
    ? [{ lang: one.split(':')[0], width: Number(one.split(':')[1]), textsize: one.split(':')[2] || 'md' }]
    : SWEEP ? SWEEP_CASES : CASES
  const routes = one || SWEEP ? ['/business'] : ROUTES

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
  let loads = 0
  let findings = 0
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
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: kase.width, height: 1000, deviceScaleFactor: 1, mobile: false })
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(900)
      await cdp.evaluate([
        `localStorage.setItem('sih-language', '${kase.lang}');`,
        `localStorage.setItem('sih-textsize', '${kase.textsize}');`,
        `localStorage.setItem('sih-theme', 'light');`,
        'localStorage.removeItem(\'sih-dialect\');',
        'true',
      ].join(''))

      for (const route of routes) {
        await cdp.send('Page.navigate', { url: APP + route })
        await sleep(1000)
        if (BROKEN) await cdp.evaluate(BREAK_IT)
        const m = await cdp.evaluate(PROBE)
        loads++

        const notes = []
        // --broken flattens the column on purpose, so this one is not news there.
        if (!BROKEN) for (const bad of m.notFlex) notes.push(`NOT-FLEX  ${bad} is not a flex column, so nothing aligns`)
        for (const row of m.rows) {
          if (new Set(row.lines).size > 1) unevenRows++
          if (row.dy > 1.5) notes.push(`MISALIGN  ${row.names.join(' / ')} start ${row.dy}px apart (questions took ${row.lines.join(' / ')} lines)`)
        }
        for (const o of m.orphans) notes.push(`ORPHAN    ${o.where}: ${o.why}${o.tail ? ' — "' + o.tail + '"' : ''}`)
        for (const p of m.prefix) {
          worstPrefix = Math.max(worstPrefix, Math.abs(p.dy || 0))
          if (p.why) notes.push(`PREFIX    ${p.name}: ${p.why}`)
          else if (Math.abs(p.dy) > 2) notes.push(`PREFIX    ${p.name}: ₹ is ${p.dy}px off the box's centre`)
          else if (!p.inside) notes.push(`PREFIX    ${p.name}: ₹ sits outside the padding reserved for it`)
        }

        const label = `${kase.lang}-${kase.width}${kase.textsize === 'md' ? '' : '-' + kase.textsize} ${route}`
        if (notes.length) {
          findings += notes.length
          console.log(`FAIL  ${label}`)
          for (const n of notes) console.log(`        ${n}`)
        } else {
          console.log(`ok    ${label}  (${m.fields} fields, ${m.rows.length} paired rows, ${m.prefix.length} ₹ markers)`)
        }
        report.push({ ...kase, route, notes, measured: m })
      }
    }
  } finally {
    edge.kill()
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify({ broken: BROKEN, loads, findings, unevenRows, report }, null, 2))

  console.log(`\n${loads} page loads, ${findings} findings.`)
  console.log(`worst ₹ offset from a box's centre: ${worstPrefix}px`)
  // The instrument check. A run where every paired row had questions of equal
  // height never gave MISALIGN anything to find, so a clean result would say
  // nothing about the fix.
  console.log(`rows where the two questions took a different number of lines: ${unevenRows}`)
  if (!unevenRows) console.log('WARNING: no uneven row in the whole run — the alignment check was never exercised.')
  if (BROKEN) console.log(findings ? '\n--broken as expected: the checks fire when the defect is present.' : '\n--broken found NOTHING. The checks do not work.')
  console.log(`report.json in ${OUT}`)
  process.exit(findings ? 1 : 0)
}

main()

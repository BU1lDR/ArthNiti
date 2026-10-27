// text-align.mjs — do sibling cells start their text on the same line?
//
// Reported as "I want all the text to be equally aligned", against the footer:
// "अर्थNiti" sat ~50px below "Your business journey" and the third column's
// heading because column 1 stacked the brand mark in the flow ABOVE its heading.
// Three columns, three different first lines. (The third heading read "Helpline"
// then. It is common.helpTitle now, "Where to get help", over common.helpText,
// and the column no longer carries a phone number.)
//
// No existing verifier can see that, and the reason is structural rather than an
// oversight:
//   drive.mjs        asks whether the right TEXT rendered.
//   mobile-audit.mjs asks whether a thumb can use it, and whether anything
//                    overflows or clips. A ragged row does neither.
//   lang-layout.mjs  compares a CHROME CONTAINER's box against English at the
//                    same width. Both live and broken footers are identical in
//                    every language, so it reports dx = 0 either way.
//   field-align.mjs  is the closest relative and is scoped to FORM CONTROLS
//                    sharing a grid row — it never looks at text blocks, and the
//                    footer is not a form.
//   print/hero/brand measure one element or one palette.
// Every one of them passes on a footer whose three columns start on three
// different lines, because all the text is present, nothing overflows, and no
// container moved.
//
// THE COMPARISON RULE IS WHAT HOLDS THE FALSE-POSITIVE RATE AT ZERO, and it is
// the only interesting decision in this file. "All text aligned" cannot mean
// "every first line in a row shares a top" — the landing hero is legitimately a
// bare <h1> beside a padded card, and a card's text SHOULD start lower than the
// heading next to it. So the check compares two cells only when their first
// text-bearing element carries the SAME TAG AND THE SAME CLASS LIST. Same class
// means the author intended the same thing in both cells, which is exactly when
// a difference is a defect rather than a design. In the footer all three cells
// lead with .ui-footer-title, so the broken version fires and the hero never
// does.
//
// THE COLUMN ARM NEEDS A SECOND HALF OF THAT RULE, and it took a real false
// positive to find: two cells are only comparable on a left edge if the layout
// anchors both of them leftward. See anchorOf() below for the case — a
// right-aligned utility strip grouped with a left-aligned footer line, on the
// degenerate signature of a classless <span>, reporting 312.9px on all 30 loads
// with nothing on the page misplaced. The anchor is therefore part of the group
// key, and each group is compared on the edge its anchor makes meaningful.
//
// Both arms took one more half on 29 Sept 2026, the first run with the result
// pages seeded, and again from real false positives. A grid's justify-items
// anchors its items as justify-self does (the flag glyph on /schemes, 5px). And
// a row whose cells each centre their own text is compared on the text's centre,
// not its first line (the /analysis buttons, 11px). See anchorOf() and
// centresOwnText().
//
// Findings:
//   RAGGED-ROW  two cells in the same row lead with the same kind of element,
//               and its first LINE BOX sits at a different top. The footer bug.
//   RAGGED-COL  two stacked siblings lead with the same kind of element, anchored
//               the same way, and their anchored edges disagree. A heading
//               indented away from the heading below it, i.e. the same defect
//               rotated.
//   INERT       a load where no same-signature pair existed to compare. Every
//               route renders the footer's three titles in one row at all three
//               widths (it stacks only at 800px and under), so this means the
//               probe saw nothing, and the run exits 2.
//   NOT-MOUNTED a route where the app did not render, and
//   UNSEEDED    a result route with no result in the app's state, i.e. showing
//               its empty state. Either way the load did not measure the page it
//               names. Neither is an alignment finding, and the run exits 2.
//
// Exit codes: 0 clean, 1 a RAGGED-ROW or RAGGED-COL (a PANEL-INSET is reported,
// never failed on), 2 the instrument failed: the dev server is down, the working
// directory is wrong, an INERT, NOT-MOUNTED or UNSEEDED load, a navigation that
// failed, a CDP socket that closed, a missing fixture, a seed version AppContext
// no longer reads, a crash, or --broken missing its planted defect on any load.
// A run that stops before its verdict exits 2 as well. Under --broken, 1 is the
// expected result, so nothing else may exit with it. report.json carries the
// same code as `exit`; anything thrown (a crash, a failed navigation, a closed
// socket), or a run that never started, leaves none.
//
// Usage (from the repo root):
//   node tools/verify/text-align.mjs
//   node tools/verify/text-align.mjs --broken   # must exit 1
//
// --broken restores the stacked footer at runtime (.ui-footer-brandblock back to
// display: block, mark back to a 12px bottom margin). It must fail; a check that
// has never fired is indistinguishable from a check that has nothing to find.
// It passes only if that footer is reported on every load: other findings on a
// --broken run are real ones the plain run also reports, and do not count.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9371
const APP = 'http://localhost:5173'
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-textalign')
const OUT_DIR = resolve('screenshots/verify/textalign')
const BROKEN = process.argv.includes('--broken')

// 0 means the run measured and found nothing, 1 a finding (under --broken, the
// planted footer fired on every load), and 2 that the run could not measure.
// Node's own exit on an uncaught error is 1, which reads as a finding and under
// --broken as the pass, so anything thrown or rejected that nothing catches
// exits 2 instead.
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
// A run that ends without reaching its verdict exits 2. Before this, a CDP
// socket that closed under a pending send left the send unsettled, the event
// loop drained, and node exited 0 with no report. The verdict overrides it.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/text-align.mjs'))) {
  console.error(`text-align: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/text-align.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's goes
// once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT_DIR, 'report.json'), { force: true })

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
    console.error(`text-align: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`text-align: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// Tolerances. 2px on the vertical because a grid track's used height can land on
// a sub-pixel and the defect being watched for is measured in tens of px; 1px on
// the horizontal because nothing legitimately shifts a left edge by a fraction.
const ROW_TOL = 2
const COL_TOL = 1

// What the app is seeded with. The first version of this file wrote
// case_good.json, the bare backend response, as the sessionStorage value.
// AppContext reads {v, data}, found no v and discarded it, so every load ran on
// a blank application: the result routes were measured on their empty states
// and the form routes with no answers. Nothing failed, because --broken breaks
// the footer and the empty states have one too. These are the answers the other
// drivers seed, and the result beside them is the driver's real response.
const SEED_FORMS = {
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
}

// AppContext discards just as silently a payload whose v is not in its
// READABLE_VERSIONS. Every field SEED_FORMS carries is a version 4 field, so the
// seed says 4, and this refuses to start once AppContext stops reading 4.
const SEED_VERSION = 4
{
  const file = 'frontend/src/context/AppContext.jsx'
  const m = readFileSync(resolve(file), 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `text-align: ${file} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite SEED_FORMS in the current shape and raise SEED_VERSION.`
      : `text-align: READABLE_VERSIONS not found in ${file}; update the parse in text-align.mjs.`)
    process.exit(2)
  }
}

// A result route has to show the seeded result, or the load measures its empty
// state. The app writes its state back to sessionStorage once it has mounted,
// so a seed it discarded reads back with no result.
const RESULT_ROUTES = ['/analysis', '/schemes', '/advisory', '/report']
const SEEDED = `(() => {
  try { return !!JSON.parse(sessionStorage.getItem('sih-application')).data.result } catch { return false }
})()`

// Why a load did not mount, when the page can say: Edge's own error page, or a
// document the server answered with an error status (0 means unknown, not a
// failure). Asked only of a load that did not mount, so it names the fault and
// cannot fail a page that rendered.
const NOT_LOADED = `(() => {
  if (location.protocol === 'chrome-error:') return 'Edge showed its own error page'
  const status = performance.getEntriesByType('navigation')[0]?.responseStatus
  return status && (status < 200 || status > 299) ? 'HTTP ' + status : ''
})()`

const ROUTES = [
  '/', '/login', '/profile', '/business', '/location',
  '/finance', '/analysis', '/schemes', '/advisory', '/report', '/privacy',
]

// Three passes, not one. The footer defect is language-independent, but a
// longer script grows a heading to two lines, which is precisely when a row's
// cells stop agreeing — so Hindi and Tamil are the interesting cases, and the
// narrower width is where a heading wraps first.
const CASES = [
  { name: 'en-1440', lang: 'en', width: 1440, height: 900 },
  { name: 'hi-1280', lang: 'hi', width: 1280, height: 900 },
  { name: 'ta-1024', lang: 'ta', width: 1024, height: 900 },
]

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
      this.ws.addEventListener('error', () => rej(new Error('socket')))
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed')))
    })
    this.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      const s = this.pending.get(m.id)
      if (!s) return
      this.pending.delete(m.id)
      m.error ? s.reject(new Error(s.method + ': ' + m.error.message)) : s.resolve(m.result)
    })
    // An Edge that dies mid-run closes this socket, and the send waiting on it
    // never settled. A pending promise does not keep node alive, so the loop
    // drained and the run ended with no verdict. Failing every one sends the
    // run to main()'s catch, which exits 2.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const s of this.pending.values()) s.reject(new Error(s.method + ': CDP socket closed'))
      this.pending.clear()
    })
  }

  send(method, params = {}, useSession = true) {
    // A frame sent on a closed socket is dropped without an error, so its reply
    // could never come. Nothing sends before `ready`, so not OPEN means closed.
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(method + ': CDP socket closed'))
    const id = this.next++
    const env = { id, method, params }
    if (useSession && this.sessionId) env.sessionId = this.sessionId
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej, method })
      this.ws.send(JSON.stringify(env))
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

// The probe. Measures used values in the page rather than reading CSS, for the
// reason this repo keeps rediscovering: a rule can look correct and still lose
// to the cascade.
//
// It takes the first LINE BOX via a Range rather than the element's own rect.
// getBoundingClientRect() on a block returns one box however many lines the text
// wrapped to, and getClientRects() returns one rect per line box only for INLINE
// elements — so on a two-line heading the element rect's top is the block's top,
// which happens to coincide here and would silently stop coinciding the moment
// anything gains padding. A Range reports line boxes either way.
const PROBE = `(() => {
  const TOL_ROW = ${ROW_TOL}
  const TOL_COL = ${COL_TOL}

  const visible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
    const r = el.getBoundingClientRect()
    return r.width > 0.5 && r.height > 0.5
  }

  // .sr-only is a deliberately clipped 1px box; an element parked off the left
  // edge is the skip-link spot. Neither is on the page for a reader to align.
  const offstage = (el) => {
    if (el.closest('.sr-only')) return true
    const r = el.getBoundingClientRect()
    return r.right <= 0
  }

  const hasOwnText = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true
    }
    return false
  }

  // SVG <text> is not page text. The brand mark's coin carries a ₹ glyph, and
  // it was the FIRST text-bearing element in both the masthead and the footer —
  // so the first version of this probe compared the rupee inside the 54px logo
  // against the rupee inside the 38px one and reported a 5.4px ragged edge on
  // all ten routes. That offset is the viewBox scaling, not a layout defect: an
  // SVG glyph is placed by the graphic's own coordinate system, which is exactly
  // what this check does not measure.
  const inSvg = (el) => !!el.closest('svg')

  // Does this box read as a container? A reader accepts text inset inside a
  // visible box — that is what a card is — and reads the same inset with no box
  // as a misalignment. So the classification below turns on whether the cells
  // being compared AGREE about this, not on whether any of them paints:
  //   all paint / none paint -> structurally parallel, a difference is a defect
  //   some paint, some do not -> a padded panel measured against bare text,
  //                              which this probe cannot judge and should not
  //                              pretend to.
  const paints = (el) => {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo)
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue
      if (cs.backgroundColor && !/^rgba\\(0, 0, 0, 0\\)$/.test(cs.backgroundColor) &&
          cs.backgroundColor !== 'transparent') return true
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true
      if (cs.boxShadow && cs.boxShadow !== 'none') return true
      if (cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) return true
      if (parseFloat(cs.borderTopLeftRadius) > 0) return true
    }
    return false
  }

  // Document-order walk for the first element in this cell that actually paints
  // text. Not the cell's textContent — we need the ELEMENT so its class list can
  // be compared, and its first line box measured.
  const firstText = (cell) => {
    if (hasOwnText(cell) && visible(cell) && !offstage(cell) && !inSvg(cell)) return cell
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_ELEMENT)
    let el
    while ((el = walker.nextNode())) {
      if (!hasOwnText(el)) continue
      if (!visible(el) || offstage(el) || inSvg(el)) continue
      return el
    }
    return null
  }

  const lineBoxes = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.1 && r.height > 0.1)
    rects.sort((a, b) => a.top - b.top || a.left - b.left)
    return rects
  }

  const sig = (el) => {
    const cls = [...el.classList].sort().join('.')
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '')
  }

  // Which edge does the layout anchor this cell's content to? The COLUMN arm
  // compares LEFT edges, and that is only a meaningful comparison between cells
  // the layout pushes leftward. A right-anchored cell's left edge is a function
  // of how wide its content happens to be, so measuring it against a
  // left-anchored cell's is comparing two different quantities.
  //
  // The case that forced this: the wordmark moved from the utility strip to the
  // masthead on 11 Sept 2026, which left .ui-utilitybar-inner right-aligned with
  // a single child. That band's first text became the language picker's globe at
  // x=328.9, which grouped — on a bare classless <span> signature — with the
  // footer's disclaimer at x=16 and reported a 312.9px ragged column on all 30
  // loads. Neither cell is misplaced. One band is right-aligned by design.
  //
  // THIS READS COMPUTED STYLE RATHER THAN MEASURING, which is the exception in
  // this file and needs its reason on the record: anchoring is a property of the
  // CONTAINER that positions the text, not of the text's own box. The globe sits
  // at the LEFT edge of a right-anchored cluster, so its gap to the cell's left
  // edge (313px) is smaller than its gap to the right (661px) — every
  // measurement of the text itself classifies it as left-anchored, and only the
  // container says otherwise.
  //
  // text-align inherits, so reading it anywhere down the chain finds it wherever
  // it was set; justify-content and justify-self do not, hence the walk. Known
  // blind spot: margin-left: auto is the other way to push a flex item rightward
  // and getComputedStyle resolves it to a used px value, so it cannot be seen
  // here. Nothing in this app uses it that way.
  //
  // A grid also places its items with justify-items, which the walk did not read
  // until the result pages were first measured with a result in them (29 Sept
  // 2026). .ui-feature-icon is a 48px grid with place-items: center, and the
  // /schemes tier icons all sat in boxes at one x. But Windows has no flag emoji,
  // so the central tier's flag draws as the letters IN, 19.6px wide against
  // 29.6px, and its centred left edge landed 5px right of the others on every
  // pass. The item's own justify-self overrides the container's justify-items, so
  // a container's is read only for its own text (child is null) or for a child
  // that left justify-self at auto.
  const ENDISH = new Set(['flex-end', 'end', 'right'])
  const MIDISH = new Set(['center'])
  const anchorOf = (cellNode, el) => {
    let n = el
    let child = null
    while (n) {
      const cs = getComputedStyle(n)
      if (ENDISH.has(cs.textAlign) || ENDISH.has(cs.justifySelf)) return 'end'
      if (MIDISH.has(cs.textAlign) || MIDISH.has(cs.justifySelf)) return 'mid'
      if (/flex|grid/.test(cs.display)) {
        if (ENDISH.has(cs.justifyContent)) return 'end'
        if (MIDISH.has(cs.justifyContent)) return 'mid'
      }
      if (/grid/.test(cs.display) && (!child || /^(auto|normal)$/.test(getComputedStyle(child).justifySelf))) {
        const items = cs.justifyItems.split(' ').pop()
        if (ENDISH.has(items)) return 'end'
        if (MIDISH.has(items)) return 'mid'
      }
      if (n === cellNode) break
      child = n
      n = n.parentElement
    }
    return 'start'
  }

  // The same question on the vertical axis, asked only of the text's own box.
  // The row arm compares first line boxes, which assumes a cell's text starts at
  // its top. A button does not do that: it centres its label, so a label that
  // wraps starts higher in the same box. The three buttons at the foot of
  // /analysis are one height in one grid row, and in Tamil at 1024px the back
  // button's label takes two lines, so its first line sat 11px above its
  // neighbour's while the centres agreed to 0.5px. A row group whose cells all
  // centre their own text is compared on the centre of that text instead.
  //
  // Only the element's own box, not its ancestors'. .ui-footer-brandblock
  // centres the footer's first title against the brand mark, and a sibling's
  // height is how a real offset gets in, so an ancestor's centring keeps the
  // first-line comparison. That footer is the defect this file was written for.
  const centresOwnText = (el) => {
    const cs = getComputedStyle(el)
    const last = (v) => v.split(' ').pop()
    if (/flex/.test(cs.display)) {
      return last(/column/.test(cs.flexDirection) ? cs.justifyContent : cs.alignItems) === 'center'
    }
    if (/grid/.test(cs.display)) return last(cs.alignItems) === 'center' || last(cs.alignContent) === 'center'
    return false
  }

  const describe = (el) => {
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ')
    return t.length > 44 ? t.slice(0, 44) + '\\u2026' : t
  }

  // Where a container is. Used only to name a finding, so the closest ancestor
  // carrying a ui-* class is the most useful handle a human could act on.
  const locate = (el) => {
    let n = el
    while (n && n !== document.body) {
      const ui = [...n.classList].find((c) => c.startsWith('ui-'))
      if (ui) return '.' + ui
      n = n.parentElement
    }
    return el.tagName.toLowerCase()
  }

  const findings = []
  let comparedRows = 0
  let comparedCols = 0

  for (const container of document.querySelectorAll('body *')) {
    // Only layout cells. Restricting to non-inline children is what keeps a
    // paragraph full of <span>s out of the row arm: its children share a top and
    // the same signature, so they would be "compared" thousands of times and
    // report nothing. Inline boxes are not cells.
    const kids = [...container.children].filter((k) => {
      if (!visible(k) || offstage(k)) return false
      const cs = getComputedStyle(k)
      if (cs.position === 'absolute' || cs.position === 'fixed') return false
      if (cs.display === 'inline' || cs.display === 'contents') return false
      return true
    })
    if (kids.length < 2) continue

    const cells = []
    for (const k of kids) {
      const el = firstText(k)
      if (!el) continue
      const boxes = lineBoxes(el)
      if (!boxes.length) continue
      const middle = (Math.min(...boxes.map((b) => b.top)) + Math.max(...boxes.map((b) => b.bottom))) / 2
      cells.push({
        node: k,
        el,
        sig: sig(el),
        paints: paints(k),
        centred: centresOwnText(el),
        middle: Math.round(middle * 10) / 10,
        top: Math.round(boxes[0].top * 10) / 10,
        left: Math.round(boxes[0].left * 10) / 10,
        right: Math.round(boxes[0].right * 10) / 10,
        mid: Math.round(((boxes[0].left + boxes[0].right) / 2) * 10) / 10,
        anchor: anchorOf(k, el),
        rowTop: Math.round(k.getBoundingClientRect().top * 10) / 10,
        text: describe(el),
      })
    }
    if (cells.length < 2) continue

    const where = locate(container)

    // --- ROW arm: cells whose own boxes start on the same line. -------------
    const rows = new Map()
    for (const c of cells) {
      const key = Math.round(c.rowTop / 4)
      if (!rows.has(key)) rows.set(key, [])
      rows.get(key).push(c)
    }
    for (const row of rows.values()) {
      if (row.length < 2) continue
      const bySig = new Map()
      for (const c of row) {
        if (!bySig.has(c.sig)) bySig.set(c.sig, [])
        bySig.get(c.sig).push(c)
      }
      for (const [signature, group] of bySig) {
        if (group.length < 2) continue
        comparedRows += 1
        // Centres only when every cell centres its own text. A group of one class
        // list where some cells centre and some do not is itself an inconsistency,
        // and comparing first lines is what reports it. Splitting such a group by
        // edge instead would mean the pair is never compared at all.
        const edge = group.every((c) => c.centred) ? 'middle' : 'top'
        const tops = group.map((c) => c[edge])
        const spread = Math.max(...tops) - Math.min(...tops)
        if (spread <= TOL_ROW) continue
        const mixed = group.some((c) => c.paints) && group.some((c) => !c.paints)
        findings.push({
          kind: mixed ? 'PANEL-INSET' : 'RAGGED-ROW',
          axis: 'row',
          edge,
          where,
          signature,
          spread: Math.round(spread * 10) / 10,
          cells: group.map((c) => ({ top: c[edge], panel: c.paints, text: c.text })),
        })
      }
    }

    // --- COLUMN arm: stacked siblings, same kind of element, different left. -
    const stacked = cells.filter((c) => rows.get(Math.round(c.rowTop / 4)).length === 1)
    if (stacked.length >= 2) {
      const bySig = new Map()
      for (const c of stacked) {
        // The anchor is part of the signature rather than a demotion applied
        // after a spread is found. Demoting would report the pair and then
        // forgive it, which reads as a near-miss; these two are not a column at
        // all, so they should never be grouped. Same reasoning as the ROW arm
        // keying on the class list: group only what the layout says is parallel.
        const key = c.sig + ' @' + c.anchor
        if (!bySig.has(key)) bySig.set(key, [])
        bySig.get(key).push(c)
      }
      for (const [signature, group] of bySig) {
        if (group.length < 2) continue
        comparedCols += 1
        // Compare the edge the anchor makes meaningful. Right-aligned cells share
        // a right edge and centred ones share a centre; only left-anchored cells
        // are answerable on their left. (No backticks in here — the probe is a
        // template literal and one would close it early. index.css and
        // print-audit.mjs both carry this warning; I did it anyway.)
        const edge = group[0].anchor === 'end' ? 'right' : group[0].anchor === 'mid' ? 'mid' : 'left'
        const at = group.map((c) => c[edge])
        const spread = Math.max(...at) - Math.min(...at)
        if (spread <= TOL_COL) continue
        const mixed = group.some((c) => c.paints) && group.some((c) => !c.paints)
        findings.push({
          kind: mixed ? 'PANEL-INSET' : 'RAGGED-COL',
          axis: 'col',
          edge,
          where,
          signature,
          spread: Math.round(spread * 10) / 10,
          cells: group.map((c) => ({ at: c[edge], panel: c.paints, text: c.text })),
        })
      }
    }
  }

  // De-duplicate: a nested container reports the same pair as its parent when
  // the parent has a single child wrapping them.
  const seen = new Set()
  const unique = []
  for (const f of findings) {
    const key = f.kind + '|' + f.where + '|' + f.signature + '|' + f.spread
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(f)
  }

  return { findings: unique, comparedRows, comparedCols }
})()`

// Faithful refuter: put the footer back the way it was reported. Not an
// approximation — display: block returns the mark to the flow above the heading,
// and the margin is the mb-3 the JSX used to carry.
const BREAK_CSS = `
  .ui-footer-brandblock { display: block !important; }
  .ui-footer-brandblock > svg { margin-bottom: 12px !important; }
`
// What that defect is reported as: the three footer titles in one row. Every
// route has the footer, so --broken must see this on every load.
const PLANTED_SIGNATURE = 'p.ui-footer-title'

async function main() {
  if (!(await requireServer(APP + '/', 'Start the Vite dev server first: npm run dev in ./frontend.'))) return
  mkdirSync(OUT_DIR, { recursive: true })

  let payload = null
  try {
    const result = JSON.parse(readFileSync(resolve('screenshots/verify/case_good.json'), 'utf8'))
    payload = JSON.stringify({ v: SEED_VERSION, data: { ...SEED_FORMS, result } })
  } catch {
    console.error('  ! screenshots/verify/case_good.json missing or unreadable — run: node tools/verify/refresh-cases.mjs')
    process.exitCode = 2
    return
  }

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    '--window-size=1440,900',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
  ], { stdio: 'ignore' })

  const report = { broken: BROKEN, tolerances: { row: ROW_TOL, col: COL_TOL }, loads: [], findings: [] }

  try {
    let wsUrl
    for (let i = 0; i < 80; i++) {
      try {
        // Bounded: a listener that accepts and never answers would otherwise hold
        // this for undici's five-minute header timeout.
        const j = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).json()
        if (j.webSocketDebuggerUrl) { wsUrl = j.webSocketDebuggerUrl; break }
      } catch {}
      await sleep(250)
    }
    if (!wsUrl) throw new Error('no CDP endpoint')

    const cdp = new CDP(wsUrl)
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // A navigation that failed still replies, with errorText set: a Vite that
    // went down mid-run answers net::ERR_CONNECTION_REFUSED here. That is a
    // fault, never a finding, so it throws to main()'s catch, which exits 2.
    const navigate = async (url) => {
      const { errorText } = await cdp.send('Page.navigate', { url })
      if (errorText) throw new Error(`text-align: ${url} did not load (${errorText}). Is the Vite dev server still up?`)
    }

    console.log(`\n  text alignment — ${ROUTES.length} routes x ${CASES.length} cases` +
      (BROKEN ? '  [--broken: MUST FAIL]' : ''))

    for (const kase of CASES) {
      // Seeded per document, not once: the result pages read sessionStorage on
      // mount, and a full navigation drops anything set on the previous one.
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          try {
            sessionStorage.setItem('sih-application', ${JSON.stringify(payload)})
            localStorage.setItem('sih-language', ${JSON.stringify(kase.lang)})
            localStorage.setItem('sih-theme', 'light')
            localStorage.setItem('sih-textsize', 'md')
            localStorage.removeItem('sih-dialect')
          } catch {}
        `,
      })
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: kase.width, height: kase.height, deviceScaleFactor: 1, mobile: false,
      })

      // Warm-up: Vite compiles on demand, so the first load of a session is slow
      // enough that a measurement taken on it is a measurement of a half-built
      // page.
      await navigate(APP + '/')
      await sleep(1600)

      console.log(`\n  ${kase.name}  (${kase.width}x${kase.height}, lang=${kase.lang})`)

      for (const route of ROUTES) {
        await navigate(APP + route)
        await sleep(900)

        if (BROKEN) {
          await cdp.evaluate(`(() => {
            const s = document.createElement('style')
            s.textContent = ${JSON.stringify(BREAK_CSS)}
            document.head.appendChild(s)
            return true
          })()`)
          await sleep(150)
        }

        const mounted = await cdp.evaluate(
          `!!document.querySelector('.ui-shell') && document.body.innerText.trim().length > 200`)
        if (!mounted) {
          const why = (await cdp.evaluate(NOT_LOADED)) || 'the app did not render'
          report.findings.push({ kind: 'NOT-MOUNTED', case: kase.name, route, why })
          console.log(`    ${route.padEnd(11)}  ! did not mount: ${why}`)
          continue
        }
        if (RESULT_ROUTES.includes(route) && !(await cdp.evaluate(SEEDED))) {
          report.findings.push({ kind: 'UNSEEDED', case: kase.name, route })
          console.log(`    ${route.padEnd(11)}  ! no result in the app's state: the seed was not read`)
          continue
        }

        const res = await cdp.evaluate(PROBE)
        const load = {
          case: kase.name,
          route,
          comparedRows: res.comparedRows,
          comparedCols: res.comparedCols,
          findings: res.findings.length,
        }
        report.loads.push(load)
        for (const f of res.findings) report.findings.push({ case: kase.name, route, ...f })

        if (res.comparedRows === 0 && res.comparedCols === 0) {
          report.findings.push({ kind: 'INERT', case: kase.name, route })
          console.log(`    ${route.padEnd(11)}  INERT — nothing comparable on this route`)
          continue
        }

        const hard = res.findings.filter((f) => f.kind !== 'PANEL-INSET')
        const soft = res.findings.filter((f) => f.kind === 'PANEL-INSET')
        const tag = hard.length ? `${hard.length} finding(s)` : 'ok'
        console.log(`    ${route.padEnd(11)}  rows ${String(res.comparedRows).padStart(3)}` +
          `  cols ${String(res.comparedCols).padStart(3)}   ${tag}` +
          (soft.length ? `  (+${soft.length} panel inset)` : ''))
        for (const f of res.findings) {
          console.log(`        ${f.kind} ${f.where} ${f.signature} spread ${f.spread}px`)
          for (const c of f.cells) {
            const at = f.axis === 'row' ? `${f.edge} ${c.top}` : `${f.edge} ${c.at}`
            console.log(`          ${at.padEnd(12)} ${c.panel ? '[panel]' : '[bare] '} "${c.text}"`)
          }
        }
      }
    }

    await cdp.send('Target.closeTarget', { targetId }, false)
  } finally {
    edge.kill()
  }

  // A load that did not mount, or showed an empty state in place of the result,
  // did not measure the page it names. It is not an alignment finding either
  // way, so it fails the run as an instrument fault, never as a finding. So
  // does an INERT load in a plain run: the footer row is on every load at these
  // widths, so comparing nothing means the probe saw nothing, and a plain run
  // used to exit 0 on it. Under --broken it already fails through `missed`,
  // because a load that compared nothing cannot carry the planted row.
  const INSTRUMENT = ['NOT-MOUNTED', 'UNSEEDED']
  const instrument = report.findings.filter((f) => INSTRUMENT.includes(f.kind) || (!BROKEN && f.kind === 'INERT'))
  const real = report.findings.filter((f) => !INSTRUMENT.includes(f.kind) && f.kind !== 'INERT' && f.kind !== 'PANEL-INSET')
  const panel = report.findings.filter((f) => f.kind === 'PANEL-INSET')
  const inert = report.findings.filter((f) => f.kind === 'INERT')
  const rows = report.loads.reduce((n, l) => n + l.comparedRows, 0)
  const cols = report.loads.reduce((n, l) => n + l.comparedCols, 0)

  // The refuter counts only the defect it planted, on every load. "Any finding"
  // stopped meaning anything once the result pages were seeded: a copy of this
  // file with BREAK_CSS switched off still exited 1 on /schemes and /analysis
  // findings, which the stacked footer has nothing to do with.
  const planted = (l) => report.findings.some((f) => f.case === l.case && f.route === l.route &&
    f.kind === 'RAGGED-ROW' && f.signature === PLANTED_SIGNATURE)
  const missed = BROKEN ? report.loads.filter((l) => !planted(l)) : []
  const exit = instrument.length ? 2
    : BROKEN ? (report.loads.length && !missed.length ? 1 : 2)
      : real.length ? 1 : 0
  // Written with its exit code, so a report on disk never reads as a pass for a
  // run that could not measure.
  writeFileSync(resolve(OUT_DIR, 'report.json'), JSON.stringify({ exit, ...report }, null, 2))

  console.log(`\n  ${report.loads.length} loads  ${rows} row groups  ${cols} column groups compared`)
  console.log(`  ${real.length} finding(s)${inert.length ? `, ${inert.length} inert route(s)` : ''}`)
  if (panel.length) {
    // Reported, never failed on. A padded panel measured against bare text is a
    // design decision — .ui-card insets its content too — so this arm names the
    // places a human should look rather than pretending to a verdict.
    const seen = new Set()
    for (const f of panel) seen.add(`${f.route} ${f.where} ${f.signature} ${f.spread}px`)
    console.log(`  ${panel.length} panel inset(s), reported not failed:`)
    for (const s of seen) console.log(`    - ${s}`)
  }
  console.log(`  report: screenshots/verify/textalign/report.json`)

  if (instrument.length) {
    console.log(`\n  ! ${instrument.length} load(s) measured nothing:`)
    for (const f of instrument) console.log(`    - ${f.case} ${f.route} ${f.kind}${f.why ? `: ${f.why}` : ''}`)
    console.log('  The run is incomplete, whatever the other loads found.\n')
  } else if (BROKEN && exit === 1) {
    console.log(`\n  --broken: the stacked footer fired on all ${report.loads.length} loads, as it must.\n`)
  } else if (BROKEN) {
    console.log(`\n  ! --broken: the stacked footer went unreported on ${missed.length} of ${report.loads.length} load(s):`)
    for (const l of missed) console.log(`    - ${l.case} ${l.route}`)
    console.log('  The check is inert there, not clean.\n')
  } else if (real.length) {
    console.log('')
  } else {
    console.log('\n  all sibling cells start their text on the same line.\n')
  }
  process.exit(exit)
}

// A crash is not a finding, and under --broken 1 is the pass.
main().catch((e) => { console.error(e); crashExit() })

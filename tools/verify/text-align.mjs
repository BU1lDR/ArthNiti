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
// Findings:
//   RAGGED-ROW  two cells in the same row lead with the same kind of element,
//               and its first LINE BOX sits at a different top. The footer bug.
//   RAGGED-COL  two stacked siblings lead with the same kind of element, anchored
//               the same way, and their anchored edges disagree. A heading
//               indented away from the heading below it, i.e. the same defect
//               rotated.
//   INERT       a route where no same-signature pair existed to compare. Proves
//               nothing, so it is reported rather than counted as a pass — same
//               instrument check as field-align's unevenRows.
//
// Usage (from the repo root):
//   node tools/verify/text-align.mjs
//   node tools/verify/text-align.mjs --broken   # must exit 1
//
// --broken restores the stacked footer at runtime (.ui-footer-brandblock back to
// display: block, mark back to a 12px bottom margin). It must fail; a check that
// has never fired is indistinguishable from a check that has nothing to find.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9371
const APP = 'http://localhost:5173'
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-textalign')
const OUT_DIR = resolve('screenshots/verify/textalign')
const BROKEN = process.argv.includes('--broken')

// Tolerances. 2px on the vertical because a grid track's used height can land on
// a sub-pixel and the defect being watched for is measured in tens of px; 1px on
// the horizontal because nothing legitimately shifts a left edge by a fraction.
const ROW_TOL = 2
const COL_TOL = 1

const ROUTES = [
  '/', '/login', '/profile', '/business', '/location',
  '/finance', '/analysis', '/schemes', '/advisory', '/report',
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
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('socket')))
    })
    this.ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      const s = this.pending.get(m.id)
      if (!s) return
      this.pending.delete(m.id)
      m.error ? s.reject(new Error(s.method + ': ' + m.error.message)) : s.resolve(m.result)
    })
  }

  send(method, params = {}, useSession = true) {
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
  const ENDISH = new Set(['flex-end', 'end', 'right'])
  const MIDISH = new Set(['center'])
  const anchorOf = (cellNode, el) => {
    let n = el
    while (n) {
      const cs = getComputedStyle(n)
      if (ENDISH.has(cs.textAlign) || ENDISH.has(cs.justifySelf)) return 'end'
      if (MIDISH.has(cs.textAlign) || MIDISH.has(cs.justifySelf)) return 'mid'
      if (/flex|grid/.test(cs.display)) {
        if (ENDISH.has(cs.justifyContent)) return 'end'
        if (MIDISH.has(cs.justifyContent)) return 'mid'
      }
      if (n === cellNode) break
      n = n.parentElement
    }
    return 'start'
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
      cells.push({
        node: k,
        el,
        sig: sig(el),
        paints: paints(k),
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
        const tops = group.map((c) => c.top)
        const spread = Math.max(...tops) - Math.min(...tops)
        if (spread <= TOL_ROW) continue
        const mixed = group.some((c) => c.paints) && group.some((c) => !c.paints)
        findings.push({
          kind: mixed ? 'PANEL-INSET' : 'RAGGED-ROW',
          axis: 'row',
          where,
          signature,
          spread: Math.round(spread * 10) / 10,
          cells: group.map((c) => ({ top: c.top, panel: c.paints, text: c.text })),
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  let payload = null
  try {
    payload = readFileSync(resolve('screenshots/verify/case_good.json'), 'utf8')
  } catch {
    console.error('  ! screenshots/verify/case_good.json missing — run: node tools/verify/refresh-cases.mjs')
    process.exit(1)
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
        const j = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()
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
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(1600)

      console.log(`\n  ${kase.name}  (${kase.width}x${kase.height}, lang=${kase.lang})`)

      for (const route of ROUTES) {
        await cdp.send('Page.navigate', { url: APP + route })
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
          report.findings.push({ kind: 'NOT-MOUNTED', case: kase.name, route })
          console.log(`    ${route.padEnd(11)}  ! did not mount`)
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
            const at = f.axis === 'row' ? `top ${c.top}` : `${f.edge} ${c.at}`
            console.log(`          ${at.padEnd(12)} ${c.panel ? '[panel]' : '[bare] '} "${c.text}"`)
          }
        }
      }
    }

    await cdp.send('Target.closeTarget', { targetId }, false)
  } finally {
    edge.kill()
  }

  writeFileSync(resolve(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))

  const real = report.findings.filter((f) => f.kind !== 'INERT' && f.kind !== 'PANEL-INSET')
  const panel = report.findings.filter((f) => f.kind === 'PANEL-INSET')
  const inert = report.findings.filter((f) => f.kind === 'INERT')
  const rows = report.loads.reduce((n, l) => n + l.comparedRows, 0)
  const cols = report.loads.reduce((n, l) => n + l.comparedCols, 0)

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

  if (BROKEN) {
    if (real.length) {
      console.log(`\n  --broken fired ${real.length} finding(s), as it must.\n`)
      process.exit(1)
    }
    console.log('\n  ! --broken found NOTHING. The check is inert, not clean.\n')
    process.exit(1)
  }

  if (real.length) { console.log('') ; process.exit(1) }
  if (inert.length) {
    console.log('\n  ! some routes had nothing to compare — a clean result there says nothing.\n')
  } else {
    console.log('\n  all sibling cells start their text on the same line.\n')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

// Does switching language change the LAYOUT, not just the words?
//
// Every other verifier fixes one language and varies something else. This one
// varies the language across all eight at two desktop widths, then compares the
// geometry against English at the same width. Four things can only be seen this
// way:
//
//   SHIFT          a chrome container's left edge or width differs from English.
//                  All of them are width: min(1180px, 100% - 32px); margin: auto,
//                  so they should be pixel-identical in every language. If one
//                  moves, something inside it is forcing the box wider — and
//                  because the containers are stacked, one moving and the others
//                  not is exactly the "the page shifts" the eye picks up without
//                  being able to name it.
//   NAV-CUT        .ui-navbar-inner scrolls on purpose, but the scroll HINT is
//                  only drawn below 640px. On a desktop projector a long-script
//                  translation silently truncates the nav — Tamil loses Advice
//                  and Report with nothing to say they exist.
//   FLUSH          two adjacent flex children with no gap between them. Under
//                  justify-between there is no gap once the slack runs out, so a
//                  heading that grew in translation ends up touching the badge
//                  beside it and reads as overlapping it.
//   TIGHT-LEADING  the real "distorted" one. Tamil, Malayalam and Kannada stack
//                  vowel signs above and below the base glyph, so the font's
//                  natural line height is far taller than Latin's. A line-height
//                  tuned on English crops those marks and pulls successive lines
//                  into each other. Measured by rendering the same string at
//                  line-height: normal in the same font and comparing.
//
// Run the Vite dev server first, then: node tools/verify/lang-layout.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9343
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/lang')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-lang')

const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']
const ROUTES = ['/', '/business', '/finance', '/analysis', '/schemes', '/report']
// Two desktop widths, because the utility strip's CONTENTS differ by language —
// a dialect dropdown appears for Tamil, Malayalam, Kannada and Telugu and not for
// English. At 1440px the row still fits either way; 1280 is a common laptop width
// where the extra control can tip it into a second row, and a strip that wraps in
// one language and not another moves every section below it.
const VIEWS = [{ width: 1440, height: 900 }, { width: 1280, height: 860 }]

const SEED = {
  profile: { name: 'Lakshmi Devi', language: 'Tamil', dialect: '', literacyLevel: 'low' },
  business: {
    businessName: 'Lakshmi Tailors', category: 'tailoring', categoryOther: '',
    initialInvestment: '200000', monthlyRevenue: '30000',
    monthlyOperatingExpenses: '18000', employees: 2, existingDebt: 0,
  },
  location: {
    village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
    locationType: 'rural', marketType: ['village', 'weekly'], customers: 'Local families',
  },
  finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000' },
  result: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')),
}

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

// Joined strings, not a template literal — the probe carries regex and escapes.
const PROBE = [
  '(() => {',
  '  const round = v => Math.round(v * 10) / 10',
  '  const out = { containers: {}, findings: [] }',
  '',
  // 1. Chrome container geometry. Identical in every language by construction,
  //    so any difference is the shift.
  '  for (const sel of [".ui-utilitybar-inner", ".ui-masthead-inner", ".ui-navbar-inner", ".ui-breadcrumb", ".ui-main", ".ui-footer-inner"]) {',
  '    const el = document.querySelector(sel)',
  '    if (!el) continue',
  '    const r = el.getBoundingClientRect()',
  // Height matters as much as left/width: a chrome strip that wraps to a second
  // row in one language pushes every section below it down, and that downward
  // move is what "the page shifts when I change language" actually looks like.
  '    out.containers[sel] = { left: round(r.left), width: round(r.width), height: round(r.height) }',
  '  }',
  '  const doc = document.documentElement',
  '  out.docOverflow = doc.scrollWidth - doc.clientWidth',
  '  out.docHeight = doc.scrollHeight',
  '  if (out.docOverflow > 1) out.findings.push({ kind: "HSCROLL", by: out.docOverflow })',
  '',
  // 2. The nav band: how many links are fully inside the visible box.
  '  const nav = document.querySelector(".ui-navbar-inner")',
  '  if (nav) {',
  '    const box = nav.getBoundingClientRect()',
  '    const links = [...nav.querySelectorAll(".ui-navbar-link")]',
  '    const hidden = links.filter(a => {',
  '      const r = a.getBoundingClientRect()',
  '      return r.right > box.right + 0.5 || r.left < box.left - 0.5',
  '    })',
  '    out.navLinks = links.length',
  '    out.navHidden = hidden.length',
  '    out.navOverflow = nav.scrollWidth - nav.clientWidth',
  // How many rows the band wrapped to. Reported, not failed: wrapping is the
  // fix for the truncation below, so a second row in a long-script language is
  // the intended outcome rather than a defect.
  '    out.navRows = new Set(links.map(a => Math.round(a.getBoundingClientRect().top))).size',
  '    if (hidden.length) {',
  '      out.findings.push({ kind: "NAV-CUT", hidden: hidden.length, of: links.length, first: hidden[0].textContent.trim(), by: nav.scrollWidth - nav.clientWidth })',
  '    }',
  '  }',
  '',
  // 3. Adjacent flex children with no breathing room, and true rect overlaps.
  //    "Paints" has to mean *anything visible*, including text in a descendant —
  //    the first cut asked for own-text-or-background and therefore skipped every
  //    wrapper div, which is precisely the shape that collides (a two-line
  //    heading block beside a fixed square badge).
  '  const paints = el => !!el.textContent.trim() || (() => {',
  '    const st = getComputedStyle(el)',
  '    return st.borderTopWidth !== "0px" || (st.backgroundColor !== "rgba(0, 0, 0, 0)" && st.backgroundColor !== "transparent")',
  '  })()',
  // The A-/A/A+ trio is a segmented control: the buttons share edges on purpose,
  // exactly like a radio group. Reporting it drowns every page in two findings.
  '  for (const parent of document.querySelectorAll("*")) {',
  '    const ps = getComputedStyle(parent)',
  '    if (ps.display !== "flex" && ps.display !== "inline-flex") continue',
  '    if (ps.flexDirection.startsWith("column")) continue',
  '    if (ps.flexWrap === "wrap" ) continue',
  '    if (parent.closest(".ui-textsize")) continue',
  '    const kids = [...parent.children].filter(k => {',
  '      const s = getComputedStyle(k)',
  '      if (s.display === "none" || s.position === "absolute" || s.position === "fixed") return false',
  '      const r = k.getBoundingClientRect()',
  '      return r.width > 0 && r.height > 0',
  '    })',
  '    for (let i = 1; i < kids.length; i++) {',
  '      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect()',
  '      if (!(paints(kids[i - 1]) && paints(kids[i]))) continue',
  '      const gap = b.left - a.right',
  '      const label = (kids[i - 1].textContent || "").trim().slice(0, 24) + " ¦ " + (kids[i].textContent || "").trim().slice(0, 24)',
  '      if (gap < -0.5) out.findings.push({ kind: "OVERLAP", by: round(-gap), pair: label })',
  '      else if (gap < 4) out.findings.push({ kind: "FLUSH", gap: round(gap), pair: label })',
  '    }',
  '  }',
  '',
  // 3b. Text pushed out of a box that cannot scroll. A translated word is longer
  //     than the English one it replaced, so this only ever appears in one language.
  '  for (const el of document.querySelectorAll("*")) {',
  '    if (el.classList.contains("sr-only")) continue',
  '    const st = getComputedStyle(el)',
  '    if (el.closest(".ui-navbar-inner")) continue',
  '    if (!el.textContent.trim()) continue',
  '    if (st.overflowX !== "auto" && st.overflowX !== "scroll") {',
  '      const over = el.scrollWidth - el.clientWidth',
  '      if (over > 1) out.findings.push({ kind: "CLIP", by: over, cls: String(el.className).slice(0, 40), text: el.textContent.trim().slice(0, 30) })',
  '    }',
  // Vertical clipping is the translation-specific one: a box sized on English
  // copy, with a longer sentence in it, silently eats its own last line.
  '    if (st.overflowY === "hidden") {',
  '      const overY = el.scrollHeight - el.clientHeight',
  '      if (overY > 1) out.findings.push({ kind: "VCLIP", by: overY, cls: String(el.className).slice(0, 40), text: el.textContent.trim().slice(0, 30) })',
  '    }',
  '  }',
  '',
  // 3c. Ragged grid rows. Cards in one row of a CSS grid that end at wildly
  //     different heights read as a broken layout rather than a long sentence.
  //     Judged against English later, since some spread is inherent to the copy.
  '  out.ragged = []',
  '  for (const grid of document.querySelectorAll("*")) {',
  '    if (!getComputedStyle(grid).display.includes("grid")) continue',
  '    const kids = [...grid.children].filter(k => k.getBoundingClientRect().height > 0)',
  '    if (kids.length < 2) continue',
  '    const rows = new Map()',
  '    for (const k of kids) {',
  '      const r = k.getBoundingClientRect()',
  '      const key = Math.round(r.top)',
  '      if (!rows.has(key)) rows.set(key, [])',
  '      rows.get(key).push(r.height)',
  '    }',
  '    for (const [, hs] of rows) {',
  '      if (hs.length < 2) continue',
  '      const spread = Math.max(...hs) - Math.min(...hs)',
  '      if (spread > 4) out.ragged.push({ cls: String(grid.className).slice(0, 36), n: hs.length, spread: round(spread) })',
  '    }',
  '  }',
  '',
  // 4. Leading. A hidden probe span rendered at line-height: normal in the very
  //    same font gives the height the script actually wants; compare it with the
  //    line box the page is giving it. Chromium derives `normal` from the font's
  //    own ascent/descent/lineGap, so this is the font's answer, not a guess.
  '  const probe = document.createElement("span")',
  // inline-block, NOT inline. An inline box's client rect is the content area,
  // which Chromium derives from the element's own primary font — so Tamil text
  // falling back to Nirmala UI reported the exact same height as Latin, and the
  // check returned a confident zero for all eight languages. inline-block makes
  // the height the line box, which does account for the fallback font that
  // actually drew the glyphs.
  '  probe.style.cssText = "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;line-height:normal;padding:0;margin:0;border:0;display:inline-block"',
  '  document.body.appendChild(probe)',
  '  const seen = new Map()',
  '  out.worstLeading = null',
  '  for (const el of document.querySelectorAll("h1,h2,h3,h4,p,li,a,span,button,label,td,th,div")) {',
  '    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(" ")',
  '    if (own.length < 2) continue',
  '    const st = getComputedStyle(el)',
  '    if (st.display === "none" || st.visibility === "hidden") continue',
  '    const used = parseFloat(st.lineHeight)',
  '    if (!Number.isFinite(used)) continue',
  // Longhands only. getComputedStyle().font serialises as `700 12.5px/20px "Noto
  // Sans"` — the shorthand CARRIES line-height, so assigning it silently replaced
  // the probe's `line-height: normal` with the page's own value and every
  // comparison became the line-height against itself. Deficit was exactly 0 on
  // all 48 loads, which looked like a clean bill of health and measured nothing.
  '    probe.style.fontFamily = st.fontFamily',
  '    probe.style.fontSize = st.fontSize',
  '    probe.style.fontWeight = st.fontWeight',
  '    probe.style.fontStyle = st.fontStyle',
  '    probe.style.lineHeight = "normal"',
  '    probe.textContent = own',
  '    const natural = probe.getBoundingClientRect().height',
  '    const deficit = natural - used',
  // Always carry the worst case, pass or fail. A check that reports zero is only
  // believable if it can also show how close it came.
  '    if (!out.worstLeading || deficit > out.worstLeading.deficit) {',
  '      out.worstLeading = { px: round(parseFloat(st.fontSize)), used: round(used), natural: round(natural), deficit: round(deficit), cls: String(el.className).slice(0, 34) }',
  '    }',
  // 1.5px of tolerance: rounding plus fonts whose `normal` is a hair over the
  // ratio a designer would pick anyway. Anything past that is the script's own
  // marks having nowhere to go.
  '    if (deficit > 1.5) {',
  '      const key = st.fontSize + "/" + st.lineHeight + "/" + el.className',
  '      const prev = seen.get(key)',
  '      if (!prev || deficit > prev.deficit) {',
  '        seen.set(key, { kind: "TIGHT-LEADING", px: round(parseFloat(st.fontSize)), used: round(used), natural: round(natural), deficit: round(deficit), cls: String(el.className).slice(0, 44), text: own.slice(0, 34) })',
  '      }',
  '    }',
  '  }',
  '  probe.remove()',
  // Reported, NOT a finding. This fires on 24 elements in all eight languages
  // including English, because Chromium takes `line-height: normal` from the
  // element's primary font strut — the Indic fallback that actually draws the
  // glyphs never raises it. So the measurement cannot tell scripts apart and a
  // failure here would only be saying "the display sizes use tight leading",
  // which is deliberate and identical in English. Cramped Indic marks are a
  // question for the rendered PNGs below, not for font metrics.
  '  out.leading = [...seen.values()].sort((a, b) => b.deficit - a.deficit).slice(0, 5)',
  '  return out',
  '})()',
].join('\n')

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

  const report = []
  let pagesWithFindings = 0
  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // Baselines are per (route, width): English at 1440 is not the reference for
    // Tamil at 1280. Keying on route alone made every 1280 load report a SHIFT
    // against a 1440 English page, which is true and useless.
    const baseline = {}
    for (const view of VIEWS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { ...view, deviceScaleFactor: 1, mobile: false })
      for (const lang of LANGS) {
      for (const route of ROUTES) {
        const key = `${route}@${view.width}`
        await cdp.send('Page.navigate', { url: APP + route })
        await sleep(600)
        await cdp.evaluate([
          `localStorage.setItem('sih-language', '${lang}');`,
          `localStorage.removeItem('sih-dialect');`,
          `localStorage.setItem('sih-theme', 'light');`,
          `localStorage.setItem('sih-textsize', 'md');`,
          `sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify({ v: 1, data: SEED }))});`,
          'true',
        ].join(''))
        await cdp.send('Page.navigate', { url: APP + route })
        await sleep(900)

        const r = await cdp.evaluate(PROBE)

        // Full-page PNG per language. The measurable checks catch geometry; only
        // a picture answers "does the translated page look distorted".
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        writeFileSync(`${OUT}/${route.replace(/\//g, '_') || '_home'}-${view.width}-${lang}.png`, Buffer.from(shot.data, 'base64'))

        // English is the reference: its containers define where the page sits.
        if (lang === 'en') baseline[key] = { containers: r.containers, ragged: r.ragged }
        else {
          // Raggedness is only a finding where translation *made* it worse — a
          // grid whose cards already differ in English is the copy, not the layout.
          const raggedKey = (x) => x.cls + '#' + x.n
          const enRagged = new Map((baseline[key]?.ragged || []).map((x) => [raggedKey(x), x.spread]))
          for (const x of r.ragged || []) {
            const was = enRagged.get(raggedKey(x)) || 0
            if (x.spread - was > 24) {
              r.findings.push({ kind: 'RAGGED', el: x.cls, cards: x.n, spread: x.spread, enSpread: was })
            }
          }
          for (const [sel, geom] of Object.entries(r.containers)) {
            const base = baseline[key]?.containers?.[sel]
            if (!base) continue
            const dx = Math.round((geom.left - base.left) * 10) / 10
            const dw = Math.round((geom.width - base.width) * 10) / 10
            const dh = Math.round((geom.height - base.height) * 10) / 10
            // Height only counts against the strips that must not move. `.ui-main`
            // is the page itself, and `.ui-navbar-inner` is allowed to wrap to a
            // second row in a long-script language — both grow legitimately, and
            // flagging them buries the utility bar, masthead and breadcrumb, which
            // are the ones whose height really is fixed.
            //
            // `.ui-footer-inner` belongs in that set and was missed, which cost 24
            // findings on 11 Sept 2026 — ta and ml, both widths, all 6 routes,
            // dx=0 dw=0 dh=22.9 every time. Measured before excluding it, because
            // the alternative reading was a real defect: it is a three-column grid
            // of TRANSLATED PROSE, its columns stretch to the tallest (align-items
            // resolves to `normal`), and in ta the tagline wraps 1 -> 2 lines
            // (22.8 -> 45.7px) while in ml the journey link list does. Same element
            // set, same box count, uniform columns, 101.3 -> 124.2px = one extra
            // line of Indic text. That is the language, not the layout.
            //
            // It went unseen until a Tamil tagline crossed a line boundary and
            // pushed the delta past the 12px threshold, i.e. the exclusion list was
            // wrong from the day it was written and nothing could tell. The
            // HORIZONTAL arms still apply to the footer unchanged, and they are the
            // point of SHIFT — every one of these containers is
            // `width: min(1180px, 100% - 32px); margin: auto` and must be
            // pixel-identical in every language. The footer's own height-related
            // defect class (three columns starting on three different lines) is
            // owned by text-align.mjs, which fires 30 findings under --broken.
            const COPY_DRIVEN_HEIGHT = ['.ui-main', '.ui-navbar-inner', '.ui-footer-inner']
            const fixedHeight = !COPY_DRIVEN_HEIGHT.includes(sel)
            if (Math.abs(dx) > 1 || Math.abs(dw) > 1 || (fixedHeight && Math.abs(dh) > 12)) {
              r.findings.unshift({ kind: 'SHIFT', el: sel, dx, dw, dh })
            }
          }
        }

        const tag = `${view.width}px ${lang} ${route}`
        if (r.findings.length) {
          pagesWithFindings++
          console.log(`\n${tag}  — ${r.findings.length} finding(s)`)
          const counts = {}
          for (const f of r.findings) counts[f.kind] = (counts[f.kind] || 0) + 1
          console.log('    ' + Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('  '))
          for (const f of r.findings.slice(0, 6)) {
            console.log('      ' + Object.entries(f).filter(([k]) => k !== 'kind').map(([k, v]) => `${k}=${v}`).join(' ') + `  [${f.kind}]`)
          }
        } else {
          console.log(`${tag}  ok`)
        }
        report.push({ width: view.width, lang, route, ...r })
      }
      }
    }
  } finally {
    edge.kill()
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  const total = LANGS.length * ROUTES.length * VIEWS.length
  console.log(`\n${total} page loads, ${pagesWithFindings} with findings.`)

  const byKind = {}
  for (const p of report) for (const f of p.findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1
  console.log('Totals: ' + (Object.keys(byKind).length ? Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join('  ') : 'none'))
  console.log(`report.json in ${OUT}`)
  process.exit(pagesWithFindings ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

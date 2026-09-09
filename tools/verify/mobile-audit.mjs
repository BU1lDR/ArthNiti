// Mobile-width audit. Same zero-dependency CDP plumbing as drive.mjs, but it
// emulates real phone viewports and measures the things that only go wrong on a
// narrow screen — none of which lint, build or the desktop driver can see.
//
// What it reports, in order of how badly each one hurts a rural user on a phone:
//
//   OVERFLOW  the page scrolls sideways (documentElement.scrollWidth > clientWidth).
//             This is the worst mobile defect there is: content sits off-screen,
//             the layout jitters under a thumb, and pinch-zoom becomes the only
//             way to read. It also names the widest offending elements, because
//             "the page is 40px too wide" is useless without knowing what did it.
//   TAP       interactive elements under 44x44 CSS px. That is the documented
//             minimum for a reliable thumb press; below it a user misses and
//             re-taps, which on a form page means abandoning the journey.
//   TINY      rendered text under 12px. The audience is low-literacy readers, so
//             small text is not a cosmetic issue.
//   CLIP      an element whose own content overflows it horizontally — a long
//             unbroken word (a district name, a scheme name, an email) pushing
//             out of its card.
//   SPLIT-     a standalone money figure broken across two line boxes. "₹30,000"
//   FIGURE     rendered as "₹30,00" / "0" is not a cosmetic problem — the reader
//              parses a different number. Nothing else here can see it: nothing
//              overflows, nothing is clipped, the text is all present. It was a
//              live bug caused by overflow-wrap: anywhere on the cards meeting a
//              squeezed flex row, and it only appeared at the largest text scale
//              in Hindi, which is why the stress viewport exists.
//
// Widths: 360 is the common Android floor still in wide use in rural India, 390
// is a current iPhone, 412 a large Android. If it survives 360 it survives the
// rest, but all three are checked because a broken breakpoint often only bites in
// a narrow band.
//
// Run the Vite dev server first, then:  node tools/verify/mobile-audit.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9333
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/mobile')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-mobile')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The last entry is the one that actually stresses the layout. index.css has to
// survive two independent presentation switches, and the largest text scale on
// the narrowest screen is where a fixed-width box overflows again: 1.18x type in
// the same 336px container. Hindi too, because Devanagari sets taller and its
// words do not break where English ones do. If a mobile rule is going to fail,
// it fails here and nowhere else.
//
// It was three switches until 8 September 2026 — high contrast was the third arm
// of this case, and it went with the feature. The remaining combination is still
// what found four defects the three plain widths could not.
const VIEWPORTS = [
  { name: '360', width: 360, height: 740 },
  { name: '390', width: 390, height: 844 },
  { name: '412', width: 412, height: 915 },
  // 'lg' is the key TextSizeControl stores, not 'large' — TEXT_SCALES maps
  // sm/md/lg to 0.94/1/1.18.
  { name: '360-stress', width: 360, height: 740, theme: 'dark', textsize: 'lg', lang: 'hi' },
]

const ROUTES = ['/', '/login', '/profile', '/business', '/location', '/finance', '/analysis', '/schemes', '/advisory', '/report']

// Reuses the driver's real backend responses so the result pages are as long and
// as full as they get — a short page can hide an overflow a long one exposes.
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

// --- minimal CDP client, session-aware --------------------------------------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.pageErrors = []
    this.sessionId = null

    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('CDP socket error')))
    })

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'unknown')
      }
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
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
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

async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`).catch(() => 0)
    if (len > 40) return true
    await sleep(120)
  }
  return false
}

// Runs in the page. Deliberately measures rather than inspects CSS: a rule can
// look right and still lose to the cascade, and only the used value is the truth.
const PROBE = `(() => {
  const doc = document.documentElement
  const vw = doc.clientWidth
  const out = { vw, scrollWidth: doc.scrollWidth, overflow: [], tap: [], tiny: [], clip: [], split: [] }
  // A standalone money figure must occupy exactly one line box. "₹30,000" broken
  // across two lines renders as "₹30,00" then "0", which a reader parses as a
  // different number — and it is invisible to every other check here, because
  // nothing overflows and nothing is clipped. Anchored to the whole trimmed text
  // so a paragraph that merely mentions a figure and wraps normally is not caught.
  const MONEY = /^₹\\s?[\\d,]+(\\.\\d+)?$/

  // An element inside a horizontal scroll container is SUPPOSED to have a rect
  // past the viewport — that is scrolled-out content, not overflow. The nav bar
  // scrolls on purpose (.ui-navbar-inner has overflow-x: auto), so without this
  // every nav link reported as OVERFLOW and buried the real findings.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    return false
  }

  const describe = (el) => {
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''
    const text = (el.innerText || el.value || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
    return el.tagName.toLowerCase() + cls + (text ? ' “' + text + '”' : '')
  }

  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    // .sr-only is a deliberately clipped 1px box, so it reports as CLIP on every
    // page and drowns the real findings. Skip it and anything inside it.
    if (el.closest('.sr-only')) continue
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue

    // Sticks out past the right edge, or starts left of it. 1px of tolerance for
    // subpixel rounding, which fires constantly and never matters.
    // r.right <= 0 means the element sits ENTIRELY off the left edge, which is
    // the standard way to park a skip link until it takes focus. It cannot widen
    // the document and cannot be seen, so it is not an overflow.
    if ((r.right > vw + 1 || (r.left < -1 && r.right > 0)) && !inScroller(el)) {
      out.overflow.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) })
    }

    // Its own content is wider than it is, with no way to scroll to it.
    // .ui-unit-chart spans are exempt: the coin box is sized in rem ON PURPOSE,
    // decoupled from the glyph's font-size, so that an empty slot's ring and a
    // filled coin stay the same size (see the comment on the rule in index.css).
    // An emoji's advance width is ~1.28em, so at the largest text scale the glyph
    // measures ~2px wider than its 1.6rem box — it overhangs a TRANSPARENT border
    // with overflow visible, so nothing is actually clipped or hidden. Sizing the
    // box to the glyph instead would grow every coin and re-couple the two.
    const coin = el.closest('.ui-unit-chart')
    if (!coin && el.scrollWidth > el.clientWidth + 1 && style.overflowX !== 'auto' && style.overflowX !== 'scroll') {
      out.clip.push({ el: describe(el), content: el.scrollWidth, box: el.clientWidth })
    }

    const interactive = el.matches('a[href], button, input, select, textarea, summary, [role="button"]')
    // An inline link inside a paragraph is a phrase, not a target, and padding it
    // to 44px would wreck the text. Only count links that stand alone.
    const inlineLink = el.tagName === 'A' && style.display.startsWith('inline') && el.closest('p, li')
    if (interactive && !inlineLink && (r.height < 43.5 || r.width < 43.5)) {
      out.tap.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height) })
    }

    // Only leaf text nodes, so a big container does not report its child's size.
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (ownText) {
      const px = parseFloat(style.fontSize)
      if (px && px < 12) out.tiny.push({ el: describe(el), px: Math.round(px * 10) / 10 })

      // Measure the TEXT, not the element. el.getClientRects() returns one rect
      // per line box only for inline elements — on a block or flex box it returns
      // a single rect however many lines the text wrapped to, which silently made
      // an earlier version of this check pass on a figure that was visibly split.
      // A Range over the contents reports the line boxes either way. Count
      // distinct tops rather than raw rects, since one line can yield several.
      const own = (el.innerText || '').trim()
      if (MONEY.test(own)) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
        if (tops.size > 1) out.split.push({ el: describe(el), lines: tops.size })
      }
    }
  }

  const dedupe = (list, n) => {
    const seen = new Set()
    return list.filter((x) => { const k = x.el; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, n)
  }
  out.overflow = dedupe(out.overflow.sort((a, b) => b.right - a.right), 6)
  out.clip = dedupe(out.clip.sort((a, b) => (b.content - b.box) - (a.content - a.box)), 6)
  out.tap = dedupe(out.tap, 8)
  out.tiny = dedupe(out.tiny.sort((a, b) => a.px - b.px), 6)
  out.split = dedupe(out.split, 6)
  return out
})()`

async function main() {
  rmSync(OUT, { recursive: true, force: true })
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
  let problems = 0

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const vp of VIEWPORTS) {
      // Emulation, not just a window resize: mobile: true is what makes the
      // viewport meta tag apply, and without it every measurement is a desktop
      // measurement in a narrow window.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: 2, mobile: true,
      })
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

      await cdp.send('Page.navigate', { url: APP + '/' })
      await waitForRender(cdp)
      await cdp.evaluate(`
        sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify({ v: 1, data: SEED }))});
        localStorage.setItem('sih-language', ${JSON.stringify(vp.lang || 'en')});
        localStorage.setItem('sih-theme', ${JSON.stringify(vp.theme || 'light')});
        localStorage.setItem('sih-textsize', ${JSON.stringify(vp.textsize || 'md')});
        localStorage.removeItem('sih-dialect');
        true;
      `)

      for (const route of ROUTES) {
        cdp.pageErrors.length = 0
        await cdp.send('Page.navigate', { url: APP + route })
        const rendered = await waitForRender(cdp)
        await sleep(160)

        const probe = await cdp.evaluate(PROBE)
        const sideways = probe.scrollWidth > probe.vw + 1
        const bad = (sideways ? 1 : 0) + probe.tap.length + probe.tiny.length + probe.clip.length + probe.split.length
        if (bad || !rendered || cdp.pageErrors.length) problems++

        const label = `${vp.name}${route.replace(/\//g, '_')}`
        report.push({ viewport: vp.name, route, rendered, sideways, ...probe, pageErrors: [...cdp.pageErrors] })

        const flags = []
        if (!rendered) flags.push('NOT-RENDERED')
        if (sideways) flags.push(`OVERFLOW +${probe.scrollWidth - probe.vw}px`)
        if (probe.clip.length) flags.push(`CLIP x${probe.clip.length}`)
        if (probe.tap.length) flags.push(`TAP x${probe.tap.length}`)
        if (probe.tiny.length) flags.push(`TINY x${probe.tiny.length}`)
        if (probe.split.length) flags.push(`SPLIT-FIGURE x${probe.split.length}`)
        console.log(`${flags.length ? 'FAIL' : 'ok  '}  ${label.padEnd(26)} ${flags.join('  ')}`)

        for (const o of probe.overflow) console.log(`        overflow right=${o.right} w=${o.width}  ${o.el}`)
        for (const c of probe.clip) console.log(`        clip content=${c.content} box=${c.box}  ${c.el}`)
        for (const t of probe.tap) console.log(`        tap ${t.w}x${t.h}  ${t.el}`)
        for (const t of probe.tiny) console.log(`        tiny ${t.px}px  ${t.el}`)
        for (const s of probe.split) console.log(`        split-figure over ${s.lines} lines  ${s.el}`)

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        writeFileSync(`${OUT}/${label}.png`, Buffer.from(shot.data, 'base64'))
      }
    }

    writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  } finally {
    edge.kill()
  }

  console.log(`\n${report.length} page loads across ${VIEWPORTS.length} phone widths, ${problems} with problems.`)
  console.log(`Screenshots and report.json in ${OUT}`)
  process.exit(problems ? 1 : 0)
}

main()

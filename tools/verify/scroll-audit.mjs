// Does every route open at the TOP of the page?
//
// This is a single-page app, so the browser never resets the scroll offset on its
// own: react-router swaps the page component and the window stays exactly where it
// was. Every form step's Continue button sits at the bottom of a tall page, so
// tapping it landed the next step already scrolled past its own heading — reported
// as "some of the pages open from the middle of the webpage".
//
// None of the other verifiers can see this, and the reason is structural rather
// than an oversight: all of them navigate by URL and measure a page they loaded
// COLD, i.e. at offset 0 by definition. drive.mjs, mobile-audit.mjs,
// lang-layout.mjs, field-align.mjs, hero-geom.mjs and print-audit.mjs never
// perform an in-app navigation at all, so the one code path where the offset
// carries over is the one path none of them exercise. Their reports are
// byte-identical whether or not scroll is reset.
//
// Run the Vite dev server first, then: node tools/verify/scroll-audit.mjs
//   --broken   removes the fix at runtime and MUST exit 1
//
// The refuter is not optional here. Three checks in this suite have reported a
// confident zero while watching nothing at all (SPLIT-FIGURE twice on visibly
// broken output, field-align's ORPHAN arm across 56 loads, and all ten CSS
// transitions inert for a day) — and this script's happy path is a stream of
// zeroes, which is exactly the shape that hides an inert probe.
//
// --broken restores the pre-fix behaviour faithfully rather than approximately:
// it stubs window.scrollTo to a no-op (the app's own reset) AND forces
// history.scrollRestoration back to 'auto' (the browser's async restore on
// back/forward). Note the probe therefore must not scroll with window.scrollTo
// itself — it assigns documentElement.scrollTop instead, which the stub cannot
// intercept.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// Own port and own profile dir, like every other script here, so this can run
// beside another one. 9222/9333/9337/9339/9341/9343/9347/9351/9355/9359/9361/
// 9363/9365 are taken; assetgen holds 9377 and svgcheck 9378.
const DEBUG_PORT = 9367
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/scroll')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-scroll')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BROKEN = process.argv.includes('--broken')

// Mirrors FORMS in drive.mjs so the result pages render fully rather than as
// empty states — an empty page is short, and a short page cannot be scrolled,
// which would make every case here inert.
const FORMS_GOOD = {
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
}

// The navigations a reader actually performs, in the order they perform them.
//
// `via: 'nav'` clicks the nav bar's own link for the destination. That is a real
// react-router navigation and it works from any page, which is what makes the
// matrix uniform — the alternative, clicking each page's Continue button, is
// gated by that page's form validation and would silently stop testing a route
// the moment a required field changed.
//
// `via: 'continue'` is here anyway, once, because the Continue button at the
// bottom of a form is the exact control the defect was reported against, and a
// nav link sits at the TOP of the page where the offset is small. /profile is the
// one step whose validation the seeded name already satisfies.
const HOPS = [
  { from: '/', to: '/profile', via: 'nav' },
  { from: '/profile', to: '/business', via: 'continue' },
  { from: '/business', to: '/location', via: 'nav' },
  { from: '/location', to: '/finance', via: 'nav' },
  { from: '/analysis', to: '/schemes', via: 'nav' },
  { from: '/schemes', to: '/advisory', via: 'nav' },
  { from: '/advisory', to: '/report', via: 'nav' },
  { from: '/report', to: '/analysis', via: 'nav' },
]

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

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    // Deliberately short, so every page is taller than the viewport and there is
    // always something to scroll. A 1200px-tall window makes several of these
    // pages fit entirely and every case goes inert.
    '--window-size=1280,720',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const findings = []
  const report = { broken: BROKEN, hops: [], anchor: null, back: null }

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // Unlike motion-audit's CSS refuter this one MUST land before the app's own
    // code runs — the fix is a layout effect, so patching after mount would be
    // too late for the first navigation. addScriptToEvaluateOnNewDocument is the
    // right hook precisely because it runs before any document script.
    if (BROKEN) {
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          window.scrollTo = function () {}
          try { window.history.scrollRestoration = 'auto' } catch {}
          Object.defineProperty(window.history, 'scrollRestoration', {
            get: () => 'auto', set: () => {}, configurable: true,
          })
        `,
      })
    }

    await cdp.send('Page.navigate', { url: APP + '/' })
    await sleep(1200)
    const payload = JSON.stringify({
      v: 1,
      data: { ...FORMS_GOOD, result: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')) },
    })
    await cdp.evaluate(`
      sessionStorage.setItem('sih-application', ${JSON.stringify(payload)});
      localStorage.setItem('sih-language', 'en');
      localStorage.setItem('sih-theme', 'light');
      localStorage.setItem('sih-textsize', 'md');
      localStorage.removeItem('sih-dialect');
      true;
    `)

    const goto = async (path) => {
      await cdp.send('Page.navigate', { url: APP + path })
      await sleep(900)
    }

    // Assigning scrollTop rather than calling window.scrollTo, because --broken
    // stubs scrollTo and the probe must keep working under its own refuter.
    const scrollToBottom = async () => {
      return cdp.evaluate(`(() => {
        const d = document.documentElement
        const max = d.scrollHeight - d.clientHeight
        d.scrollTop = max
        return { max, y: Math.round(window.scrollY) }
      })()`)
    }

    const offset = () => cdp.evaluate('Math.round(window.scrollY)')

    for (const hop of HOPS) {
      await goto(hop.from)
      const before = await scrollToBottom()

      // The instrument check. If the source page could not scroll, the hop
      // proves nothing whether it passes or fails — a clean result from an inert
      // case is indistinguishable from a clean result from a working one, which
      // is the trap tools/README.md's last section is about.
      if (before.max < 200 || before.y < 200) {
        findings.push({ kind: 'INERT', hop: `${hop.from} -> ${hop.to}`, note: `source page only scrolled to ${before.y} of ${before.max}px; case proves nothing` })
        report.hops.push({ ...hop, scrolledTo: before.y, scrollable: before.max, after: null, inert: true })
        continue
      }

      const clicked = await cdp.evaluate(`(() => {
        ${hop.via === 'nav'
          ? `const el = document.querySelector('.ui-navbar a[href="${hop.to}"]') || document.querySelector('a[href="${hop.to}"]')`
          : `const el = document.querySelector('form button[type="submit"]')`}
        if (!el) return { ok: false, why: 'control not found' }
        el.click()
        return { ok: true, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40) }
      })()`)

      if (!clicked.ok) {
        findings.push({ kind: 'NO-CONTROL', hop: `${hop.from} -> ${hop.to}`, note: `${hop.via}: ${clicked.why}` })
        report.hops.push({ ...hop, scrolledTo: before.y, after: null, error: clicked.why })
        continue
      }

      await sleep(700)
      const landedOn = await cdp.evaluate('location.pathname')
      const after = await offset()

      if (landedOn !== hop.to) {
        findings.push({ kind: 'NO-NAV', hop: `${hop.from} -> ${hop.to}`, note: `clicked ${clicked.tag} "${clicked.text}" but landed on ${landedOn}` })
      } else if (after > 4) {
        // 4px of slack rather than an exact 0: a sub-pixel layout settle can
        // leave a rounded 1, and a false alarm on this check would be worse than
        // the tolerance, since the defect it watches for is hundreds of pixels.
        findings.push({ kind: 'TOP', hop: `${hop.from} -> ${hop.to}`, note: `${hop.to} opened at ${after}px, not at the top (came from ${before.y}px)` })
      }
      report.hops.push({ ...hop, scrolledTo: before.y, scrollable: before.max, landedOn, after, control: clicked.text })
    }

    // Back/forward. Left on the default 'auto', the browser restores the previous
    // offset asynchronously — possibly after the layout effect has already run —
    // so the defect comes back through the back button even with the effect in
    // place. This arm is what makes scrollRestoration: 'manual' load-bearing
    // rather than belt-and-braces.
    await goto('/analysis')
    const backFrom = await scrollToBottom()
    await cdp.evaluate(`document.querySelector('.ui-navbar a[href="/schemes"]').click()`)
    await sleep(700)
    await cdp.evaluate('window.history.back()')
    await sleep(900)
    const backTo = await cdp.evaluate('location.pathname')
    const backOffset = await offset()
    report.back = { scrolledTo: backFrom.y, landedOn: backTo, after: backOffset }
    if (backFrom.y < 200) {
      findings.push({ kind: 'INERT', hop: 'back button', note: `/analysis only scrolled to ${backFrom.y}px` })
    } else if (backTo === '/analysis' && backOffset > 4) {
      findings.push({ kind: 'BACK', hop: '/schemes -> back -> /analysis', note: `restored to ${backOffset}px instead of the top` })
    }

    // The other direction, and the reason the fix guards on location.hash. A
    // same-page anchor must still jump to its target — a blanket scroll-to-top
    // would break "See how it works" on the landing page and the skip link, and
    // both would look like the fix working.
    await goto('/')
    const anchor = await cdp.evaluate(`(() => {
      const a = document.querySelector('a[href="#how-it-works"]')
      if (!a) return { ok: false, why: 'anchor link not found' }
      a.click()
      return { ok: true }
    })()`)
    await sleep(800)
    const anchorOffset = await offset()
    const sectionTop = await cdp.evaluate(`(() => {
      const s = document.getElementById('how-it-works')
      return s ? Math.round(s.getBoundingClientRect().top) : null
    })()`)
    report.anchor = { ...anchor, after: anchorOffset, sectionTopInViewport: sectionTop }
    if (!anchor.ok) {
      findings.push({ kind: 'NO-CONTROL', hop: '#how-it-works', note: anchor.why })
    } else if (anchorOffset < 100) {
      findings.push({ kind: 'ANCHOR', hop: '#how-it-works', note: `page stayed at ${anchorOffset}px — the scroll-to-top is defeating a same-page anchor` })
    }

    await cdp.send('Target.closeTarget', { targetId }, false)
  } finally {
    edge.kill()
  }

  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ ...report, findings }, null, 2))

  const inert = findings.filter((f) => f.kind === 'INERT').length
  for (const h of report.hops) {
    const mark = h.inert ? 'inert' : h.after === undefined || h.after === null ? '—' : `${h.after}px`
    console.log(`  ${String(h.from).padEnd(10)} -> ${String(h.to).padEnd(10)} via ${h.via.padEnd(8)} from ${String(h.scrolledTo ?? '?').padStart(5)}px  opened at ${mark}`)
  }
  console.log(`  back button: /analysis at ${report.back?.scrolledTo}px -> /schemes -> back -> ${report.back?.landedOn} at ${report.back?.after}px`)
  console.log(`  #how-it-works anchor: page at ${report.anchor?.after}px, section ${report.anchor?.sectionTopInViewport}px from the viewport top`)
  console.log('')
  if (findings.length === 0) {
    console.log(`scroll-audit: ${report.hops.length} hops + back + anchor, 0 findings${BROKEN ? '  <-- --broken FAILED TO FIRE' : ''}`)
  } else {
    for (const f of findings) console.log(`  ${f.kind.padEnd(11)} ${f.hop} — ${f.note}`)
    console.log(`\nscroll-audit: ${findings.length} findings (${inert} inert)`)
  }
  console.log(`report: ${resolve(OUT, 'report.json')}`)

  // Under --broken a clean run is itself the failure: the refuter removed the fix
  // and nothing noticed. Both outcomes exit 1, but they mean opposite things, so
  // they must not be reported with the same line.
  if (BROKEN && findings.length === 0) {
    console.log('scroll-audit: --broken removed the fix and this script did not notice. The probe is inert.')
    process.exit(1)
  }
  process.exit(findings.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

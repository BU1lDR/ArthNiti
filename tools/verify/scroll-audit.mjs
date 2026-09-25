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

// Every control in the app that can change the route, one hop each.
//
// The first version of this file tested 8 hops, 7 of them nav-bar links, and
// called the result "every route opens at the top". That was a stronger claim
// than the matrix supported: the app has ELEVEN distinct classes of navigating
// control, and a nav link is the *easiest* of them — it sits at the top of the
// page, it is a plain <Link>, and it changes the path synchronously. The classes
// that could plausibly behave differently are exactly the ones that were missing:
//
//   continue    a form's Continue button calls navigate() programmatically from
//               a submit handler, not from a <Link> click
//   submit-api  /finance is the same shape but its navigate() fires AFTER an
//               awaited network call, so the layout effect runs in a different
//               task than the click. This is the single riskiest control in the
//               app and it was untested.
//   manual      the instruction dialog sets document.body.style.overflow =
//               'hidden' as a scroll lock, and its CTA navigates while that lock
//               may still be in effect. A locked viewport is exactly the
//               condition under which a scroll reset could silently no-op.
//   startover   the utility bar's ↺ opens a native <dialog> with showModal(),
//               and its confirm button runs resetApplication() then
//               navigate('/') from inside that modal. Two clicks: `pre` opens
//               the dialog, `find` confirms. The trigger itself no longer
//               navigates, so clicking only the trigger lands nowhere.
//   cta         the bottom-of-page buttons on the result pages — the controls
//               that sit at the LARGEST offset in the whole app
//   backlink    every page's own "← back" link
//   footer      the footer's generated journey links
//   breadcrumb / brand / login   the three chrome links outside the nav bar
//   404         the catch-all's two buttons
//
// `find` is a JS expression returning the element, rather than a bare selector,
// because several of these cannot be addressed by href alone: /analysis carries
// a[href="/finance"] twice (the back link at the top, the CTA at the bottom) and
// it is specifically the bottom one that matters here, so those hops take the
// LAST match inside .ui-main. Writing the expression out per hop keeps each row
// self-documenting instead of hiding the choice in a helper.
//
// `pre`, when present, is the same kind of expression: the control that opens a
// dialog, clicked after the source page has been scrolled and before `find` is
// looked up. The manual and startover hops use it. A `pre` that finds nothing is
// a NO-CONTROL finding, the same as a missing `find`.
const lastInMain = (href) =>
  `[...document.querySelectorAll('.ui-main a[href="${href}"]')].pop()`

const HOPS = [
  // Chrome. These work from any page, so each is paired with a tall source.
  { from: '/', to: '/profile', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/profile"]')` },
  { from: '/analysis', to: '/schemes', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/schemes"]')` },
  { from: '/schemes', to: '/advisory', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/advisory"]')` },
  { from: '/advisory', to: '/report', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/report"]')` },
  { from: '/report', to: '/analysis', via: 'nav', find: `document.querySelector('.ui-navbar a[href="/analysis"]')` },
  { from: '/analysis', to: '/', via: 'brand', find: `document.querySelector('a.ui-brand')` },
  { from: '/schemes', to: '/', via: 'breadcrumb', find: `document.querySelector('.ui-breadcrumb a[href="/"]')` },
  { from: '/report', to: '/login', via: 'login', find: `document.querySelector('.ui-masthead a[href="/login"]')` },
  { from: '/advisory', to: '/business', via: 'footer', find: `document.querySelector('.ui-footer-inner a[href="/business"]')` },
  // The utility bar's start-over button. It opens a confirm dialog and does not
  // navigate by itself, so `pre` clicks it and `find` clicks the dialog's
  // confirm. The trigger is matched on the glyph rather than on its title, which
  // is translated, and it only exists once isStarted(data) is true, which the
  // seeded fixture satisfies.
  //
  // The confirm is found by structure, never by its label, which is translated
  // too: the open dialog holds exactly two buttons, "No" first (the one the
  // component focuses on opening, so Enter keeps the answers) and "Yes" second.
  // Anything other than two buttons returns null and reports as NO-CONTROL. If
  // the order were ever swapped, this would click "No", the dialog would close
  // with the answers kept, and the hop would report NO-NAV rather than pass.
  //
  // --broken still refutes this hop. The dialog sets no scroll lock (unlike the
  // manual below), and after "Yes" the trigger unmounts, so the dialog's
  // onClose focus() has nothing to focus and cannot scroll the page to the top.
  {
    from: '/analysis', to: '/', via: 'startover',
    pre: `[...document.querySelectorAll('button.ui-utility-button')].find((b) => b.textContent.includes('\\u21BA'))`,
    find: `(() => { const b = [...document.querySelectorAll('dialog[open] button')]; return b.length === 2 ? b[1] : null })()`,
  },

  // The four form steps. Each Continue calls navigate() from its submit handler.
  { from: '/profile', to: '/business', via: 'continue', find: `document.querySelector('form button[type="submit"]')` },
  { from: '/business', to: '/location', via: 'continue', find: `document.querySelector('form button[type="submit"]')` },
  { from: '/location', to: '/finance', via: 'continue', find: `document.querySelector('form button[type="submit"]')` },
  // The API call is real, so this one needs a longer settle than a client-side
  // route change. The backend must be up for this hop; if it is not, the app
  // shows the error banner and stays put, which reports as NO-NAV rather than
  // as a pass.
  { from: '/finance', to: '/analysis', via: 'submit-api', find: `document.querySelector('form button[type="submit"]')`, wait: 4000 },

  // Every page's own back link.
  { from: '/profile', to: '/', via: 'backlink', find: `document.querySelector('.ui-main a[href="/"]')` },
  { from: '/business', to: '/profile', via: 'backlink', find: `document.querySelector('.ui-main a[href="/profile"]')` },
  { from: '/location', to: '/business', via: 'backlink', find: `document.querySelector('.ui-main a[href="/business"]')` },
  { from: '/finance', to: '/location', via: 'backlink', find: `document.querySelector('.ui-main a[href="/location"]')` },
  { from: '/analysis', to: '/finance', via: 'backlink', find: `document.querySelector('.ui-main a[href="/finance"]')` },
  { from: '/schemes', to: '/analysis', via: 'backlink', find: `document.querySelector('.ui-main a[href="/analysis"]')` },
  { from: '/advisory', to: '/schemes', via: 'backlink', find: `document.querySelector('.ui-main a[href="/schemes"]')` },
  { from: '/report', to: '/advisory', via: 'backlink', find: `document.querySelector('.ui-main a[href="/advisory"]')` },
  { from: '/login', to: '/', via: 'backlink', find: `document.querySelector('.ui-main a[href="/"]')` },

  // The bottom-of-page CTAs on the result pages. These are the controls at the
  // largest offset anywhere in the app, which makes them the worst case for this
  // defect and the reason `lastInMain` exists.
  { from: '/analysis', to: '/schemes', via: 'cta', find: lastInMain('/schemes') },
  { from: '/analysis', to: '/advisory', via: 'cta', find: lastInMain('/advisory') },
  { from: '/analysis', to: '/finance', via: 'cta', find: lastInMain('/finance') },
  { from: '/schemes', to: '/advisory', via: 'cta', find: lastInMain('/advisory') },
  { from: '/schemes', to: '/analysis', via: 'cta', find: lastInMain('/analysis') },
  { from: '/advisory', to: '/report', via: 'cta', find: lastInMain('/report') },
  { from: '/advisory', to: '/schemes', via: 'cta', find: lastInMain('/schemes') },

  // The instruction dialog, opened from the landing strip. `pre` finds and clicks
  // the opener, which is what puts body overflow: hidden in effect; the CTA then
  // navigates out of a locked viewport.
  //
  // THIS HOP IS OVER-DETERMINED, AND IT IS THE ONE HOP --broken CANNOT REFUTE.
  // It passes with the fix removed, which was measured rather than assumed:
  // stubbing window.scrollTo and clicking a PLAIN landing link from the same
  // offset lands at 706px (the destination's max scroll — the defect), while the
  // same stub through this dialog lands at 0. scrollTo was called and swallowed
  // exactly once in both, so the refuter is working; the difference is the scroll
  // lock. InstructionManual.jsx restores body.style.overflow in a PASSIVE effect
  // cleanup, which runs after paint — so during the commit that swaps / for
  // /profile the body is still overflow: hidden, the viewport is momentarily not
  // scrollable, and Chromium RESETS the offset to 0 rather than clamping it to
  // the new maximum. Then the cleanup restores overflow and 0 stands.
  // So this hop verifies the user-visible outcome for the app's one
  // navigate-out-of-a-modal path, and proves nothing about useOpenAtTop. Keep it
  // for the former; do not read a --broken run's count as 33-of-33 refuted.
  {
    from: '/', to: '/profile', via: 'manual',
    pre: `document.querySelector('button.ui-manual-open')`,
    find: `document.querySelector('.ui-manual-panel a[href="/profile"]')`,
  },

  // The catch-all. /login and * were the two routes that never appeared in the
  // matrix at all.
  //
  // These two carry their own viewport, and the reason is worth stating: the 404
  // page is short — one card between the chrome and the footer — so at 1280x720
  // it is only ~154px taller than the window and the instrument check correctly
  // reported both hops INERT, i.e. proving nothing. Shrinking the viewport for
  // these two cases is not weakening the test, it is the only way to give them
  // an offset to carry at all; without it the catch-all is the one route in the
  // app with no real coverage.
  { from: '/no-such-page', to: '/', via: '404', find: `document.querySelector('.ui-main a[href="/"]')`, viewport: { width: 1280, height: 380 } },
  { from: '/no-such-page', to: '/profile', via: '404', find: `document.querySelector('.ui-main a[href="/profile"]')`, viewport: { width: 1280, height: 380 } },
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

    // Seed on EVERY document, not once up front. Four of the hops below are form
    // Continue buttons, and updateSection() deliberately clears `result` for the
    // business, location and finance sections — so one up-front seed would leave
    // every later result-page hop rendering an empty state, and an empty page is
    // short enough that the instrument check would report it INERT. Worse, that
    // would look like a coverage problem rather than what it is: the fixture
    // being consumed by an earlier case. Re-seeding before any app code runs
    // makes each hop independent of the ones before it.
    //
    // The try/catch is for about:blank, whose opaque origin throws on any
    // storage access.
    const payload = JSON.stringify({
      v: 1,
      data: { ...FORMS_GOOD, result: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')) },
    })
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          sessionStorage.setItem('sih-application', ${JSON.stringify(payload)})
          localStorage.setItem('sih-language', 'en')
          localStorage.setItem('sih-theme', 'light')
          localStorage.setItem('sih-textsize', 'md')
          localStorage.removeItem('sih-dialect')
        } catch {}
      `,
    })

    // A warm-up load: Vite compiles on demand, and the first hit of a route is
    // far slower than the rest. Without this the first hop's fixed sleep can
    // expire mid-compile.
    await cdp.send('Page.navigate', { url: APP + '/' })
    await sleep(1500)

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
      const label = `${hop.from} -> ${hop.to} (${hop.via})`

      // Cleared unconditionally at the TOP of every iteration rather than at the
      // bottom of the ones that set it: three branches below `continue` out of
      // the case, and any of them would otherwise leak a short viewport into the
      // next hop, where it would silently change what that hop measured.
      await cdp.send('Emulation.clearDeviceMetricsOverride')
      if (hop.viewport) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { ...hop.viewport, deviceScaleFactor: 1, mobile: false })
      }

      await goto(hop.from)
      const before = await scrollToBottom()

      // `pre` runs AFTER the scroll, deliberately. The manual hop needs the
      // landing page already scrolled at the moment the dialog opens, because
      // opening it is what puts body overflow: hidden in effect — a lock applied
      // at offset 0 would test nothing. The startover hop needs the same order
      // for a plainer reason: its dialog's confirm is what navigates, so the
      // offset has to be in place before either click.
      if (hop.pre) {
        const opened = await cdp.evaluate(`(() => {
          const el = ${hop.pre}
          if (!el) return { ok: false, why: 'opening control not found' }
          el.click()
          return { ok: true }
        })()`)
        if (!opened.ok) {
          findings.push({ kind: 'NO-CONTROL', hop: label, note: `${hop.via}: ${opened.why}` })
          report.hops.push({ ...hop, scrolledTo: before.y, after: null, error: opened.why })
          continue
        }
        await sleep(500)
      }

      // Re-measured after `pre` rather than reusing before.y, because a dialog
      // that moves focus can scroll the document out from under the case, and
      // then the hop would pass while proving nothing.
      const carried = hop.pre ? await offset() : before.y

      // The instrument check. If the source page could not scroll, the hop
      // proves nothing whether it passes or fails — a clean result from an inert
      // case is indistinguishable from a clean result from a working one, which
      // is the trap tools/README.md's last section is about.
      if (before.max < 200 || carried < 200) {
        findings.push({ kind: 'INERT', hop: label, note: `carried only ${carried}px of ${before.max}px scrollable; case proves nothing` })
        report.hops.push({ ...hop, scrolledTo: carried, scrollable: before.max, after: null, inert: true })
        continue
      }

      const clicked = await cdp.evaluate(`(() => {
        const el = ${hop.find}
        if (!el) return { ok: false, why: 'control not found' }
        el.click()
        return { ok: true, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40) }
      })()`)

      if (!clicked.ok) {
        findings.push({ kind: 'NO-CONTROL', hop: label, note: `${hop.via}: ${clicked.why}` })
        report.hops.push({ ...hop, scrolledTo: carried, after: null, error: clicked.why })
        continue
      }

      await sleep(hop.wait ?? 700)
      const landedOn = await cdp.evaluate('location.pathname')
      const after = await offset()

      if (landedOn !== hop.to) {
        findings.push({ kind: 'NO-NAV', hop: label, note: `clicked ${clicked.tag} "${clicked.text}" but landed on ${landedOn}` })
      } else if (after > 4) {
        // 4px of slack rather than an exact 0: a sub-pixel layout settle can
        // leave a rounded 1, and a false alarm on this check would be worse than
        // the tolerance, since the defect it watches for is hundreds of pixels.
        findings.push({ kind: 'TOP', hop: label, note: `${hop.to} opened at ${after}px, not at the top (came from ${carried}px)` })
      }
      report.hops.push({ ...hop, scrolledTo: carried, scrollable: before.max, landedOn, after, control: clicked.text })
    }

    // The last hop in HOPS carries a viewport override; the back and anchor arms
    // below must run at the real window size like every other case.
    await cdp.send('Emulation.clearDeviceMetricsOverride')

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
    const vp = h.viewport ? `  (viewport ${h.viewport.width}x${h.viewport.height})` : ''
    console.log(`  ${String(h.from).padEnd(14)} -> ${String(h.to).padEnd(10)} via ${h.via.padEnd(11)} from ${String(h.scrolledTo ?? '?').padStart(5)}px  opened at ${mark}${vp}`)
  }

  // Which classes of control actually ran. A per-hop pass list does not show
  // this, and the whole reason this file was rewritten is that its first version
  // tested two classes out of eleven while reading as complete coverage.
  const byClass = {}
  for (const h of report.hops) {
    byClass[h.via] ??= { ran: 0, inert: 0 }
    byClass[h.via].ran += 1
    if (h.inert) byClass[h.via].inert += 1
  }
  const classes = Object.entries(byClass)
    .map(([via, c]) => `${via} ${c.ran - c.inert}/${c.ran}`)
    .join('  ')
  console.log(`\n  control classes exercised (non-inert/total): ${classes}`)
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

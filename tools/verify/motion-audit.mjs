// Does the motion actually run, and does prefers-reduced-motion actually stop it?
//
// This is the one question the other fifteen verifiers are structurally blind to.
// Not one of them calls getAnimations(), reads transition-duration or
// transition-property, samples two frames, or enables the CDP Animation domain —
// they all measure a page at rest. So a transition that silently no-ops produces
// a byte-identical report.json to one that runs, and every gate stays green.
//
// That is not a hypothetical. It was live in this tree: a formatter hook wrote
// back a copy of index.css that predated the three --motion-* token definitions
// while keeping all ten `transition:` declarations that reference them. An
// undefined custom property makes the WHOLE declaration invalid at computed-value
// time — it does not fall back to a default duration, it disappears — so all ten
// controls snapped, `var(--motion-fast)` sat in the built stylesheet looking
// perfectly correct, eslint exited 0, vite build exited 0, and drive / mobile /
// field-align / lang-layout / print-audit / manual-audit / hero-art / brand-mark /
// hero-geom all passed. Check TOKENS below is the check that catches it.
//
// The reduced-motion guard had never been exercised by anything at all, which
// matters more than the count suggests: it is an accessibility promise, it is made
// of six declarations each of which fails differently when wrong (a delay survives
// a collapsed duration; `animation: none` drops fill-mode with it and leaves an
// element permanently at opacity 0; 0.01ms does not stop `infinite`, it strobes),
// and against a Tailwind `!` utility it holds only from a layer declared before
// utilities, which is why it sits in @layer base (see TAILWIND_TARGET).
//
// Run the Vite dev server first, then: node tools/verify/motion-audit.mjs
//   --broken   puts every defect back at runtime and MUST exit 1; exit 2 means a
//              planted defect went unreported
// Without it, 0 is clean and 1 a finding. In either mode, 2 also means the run
// could not measure: the dev server is down or went away mid-run (a navigation
// failed, or landed on Edge's error page or an error status), the working
// directory is wrong, the seed is a shape AppContext no longer reads, the first
// load never filled #main with index.css applied, so TOKENS went unread
// (NOT-RENDERED), /analysis lost its seed (UNSEEDED), a selector matched nothing
// (ABSENT), Edge never opened its DevTools port or the socket closed, the run
// ended short of its verdict, or the audit crashed. report.json carries the same
// code as `exit`. NOT-RENDERED, UNSEEDED, ABSENT and a missed refuter still write
// one; any other 2 leaves none.
//
// That flag is not a convenience. A check that has only ever reported zero has not
// been shown to work — this repo has been bitten by that twice (the SPLIT-FIGURE
// check reported 0 problems twice on visibly broken output; field-align's ORPHAN
// arm was inert across 56 loads). Two arms here fired for real on the first run,
// which is its own evidence: .ui-icon-button came back ABSENT because I had it on
// the wrong page, and the FORBIDDEN arm reported a false violation on
// .ui-skip-link because transition-property's initial value is `all`. --broken
// covers ten more: TOKENS, PROPS, INERT, NORUN, DELAY, FORBIDDEN, ONLOAD,
// REDUCED, REDUCED-ZERO, REDUCED-DELAY.
//
// Four arms have no refuter, listed rather than left to look covered:
//   REDUCED-ITER   — nothing in this app declares a keyframe animation, so
//                    animation-name is `none` everywhere and the arm is currently
//                    unreachable by construction. It guards a future addition.
//   REDUCED-SCROLL — nothing in this app sets `scroll-behavior: smooth`, so html
//                    computes `auto` with or without the guard, and the arm is
//                    unreachable the same way. It guards a future addition too.
//   ALWAYS-REDUCED — needs the guard moved OUTSIDE its @media query, which is a
//                    different injection from every other one here.
//   UNREACHABLE    — needs a target with no painted box.
//
// And what this script found on its own once the listener was scoped to the element
// under test: .ui-navbar-link.is-active had no hover response at all. See the
// comment on that rule in index.css — the interesting part is that an UNSCOPED
// listener reported it as working, because moving the pointer across the bar
// animates the links it passes over.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9365
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/motion')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-motion')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BROKEN = process.argv.includes('--broken')

// 0 means the run measured and found nothing, 1 a finding (under --broken, every
// planted kind reported), and 2 that the run could not measure. Node's own exit
// on an uncaught error is 1, which reads as a finding and under --broken as the
// pass, so anything thrown or rejected that nothing catches exits 2 instead.
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
// socket that closed under a pending send left that send unsettled, the event
// loop drained, and node exited 0 with no report. The verdict overrides it.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/motion-audit.mjs'))) {
  console.error(`motion-audit: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/motion-audit.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's
// goes once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, 'report.json'), { force: true })

// A server that is down used to surface as a crash inside the page (Edge's own
// error page refuses storage access), which read as a finding.
// It returns false with exitCode 2 set, and main() returns before Edge starts,
// so node exits on its own: process.exit() this soon after a fetch can abort
// it (see crashExit).
async function requireServer(url, start) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    await res.body?.cancel()
    if (res.ok) return true
    console.error(`motion-audit: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`motion-audit: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// Each block reintroduces one real failure mode, so a run with --broken has to
// report at least one finding of each kind below. The comments say which.
const BROKEN_CSS = `
/* TOKENS + INERT + PROPS. \`initial\` on a custom property is the spec's way of
   making it guaranteed-invalid, i.e. exactly as undefined as the formatter hook
   left it — so every \`transition: <prop> var(--motion-fast)\` becomes invalid at
   computed-value time and is dropped whole, taking transition-property back to its
   initial \`all\` with it. --motion is deliberately left alive, so the two chart
   targets keep working and the failure is visibly per-token rather than global. */
:root { --motion-fast: initial; }

/* FORBIDDEN. The skip link flying in from left:-9999px. */
.ui-skip-link { transition: left 200ms ease !important; }

/* REDUCED. This is the layer argument made executable. Cascade 5 reverses layer
   order for !important, so base-important beats utilities-important, and any
   layered important beats an unlayered one. With the guard in @layer base these
   three rules LOSE, which is the reason it sits there, so inject() first moves
   the guard out of @layer base at runtime. What is refuted is then the real
   regression: the guard moved back out of the layer, where a Tailwind \`!\`
   modifier on a transition utility at a call site beats it. */
@layer utilities { .ui-utility-button { transition-duration: 300ms !important; } }

/* REDUCED-ZERO. A guard that collapses to 0s instead of 0.01ms fires no
   transitionrun/start/end at all. */
@layer utilities { .ui-textsize button { transition-duration: 0s !important; } }

/* REDUCED-DELAY. The declaration people forget: a delay outlives a collapsed
   duration, so the control still waits and then snaps. */
@layer utilities { .ui-navbar-link { transition-delay: 200ms !important; } }
`

// The three tokens, and what each is allowed to be. A duration token that
// resolves to 0s is the failure this script exists for, so the floor is not
// cosmetic — but there is a ceiling too, because "smooth" past ~250ms on a
// control a thumb just pressed reads as the app being slow rather than as polish.
const TOKENS = [
  { name: '--motion-fast', kind: 'time', min: 0.05, max: 0.25 },
  { name: '--motion', kind: 'time', min: 0.05, max: 0.30 },
  { name: '--motion-ease', kind: 'easing' },
]

// Every eased control in index.css, the properties its declaration names, and
// where in the app it can be found. `hover` says whether a real pointer event can
// start it — the two chart pieces are driven by data rather than by the pointer,
// so they are checked declaratively only.
//
// The property lists are transcribed from index.css deliberately rather than read
// back loosely: an over-broad `transition: all` would satisfy a "does it animate"
// check while easing layout properties nobody vetted, and on these pages that
// means width/height moving under mobile-audit's OVERFLOW and field-align's 1.5px
// tolerance. So the assertion is that the computed property list is EXACTLY this.
const TARGETS = [
  { sel: '.ui-textsize button', page: 'landing', props: ['background-color'], hover: true },
  { sel: '.ui-utility-button', page: 'landing', props: ['background-color', 'border-color'], hover: true },
  // Split deliberately. The first .ui-navbar-link on any page is the one for that
  // page, so a bare selector always tests the ACTIVE link and never the eight
  // beside it — and the active one is the single case where the hover was broken.
  { sel: '.ui-navbar-link:not(.is-active)', page: 'landing', props: ['background-color', 'border-bottom-color'], hover: true },
  { sel: '.ui-navbar-link.is-active', page: 'landing', props: ['background-color', 'border-bottom-color'], hover: true },
  { sel: '.ui-manual-open', page: 'landing', props: ['background-color'], hover: true },
  { sel: '.ui-manual-secondary', page: 'manual', props: ['background-color', 'border-color'], hover: true },
  // Inside the manual dialog, not on the landing page. .ui-icon-button reads like
  // chrome and CLAUDE.md lists it among the content classes without saying where,
  // but its only call site in the whole app is the manual's close button
  // (InstructionManual.jsx:168, `ui-icon-button ui-manual-close`). Pointing this
  // row at the landing page made it report ABSENT, which is the right failure —
  // a selector that matches nothing is a row that has been testing nothing.
  { sel: '.ui-icon-button', page: 'manual', props: ['transform', 'border-color', 'background-color'], hover: true },
  { sel: '.ui-breadcrumb a', page: 'analysis', props: ['text-decoration-color'], hover: true },
  { sel: '.ui-disclosure > summary', page: 'analysis', props: ['background-color'], hover: true },
  { sel: '.ui-bar-fill', page: 'analysis', props: ['width'], hover: false },
  { sel: '.ui-unit-chart span', page: 'analysis', props: ['background-color', 'border-color'], hover: false },
]

// Two selectors that must NOT be eased, for opposite reasons. A check that only
// ever asserts presence cannot fail on an over-eager transition, and both of
// these break in a way that is invisible in a screenshot.
//
// THE PROPERTY NAME ALONE PROVES NOTHING HERE, and the first version of this check
// reported a false violation on exactly that: `transition-property`'s initial value
// is `all`, so an element with no transition whatsoever computes `all` — paired
// with `transition-duration: 0s`. .ui-skip-link declares nothing at all
// (index.css:275) and was flagged as easing everything. So a violation is a
// forbidden property WITH a live duration, which is also why `all` stays on these
// lists: `transition: all 200ms` on the skip link genuinely is the defect, and the
// duration is what separates it from the default.
const FORBIDDEN = [
  {
    sel: '.ui-skip-link', page: 'landing', props: ['left', 'top', 'inset-inline-start', 'all'],
    why: ':focus moves it from left:-9999px to 0. Easing that means a keyboard user'
      + ' watches the first control on the page fly in from off-canvas, and the'
      + ' target is not where the ring says it is until it lands.',
  },
  {
    sel: '.ui-unit-chart span', page: 'analysis', props: ['font-size', 'width', 'height', 'all'],
    why: '`font-size: 0` is what hides the emoji glyph in an empty slot, and an'
      + " emoji's advance is ~1.28em against a box fixed at 1.6rem — the documented"
      + ' reason mobile-audit exempts .ui-unit-chart from CLIP. That exemption'
      + ' covers a static overhang; easing font-size makes it a moving one.',
  },
]

// The Tailwind side. Button.jsx carries the bare `transition` utility plus
// `active:scale-[0.98]`, and the utility compiles into @layer utilities — which is
// exactly what the reduced-motion guard has to beat. Cascade 5 REVERSES layer
// order for !important and treats unlayered as a final implicit layer, so an
// unlayered `!important` is the WEAKEST author important and Tailwind's `!`
// modifier would win over it. The guard therefore lives in @layer base. Measured
// in this browser: utilities-important 300ms vs unlayered-important 0.01ms gives
// 300ms; the same rule in @layer base gives 0.01ms. This target reports REDUCED
// when a transition utility on a hero button survives the guard. That takes two
// things at once, a `!` modifier on the utility and a guard in no layer (or in one
// declared after utilities), and Button.jsx has no `!`. Its bare `transition` is a
// normal declaration, which an !important guard beats from any layer or from
// none, so a guard moved back out of @layer base still measures 0.01ms here and
// the plain run exits 0. Only --broken notices the move, and as a refuter fault,
// not a finding: inject() finds no guard inside @layer base to take out, so
// guardMoved stays 0 and the run exits 2. Measured on 1 Oct 2026 with the guard
// moved out at runtime on every load: plain 0, --broken 2.
const TAILWIND_TARGET = { sel: '.ui-hero a[class*="rounded-xl"], .ui-hero button[class*="rounded-xl"]', page: 'landing' }

const FORMS_GOOD = {
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

// AppContext silently discards a payload whose v is not in its
// READABLE_VERSIONS, and /analysis then shows its empty state. Every field
// FORMS_GOOD carries is a version 4 field, so the seed says 4, and this refuses
// to start once AppContext stops reading 4.
const SEED_VERSION = 4
{
  const file = 'frontend/src/context/AppContext.jsx'
  const m = readFileSync(resolve(file), 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `motion-audit: ${file} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite FORMS_GOOD in the current shape and raise SEED_VERSION.`
      : `motion-audit: READABLE_VERSIONS not found in ${file}; update the parse in motion-audit.mjs.`)
    process.exit(2)
  }
}

// The app writes its state back to sessionStorage once it has mounted, so a
// seed it discarded reads back with no result.
const SEEDED = `(() => {
  try { return !!JSON.parse(sessionStorage.getItem('sih-application')).data.result } catch { return false }
})()`

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
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed before it opened')))
    })
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
    // Edge gone closes the socket, and a reply still pending will never come. It
    // has to fail: a pending promise does not keep node alive, so the run would
    // stop short of its verdict without a word.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
    })
  }

  send(method, params = {}, useSession = true) {
    // A frame sent on a socket that is not open is dropped without an error, so
    // its reply would never come.
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

// Page.navigate answers with errorText when the load failed outright, for
// example with the connection refused because the dev server has gone. That is
// a run that cannot measure, never a finding, so it throws to main's catch.
async function navigate(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`navigating to ${url} failed: ${errorText}`)
}

// Read once the page has had time to load. Edge's own error page, or a
// navigation entry with a non-2xx status, is a page that did not render the app,
// so it throws as well. A status of 0 means the browser does not know it.
const NOT_RENDERED = `(() => {
  if (location.protocol === 'chrome-error:') return 'Edge showed its own error page'
  const status = performance.getEntriesByType('navigation')[0]?.responseStatus
  return status && (status < 200 || status > 299) ? 'the server answered HTTP ' + status : ''
})()`

async function requireRendered(cdp, url) {
  const why = await cdp.evaluate(NOT_RENDERED)
  if (why) throw new Error(`${url} did not render: ${why}`)
}

// How far the app has got: the text in #main, and a token index.css defines. It
// is a --color-* token and never a --motion-* one, or a deleted motion token would
// read as a page that never loaded instead of as TOKENS.
const APP_STATE = `(() => ({
  main: document.querySelector('#main')?.innerText?.trim().length || 0,
  colorText: getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim(),
}))()`

// Vite injects index.css as a <style> from a JS module, once the whole module
// graph has loaded, so a slow first load (a cold dep cache, a machine busy with
// other gates) can still be unstyled when the sleep ends. Polls for up to 15 s and
// returns the last state it saw.
async function waitForApp(cdp) {
  let state = { main: 0, colorText: '' }
  for (let i = 0; i < 75; i++) {
    // A page still loading can fail an evaluate, which only means not yet. A
    // closed socket means never, and stops the run.
    const got = await cdp.evaluate(APP_STATE).catch((err) => { if (cdp.closed) throw err; return null })
    if (got) state = got
    if (state.main > 40 && state.colorText) return { ready: true, ...state }
    await sleep(200)
  }
  return { ready: false, ...state }
}

// Reading a custom property back with getPropertyValue returns the raw token TEXT
// — "120ms", or the whole var() chain — which tells you the declaration is present
// and nothing about whether it RESOLVES. That distinction is the entire bug this
// script was written for: the ten transitions all still contained
// `var(--motion-fast)` when they were inert.
//
// So the token is measured the way the browser uses it: assign `var(--token)` to a
// real property on a probe and read the computed longhand back. If the token is
// undefined the declaration is invalid at computed-value time and the computed
// value stays at its initial `0s` — which is exactly the observable symptom.
const TOKEN_PROBE = (tokens) => `(() => {
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.left = '-99999px'
  document.body.appendChild(probe)
  const out = {}
  for (const t of ${JSON.stringify(tokens)}) {
    probe.style.transitionDuration = ''
    probe.style.transitionTimingFunction = ''
    if (t.kind === 'time') {
      probe.style.transitionDuration = 'var(' + t.name + ')'
      out[t.name] = getComputedStyle(probe).transitionDuration
    } else {
      probe.style.transitionTimingFunction = 'var(' + t.name + ')'
      out[t.name] = getComputedStyle(probe).transitionTimingFunction
    }
  }
  probe.remove()
  return out
})()`

// A transition's computed shorthand is four parallel comma-lists that do not have
// to be the same length — the shorter ones repeat. So the pairing has to be done
// by index modulo, not by zip, or a two-property declaration with one duration
// reports the second property as having no duration at all.
const READ_PROBE = (sel) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})]
  if (!els.length) return { missing: true }
  const el = els[0]
  const cs = getComputedStyle(el)
  const split = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean)
  const props = split(cs.transitionProperty)
  const durs = split(cs.transitionDuration)
  const delays = split(cs.transitionDelay)
  const eases = split(cs.transitionTimingFunction)
  const pick = (list, i) => (list.length ? list[i % list.length] : '')
  const r = el.getBoundingClientRect()
  return {
    count: els.length,
    props,
    entries: props.map((p, i) => ({
      prop: p, dur: pick(durs, i), delay: pick(delays, i), ease: pick(eases, i),
    })),
    animName: cs.animationName,
    animIter: cs.animationIterationCount,
    animDur: cs.animationDuration,
    animDelay: cs.animationDelay,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    visible: r.width > 0 && r.height > 0,
  }
})()`

// Declared is not the same as running, and the gap between them is where the
// cascade lives: a later rule can reset transition-property, an ancestor can be
// display:none, the property can be one that does not actually change on :hover.
// So the real hover is dispatched through the input pipeline (a synthetic JS event
// cannot set :hover) and the transitions are collected by LISTENER rather than by
// polling getAnimations().
//
// Listening is what removes the race. getAnimations() has to be sampled while the
// transition is still in flight, and --motion-fast is 120ms against a CDP round
// trip — so a slow sample reports zero and the check fails on a working page.
// transitionrun fires once per property regardless of when the read happens.
//
// The listener is on `document` in the capture phase, which means it sees a
// transition on ANY element — so it has to be scoped to the element under test or
// the check leaks. It did: the refuter pass reported .ui-utility-button as having
// started a background-color transition while its own declaration was inert,
// because parking the pointer at (2,2) and moving it to the control crosses other
// controls on the way and they animate. A leak in this direction is the dangerous
// one — it turns NORUN into a pass. window.__sel is left unset for the page-load
// pass, where "anything at all animated" is exactly the question.
const ARM_PROBE = `(() => {
  window.__motion = { run: [], start: [], end: [] }
  const on = (k) => (e) => {
    const sel = window.__sel
    if (sel && !(e.target instanceof Element && e.target.matches(sel))) return
    window.__motion[k].push(e.propertyName)
  }
  document.addEventListener('transitionrun', on('run'), true)
  document.addEventListener('transitionstart', on('start'), true)
  document.addEventListener('transitionend', on('end'), true)
  return true
})()`

async function hoverCentre(cdp, sel) {
  const box = await cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (!(r.width > 0 && r.height > 0)) return null
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const s = el.getBoundingClientRect()
    return [Math.round(s.left + s.width / 2), Math.round(s.top + s.height / 2)]
  })()`)
  if (!box) return null
  await cdp.evaluate(`window.__sel = ${JSON.stringify(sel)}; true`)
  // Park the pointer somewhere neutral first. Landing on the element from a
  // previous element's centre can leave :hover already applied, in which case the
  // move changes nothing and no transition runs — a pass condition misreported.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, buttons: 0 })
  await sleep(40)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box[0], y: box[1], buttons: 0 })
  return box
}

const num = (v) => {
  const s = String(v || '').trim()
  if (s.endsWith('ms')) return parseFloat(s) / 1000
  return parseFloat(s) || 0
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
    '--window-size=1440,1200',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const findings = []
  const report = { tokens: {}, targets: [], forbidden: [], reduced: [], tailwind: null }
  // How many reduced-motion guards --broken moved out of @layer base; read after
  // the finally block, so it lives out here.
  let guardMoved = 0

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // The refuter stylesheet has to be appended AFTER the app's own, and Vite
    // injects its CSS as <style> elements at runtime — so this cannot go through
    // Page.addScriptToEvaluateOnNewDocument, which runs before the document is
    // parsed and would land ahead of them. Re-append after every navigation
    // instead, once the app's styles are already in the head.
    //
    // Before appending, it takes the reduced-motion guard out of @layer base and
    // re-adds it unlayered. Without that the REDUCED rules in BROKEN_CSS lose to
    // the guard, and the three REDUCED arms pass whether or not they work, which
    // they did from 9 Sept 2026, when the guard moved into the layer, until 25 Sept.
    const inject = async () => {
      if (!BROKEN) return
      guardMoved += await cdp.evaluate(`(() => {
        const out = []
        const walk = (list, layer) => {
          for (let i = list.length - 1; i >= 0; i--) {
            const r = list[i]
            if (r instanceof CSSLayerBlockRule) walk(r.cssRules, r)
            else if (layer && layer.name === 'base' && r instanceof CSSMediaRule
              && /prefers-reduced-motion/.test(r.media.mediaText)) {
              out.push(r.cssText)
              layer.deleteRule(i)
            }
          }
        }
        for (const sheet of document.styleSheets) {
          if (sheet.ownerNode && sheet.ownerNode.id === 'motion-audit-broken') continue
          try { walk(sheet.cssRules, null) } catch { /* a sheet whose rules cannot be read */ }
        }
        const s = document.createElement('style')
        s.id = 'motion-audit-broken'
        s.textContent = ${JSON.stringify(BROKEN_CSS)} + out.join(' ')
        document.head.appendChild(s)
        return out.length
      })()`)
    }

    // Seed once. The origin has to exist before storage can be written to it.
    await navigate(cdp, APP + '/')
    await sleep(1200)
    await requireRendered(cdp, APP + '/')
    // TOKENS is read on this document, and it is the one arm that needs no element:
    // on a page index.css has not reached yet, the others find no element and read
    // ABSENT, but TOKENS reads both duration tokens as 0s, a finding. So it waits
    // for the app and its stylesheet, and does so before inject(): BROKEN_CSS's
    // :root rule and index.css's are both unlayered, so the later <style> wins, and
    // a refuter appended ahead of index.css would vanish. Refuted on 1 Oct 2026 by
    // holding the /src/index.css request on this load through CDP Fetch: without
    // the wait the run exited 1 with two TOKENS findings, with it 2.
    const first = await waitForApp(cdp)
    if (!first.ready) {
      findings.push({
        kind: 'NOT-RENDERED', sel: '#main', page: 'landing', main: first.main, colorText: first.colorText,
        note: `after 15 s #main held ${first.main} characters and --color-text read '${first.colorText}': the first load never showed the app with index.css applied, so the tokens were not measured`,
      })
    }
    await inject()
    const payload = JSON.stringify({
      v: SEED_VERSION,
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

    // `manual` is the landing page with the instruction dialog open, which is the
    // only state .ui-manual-secondary exists in — it is the dialog's own dismiss
    // control. Opening it by click rather than by setting state keeps this honest
    // about whether a reader can actually reach the button.
    const gotoPage = async (page) => {
      const route = page === 'analysis' ? '/analysis' : '/'
      await navigate(cdp, APP + route)
      await sleep(1300)
      await requireRendered(cdp, APP + route)
      await inject()
      if (route === '/analysis' && !(await cdp.evaluate(SEEDED))) {
        findings.push({
          kind: 'UNSEEDED', page,
          note: 'no result in the app\'s state: the seed was not read, so /analysis is its empty state',
        })
      }
      if (page === 'manual') {
        const ok = await cdp.evaluate(`(() => {
          const b = document.querySelector('.ui-manual-open')
          if (!b) return false
          b.click()
          return true
        })()`)
        if (!ok) throw new Error('could not find .ui-manual-open to open the manual')
        await sleep(600)
      }
    }

    // ---- 1. TOKENS -------------------------------------------------------
    console.log('\n=== motion tokens (resolved the way the browser uses them) ===')
    if (!first.ready) {
      // Without index.css both duration tokens read 0s, which would be a finding.
      console.log('    not measured: the first load never showed the app with index.css applied')
    } else {
      const tokens = await cdp.evaluate(TOKEN_PROBE(TOKENS))
      report.tokens = tokens
      for (const t of TOKENS) {
        const raw = tokens[t.name]
        console.log(`    ${t.name.padEnd(15)} -> ${raw}`)
        if (t.kind === 'time') {
          const s = num(raw)
          if (s <= 0) {
            findings.push({
              kind: 'TOKENS', token: t.name, resolved: raw,
              note: 'resolves to zero, so every `transition: <prop> var(' + t.name + ')` in'
                + ' index.css is invalid at computed-value time and DROPPED ENTIRELY. The'
                + ' var() still sits in the built stylesheet and every other gate passes.',
            })
          } else if (s < t.min || s > t.max) {
            findings.push({
              kind: 'TOKENS', token: t.name, resolved: raw,
              note: `outside the ${t.min}s..${t.max}s window this UI was tuned in`,
            })
          }
        } else if (!/cubic-bezier|ease|linear|steps/.test(String(raw))) {
          findings.push({ kind: 'TOKENS', token: t.name, resolved: raw, note: 'not a resolvable easing function' })
        }
      }
    }

    // ---- 2. DECLARED + 3. RUNS -------------------------------------------
    console.log('\n=== declared, and does a real hover start it ===')
    let page = null
    for (const target of TARGETS) {
      if (target.page !== page) { await gotoPage(target.page); page = target.page }
      await cdp.evaluate(ARM_PROBE)
      const m = await cdp.evaluate(READ_PROBE(target.sel))

      if (m.missing) {
        findings.push({ kind: 'ABSENT', sel: target.sel, page: target.page, note: 'selector matched nothing — the target moved or was renamed, so this row has been testing nothing' })
        console.log(`    ${target.sel.padEnd(24)} ABSENT on ${target.page}`)
        continue
      }

      const got = m.props.slice().sort()
      const want = target.props.slice().sort()
      if (got.join('|') !== want.join('|')) {
        findings.push({
          kind: 'PROPS', sel: target.sel, page: target.page, got: m.props, want: target.props,
          note: got.includes('all')
            ? 'transition-property computed to `all`, which eases layout properties nobody vetted'
            : 'the computed property list does not match what index.css declares',
        })
      }

      for (const e of m.entries) {
        if (num(e.dur) <= 0) {
          findings.push({ kind: 'INERT', sel: target.sel, page: target.page, prop: e.prop, dur: e.dur, note: 'declared but zero-duration, so it snaps' })
        }
        if (num(e.delay) > 0) {
          findings.push({ kind: 'DELAY', sel: target.sel, page: target.page, prop: e.prop, delay: e.delay, note: 'an interaction response must not wait before it starts' })
        }
      }

      let fired = null
      if (target.hover) {
        const at = await hoverCentre(cdp, target.sel)
        if (!at) {
          findings.push({ kind: 'UNREACHABLE', sel: target.sel, page: target.page, note: 'has no painted box, so no pointer can ever start its transition' })
        } else {
          await sleep(90)
          fired = await cdp.evaluate('window.__motion')
          const started = new Set([...(fired.run || []), ...(fired.start || [])])
          const hit = target.props.filter((p) => started.has(p))
          if (!hit.length) {
            findings.push({
              kind: 'NORUN', sel: target.sel, page: target.page, expected: target.props,
              observed: [...started],
              note: 'declared correctly but a real pointer move over its centre started'
                + ' nothing — either :hover changes none of these properties, or a later'
                + ' rule resets them, so the declaration is decoration',
            })
          }
          console.log(`    ${target.sel.padEnd(24)} ${m.entries.map((e) => e.prop + ' ' + e.dur).join(', ').padEnd(58)} hover -> ${hit.join(',') || 'NOTHING'}`)
        }
      } else {
        console.log(`    ${target.sel.padEnd(24)} ${m.entries.map((e) => e.prop + ' ' + e.dur).join(', ').padEnd(58)} (data-driven, not hovered)`)
      }
      report.targets.push({ ...target, measured: m, fired })
    }

    // ---- 4. FORBIDDEN ----------------------------------------------------
    // .ui-bar-fill's width transition is safe only because a transition needs a
    // PREVIOUS value to interpolate from and the width arrives inline at mount, so
    // nothing runs on load. That is asserted rather than assumed: a load pass that
    // recorded a width transition would mean every chart animates on every page
    // view, inside the tolerance windows field-align and lang-layout measure in.
    console.log('\n=== must NOT be eased ===')
    for (const f of FORBIDDEN) {
      if (f.page !== page) { await gotoPage(f.page); page = f.page }
      const m = await cdp.evaluate(READ_PROBE(f.sel))
      if (m.missing) {
        findings.push({ kind: 'ABSENT', sel: f.sel, page: f.page, note: 'forbidden-list selector matched nothing, so this row is inert' })
        continue
      }
      const live = m.entries.filter((e) => num(e.dur) > 0)
      const bad = live.filter((e) => f.props.includes(e.prop)).map((e) => `${e.prop} ${e.dur}`)
      const shown = live.length ? live.map((e) => `${e.prop} ${e.dur}`).join(', ') : 'nothing (duration 0s)'
      console.log(`    ${f.sel.padEnd(24)} eases [${shown}]  ->  ${bad.length ? 'VIOLATION: ' + bad.join(', ') : 'clean'}`)
      if (bad.length) findings.push({ kind: 'FORBIDDEN', sel: f.sel, page: f.page, eased: bad, note: f.why })
      report.forbidden.push({ sel: f.sel, props: m.props, live: live.map((e) => `${e.prop} ${e.dur}`), bad })
    }

    await gotoPage('analysis')
    page = 'analysis'
    // Arming with Runtime.evaluate and THEN reloading measures nothing: the reload
    // tears down the window, so both the listener and window.__motion are gone and
    // the read always comes back empty. This is the only place in the script where
    // Page.addScriptToEvaluateOnNewDocument is the right tool — a listener has to be
    // attached before the first style is computed, which is precisely why it is the
    // wrong tool for the refuter stylesheet a few lines up.
    const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: ARM_PROBE + (BROKEN ? `
        // ONLOAD's own refuter: nudge a bar width once the chart has mounted, which
        // is what a load-time animation would look like. Proves the listener above
        // actually catches one. There is no way to inject a genuine load-time
        // transition, because it needs a previous computed value that does not exist
        // on a first paint — which is the reason the real width transition is safe.
        setTimeout(() => {
          const b = document.querySelector('.ui-bar-fill')
          if (b) b.style.width = '11%'
        }, 1000)
      ` : ''),
    })
    await cdp.send('Page.reload')
    await sleep(1600)
    // Page.reload has no errorText, so a reload nothing answered shows only as
    // Edge's error page.
    await requireRendered(cdp, APP + '/analysis')
    await inject()
    const onLoad = await cdp.evaluate('window.__motion || {run:[],start:[],end:[]}')
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
    const loadRan = [...new Set([...(onLoad.run || []), ...(onLoad.start || [])])]
    console.log(`    transitions started by the page load itself: ${loadRan.length ? loadRan.join(', ') : 'none'}`)
    if (loadRan.includes('width')) {
      findings.push({
        kind: 'ONLOAD', props: loadRan,
        note: '.ui-bar-fill animated its width on a plain page load. It is only safe'
          + " because the width arrives inline at mount and a transition has no previous"
          + ' value to interpolate from; if it now runs on load, every chart moves under'
          + " the fixed sleeps the other verifiers measure at.",
      })
    }

    // ---- 5. REDUCED MOTION -----------------------------------------------
    // The guard is six declarations and each fails its own way, so each is asserted
    // separately rather than by "did the duration drop".
    //   - 0.01ms rather than 0: a zero duration fires no transitionrun/start/end,
    //     which hangs anything waiting on the event.
    //   - transition-delay: 0s is the easily-missed one — a delay outlives a
    //     collapsed duration, so `opacity 300ms 200ms` still waits 200ms and snaps.
    //   - animation-iteration-count: 1, not `animation: none` — `none` drops
    //     animation-fill-mode with it and an element whose static style is its
    //     pre-animation state stays stuck there. And 0.01ms does NOT stop
    //     `infinite`; it re-runs thousands of times a second, which is a strobe and
    //     strictly worse for a photosensitive reader than the motion it replaced.
    console.log('\n=== prefers-reduced-motion: reduce ===')
    await cdp.send('Emulation.setEmulatedMedia', {
      media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    const reducedSet = [...TARGETS, TAILWIND_TARGET]
    page = null
    for (const target of reducedSet) {
      const label = target === TAILWIND_TARGET ? 'Button (Tailwind utility)' : target.sel
      if (target.page !== page) { await gotoPage(target.page); page = target.page }
      const m = await cdp.evaluate(READ_PROBE(target.sel))
      if (m.missing) {
        findings.push({ kind: 'ABSENT', sel: label, page: target.page, note: 'not found under reduced motion' })
        continue
      }
      const worstDur = Math.max(...m.entries.map((e) => num(e.dur)), 0)
      const worstDelay = Math.max(...m.entries.map((e) => num(e.delay)), 0)
      console.log(`    ${label.padEnd(30)} worst duration ${worstDur * 1000}ms  worst delay ${worstDelay * 1000}ms  iter ${m.animIter}`)
      if (worstDur === 0) {
        findings.push({
          kind: 'REDUCED-ZERO', sel: label, page: target.page,
          note: 'collapsed to exactly 0s. A zero duration fires no transitionrun,'
            + ' transitionstart or transitionend, so any JS waiting on the event never'
            + ' resumes. The guard uses 0.01ms for this reason.',
        })
      } else if (worstDur > 0.001) {
        findings.push({
          kind: 'REDUCED', sel: label, page: target.page, worstDur,
          note: target === TAILWIND_TARGET
            ? 'a Tailwind `transition` utility survived the guard. Cascade 5 reverses'
              + ' layer order for !important and treats unlayered as a final implicit'
              + ' layer, so an unlayered !important is the WEAKEST author important and'
              + ' @layer utilities beats it. The guard has to sit in @layer base.'
            : 'still animates under prefers-reduced-motion: reduce',
        })
      }
      if (worstDelay > 0) {
        findings.push({
          kind: 'REDUCED-DELAY', sel: label, page: target.page, worstDelay,
          note: 'a transition-delay survives a collapsed duration, so this control still'
            + ' waits before snapping. transition-delay: 0s has to be in the guard too.',
        })
      }
      if (m.animName !== 'none' && num(m.animIter) !== 1 && m.animIter !== '1') {
        findings.push({
          kind: 'REDUCED-ITER', sel: label, page: target.page, iter: m.animIter, anim: m.animName,
          note: 'a repeating animation survived. 0.01ms does not stop `infinite` — it'
            + ' re-runs thousands of times per second, which strobes.',
        })
      }
      report.reduced.push({ sel: label, page: target.page, worstDur, worstDelay, animIter: m.animIter })
      if (target === TAILWIND_TARGET) report.tailwind = { sel: target.sel, worstDur, props: m.props }
    }

    const sb = await cdp.evaluate("getComputedStyle(document.documentElement).scrollBehavior")
    console.log(`    html scroll-behavior under reduce: ${sb}`)
    if (sb !== 'auto') {
      findings.push({ kind: 'REDUCED-SCROLL', value: sb, note: 'smooth scrolling survived the guard' })
    }

    // And the guard must be conditional, not a permanent kill. If it applies with
    // no media query in force then the ten transitions above are inert for every
    // reader and this script's own earlier pass was measuring a different state.
    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await gotoPage('landing')
    const back = await cdp.evaluate(READ_PROBE('.ui-utility-button'))
    if (back.missing) {
      // A control that is not there measured nothing. It used to read as a 0ms
      // duration and report a guard that is always on.
      findings.push({ kind: 'ABSENT', sel: '.ui-utility-button', page: 'landing', note: 'not found back at no-preference, so ALWAYS-REDUCED measured nothing' })
    } else {
      const backDur = Math.max(...back.entries.map((e) => num(e.dur)), 0)
      console.log(`\n    back at no-preference, .ui-utility-button worst duration: ${backDur * 1000}ms`)
      if (backDur <= 0.001) {
        findings.push({
          kind: 'ALWAYS-REDUCED', worstDur: backDur,
          note: 'the reduced-motion guard is applying with no preference set, so the motion'
            + ' is off for everyone. Check the @media query, not the declarations.',
        })
      }
    }

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(OUT, 'landing.png'), Buffer.from(shot.data, 'base64'))
  } finally {
    edge.kill()
  }

  // The /analysis targets were measured on the empty state, so the run is
  // incomplete in either mode, and 1 would read as a pass under --broken.
  const unseeded = findings.some((f) => f.kind === 'UNSEEDED')
  // A selector that matched nothing makes it incomplete too: that row measured
  // nothing, so its ABSENT is not a motion finding, and the others passing is not
  // a pass.
  const absent = findings.some((f) => f.kind === 'ABSENT')
  // So does a first load that never showed the app with its stylesheet: TOKENS was
  // not measured.
  const notRendered = findings.some((f) => f.kind === 'NOT-RENDERED')
  // Exit 1 alone does not prove the refuter works: from 9 to 25 Sept 2026 it exited
  // 1 while three of its ten planted kinds went unreported. So every planted kind
  // must appear, and exit 2 means one did not.
  const planted = ['TOKENS', 'PROPS', 'INERT', 'NORUN', 'DELAY', 'FORBIDDEN', 'ONLOAD', 'REDUCED', 'REDUCED-ZERO', 'REDUCED-DELAY']
  const seen = new Set(findings.map((f) => f.kind))
  const missed = BROKEN ? planted.filter((k) => !seen.has(k)) : []
  const refuterFailed = BROKEN && (missed.length > 0 || !guardMoved)
  const exit = unseeded || absent || notRendered || refuterFailed ? 2 : findings.length ? 1 : 0
  // After the finally, not in it: a crash used to write the findings so far,
  // and a report cut short by a crash read as a clean run.
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ exit, findings, report }, null, 2))

  console.log(`\n=== ${findings.length} finding(s) ===`)
  for (const f of findings) {
    console.log(`  [${f.kind}] ${f.sel || f.token || f.value || ''}`)
    console.log(`      ${f.note}`)
  }
  console.log(`\nreport.json in ${OUT}`)
  if (unseeded) console.log('\nThe seed was not read, so /analysis was measured on its empty state. The run is incomplete.')
  if (absent) console.log('\nA selector matched nothing (ABSENT), so its row measured nothing. The run is incomplete.')
  if (notRendered) console.log('\nThe first load never showed the app with index.css applied (NOT-RENDERED), so TOKENS was not measured. The run is incomplete.')
  if (BROKEN) {
    if (!guardMoved) console.log('\n--broken found no reduced-motion guard inside @layer base to move out, so the REDUCED arms were not refuted.')
    if (missed.length) console.log(`\n--broken: planted kinds not reported: ${missed.join(', ')}`)
    if (!refuterFailed) console.log(`\n--broken: all ${planted.length} planted kinds reported.`)
  }
  process.exit(exit)
}

main().catch((err) => {
  console.error('motion-audit failed:', err.message)
  crashExit()
})

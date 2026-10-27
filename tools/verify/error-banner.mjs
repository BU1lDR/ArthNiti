// The error banner on /finance, in all eight languages, on both of the paths a
// reader can actually reach it by.
//
// This is the one piece of user-facing text no other verifier can see. drive.mjs
// and mobile-audit.mjs LOAD routes; mobile-audit and lang-layout measure geometry;
// manual-audit clicks one dialog open. None of them submits the form, so nothing
// has ever rendered this banner — and until 8 Sept 2026 it printed an English
// sentence in all eight languages, which is exactly the failure a screenshot in
// Hindi would have shown instantly and no script would ever report.
//
// It is also the highest-traffic error text in the app. "The backend is not
// running" is the commonest failure on a demo laptop, so a judge watching a
// Hindi walkthrough is more likely to meet this sentence than most of the pages.
//
// Four cases per language, because they exercise different code:
//
//   VALIDATION  /finance submitted with no business category and no state. The
//               backend returns 422 with a list of field objects, api.js turns
//               that into err.checkFields plus two field keys, and the page
//               translates each key and rejoins them. This is the only path that
//               interpolates anything, so it is the only one that can leak a
//               literal {fields} or an [object Object] — both of which have been
//               live bugs in this file's history.
//   OFFLINE     the same submit with the API URL blocked at the network layer, so
//               fetch rejects and api.js throws err.offline. No placeholder, but
//               it is the path a judge is most likely to see.
//   CONSENT     the same submit with the consent box left unticked. Nothing may
//               be sent: the probe counts calls to /api/analysis/run and expects
//               none, expects the #consent-error message, and expects focus on
//               the box. If an age box is rendered (VITE_REQUIRE_AGE_CHECK=true),
//               it then ticks only the notice box and expects the same of the age
//               box and #consent-age-error.
//   ZERO-INCOME household income seeded as exactly 0. With consent ticked and the
//               zero-income box not, nothing may be sent, #household-zero-error
//               must show and focus must move to the box. Ticking it must then
//               let the request go (it still 422s on category and state).
//
// VALIDATION, OFFLINE and ZERO-INCOME tick every consent box first, with real
// clicks (React ignores .checked = true). The banner is found with API_BANNER,
// which excludes the inline messages by their -error id: an inline message is
// styled as a danger notice too, and would otherwise pass as "the banner
// rendered" when the submit was in fact blocked.
//
// What it fails on, per banner or inline message:
//   * nothing rendered, or an empty banner
//   * a leaked dotted i18n key (err.offline printed as "err.offline")
//   * an unsubstituted {fields}
//   * [object Object] / undefined / null in the text
//   * for a non-English language, text byte-identical to the English banner —
//     which is the original defect and the whole reason this file exists
//   * a validation banner that does not name both empty fields, each in the
//     dictionary's words for its language
//   * a request made while a consent or zero-income box is unticked, a missing
//     inline message, or focus left anywhere but the unticked box
//
// Run the backend AND the Vite dev server first, then:
//   node tools/verify/error-banner.mjs
// Exit 0: nothing found. 1: a finding. 2: the run could not measure: the dev
// server or the backend is down, the backend refuses a CORS preflight from the
// app's origin, the working directory is wrong, AppContext no longer reads the
// seed's version or its STORAGE_KEY will not parse, the dictionaries do not
// load, api.js gives business_category or state no key the en dictionary has,
// a label to look for is empty or already in err.checkFields or the other
// label, Edge's DevTools socket closed, /finance did not load or rendered as
// Edge's error page or a status other than 2xx, a seeded box is not on
// /finance (MISSING) or does not hold the seed (UNSEEDED), the form, its
// submit button, the consent box or the zero-income box is not there, the
// zero-income box carries data-consent, the seeded form fails native
// validation, a request was still waiting for its answer when the banner was
// due (6 s), VALIDATION's request failed outright or was answered with
// anything but a 422, OFFLINE's was not blocked, or the script crashed.
// report.json carries the same code as `exit` and lists the faults; a crash, or
// a run that never started, leaves none.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9347
// localhost, not 127.0.0.1: vite dev binds [::1] only and the IPv4 address refuses.
const APP = 'http://localhost:5173'
// The backend the dev build calls when VITE_API_BASE_URL is unset (api.js).
// VALIDATION needs its 422: with it down, that case meets the offline banner
// and reports "validation banner does not name ...", a finding about a server
// that was not running.
const BACKEND_HEALTH = 'http://127.0.0.1:8000/health'
// Where the /finance submit POSTs, on the same backend.
const ANALYSIS_RUN = new URL('/api/analysis/run', BACKEND_HEALTH).href
const OUT = resolve('screenshots/verify/errors')
// Absolute. A relative --user-data-dir silently attaches to the already-running
// Edge profile and exits with no debug port.
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-errors')

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
if (!existsSync(resolve('tools/verify/error-banner.mjs'))) {
  console.error(`error-banner: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/error-banner.mjs`)
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
    console.error(`error-banner: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`error-banner: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// The page POSTs /api/analysis/run from the app's origin. A backend that refuses
// that origin (production mode, or ARTHNITI_CORS_ORIGINS without it) still
// answers /health, and VALIDATION would then meet the offline banner and report
// it as a finding. So this sends the preflight Edge would, and wants a 2xx that
// allows the origin. It checks the backend on 8000 only: it does not follow
// VITE_API_BASE_URL, which the page honours. Same shape as requireServer, for
// the same reason.
async function requireCors(url, origin, start) {
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      signal: AbortSignal.timeout(5000),
    })
    await res.body?.cancel()
    const allowed = res.headers.get('access-control-allow-origin')
    if (res.ok && (allowed === origin || allowed === '*')) return true
    console.error(`error-banner: ${url} refused a POST from ${origin} (HTTP ${res.status}, access-control-allow-origin ${allowed ?? 'not sent'}). ${start}`)
  } catch (err) {
    console.error(`error-banner: nothing answered the CORS preflight at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']
const CASES = ['validation', 'offline', 'consent', 'zero-income']

// The API error banner, and never one of the inline messages under a box
// (#consent-error, #consent-age-error, #household-zero-error), which are danger
// notices with role=alert too.
const API_BANNER = '[role=alert].ui-notice-danger:not([id$="-error"])'
const INLINE_ERROR = '[role=alert][id$="-error"]'

// AppContext silently discards a payload whose v is not in its
// READABLE_VERSIONS, which leaves /finance blank. Seeded as v:99, three cases
// stopped at native validation on the two required fields, and zero-income
// found no note because the 0 that raises it was gone. Every case failed, for
// the right reason under the wrong names, so this refuses to start once
// AppContext stops reading 4 instead. Every field SEED carries is a version 4
// field, so it says 4.
const SEED_VERSION = 4
const APP_CONTEXT = 'frontend/src/context/AppContext.jsx'
const appContext = readFileSync(resolve(APP_CONTEXT), 'utf8')
{
  const m = appContext.match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m?.[1].split(',').map(Number).includes(SEED_VERSION)) {
    console.error(m
      ? `error-banner: ${APP_CONTEXT} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ${m[1].trim()}). Rewrite SEED in the current shape and raise SEED_VERSION.`
      : `error-banner: READABLE_VERSIONS not found in ${APP_CONTEXT}; update the parse in error-banner.mjs.`)
    process.exit(2)
  }
}
// The sessionStorage key AppContext reads the answers from, parsed the same
// way. A seed written under any other key is never read, and every case would
// measure the same blank /finance as a version it discards.
const STORAGE_KEY = appContext.match(/^const STORAGE_KEY = (['"])([^'"\n]+)\1/m)?.[2]
if (!STORAGE_KEY) {
  console.error(`error-banner: STORAGE_KEY not found in ${APP_CONTEXT}; update the parse in error-banner.mjs.`)
  process.exit(2)
}

// The words the validation banner must hold. SEED leaves these two fields
// empty, so the 422 names both, and FinancePage renders each as t() of the key
// api.js's FIELD_LABELS gives it: this language's text, or English per key, as
// t() falls back. A comma was no evidence: seven of the eight err.checkFields
// sentences carry one of their own, so a banner naming one field, or none,
// passed in every language but Malayalam. The merged table is loaded the way
// market-ui.mjs loads it: strings.js imports its three siblings without an
// extension, which Vite resolves and Node does not, so the specifiers become
// absolute file URLs. A key the en table lacks leaves nothing to look for, and
// is refused as a stale parse is; node tools/keycheck.mjs names it.
const EMPTY_FIELDS = ['business_category', 'state']
const API_JS = 'frontend/src/services/api.js'
const I18N = resolve('frontend/src/i18n')
let STRINGS
try {
  const source = readFileSync(resolve(I18N, 'strings.js'), 'utf8').replace(
    /from '\.\/(resultStrings|backendStrings|schemeStrings)'/g,
    (_, name) => `from '${pathToFileURL(resolve(I18N, name + '.js')).href}'`,
  )
  ;({ STRINGS } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')))
} catch (err) {
  console.error(`error-banner: the dictionaries in ${I18N} did not load (${err.message}).`)
  process.exit(2)
}
const FIELD_TEXT = Object.fromEntries(LANGS.map((lang) => [lang, []]))
{
  const labels = readFileSync(resolve(API_JS), 'utf8').match(/^const FIELD_LABELS = \{([\s\S]*?)\r?\n\}/m)?.[1]
  for (const field of EMPTY_FIELDS) {
    const key = labels?.match(new RegExp('^[ \\t]*' + field + ": \\{\\s*key: '([\\w.]+)'", 'm'))?.[1]
    if (!key) {
      console.error(`error-banner: no FIELD_LABELS key for ${field} found in ${API_JS}; update the parse in error-banner.mjs.`)
      process.exit(2)
    }
    if (typeof STRINGS?.en?.[key] !== 'string') {
      console.error(`error-banner: ${key}, the key ${API_JS} gives ${field}, is not in the en dictionary, so there is no label to look for. Run node tools/keycheck.mjs.`)
      process.exit(2)
    }
    for (const lang of LANGS) FIELD_TEXT[lang].push(String(STRINGS[lang]?.[key] ?? STRINGS.en[key]).trim())
  }
}
// A label that is empty, or that the sentence around it or the other label
// already holds, would be found whether or not the page named its field: the
// comma's defect again. So the check refuses to run on one.
for (const lang of LANGS) {
  const around = String(STRINGS[lang]?.['err.checkFields'] ?? STRINGS.en['err.checkFields'] ?? '').split('{fields}').join('\n')
  for (const [i, label] of FIELD_TEXT[lang].entries()) {
    if (label && !around.includes(label) && !FIELD_TEXT[lang].some((other, j) => j !== i && other.includes(label))) continue
    console.error(`error-banner: in ${lang} the ${EMPTY_FIELDS[i]} label ${JSON.stringify(label)} is empty, or err.checkFields or the other label already holds it, so the validation banner could hold it without naming the field.`)
    process.exit(2)
  }
}

// Fills the two fields /finance marks required — without them native validation
// blocks the submit and the request is never made — while leaving the business
// category and the state empty, which is what makes the backend answer 422 and
// name exactly two fields, EMPTY_FIELDS. Two rather than one is deliberate: it
// exercises the join, and the banner must name both in its own words
// (FIELD_TEXT), so a list that lost one cannot pass as a rendered one. No
// household income, so it is sent as null and the zero-income gate stays shut.
const SEED = {
  v: SEED_VERSION,
  data: {
    profile: { name: 'Probe', language: 'Hindi', dialect: '' },
    business: {
      businessName: '',
      category: '',
      categoryOther: '',
      initialInvestment: '50000',
      monthlyRevenue: '20000',
      monthlyOperatingExpenses: '5000',
      existingDebt: 0,
    },
    location: {
      village: '',
      district: '',
      state: '',
      locationType: 'rural',
      marketType: [],
      customers: '',
    },
    finance: { availableCapital: '10000', monthlyExpenses: '8000', monthlyEmi: '0' },
    result: null,
  },
}

// The same answers with a household income of exactly 0. That is a real answer
// (a household with no income), so /finance asks the reader to confirm it.
const ZERO_SEED = {
  ...SEED,
  data: { ...SEED.data, finance: { ...SEED.data.finance, householdIncome: '0' } },
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
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(
        'page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text),
      )
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
    } catch {
      /* not listening yet */
    }
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

// Plain joined strings, not a template literal: these probes carry selectors and
// braces, and a template literal is where those quietly stop being what they
// look like. Selectors go in through JSON.stringify for the same reason.
const q = JSON.stringify

// Finds the form and its submit button, and counts calls to the analysis
// endpoint, those of them that got an answer, and those that never will
// (refused, blocked, or aborted). A call in neither count is still waiting.
// api.js calls the global fetch, so the wrapper sees every request.
// A probe answers { fault } when it could not measure, { error } for a finding.
// The read-back has proved the boxes, so a form or button that is not there
// means this file's selectors went stale: a fault.
const PRELUDE = [
  '  const sleep = (ms) => new Promise(r => setTimeout(r, ms))',
  '  const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)))',
  '  const form = document.querySelector("form")',
  '  if (!form) return { fault: "no form on the page" }',
  '  const button = form.querySelector("button[type=submit]")',
  '  if (!button) return { fault: "no submit button in the form" }',
  '  const realFetch = window.fetch',
  '  let posts = 0, answered = 0, refused = 0, status = 0',
  '  window.fetch = (input, init) => {',
  '    if (!String((input && input.url) || input).includes("/api/analysis/run")) return realFetch(input, init)',
  '    posts++',
  '    return realFetch(input, init).then(res => { answered++; status = res.status; return res }, err => { refused++; throw err })',
  '  }',
  '  const describe = (el) => !el || el === document.body ? "the page body" : el.tagName.toLowerCase() + (el.id ? "#" + el.id : "")',
]

// Native validation would silently swallow the submit and the probe would
// report an absent banner as a translation failure. Say which it was. SEED fills
// every box /finance marks required and the read-back proved them, so a stop
// here means /finance now asks for something SEED lacks, or refuses a value it
// carries: a stale seed, and a fault.
const VALIDITY = [
  '  if (!form.checkValidity()) {',
  '    const bad = [...form.querySelectorAll(":invalid")].map(el => el.name || el.tagName)',
  '    return { fault: "the form did not pass native validation: " + bad.join(", ") }',
  '  }',
]

// Tick every unticked consent box with a real click, then confirm they held.
// No consent box at all is a missing control, a fault; one that will not tick
// is a finding.
const TICK = [
  '  for (const b of document.querySelectorAll("input[type=checkbox][data-consent]:not(:checked)")) b.click()',
  '  await frame()',
  '  if (!document.querySelector("input[type=checkbox][data-consent=notice]")) return { fault: "no consent box on /finance" }',
  '  const left = [...document.querySelectorAll("input[type=checkbox][data-consent]")].filter(b => !b.checked)',
  '  if (left.length) return { error: "consent box did not tick: " + left.map(b => b.name).join(", ") }',
]

// Clicks submit and waits for the API banner. An inline message means the
// submit was blocked, and no request means the banner did not come from api.js.
// Which banner it is turns on whether the request got an answer. VALIDATION
// needs the backend's 422, so a request that got none means the backend went
// away mid-run or refuses this origin, and one answered with anything but a 422
// (a 503 from a proxy or a crashed backend, say) produced some other banner;
// OFFLINE needs the block, so one that got an answer means the block never
// applied. Either way this case would be measuring another banner under its own
// name: a fault. So is no banner while the request is still waiting: the
// backend stopped answering mid-run, and api.js gives up on it only after 20 s.
const submitForBanner = (kase) => [
  '  button.click()',
  '  for (let i = 0; i < 60; i++) {',
  '    await sleep(100)',
  '    const inline = document.querySelector(' + q(INLINE_ERROR) + ')',
  '    if (inline) return { error: "the #" + inline.id + " message appeared instead of the banner: " + inline.textContent.trim() }',
  '    const alert = document.querySelector(' + q(API_BANNER) + ')',
  '    if (alert) {',
  '      if (!posts) return { error: "a banner appeared but no request was made: " + alert.textContent.trim() }',
  ...(kase === 'offline'
    ? ['      if (!refused) return { fault: "the request was answered, so the block never applied and this is not the offline banner: " + alert.textContent.trim() }']
    : [
        '      if (refused) return { fault: "the request got no answer (the backend went away mid-run, or refuses this origin), so this is the offline banner: " + alert.textContent.trim() }',
        '      if (status !== 422) return { fault: "the request was answered HTTP " + status + ", not the 422 an empty form gets from the backend, so this is not the validation banner: " + alert.textContent.trim() }',
      ]),
  '      return { text: alert.textContent.trim() }',
  '    }',
  '  }',
  '  if (posts > answered + refused) return { fault: "no banner within 6s, and the request is still waiting for an answer: the backend stopped answering mid-run" }',
  '  return { error: "no banner appeared within 6s" + (posts ? ", although the request " + (refused ? "failed" : "was answered") : ", and no request was made") }',
]

// Clicks submit and waits for the inline message `id`, then gives a request the
// click might have started time to show up before counting.
const blocked = (id, box, label) => [
  '  button.click()',
  '  for (let i = 0; i < 30 && !document.getElementById(' + q(id) + '); i++) await sleep(100)',
  '  await sleep(500)',
  '  {',
  '    const msg = document.getElementById(' + q(id) + ')',
  '    if (!msg) return { error: "no #' + id + ' message within 3s" + (document.querySelector(' + q(API_BANNER) + ') ? " (the API banner appeared instead)" : "") }',
  '    if (msg.getAttribute("role") !== "alert") return { error: "#' + id + ' has no role=alert" }',
  '    if (posts) return { error: "the answers were sent with the ' + label + ' box unticked (" + posts + " request(s))" }',
  '    if (document.querySelector(' + q(API_BANNER) + ')) return { error: "the API banner appeared with the ' + label + ' box unticked" }',
  '    const active = document.activeElement',
  '    if (active !== ' + box + ') return { error: "focus is on " + describe(active) + ", not the ' + label + ' box" }',
  '    if (active.getAttribute("aria-invalid") !== "true") return { error: "the ' + label + ' box is not aria-invalid while #' + id + ' shows" }',
  '    if (!(active.getAttribute("aria-describedby") || "").split(" ").includes(' + q(id) + ')) return { error: "the ' + label + ' box is not aria-describedby #' + id + '" }',
  '  }',
]

const PROBES = {
  validation: [...PRELUDE, ...TICK, ...VALIDITY, ...submitForBanner('validation')],
  offline: [...PRELUDE, ...TICK, ...VALIDITY, ...submitForBanner('offline')],
  consent: [
    ...PRELUDE,
    '  const box = document.querySelector("input[type=checkbox][data-consent=notice]")',
    '  if (!box) return { fault: "no consent box on /finance" }',
    '  const ticked = [...document.querySelectorAll("input[type=checkbox][data-consent]")].filter(b => b.checked)',
    '  if (ticked.length) return { error: "consent box starts ticked: " + ticked.map(b => b.name).join(", ") }',
    ...VALIDITY,
    ...blocked('consent-error', 'box', 'consent'),
    '  const more = []',
    '  more.push({ label: "message", text: document.getElementById("consent-error").textContent.trim() })',
    // The age box only exists when the build sets VITE_REQUIRE_AGE_CHECK=true.
    '  const age = document.querySelector("input[type=checkbox][data-consent=age]")',
    '  if (age) {',
    '    box.click()',
    '    await frame()',
    '    if (!box.checked) return { error: "the consent box did not tick" }',
    ...blocked('consent-age-error', 'age', 'age'),
    '    more.push({ label: "age", text: document.getElementById("consent-age-error").textContent.trim() })',
    '  }',
    '  return { text: more[0].text, more: more.slice(1) }',
  ],
  'zero-income': [
    ...PRELUDE,
    // The read-back proved the box holds 0, so a missing note is the page's own
    // failure: a finding. A missing confirm box is a control this case cannot
    // work without, and one that carries data-consent would be ticked by TICK,
    // leaving nothing to test: both faults.
    '  const note = document.getElementById("household-zero-note")',
    '  if (!note) return { error: "no #household-zero-note under a household income of 0" }',
    '  const zero = document.getElementById("household-zero-confirm")',
    '  if (!zero || zero.type !== "checkbox") return { fault: "no #household-zero-confirm checkbox" }',
    '  if (zero.hasAttribute("data-consent")) return { fault: "#household-zero-confirm carries data-consent, so the consent tick would tick it too" }',
    '  if (zero.checked) return { error: "the zero-income box starts ticked" }',
    ...TICK,
    ...VALIDITY,
    ...blocked('household-zero-error', 'zero', 'zero-income'),
    '  const text = document.getElementById("household-zero-error").textContent.trim()',
    '  zero.click()',
    '  await frame()',
    '  if (!zero.checked) return { error: "the zero-income box did not tick" }',
    '  button.click()',
    '  for (let i = 0; i < 60 && !(posts && document.querySelector(' + q(API_BANNER) + ')); i++) await sleep(100)',
    '  if (!posts) return { error: "no request was made after the zero-income box was ticked" }',
    // The request went, which is what the tick has to allow. One still
    // waiting is a backend that stopped answering, as in submitForBanner.
    '  if (!document.querySelector(' + q(API_BANNER) + ')) {',
    '    if (posts > answered + refused) return { fault: "no banner within 6s of the zero-income tick, and its request is still waiting for an answer: the backend stopped answering mid-run" }',
    '    return { error: "a request was made after the tick but no banner appeared within 6s" }',
    '  }',
    '  return { text, more: [{ label: "note", text: note.textContent.trim() }] }',
  ],
}
for (const kase of CASES) PROBES[kase] = ['(async () => {', ...PROBES[kase], '})()'].join('\n')

// The seed, read back off /finance before each case. AppContext drops a payload
// it cannot read (a version it discards, a key or field it no longer uses)
// without a word, and /finance renders blank: every case then fails for the
// wrong reason under the wrong name, as the v:99 run did. A box that does not
// hold what the seed put in it is UNSEEDED, and one that is not there at all is
// MISSING. It polls, since a cold dev server can be slow to render. Edge's own
// error page, or a status other than 2xx, means the server failed: Vite answers
// every route with index.html and a 200. All of these are faults. A copy Edge
// revalidated (a 304 on the wire) still reads 200 here, as measured on 30 Sept
// 2026, and 0 means Edge does not know the status.
const READ_BACK_BOXES = ['availableCapital', 'monthlyExpenses', 'monthlyEmi', 'householdIncome']
const readBack = (seed) => [
  '(async () => {',
  '  if (location.protocol === "chrome-error:") return { fault: "/finance never rendered: it is Edge\'s own error page. Is the dev server still up?" }',
  '  const status = performance.getEntriesByType("navigation")[0]?.responseStatus || 0',
  '  if (status && (status < 200 || status > 299)) return { fault: "/finance never rendered: it answered HTTP " + status }',
  '  const want = ' + q(Object.fromEntries(READ_BACK_BOXES.map((name) => [name, String(seed.data.finance[name] ?? '')]))),
  '  const box = (name) => document.querySelector("input[name=" + JSON.stringify(name) + "]")',
  '  for (let i = 0; i < 50 && !Object.keys(want).every(box); i++) await new Promise(r => setTimeout(r, 100))',
  '  for (const [name, value] of Object.entries(want)) {',
  '    const el = box(name)',
  '    if (!el) return { fault: "MISSING: /finance has no " + name + " box" }',
  '    if (el.value !== value) return { fault: "UNSEEDED: " + name + " reads " + JSON.stringify(el.value) + ", the seed says " + JSON.stringify(value) }',
  '  }',
  '  return {}',
  '})()',
].join('\n')

const DOTTED_KEY = /(?:^|[\s(])(?:err|errf|common|finance|business|location|money|nav|consent|notice|privacy)\.[a-zA-Z]/

function check(entry, englishText) {
  const notes = []
  const { lang, kase, text } = entry
  const what = entry.what || 'banner'

  if (!text) {
    notes.push(`no ${what} text`)
    return notes
  }

  if (DOTTED_KEY.test(text)) notes.push(`leaked i18n key in the ${what}: "${text}"`)
  if (text.includes('{')) notes.push(`unsubstituted placeholder left in the ${what}: "${text}"`)

  for (const bad of ['[object Object]', 'undefined', 'null', 'NaN']) {
    if (text.includes(bad)) notes.push(`${what} contains "${bad}": "${text}"`)
  }

  // The defect this file exists for. An English sentence in a Tamil UI is not a
  // crash and not a missing key — every other check in the repo passes on it.
  if (lang !== 'en' && englishText && text === englishText) {
    notes.push(`${what} is byte-identical to English, so it never translated: "${text}"`)
  }

  if (lang !== 'en' && !/[^\u0000-\u00FF]/.test(text)) {
    notes.push(`${what} has no non-Latin character, so it is probably still English: "${text}"`)
  }

  // Two fields were left empty, so the list must have rendered both, each in
  // the words FIELD_TEXT holds for this language. A list that lost one, or a
  // sentence without {fields}, still reads as grammatical; so does err.generic.
  if (kase === 'validation') {
    const unnamed = FIELD_TEXT[lang].filter((label) => !text.includes(label))
    if (unnamed.length) notes.push(`validation banner does not name ${unnamed.map((label) => JSON.stringify(label)).join(' or ')}: "${text}"`)
  }

  return notes
}

async function main() {
  if (!(await requireServer(APP + '/', 'Start the Vite dev server first: npm run dev in ./frontend.'))) return
  if (!(await requireServer(BACKEND_HEALTH, 'Start the backend first: ../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 in ./backend.'))) return
  const origin = new URL(APP).origin
  if (!(await requireCors(ANALYSIS_RUN, origin, `Run the backend in development (ARTHNITI_ENV unset or development), with ARTHNITI_CORS_ORIGINS unset or naming ${origin}.`))) return
  mkdirSync(OUT, { recursive: true })

  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      '--remote-allow-origins=*',
      '--disable-gpu',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-features=Translate,MediaRouter',
    ],
    { stdio: 'ignore' },
  )

  let failures = 0
  const faults = []
  const report = []
  const english = {}
  // A case that could not be measured: kept apart from the findings, and
  // reported with the reason in place of a text.
  const fault = (lang, kase, why) => {
    faults.push(`${lang} ${kase}: ${why}`)
    console.log(`  ${kase.padEnd(11)} FAULT ${why}`)
    report.push({ lang, kase, fault: why })
  }

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    // Our own target. The first `type === 'page'` from /json/list is
    // edge://sync-confirmation-dialog/ on a signed-in profile.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send(
      'Target.attachToTarget',
      { targetId, flatten: true },
      false,
    )
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })

    // English first, so every other language has a baseline to be compared
    // against rather than being trusted on its own.
    for (const lang of LANGS) {
      console.log(`\n${lang}`)

      for (const kase of CASES) {
        await cdp.send('Network.setBlockedURLs', {
          urls: kase === 'offline' ? ['*/api/analysis/run'] : [],
        })

        // Land somewhere same-origin before writing storage, then load /finance
        // so the context hydrates from it.
        const seed = kase === 'zero-income' ? ZERO_SEED : SEED
        await navigate(cdp, APP + '/')
        await sleep(700)
        await cdp.evaluate(
          [
            `localStorage.setItem('sih-language', '${lang}');`,
            `localStorage.removeItem('sih-dialect');`,
            `localStorage.setItem('sih-theme', 'light');`,
            `sessionStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(seed))});`,
            'true',
          ].join(''),
        )
        await navigate(cdp, APP + '/finance')
        await sleep(1200)

        const seeded = await cdp.evaluate(readBack(seed))
        if (seeded.fault) {
          fault(lang, kase, seeded.fault)
          continue
        }

        const result = await cdp.evaluate(PROBES[kase])

        if (result.fault) {
          fault(lang, kase, result.fault)
          continue
        }
        if (result.error) {
          failures++
          console.log(`  ${kase.padEnd(11)} FAIL  ${result.error}`)
          report.push({ lang, kase, error: result.error })
          continue
        }

        // The banner, or the inline message, plus any further text the case read
        // (the age message, the zero-income note). Each is compared with the
        // English run of the same case.
        const what = { consent: 'consent message', 'zero-income': 'zero-income message' }[kase] || 'banner'
        const texts = [{ label: '', what, text: result.text }]
        for (const m of result.more || []) texts.push({ label: m.label, what: `${kase} ${m.label}`, text: m.text })

        const entry = { lang, kase, text: result.text, more: result.more || [] }
        const notes = []
        for (const item of texts) {
          const slot = kase + (item.label ? ':' + item.label : '')
          if (lang === 'en') english[slot] = item.text
          notes.push(...check({ lang, kase, what: item.what, text: item.text }, english[slot]))
        }
        entry.notes = notes
        report.push(entry)

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(`${OUT}/${kase}-${lang}.png`, Buffer.from(shot.data, 'base64'))

        if (notes.length) {
          failures++
          console.log(`  ${kase.padEnd(11)} FAIL`)
          for (const n of notes) console.log(`    ${n}`)
        } else {
          console.log(`  ${kase.padEnd(11)} ok    ${result.text.slice(0, 78)}`)
        }
      }
    }
  } finally {
    edge.kill()
  }

  // A fault outranks a finding: a case that could not be measured has not been
  // shown clean, whatever the others found.
  const exit = faults.length ? 2 : failures ? 1 : 0
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ exit, faults, report }, null, 2))
  console.log(
    `\n${LANGS.length * CASES.length} cases (${CASES.join(', ')}) checked across ${LANGS.length} languages, ${failures} with problems, ${faults.length} stopped by a fault.`,
  )
  console.log(`Captures and report.json in ${OUT}`)
  process.exit(exit)
}

main().catch((error) => {
  console.error(error)
  // A crash is not a finding.
  crashExit()
})

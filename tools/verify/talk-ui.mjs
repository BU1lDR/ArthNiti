// The /talk gate: the optional "say or type your answers" page, driven in a real
// Edge. The Node tests (talk-lib-test, app-state-test, the pytest suite) cover the
// parts that need no browser; this covers what only a browser has: the permission
// question, the microphone itself, focus, the React state that locks the boxes, and
// the way AppContext and the form pages show what the helper filled in.
//
// Nothing here reaches Meta. The backend is the shipped app with a fake model in
// Meta's place (tools/verify/talk_fake_backend.py), and Edge gets a synthetic
// microphone (--use-fake-device-for-media-stream), so the run needs no key and
// costs nothing. It starts its own backend (8012), three Vites (5182 helper on,
// 5183 helper off, 5184 helper on with the age box) and its own Edge (9379), and
// kills all of them by PID on every exit path. It never kills msedge or node by
// image name: other gates, and the reader's own browser, may be running.
//
//   node tools/verify/talk-ui.mjs                 every scenario
//   node tools/verify/talk-ui.mjs --only=S5,S13   just those (report.json says so)
//
// Run from the repo root. Needs .venv, Edge and frontend/node_modules.
//
//   S0   helper off: no link to /talk anywhere, and /talk is the not-found page
//   S1   helper on: the links, the page, the starting state
//   S2   consent gate: Find and Record both refuse, say why, focus the box, and send nothing
//   S2b  age gate (a copy built with VITE_REQUIRE_AGE_CHECK=true)
//   S3   typed sentence -> 12 answers to review -> nothing applied until the button ->
//        the form fields, the "filled from what you said" banners, a full reload
//   S4   voice: record, stop, the WAV the backend got, the microphone released, a second
//        recording adds to the text
//   S5   the boxes stay locked while the browser asks for the microphone; Cancel and a
//        refusal give them back
//   S6   every error code the backend can send, the transcription failure, api.js limits
//   S7   Cancel while a request is out
//   S8   Malayalam has no speech model: no record button, typing still works
//   S9   microphone refused / missing
//   S10  all 8 languages: title, consent error, no leaked key or placeholder
//   S11  360 px phone, English and Hindi: overflow, tap targets, font size
//   S12  editing a filled answer removes it from the banner, and only it
//   S13  a recorder that will not start leaves the microphone off
//   S14  leaving the page releases the microphone, also when the browser was still asking
//   S15  the consent lock holds from Stop until the recording is sent; a recording that
//        cannot be finished is reported, sends nothing and unlocks
//   S16  the plan card on /advisory at rest: its own consent tick, nothing sent; helper off: no card
//   S17  one plan, written through the four real pages: the request, what the model is shown,
//        the card, the stored plan, a reload, an edited answer
//   S18  a plan in English, then Hindi, then English
//   S19  a refused plan and every other way the request can fail
//   S20  Cancel while the plan is being written
//   S21  a plan in each of the 8 languages
//   S22  360 px phone: the plan card at rest and with a plan
//
// S16-S22 reach /advisory the way a reader does, by typing the answers into /business,
// /location and /finance, because the card only exists once there is a result. The plan
// the fake model returns is good_plan(language) from backend/tests/plan_fixtures.py, and
// what the model was shown is read from the fake's log. Meta's real wording is not tested
// here: that is `python -m app.smoke_meta --plan`.
//

// Exit 0: nothing found. 1: a finding. 2: the run could not measure (wrong working
// directory, a port held, a server or Edge would not start or went away, an element
// the probe needs is missing, a wait never ended, the script crashed). A scenario
// that throws is a fault and shows in report.json, never as a pass. 130: a signal.
// report.json starts with `exit`; a run that never started leaves none.
//
// Refuters, by hand (change one line, run with --only=, restore it): the gate is
// only worth what it catches. All thirteen were run on 27 Oct 2026; in brackets, how
// many checks failed.
//   TalkPage.jsx  delete the first onActiveChange(true) in VoiceRecorder.start()   -> S5   [4]
//   TalkPage.jsx  delete the `if (!agreed()) return` in find()                     -> S2   [6]
//   TalkPage.jsx  the same line as a bare `agreed()`: checked, then ignored        -> S2   [2, "nothing was sent"]
//   TalkPage.jsx  `return agreed()` becomes `return true` in mayRecord()           -> S2   [2, and exit 2:
//                 Record then starts and locks the box that S2 ticks next, a fault after the findings]
//   TalkPage.jsx  `return consent && !needsAge` becomes `return consent`           -> S2b  [2]
//   record.js     delete the release() in the catch of startRecording()            -> S13  [1]
//   TalkPage.jsx  delete the handle.cancel() in the `!mountedRef.current` branch   -> S14  [1]
// S15, all in finish() of VoiceRecorder:
//   TalkPage.jsx  put onActiveChange(false) back before setStarting(true)           -> S15  [1]
//                 (the order before the lock was held until the file was sent)
//   TalkPage.jsx  delete the setStarting(true)                                      -> S15  [1]
//   TalkPage.jsx  delete the onActiveChange(false) before the mountedRef check      -> S15  [2]
//   TalkPage.jsx  delete the setStarting(false) before onWav(wav)                   -> S15  [2]
//   TalkPage.jsx  delete the `else onError('talk.errRecording')`                    -> S15  [1]
//   TalkPage.jsx  call onWav(wav) whatever wav is                                   -> S15  [1]
// S16-S22, run on 28 Oct 2026 (PlanWriter in AdvisoryPage.jsx, unless another file is named):
//   AdvisoryPage.jsx  drop `DEPLOYMENT.aiHelper &&` where PlanWriter is mounted      -> S16  [1]
//   AdvisoryPage.jsx  setConsentMissing(!consent) becomes setConsentMissing(false)   -> S16  [2]
//   AdvisoryPage.jsx  `if (!consent) {` becomes `if (false) {` (send without the tick) -> S16  [3]
//   AdvisoryPage.jsx  the setError('') that starts write() becomes setError(error)   -> S19  [1], S20  [4]
//   AdvisoryPage.jsx  requestPlan(request, language, ...) always asks for 'en'       -> S18  [3], S21  [14]
//   AdvisoryPage.jsx  requestPlan(..., false): send_to_meta false                    -> S17  [2, the route says 422 and the scenario stops]
//   AdvisoryPage.jsx  justWritten.current = true becomes false                       -> S17  [1]
//   AdvisoryPage.jsx  setConsent(false) after a plan becomes setConsent(true)        -> S17  [1]
//   AdvisoryPage.jsx  report an abort as an error (no isAbortError test)             -> S20  [2]
//   AdvisoryPage.jsx  the Cancel button does nothing                                 -> S20  [3]
//   AdvisoryPage.jsx  Write not disabled while the request is out                    -> S20  [1]
//   AdvisoryPage.jsx  the consent box not disabled while the request is out          -> S20  [1]
//   api.js            429 maps to the generic error, not to plan.errBusy             -> S19  [1]
//   api.js            skip the isPlan() test on a 200                                -> S19  [1]
//   AppContext.jsx    applyEdit keeps the plan when an answer changes                -> S17  [1]
//   plan_service.py   put "It is in Lucknow." into the facts the model is sent       -> S17  [1]
//   plan_service.py   put a number into those facts                                  -> S17  [1]
//   AdvisoryPage.jsx  one sentence of the card at 10 px                              -> S22  [5]
//   AdvisoryPage.jsx  min-w-[520px] on the Write button                              -> S22  [5]
//   AdvisoryPage.jsx  a 20 px high label round the consent box                       -> S22  [5]
// A fixed width on the Write button (w-[520px]) survived: the buttons sit in a flex row
// and shrink to fit it. min-width cannot be shrunk, so that is the refuter listed.
// The first Cancel refuter exited 2: the plan then arrived, the button read "again", and
// the last step faulted on a "Write my plan" that was no longer there. S20 now stops
// there, so the finding is exit 1. waitForRender() (more than 40 characters in #main)
// cannot tell the page being left from the one being entered after a client-side
// move, which cost two false starts; S16-S22 wait on the h1 (h1Now) instead.
// The first run of the S2 refuter exited 2, not 1: the page no longer showed the
// consent error and waitSnap called that a fault in the instrument. A state the
// page owes the reader is now awaited with settleSnap, so its absence is a finding.
// The last S15 refuter survived at first: "nothing was sent" read fake.calls(), and
// the real route turns a bad WAV away with a 422 before the model client, where the
// fake keeps its log. The check now hooks fetch in the page (window.__stop.fetchAt).
// S15 also waits 1.2 s before pressing Stop: a recording stopped at once is sometimes
// reported as unusable (3 of 40 runs without the wait, 0 of 40 with it, too few to
// call significant), and that report is correct but is not what part 1 is testing.
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// A run that ends without reaching its verdict exits 2; the verdict overrides it.
process.exitCode = 2

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9379
const FAKE_PORT = 8012
const VITES = { on: 5182, off: 5183, age: 5184 }
const API = `http://127.0.0.1:${FAKE_PORT}`
const ON = `http://127.0.0.1:${VITES.on}`
const OFF = `http://127.0.0.1:${VITES.off}`
const AGE = `http://127.0.0.1:${VITES.age}`
const OUT = resolve('screenshots/verify/talk-ui')
const PROFILE_DIR = resolve('screenshots/verify/talk-ui/profile')
const PYTHON = resolve('.venv/Scripts/python.exe')
const VITE_BIN = resolve('frontend/node_modules/vite/bin/vite.js')
const APP_CONTEXT = 'frontend/src/context/AppContext.jsx'
const I18N = resolve('frontend/src/i18n')
const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']
const ONLY = (process.argv.slice(2).find((a) => a.startsWith('--only=')) ?? '')
  .slice('--only='.length).split(',').filter(Boolean)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
class Fault extends Error {}

// --- every process this script starts, and how it dies ----------------------
// By PID tree and nothing else (see market-ui.mjs for why, and for the Edge
// relaunch the command-line match below is the fallback for).
const children = []
function killPid(pid) {
  spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
}
function killTree(child) {
  if (!child || child.reaped || child.exitCode !== null || child.signalCode !== null) return
  child.reaped = true
  killPid(child.pid)
}
function ownEdgePids() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -and " +
    "$_.CommandLine.Contains($env:TALK_UI_PROFILE) -and -not $_.CommandLine.Contains('--type=') } | " +
    'ForEach-Object { $_.ProcessId }'
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, TALK_UI_PROFILE: PROFILE_DIR },
    encoding: 'utf8',
  })
  return (r.stdout || '').split(/\s+/).filter((s) => /^\d+$/.test(s)).map(Number)
}
let edgeStarted = false
function cleanup() {
  for (const child of children.splice(0)) killTree(child)
  if (edgeStarted) {
    edgeStarted = false
    for (const pid of ownEdgePids()) killPid(pid)
  }
}
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => { cleanup(); process.exit(130) })
}
process.on('uncaughtException', (err) => {
  console.error(err)
  crashExit()
})
// Exiting within about 100 ms of a fetch() can kill node with 0xC0000409; the
// wait blocks this thread. tools/README.md, Exit codes, has the measurements.
function crashExit(code = 2) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  process.exit(code)
}

if (!existsSync(resolve('tools/verify/talk-ui.mjs'))) {
  console.error(`talk-ui: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/talk-ui.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished.
rmSync(resolve(OUT, 'report.json'), { force: true })

// --- inputs, all read before anything is started ----------------------------
function refuse(message) {
  console.error(`talk-ui: ${message}`)
  process.exit(2)
}
for (const [what, path] of [['the venv python', PYTHON], ['Edge', EDGE], ['Vite', VITE_BIN], ['the fake backend', resolve('tools/verify/talk_fake_backend.py')]]) {
  if (!existsSync(path)) refuse(`${what} not found at ${path}`)
}

// The storage key and version come from AppContext, so a bump reaches this gate
// by itself. Nothing here writes a seed: every scenario starts empty, and the
// state under test is the state the app itself wrote.
const appContext = readFileSync(resolve(APP_CONTEXT), 'utf8')
const STORAGE_KEY = appContext.match(/^const STORAGE_KEY = (['"])([^'"\n]+)\1/m)?.[2]
const STORAGE_VERSION = Number(appContext.match(/^const STORAGE_VERSION = (\d+)/m)?.[1])
const READABLE = appContext.match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)?.[1]
if (!STORAGE_KEY || !Number.isInteger(STORAGE_VERSION) || READABLE === undefined) {
  refuse(`STORAGE_KEY, STORAGE_VERSION or READABLE_VERSIONS not found in ${APP_CONTEXT}; update the parse in talk-ui.mjs.`)
}
if (!READABLE.split(',').map((v) => Number(v.trim())).includes(STORAGE_VERSION)) {
  refuse(`${APP_CONTEXT} no longer reads its own version ${STORAGE_VERSION} (READABLE_VERSIONS is ${READABLE.trim()}).`)
}

// The merged dictionaries, loaded the way error-banner.mjs loads them:
// strings.js imports its siblings without an extension, which Vite resolves and
// Node does not, so the specifiers become absolute file URLs.
let STRINGS
try {
  const source = readFileSync(resolve(I18N, 'strings.js'), 'utf8').replace(
    /from '\.\/(resultStrings|backendStrings|schemeStrings)'/g,
    (_, name) => `from '${pathToFileURL(resolve(I18N, name + '.js')).href}'`,
  )
  ;({ STRINGS } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')))
} catch (err) {
  refuse(`the dictionaries in ${I18N} did not load (${err.message}).`)
}
let SENT_FIELDS, FIELD_LABEL_KEYS, LANGUAGES
try {
  ;({ SENT_FIELDS } = await import(pathToFileURL(resolve('frontend/src/config/notice.js')).href))
  ;({ FIELD_LABEL_KEYS } = await import(pathToFileURL(resolve('frontend/src/data/talkAnswers.js')).href))
  ;({ LANGUAGES } = await import(pathToFileURL(resolve('frontend/src/i18n/languages.js')).href))
} catch (err) {
  refuse(`a frontend module this gate imports did not load (${err.message}).`)
}

const fill = (text, params = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
const norm = (s) => String(s ?? '').replace(/[→🎤]/gu, '').replace(/\s+/g, ' ').trim()
// This language's text, or English per key, as t() falls back. A key the English
// table lacks is refused up front (USED_KEYS below), not mid-run.
const T = (lang, key, params) => {
  const text = STRINGS[lang]?.[key] ?? STRINGS.en?.[key]
  if (typeof text !== 'string') throw new Fault(`no dictionary text for ${key}`)
  return fill(text, params)
}
const en = (key, params) => T('en', key, params)

const USED_KEYS = [
  'talk.title', 'talk.optional', 'talk.record', 'talk.stop', 'talk.cancel', 'talk.find', 'talk.apply',
  'talk.reviewTitle', 'talk.consentRequired', 'talk.errMicDenied', 'talk.errMicNone', 'talk.errUnavailable',
  'talk.errBusy', 'talk.errUnclear', 'talk.errRecording', 'talk.errGeneric', 'talk.langNoSpeech',
  'talk.finding', 'talk.listening', 'talk.recording', 'talk.filledTitle', 'talk.said', 'nf.title',
  'cat.tailoring', 'cat.retail', 'area.rural', ...Object.values(FIELD_LABEL_KEYS),
  'business.submit', 'location.submit', 'finance.submit', 'ad.title', 'ad.notReady', 'ad.planTitle', 'fo.title', 'res.changedTitle',
  'plan.eyebrow', 'plan.title', 'plan.intro', 'plan.sendsText', 'plan.consent', 'plan.write', 'plan.writing',
  'plan.again', 'plan.otherLanguage', 'plan.aiLabel', 'plan.stepsTitle', 'plan.cautionsTitle', 'plan.fixedCaution',
  'plan.how', 'plan.howText', 'plan.howLimit', 'plan.errUnavailable', 'plan.errBusy', 'plan.errNoPlan', 'plan.errGeneric',
]
for (const key of USED_KEYS) {
  if (typeof STRINGS?.en?.[key] !== 'string') refuse(`${key} is not in the en dictionary, so there is no text to look for. Run node tools/keycheck.mjs.`)
}
if (JSON.stringify(SENT_FIELDS.map(([field]) => field)) !== JSON.stringify(Object.keys(FIELD_LABEL_KEYS))) {
  refuse('SENT_FIELDS and FIELD_LABEL_KEYS no longer list the same fields in the same order.')
}

// --- what the typed sentence must turn into ----------------------------------
// The fake finds answers by keyword (talk_fake_backend.py), so this sentence is
// what decides the 12 answers. Rows come back in SENT_FIELDS order.
const SENTENCE =
  'I do tailoring in a village near Lucknow, Uttar Pradesh. I need 50000 to start. I earn 20000 a month. ' +
  'My costs are 5000 a month. I owe 30000 on a loan. I have 10000 saved. We spend 8000 at home. ' +
  'I pay 1500 EMI. My household earns 25000.'
const ROWS = {
  business_category: [(lang) => T(lang, 'cat.tailoring'), 'tailoring'],
  initial_investment: ['₹50,000', 'need 50000 to start'],
  expected_monthly_revenue: ['₹20,000', 'earn 20000 a month'],
  monthly_operating_expenses: ['₹5,000', 'costs are 5000 a month'],
  existing_debt: ['₹30,000', 'owe 30000 on a loan'],
  state: ['Uttar Pradesh', 'Uttar Pradesh'],
  district: ['Lucknow', 'Lucknow'],
  location_type: [(lang) => T(lang, 'area.rural'), 'village'],
  available_capital: ['₹10,000', 'have 10000 saved'],
  monthly_expenses: ['₹8,000', 'spend 8000 at home'],
  monthly_emi: ['₹1,500', 'pay 1500 EMI'],
  household_monthly_income: ['₹25,000', 'household earns 25000'],
}
const FIELD_ORDER = SENT_FIELDS.map(([field]) => field)
if (JSON.stringify(Object.keys(ROWS)) !== JSON.stringify(FIELD_ORDER)) {
  refuse('the 12 expected rows in talk-ui.mjs no longer match SENT_FIELDS; update ROWS.')
}
// What apply must leave in the application data. locationType and the district
// are not listed: the first is the default it already had, the second is
// unticked in S3.
const FILLED_PATHS = [
  'business.category', 'business.initialInvestment', 'business.monthlyRevenue',
  'business.monthlyOperatingExpenses', 'business.existingDebt', 'location.state',
  'finance.availableCapital', 'finance.monthlyExpenses', 'finance.monthlyEmi', 'finance.householdIncome',
]

// --- minimal CDP client, session-aware (as market-ui.mjs) -------------------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.pageErrors = []
    this.sessionId = null
    this.closed = false

    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('CDP socket error')))
      this.ws.addEventListener('close', () => rej(new Error('CDP socket closed')))
    })

    // Edge gone: every call still waiting for its reply fails now.
    this.ws.addEventListener('close', () => {
      this.closed = true
      for (const slot of this.pending.values()) slot.reject(new Error(slot.method + ': CDP socket closed'))
      this.pending.clear()
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
    // A frame sent on a socket that is not open is dropped without an error.
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
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
}

async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

function portInUse(port) {
  return new Promise((done) => {
    const probe = createServer()
    probe.once('error', (err) => done(err.code || err.message))
    probe.once('listening', () => probe.close(() => done(null)))
    probe.listen({ port, host: '127.0.0.1', exclusive: true })
  })
}

// --- the servers --------------------------------------------------------------
async function startFake() {
  const logFd = openSync(`${OUT}/fake_backend.log`, 'w')
  // Its own environment: a MODEL_API_KEY or ARTHNITI_* in the shell is never read.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MODEL_API_KEY|ARTHNITI_)/i.test(k)))
  const child = spawn(PYTHON, ['tools/verify/talk_fake_backend.py', String(FAKE_PORT)], {
    cwd: resolve('.'), env, stdio: ['ignore', logFd, logFd],
  })
  children.push(child)
  closeSync(logFd)
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`the fake backend exited with ${child.exitCode}; see ${OUT}/fake_backend.log`)
    try {
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2000) })
      await res.arrayBuffer()
      if (res.ok) return
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error(`the fake backend never answered on ${API}`)
}

// The VITE_* values are given in the environment, which beats any .env file.
async function startVite(port, extra) {
  const logFd = openSync(`${OUT}/vite-${port}.log`, 'w')
  const vite = spawn(process.execPath, [VITE_BIN, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: resolve('frontend'),
    env: { ...process.env, VITE_API_BASE_URL: API, ...extra },
    stdio: ['ignore', logFd, logFd],
  })
  children.push(vite)
  closeSync(logFd)
  for (let i = 0; i < 120; i++) {
    if (vite.exitCode !== null) throw new Error(`Vite exited with ${vite.exitCode}; see ${OUT}/vite-${port}.log`)
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
      await res.arrayBuffer()
      if (res.ok) return
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error(`Vite never answered on port ${port}`)
}

// --- page side ----------------------------------------------------------------
// Serialised with toString() and installed before the app's own scripts on every
// navigation. (Written as a function, not a template string: a template literal
// would eat the backslashes in its regular expressions.)
function pageLibrary() {
  // getUserMedia, wrapped. 'real' passes through to the fake device and remembers
  // the stream; 'deny' and 'none' fail the way a browser does; 'defer' holds the
  // question open, as a browser does while the permission prompt is up, until the
  // probe calls grant() or refuse().
  const gum = { calls: 0, mode: 'real', streams: [], pending: [] }
  window.__gum = gum
  const devices = navigator.mediaDevices
  const real = devices && devices.getUserMedia ? devices.getUserMedia.bind(devices) : null
  if (real) {
    devices.getUserMedia = (constraints) => {
      gum.calls += 1
      if (gum.mode === 'deny') return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
      if (gum.mode === 'none') return Promise.reject(new DOMException('Requested device not found', 'NotFoundError'))
      if (gum.mode === 'defer') return new Promise((resolve, reject) => { gum.pending.push({ constraints, resolve, reject }) })
      return real(constraints).then((stream) => { gum.streams.push(stream); return stream })
    }
  }
  gum.grant = async () => {
    const entry = gum.pending.shift()
    if (!entry) throw new Error('no getUserMedia call is waiting')
    const stream = await real(entry.constraints)
    gum.streams.push(stream)
    entry.resolve(stream)
  }
  gum.refuse = (name) => {
    const entry = gum.pending.shift()
    if (!entry) throw new Error('no getUserMedia call is waiting')
    entry.reject(new DOMException('Permission denied', name))
  }
  // The readyState of every audio track the page was ever given.
  gum.tracks = () => gum.streams.flatMap((stream) => stream.getTracks().map((track) => track.readyState))

  window.__t = {
    norm: (s) => String(s == null ? '' : s).replace(/[→🎤]/gu, '').replace(/\s+/g, ' ').trim(),
    // A React-controlled field only hears the native setter plus an input event.
    type(el, value) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    choose(el, value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    // `partial` for a button whose text carries a picture before the words
    // (the category buttons), where the words are all that is known.
    button(label, partial = false) {
      return [...document.querySelectorAll('#main button')].find((b) => {
        const text = this.norm(b.innerText)
        return partial ? text.includes(label) : text === label
      })
    },
  }
}

// What the page shows, as plain data. Runs in the page.
function snapshot() {
  const norm = window.__t.norm
  const q = (selector) => document.querySelector(selector)
  const main = q('#main')
  const box = (el) => (el ? { checked: el.checked, disabled: el.disabled, invalid: el.getAttribute('aria-invalid'), describedby: el.getAttribute('aria-describedby') } : null)
  const language = q('#talk-language')
  const area = q('#talk-text')
  const h1 = q('#main h1')
  const reviewHead = q('#main h2[tabindex="-1"]')
  const section = reviewHead ? reviewHead.closest('.ui-formsection') : null
  const active = document.activeElement
  const gum = window.__gum
  const each = (selector) => (main ? [...main.querySelectorAll(selector)] : [])
  return {
    path: location.pathname,
    h1: h1 ? norm(h1.innerText) : '',
    mainText: main ? norm(main.innerText) : '',
    consent: box(q('#talk-consent')),
    age: box(q('#talk-age')),
    language: language ? { value: language.value, disabled: language.disabled } : null,
    text: area ? area.value : null,
    buttons: each('button').map((b) => ({ text: norm(b.innerText), disabled: b.disabled })),
    alerts: each('[role=alert]').map((el) => ({ id: el.id, text: norm(el.innerText) })),
    statuses: each('[role=status]').map((el) => norm(el.innerText)).filter(Boolean),
    notices: each('.ui-notice').map((el) => norm(el.innerText)),
    review: section
      ? {
          title: norm(reviewHead.innerText),
          focused: active === reviewHead,
          rows: [...section.querySelectorAll('ul > li')].map((li) => {
            const tick = li.querySelector('input[type=checkbox]')
            return { checked: tick ? tick.checked : null, spans: [...li.querySelectorAll('span.block')].map((el) => norm(el.innerText)) }
          }),
          buttons: [...section.querySelectorAll('button')].map((b) => ({ text: norm(b.innerText), disabled: b.disabled })),
        }
      : null,
    focus: active ? (active.id || active.tagName.toLowerCase()) : '',
    tracks: gum ? gum.tracks() : [],
    gumCalls: gum ? gum.calls : 0,
    pending: gum ? gum.pending.length : 0,
  }
}

// Leaked dictionary keys, unfilled placeholders and stringified nothing. `prefixes`
// are the first parts of the keys to look for; without them, the /talk page's. (Call
// it with no argument or with a real list: inPage turns an undefined one into null.)
function leakScan(prefixes) {
  const text = document.body.innerText
  const found = []
  const keys = (prefixes || ['talk', 'nav', 'common', 'cat', 'area', 'notice', 'consent', 'errf']).join('|')
  const patterns = [
    ['dictionary key', new RegExp('(?:^|[\\s(])(?:' + keys + ')\\.[a-zA-Z]\\w*', 'g')],
    ['placeholder', /\{[a-zA-Z]+\}/g],
    ['stringified nothing', /\[object Object\]|\bundefined\b|\bNaN\b|\bnull%/g],
  ]
  for (const [name, re] of patterns) {
    for (const match of text.matchAll(re)) found.push(name + ': ' + match[0].trim())
  }
  return found
}

// Every state the page passes through from now until it sends a recording. A
// MutationObserver hears each change of the DOM as it happens, which polling from
// outside cannot promise for a moment this short. `at` orders the states and the
// request on one clock; fetchAt is the transcribe request leaving the page.
function stopProbe(recordLabel, stopLabel) {
  const probe = { states: [], fetchAt: null, at: 0 }
  window.__stop = probe
  const state = () => {
    const consent = document.querySelector('#talk-consent')
    const record = window.__t.button(recordLabel)
    return {
      at: ++probe.at,
      consentDisabled: consent ? consent.disabled : null,
      recordDisabled: record ? record.disabled : null,
      stopShown: Boolean(window.__t.button(stopLabel)),
    }
  }
  new MutationObserver(() => probe.states.push(state())).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'],
  })
  const realFetch = window.fetch
  window.fetch = function (input, init) {
    const url = String(input && input.url ? input.url : input)
    if (url.includes('/api/intake/transcribe') && probe.fetchAt === null) probe.fetchAt = ++probe.at
    return realFetch.call(this, input, init)
  }
}

// 360 px phone: what is off-screen, too small to tap, or too small to read. Of the
// element at `rootSelector`, or of the `ancestor` that contains it; a root that is
// not there throws, so a page with nothing to measure is a fault and never a pass.
function mobileProbe(rootSelector = '#main', ancestor = '') {
  let main = document.querySelector(rootSelector)
  if (main && ancestor) main = main.closest(ancestor)
  if (!main) throw new Error('mobileProbe: nothing at ' + rootSelector + (ancestor ? ' inside a ' + ancestor : ''))
  const vw = document.documentElement.clientWidth
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + String(el.innerText || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 28) + '"'
  const out = { vw, scrollWidth: document.documentElement.scrollWidth, measured: main.querySelectorAll('*').length, overflow: [], taps: [], small: [] }
  for (const el of main.querySelectorAll('*')) {
    if (el.closest('.sr-only')) continue
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    if (rect.right > vw + 1) out.overflow.push(describe(el) + ' right=' + Math.round(rect.right))
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (ownText && parseFloat(getComputedStyle(el).fontSize) < 12) out.small.push(describe(el))
  }
  for (const el of main.querySelectorAll('button, a, select, input, textarea, summary')) {
    if (el.closest('.sr-only')) continue
    if (el.tagName === 'A' && el.closest('p, li')) continue
    // A checkbox is tapped through its label.
    const target = el.type === 'checkbox' ? el.closest('label') || el : el
    const rect = target.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    if (rect.width < 43.5 || rect.height < 43.5) out.taps.push(describe(el) + ' ' + Math.round(rect.width) + 'x' + Math.round(rect.height))
  }
  return out
}

// Every request the page makes from now on, as the page makes it, with the answer that
// came back. The fake logs only what reaches the model, and a request the page should
// not have made is the thing to catch, so the page's own fetch is watched. A full
// navigation takes it away: install it after the last load. `status` is 'rejected' for a
// request the page abandoned or lost.
function planProbe() {
  const probe = { requests: [], at: 0, failNext: null }
  window.__plan = probe
  const realFetch = window.fetch
  window.fetch = function (input, init) {
    const url = String(input && input.url ? input.url : input)
    const entry = {
      url,
      method: (init && init.method) || 'GET',
      contentType: init && init.headers ? new Headers(init.headers).get('content-type') : null,
      body: init && typeof init.body === 'string' ? init.body : null,
      sent: ++probe.at,
      done: null,
      status: null,
      reply: null,
    }
    probe.requests.push(entry)
    // planFailure() asked for the next plan request to be answered from in here.
    const failure = url.includes('/api/advisor/plan') ? probe.failNext : null
    if (failure) probe.failNext = null
    const answer = !failure ? realFetch.call(this, input, init)
      : failure.how === 'reject' ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(new Response(failure.body, { status: failure.status, headers: { 'content-type': 'application/json' } }))
    return answer.then(
      (response) => {
        entry.status = response.status
        // Read from a copy, so the app still gets its own.
        response.clone().text().then((text) => { entry.reply = text; entry.done = ++probe.at })
        return response
      },
      (error) => {
        entry.status = 'rejected'
        entry.done = ++probe.at
        throw error
      },
    )
  }
}

// The next request to the plan route is answered from inside the page, the way a proxy
// or a dropped connection would answer it, and never leaves the page (the probe still
// records it). `how` is 'reject' or 'reply' (with a status and a body). It is used once.
function planFailure(how, status, body) {
  window.__plan.failNext = { how, status, body }
}

// The plan card on /advisory, as plain data. Runs in the page. `card` is null when the
// page has no such card. A line of the plan is the one element that carries `lang`: its
// bold runs are what the fixed rules filled in, its plain runs are the AI's own words.
function planSnapshot() {
  const norm = window.__t.norm
  const main = document.querySelector('#main')
  const box = document.querySelector('#plan-consent')
  const card = box ? box.closest('section') : null
  const active = document.activeElement
  const heading = card ? card.querySelector('h2') : null
  const texts = (selector) => [...card.querySelectorAll(selector)].map((el) => norm(el.innerText))
  const line = (el) => ({
    lang: el.getAttribute('lang'),
    text: norm(el.innerText),
    fills: [...el.querySelectorAll(':scope > strong')].map((x) => norm(x.innerText)),
    plain: [...el.querySelectorAll(':scope > span')].map((x) => norm(x.innerText)),
  })
  const details = card ? card.querySelector('details') : null
  const summary = card ? card.querySelector(':scope > p > span[lang]') : null
  return {
    path: location.pathname,
    h1: main && main.querySelector('h1') ? norm(main.querySelector('h1').innerText) : '',
    headings: main ? [...main.querySelectorAll('h2')].map((el) => norm(el.innerText)) : [],
    card: card && {
      eyebrow: texts(':scope > p.ui-eyebrow')[0] ?? null,
      title: norm(heading.innerText),
      titleFocused: active === heading,
      focus: active ? (active.id || active.tagName.toLowerCase()) : '',
      paragraphs: texts(':scope > p'),
      asks: texts(':scope > div > p'),
      h3: texts('h3'),
      consent: {
        checked: box.checked,
        disabled: box.disabled,
        required: box.getAttribute('aria-required'),
        invalid: box.getAttribute('aria-invalid'),
        describedby: box.getAttribute('aria-describedby'),
        label: norm(box.closest('label').innerText),
      },
      alerts: [...card.querySelectorAll('[role=alert]')].map((el) => ({ id: el.id, text: norm(el.innerText) })),
      statusElements: card.querySelectorAll('[role=status]').length,
      status: texts('[role=status]').join(' '),
      buttons: [...card.querySelectorAll('button')].map((b) => ({ text: norm(b.innerText), disabled: b.disabled })),
      summary: summary ? line(summary) : null,
      steps: [...card.querySelectorAll('ol > li span[lang]')].map(line),
      cautions: [...card.querySelectorAll('ul > li span[lang]')].map(line),
      how: details
        ? { title: norm(details.querySelector('summary').innerText), open: details.open, text: [...details.querySelectorAll('p')].map((el) => norm(el.textContent)) }
        : null,
    },
  }
}

// --- the checks ---------------------------------------------------------------
const results = []
let current = null
let cdp = null

function expect(name, ok, detail = '') {
  const shown = typeof detail === 'string' ? detail : JSON.stringify(detail)
  current.checks.push({ name, ok: Boolean(ok), detail: ok ? '' : shown })
  if (!ok) console.log(`  FAIL ${current.id}: ${name}${shown ? ' :: ' + shown : ''}`)
}

async function run(id, title, fn) {
  if (ONLY.length > 0 && !ONLY.includes(id)) return
  current = { id, title, checks: [], fault: null }
  results.push(current)
  console.log(`${id} ${title}`)
  const errorsBefore = cdp.pageErrors.length
  try {
    await fn()
    const fresh = cdp.pageErrors.slice(errorsBefore)
    expect('no uncaught error in the page', fresh.length === 0, fresh.join(' | '))
  } catch (err) {
    if (cdp.closed) throw err
    current.fault = String(err.message || err)
    console.log(`  FAULT ${id}: ${current.fault}`)
  }
}

const inPage = (fn, ...args) => cdp.evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`)
const snap = () => inPage(snapshot)
const has = (selector) => inPage((s) => Boolean(document.querySelector(s)), selector)
const buttonOf = (s, label) => s.buttons.find((b) => b.text === norm(label))
const alertText = (s, id = '') => s.alerts.find((a) => a.id === id)?.text
const isBusy = (s, lang = 'en') => s.statuses.some((x) => x === norm(T(lang, 'talk.finding')) || x === norm(T(lang, 'talk.listening')))
const allEnded = (s) => s.tracks.length > 0 && s.tracks.every((x) => x === 'ended')
const sameSet = (a, b) => a.length === b.length && new Set(a).size === a.length && b.every((x) => a.includes(x))

// `read` is what is looked at: the /talk page by default, the plan card where a
// scenario passes its own reader.
async function waitSnap(what, ms, predicate, read = snap) {
  const end = Date.now() + ms
  let s
  for (;;) {
    s = await read()
    if (predicate(s)) return s
    if (Date.now() > end) throw new Fault(`never reached: ${what}; last state ${JSON.stringify(s).slice(0, 700)}`)
    await sleep(60)
  }
}

// For a state the page under test must reach on its own, such as an error it owes
// the reader. If it never gets there that is a finding, which the expect() that
// follows records. waitSnap would call it a fault in the instrument and exit 2.
async function settleSnap(ms, predicate, read = snap) {
  const end = Date.now() + ms
  for (;;) {
    const s = await read()
    if (predicate(s) || Date.now() > end) return s
    await sleep(60)
  }
}

async function press(label, partial = false) {
  const state = await inPage((want, loose) => {
    const b = window.__t.button(want, loose)
    if (!b) return 'absent'
    const disabled = b.disabled
    b.click()
    return disabled ? 'disabled' : 'clicked'
  }, norm(label), partial)
  if (state === 'absent') throw new Fault(`there is no button "${norm(label)}" on ${(await snap()).path}`)
  return state
}
async function tick(selector, want = true) {
  const state = await inPage((sel, wanted) => {
    const el = document.querySelector(sel)
    if (!el) return 'absent'
    if (el.checked !== wanted) el.click()
    return el.checked === wanted
  }, selector, want)
  if (state === 'absent') throw new Fault(`there is nothing at ${selector} to tick`)
  if (state !== true) throw new Fault(`${selector} would not ${want ? 'tick' : 'untick'}`)
}
async function type(selector, value) {
  const ok = await inPage((sel, v) => {
    const el = document.querySelector(sel)
    if (!el) return false
    window.__t.type(el, v)
    return true
  }, selector, value)
  if (!ok) throw new Fault(`there is nothing at ${selector} to type into`)
}
async function choose(selector, value) {
  const ok = await inPage((sel, v) => {
    const el = document.querySelector(sel)
    if (!el) return false
    window.__t.choose(el, v)
    return true
  }, selector, value)
  if (!ok) throw new Fault(`there is nothing at ${selector} to choose from`)
}

const fake = {
  async set(body) {
    const res = await fetch(API + '/__fake', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    })
    await res.arrayBuffer()
    if (!res.ok) throw new Fault(`the fake backend refused ${JSON.stringify(body)}`)
  },
  reset: () => fake.set({ reset: true }),
  async calls() {
    const res = await fetch(API + '/__fake', { signal: AbortSignal.timeout(5000) })
    return res.json()
  },
}

async function waitForRender() {
  for (let i = 0; i < 75; i++) {
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`)
      .catch((err) => { if (cdp.closed) throw err; return 0 })
    if (len > 40) return true
    await sleep(200)
  }
  return false
}
async function navigate(url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`${url} did not load (${errorText}); is the app still being served?`)
}

// A fresh visit: the fake forgotten, this language, nothing stored. `keep` goes
// straight to the route and leaves the tab's storage as the last page left it.
async function open(base, route, { lang = 'en', keep = false } = {}) {
  if (!keep) {
    await fake.reset()
    await navigate(base + '/')
    if (!(await waitForRender())) throw new Fault(`${base}/ never rendered`)
    await cdp.evaluate(`(() => {
      localStorage.setItem('sih-language', ${JSON.stringify(lang)})
      localStorage.removeItem('sih-dialect')
      localStorage.setItem('sih-theme', 'light')
      localStorage.setItem('sih-textsize', 'md')
      sessionStorage.removeItem(${JSON.stringify(STORAGE_KEY)})
      return true
    })()`)
  }
  await navigate(base + route)
  if (!(await waitForRender())) throw new Fault(`${base}${route} never rendered`)
}

const stored = () => inPage((key) => {
  const raw = sessionStorage.getItem(key)
  return raw ? JSON.parse(raw) : null
}, STORAGE_KEY)

// Press Find and wait until the request is over. Waits on the backend having been
// asked and the busy line being gone, so a stale error from the last try is not
// mistaken for this one.
async function find(lang = 'en') {
  const before = (await fake.calls()).length
  const state = await press(T(lang, 'talk.find'))
  if (state !== 'clicked') throw new Fault(`the Find button was ${state}`)
  for (let i = 0; i < 150 && (await fake.calls()).length <= before; i++) await sleep(60)
  return waitSnap('the request to finish', 15000, (s) => !isBusy(s, lang))
}

async function startRecording() {
  const state = await press(en('talk.record'))
  if (state !== 'clicked') throw new Fault(`the Record button was ${state}`)
  return waitSnap('recording to start (a Stop button)', 8000, (s) => Boolean(buttonOf(s, en('talk.stop'))))
}
async function recordFor(ms) {
  await startRecording()
  await sleep(ms)
  await press(en('talk.stop'))
}

// --- the plan card: what S16-S22 share ----------------------------------------
// The card is reached by walking the four real pages, so the request it sends is the
// one a reader's answers make and not one this file builds. JOURNEY is what is typed;
// PLAN_REQUEST is the 12 fields FinancePage must make of it. The village is typed too:
// it is local to the tab and must never reach the model.
const JOURNEY = {
  businessName: 'Rahul Tailors', initialInvestment: '50000', monthlyRevenue: '20000',
  monthlyOperatingExpenses: '5000', existingDebt: '30000', village: 'Chinhat',
  availableCapital: '10000', monthlyExpenses: '8000', monthlyEmi: '1500', householdIncome: '25000',
}
const PLAN_REQUEST = {
  business_category: 'tailoring', state: 'Uttar Pradesh', district: 'Lucknow',
  available_capital: 10000, monthly_expenses: 8000, expected_monthly_revenue: 20000, monthly_emi: 1500,
  household_monthly_income: 25000, initial_investment: 50000, monthly_operating_expenses: 5000,
  existing_debt: 30000, location_type: 'rural',
}
const PLAN_URL = API + '/api/advisor/plan'
const PLAN_PREFIXES = ['plan', 'fo', 'ad', 'talk', 'nav', 'common', 'cat', 'area', 'notice', 'consent', 'errf']
// A plan the route must refuse: it has a number of its own. The rest is the English plan
// the fake returns by default (backend/tests/plan_fixtures.py), so the digit is the only
// thing wrong with it (pytest's verify_plan refuses it for "digit" and nothing else).
const DIGIT_PLAN = {
  summary: 'Your business earns {{profit}} each month after costs, but you still need {{gap}} to start it, for 3 months.',
  steps: [
    'Think about a loan of {{loan}} over {{tenure}} months, with a monthly repayment of {{repayment}}.',
    'Ask the nearest office about {{scheme_a}} before you borrow.',
    'Keep a written record of what you earn and spend each month.',
  ],
  cautions: ['These figures are estimates, so check them with a lender before you decide.'],
}

const ownName = (code) => LANGUAGES.find((l) => l.code === code).endonym
const rupees = (n) => (n < 0 ? '-' : '') + '₹' + Math.abs(n).toLocaleString('en-IN')
// JSON with the keys in order, so two objects can be compared as text.
const canon = (value) => JSON.stringify(value, (key, v) =>
  (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v))
const pathNow = () => inPage(() => location.pathname)

// A line of the plan as the route sent it, in the form planSnapshot reports it.
const lineOf = (parts) => ({
  text: norm(parts.map((p) => p.v).join('')),
  fills: parts.filter((p) => p.t === 'fill').map((p) => norm(p.v)),
  plain: parts.filter((p) => p.t === 'text').map((p) => norm(p.v)),
})
const linesOf = (reply) => [reply.summary, ...reply.steps, ...reply.cautions]
// Whether the card shows the plan the route sent: every line, in order, in the plan's
// language, bold where the rules filled a figure in and plain where the AI wrote.
const showsPlan = (card, reply) => {
  const shown = [card.summary, ...card.steps, ...card.cautions]
  const sent = linesOf(reply).map(lineOf)
  return shown.length === sent.length
    && shown.every((line, i) => line && line.lang === reply.language && canon({ text: line.text, fills: line.fills, plain: line.plain }) === canon(sent[i]))
}
// The figures of each line, in no particular order: the word order of another language
// moves a blank around inside its line but not out of it.
const fillSets = (reply) => linesOf(reply).map((parts) => lineOf(parts).fills.sort())

// The page's own heading. The address changes first and the page follows, so a client-side
// move is over when the heading is another one, not when the address is (and not when
// #main has text, which the page being left also has: waitForRender cannot tell).
const h1Now = () => inPage(() => window.__t.norm(document.querySelector('#main h1')?.innerText ?? ''))

// Press a button that moves to another page, and wait until it has.
async function submitTo(label, path) {
  const left = await h1Now()
  const state = await press(label)
  if (state !== 'clicked') throw new Fault(`the button "${norm(label)}" was ${state}`)
  const end = Date.now() + 10000
  while ((await pathNow()) !== path || (await h1Now()) === left) {
    if (Date.now() > end) {
      const said = await inPage(() => [...document.querySelectorAll('#main [role=alert]')].map((el) => el.innerText))
      throw new Fault(`"${norm(label)}" did not reach ${path}; the page is ${await pathNow()} and says ${JSON.stringify(said)}`)
    }
    await sleep(60)
  }
}

// The real four forms, from /business to a result on /analysis.
async function journey(base = ON) {
  await open(base, '/business')
  await type('input[name="businessName"]', JOURNEY.businessName)
  await press(en('cat.tailoring'), true)
  await type('input[name="initialInvestment"]', JOURNEY.initialInvestment)
  await type('input[name="monthlyRevenue"]', JOURNEY.monthlyRevenue)
  await type('input[name="monthlyOperatingExpenses"]', JOURNEY.monthlyOperatingExpenses)
  await type('input[name="existingDebt"]', JOURNEY.existingDebt)
  await submitTo(en('business.submit'), '/location')
  await choose('select[name="state"]', 'Uttar Pradesh')
  await waitSnap('the districts of the state', 4000, Boolean, () => has('select[name="district"] option[value="Lucknow"]'))
  await choose('select[name="district"]', 'Lucknow')
  await type('input[name="village"]', JOURNEY.village)
  await submitTo(en('location.submit'), '/finance')
  await type('input[name="availableCapital"]', JOURNEY.availableCapital)
  await type('input[name="monthlyExpenses"]', JOURNEY.monthlyExpenses)
  await type('input[name="monthlyEmi"]', JOURNEY.monthlyEmi)
  await type('input[name="householdIncome"]', JOURNEY.householdIncome)
  await tick('#consent-notice')
  await submitTo(en('finance.submit'), '/analysis')
  if (!(await stored())?.data?.result) throw new Fault('the journey ended on /analysis with no result stored')
}

// Client-side, by the first link there is: the page is left as it is, so the probes
// installed in it are not lost.
async function toAdvisory() {
  const found = await inPage(() => {
    const link = document.querySelector('#main a[href="/advisory"]') ?? document.querySelector('a[href="/advisory"]')
    if (link) link.click()
    return Boolean(link)
  })
  if (!found) throw new Fault(`there is no link to /advisory on ${await pathNow()}`)
  await waitSnap('the page /advisory', 8000, (h1) => h1 === norm(en('ad.title')), h1Now)
}

async function startOnAdvisory(base = ON) {
  await journey(base)
  await toAdvisory()
  await inPage(planProbe)
}

const planSnap = () => inPage(planSnapshot)
const planRequests = () => inPage(() => window.__plan.requests)
const planView = async () => ({ ...(await planSnap()), requests: await planRequests() })

// Press the card's button and wait until the request is over and the card is idle again.
async function writePlan(label) {
  const before = (await planRequests()).length
  const state = await press(label)
  if (state !== 'clicked') throw new Fault(`the plan button "${norm(label)}" was ${state}`)
  return waitSnap('the plan request to end', 30000,
    (v) => v.requests.length > before && v.requests.at(-1).done !== null && v.card?.status === '', planView)
}

// The language picker in the utility bar: the one select with a Malayalam option.
const chooseLanguage = (code) => choose('select:has(option[value="ml"])', code)

// --- the scenarios ------------------------------------------------------------
async function s0() {
  await open(OFF, '/')
  expect('the landing page has no link to /talk', !(await has('a[href="/talk"]')))
  expect('(sanity) the landing page links to /profile', await has('a[href="/profile"]'))
  await open(OFF, '/profile', { keep: true })
  expect('the profile page has no link to /talk', !(await has('a[href="/talk"]')))
  expect('(sanity) the profile page has its form', await has('#main input'))
  await open(OFF, '/talk', { keep: true })
  const s = await snap()
  expect('/talk is the not-found page', s.h1 === norm(en('nf.title')), s.h1)
  expect('/talk has no text box', !(await has('#talk-text')))
}

async function s1() {
  await open(ON, '/')
  expect('the landing page links to /talk', await has('a[href="/talk"]'))
  await open(ON, '/profile', { keep: true })
  expect('the profile page links to /talk', await has('a[href="/talk"]'))
  await open(ON, '/talk', { keep: true })
  const s = await snap()
  expect('the title', s.h1 === norm(en('talk.title')), s.h1)
  expect('it says the page is optional', s.mainText.includes(norm(en('talk.optional'))))
  expect('the consent box starts unticked', s.consent?.checked === false, s.consent)
  expect('there is no age box on this build', s.age === null, s.age)
  expect('Find waits for some text', buttonOf(s, en('talk.find'))?.disabled === true)
  const record = buttonOf(s, en('talk.record'))
  if (!record) throw new Fault('no Record button: does this Edge have no microphone support?')
  expect('Record is offered', record.disabled === false)
  expect('the back link goes home', await has('#main a[href="/"]'))
}

async function s2() {
  await open(ON, '/talk')
  await type('#talk-text', 'I do tailoring.')
  let s = await snap()
  expect('Find is enabled once there is text', buttonOf(s, en('talk.find'))?.disabled === false)

  const asked = await press(en('talk.find'))
  expect('Find was pressed', asked === 'clicked', asked)
  s = await settleSnap(4000, (x) => Boolean(alertText(x, 'talk-consent-error')))
  expect('the error says to tick the box', norm(alertText(s, 'talk-consent-error')) === norm(en('talk.consentRequired')), s.alerts)
  expect('the box has focus', s.focus === 'talk-consent', s.focus)
  expect('the box is marked invalid', s.consent.invalid === 'true', s.consent)
  expect('the box points at its error', (s.consent.describedby || '').split(/\s+/).includes('talk-consent-error'), s.consent)
  expect('nothing was sent', (await fake.calls()).length === 0)

  await inPage(() => document.activeElement.blur())
  const recorded = await press(en('talk.record'))
  expect('Record was pressed', recorded === 'clicked', recorded)
  await sleep(300)
  s = await snap()
  expect('Record did not ask for the microphone', s.gumCalls === 0, s.gumCalls)
  expect('Record put focus on the box too', s.focus === 'talk-consent', s.focus)
  expect('nothing was sent either way', (await fake.calls()).length === 0)

  await tick('#talk-consent')
  s = await snap()
  expect('ticking clears the error', !alertText(s, 'talk-consent-error'), s.alerts)
  expect('and the invalid mark', s.consent.invalid === null, s.consent)
}

async function s2b() {
  await open(AGE, '/talk')
  let s = await snap()
  expect('the age box is on this build', s.age !== null)
  await tick('#talk-consent')
  await type('#talk-text', 'I do tailoring.')
  await press(en('talk.find'))
  s = await settleSnap(4000, (x) => Boolean(alertText(x, 'talk-age-error')))
  expect('the error says to tick the box', norm(alertText(s, 'talk-age-error')) === norm(en('talk.consentRequired')), s.alerts)
  expect('the age box has focus', s.focus === 'talk-age', s.focus)
  expect('the age box is marked invalid', s.age.invalid === 'true', s.age)
  expect('the consent box is not blamed', !alertText(s, 'talk-consent-error'))
  expect('nothing was sent', (await fake.calls()).length === 0)
  await tick('#talk-age')
  await find()
  const calls = await fake.calls()
  expect('with both ticked the request goes', calls.length === 1 && calls[0].call === 'extract', calls)
}

// The review is on screen: untick the Lucknow row (the sentence names it, so it
// is there to untick), press the apply button and wait for the page it leads to.
async function untickLucknowAndApply() {
  const found = await inPage(() => {
    const norm = window.__t.norm
    const head = document.querySelector('#main h2[tabindex="-1"]')
    const row = [...head.closest('.ui-formsection').querySelectorAll('ul > li')]
      .find((li) => [...li.querySelectorAll('span.block')].map((el) => norm(el.innerText))[1] === 'Lucknow')
    const box = row && row.querySelector('input[type=checkbox]')
    if (!box) return false
    box.click()
    return true
  })
  if (!found) throw new Fault('no Lucknow row with a box to untick in the review')
  const s = await waitSnap('the Lucknow box to be unticked', 3000, (x) => x.review.rows.some((row) => row.spans[1] === 'Lucknow' && row.checked === false))
  expect('only the Lucknow box was unticked', s.review.rows.filter((row) => row.checked === false).length === 1, s.review.rows)
  await press(en('talk.apply'))
  await waitSnap('the first unanswered page', 5000, (x) => x.path !== '/talk')
}

// The typed sentence, through the review, to the page the button leads to. Leaves
// the application data in the tab's storage.
async function typeAndApply() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await type('#talk-text', SENTENCE)
  await find()
  await waitSnap('the review', 4000, (x) => x.review !== null)
  await untickLucknowAndApply()
}

async function s3() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await type('#talk-text', SENTENCE)
  await find()
  let s = await waitSnap('the review', 4000, (x) => x.review !== null)
  expect('the review is titled and has focus', s.review.title === norm(en('talk.reviewTitle')) && s.review.focused, s.review)
  expect('12 answers', s.review.rows.length === 12, s.review.rows.length)
  FIELD_ORDER.forEach((field, i) => {
    const row = s.review.rows[i]
    const [value, evidence] = ROWS[field]
    const want = typeof value === 'function' ? value('en') : value
    expect(`${field}: the question`, norm(row?.spans[0]).toLowerCase() === norm(en(FIELD_LABEL_KEYS[field])).toLowerCase(), row?.spans[0])
    expect(`${field}: the answer`, row?.spans[1] === norm(want), row?.spans[1])
    expect(`${field}: the words it came from`, (row?.spans[2] || '').includes(evidence), row?.spans[2])
    expect(`${field}: ticked`, row?.checked === true, row?.checked)
  })
  const beforeApply = await stored()
  expect('nothing is applied before the button', !beforeApply || (beforeApply.data.business.initialInvestment === '' && beforeApply.data.aiFilled.length === 0), beforeApply?.data)

  await untickLucknowAndApply()
  const saved = await stored()
  if (!saved) throw new Fault('the application data is not in the tab storage after the button')
  const d = saved.data
  expect('the storage version', saved.v === STORAGE_VERSION, saved.v)
  expect('business.category', d.business.category === 'tailoring', d.business.category)
  const money = {
    business: { initialInvestment: 50000, monthlyRevenue: 20000, monthlyOperatingExpenses: 5000, existingDebt: 30000 },
    finance: { availableCapital: 10000, monthlyExpenses: 8000, monthlyEmi: 1500, householdIncome: 25000 },
  }
  for (const [section, fields] of Object.entries(money)) {
    for (const [name, want] of Object.entries(fields)) expect(`${section}.${name}`, String(d[section][name]) === String(want), d[section][name])
  }
  expect('location.state', d.location.state === 'Uttar Pradesh', d.location.state)
  expect('the unticked district was not written', d.location.district === '', d.location.district)
  expect('location.locationType', d.location.locationType === 'rural', d.location.locationType)
  expect('aiFilled names exactly what was written', sameSet(d.aiFilled, FILLED_PATHS), d.aiFilled)
  expect('the profile page is next (no name yet)', (await snap()).path === '/profile')

  // Full reloads: the banner has to come from storage, not from component state.
  const banner = (section) => inPage((name) => {
    const el = document.querySelector(`[data-helper-banner="${name}"]`)
    return el ? [...el.querySelectorAll('li')].map((li) => window.__t.norm(li.innerText)) : null
  }, section)
  await open(ON, '/business', { keep: true })
  let items = await banner('business')
  expect('/business: the banner lists 5', items?.length === 5, items)
  expect('/business: the banner says what it is', (await snap()).mainText.includes(norm(en('talk.filledTitle'))))
  const business = await inPage(() => ({
    pressed: [...document.querySelectorAll('#main button[aria-pressed="true"]')].map((b) => window.__t.norm(b.innerText)),
    values: Object.fromEntries(['initialInvestment', 'monthlyRevenue', 'monthlyOperatingExpenses', 'existingDebt'].map((n) => [n, document.querySelector(`input[name="${n}"]`)?.value])),
  }))
  expect('/business: the category button is pressed', business.pressed.some((text) => text.includes(norm(en('cat.tailoring')))), business.pressed)
  expect('/business: the money is in the fields', JSON.stringify(business.values) === JSON.stringify({ initialInvestment: '50000', monthlyRevenue: '20000', monthlyOperatingExpenses: '5000', existingDebt: '30000' }), business.values)

  await open(ON, '/location', { keep: true })
  items = await banner('location')
  expect('/location: the banner lists 1 (the state)', items?.length === 1, items)
  const place = await inPage(() => ({
    state: document.querySelector('select[name="state"]')?.value,
    district: document.querySelector('select[name="district"]')?.value,
  }))
  expect('/location: the state is chosen', place.state === 'Uttar Pradesh', place)
  expect('/location: the district is still open', place.district === '', place)

  await open(ON, '/finance', { keep: true })
  items = await banner('finance')
  expect('/finance: the banner lists 4', items?.length === 4, items)
  const money2 = await inPage(() => Object.fromEntries(['availableCapital', 'monthlyExpenses', 'monthlyEmi', 'householdIncome'].map((n) => [n, document.querySelector(`input[name="${n}"]`)?.value])))
  expect('/finance: the money is in the fields', JSON.stringify(money2) === JSON.stringify({ availableCapital: '10000', monthlyExpenses: '8000', monthlyEmi: '1500', householdIncome: '25000' }), money2)
}

async function s4() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await fake.set({ transcript: 'I earn 20000 a month.' })
  await startRecording()
  let s = await snap()
  expect('while recording the status line says so', s.statuses.includes(norm(en('talk.recording', { stop: en('talk.stop') }))), s.statuses)
  expect('while recording Cancel is offered', Boolean(buttonOf(s, en('talk.cancel'))))
  expect('while recording the boxes are locked', s.consent.disabled === true && s.language.disabled === true)
  expect('while recording Find is locked', buttonOf(s, en('talk.find'))?.disabled === true)
  await sleep(1500)
  await press(en('talk.stop'))
  s = await waitSnap('the transcript in the box', 15000, (x) => x.text !== '')
  expect('the transcript lands in the text box', s.text === 'I earn 20000 a month.', s.text)
  const calls = await fake.calls()
  const heard = calls.filter((c) => c.call === 'transcribe')
  expect('the backend got exactly one recording', heard.length === 1, calls)
  const wav = heard[0] || {}
  expect('it is a RIFF/WAVE file', wav.riff === 'RIFF' && wav.wave === 'WAVE', wav)
  expect('mono, 16 kHz', wav.channels === 1 && wav.rate === 16000, wav)
  expect('about the length that was recorded', wav.bytes > 20000 && wav.bytes < 3000000, wav.bytes)
  // The route hands the client the language's name, which is what Meta is told.
  expect('in the page language by default', wav.language === 'English', wav.language)
  expect('the microphone is released after Stop', allEnded(s), s.tracks)
  expect('the boxes are unlocked again', s.consent.disabled === false && s.language.disabled === false)

  await fake.set({ transcript: 'I pay 1500 EMI.' })
  await choose('#talk-language', 'ta')
  await recordFor(1300)
  s = await waitSnap('the second transcript', 15000, (x) => x.text.includes('EMI'))
  expect('a second recording adds to the text', s.text === 'I earn 20000 a month. I pay 1500 EMI.', s.text)
  const again = (await fake.calls()).filter((c) => c.call === 'transcribe')
  expect('and goes to Meta in the language chosen', again.length === 2 && again[1].language === 'Tamil', again.map((c) => c.language))
  expect('both recordings released the microphone', allEnded(s) && s.tracks.length === 2, s.tracks)
}

async function s5() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await type('#talk-text', 'I do tailoring.')
  await inPage(() => { window.__gum.mode = 'defer' })
  await press(en('talk.record'))
  await waitSnap('the permission question to be open', 5000, (x) => x.pending === 1)
  await sleep(250)
  let s = await snap()
  expect('while the browser asks: the consent box is locked', s.consent.disabled === true, s.consent)
  expect('while the browser asks: the language is locked', s.language.disabled === true, s.language)
  expect('while the browser asks: Find is locked', buttonOf(s, en('talk.find'))?.disabled === true)
  expect('while the browser asks: Record is locked', buttonOf(s, en('talk.record'))?.disabled === true)
  expect('while the browser asks: there is no Stop yet', !buttonOf(s, en('talk.stop')))

  await inPage(() => window.__gum.grant())
  s = await waitSnap('recording after the grant', 8000, (x) => Boolean(buttonOf(x, en('talk.stop'))))
  expect('once granted: Cancel is offered', Boolean(buttonOf(s, en('talk.cancel'))))
  expect('once granted: the consent box stays locked', s.consent.disabled === true)

  await press(en('talk.cancel'))
  s = await waitSnap('the controls back after Cancel', 5000, (x) => x.consent.disabled === false)
  expect('Cancel: the language is unlocked', s.language.disabled === false)
  expect('Cancel: Find is unlocked', buttonOf(s, en('talk.find'))?.disabled === false)
  expect('Cancel: Record is back and enabled', buttonOf(s, en('talk.record'))?.disabled === false)
  expect('Cancel: the microphone is released', allEnded(s), s.tracks)
  expect('Cancel: nothing was sent', (await fake.calls()).length === 0)

  await inPage(() => { window.__gum.mode = 'defer' })
  await press(en('talk.record'))
  await waitSnap('the second question to be open', 5000, (x) => x.pending === 1)
  await inPage(() => window.__gum.refuse('NotAllowedError'))
  s = await waitSnap('the refusal to show', 5000, (x) => Boolean(alertText(x)))
  expect('refused: the page says so', norm(alertText(s)) === norm(en('talk.errMicDenied')), alertText(s))
  expect('refused: the boxes are unlocked again', s.consent.disabled === false && s.language.disabled === false)
  expect('refused: Record is back and enabled', buttonOf(s, en('talk.record'))?.disabled === false)
}

async function s6() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await type('#talk-text', 'I do tailoring.')
  const codes = [['rate_limited', 'talk.errBusy'], ['auth', 'talk.errUnavailable'], ['bad_output', 'talk.errUnclear']]
  for (const [fail, key] of codes) {
    await fake.set({ fail })
    const s = await find()
    expect(`${fail}: the page says ${key}`, norm(alertText(s)) === norm(en(key)), alertText(s))
    expect(`${fail}: there is no review`, s.review === null)
    expect(`${fail}: Find is back`, buttonOf(s, en('talk.find'))?.disabled === false)
  }

  await fake.reset()
  await fake.set({ fail: 'rate_limited' })
  await recordFor(1300)
  const s = await waitSnap('the transcription error', 15000, (x) => Boolean(alertText(x)))
  expect('a transcription that is turned away says talk.errBusy', norm(alertText(s)) === norm(en('talk.errBusy')), alertText(s))
  expect('and adds nothing to the text', s.text === 'I do tailoring.', s.text)

  await fake.reset()
  const limits = await inPage(async () => {
    const api = await import('/src/services/api.js')
    const code = async (call) => {
      try { await call(); return 'no error' } catch (err) { return err.code ?? 'no code: ' + err.message }
    }
    const wav = (bytes) => new Blob([new Uint8Array(bytes)], { type: 'audio/wav' })
    return {
      tooBig: await code(() => api.transcribeRecording(wav(3000100), 'en')),
      notAWav: await code(() => api.transcribeRecording(wav(100), 'en')),
      tooLong: await code(() => api.extractAnswers('x'.repeat(2001), 'en')),
    }
  })
  expect('a recording over 3 MB is talk.errRecording', limits.tooBig === 'talk.errRecording', limits)
  expect('bytes that are not a WAV are talk.errRecording', limits.notAWav === 'talk.errRecording', limits)
  expect('text over 2,000 characters is talk.errGeneric', limits.tooLong === 'talk.errGeneric', limits)
}

async function s7() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await type('#talk-text', 'I do tailoring.')
  await fake.set({ delay: 2.5 })
  await press(en('talk.find'))
  let s = await waitSnap('the busy line', 5000, (x) => isBusy(x))
  expect('while it is out: Cancel is offered', Boolean(buttonOf(s, en('talk.cancel'))))
  expect('while it is out: Find is locked', buttonOf(s, en('talk.find'))?.disabled === true)
  await press(en('talk.cancel'))
  s = await waitSnap('Cancel to take effect', 5000, (x) => !buttonOf(x, en('talk.cancel')) && !isBusy(x))
  expect('after Cancel: Find is back', buttonOf(s, en('talk.find'))?.disabled === false)
  expect('after Cancel: no error is shown', s.alerts.length === 0, s.alerts)
  await sleep(3500)
  s = await snap()
  expect('and the late answer is dropped: no review appears', s.review === null)
  expect('and no error appears either', s.alerts.length === 0, s.alerts)
  expect('(sanity) the backend did get the request', (await fake.calls()).filter((c) => c.call === 'extract').length === 1)
  await fake.reset()
}

async function s8() {
  const ml = LANGUAGES.find((l) => l.code === 'ml')
  await open(ON, '/talk', { lang: 'ml' })
  let s = await snap()
  expect('ml: there is no Record button', !buttonOf(s, T('ml', 'talk.record')))
  expect('ml: the page says speaking is not available', s.notices.includes(norm(T('ml', 'talk.langNoSpeech', { language: ml.endonym }))), s.notices)
  await tick('#talk-consent')
  await type('#talk-text', 'I do tailoring.')
  s = await snap()
  expect('ml: typing still enables Find', buttonOf(s, T('ml', 'talk.find'))?.disabled === false)
  await choose('#talk-language', 'en')
  // The page stays in Malayalam; only the language to be spoken changes.
  s = await waitSnap('the Record button after choosing English', 3000, (x) => Boolean(buttonOf(x, T('ml', 'talk.record'))))
  expect('choosing a language with speech brings Record back', Boolean(buttonOf(s, T('ml', 'talk.record'))))
  await choose('#talk-language', 'ml')
  s = await waitSnap('the notice after choosing Malayalam', 3000, (x) => !buttonOf(x, T('ml', 'talk.record')))
  expect('and choosing Malayalam again takes it away', s.notices.includes(norm(T('ml', 'talk.langNoSpeech', { language: ml.endonym }))), s.notices)
}

async function s9() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  for (const [mode, key] of [['deny', 'talk.errMicDenied'], ['none', 'talk.errMicNone']]) {
    await inPage((m) => { window.__gum.mode = m }, mode)
    await press(en('talk.record'))
    const s = await waitSnap(`the ${mode} error`, 5000, (x) => norm(alertText(x)) === norm(en(key)))
    expect(`${mode}: the page says ${key}`, norm(alertText(s)) === norm(en(key)), alertText(s))
    expect(`${mode}: the consent box is unlocked`, s.consent.disabled === false)
    expect(`${mode}: Record is back and enabled`, buttonOf(s, en('talk.record'))?.disabled === false)
    expect(`${mode}: no Stop button`, !buttonOf(s, en('talk.stop')))
  }
}

async function s10() {
  for (const lang of LANGS) {
    await open(ON, '/talk', { lang })
    await type('#talk-text', 'I do tailoring.')
    await press(T(lang, 'talk.find'))
    const s = await settleSnap(4000, (x) => Boolean(alertText(x, 'talk-consent-error')))
    expect(`${lang}: the title`, s.h1 === norm(T(lang, 'talk.title')), s.h1)
    expect(`${lang}: the consent error`, norm(alertText(s, 'talk-consent-error')) === norm(T(lang, 'talk.consentRequired')), alertText(s, 'talk-consent-error'))
    if (lang === 'ml') {
      const ml = LANGUAGES.find((l) => l.code === 'ml')
      expect('ml: the no-speech notice', s.notices.includes(norm(T('ml', 'talk.langNoSpeech', { language: ml.endonym }))), s.notices)
    } else {
      expect(`${lang}: the Record button`, Boolean(buttonOf(s, T(lang, 'talk.record'))), s.buttons)
    }
    const leaks = await inPage(leakScan)
    expect(`${lang}: no leaked key, placeholder or stringified nothing`, leaks.length === 0, leaks.join(' | '))
  }
}

async function s11() {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  try {
    for (const lang of ['en', 'hi']) {
      await open(ON, '/talk', { lang })
      await tick('#talk-consent')
      await type('#talk-text', SENTENCE)
      await find(lang)
      await waitSnap('the review', 4000, (x) => x.review !== null)
      const probe = await inPage(mobileProbe)
      expect(`${lang}: nothing sticks out past the right edge`, probe.overflow.length === 0 && probe.scrollWidth <= probe.vw + 1, probe)
      expect(`${lang}: every tap target is at least 44 px`, probe.taps.length === 0, probe.taps)
      expect(`${lang}: no text under 12 px`, probe.small.length === 0, probe.small)
    }
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  }
}

async function s12() {
  await typeAndApply()
  await open(ON, '/business', { keep: true })
  const banner = () => inPage(() => {
    const el = document.querySelector('[data-helper-banner="business"]')
    return el ? [...el.querySelectorAll('li')].map((li) => window.__t.norm(li.innerText).toLowerCase()) : []
  })
  let items = await banner()
  expect('/business starts with 5 filled answers listed', items.length === 5, items)

  await type('input[name="monthlyRevenue"]', '25000')
  await sleep(200)
  items = await banner()
  expect('editing the revenue removes it from the list', items.length === 4 && !items.includes(norm(en('errf.revenue')).toLowerCase()), items)
  expect('and only it', items.includes(norm(en('errf.investment')).toLowerCase()), items)

  const sameCategory = await inPage(() => {
    const button = document.querySelector('#main button[aria-pressed="true"]')
    if (!button) return false
    button.click()
    return true
  })
  if (!sameCategory) throw new Fault('no pressed category button on /business')
  await sleep(200)
  items = await banner()
  expect('pressing the category that is already chosen changes nothing', items.length === 4, items)

  await press(en('cat.retail'), true)
  await sleep(200)
  items = await banner()
  expect('choosing another category removes the category', items.length === 3 && !items.includes(norm(en('errf.category')).toLowerCase()), items)

  // Back on /talk the boxes are unticked again: they are page state, not stored.
  await open(ON, '/talk', { keep: true })
  const s = await snap()
  expect('/talk starts unticked on a second visit', s.consent?.checked === false, s.consent)
}

async function s13() {
  await open(ON, '/talk')
  await tick('#talk-consent')
  await inPage(() => {
    window.MediaRecorder = class { constructor() { throw new Error('this recorder will not start') } }
  })
  const state = await press(en('talk.record'))
  expect('Record was pressed', state === 'clicked', state)
  const s = await waitSnap('the error after the failed setup', 8000, (x) => Boolean(alertText(x)))
  expect('the page says something went wrong', norm(alertText(s)) === norm(en('talk.errGeneric')), alertText(s))
  expect('(sanity) the microphone had been opened', s.tracks.length > 0, s.tracks)
  expect('and it was released', allEnded(s), s.tracks)
  expect('there is no Stop button', !buttonOf(s, en('talk.stop')))
  expect('the consent box is unlocked', s.consent.disabled === false)
  expect('Record is back and enabled', buttonOf(s, en('talk.record'))?.disabled === false)
}

async function s14() {
  const leave = () => inPage(() => { document.querySelector('#main a[href="/"]').click() })

  await open(ON, '/talk')
  await tick('#talk-consent')
  await startRecording()
  await leave()
  let s = await waitSnap('the landing page', 5000, (x) => x.path === '/')
  s = await waitSnap('the microphone to be released', 4000, allEnded).catch(() => snap())
  expect('leaving while recording releases the microphone', allEnded(s), s.tracks)

  await open(ON, '/talk')
  await tick('#talk-consent')
  await inPage(() => { window.__gum.mode = 'defer' })
  await press(en('talk.record'))
  await waitSnap('the permission question to be open', 5000, (x) => x.pending === 1)
  await leave()
  await waitSnap('the landing page', 5000, (x) => x.path === '/')
  await inPage(() => window.__gum.grant())
  s = await waitSnap('the microphone, once given, to be released', 4000, allEnded).catch(() => snap())
  expect('leaving while the browser asks: the microphone, once given, is released', allEnded(s), s.tracks)
  expect('and the landing page shows no error', s.alerts.length === 0, s.alerts)
}

async function s15() {
  const record = norm(en('talk.record'))
  const stop = norm(en('talk.stop'))

  // The lock goes on when Record is pressed and has to hold until the recording
  // is sent: the boxes were ticked for that recording, and the moment between
  // Stop and the finished file is the one place a box could still be unticked.
  await open(ON, '/talk')
  await tick('#talk-consent')
  await fake.set({ transcript: 'I earn 20000 a month.' })
  await startRecording()
  // A recording stopped at once holds no sound, cannot be decoded and is never
  // sent, which would read as a fault in the page.
  await sleep(1200)
  await inPage(stopProbe, record, stop)
  await press(en('talk.stop'))
  for (let i = 0; i < 150 && (await inPage(() => window.__stop.fetchAt)) === null; i++) await sleep(60)
  const probe = await inPage(() => window.__stop)
  if (probe.fetchAt === null) throw new Fault(`the recording was never sent; the page says ${JSON.stringify(alertText(await snap()))}; states seen ${JSON.stringify(probe.states)}`)
  const before = probe.states.filter((x) => x.at < probe.fetchAt)
  expect('(sanity) the page was watched between Stop and the request', before.some((x) => !x.stopShown && x.recordDisabled !== null), probe)
  expect('from Stop until the request leaves, the consent box stays locked', before.every((x) => x.consentDisabled === true), before)
  expect('and Record stays off, so a second recording cannot start in that moment', before.every((x) => x.recordDisabled !== false), before)
  let s = await waitSnap('the transcript in the box', 15000, (x) => x.text !== '')
  expect('the recording is transcribed as before', s.text === 'I earn 20000 a month.', s.text)
  expect('afterwards the boxes are unlocked again', s.consent.disabled === false && s.language.disabled === false)
  expect('and Record is back and enabled', buttonOf(s, en('talk.record'))?.disabled === false)

  // A recording the browser cannot turn into a file must not leave the page locked.
  await open(ON, '/talk')
  await tick('#talk-consent')
  await startRecording()
  await inPage(stopProbe, record, stop)
  await inPage(() => {
    OfflineAudioContext.prototype.decodeAudioData = () => Promise.reject(new Error('this recording cannot be decoded'))
  })
  await press(en('talk.stop'))
  s = await settleSnap(8000, (x) => Boolean(alertText(x)))
  expect('a recording that cannot be finished says so', norm(alertText(s)) === norm(en('talk.errRecording')), alertText(s))
  // The fake only logs what reaches the model, and the real route turns an empty
  // body away before that, so the request itself is watched from the page.
  expect('and no request left the page', (await inPage(() => window.__stop.fetchAt)) === null)
  expect('and nothing reached the model', (await fake.calls()).length === 0)
  expect('the microphone is released', allEnded(s), s.tracks)
  expect('the consent box is unlocked again', s.consent.disabled === false, s.consent)
  expect('Record is back and enabled', buttonOf(s, en('talk.record'))?.disabled === false)
}

// --- S16-S22: the written plan on /advisory -------------------------------------
// The card is the one place the reader's answers go to a third party after the form, so
// it is driven the way a reader drives it: through the four real pages, with the fake in
// Meta's place. What the model is shown is read from the fake, which logs all of it.

async function s16() {
  await startOnAdvisory()
  let v = await planView()
  expect('(sanity) /advisory shows the loan options and the rules own plan above the card', v.path === '/advisory' && v.headings.includes(norm(en('fo.title'))) && v.headings.includes(norm(en('ad.planTitle'))), { path: v.path, headings: v.headings })
  expect('helper on: the plan card is there', v.card !== null, v.headings)
  if (!v.card) return

  const card = v.card
  expect('the card has its eyebrow and its title', card.eyebrow === norm(en('plan.eyebrow')) && card.title === norm(en('plan.title')), [card.eyebrow, card.title])
  expect('before a plan it says what the plan is', canon(card.paragraphs) === canon([norm(en('plan.eyebrow')), norm(en('plan.intro'))]), card.paragraphs)
  expect('and what is sent, before the tick', canon(card.asks) === canon([norm(en('plan.sendsText'))]), card.asks)
  expect('the consent box starts unticked, enabled and required', card.consent.checked === false && card.consent.disabled === false && card.consent.required === 'true', card.consent)
  expect('with no error on it', card.consent.invalid === null && card.consent.describedby === null && card.alerts.length === 0, card)
  expect('its label is the consent sentence', card.consent.label.startsWith(norm(en('plan.consent'))), [card.consent.label, norm(en('plan.consent'))])
  expect('the one button is Write, and it is enabled', canon(card.buttons) === canon([{ text: norm(en('plan.write')), disabled: false }]), card.buttons)
  expect('the status line is in the page for the first message, and empty', card.statusElements === 1 && card.status === '', card)
  expect('no plan is shown', card.summary === null && card.steps.length === 0 && card.cautions.length === 0 && card.how === null && card.h3.length === 0, card)
  expect('nothing was sent from the page', (await planRequests()).length === 0)
  expect('and nothing reached the model', (await fake.calls()).length === 0)
  let leaks = await inPage(leakScan, PLAN_PREFIXES)
  expect('no leaked key, placeholder or stringified nothing', leaks.length === 0, leaks.join(' | '))

  // The tick is asked for, not assumed.
  const pressed = await press(en('plan.write'))
  expect('(sanity) Write was pressed without the tick', pressed === 'clicked', pressed)
  v = await settleSnap(3000, (x) => x.card?.alerts.some((a) => a.id === 'plan-consent-error'), planView)
  const refusal = v.card?.alerts.find((a) => a.id === 'plan-consent-error')
  expect('Write without the tick says the tick is needed', refusal?.text === norm(en('talk.consentRequired')), v.card?.alerts)
  expect('and marks the box invalid and described by that message', v.card?.consent.invalid === 'true' && v.card?.consent.describedby === 'plan-consent-error', v.card?.consent)
  expect('and moves focus to the box', v.card?.focus === 'plan-consent', v.card?.focus)
  expect('and sends nothing', (await planRequests()).length === 0 && (await fake.calls()).length === 0)
  expect('and the card is not left busy', v.card?.status === '' && v.card?.buttons[0]?.disabled === false, v.card)

  await tick('#plan-consent')
  v = await planView()
  expect('ticking the box takes the message and the marks away', v.card.alerts.length === 0 && v.card.consent.invalid === null && v.card.consent.describedby === null && v.card.consent.checked === true, v.card)

  // Built without the helper, the page is the rules alone.
  await startOnAdvisory(OFF)
  v = await planView()
  expect('(sanity) the helper-off build shows the rules own plan', v.path === '/advisory' && v.headings.includes(norm(en('ad.planTitle'))), { path: v.path, headings: v.headings })
  expect('helper off: no plan card and no consent box', v.card === null && !(await has('#plan-consent')), v.headings)
  expect('and nothing was sent', (await planRequests()).length === 0 && (await fake.calls()).length === 0)
  leaks = await inPage(leakScan, PLAN_PREFIXES)
  expect('helper off: no leaked key either', leaks.length === 0, leaks.join(' | '))
}

async function s17() {
  await startOnAdvisory()
  const saved = (await stored()).data
  expect('(sanity) the four pages made the 12 answers they should', canon(saved.request) === canon(PLAN_REQUEST), saved.request)
  const profit = saved.result?.financial_analysis?.monthly_profit
  const gap = saved.result?.financial_analysis?.funding_gap
  expect('(sanity) and a result with the profit and the gap the plan is filled from', profit === 12000 && gap === 40000, { profit, gap })

  await tick('#plan-consent')
  const v = await writePlan(en('plan.write'))
  const call = v.requests.at(-1)
  expect('exactly one request left the page, a POST to the plan route', v.requests.length === 1 && call.method === 'POST' && call.url === PLAN_URL, v.requests.map((r) => `${r.method} ${r.url}`))
  expect('the plan request was answered with 200', call.status === 200, { status: call.status, reply: call.reply })
  expect('the card shows a plan', Boolean(v.card?.summary), v.card)
  if (call.status !== 200 || !v.card?.summary) return

  const reply = JSON.parse(call.reply)
  expect('the request is JSON', call.contentType === 'application/json', call.contentType)
  expect('and carries exactly the 12 answers, the language and the tick', canon(JSON.parse(call.body)) === canon({ answers: PLAN_REQUEST, language: 'en', send_to_meta: true }), call.body)
  expect('the route wrote the plan on its first try, in English', reply.attempts === 1 && reply.language === 'en', { attempts: reply.attempts, language: reply.language })

  // What the model was given. The fake logs all of it.
  const calls = await fake.calls()
  expect('the model was asked once, for English', calls.length === 1 && calls[0].call === 'plan' && calls[0].language === 'en', calls.map((c) => `${c.call}:${c.language}`))
  const given = calls[0]?.text ?? ''
  const digits = given.match(/\p{Nd}+/gu) ?? []
  expect('what the model was given has no digit in it, so no figure', digits.length === 0, digits)
  const names = (saved.result?.scheme_matches ?? []).map((m) => m.name)
  expect('(sanity) the result names schemes that could have leaked', names.length > 0, names)
  const leaked = ['Lucknow', 'Uttar Pradesh', JOURNEY.businessName, 'Rahul', 'Tailors', JOURNEY.village, ...names].filter((word) => given.toLowerCase().includes(word.toLowerCase()))
  expect('and no name, place or scheme from the answers', leaked.length === 0, leaked)
  expect('(sanity) it was told the kind of business and the setting, so the check had something to find', given.includes('tailoring') && given.includes('village') && given.length > 300, given.slice(0, 300))

  const card = v.card
  expect('the heading takes focus: a plan just written is where a keyboard lands', card.titleFocused === true, card.focus)
  expect('the card says an AI wrote it, and carries the fixed caution', card.paragraphs.includes(norm(en('plan.aiLabel'))) && card.paragraphs.includes(norm(en('plan.fixedCaution'))), card.paragraphs)
  expect('the intro and the other-language note are gone', !card.paragraphs.includes(norm(en('plan.intro'))) && !card.paragraphs.includes(norm(en('plan.otherLanguage', { language: ownName('en') }))), card.paragraphs)
  expect('the summary, steps and cautions are what the route sent, line for line, in English', showsPlan(card, reply), { shown: [card.summary, ...card.steps, ...card.cautions], sent: linesOf(reply).map(lineOf) })
  expect('the summary carries the rules own profit and gap, from the result', canon(card.summary.fills) === canon([rupees(profit), rupees(gap)]), card.summary.fills)
  const wording = [card.summary, ...card.steps, ...card.cautions].flatMap((line) => line.plain)
  expect('the AI own words hold no digit', wording.every((run) => !/\p{Nd}/u.test(run)), wording)
  expect('3 steps and 1 caution, under their titles', card.steps.length === 3 && card.cautions.length === 1 && canon(card.h3) === canon([norm(en('plan.stepsTitle')), norm(en('plan.cautionsTitle'))]), { steps: card.steps.length, cautions: card.cautions.length, h3: card.h3 })
  expect('how this plan was made is closed, with both its paragraphs', card.how?.open === false && card.how.title === norm(en('plan.how')) && canon(card.how.text) === canon([norm(en('plan.howText')), norm(en('plan.howLimit'))]), card.how)
  expect('the consent box is unticked again', card.consent.checked === false && card.consent.disabled === false, card.consent)
  expect('the button now offers another plan, naming the language', canon(card.buttons) === canon([{ text: norm(en('plan.again', { language: ownName('en') })), disabled: false }]), card.buttons)
  expect('no error, and the status line is empty', card.alerts.length === 0 && card.status === '', card)
  const leaks = await inPage(leakScan, PLAN_PREFIXES)
  expect('no leaked key, placeholder or stringified nothing', leaks.length === 0, leaks.join(' | '))

  const kept = (await stored()).data.plan
  expect('the plan is stored as the route sent it', Boolean(kept) && kept.language === 'en' && canon([kept.summary, kept.steps, kept.cautions]) === canon([reply.summary, reply.steps, reply.cautions]), kept)

  // A reload keeps the plan and does not write another.
  await open(ON, '/advisory', { keep: true })
  await inPage(planProbe)
  const again = await planView()
  expect('after a reload the same plan is there', Boolean(again.card?.summary) && showsPlan(again.card, reply), again.card)
  expect('and the heading is not grabbed by a plan that was already there', again.card?.titleFocused === false, again.card?.focus)
  await sleep(400)
  expect('and nothing was asked for again', (await planRequests()).length === 0 && (await fake.calls()).length === 1)

  // Changing an answer throws the plan away with the result it belonged to.
  await open(ON, '/finance', { keep: true })
  await type('input[name="monthlyExpenses"]', '8001')
  const edited = await settleSnap(3000, (d) => d.result === null, async () => (await stored()).data)
  expect('changing an answer clears the result, the request and the plan', edited.result === null && edited.request === null && edited.plan === null, { result: edited.result === null, request: edited.request === null, plan: edited.plan === null })
  await toAdvisory()
  const emptied = await planSnap()
  expect('/advisory then says the answers changed and shows no plan card', emptied.card === null && emptied.headings.includes(norm(en('res.changedTitle'))), emptied.headings)
}

async function s18() {
  await startOnAdvisory()
  await tick('#plan-consent')
  let v = await writePlan(en('plan.write'))
  const english = JSON.parse(v.requests.at(-1).reply)
  expect('(sanity) the first plan is English, and shown', english.language === 'en' && Boolean(v.card?.summary) && showsPlan(v.card, english), v.card)

  await chooseLanguage('hi')
  v = await settleSnap(3000, (x) => x.card?.title === norm(T('hi', 'plan.title')), planView)
  expect('in Hindi the card is Hindi', v.card?.title === norm(T('hi', 'plan.title')), v.card?.title)
  expect('the plan stays as it was written, in English', Boolean(v.card?.summary) && showsPlan(v.card, english), v.card)
  expect('and a note says so, in Hindi, naming English', v.card.paragraphs.includes(norm(T('hi', 'plan.otherLanguage', { language: ownName('en') }))), v.card.paragraphs)
  expect('the button offers a plan in Hindi', canon(v.card.buttons) === canon([{ text: norm(T('hi', 'plan.again', { language: ownName('hi') })), disabled: false }]), v.card.buttons)
  expect('switching the language kept the result and asked for nothing', (await stored()).data.result !== null && (await planRequests()).length === 1 && (await fake.calls()).length === 1)

  await tick('#plan-consent')
  v = await writePlan(T('hi', 'plan.again', { language: ownName('hi') }))
  const last = v.requests.at(-1)
  const hindi = last.status === 200 ? JSON.parse(last.reply) : null
  expect('a plan written now is asked for, and comes back, in Hindi', JSON.parse(last.body).language === 'hi' && hindi?.language === 'hi', { status: last.status, language: hindi?.language })
  if (!hindi) return
  expect('every line is Hindi, as the route sent it', Boolean(v.card?.summary) && showsPlan(v.card, hindi), v.card)
  expect('with the same figures as the English plan, line for line', canon(fillSets(hindi)) === canon(fillSets(english)), { hindi: fillSets(hindi), english: fillSets(english) })
  expect('and no note about another language', !v.card.paragraphs.includes(norm(T('hi', 'plan.otherLanguage', { language: ownName('en') }))) && !v.card.paragraphs.includes(norm(T('hi', 'plan.otherLanguage', { language: ownName('hi') }))), v.card.paragraphs)

  await chooseLanguage('en')
  v = await settleSnap(3000, (x) => x.card?.title === norm(en('plan.title')), planView)
  expect('back in English the Hindi plan stays, with a note naming Hindi', Boolean(v.card?.summary) && showsPlan(v.card, hindi) && v.card.paragraphs.includes(norm(en('plan.otherLanguage', { language: ownName('hi') }))), v.card)
  expect('and the result is still there', (await stored()).data.result !== null)
}

async function s19() {
  await startOnAdvisory()
  // Each case: how to break the next try, and what must follow. `calls` is how many
  // times the model was asked (the route tries a plan the checks refuse twice).
  const cases = [
    { what: 'a plan with a number of its own', prepare: () => fake.set({ plan: DIGIT_PLAN }), status: 502, key: 'plan.errNoPlan', calls: 2 },
    { what: 'the model being rate limited', prepare: () => fake.set({ fail: 'rate_limited' }), status: 429, key: 'plan.errBusy', calls: 1 },
    { what: 'a model reply that cannot be used', prepare: () => fake.set({ fail: 'bad_output' }), status: 502, key: 'plan.errNoPlan', calls: 2 },
    { what: 'a dropped connection', prepare: () => inPage(planFailure, 'reject'), status: 'rejected', key: 'plan.errUnavailable', calls: 0 },
    { what: 'a server error with nothing in it', prepare: () => inPage(planFailure, 'reply', 500, '{}'), status: 500, key: 'plan.errGeneric', calls: 0 },
    { what: 'the model refusing the key', prepare: () => fake.set({ fail: 'auth' }), status: 503, key: 'plan.errUnavailable', calls: 1 },
    { what: 'a 200 that is not a plan', prepare: () => inPage(planFailure, 'reply', 200, '{"nope":true}'), status: 200, key: 'plan.errGeneric', calls: 0 },
  ]
  for (const c of cases) {
    await fake.reset()
    await c.prepare()
    await tick('#plan-consent')
    const v = await writePlan(en('plan.write'))
    const call = v.requests.at(-1)
    const errors = (v.card?.alerts ?? []).filter((a) => a.id === '').map((a) => a.text)
    expect(`${c.what}: the page says ${c.key}`, canon(errors) === canon([norm(en(c.key))]), v.card?.alerts)
    expect(`${c.what}: the answer was ${c.status}`, call.status === c.status, call.status)
    expect(`${c.what}: the model was asked ${c.calls} time(s)`, (await fake.calls()).length === c.calls, (await fake.calls()).length)
    expect(`${c.what}: no plan is shown or stored`, v.card?.summary === null && (await stored()).data.plan === null, v.card)
    expect(`${c.what}: Write is back and the status line empty`, canon(v.card?.buttons) === canon([{ text: norm(en('plan.write')), disabled: false }]) && v.card?.status === '', v.card)
    if (c.status === 502 && c.calls === 2 && c.key === 'plan.errNoPlan' && c.what.includes('number')) {
      expect(`${c.what}: its number never reached the page`, !(await inPage(() => document.body.innerText.includes('for 3 months'))))
    }
  }

  await fake.reset()
  await tick('#plan-consent')
  const v = await writePlan(en('plan.write'))
  expect('with the fault gone the same button gives a plan', Boolean(v.card?.summary) && v.card.alerts.length === 0, v.card)
}

async function s20() {
  await startOnAdvisory()
  await tick('#plan-consent')

  // An error from an earlier try is cleared when the next one starts.
  await fake.set({ fail: 'rate_limited' })
  let v = await writePlan(en('plan.write'))
  expect('(sanity) a refused try shows its error', v.card?.alerts.some((a) => a.text === norm(en('plan.errBusy'))), v.card?.alerts)

  await fake.set({ fail: null, delay: 4 })
  await press(en('plan.write'))
  v = await waitSnap('the plan to be on its way', 8000, (x) => x.requests.length === 2 && x.card?.status !== '', planView)
  expect('while the plan is written the card says so', v.card.status === norm(en('plan.writing')), v.card.status)
  expect('the error of the last try is gone', v.card.alerts.length === 0, v.card.alerts)
  expect('Write is off and Cancel is offered', canon(v.card.buttons) === canon([{ text: norm(en('plan.write')), disabled: true }, { text: norm(en('talk.cancel')), disabled: false }]), v.card.buttons)
  expect('the consent box is locked while the request is out', v.card.consent.disabled === true, v.card.consent)

  await press(en('talk.cancel'))
  v = await waitSnap('the card to be idle again', 6000, (x) => x.card?.status === '' && x.requests[1]?.done !== null, planView)
  expect('Cancel ends the wait without an error', v.card.alerts.length === 0, v.card.alerts)
  expect('the page abandoned the request', v.requests[1].status === 'rejected', v.requests[1].status)
  expect('no plan, and Write is back with the box unlocked', v.card.summary === null && canon(v.card.buttons) === canon([{ text: norm(en('plan.write')), disabled: false }]) && v.card.consent.disabled === false, v.card)
  await sleep(4500)
  v = await planView()
  expect('a plan the backend finishes after that is not picked up', v.card.summary === null && v.card.alerts.length === 0 && (await stored()).data.plan === null, v.card)

  await fake.set({ delay: 0 })
  // A Cancel that did nothing lets the plan arrive, and its button then reads "again":
  // the checks above have said so, and a missing button would make this a fault.
  if (v.card?.summary) return
  await tick('#plan-consent')
  v = await writePlan(en('plan.write'))
  expect('a try after Cancel gives a plan', Boolean(v.card?.summary) && v.card.alerts.length === 0, v.card)
}

async function s21() {
  await startOnAdvisory()
  let english = null
  for (const lang of LANGS) {
    if (lang !== 'en') {
      await chooseLanguage(lang)
      await settleSnap(3000, (x) => x.card?.title === norm(T(lang, 'plan.title')), planView)
    }
    await tick('#plan-consent')
    const v = await writePlan(english === null ? T(lang, 'plan.write') : T(lang, 'plan.again', { language: ownName(lang) }))
    const call = v.requests.at(-1)
    const reply = call.status === 200 ? JSON.parse(call.reply) : null
    expect(`${lang}: the plan comes back, in this language`, reply?.language === lang, { status: call.status, language: reply?.language })
    if (!reply) continue
    english ??= reply
    expect(`${lang}: the request asked for it`, JSON.parse(call.body).language === lang, call.body)
    expect(`${lang}: every line is as the route sent it, in ${lang}`, Boolean(v.card?.summary) && showsPlan(v.card, reply), v.card)
    expect(`${lang}: the same figures as the English plan, line for line`, canon(fillSets(reply)) === canon(fillSets(english)), { here: fillSets(reply), english: fillSets(english) })
    expect(`${lang}: 3 steps, 1 caution, under their titles`, v.card.steps.length === 3 && v.card.cautions.length === 1 && canon(v.card.h3) === canon([norm(T(lang, 'plan.stepsTitle')), norm(T(lang, 'plan.cautionsTitle'))]), { steps: v.card.steps.length, cautions: v.card.cautions.length, h3: v.card.h3 })
    expect(`${lang}: the title, the AI label and the fixed caution`, v.card.title === norm(T(lang, 'plan.title')) && v.card.paragraphs.includes(norm(T(lang, 'plan.aiLabel'))) && v.card.paragraphs.includes(norm(T(lang, 'plan.fixedCaution'))), { title: v.card.title, paragraphs: v.card.paragraphs })
    expect(`${lang}: the consent sentence and the button`, v.card.consent.label.startsWith(norm(T(lang, 'plan.consent'))) && canon(v.card.buttons) === canon([{ text: norm(T(lang, 'plan.again', { language: ownName(lang) })), disabled: false }]), { label: v.card.consent.label, buttons: v.card.buttons })
    const leaks = await inPage(leakScan, PLAN_PREFIXES)
    expect(`${lang}: no leaked key, placeholder or stringified nothing`, leaks.length === 0, leaks.join(' | '))
  }
}

async function s22() {
  // The journey is not what is under test: walk it at desktop size, then shrink.
  await startOnAdvisory()
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const measure = async (what) => {
    const probe = await inPage(mobileProbe, '#plan-consent', 'section')
    expect(`${what}: nothing sticks out past the right edge`, probe.overflow.length === 0 && probe.scrollWidth <= probe.vw + 1, probe)
    expect(`${what}: every tap target is at least 44 px`, probe.taps.length === 0, probe.taps)
    expect(`${what}: no text under 12 px`, probe.small.length === 0, probe.small)
  }
  try {
    await measure('en, at rest')
    await chooseLanguage('hi')
    await settleSnap(3000, (x) => x.card?.title === norm(T('hi', 'plan.title')), planView)
    await measure('hi, at rest')
    await tick('#plan-consent')
    await writePlan(T('hi', 'plan.write'))
    await measure('hi, with a plan')
    await chooseLanguage('en')
    await settleSnap(3000, (x) => x.card?.title === norm(en('plan.title')), planView)
    await measure('en, with a Hindi plan and the note about its language')
    await tick('#plan-consent')
    await writePlan(en('plan.again', { language: ownName('en') }))
    await measure('en, with a plan')
  } finally {
    await cdp.send('Emulation.clearDeviceMetricsOverride')
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  }
}

// --- main ---------------------------------------------------------------------
async function main() {
  for (const [what, port] of [['the debugging port', DEBUG_PORT], ['the fake backend', FAKE_PORT], ['Vite (helper on)', VITES.on], ['Vite (helper off)', VITES.off], ['Vite (age box)', VITES.age]]) {
    const held = await portInUse(port)
    if (held) throw new Error(`port ${port} (${what}) is already in use (${held}); free it before running this gate`)
  }

  rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  mkdirSync(PROFILE_DIR, { recursive: true })

  await startFake()
  // One after the other: they share frontend/node_modules/.vite.
  await startVite(VITES.on, { VITE_AI_HELPER: 'true', VITE_REQUIRE_AGE_CHECK: 'false' })
  await startVite(VITES.off, { VITE_AI_HELPER: 'false', VITE_REQUIRE_AGE_CHECK: 'false' })
  await startVite(VITES.age, { VITE_AI_HELPER: 'true', VITE_REQUIRE_AGE_CHECK: 'true' })

  edgeStarted = true
  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    '--window-size=1280,900',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
    '--edge-skip-compat-layer-relaunch',
    // A synthetic microphone, and no permission question to answer by hand.
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ], { stdio: 'ignore' })
  children.push(edge)

  cdp = new CDP(await browserWsUrl())
  await cdp.ready
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
  cdp.sessionId = sessionId
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${pageLibrary.toString()})()` })

  await run('S0', 'helper off: no link, /talk is the not-found page', s0)
  await run('S1', 'helper on: links, page, starting state', s1)
  await run('S2', 'consent gate', s2)
  await run('S2b', 'age gate', s2b)
  await run('S3', 'typed sentence -> review -> apply -> banners', s3)
  await run('S4', 'voice: record, stop, WAV, microphone released', s4)
  await run('S5', 'boxes stay locked while the browser asks for the microphone', s5)
  await run('S6', 'error codes, a failed transcription, api.js limits', s6)
  await run('S7', 'Cancel while a request is out', s7)
  await run('S8', 'Malayalam: no speech, typing works', s8)
  await run('S9', 'microphone refused or missing', s9)
  await run('S10', 'all 8 languages', s10)
  await run('S11', '360 px phone', s11)
  await run('S12', 'editing a filled answer removes only it', s12)
  await run('S13', 'a recorder that will not start leaves the microphone off', s13)
  await run('S14', 'leaving the page releases the microphone', s14)
  await run('S15', 'the consent lock holds until the recording is sent', s15)
  await run('S16', 'the plan card at rest: its own consent tick, nothing sent', s16)
  await run('S17', 'one plan: the request, what the model sees, the card, the stored plan', s17)
  await run('S18', 'a plan in English, then Hindi, then English', s18)
  await run('S19', 'a refused plan and every way to fail', s19)
  await run('S20', 'Cancel while the plan is being written', s20)
  await run('S21', 'a plan in each of the 8 languages', s21)
  await run('S22', '360 px phone: the plan card at rest and with a plan', s22)

  cdp.ws.close()
  cleanup()

  const failures = results.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => ({ scenario: r.id, name: c.name, detail: c.detail })))
  const faults = results.filter((r) => r.fault).map((r) => ({ scenario: r.id, fault: r.fault }))
  const exit = faults.length > 0 ? 2 : failures.length > 0 ? 1 : 0
  const checks = results.reduce((n, r) => n + r.checks.length, 0)

  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({
    exit,
    only: ONLY.length > 0 ? ONLY : null,
    checks,
    scenarios: results.map((r) => ({
      id: r.id, title: r.title, checks: r.checks.length,
      failed: r.checks.filter((c) => !c.ok).length, fault: r.fault,
    })),
    failures,
    faults,
    pageErrors: cdp.pageErrors,
  }, null, 2))

  console.log('')
  for (const r of results) {
    const failed = r.checks.filter((c) => !c.ok).length
    console.log(`${r.fault ? 'FAULT' : failed ? 'FAIL ' : 'ok   '} ${r.id.padEnd(4)} ${r.title} (${r.checks.length} checks${failed ? `, ${failed} failed` : ''})`)
  }
  console.log(`\n${checks} checks, ${failures.length} failed, ${faults.length} scenario(s) could not be measured. Exit ${exit}.${ONLY.length > 0 ? ` Partial run: ${ONLY.join(',')}.` : ''}`)
  process.exitCode = exit
  // A half-closed socket must not hold the run open. Unref'd, so a clean exit is
  // untouched; it only fires if something else is still keeping node alive.
  setTimeout(() => crashExit(exit), 5000).unref()
}

main().catch((err) => {
  console.error(err)
  cleanup()
  process.exitCode = 2
  setTimeout(() => crashExit(2), 5000).unref()
})

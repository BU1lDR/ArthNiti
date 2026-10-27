// Headless verification driver. No dependencies: Edge is already on this machine
// and Node 24 has a global WebSocket, so this speaks the Chrome DevTools Protocol
// directly rather than pulling in Playwright.
//
// Why it seeds sessionStorage instead of typing into the forms: the analysis call
// fires on the /finance submit, and driving four React-controlled forms through
// CDP is a lot of brittle machinery to reach a state we can just write down. The
// payloads under screenshots/verify/*.json come from the REAL backend, so the
// result pages render against a genuine response — only the typing is skipped.
//
// Two Edge gotchas are baked in below: the user-data-dir must be ABSOLUTE (a
// relative one silently attaches to the already-running profile, and the second
// instance exits without ever opening a debug port), and we create our own target
// through the browser endpoint rather than picking the first "page" in /json/list,
// which on a signed-in profile is a sync-confirmation dialog.
//
// Run from the repo root:  node tools/verify/drive.mjs
// Exit 0: nothing found. 1: a finding, a page whose #main never filled (BLANK)
// and a scheme whose heading is not on the page included. 2: the run could not
// measure: the working directory is wrong, a fixture is missing, AppContext no
// longer reads the seed version, the dictionaries define no dotted key to take
// prefixes from, FIT_KEYS is gone from backendText.js or has no entry this can
// read, a key the checks need (a cleared, not-ready or fit label) is not in
// resultStrings.js, the page cannot import deployment.js or it no longer
// exports what is read from it, the dev server is down or went away mid-run (a
// navigation failed, or a page that never filled is Edge's own error page or
// answered other than 2xx), a scheme heading sits in no card or in a box that
// holds other schemes' headings too, Edge's DevTools socket closed, the run
// ended without reaching its verdict, or the driver crashed. A run that exits 2
// writes no report.json, and once the working directory checks out, the last
// run's is gone too. report.json carries the same code as `exit`; `demoMode`
// says which notice the run read, and `neutralised` which of the deployer's
// values the text checks left out.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9222
// localhost, not 127.0.0.1: the Vite dev server binds [::1] only, so the IPv4
// literal refuses the connection even though the server is plainly up.
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/out')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- how our Edge dies -----------------------------------------------------------
// By PID and nothing else. This used to finish with `taskkill /IM msedge.exe`,
// which also closed whatever Edge the person running the gate had open. The
// msedge.exe we spawn relaunches itself through a compatibility layer and exits
// within a second, so its PID alone is not enough: --edge-skip-compat-layer-
// relaunch stops that at the source, and ownEdgePids() is the fallback, finding
// the browser process that carries OUR profile path and no --type= (every
// renderer, GPU and utility child carries one; taskkill /T takes those with it).
// The path is anchored at a quote, a space or the end, because this profile dir
// is a prefix of thirteen other scripts' dirs (edge-profile-mobile, -print, ...),
// and a bare substring match would kill a gate running beside this one.
// Same technique as market-ui.mjs.
let edge = null
function ownEdgePids() {
  const script =
    "$p = [regex]::Escape($env:DRIVE_EDGE_PROFILE) + '(?=[\"\\s]|$)'; " +
    "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -and " +
    "$_.CommandLine -match $p -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.ProcessId }"
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, DRIVE_EDGE_PROFILE: PROFILE_DIR },
    encoding: 'utf8',
  })
  return (r.stdout || '').split(/\s+/).filter((s) => /^\d+$/.test(s)).map(Number)
}
function killOwnEdge() {
  const kill = (pid) => spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
  // A spawned PID that has already exited is skipped: it may belong to something else by now.
  if (edge && edge.exitCode === null && edge.signalCode === null) kill(edge.pid)
  edge = null
  for (const pid of ownEdgePids()) kill(pid)
}

// --- exit codes ------------------------------------------------------------------
// 0 means the run measured and found nothing, 1 a finding, and 2 that the run
// could not measure. Node's own exit on an uncaught error is 1, which reads as a
// finding, so anything thrown or rejected that nothing catches exits 2 instead.
process.on('uncaughtException', (err) => {
  console.error(err)
  killOwnEdge()
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
if (!existsSync(resolve('tools/verify/drive.mjs'))) {
  console.error(`drive: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/drive.mjs`)
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
    console.error(`drive: ${url} answered HTTP ${res.status}. ${start}`)
  } catch (err) {
    console.error(`drive: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`)
  }
  process.exitCode = 2
  return false
}

// --- the form answers that go with each captured backend response -------------
const FORMS = {
  good: {
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
  },
  nulls: {
    profile: { name: 'Ram Prasad', language: 'Hindi', dialect: '' },
    business: {
      businessName: 'Ram Tailor Shop', category: 'tailoring', categoryOther: '',
      initialInvestment: '0', monthlyRevenue: '10000',
      monthlyOperatingExpenses: '12000', existingDebt: 40000,
    },
    location: {
      village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
      locationType: 'rural', marketType: ['village'], customers: 'Local families',
    },
    finance: { availableCapital: '5000', monthlyExpenses: '20000', monthlyEmi: '5000' },
  },
  // Was agriculture in Delhi until the scheme file grew to thirty, at which
  // point it started matching twelve and stopped testing the "nothing matched"
  // empty state. A typed-in Other is now the only input that reaches it — see
  // refresh-cases.mjs, which regenerates the response beside this.
  empty: {
    profile: { name: 'Suresh Kumar', language: 'Kannada', dialect: '' },
    business: {
      businessName: 'Suresh Studio', category: 'other', categoryOther: 'Photography',
      initialInvestment: '80000', monthlyRevenue: '25000',
      monthlyOperatingExpenses: '9000', existingDebt: 0,
    },
    location: {
      village: '', district: 'New Delhi', state: 'Delhi',
      locationType: 'rural', marketType: ['town'], customers: '',
    },
    finance: { availableCapital: '50000', monthlyExpenses: '10000', monthlyEmi: '2000' },
  },

  // Nothing entered. This is the case the other three cannot reach: the form
  // pages compute live previews from `Number(field) || 0`, so an unanswered
  // question arrives as a real 0 and every derived figure reads as good news —
  // "₹30,000 left each month", "you have enough of your planned investment" —
  // before the user has told us anything. That is the same false-reassurance
  // class as known defect 4, and it only shows up with the fields genuinely
  // blank, which is why an all-zeros case is not a substitute.
  blank: {
    profile: { name: '', language: 'Hindi', dialect: '' },
    business: {
      businessName: '', category: '', categoryOther: '',
      initialInvestment: '', monthlyRevenue: '',
      monthlyOperatingExpenses: '', existingDebt: 0,
    },
    location: {
      village: '', district: '', state: '',
      locationType: 'rural', marketType: [], customers: '',
    },
    finance: { availableCapital: '', monthlyExpenses: '', monthlyEmi: '' },
  },
}

// Answered, submitted, then edited. Changing an answer on /business, /location
// or /finance throws the result away and sets `resultCleared`, so each result
// page must say the old result was removed (res.changedTitle), not show it, and
// not fall to the "not ready yet" state of someone who never submitted. The
// answers are `good`'s, because the flag only ever arises once there are answers.
FORMS.cleared = structuredClone(FORMS.good)

const RESULTS = {
  good: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')),
  nulls: JSON.parse(readFileSync('screenshots/verify/case_nulls.json', 'utf8')),
  empty: JSON.parse(readFileSync('screenshots/verify/case_empty.json', 'utf8')),
  // Explicitly null, not just absent: the blank case has never submitted, so
  // every result page must show its own "not ready yet" state.
  blank: null,
  // Null because the edit discarded it. What it USED to be is good's response,
  // which is what the cleared checks look for and must not find.
  cleared: null,
}

// Extra fields in the seeded payload, beside the answers and the result.
const SEED_EXTRA = {
  cleared: { resultCleared: true },
}

// --- the sessionStorage envelope ---------------------------------------------
// AppContext reads {v, data} and discards a payload whose v is not in its
// READABLE_VERSIONS, silently, by returning the blank form. The seed says
// version 2 (version 1 plus `resultCleared`), and the script refuses to start if
// AppContext no longer reads that version: every result page would fall to its
// empty state, and the findings would point everywhere except at the seed.
// FORMS carry neither `literacyLevel` nor `employees`, which version 4 removed,
// nor `householdIncome`, which version 3 added: hydrate() keeps only EMPTY's
// keys and fills a missing one from EMPTY, so the seed reads the same either way.
// The refusal exits 2, as it does in the other seeding scripts: 1 is a finding,
// and a run that measured nothing has none.
const SEED_VERSION = 2
const APP_CONTEXT = 'frontend/src/context/AppContext.jsx'
const APP_CONTEXT_TEXT = readFileSync(APP_CONTEXT, 'utf8')
{
  const m = APP_CONTEXT_TEXT.match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m) {
    console.error(`READABLE_VERSIONS not found in ${APP_CONTEXT}; update the parse in drive.mjs`)
    process.exit(2)
  }
  const readable = m[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number)
  if (!readable.includes(SEED_VERSION)) {
    console.error(
      `${APP_CONTEXT} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ` +
        `${readable.join(', ')}). Rewrite FORMS in drive.mjs to the new shape and raise SEED_VERSION.`,
    )
    process.exit(2)
  }
}
// What the app writes back after it hydrates, for the hydrate check below.
const STORAGE_VERSION = Number(APP_CONTEXT_TEXT.match(/^const STORAGE_VERSION = (\d+)/m)?.[1])
if (!Number.isInteger(STORAGE_VERSION)) throw new Error(`STORAGE_VERSION not found in ${APP_CONTEXT}; update the parse in drive.mjs`)

// --- the hydrate check ----------------------------------------------------------
// Run once, before the passes. An old payload that still carries the two fields
// version 4 removed must come back, once the app has written its state on mount,
// at the current version without them, and with the result byte-for-byte as it
// went in: hydrate() passes `result` through untouched, so an old seed stays
// readable. Seeding FORMS alone could not show this, because they no longer
// carry the removed fields at all.
const REMOVED_FIELDS = [['profile', 'literacyLevel', 'low'], ['business', 'employees', 2]]

const RESULT_ROUTES = ['/analysis', '/schemes', '/advisory', '/report']

// --- the scheme-card check ----------------------------------------------------
// Every scheme card must print what its fit_basis says (sc.fitState /
// sc.fitRegion / sc.fitNational in the page's language) and must never print its
// match score as a percentage. The score is 60 + 40 or 60 + 30 and checks no
// eligibility rule, so "90%" reads as a 90% chance of qualifying. This lives in
// the main gate rather than in a one-off probe because it is a standing rule.
//
// It has to open every <details> first: the page text above is innerText,
// which skips the body of a closed <details>, so a percentage re-added inside
// a disclosure would pass everything else in this script.
const CARD_ROUTES = ['/analysis', '/schemes', '/report']
// fit_basis -> key, read from the app's own map in backendText.js rather than
// copied here. A copy goes stale without a sound when the app renames a key:
// every card of that basis reads as FIT LABEL MISSING, a finding against a
// correct app, and the WRONG FIT LABEL arm for it looks for the word
// "undefined" (see the check under CLEARED_KEYS). backendText.js cannot be
// imported here, because it imports './LanguageContext' without an extension,
// so its source is read line by line with keycheck.mjs's MAP_ENTRY pattern. A
// map that is gone, has no entry, or has a line the pattern cannot read (a
// double-quoted key, a template literal) exits 2: skipping that line would
// leave its basis out of FIT_KEYS, and a correct app would then be reported as
// FIT LABEL MISSING. A basis the backend sends that the map lacks stays a
// finding, FIT LABEL MISSING: fitLabel() title-cases it, so the reader sees a
// bare English word.
const BACKEND_TEXT = 'frontend/src/i18n/backendText.js'
const FIT_KEYS = {}
{
  const source = readFileSync(BACKEND_TEXT, 'utf8')
  const opener = 'const FIT_KEYS = {'
  const open = source.indexOf(opener)
  const close = open < 0 ? -1 : source.indexOf('\n}', open)
  if (close < 0) throw new Error(`FIT_KEYS not found in ${BACKEND_TEXT}; update the parse in drive.mjs`)
  const firstLine = source.slice(0, open).split('\n').length
  source.slice(open + opener.length, close).split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^\s*(?:\/\/.*)?$/.test(line)) return
    const m = line.match(/^\s*(?:'([^'\\]+)'|([\w$]+))\s*:\s*'([\w.]+)',?\s*(?:\/\/.*)?$/)
    if (!m) {
      throw new Error(`${BACKEND_TEXT}:${firstLine + i}: drive.mjs cannot read this FIT_KEYS line, so its basis would ` +
        `be reported as FIT LABEL MISSING on a correct app: ${JSON.stringify(raw)}; update the parse in drive.mjs`)
    }
    FIT_KEYS[m[1] ?? m[2]] = m[3]
  })
  if (!Object.keys(FIT_KEYS).length) throw new Error(`FIT_KEYS in ${BACKEND_TEXT} has no entry drive.mjs can read; update the parse`)
}
const { RESULT_STRINGS } = await import(pathToFileURL(resolve('frontend/src/i18n/resultStrings.js')).href)
// Same per-key English fallback as t(), so a key missing in one language is
// judged against the English the page would really print.
const resultText = (lang, key) => RESULT_STRINGS[lang]?.[key] ?? RESULT_STRINGS.en[key]
const fitText = (lang, basis) => resultText(lang, FIT_KEYS[basis])

// --- the cleared-result check -------------------------------------------------
// What each result page prints when there is no result and none was ever made.
// A cleared result must not print it: that sentence tells someone who DID
// submit that they never finished, and sends them back to the start.
const NOT_READY_KEYS = {
  '/analysis': 'res.notReady',
  '/schemes': 'sch.finishTitle',
  '/advisory': 'ad.notReady',
  '/report': 'rp.notReady',
}
const CLEARED_KEYS = ['res.changedTitle', 'res.changedButton']
// Checked here rather than at use: resultText() of a key missing from `en` is
// undefined, and text.includes(undefined) looks for the word "undefined", so a
// renamed key would turn the "must not appear" half of a check (WRONG EMPTY
// STATE, WRONG FIT LABEL) into a pass.
for (const key of [...CLEARED_KEYS, ...Object.values(NOT_READY_KEYS), ...Object.values(FIT_KEYS)]) {
  if (typeof RESULT_STRINGS.en[key] !== 'string') throw new Error(`${key} is not defined in resultStrings.js en`)
}
// The result the edit threw away. Its scheme names render in English in every
// language (the card check below finds them that way), so they are a direct
// test that none of the old result reached the page.
const DISCARDED_SCHEMES = (RESULTS.good?.scheme_matches || []).map((s) => s.name)
// Score-shaped only: a scheme's own prose legitimately carries percentages
// (PM Vishwakarma's "5% interest"), and the score is only ever 90 or 100.
const SCORE_PCT = /(?<![\d.,-])(90|100)\s*%/

// Runs in the page. For each scheme name, finds its heading, walks up to the
// card that holds it, and returns that card's text with every <details> open.
// The walk stops at the first CARD_SELECTOR box, and /analysis's card matches
// only by its Tailwind utilities, so a cosmetic class edit moves where it
// stops. Two wrong stops come back marked `card: false`, for the caller to
// throw on, since neither measured a card: no box at all, or a box holding
// more than one scheme's heading. That second one is the section around all
// the cards, whose text carries every card's fit label and the fit chart's
// too. A heading that is not on the page at all is a scheme missing from it,
// and stays a finding.
const CARD_SELECTOR = 'section.ui-card, .ui-card-soft, div.rounded-2xl.border'
const cardProbe = (names) => `(() => {
  document.querySelectorAll('details').forEach((d) => { d.open = true })
  const names = ${JSON.stringify(names)}
  const wanted = new Set(names)
  const heads = [...document.querySelectorAll('h2, h3')]
  return names.map((name) => {
    const h = heads.find((el) => el.textContent.trim() === name)
    if (!h) return { found: false }
    const card = h.closest(${JSON.stringify(CARD_SELECTOR)})
    if (!card) return { found: true, card: false, held: 0 }
    const held = new Set([...card.querySelectorAll('h2, h3')].map((el) => el.textContent.trim()).filter((text) => wanted.has(text))).size
    return held > 1 ? { found: true, card: false, held } : { found: true, card: true, text: card.innerText }
  })
})()`
const ALL_ROUTES = ['/', '/login', '/profile', '/business', '/location', '/finance', ...RESULT_ROUTES, '/privacy', '/no-such-page']

// --- the privacy notice -----------------------------------------------------------
// /privacy keeps its detail (what is kept, the host logs, the age condition, the
// notice version) inside <details>, which innerText skips while closed. On these
// routes every <details> is opened after the dump and the screenshot, and the
// opened text is checked again. A page with nothing to open is itself a finding,
// because then the second read proves nothing.
const OPEN_DETAILS_ROUTES = ['/privacy']

// Words the copy must never use about this software or its logs. Checked on
// every page, in English only, since that is the language they would be in.
const FORBIDDEN_CLAIM = /\b(compliant|secure|anonymous|untraceable)\b/i

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// --- the leaked-key check ---------------------------------------------------------
// A t() key that no dictionary defines renders as its own dotted name. Such a
// name can start with the prefix of any key the dictionaries do define, so the
// prefixes come from the app's own merged table, not from a list kept here: a
// hand-kept list had fallen behind, and missed lvl, lvlnote, man, err and scat,
// which all render through t(). strings.js imports its three siblings without
// an extension, which Vite resolves and Node does not, so the specifiers are
// rewritten to file URLs and the module is loaded from a data: URL, as
// market-ui.mjs loads it. No prefix at all would leave a check that matches
// nothing, a pass that never looked, so that exits 2.
const I18N = resolve('frontend/src/i18n')
const stringsSource = readFileSync(resolve(I18N, 'strings.js'), 'utf8').replace(
  /from '\.\/(\w+)'/g,
  (_, name) => `from '${pathToFileURL(resolve(I18N, name + '.js')).href}'`,
)
const { STRINGS } = await import('data:text/javascript;base64,' + Buffer.from(stringsSource).toString('base64'))
const KEY_PREFIXES = [...new Set(
  Object.keys(STRINGS?.en || {}).filter((key) => key.indexOf('.') > 0).map((key) => key.slice(0, key.indexOf('.'))),
)]
if (!KEY_PREFIXES.length) throw new Error(`no dotted key in the en dictionary of ${I18N}: the leaked-key check would match nothing`)
const RAW_KEY = new RegExp(`\\b(?:${KEY_PREFIXES.map(escapeRegExp).join('|')})\\.[a-zA-Z_][a-zA-Z0-9_]*`, 'g')

// --- the deployer's own words -----------------------------------------------------
// A client deployment prints its Fiduciary's name and its privacy contact,
// which come from VITE_* variables through frontend/src/config/deployment.js.
// They are the client's text, not the app's copy, and the text checks misread
// them: a contact of privacy.officer@nbfc.in is the leaked key privacy.officer,
// a Fiduciary called Secure Credit Finance Ltd a forbidden claim, and one called
// Infinity Microfin the bad token Infinity. So each one that is set is replaced
// by a neutral token before textProblems(), and only there: the dumps keep the
// page as it is. main() reads them in the page, from the module the app itself
// imports, since they come from Vite's env and no file here holds them.
// Whitespace and case match loosely: innerText collapses a run of spaces and
// applies any text-transform.
const DEPLOYER_FIELDS = ['fiduciaryName', 'privacyContact']
const neutralise = (text, patterns) => patterns.reduce((out, pattern) => out.replace(pattern, '[deployer value]'), text)

// The checks every page's text gets, closed or with its <details> opened.
function textProblems(text, lang) {
  const problems = []

  // A t() key that exists in no dictionary falls through to the key
  // itself, so an invented key shows up in the rendered text verbatim.
  const rawKeys = [...new Set(text.match(RAW_KEY) || [])]
  if (rawKeys.length) problems.push('UNTRANSLATED KEY LEAKED: ' + rawKeys.join(', '))

  for (const bad of ['null%', 'NaN', 'undefined', '[object Object]', 'Infinity', '₹null', '₹NaN', '₹undefined']) {
    if (text.includes(bad)) problems.push(`BAD TOKEN: "${bad}"`)
  }
  // Lowercase enum values and backend field names must never reach screen.
  for (const raw of [
    'attention_needed', 'break_even', 'not_feasible', 'profit_margin', 'match_level', 'pressure_ratio',
    'fit_basis', 'wholesale_price_per_kg', 'registered_units', 'count_suppressed',
    // The household repayment check: its enum values and field names.
    'household_check', 'within_limit', 'over_limit', 'not_checked',
    'household_repayment_percent', 'household_in_microfinance_range',
  ]) {
    if (text.includes(raw)) problems.push(`RAW ENUM/FIELD ON SCREEN: "${raw}"`)
  }

  const claim = lang === 'en' && FORBIDDEN_CLAIM.exec(text)
  if (claim) problems.push(`FORBIDDEN CLAIM: "${claim[0]}"`)
  return problems
}

// case, language, routes. 8 passes, 41 page loads: 12 + 4 + 4 + 4 + 4 + 1 + 8 + 4.
const PASSES = [
  ['good', 'en', ALL_ROUTES],
  ['good', 'ta', RESULT_ROUTES],
  ['good', 'hi', RESULT_ROUTES],
  ['nulls', 'en', RESULT_ROUTES],
  ['empty', 'en', RESULT_ROUTES],
  ['good', 'bn', ['/analysis']],
  // Blank forms: the four journey pages plus the result pages, which must all
  // fall to their "not ready yet" state rather than rendering a zeroed report.
  ['blank', 'en', ['/profile', '/business', '/location', '/finance', ...RESULT_ROUTES]],
  // A result thrown away by an edited answer. In Hindi, the default language,
  // so the expected sentence comes from a real translation rather than from the
  // English fallback.
  ['cleared', 'hi', RESULT_ROUTES],
]

// --- minimal CDP client, session-aware ---------------------------------------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.consoleErrors = []
    this.pageErrors = []
    this.sessionId = null
    this.closed = false

    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve())
      this.ws.addEventListener('error', () => reject(new Error('CDP socket error')))
      this.ws.addEventListener('close', () => reject(new Error('CDP socket closed')))
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

      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        this.consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '))
      }
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
    // ws.send() on a closed socket drops the frame without an error, and the
    // reply it waits for would never come.
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(method + ': CDP socket closed'))
    const id = this.next++
    const envelope = { id, method, params }
    if (useSession && this.sessionId) envelope.sessionId = this.sessionId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      this.ws.send(JSON.stringify(envelope))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) {
      throw new Error('page threw: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text))
    }
    return res.result.value
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
      // Edge is not listening yet.
    }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

// Wait until React has actually painted into the main landmark. A bare
// readyState check passes on an empty shell, which is the failure mode we most
// want to catch. An evaluate that fails while the page is still navigating is
// worth another try; one on a closed socket is not, and goes to the crash path.
async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    const len = await cdp
      .evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`)
      .catch((err) => { if (cdp.closed) throw err; return 0 })
    if (len > 40) return true
    await sleep(200)
  }
  return false
}

// Navigates to an app URL and waits for it to fill. Page.navigate answers with
// errorText when the load itself failed, as it does with the connection refused
// once the dev server has gone. A page that never filled is BLANK, a finding,
// unless it is not the app at all: Edge's own error page, or a response other
// than 2xx (0 means the status is unknown). Vite answers every route with
// index.html and a 200, so each of those means the server failed, not the app.
// All three throw: a fault, never a finding. A probe that fails on a live
// socket leaves the page BLANK.
async function loadPage(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`${url} did not load (${errorText}). Is the dev server still up?`)
  const rendered = await waitForRender(cdp)
  if (!rendered) {
    const page = await cdp
      .evaluate(`({ protocol: location.protocol, status: performance.getEntriesByType('navigation')[0]?.responseStatus || 0 })`)
      .catch((err) => { if (cdp.closed) throw err; return null })
    if (page?.protocol === 'chrome-error:') throw new Error(`${url} never rendered: it is Edge's own error page. Is the dev server still up?`)
    if (page?.status && (page.status < 200 || page.status > 299)) throw new Error(`${url} never rendered: it answered HTTP ${page.status}`)
  }
  return rendered
}

async function main() {
  if (!(await requireServer(APP + '/', 'Start the Vite dev server first: npm run dev in ./frontend.'))) return
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--edge-skip-compat-layer-relaunch',
    '--remote-allow-origins=*',
    '--window-size=1440,1600',
    '--disable-gpu',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const findings = []
  const report = []
  let hydrateCheck = null

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId

    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    // The hydrate check (see REMOVED_FIELDS). Land same-origin, seed, then load
    // again so the app hydrates from the seed and writes its state back.
    {
      const old = structuredClone(FORMS.good)
      for (const [section, field, value] of REMOVED_FIELDS) old[section][field] = value
      const seed = JSON.stringify({ v: SEED_VERSION, data: { ...old, result: RESULTS.good } })
      await loadPage(cdp, APP + '/')
      await cdp.evaluate(`sessionStorage.setItem('sih-application', ${JSON.stringify(seed)}); true`)
      await loadPage(cdp, APP + '/')
      await sleep(450)
      const stored = JSON.parse(await cdp.evaluate(`sessionStorage.getItem('sih-application') || 'null'`))
      const problems = []
      if (!stored) {
        problems.push('HYDRATE: nothing was written back to sessionStorage')
      } else {
        if (stored.v !== STORAGE_VERSION) problems.push(`HYDRATE: written back at v${stored.v}, not v${STORAGE_VERSION}`)
        for (const [section, field] of REMOVED_FIELDS) {
          if (stored.data?.[section] && Object.hasOwn(stored.data[section], field)) {
            problems.push(`HYDRATE: ${section}.${field} survived hydrate()`)
          }
        }
        if (JSON.stringify(stored.data?.result) !== JSON.stringify(RESULTS.good)) {
          problems.push('HYDRATE: the result did not pass through hydrate() unchanged')
        }
      }
      hydrateCheck = { seededAt: SEED_VERSION, writtenAt: stored?.v ?? null, problems }
      if (problems.length) findings.push({ tag: 'hydrate', problems })
      console.log(
        `${problems.length ? 'FAIL' : 'ok  '}  ${'hydrate'.padEnd(32)} v${SEED_VERSION} seed carrying ` +
          REMOVED_FIELDS.map(([s, f]) => `${s}.${f}`).join(' and ') + ` -> v${stored?.v}` +
          (problems.length ? '  ' + problems.join(' | ') : ', both dropped, result unchanged'),
      )
    }

    // The deployer's values (see DEPLOYER_FIELDS), read once. The hydrate check
    // leaves the page on the app's origin, so this is the module the app itself
    // imported. A shape other than the one read here exits 2: which text is
    // the deployer's could not be told.
    const deployment = await cdp.evaluate(`import('/src/config/deployment.js').then((m) => ({
      demoMode: m.DEMO_MODE,
      values: ${JSON.stringify(DEPLOYER_FIELDS)}.map((field) => m.DEPLOYMENT?.[field]),
    }))`)
    if (typeof deployment?.demoMode !== 'boolean' || !deployment.values.every((value) => typeof value === 'string')) {
      throw new Error(`/src/config/deployment.js no longer exports DEMO_MODE and DEPLOYMENT.${DEPLOYER_FIELDS.join(', ')} as drive.mjs reads them`)
    }
    const neutralised = DEPLOYER_FIELDS.filter((_, i) => deployment.values[i].trim())
    const deployerPatterns = deployment.values
      .filter((value) => value.trim())
      .map((value) => new RegExp(escapeRegExp(value.trim()).replace(/\s+/g, '\\s+'), 'gi'))
    console.log(
      `deployment: ${deployment.demoMode ? 'demo mode' : 'a Fiduciary is set'}` +
        (neutralised.length ? `; ${neutralised.join(' and ')} left out of the text checks` : ''),
    )

    for (const [caseName, lang, routes] of PASSES) {
      // Establish the origin before writing storage, then seed and navigate.
      await loadPage(cdp, APP + '/')

      const payload = JSON.stringify({
        v: SEED_VERSION,
        data: { ...FORMS[caseName], result: RESULTS[caseName], ...(SEED_EXTRA[caseName] || {}) },
      })
      await cdp.evaluate(`
        sessionStorage.setItem('sih-application', ${JSON.stringify(payload)});
        localStorage.setItem('sih-language', ${JSON.stringify(lang)});
        localStorage.setItem('sih-theme', 'light');
        localStorage.removeItem('sih-dialect');
        true;
      `)

      for (const route of routes) {
        const tag = `${caseName}-${lang}-${route.replace(/\//g, '_') || '_root'}`
        cdp.consoleErrors.length = 0
        cdp.pageErrors.length = 0

        const rendered = await loadPage(cdp, APP + route)
        await sleep(450)

        const text = await cdp.evaluate('document.body.innerText')
        const title = await cdp.evaluate('document.title')
        const htmlLang = await cdp.evaluate('document.documentElement.lang')
        const barCount = await cdp.evaluate(`document.querySelectorAll('.ui-bar-row').length`)
        const unitCount = await cdp.evaluate(`document.querySelectorAll('.ui-unit-chart').length`)

        writeFileSync(
          `${OUT}/${tag}.txt`,
          `route=${route}\ncase=${caseName}\nlang=${lang}\ntitle=${title}\nhtml[lang]=${htmlLang}\n` +
            `rendered=${rendered}\nbars=${barCount}\nunitCharts=${unitCount}\n` +
            `consoleErrors=${JSON.stringify(cdp.consoleErrors)}\npageErrors=${JSON.stringify(cdp.pageErrors)}\n\n${text}`,
        )

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        writeFileSync(`${OUT}/${tag}.png`, Buffer.from(shot.data, 'base64'))

        // --- automated checks on the rendered text -------------------------
        const problems = []
        if (!rendered) problems.push('BLANK: #main never filled')
        if (cdp.pageErrors.length) problems.push('PAGE EXCEPTION: ' + cdp.pageErrors[0].split('\n')[0])
        problems.push(...textProblems(neutralise(text, deployerPatterns), lang))

        // With nothing entered, every derived figure must say so. `Number('')`
        // is 0, so the failure mode is not a crash — it is a confident ₹0 and a
        // reassuring sentence about money the user never told us about. This is
        // the check the all-filled cases structurally cannot make.
        if (caseName === 'blank') {
          if (/₹\s?0(?!\d)/.test(text)) {
            problems.push('FALSE ₹0: a derived figure printed zero for an unanswered question')
          }
          for (const claim of ['You have enough', 'enough of your planned investment']) {
            if (text.includes(claim)) problems.push(`FALSE REASSURANCE: "${claim}" with a blank form`)
          }
        }

        // A result thrown away by an edited answer. The page must say so in the
        // reader's language, must not show the "not ready yet" state of someone
        // who never submitted, and must show nothing of the old result: no
        // chart, no rupee figure, none of its scheme names. Read from #main so
        // the chrome and the footer cannot satisfy or trip it.
        if (caseName === 'cleared') {
          const mainText = await cdp.evaluate(`document.querySelector('#main')?.innerText || ''`)
          for (const key of CLEARED_KEYS) {
            if (!mainText.includes(resultText(lang, key))) problems.push(`CLEARED STATE MISSING: ${key}`)
          }
          const notReady = NOT_READY_KEYS[route]
          if (notReady && mainText.includes(resultText(lang, notReady))) {
            problems.push(`WRONG EMPTY STATE: ${notReady} shown for a cleared result`)
          }
          if (barCount || unitCount) problems.push(`OLD RESULT SHOWN: ${barCount} bar(s), ${unitCount} coin chart(s)`)
          if (/₹\s?\d/.test(mainText)) problems.push('OLD RESULT SHOWN: a rupee figure')
          const shown = DISCARDED_SCHEMES.filter((name) => mainText.includes(name))
          if (shown.length) problems.push(`OLD RESULT SHOWN: ${shown.length} scheme name(s), e.g. ${shown[0]}`)
        }

        // After the text dump and the screenshot, for the reason the card check
        // below gives. The opened text is dumped beside the closed one, and only
        // what it adds is reported, so a finding is not listed twice.
        let detailsOpened = null
        if (OPEN_DETAILS_ROUTES.includes(route)) {
          const opened = await cdp.evaluate(`(() => {
            const all = [...document.querySelectorAll('details')]
            all.forEach((d) => { d.open = true })
            return { n: all.length, text: document.body.innerText }
          })()`)
          detailsOpened = opened.n
          writeFileSync(`${OUT}/${tag}.open.txt`, `route=${route}\ndetails opened=${opened.n}\n\n${opened.text}`)
          if (!opened.n) problems.push(`NO DISCLOSURE: ${route} has no <details> to open, so its hidden detail was never read`)
          for (const p of textProblems(neutralise(opened.text, deployerPatterns), lang)) {
            if (!problems.includes(p)) problems.push(p + ' (inside a <details>)')
          }
        }

        // After the text dump and the screenshot, because it opens every
        // <details> and both of those should show the page as a reader lands on it.
        const schemes = RESULTS[caseName]?.scheme_matches || []
        let cardsChecked = 0
        if (CARD_ROUTES.includes(route) && schemes.length > 0) {
          const cards = await cdp.evaluate(cardProbe(schemes.map((s) => s.name)))
          cards.forEach((card, i) => {
            const scheme = schemes[i]
            if (!card.found) { problems.push(`SCHEME CARD NOT FOUND: ${scheme.name}`); return }
            // Not a finding: which box is the card could not be told (see cardProbe).
            if (!card.card) {
              throw new Error(
                `${route}: ` +
                  (card.held
                    ? `the box around the heading "${scheme.name}" holds ${card.held} schemes' headings, so it is not one card`
                    : `the heading "${scheme.name}" is in no ${CARD_SELECTOR}`) +
                  '. Update CARD_SELECTOR in drive.mjs to the card markup.',
              )
            }
            cardsChecked++
            const pct = SCORE_PCT.exec(card.text)
            if (pct) problems.push(`SCORE AS PERCENT on ${scheme.name}: "${pct[0]}"`)
            const want = fitText(lang, scheme.fit_basis)
            if (!want || !card.text.includes(want)) problems.push(`FIT LABEL MISSING on ${scheme.name} (fit_basis=${scheme.fit_basis})`)
            for (const other of Object.keys(FIT_KEYS)) {
              if (other !== scheme.fit_basis && card.text.includes(fitText(lang, other))) {
                problems.push(`WRONG FIT LABEL on ${scheme.name}: ${other} for ${scheme.fit_basis}`)
              }
            }
          })
        }

        report.push({ tag, route, caseName, lang, rendered, chars: text.length, bars: barCount, unitCharts: unitCount, cardsChecked, detailsOpened, problems })
        if (problems.length) findings.push({ tag, problems })

        console.log(
          `${problems.length ? 'FAIL' : 'ok  '}  ${tag.padEnd(32)} ${String(text.length).padStart(5)}c ` +
            `bars=${String(barCount).padStart(2)} coins=${unitCount}` +
            (cardsChecked ? ` cards=${cardsChecked}` : '') +
            (problems.length ? '  ' + problems.join(' | ') : ''),
        )
      }
    }

    // Exit 1 on any finding, so a caller that checks the status sees it. It
    // used to exit 0 either way, and only report.json said otherwise. The
    // report carries the same code.
    const exit = findings.length ? 1 : 0
    writeFileSync(
      `${OUT}/report.json`,
      JSON.stringify({ exit, demoMode: deployment.demoMode, neutralised, hydrate: hydrateCheck, report, findings }, null, 2),
    )
    console.log(`\n${report.length} page loads plus the hydrate check, ${findings.length} with problems.`)
    console.log(`Text dumps and PNGs in ${OUT}`)
    process.exitCode = exit
  } finally {
    killOwnEdge()
  }
}

main().catch((err) => {
  console.error('DRIVER ERROR:', err.message)
  killOwnEdge()
  crashExit()
})

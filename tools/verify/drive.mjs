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
// read, a schedule heading with no table under it on /report, a result fixture
// with no compliance steps (it predates the card: regenerate it with
// refresh-cases.mjs), a compliance step, need, case, kind, place or source the
// card check has no wording for, a key the checks need (a cleared, not-ready,
// fit, schedule or compliance label) is not in resultStrings.js, the page cannot import deployment.js or it no longer
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

// Answered and submitted before the compliance card and the scheme funding card
// existed: good's answers, and good's response without those two keys (RESULTS.old,
// below). Both result pages must leave the cards out and carry on.
FORMS.old = structuredClone(FORMS.good)

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
RESULTS.old = structuredClone(RESULTS.good)
delete RESULTS.old.compliance
delete RESULTS.old.scheme_funding
// The three real responses must carry compliance steps, or the card check would pass by
// finding nothing to draw. A fixture that predates the card is a stale instrument.
for (const name of ['good', 'nulls', 'empty']) {
  if (!RESULTS[name].compliance?.steps?.length) {
    throw new Error(`screenshots/verify/case_${name}.json has no compliance steps: regenerate it with tools/verify/refresh-cases.mjs against the current backend`)
  }
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
for (const key of [...CLEARED_KEYS, ...Object.values(NOT_READY_KEYS), ...Object.values(FIT_KEYS), 'rp.scheduleTitle', 'fs.title', 'fs.caption']) {
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
  const heads = [...document.querySelectorAll('h2, h3')].filter((el) => !el.closest('[data-scheme-funding]'))
  return names.map((name) => {
    const h = heads.find((el) => el.textContent.trim() === name)
    if (!h) return { found: false }
    const card = h.closest(${JSON.stringify(CARD_SELECTOR)})
    if (!card) return { found: true, card: false, held: 0 }
    const held = new Set([...card.querySelectorAll('h2, h3')].map((el) => el.textContent.trim()).filter((text) => wanted.has(text))).size
    return held > 1 ? { found: true, card: false, held } : { found: true, card: true, text: card.innerText }
  })
})()`
// Runs in the page. /report draws the schedule of whichever loan its menu names and
// does no arithmetic, so this picks one the way a person does (the menu's own change
// event), waits for React to draw it, and returns the table's rows as text. `menu`
// says whether the menu was there, `rows` is null when no table is.
const scheduleProbe = (months) => `(async () => {
  const menu = document.getElementById('schedule-term')
  if (menu) {
    menu.value = ${JSON.stringify(String(months))}
    menu.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const table = document.querySelector('[aria-labelledby="schedule-for"] table')
  return { menu: Boolean(menu), rows: table ? [...table.tBodies[0].rows].map((row) => [...row.cells].map((cell) => cell.innerText.trim())) : null }
})()`
// Digits are Latin in every language, so a printed figure reads back as whole paise.
const toPaise = (text) => Number(text.replace(/[^\d]/g, ''))
const inPaise = (rupees) => Math.round(rupees * 100)
const exactRupees = (rupees) => '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// --- the scheme funding card ----------------------------------------------------
// /advisory and /report draw one card for the schemes the backend priced
// (scheme_funding), made by components/SchemeFunding.jsx. What a response should put
// on it is worked out here from the response alone, so a card that drops a scheme, a
// case or a figure, or that appears for a response which priced nothing, is a
// finding. The card's headings are the schemes' own names, so cardProbe leaves it out
// (data-scheme-funding): read as a scheme card it would fail for having no fit label.
const MUDRA_BANDS_DRAWN = ['shishu', 'kishore', 'tarun', 'tarun_plus', 'above_limit']
const pricedSchemes = (result) => {
  const funding = result?.scheme_funding
  if (funding?.status !== 'ok') return []
  return (funding.schemes || []).filter((item) =>
    item.kind === 'subsidy' ? item.cases?.length > 0 : item.kind === 'loan_band' && MUDRA_BANDS_DRAWN.includes(item.band),
  )
}
// A whole rupee prints bare and an amount with paise prints both decimals, as the card does.
const fundingRupees = (value) =>
  '₹' + (Number.isInteger(value) ? value.toLocaleString('en-IN') : value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fundingFigures = (item) =>
  item.kind === 'subsidy'
    ? item.cases.flatMap((c) => [c.own_amount, c.bank_amount, c.subsidy_amount, c.net_loan_amount, ...(c.own_short_by > 0 ? [c.own_short_by] : [])])
    : [item.loan_amount, ...(item.band === 'above_limit' ? [item.band_limit] : [])]
// Runs in the page: the card's title, its text, and each scheme's block (name and text).
const fundingProbe = `(() => {
  const card = document.querySelector('[data-scheme-funding]')
  if (!card) return { found: false }
  return {
    found: true,
    title: card.querySelector('h2')?.textContent.trim() || '',
    text: card.innerText,
    articles: [...card.querySelectorAll('article')].map((a) => ({ name: a.querySelector('h3')?.textContent.trim() || '', text: a.innerText })),
  }
})()`

// --- the compliance card ----------------------------------------------------------
// /advisory and /report draw one card of the registrations to ask about
// (result.compliance), made by components/Compliance.jsx. What a response should put on
// it is worked out here from the response alone, with its own copy of the component's
// mapping, so a card that drops, reorders or mislabels a step, prints the sentence of
// another case or loses a source line is a finding. A step, need, kind, place, case or
// source this file has no wording for throws: a value the backend has added needs
// wording here first. Money prints as on the funding card (fundingRupees).
const COMPLIANCE_TITLES = { udyam: 'cl.udyam.title', local: 'cl.local.title', fssai: 'cl.fssai.title', gst: 'cl.gst.title' }
const COMPLIANCE_NEEDS = { free: 'cl.need.free', ask: 'cl.need.ask', usually: 'cl.need.usually', depends: 'cl.need.depends', not_needed: 'cl.need.notNeeded' }
const COMPLIANCE_SOURCES = { udyam_2026: 'cl.src.udyam', fssai_2017: 'cl.src.fssai', cbic_2019: 'cl.src.gst' }
const COMPLIANCE_PLACES = { panchayat: 'cl.local.panchayat', urban_body: 'cl.local.urban' }
const COMPLIANCE_KINDS = { registration: 'cl.fssai.register', licence: 'cl.fssai.licence' }
const COMPLIANCE_CASES = { within: 'cl.gst.within', above: 'cl.gst.above', between: 'cl.gst.between', farm_above: 'cl.gst.farmAbove' }
for (const map of [COMPLIANCE_TITLES, COMPLIANCE_NEEDS, COMPLIANCE_SOURCES, COMPLIANCE_PLACES, COMPLIANCE_KINDS, COMPLIANCE_CASES]) {
  for (const key of Object.values(map)) {
    if (typeof RESULT_STRINGS.en[key] !== 'string') throw new Error(`${key} is not defined in resultStrings.js en`)
  }
}
for (const key of ['cl.eyebrow', 'cl.title', 'cl.intro', 'cl.salesUsed', 'cl.caption', 'cl.udyam.what', 'cl.udyam.schemes', 'cl.local.title', 'cl.fssai.skip', 'cl.fssai.ifFood', 'cl.fssai.daily', 'cl.fssai.dairy', 'cl.gst.limits']) {
  if (typeof RESULT_STRINGS.en[key] !== 'string') throw new Error(`${key} is not defined in resultStrings.js en`)
}
const known = (map, value, what) => {
  if (!Object.hasOwn(map, value)) throw new Error(`compliance ${what} "${value}" has no wording in drive.mjs: add it to the COMPLIANCE_* maps`)
  return map[value]
}
// A page-side string, filled the way t() fills it: {name} replaced, nothing else touched.
const complianceSay = (lang, key, values = {}) => resultText(lang, key).replace(/\{(\w+)\}/g, (_, name) => String(values[name]))
// What each step should print: its title, its need badge, its sentences and then its source line.
const complianceSteps = (compliance, lang) => {
  const say = (key, values) => complianceSay(lang, key, values)
  return (compliance?.steps || []).map((step) => {
    const lines = []
    if (step.id === 'udyam') {
      lines.push(say('cl.udyam.what'))
      if (step.schemes_requiring > 0) lines.push(say('cl.udyam.schemes', { count: step.schemes_requiring }))
    } else if (step.id === 'local') {
      lines.push(say(known(COMPLIANCE_PLACES, step.place, 'place')))
    } else if (step.id === 'fssai') {
      if (step.need === 'not_needed') {
        lines.push(say('cl.fssai.skip'))
      } else {
        if (step.need === 'depends') lines.push(say('cl.fssai.ifFood'))
        if (step.kind) lines.push(say(known(COMPLIANCE_KINDS, step.kind, 'kind'), { limit: fundingRupees(step.sales_limit) }))
        lines.push(say('cl.fssai.daily', { food: step.food_per_day, milk: step.milk_per_day }))
        if (step.dairy_exemption === true) lines.push(say('cl.fssai.dairy'))
      }
    } else if (step.id === 'gst') {
      lines.push(say('cl.gst.limits', { state: step.state, goods: fundingRupees(step.goods_limit), services: fundingRupees(step.services_limit) }))
      lines.push(say(known(COMPLIANCE_CASES, step.case, 'case')))
    }
    if (step.source) lines.push(say(known(COMPLIANCE_SOURCES, step.source, 'source')))
    return { id: step.id, title: say(known(COMPLIANCE_TITLES, step.id, 'step')), need: say(known(COMPLIANCE_NEEDS, step.need, 'need')), lines }
  })
}
// The card's own paragraphs, in order. /advisory opens with an eyebrow that /report does not draw.
const complianceParagraphs = (compliance, lang, route) => [
  ...(route === '/advisory' ? [complianceSay(lang, 'cl.eyebrow')] : []),
  complianceSay(lang, 'cl.intro'),
  ...(Number.isFinite(compliance.yearly_sales) ? [complianceSay(lang, 'cl.salesUsed', { amount: fundingRupees(compliance.yearly_sales) })] : []),
  complianceSay(lang, 'cl.caption'),
]
// Runs in the page, with textContent so the eyebrow's capitals (CSS only) cannot differ from the dictionary.
const complianceProbe = `(() => {
  const card = document.querySelector('[data-compliance]')
  if (!card) return { found: false }
  const text = (el) => el?.textContent.trim() ?? ''
  return {
    found: true,
    title: text(card.querySelector('h2')),
    paragraphs: [...card.querySelectorAll(':scope > p')].map(text),
    steps: [...card.querySelectorAll('li[data-compliance-step]')].map((li) => ({
      id: li.getAttribute('data-compliance-step'),
      number: text(li.querySelector('.ui-formsection-num')),
      title: text(li.querySelector('h3')),
      need: text(li.querySelector('h3')?.nextElementSibling),
      lines: [...li.querySelectorAll(':scope > p')].map(text),
    })),
  }
})()`
const ALL_ROUTES =['/', '/login', '/profile', '/business', '/location', '/finance', ...RESULT_ROUTES, '/privacy', '/no-such-page']

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
    'fit_basis', 'wholesale_price_per_kg', 'registered_units', 'count_suppressed', 'egg_price',
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

// case, language, routes. 9 passes, 43 page loads: 12 + 4 + 4 + 4 + 4 + 1 + 8 + 4 + 2.
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
  // A result stored before the compliance and scheme funding cards existed.
  ['old', 'en', ['/advisory', '/report']],
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

        // The repayment schedule. Each loan's table on /report must equal the
        // response's own rows to the paisa, add up to the totals /advisory prints
        // for that loan, and end owing nothing; and /report must draw no schedule
        // when the response has none. A table that is not under its heading is
        // the selector gone stale, not a finding, so it throws.
        const loans = (RESULTS[caseName]?.financing_options?.options || []).filter((o) => o.schedule?.length)
        let scheduleChecked = 0
        if (route === '/advisory') {
          for (const loan of loans) {
            if (!text.includes(exactRupees(loan.total_repayment))) {
              problems.push(`LOAN TOTAL NOT TO THE PAISA: ${exactRupees(loan.total_repayment)} for ${loan.tenure_months} months`)
            }
          }
        }
        if (route === '/report' && RESULTS[caseName]) {
          const titled = text.toLowerCase().includes(resultText(lang, 'rp.scheduleTitle').toLowerCase())
          if (!loans.length && titled) problems.push('SCHEDULE SHOWN WITH NO ROWS')
          if (loans.length && !titled) problems.push('SCHEDULE MISSING from /report')
          for (const loan of titled ? loans : []) {
            const { menu, rows } = await cdp.evaluate(scheduleProbe(loan.tenure_months))
            if (!rows) throw new Error('/report: the schedule heading is on the page but no table sits under [aria-labelledby="schedule-for"]. Update scheduleProbe in drive.mjs to the markup.')
            scheduleChecked++
            const label = `${loan.tenure_months} months`
            if (loans.length > 1 && !menu) { problems.push('SCHEDULE MENU MISSING'); break }
            if (rows.length !== loan.schedule.length) { problems.push(`SCHEDULE ROWS: ${rows.length} shown for ${label}, the response has ${loan.schedule.length}`); continue }
            const bad = rows.findIndex((cells, i) => {
              const want = loan.schedule[i]
              return cells.length !== 5 || Number(cells[0]) !== want.month || toPaise(cells[1]) !== inPaise(want.payment) ||
                toPaise(cells[2]) !== inPaise(want.interest) || toPaise(cells[3]) !== inPaise(want.principal) || toPaise(cells[4]) !== inPaise(want.closing_balance)
            })
            if (bad >= 0) problems.push(`SCHEDULE ROW ${bad + 1} of ${label} shows ${JSON.stringify(rows[bad])}, the response has ${JSON.stringify(loan.schedule[bad])}`)
            const column = (n) => rows.reduce((sum, cells) => sum + toPaise(cells[n]), 0)
            if (column(1) !== inPaise(loan.total_repayment)) problems.push(`SCHEDULE PAYMENTS for ${label} add up to ${column(1)} paise, the card says ${inPaise(loan.total_repayment)}`)
            if (column(2) !== inPaise(loan.total_interest)) problems.push(`SCHEDULE INTEREST for ${label} adds up to ${column(2)} paise, the card says ${inPaise(loan.total_interest)}`)
            if (toPaise(rows[rows.length - 1][4]) !== 0) problems.push(`SCHEDULE for ${label} ends owing ${rows[rows.length - 1][4]}`)
          }
        }

        // The scheme funding card: drawn on /advisory and /report when the response
        // priced a scheme, with every scheme and every figure of every case, and not
        // drawn when it priced none.
        let fundingChecked = 0
        if ((route === '/advisory' || route === '/report') && RESULTS[caseName]) {
          const priced = pricedSchemes(RESULTS[caseName])
          const card = await cdp.evaluate(fundingProbe)
          if (!priced.length && card.found) problems.push('FUNDING CARD SHOWN WITH NOTHING PRICED')
          if (priced.length && !card.found) problems.push(`FUNDING CARD MISSING from ${route}`)
          if (priced.length && card.found) {
            if (card.title !== resultText(lang, 'fs.title')) problems.push(`FUNDING CARD TITLE: "${card.title}"`)
            if (!card.text.includes(resultText(lang, 'fs.caption'))) problems.push('FUNDING CARD HAS NO ESTIMATE CAPTION')
            if (card.articles.length !== priced.length) problems.push(`FUNDING CARD SCHEMES: ${card.articles.length} drawn, ${priced.length} priced`)
            for (const item of priced) {
              const name = (RESULTS[caseName].scheme_matches || []).find((s) => s.scheme_id === item.scheme_id)?.name
              const article = card.articles.find((a) => a.name === name)
              if (!article) { problems.push(`FUNDING CARD: no block for ${item.scheme_id}`); continue }
              for (const figure of fundingFigures(item)) {
                if (!article.text.includes(fundingRupees(figure))) problems.push(`FUNDING FIGURE MISSING for ${item.scheme_id}: ${fundingRupees(figure)}`)
              }
              fundingChecked++
            }
          }
        }

        // The compliance card: drawn on /advisory and /report when the response has steps,
        // with each step's number, title, badge, sentences and source line, in order, and
        // not drawn when it has none (a result stored before the card existed).
        let complianceChecked = 0
        if ((route === '/advisory' || route === '/report') && RESULTS[caseName]) {
          const compliance = RESULTS[caseName].compliance
          const steps = complianceSteps(compliance, lang)
          const card = await cdp.evaluate(complianceProbe)
          if (!steps.length && card.found) problems.push('COMPLIANCE CARD SHOWN WITH NOTHING TO DRAW')
          if (steps.length && !card.found) problems.push(`COMPLIANCE CARD MISSING from ${route}`)
          if (steps.length && card.found) {
            const title = complianceSay(lang, 'cl.title')
            if (card.title !== title) problems.push(`COMPLIANCE CARD TITLE: "${card.title}", wanted "${title}"`)
            const wantParagraphs = complianceParagraphs(compliance, lang, route)
            if (JSON.stringify(card.paragraphs) !== JSON.stringify(wantParagraphs)) {
              problems.push(`COMPLIANCE CARD TEXT: ${JSON.stringify(card.paragraphs)}, wanted ${JSON.stringify(wantParagraphs)}`)
            }
            for (let i = 0; i < Math.max(steps.length, card.steps.length); i++) {
              const want = steps[i] && JSON.stringify({ id: steps[i].id, number: String(i + 1), title: steps[i].title, need: steps[i].need, lines: steps[i].lines })
              const got = card.steps[i] && JSON.stringify(card.steps[i])
              if (got !== want) problems.push(`COMPLIANCE STEP ${i + 1}: ${got}, wanted ${want}`)
              else complianceChecked++
            }
          }
        }

        report.push({ tag, route, caseName, lang, rendered, chars: text.length, bars: barCount, unitCharts: unitCount, cardsChecked, scheduleChecked, fundingChecked, complianceChecked, detailsOpened, problems })
        if (problems.length) findings.push({ tag, problems })

        console.log(
          `${problems.length ? 'FAIL' : 'ok  '}  ${tag.padEnd(32)} ${String(text.length).padStart(5)}c ` +
            `bars=${String(barCount).padStart(2)} coins=${unitCount}` +
            (cardsChecked ? ` cards=${cardsChecked}` : '') +
            (scheduleChecked ? ` schedules=${scheduleChecked}` : '') +
            (fundingChecked ? ` funding=${fundingChecked}` : '') +
            (complianceChecked ? ` compliance=${complianceChecked}` : '') +
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

// The market-section gate. Same zero-dependency CDP plumbing as drive.mjs and
// mobile-audit.mjs, pointed at the one part of /analysis and /report that
// renders third-party open data: the mandi price cards, the Udyam count cards
// and the sources block under them.
//
// Why it seeds synthetic rows instead of the captured backend response: the real
// market_data.json holds whatever the last fetch found, and a real district
// rarely exercises every branch at once. The rows below are written to hit each
// one — a fractional price (26.9 must print as ₹26.90, never ₹26.9, which reads
// as a different price), a whole-rupee price that is stale, a list count with a
// share, a suppressed count carrying our-grouping note, a Ministry aggregate
// with no share, and a state-scope fallback with a share of the state's total.
// Two rows share one attribution, so the dedupe in the sources block is proven
// rather than assumed. Every row is also held to the fetch's own validateRow,
// so the fixture cannot drift into a shape the fetch would never write. The
// same rows load a second time with no market type ticked on /location: the
// where-you-sell line comes from the reader's own answers, not from the row, so
// it must name what was ticked in the first case and be absent in the second.
//
// Why the sources block gets its own checks: GODL-India makes the attribution
// mandatory, so it must print (never inside a <details>, which prints
// collapsed), it must appear once per page however many rows cite it, and it
// must stay plain text — the outbound government links were removed on
// 10 Sept 2026 and an <a> creeping back in is the regression to catch.
//
// It starts its own Vite on 5179 (strict, IPv4) unless --url= is given, and its
// own Edge on 9373. Both are killed by PID tree on every exit path. It never
// kills msedge or node by image name: other gates, and the reader's own
// browser, may be running.
//
//   node tools/verify/market-ui.mjs             40 loads, exit 1 on any finding
//   node tools/verify/market-ui.mjs --broken    one DOM defect per honesty check; exits 1
//                                               only if every defect is caught by its
//                                               own check, 2 if any is missed or there
//                                               is a real DICT-EN finding (see Exit)
//   node tools/verify/market-ui.mjs --url=http://localhost:5173   skip starting Vite
//
// Run from the repo root. Needs screenshots/verify/case_good.json, which
// refresh-cases.mjs writes.
//
// Exit 0: nothing found. 1: a finding (under --broken, every defect caught and
// no DICT-EN finding). 2: the run could not measure (the working directory is
// wrong, an input is missing or does not load, market-lib.mjs included,
// STORAGE_KEY or STORAGE_VERSION is not found in AppContext.jsx, port 5179 or
// 9373 is already held, Vite would not start, the --url= copy is down, a
// navigation failed (the server gone mid-run), Edge or its DevTools socket went
// away, a result page never rendered (NOT-RENDERED, even one that threw) or
// showed its empty state because the seed was not read (UNSEEDED), a refuter
// missed, the script crashed, or the run ended before its verdict), or, under
// --broken only, a real DICT-EN finding. No defect is planted in the dictionary
// check, so there a 1 would read as the pass and hide it. That one 2 is a
// finding, not a failure to measure: it prints as DICT-EN, not REFUTER FAILED,
// and report.json counts it in kinds, not in defects_missed. 130: stopped by a
// signal (SIGINT, SIGTERM, SIGHUP or SIGBREAK), after cleanup. report.json
// carries the same code as `exit`; a crash, a failed navigation, a lost Edge, a
// signal, or a run that never started leaves none.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9373
const VITE_PORT = 5179
const ARGS = process.argv.slice(2)
const BROKEN = ARGS.includes('--broken')
const URL_ARG = ARGS.find((a) => a.startsWith('--url='))
// 127.0.0.1, not localhost, because this script starts Vite with
// --host 127.0.0.1. Vite's default bind is [::1] only, which is why the other
// gates say localhost; here we chose the bind, so the IPv4 literal is right.
const APP = URL_ARG ? URL_ARG.slice('--url='.length).replace(/\/+$/, '') : `http://127.0.0.1:${VITE_PORT}`
const OUT = resolve('screenshots/verify/market-ui')
const PROFILE_DIR = resolve('screenshots/verify/market-ui/profile')
const CASE_FILE = resolve('screenshots/verify/case_good.json')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- every process this script starts, and how it dies ----------------------
// By PID tree and nothing else. taskkill /T takes the renderer and GPU children
// with the Edge browser process, and whatever Vite spawned with Vite. A process
// that has already exited is skipped, because its PID may since belong to
// something unrelated.
//
// Edge needs a second arm. The msedge.exe we spawn relaunches itself through a
// compatibility layer and exits within a second, leaving the real browser
// parented to a dead PID — measured on the first run of this script, which
// leaked a 15-process Edge on 9373 because the only PID it held had gone.
// --edge-skip-compat-layer-relaunch (the flag the relaunch adds to itself) stops
// that at the source; the command-line match is the fallback if a future Edge
// relaunches some other way. It finds the msedge.exe carrying OUR profile path
// and no --type= (every renderer, GPU and utility child carries --type=). It
// matches the bare path, because the relaunched command line re-quotes it as
// --user-data-dir="D:\...", so a match on the flag as we wrote it finds nothing
// — the second run leaked for exactly that reason. The path is unique to this
// script, so the match cannot reach anyone else's Edge.
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
    "$_.CommandLine.Contains($env:MARKET_UI_PROFILE) -and -not $_.CommandLine.Contains('--type=') } | " +
    'ForEach-Object { $_.ProcessId }'
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, MARKET_UI_PROFILE: PROFILE_DIR },
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

// 0 means the run measured and found nothing, 1 a finding (under --broken,
// every defect caught), and 2 that the run could not measure (or, under
// --broken, a real DICT-EN finding: see the header). Node's own exit on
// an uncaught error is 1, which reads as a finding and under --broken as the
// pass, so anything thrown or rejected that nothing catches exits 2 instead. The
// three imports below are the likeliest, if a file they load is gone or no
// longer parses. process.exit runs cleanup() through the 'exit' listener above.
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
// A run that ends without reaching its verdict exits 2; the verdict overrides
// this. Before it, a CDP socket that closed under a pending send left the send
// unsettled, the event loop drained, and node exited 0 with no report.
process.exitCode = 2
// Every path in this file resolves against the working directory.
if (!existsSync(resolve('tools/verify/market-ui.mjs'))) {
  console.error(`market-ui: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/market-ui.mjs`)
  process.exit(2)
}
// A report.json on disk is always from a run that finished. The last run's
// goes once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, 'report.json'), { force: true })

// --- inputs, all read before anything is started ----------------------------
// The fetch's own row checks, imported here rather than at the top. A static
// import links before any line of this file runs, so a syntax error or a
// renamed export in market-lib.mjs ended the run with node's own 1 (a finding,
// and under --broken the pass) and left the last run's report standing. Here
// either one reaches the handler above and exits 2.
const { rowIdentity, validateRow } = await import('../market-lib.mjs')
if (typeof rowIdentity !== 'function' || typeof validateRow !== 'function') {
  throw new Error('tools/market-lib.mjs no longer exports rowIdentity and validateRow')
}
if (!existsSync(CASE_FILE)) {
  console.error('market-ui: screenshots/verify/case_good.json is missing.')
  console.error('Run `node tools/verify/refresh-cases.mjs` with the backend up, then re-run this.')
  // A missing input is not a finding, and under --broken 1 is the pass.
  process.exit(2)
}
const CASE_GOOD = JSON.parse(readFileSync(CASE_FILE, 'utf8'))

// Read, not hardcoded: a payload whose v does not match is discarded by
// AppContext, so a bumped version would silently seed nothing and every result
// page would fall to its empty state.
const APP_CONTEXT = readFileSync(resolve('frontend/src/context/AppContext.jsx'), 'utf8')
const versionMatch = /const STORAGE_VERSION = (\d+)/.exec(APP_CONTEXT)
if (!versionMatch) {
  console.error('market-ui: could not find STORAGE_VERSION in frontend/src/context/AppContext.jsx')
  process.exit(2)
}
const STORAGE_VERSION = Number(versionMatch[1])
// The key too, for the same reason: a seed written under a key the app no
// longer reads is never seen, and the SEEDED read-back below, under the old key,
// would still find it and pass. Only a plain string literal is taken: a key
// built from an expression would parse as a piece of itself, so it is refused.
const keyMatch = /const STORAGE_KEY = (['"])([^'"\n]+)\1;?[ \t]*(?:\/\/.*)?\r?$/m.exec(APP_CONTEXT)
if (!keyMatch) {
  console.error('market-ui: could not find STORAGE_KEY in frontend/src/context/AppContext.jsx')
  process.exit(2)
}
const STORAGE_KEY = keyMatch[2]

const { APP_NAME } = await import(pathToFileURL(resolve('frontend/src/i18n/brand.js')).href)

// The real merged table, not a copy of it. strings.js imports its three
// siblings without an extension, which Vite resolves and Node does not, so the
// specifiers are rewritten to absolute file URLs and the module is loaded from
// a data: URL. The merge order, and so which file wins a key, is the app's own.
const I18N = resolve('frontend/src/i18n')
const stringsSource = readFileSync(resolve(I18N, 'strings.js'), 'utf8').replace(
  /from '\.\/(resultStrings|backendStrings|schemeStrings)'/g,
  (_, name) => `from '${pathToFileURL(resolve(I18N, name + '.js')).href}'`,
)
const { STRINGS } = await import('data:text/javascript;base64,' + Buffer.from(stringsSource).toString('base64'))

// Same contract as t() and tBackend() in LanguageContext.jsx: the language,
// then English, then the key itself; a backend code falls back to the English
// sentence the row carries, never to the dotted code.
const lookup = (lang, key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key
const fill = (template, values) =>
  Object.keys(values || {}).reduce((text, name) => text.split(`{${name}}`).join(String(values[name])), template)
const T = (lang, key, values) => fill(lookup(lang, key), values)
const TB = (lang, code, english) => {
  if (!code) return english ?? ''
  const found = lookup(lang, code)
  return found === code ? english ?? code : found
}

// A <p> whose whole text fits a template, placeholders matching anything. Used
// for the "must NOT appear" checks, where there are no values to resolve with
// and a fragment test would trip over a neighbouring sentence in another script.
const templateRegex = (template) =>
  new RegExp('^' + template.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]+?') + '$')

const count = (haystack, needle) => (needle ? haystack.split(needle).length - 1 : 0)
const money = (value) => {
  const abs = Math.abs(value)
  const digits = Number.isInteger(abs)
    ? abs.toLocaleString('en-IN')
    : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (value < 0 ? '-₹' : '₹') + digits
}
const ymd = (value) => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1')
// A rupee figure standing alone: not followed by another digit, a grouping
// comma or a decimal part. So ₹26 is not found inside ₹26.90, and a figure at
// the end of a sentence ("₹31.") still counts.
const figureRegex = (text) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\d,]|\\.\\d)')

// --- the synthetic rows -----------------------------------------------------
// The two mapping files the fetch reads. The rows below take their NIC classes
// and versions from them rather than from a copy.
const COMMODITIES = JSON.parse(readFileSync('tools/market-commodities.json', 'utf8'))
const NIC_MAP = JSON.parse(readFileSync('tools/market-nic-map.json', 'utf8'))
const nicClasses = (category) => NIC_MAP.categories[category].include.map(String)

// The English the backend puts in `source` and `note`, from section 7 of the
// spec. Held here rather than read from the dictionary, so a drifted `en` value
// is caught below instead of being copied into the expectation.
const SOURCE_EN = {
  'src.agmarknetMandi': 'Daily mandi prices reported to Agmarknet, published on data.gov.in',
  'src.udyamList': 'Udyam registrations, published on data.gov.in',
  'src.udyamAggregate': "The Ministry of MSME's district counts of Udyam registrations, published on data.gov.in",
}
const NOTE_EN = {
  'mknote.ourGrouping': 'We chose which kinds of registered work to count in this figure.',
  'mknote.ministryServices': "This is the Ministry's own count of registered service businesses. It may include shops and traders.",
  'mknote.ministryManufacturing': "This is the Ministry's own count of registered manufacturing businesses. It counts each business once, by its main kind of work.",
}
// The keys a correct page must reach for. Written out rather than read from
// COMMODITY_KEYS / CHOICE_KEYS, so a map entry pointing at the wrong key fails
// here instead of defining its own expectation.
const COMMODITY_KEY = { wheat: 'cmd.wheat', potato: 'cmd.potato' }
const CATEGORY_KEY = { tailoring: 'cat.tailoring', handicrafts: 'cat.handicrafts', services: 'cat.services', 'food processing': 'cat.food' }

const GODL = 'Published under Government Open Data License - India: https://www.data.gov.in/Godl.'
const agmarknet = (ddmm) =>
  `Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection), 2026, Variety-wise Daily Market Prices Data of Commodity, Open Government Data Platform India, ${ddmm}, https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity. ${GODL}`
const udyamList = (ddmm) =>
  `Ministry of Micro, Small and Medium Enterprises, 2026, List of MSME Registered Units under UDYAM, Open Government Data Platform India, ${ddmm}, https://www.data.gov.in/resource/list-msme-registered-units-under-udyam. ${GODL}`
const udyamServices = (ddmm) =>
  `Ministry of Micro, Small and Medium Enterprises, 2026, District-wise Services MSME Registered Enterprises under Udyam Registration till last date, Open Government Data Platform India, ${ddmm}, https://www.data.gov.in/resource/district-wise-services-msme-registered-enterprises-under-udyam-registration-till-last-date. ${GODL}`

// Full provenance on every row, shaped as section 2 of the spec lays it out.
// Nothing in it is personal: no unit names, addresses or PIN codes, no API key.
// `nic` is the NIC map version on a list row and null everywhere else, and a
// price row's window ends on its own last_reported, as the fetch writes them.
const provenance = ({ id, title, page, query, attribution, price, nic = null, periodStart = null, periodEnd = '2026-09-22' }) => ({
  resource_id: id,
  resource_title: title,
  publisher: price ? 'Ministry of Agriculture and Farmers Welfare' : 'Ministry of Micro, Small and Medium Enterprises',
  resource_updated_date: { before: '2026-09-22T18:10:00Z', after: '2026-09-22T18:10:00Z' },
  page_url: page,
  query,
  total_reported: 998,
  rows_fetched: 998,
  rows_used: price ? 22 : 998,
  rows_dropped: price
    ? { zero: 0, nonnumeric: 0, out_of_range: 0, out_of_band: 0, dupes: 0, wrong_place: 0 }
    : { unparseable: 0, wrong_place: 0 },
  fetched_at: '2026-09-23T09:30:00+05:30',
  period_start: periodStart,
  period_end: periodEnd,
  method: price
    ? 'Median of the daily modal prices over the market days in the window, per kg.'
    : 'Count of registered units whose listed activities fall in the chosen NIC classes.',
  nic_map_version: nic,
  crosswalk_version: 1,
  script_sha256: '0000000000000000000000000000000000000000000000000000000000000000',
  licence: 'Government Open Data License - India',
  licence_url: 'https://www.data.gov.in/Godl',
  attribution,
})

// No local_context: the service stopped echoing the village, market type and
// customers back (the UI no longer sends them), and MarketCard reads the market
// type from the reader's own answers. A card that still read the row would lose
// its where-you-sell line here, and WHERE-SELL reports it.
const common = (over) => ({
  state: 'Uttar Pradesh', district: 'Lucknow', scope: 'district', match_level: 'district',
  last_verified: '2026-09-23', ...over,
})
const AGMARK_PROV = { id: '35985678-0d79-46b4-9ed6-6f13308a1d24', title: 'Variety-wise Daily Market Prices Data of Commodity', page: 'https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity', price: true }
const UDYAM_PROV = { id: '8b68ae56-84cf-4728-a0a6-1be11028dea7', title: 'List of MSME Registered Units under UDYAM', page: 'https://www.data.gov.in/resource/list-msme-registered-units-under-udyam' }

const ROWS = [
  // Fractional: 26.9 must render as ₹26.90.
  common({
    business_category: 'agriculture', metric: 'wholesale_price_per_kg',
    commodity: 'Wheat', commodity_id: 'wheat', unit: 'kg',
    indicative_price: 26.9, price_low: 24.5, price_high: 29.75, n_days: 22, n_markets: 3, last_reported: '2026-09-20',
    source_code: 'src.agmarknetMandi', source: SOURCE_EN['src.agmarknetMandi'],
    provenance: provenance({ ...AGMARK_PROV, query: 'filters[State]=Uttar Pradesh&filters[District]=Lucknow&filters[Commodity]=Wheat', attribution: agmarknet('23/09'), periodStart: '2026-08-24', periodEnd: '2026-09-20' }),
  }),
  // Whole rupees, and stale. Shares its attribution with the wheat row, so the
  // sources block must print that sentence once, not twice.
  common({
    business_category: 'agriculture', metric: 'wholesale_price_per_kg',
    commodity: 'Potato', commodity_id: 'potato', unit: 'kg',
    indicative_price: 26, price_low: 22, price_high: 31, n_days: 9, n_markets: 1, last_reported: '2026-09-10', stale: true,
    source_code: 'src.agmarknetMandi', source: SOURCE_EN['src.agmarknetMandi'],
    provenance: provenance({ ...AGMARK_PROV, query: 'filters[State]=Uttar Pradesh&filters[District]=Lucknow&filters[Commodity]=Potato', attribution: agmarknet('23/09'), periodStart: '2026-08-24', periodEnd: '2026-09-10' }),
  }),
  // The per-unit list: a share and the multi-count caveat. The NIC map gives
  // tailoring one class and no note.
  common({
    business_category: 'tailoring', metric: 'registered_units',
    count: 1234, count_suppressed: false, share_percent: 4.5, district_total: 27421, nic_classes: nicClasses('tailoring'),
    source_code: 'src.udyamList', source: SOURCE_EN['src.udyamList'],
    provenance: provenance({ ...UDYAM_PROV, query: 'filters[LG_DT_Code]=162', attribution: udyamList('23/09'), nic: NIC_MAP.version }),
  }),
  // Suppressed: under 10 units is withheld, so no count and no share. The NIC
  // map's handicrafts grouping is ours, so the row carries that note.
  common({
    business_category: 'handicrafts', metric: 'registered_units',
    count: null, count_suppressed: true, share_percent: null, district_total: 27421, nic_classes: nicClasses('handicrafts'),
    source_code: 'src.udyamList', source: SOURCE_EN['src.udyamList'],
    note_code: 'mknote.ourGrouping', note: NOTE_EN['mknote.ourGrouping'],
    provenance: provenance({ ...UDYAM_PROV, query: 'filters[LG_DT_Code]=162', attribution: udyamList('22/09'), nic: NIC_MAP.version }),
  }),
  // The Ministry's own aggregate: no share, no multi-count caveat, its own note.
  common({
    business_category: 'services', metric: 'registered_units',
    count: 5678, count_suppressed: false, share_percent: null, district_total: null, nic_classes: [],
    source_code: 'src.udyamAggregate', source: SOURCE_EN['src.udyamAggregate'],
    note_code: 'mknote.ministryServices', note: NOTE_EN['mknote.ministryServices'],
    provenance: provenance({
      id: 'c3dfe7e6-0cfd-4ddb-8f79-9cb3695d9866',
      title: 'District-wise Services MSME Registered Enterprises under Udyam Registration till last date',
      page: 'https://www.data.gov.in/resource/district-wise-services-msme-registered-enterprises-under-udyam-registration-till-last-date',
      query: 'filters[lg_dt_code]=162', attribution: udyamServices('23/09'),
    }),
  }),
  // A state fallback: district "" by design, so the heading, the count and the
  // share sentences must name the state, and the provenance must say so. The
  // fetch sums the state's districts, so the share is of the state's total.
  common({
    district: '', scope: 'state', match_level: 'state',
    business_category: 'food processing', metric: 'registered_units',
    count: 43210, count_suppressed: false, share_percent: 3.5, district_total: 1234567, nic_classes: nicClasses('food processing'),
    source_code: 'src.udyamList', source: SOURCE_EN['src.udyamList'],
    provenance: provenance({ ...UDYAM_PROV, query: 'filters[State]=UTTAR PRADESH', attribution: udyamList('21/09'), nic: NIC_MAP.version, periodEnd: '2026-09-22' }),
  }),
]

// The fixture is held to the fetch's own validator, so a row shape the fetch
// could never write cannot pass here and then fail on real data. match_level
// is added by the service, not stored in the file.
{
  const problems = []
  for (const row of ROWS) {
    const { match_level: _level, ...stored } = row
    for (const e of validateRow(stored, { commodities: COMMODITIES.commodities, nicMap: NIC_MAP })) problems.push(`${rowIdentity(stored)}: ${e}`)
  }
  if (problems.length) {
    console.error('market-ui: the synthetic rows fail validateRow:\n  ' + problems.join('\n  '))
    process.exit(2)
  }
}

// The form answers drive.mjs seeds with its good case. The result is the real
// captured response with only the market section replaced.
const FORM = {
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
// nomarket: the same rows, but the reader ticked no market type on /location.
// The where-you-sell line must then be absent from every card, not printed
// with an empty value.
const CASES = {
  rows: { ...FORM, result: { ...CASE_GOOD, market_context: ROWS } },
  empty: { ...FORM, result: { ...CASE_GOOD, market_context: [] } },
  nomarket: { ...FORM, location: { ...FORM.location, marketType: [] }, result: { ...CASE_GOOD, market_context: ROWS } },
}

// What the where-you-sell line must read on /analysis in the rows case: the
// label of each market type ticked on /location, in the page's language,
// joined the way choiceListText in AnalysisPage.jsx joins them. The keys
// mirror its CHOICE_KEYS.
const MARKET_KEYS = { village: 'market.village', weekly: 'market.weekly', town: 'market.town', online: 'market.online' }
const marketPlaces = (lang) => FORM.location.marketType.map((value) => T(lang, MARKET_KEYS[value])).join(', ')

const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']
const ROUTES = ['/analysis', '/report']
const VIEWPORTS = {
  desktop: { name: '1280', width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
  // mobile: true is what makes the viewport meta tag apply; without it this
  // would be a desktop measurement in a narrow window.
  phone: { name: '360', width: 360, height: 740, deviceScaleFactor: 2, mobile: true },
}
// case, viewport, languages. 8 × 2 × 2 routes = 32 loads with rows, then the
// empty market section in two scripts on both routes = 4 more, then the rows
// with no market type ticked, the same way = 4 more. 40 loads.
const PASSES = [
  ['rows', VIEWPORTS.desktop, LANGS],
  ['rows', VIEWPORTS.phone, LANGS],
  ['empty', VIEWPORTS.desktop, ['en', 'hi']],
  ['nomarket', VIEWPORTS.desktop, ['en', 'hi']],
]

// Same prefix set as drive.mjs, cmd|mknote|src and the notice prefixes included. A t() key that exists
// in no dictionary prints as itself, so a leaked key is found verbatim.
const RAW_KEY = /\b(?:common|nav|res|st|risk|f|an|ch|mk|sc|sch|ad|rp|login|nf|landing|profile|business|location|finance|money|cat|market|area|greeting|cmd|mknote|src|privacy|notice|consent|errf|form)\.[a-zA-Z_][a-zA-Z0-9_]*/g
const BAD_TOKENS = ['null%', 'NaN', 'undefined', '[object Object]', 'Infinity', '₹null', '₹NaN', '₹undefined']
const RAW_ENUMS = ['wholesale_price_per_kg', 'registered_units', 'count_suppressed', 'match_level', 'src.', 'mknote.', 'cmd.']

// --- what each row must print, in one language ------------------------------
function expectRow(row, lang) {
  const isPrice = row.metric === 'wholesale_price_per_kg'
  const place = row.scope === 'state' ? row.state : row.district
  const name = isPrice ? T(lang, COMMODITY_KEY[row.commodity_id]) : T(lang, CATEGORY_KEY[row.business_category])
  const source = TB(lang, row.source_code, row.source)
  const e = {
    row,
    heading: `${name} · ${place}`,
    provenance: row.match_level === 'district' ? T(lang, 'mk.fromDistrict', { district: row.district }) : T(lang, 'mk.fromState', { state: row.state }),
    source: T(lang, 'mk.source', { source }),
    checked: T(lang, 'mk.checked', { date: ymd(row.last_verified) }),
  }
  if (isPrice) {
    e.price = money(row.indicative_price)
    e.low = money(row.price_low)
    e.high = money(row.price_high)
    e.priceWindow = T(lang, 'mk.priceWindow', { n: row.n_days.toLocaleString('en-IN'), date: ymd(row.last_reported), low: e.low, high: e.high })
    e.priceMarkets = T(lang, 'mk.priceMarkets', { markets: row.n_markets.toLocaleString('en-IN') })
  } else {
    e.countLine = row.count_suppressed
      ? T(lang, 'mk.countSuppressed', { district: place })
      : T(lang, 'mk.count', { count: row.count.toLocaleString('en-IN'), district: place })
    if (row.share_percent !== null) {
      e.share = T(lang, 'mk.countShare', {
        share: row.share_percent.toLocaleString('en-IN', { maximumFractionDigits: 1 }),
        total: row.district_total.toLocaleString('en-IN'),
        district: place,
      })
    }
    if (row.note_code) e.note = TB(lang, row.note_code, row.note)
  }
  return e
}

// --- minimal CDP client, session-aware (as drive.mjs) -----------------------
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

    // Edge gone: every call still waiting for its reply fails now. Nothing else
    // would ever settle it.
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
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
}

// No early exit when the spawned process dies: that is the relaunch described
// at the top, not a failure. The endpoint answering is the only signal.
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

// Whether something already listens where our Vite would bind. --strictPort
// makes Vite exit on a taken port, but the readiness loop below can reach the
// other listener first: one that answered would pass for our Vite and the run
// would measure somebody else's app, and one that never answered held the run
// for undici's five-minute header timeout before Vite's exit was seen.
function portInUse(port) {
  return new Promise((done) => {
    const probe = createServer()
    probe.once('error', (err) => done(err.code || err.message))
    probe.once('listening', () => probe.close(() => done(null)))
    probe.listen({ port, host: '127.0.0.1', exclusive: true })
  })
}

async function startVite() {
  const held = await portInUse(VITE_PORT)
  if (held) throw new Error(`port ${VITE_PORT} is already in use (${held}); free it, or pass --url= to audit a copy that is already running`)
  const logFd = openSync(`${OUT}/vite.log`, 'w')
  // Node straight at Vite's own bin, not `npm run dev` through a shell, so the
  // PID we hold is Vite's and not a cmd.exe wrapped around it.
  const vite = spawn(process.execPath, [
    resolve('frontend/node_modules/vite/bin/vite.js'),
    '--port', String(VITE_PORT), '--strictPort', '--host', '127.0.0.1',
  ], { cwd: resolve('frontend'), stdio: ['ignore', logFd, logFd] })
  children.push(vite)
  closeSync(logFd)

  for (let i = 0; i < 120; i++) {
    // --strictPort makes a taken port an exit rather than a silent move to 5180.
    if (vite.exitCode !== null) {
      throw new Error(`Vite exited with ${vite.exitCode}; see ${OUT}/vite.log (is port ${VITE_PORT} taken?)`)
    }
    try {
      const res = await fetch(APP + '/', { signal: AbortSignal.timeout(2000) })
      if (res.ok) return
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error(`Vite never answered on ${APP}`)
}

// Wait until React has painted into the main landmark. A bare readyState check
// passes on an empty shell.
async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    // A page mid-navigation can refuse an evaluate, which only means not yet. A
    // closed socket means Edge is gone, and polling on would hide that.
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`)
      .catch((err) => { if (cdp.closed) throw err; return 0 })
    if (len > 40) return true
    await sleep(200)
  }
  return false
}

// A navigation that failed (the server gone mid-run, say) commits Edge's own
// error page, and every check run on it would read as a finding about the app.
// It ends the run instead, through main()'s catch, as a fault.
async function navigate(cdp, url) {
  const { errorText } = await cdp.send('Page.navigate', { url })
  if (errorText) throw new Error(`${url} did not load (${errorText}); is the app still being served?`)
}

// Whether the result page is showing the seeded result. AppContext writes its
// state back under the same key once it has mounted, so a seed it discarded (a
// version it no longer reads, say) reads back with no result, and the page is
// the empty state: a page with no market section, which measures as findings
// about the app rather than as a run that never saw it.
const SEEDED = `(() => {
  try { return !!JSON.parse(sessionStorage.getItem(${JSON.stringify(STORAGE_KEY)})).data.result } catch { return false }
})()`

// Runs in the page, after every <details> is open: innerText skips the body of
// a closed one, so anything inside a disclosure would otherwise be invisible.
// Finds each card by its exact heading and the sources block by its heading,
// and returns text plus the few DOM facts that text cannot show.
const probe = (want) => `(() => {
  document.querySelectorAll('details').forEach((d) => { d.open = true })
  const want = ${JSON.stringify(want)}
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim()
  const heads = [...document.querySelectorAll('h3')]
  const cards = want.headings.map((heading) => {
    const matches = heads.filter((el) => norm(el.textContent) === heading)
    const card = matches[0] && matches[0].closest('div.rounded-2xl.border, .ui-card-soft')
    if (!card) return { found: false, matches: matches.length }
    return { found: true, matches: matches.length, text: card.innerText, paras: [...card.querySelectorAll('p')].map((p) => norm(p.textContent)) }
  })
  const sourceHeads = heads.filter((el) => norm(el.textContent) === want.sourcesHeading)
  const block = sourceHeads[0] && sourceHeads[0].parentElement
  const sources = block ? {
    headings: sourceHeads.length,
    text: block.innerText,
    links: block.querySelectorAll('a').length,
    inDetails: !!block.closest('details'),
    paras: [...block.querySelectorAll('p')].map((p) => ({ text: norm(p.textContent), lang: p.getAttribute('lang') })),
  } : null
  const doc = document.documentElement
  // "The page is 67px too wide" is useless without what did it, so an overflow
  // names its widest offenders, and whether each sits in the market section.
  // Same exclusions as mobile-audit.mjs: scrolled-out content inside a scroller,
  // and a skip link parked off the left edge.
  const vw = doc.clientWidth
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    return false
  }
  const marketCards = cards.length ? heads.filter((el) => want.headings.includes(norm(el.textContent))) : []
  const marketRoot = marketCards[0] && marketCards[0].closest('section, .ui-card')
  const offenders = []
  if (doc.scrollWidth > vw) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || r.right <= vw + 1 || r.right <= 0 || inScroller(el)) continue
      const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''
      offenders.push({
        el: el.tagName.toLowerCase() + cls + ' "' + norm(el.innerText).slice(0, 50) + '"',
        right: Math.round(r.right),
        inMarket: !!(marketRoot && marketRoot.contains(el)),
        leaf: !el.firstElementChild,
      })
    }
    offenders.sort((a, b) => (b.leaf - a.leaf) || (b.right - a.right))
  }
  return {
    text: document.body.innerText,
    cards,
    sources,
    scrollWidth: doc.scrollWidth,
    clientWidth: vw,
    offenders: offenders.slice(0, 4),
    h3s: heads.map((el) => norm(el.textContent)).slice(0, 40),
  }
})()`

// --broken only. Puts one defect per honesty check back by hand, after load,
// each tagged with the finding kind that must report it and, for a per-card
// check, the heading of the card it was applied to. The main loop requires
// every applied defect to be reported by its own kind on that same load, so a
// check that has gone inert fails the refuter instead of hiding behind the
// others. A defect whose target was not on the page is reported NOT-APPLIED,
// never counted as caught. Each defect targets a different card or element, so
// no two can mask each other.
const breakPage = (want) => `(() => {
  const want = ${JSON.stringify(want)}
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim()
  const done = []
  const mark = (name, kind, ok, who) => done.push({ name, kind, who: who || null, applied: !!ok })
  const heads = [...document.querySelectorAll('h3')]
  const cardOf = (heading) => {
    const h = heads.find((el) => norm(el.textContent) === heading)
    return h ? h.closest('div.rounded-2xl.border, .ui-card-soft') : null
  }
  // React renders each {expression} as its own text node, so a t() sentence is
  // never split across two and can be replaced inside one.
  const swapText = (root, from, to) => {
    if (!root || !from) return false
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.includes(from)) { node.nodeValue = node.nodeValue.split(from).join(to); return true }
    }
    return false
  }
  const paraIn = (root, text) => (root ? [...root.querySelectorAll('p')].find((p) => norm(p.textContent) === text) : null)
  const addPara = (root, text) => {
    if (!root) return false
    const p = document.createElement('p')
    p.textContent = text
    root.appendChild(p)
    return true
  }
  const removeEl = (el) => { if (el) el.remove(); return !!el }

  if (want.caseName === 'empty') {
    const main = document.querySelector('#main')
    if (main) {
      const h = document.createElement('h3')
      h.textContent = want.sourcesHeading
      main.appendChild(h)
    }
    mark('sources heading on an empty section', 'SOURCES-ON-EMPTY', main)
    const empty = [...document.querySelectorAll('#main p')].find((el) => norm(el.textContent) === want.noData)
    mark('empty-state sentence removed', 'NO-DATA', removeEl(empty))
    return done
  }

  const c = want.cards
  const wheat = cardOf(c.wheat.heading)
  const potato = cardOf(c.potato.heading)
  const tailoring = cardOf(c.tailoring.heading)
  const handicrafts = cardOf(c.handicrafts.heading)
  const services = cardOf(c.services.heading)
  const state = cardOf(c.state.heading)

  mark('district row labelled as a state fallback', 'PROVENANCE', swapText(wheat, c.wheat.provenance, c.wheat.wrongProvenance), c.wheat.heading)
  mark('stale warning removed', 'STALE', removeEl(paraIn(potato, want.stale)), c.potato.heading)
  mark('count printed on a suppressed row', 'SUPPRESSED', addPara(handicrafts, c.handicrafts.leakedCount), c.handicrafts.heading)
  mark('share printed on the Ministry aggregate', 'SHARE', addPara(services, c.services.inventedShare), c.services.heading)
  mark('source removed', 'SOURCE', swapText(services, c.services.source, ''), c.services.heading)
  mark('multi-count caveat removed from a list row', 'MULTI', removeEl(paraIn(tailoring, want.multi)), c.tailoring.heading)
  mark("another row's note printed here", 'NOTE', addPara(state, c.state.borrowedNote), c.state.heading)
  mark('checked date removed', 'CHECKED', swapText(state, c.state.checked, ''), c.state.heading)
  // On the wheat card, which only PROVENANCE also targets, with a different
  // sentence. With no market type ticked the line is planted; with some ticked,
  // /analysis loses what they were. /report never shows the line, so the rows
  // case has nothing to break there.
  if (want.caseName === 'nomarket') {
    mark('where-you-sell shown with no market type', 'WHERE-SELL', addPara(wheat, want.whereSell), c.wheat.heading)
  } else if (want.route === '/analysis') {
    mark('market types dropped from where-you-sell', 'WHERE-SELL', swapText(wheat, want.places, ''), c.wheat.heading)
  }

  let truncated = false
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.includes('₹26.90')) { node.nodeValue = node.nodeValue.split('₹26.90').join('₹26.9'); truncated = true }
  }
  mark('fractional price loses its trailing zero', 'PRICE-TRUNCATED', truncated)

  const head = heads.find((el) => norm(el.textContent) === want.sourcesHeading)
  const block = head ? head.parentElement : null
  if (block) {
    const a = document.createElement('a')
    a.href = 'https://example.invalid/'
    a.textContent = 'Open the dataset'
    block.appendChild(a)
  }
  mark('link inside the sources block', 'SOURCES-LINK', block)
  mark('warranty line removed', 'WARRANTY', removeEl(paraIn(block, want.warranty)))
  mark('non-endorsement line removed', 'NOT-ENDORSED', removeEl(paraIn(block, want.notEndorsed)))
  const first = paraIn(block, want.attributions[0])
  if (first) first.after(first.cloneNode(true))
  mark('attribution printed twice', 'ATTRIBUTION', first)
  const second = paraIn(block, want.attributions[1])
  if (second) second.setAttribute('lang', 'hi')
  mark('English attribution marked as Hindi', 'ATTRIBUTION-LANG', second)
  return done
})()`

// The exact sentences breakPage plants or removes, in the page's language. Each
// planted sentence is one the page must never show on that card: the state
// wording on a district row, a filled count on a suppressed row, a share on the
// Ministry aggregate, and the handicrafts note on a card that has none.
function brokenTargets(caseName, lang, sourcesHeading) {
  const want = {
    caseName,
    sourcesHeading,
    noData: T(lang, 'mk.noData'),
    stale: T(lang, 'mk.stale'),
    multi: T(lang, 'mk.countMulti'),
    warranty: T(lang, 'mk.warranty'),
    notEndorsed: T(lang, 'mk.notEndorsed', { app: APP_NAME }),
    whereSell: T(lang, 'mk.whereSell'),
    places: marketPlaces(lang),
    attributions: [...new Set(ROWS.map((r) => r.provenance.attribution))],
  }
  if (caseName === 'empty') return want
  const e = (pick) => expectRow(ROWS.find(pick), lang)
  const wheat = e((r) => r.commodity_id === 'wheat')
  const potato = e((r) => r.commodity_id === 'potato')
  const tailoring = e((r) => r.business_category === 'tailoring')
  const handicrafts = e((r) => r.business_category === 'handicrafts')
  const services = e((r) => r.business_category === 'services')
  const state = e((r) => r.scope === 'state')
  if (want.attributions.length < 2) throw new Error('--broken needs two distinct attributions for the ATTRIBUTION-LANG defect')
  if (!handicrafts.note || state.note || potato.row.stale !== true) throw new Error('--broken needs a noted handicrafts row, an unnoted state row and a stale potato row')
  want.cards = {
    wheat: { heading: wheat.heading, provenance: wheat.provenance, wrongProvenance: T(lang, 'mk.fromState', { state: wheat.row.state }) },
    potato: { heading: potato.heading },
    tailoring: { heading: tailoring.heading },
    handicrafts: { heading: handicrafts.heading, leakedCount: T(lang, 'mk.count', { count: '7', district: handicrafts.row.district }) },
    services: {
      heading: services.heading,
      source: services.source,
      inventedShare: T(lang, 'mk.countShare', { share: '12.5', total: '45,424', district: services.row.district }),
    },
    state: { heading: state.heading, checked: state.checked, borrowedNote: handicrafts.note },
  }
  return want
}

// --- the checks, on one load ------------------------------------------------
function checkLoad({ caseName, lang, vp, route, pageErrors, got }) {
  const found = []
  const add = (kind, detail) => found.push({ kind, detail })
  const text = got.text || ''

  // A page that never rendered, or showed its empty state, does not get here:
  // main() records it as a fault. One that rendered and threw is a finding.
  if (pageErrors.length) add('PAGE-EXCEPTION', pageErrors[0].split('\n')[0])

  const leaked = [...new Set(text.match(RAW_KEY) || [])]
  if (leaked.length) add('LEAKED-KEY', leaked.join(', '))
  for (const bad of BAD_TOKENS) if (text.includes(bad)) add('BAD-TOKEN', bad)
  for (const raw of RAW_ENUMS) if (text.includes(raw)) add('RAW-ENUM', raw)
  const brace = text.indexOf('{')
  if (brace !== -1) add('PLACEHOLDER', JSON.stringify(text.slice(Math.max(0, brace - 30), brace + 30)))
  if (vp.mobile && got.scrollWidth > got.clientWidth) {
    const who = got.offenders.map((o) => `${o.el} right=${o.right}${o.inMarket ? ' [market]' : ''}`).join('; ')
    add('OVERFLOW', `scrollWidth ${got.scrollWidth} > clientWidth ${got.clientWidth}; widest: ${who}`)
  }

  const noData = T(lang, 'mk.noData')
  const sourcesHeading = T(lang, 'mk.sourcesHeading')

  if (caseName === 'empty') {
    if (!text.includes(noData)) add('NO-DATA', 'mk.noData missing with an empty market section')
    if (got.sources || text.includes(sourcesHeading)) add('SOURCES-ON-EMPTY', 'the sources block rendered with no rows to cite')
    return found
  }

  if (text.includes(noData)) add('NO-DATA', 'mk.noData printed although rows exist')

  // Per card. Absence is judged per <p> against the whole template, so a
  // sentence that belongs to a neighbouring row cannot satisfy or trip it.
  const priceLabel = T(lang, 'mk.price')
  const stale = T(lang, 'mk.stale')
  const multi = T(lang, 'mk.countMulti')
  const whereSell = T(lang, 'mk.whereSell')
  const places = marketPlaces(lang)
  const shareRe = templateRegex(lookup(lang, 'mk.countShare'))
  const allNotes = ROWS.filter((r) => r.note_code).map((r) => TB(lang, r.note_code, r.note))

  const expected = ROWS.map((row) => expectRow(row, lang))
  expected.forEach((e, i) => {
    const card = got.cards[i]
    const row = e.row
    const who = e.heading
    if (!card.found) {
      add('HEADING', `no card headed "${who}" (h3s: ${got.h3s.join(' | ')})`)
      return
    }
    if (card.matches !== 1) add('HEADING', `"${who}" appears as ${card.matches} headings`)
    const has = (s) => card.text.includes(s)
    const hasPara = (s) => card.paras.includes(s)

    if (!has(e.provenance)) add('PROVENANCE', `${who}: missing "${e.provenance}"`)
    if (!has(e.source)) add('SOURCE', `${who}: missing "${e.source}"`)
    if (!has(e.checked)) add('CHECKED', `${who}: missing "${e.checked}"`)
    // The where-you-sell line is on /analysis only. With a market type ticked it
    // must name what was ticked; with none it must not be there at all, on
    // either route.
    if (caseName === 'nomarket') {
      if (has(whereSell)) add('WHERE-SELL', `${who}: mk.whereSell shown although no market type was ticked`)
    } else if (route === '/analysis') {
      if (!has(whereSell)) add('WHERE-SELL', `${who}: mk.whereSell missing`)
      if (!has(places)) add('WHERE-SELL', `${who}: the market types ticked on /location ("${places}") missing`)
    }

    if (row.metric === 'wholesale_price_per_kg') {
      if (!hasPara(e.price)) add('PRICE-FIGURE', `${who}: no element reading exactly "${e.price}"`)
      if (!has(priceLabel)) add('PRICE-LABEL', `${who}: mk.price missing`)
      for (const figure of [e.low, e.high]) {
        if (!figureRegex(figure).test(card.text)) add('LOW-HIGH', `${who}: "${figure}" missing`)
      }
      if (!has(e.priceWindow)) add('PRICE-WINDOW', `${who}: missing "${e.priceWindow}"`)
      if (!has(e.priceMarkets)) add('PRICE-MARKETS', `${who}: missing "${e.priceMarkets}"`)
      if (has(stale) !== (row.stale === true)) add('STALE', `${who}: mk.stale ${row.stale ? 'missing' : 'shown on a fresh price'}`)
    } else {
      if (!has(e.countLine)) add(row.count_suppressed ? 'SUPPRESSED' : 'COUNT', `${who}: missing "${e.countLine}"`)
      if (row.count_suppressed && card.paras.some((p) => templateRegex(lookup(lang, 'mk.count')).test(p))) {
        add('SUPPRESSED', `${who}: a count sentence printed for a suppressed row`)
      }
      if (e.share) {
        if (!has(e.share)) add('SHARE', `${who}: missing "${e.share}"`)
      } else if (card.paras.some((p) => shareRe.test(p))) {
        add('SHARE', `${who}: mk.countShare printed on a row with no share`)
      }
      const isList = row.source_code === 'src.udyamList'
      if (hasPara(multi) !== isList) add('MULTI', `${who}: mk.countMulti ${isList ? 'missing on a list row' : 'shown on a non-list row'}`)
      if (e.note && !hasPara(e.note)) add('NOTE', `${who}: note missing "${e.note}"`)
      for (const other of allNotes) {
        if (other !== e.note && hasPara(other)) add('NOTE', `${who}: another row's note printed here`)
      }
    }
  })

  // Page-wide price and stale checks.
  const truncated = text.match(/₹26\.9(?!\d)/)
  if (truncated) add('PRICE-TRUNCATED', '"₹26.9" printed without its trailing zero')
  if (!text.includes('₹26.90')) add('PRICE-FIGURE', '"₹26.90" not on the page')
  if (!figureRegex('₹26').test(text)) add('PRICE-FIGURE', 'a standalone "₹26" not on the page')
  const staleCount = count(text, stale)
  if (staleCount !== 1) add('STALE-COUNT', `mk.stale appears ${staleCount} times, want 1`)

  // The sources block.
  const s = got.sources
  if (!s) {
    add('SOURCES-HEADING', `no h3 reading "${sourcesHeading}"`)
    return found
  }
  if (s.headings !== 1) add('SOURCES-HEADING', `"${sourcesHeading}" appears as ${s.headings} headings`)
  if (s.links) add('SOURCES-LINK', `${s.links} <a> element(s) inside the sources block`)
  if (s.inDetails) add('SOURCES-IN-DETAILS', 'the sources block sits inside a <details>, which prints collapsed')
  for (const attribution of [...new Set(ROWS.map((r) => r.provenance.attribution))]) {
    const n = count(text, attribution)
    if (n !== 1) add('ATTRIBUTION', `appears ${n} times, want 1: "${attribution.slice(0, 70)}…"`)
    const para = s.paras.find((p) => p.text === attribution)
    if (!para) add('ATTRIBUTION', `not its own <p> in the sources block: "${attribution.slice(0, 70)}…"`)
    else if (para.lang !== 'en') add('ATTRIBUTION-LANG', `lang="${para.lang}" on an English attribution, want "en"`)
  }
  const notEndorsed = T(lang, 'mk.notEndorsed', { app: APP_NAME })
  if (!s.text.includes(notEndorsed)) add('NOT-ENDORSED', `missing "${notEndorsed}"`)
  if (!s.text.includes(APP_NAME)) add('NOT-ENDORSED', `${APP_NAME} not in the sources block`)
  if (text.includes('{app}')) add('NOT-ENDORSED', 'a literal {app} reached the page')
  const warranty = T(lang, 'mk.warranty')
  if (!s.text.includes(warranty)) add('WARRANTY', `missing "${warranty}"`)

  return found
}

// A drifted English value would be invisible on screen (tBackend prefers the
// dictionary), so it is checked here against the spec's wording directly.
function checkDictionaryEnglish() {
  const found = []
  for (const [code, english] of Object.entries({ ...SOURCE_EN, ...NOTE_EN })) {
    if (STRINGS.en[code] !== english) found.push({ kind: 'DICT-EN', detail: `${code} is ${JSON.stringify(STRINGS.en[code])}, want ${JSON.stringify(english)}` })
  }
  for (const [id, key] of Object.entries(COMMODITY_KEY)) {
    const row = ROWS.find((r) => r.commodity_id === id)
    if (STRINGS.en[key] !== row.commodity) found.push({ kind: 'DICT-EN', detail: `${key} is ${JSON.stringify(STRINGS.en[key])}, want ${JSON.stringify(row.commodity)}` })
  }
  return found
}

async function main() {
  // An Edge left on our profile by a run that was killed hard would hold the
  // profile's files open and make the rmSync below fail. It is ours by the same
  // command-line test cleanup() uses.
  for (const pid of ownEdgePids()) killPid(pid)
  // Anything else answering on 9373 is somebody else's browser, and driving it
  // would seed their sessionStorage and report on their pages.
  // A listener that accepts and never answers is taken too; unbounded, this
  // waited five minutes on one.
  const taken = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(2000) })
    .then(() => true, (err) => err.name === 'TimeoutError')
  if (taken) throw new Error(`port ${DEBUG_PORT} is already answering; free it before running this gate`)
  // The copy --url= names has to be up, or every load would measure Edge's
  // error page.
  if (URL_ARG) {
    try {
      const res = await fetch(APP + '/', { signal: AbortSignal.timeout(5000) })
      await res.body?.cancel()
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      throw new Error(`nothing usable answered at ${APP}/ (${err.cause?.code || err.message}); start that copy first, or drop --url= to let this start its own Vite`)
    }
  }

  rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const findings = []
  const report = []
  // Loads that measured nothing: the page never rendered, or showed its empty
  // state. Either one makes the run exit 2, in both modes.
  const faults = []
  // --broken only: defects that were not applied, or were applied and missed.
  const refuter = []
  for (const f of checkDictionaryEnglish()) findings.push({ tag: 'dictionary', ...f })

  if (!URL_ARG) await startVite()

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
  ], { stdio: 'ignore' })
  children.push(edge)

  let cdp = null
  try {
    cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const [caseName, vp, langs] of PASSES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile,
      })
      await cdp.send('Emulation.setTouchEmulationEnabled', vp.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })

      for (const lang of langs) {
        // Establish the origin before writing storage, then seed and navigate.
        await navigate(cdp, APP + '/')
        await waitForRender(cdp)
        const payload = JSON.stringify({ v: STORAGE_VERSION, data: CASES[caseName] })
        await cdp.evaluate(`
          sessionStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(payload)});
          localStorage.setItem('sih-language', ${JSON.stringify(lang)});
          localStorage.setItem('sih-theme', 'light');
          localStorage.setItem('sih-textsize', 'md');
          localStorage.removeItem('sih-dialect');
          true;
        `)

        const headings = ROWS.map((row) => expectRow(row, lang).heading)
        const sourcesHeading = T(lang, 'mk.sourcesHeading')
        const breakWant = BROKEN ? brokenTargets(caseName, lang, sourcesHeading) : null

        for (const route of ROUTES) {
          const tag = `${caseName}-${lang}-${vp.name}${route.replace(/\//g, '_')}`
          cdp.pageErrors.length = 0
          await navigate(cdp, APP + route)
          const rendered = await waitForRender(cdp)
          await sleep(450)
          const seeded = await cdp.evaluate(SEEDED)

          // The screenshot shows the page as a reader lands on it, before the
          // probe opens every disclosure. It is taken for a load that measured
          // nothing too, since that is where the reason shows.
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
          writeFileSync(`${OUT}/${tag}.png`, Buffer.from(shot.data, 'base64'))

          // A page that never rendered, or rendered its empty state, is not
          // checked. Every check would fire on it (no card, no sources block) and
          // read as findings about the market section, which the run never saw;
          // under --broken every defect would miss its target. The run exits 2.
          const unmeasured = []
          if (!rendered) {
            const threw = cdp.pageErrors.length ? `; the page threw: ${cdp.pageErrors[0].split('\n')[0]}` : ''
            unmeasured.push({ kind: 'NOT-RENDERED', detail: `#main never filled${threw}` })
          }
          if (!seeded) unmeasured.push({ kind: 'UNSEEDED', detail: `no result under ${STORAGE_KEY} after the load: the seed was not read, so this is the empty state` })
          if (unmeasured.length) {
            for (const f of unmeasured) faults.push({ tag, ...f })
            report.push({ tag, caseName, lang, viewport: vp.name, route, rendered, seeded, faults: unmeasured, broke: [], problems: [] })
            console.log(`FAULT ${tag.padEnd(26)} ${unmeasured.map((f) => f.kind).join(' ')}: not measured`)
            continue
          }

          let broke = []
          if (BROKEN) broke = await cdp.evaluate(breakPage({ ...breakWant, route }))

          const got = await cdp.evaluate(probe({ headings, sourcesHeading }))
          writeFileSync(`${OUT}/${tag}.txt`, got.text)
          const problems = checkLoad({ caseName, lang, vp, route, pageErrors: [...cdp.pageErrors], got })

          // Under --broken, every applied defect must be reported by its own
          // kind on this load and, for a per-card check, name that card.
          const verdicts = broke.map((m) => ({
            ...m,
            caught: m.applied && problems.some((p) => p.kind === m.kind && (!m.who || p.detail.includes(m.who))),
          }))
          for (const v of verdicts) {
            if (!v.applied) refuter.push({ tag, kind: 'NOT-APPLIED', detail: `${v.name} (${v.kind}): its target was not on the page` })
            else if (!v.caught) refuter.push({ tag, kind: 'INERT', detail: `${v.name}: no ${v.kind} finding${v.who ? ` naming "${v.who}"` : ''}` })
          }
          const caught = verdicts.filter((v) => v.caught).length

          report.push({ tag, caseName, lang, viewport: vp.name, route, rendered, seeded, chars: got.text.length, cards: got.cards.filter((c) => c.found).length, broke: verdicts, problems })
          for (const p of problems) findings.push({ tag, ...p })
          const status = BROKEN ? (caught === verdicts.length ? 'ok  ' : 'MISS') : problems.length ? 'FAIL' : 'ok  '
          console.log(
            `${status}  ${tag.padEnd(26)} ${String(got.text.length).padStart(5)}c` +
              (caseName !== 'empty' ? ` cards=${got.cards.filter((c) => c.found).length}/${ROWS.length}` : '') +
              (BROKEN ? ` caught ${caught}/${verdicts.length}` : '') +
              (!BROKEN && problems.length ? '  ' + problems.map((p) => p.kind).join(' ') : ''),
          )
        }
      }
    }
  } finally {
    try { cdp?.ws.close() } catch { /* already closed */ }
    cleanup()
  }

  const kinds = {}
  for (const f of findings) kinds[f.kind] = (kinds[f.kind] || 0) + 1
  const applied = report.reduce((n, r) => n + r.broke.filter((v) => v.applied).length, 0)
  // The dictionary check runs before any load and no defect targets it, so a
  // DICT-EN finding under --broken is a real one and still fails the run.
  const real = findings.filter((f) => f.tag === 'dictionary')
  // Under --broken, 1 is the expected result: every defect was caught. 2 means
  // the refuter itself failed, which proves nothing about the checks, or a real
  // DICT-EN finding, which a 1 would hide. The two are told apart below: a
  // DICT-EN finding once printed as REFUTER FAILED, with nothing missed.
  const refuterMissed = BROKEN && (refuter.length > 0 || !applied ||
    report.length !== PASSES.reduce((n, [, , langs]) => n + langs.length * ROUTES.length, 0))
  const refuterFailed = refuterMissed || (BROKEN && real.length > 0)
  // A load that measured nothing outranks both verdicts: in a clean run its
  // absence of findings is not a pass, and under --broken its defects were never
  // planted.
  const exit = faults.length ? 2 : BROKEN ? (refuterFailed ? 2 : 1) : findings.length ? 1 : 0
  const faultedLoads = report.filter((r) => r.faults).length
  writeFileSync(`${OUT}/report.json`, JSON.stringify({
    exit, mode: BROKEN ? 'broken' : 'clean', app: APP, loads: report.length, faults, findings: findings.length, kinds,
    ...(BROKEN ? { defects_applied: applied, defects_missed: refuter.length, refuter } : {}),
    report, details: findings,
  }, null, 2))

  if (BROKEN) {
    for (const f of [...refuter, ...real].slice(0, 60)) console.log(`  ${f.tag}  ${f.kind}  ${f.detail}`)
    console.log(`\n${report.length} page loads, ${applied} defects applied, ${refuter.length} not applied or missed, ${findings.length} findings ${JSON.stringify(kinds)}.`)
    console.log(`PNGs, text dumps and report.json in ${OUT}`)
    if (!faults.length) {
      if (refuterMissed) console.log('REFUTER FAILED: see above.')
      if (real.length) {
        console.log(`DICT-EN: ${real.length} real finding${real.length === 1 ? '' : 's'} in the dictionary (listed above), not a missed defect.` +
          (refuterMissed ? '' : ' Every planted defect was caught, but a 1 would read as the pass, so the run exits 2. Run it without --broken to see this as a finding.'))
      }
      if (!refuterFailed) console.log('Every defect was caught by its own check.')
    }
  } else {
    for (const f of findings.slice(0, 60)) console.log(`  ${f.tag}  ${f.kind}  ${f.detail}`)
    if (findings.length > 60) console.log(`  … ${findings.length - 60} more in report.json`)
    console.log(`\n${report.length} page loads, ${findings.length} findings${findings.length ? ' ' + JSON.stringify(kinds) : ''}.`)
    console.log(`PNGs, text dumps and report.json in ${OUT}`)
  }
  if (faults.length) {
    console.log(`\n${faults.length} instrument fault(s) on ${faultedLoads} of ${report.length} loads; the run did not measure what it names:`)
    for (const f of faults.slice(0, 20)) console.log(`  ${f.tag}  ${f.kind}  ${f.detail}`)
    if (faults.length > 20) console.log(`  … ${faults.length - 20} more in report.json`)
  }
  // exitCode rather than exit(): exit() can cut off stdout redirected to a file.
  process.exitCode = exit
}

main().catch((err) => {
  console.error('market-ui ERROR:', err.message)
  cleanup()
  // A crash is not a finding, and under --broken 1 is the pass.
  process.exitCode = 2
})

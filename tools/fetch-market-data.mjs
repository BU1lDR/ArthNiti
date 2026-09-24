// Fetches real market rows from data.gov.in into backend/app/data/market_data.json:
// wholesale mandi prices from Agmarknet for agriculture, and counts of
// Udyam-registered units by kind of work for the other categories. Used under
// GODL-India, and every row carries its own attribution.
//
// It is a dry run unless --write is given: it fetches, cleans, computes, checks
// every row and prints what would change, and writes nothing to backend/. What a
// row says is decided in market-lib.mjs, where it is tested on synthetic data;
// this file only moves bytes, and refuses to write anything that fails a check.
//
// Nothing here prints or stores the key or a request URL. The URL is built inside
// the request helper and never leaves it, and every line printed or logged goes
// through redact(). Raw Udyam rows are never kept: each page is folded into a
// tally of counts and dropped, and only the tally is checkpointed.
//
// Put your own data.gov.in key in .env (copy .env.example), then:  node tools/fetch-market-data.mjs
// A smoke test with the public sample key, which never reads .env and never
// writes:  node tools/fetch-market-data.mjs --sample

import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { STATES, districtsForState, findState } from '../frontend/src/data/indiaLocations.js'
import {
  AGGREGATE_KINDS, KEY_VAR, METRIC_COUNT, METRIC_PRICE, RESOURCES, SAMPLE_KEY,
  addToTally, aggregateMethod, aggregateToRow, buildOutput, buildQuery, checkKeyValue, cleanPriceRows,
  compileNicMap, countRow, diffSummary, dmy, emptyPriceDrops, emptyTally, istTimestamp, listMethod,
  makeProvenance, mergeKeepOthers, minusDays, parseEnvKey, pickAgricultureRows, priceMethod, priceRow,
  priceStatistic, proposeCrosswalk, redact, resolveTitle, rowIdentity, serialiseCrosswalk,
  stateRowEligibility, sumTallies, tallyToRows, toIstDate, tooManyUnparseable, validateRow, vanishCheck, ymd,
} from './market-lib.mjs'

// Paths come from this file's own location, never from the cwd, so the script
// behaves the same from the repo root, from tools/ or from anywhere else.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TOOLS = fileURLToPath(new URL('.', import.meta.url))
const SELF = fileURLToPath(import.meta.url)
const LIB = join(TOOLS, 'market-lib.mjs')
const ENV_FILE = join(ROOT, '.env')
const CACHE = join(ROOT, '.market-cache')
const DATA_FILE = join(ROOT, 'backend', 'app', 'data', 'market_data.json')
const RUN_FILE = join(ROOT, 'backend', 'app', 'data', 'market_data.provenance.json')
const CROSSWALK_FILE = join(TOOLS, 'market-crosswalk.json')
const COMMODITIES_FILE = join(TOOLS, 'market-commodities.json')
const NIC_FILE = join(TOOLS, 'market-nic-map.json')

const API_BASE = 'https://api.data.gov.in/resource/'
const MIN_GAP_MS = 1500
const TIMEOUT_MS = 90000
const HEARTBEAT_MS = 20000
const BACKOFF_S = [20, 40, 60]
const JITTER_S = 5
const MAX_ATTEMPTS = 4
const SAMPLE_PAGE = 10
const SAMPLE_MAX_PAGES = 5
const FULL_PAGE = 10000

const USAGE = [
  'Usage: node tools/fetch-market-data.mjs [options]',
  '  --districts="Uttar Pradesh/Lucknow,Uttar Pradesh/Varanasi"   only these crosswalk entries',
  '  --state="Uttar Pradesh"   every crosswalk entry in one state',
  '  --only=agmarknet|udyam    one source only',
  '  --window=60               days of mandi prices to read, 8 to 366',
  '  --resume                  continue a Udyam district from its checkpoint in .market-cache/',
  '  --write                   write backend/app/data/market_data.json (the default is a dry run)',
  '  --force                   write even if more than half of the sourced rows would disappear',
  '  --keep-others             keep the existing rows for places this run did not fetch',
  '  --build-crosswalk         propose crosswalk entries; with --write, append them',
  '  --sample                  smoke test with the public sample key: never reads .env, never writes',
].join('\n')

// ---------------------------------------------------------------- output and log

// Known before the arguments are parsed, so even an argument error is prefixed.
const SAMPLE = process.argv.slice(2).includes('--sample')
const PREFIX = SAMPLE ? 'SMOKE TEST — not real coverage | ' : ''
const RUN_START = Date.now()
const FETCHED_AT = istTimestamp(RUN_START)
const TODAY = FETCHED_AT.slice(0, 10)
const LOG_FILE = join(CACHE, `fetch-${FETCHED_AT.slice(0, 19).replace(/:/g, '')}${SAMPLE ? '-sample' : ''}.log`)

let KEY = null
let logBroken = false
let wroteData = false
let stopping = false

const show = (p) => relative(ROOT, p).replaceAll('\\', '/')
const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('en-IN') : String(n))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The only way anything reaches the console or the log.
function say(text = '') {
  const out = redact(String(text), KEY).split('\n').map((line) => PREFIX + line).join('\n')
  console.log(out)
  try {
    mkdirSync(CACHE, { recursive: true })
    appendFileSync(LOG_FILE, `${out}\n`)
  } catch (e) {
    if (!logBroken) {
      logBroken = true
      console.log(redact(`${PREFIX}warning: the log file could not be written (${e?.code ?? e?.message}); continuing without it.`, KEY))
    }
  }
}

// Every file this script writes goes through here: the directory is made first,
// and the file is written beside itself and renamed, so an interrupted run leaves
// the old file whole rather than half a new one.
function writeAtomic(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

// Ends the run from a signal or an unexpected error. appendFileSync has already
// put every line on disk, so the log is flushed by construction.
function stop(reason) {
  if (stopping) process.exit(1)
  stopping = true
  try {
    say(`Stopped: ${reason}`)
    say(wroteData ? 'The data file was written before the stop.' : 'Nothing was written to backend/ by this run.')
    say('A Udyam district that was part-read can be continued with --resume.')
  } catch {
    // Nothing more can be reported once printing itself fails.
  }
  process.exit(1)
}

process.on('SIGINT', () => stop('interrupted (Ctrl+C).'))
process.on('SIGBREAK', () => stop('interrupted (Ctrl+Break).'))
process.on('SIGTERM', () => stop('terminated.'))
process.on('uncaughtException', (e) => stop(`unexpected error: ${e?.stack ?? e}`))
process.on('unhandledRejection', (e) => stop(`unexpected error: ${e?.stack ?? e}`))

// A failure the run can explain in one plain sentence. The reason is redacted
// when it is made, because it can end up in the run provenance file.
// `kind` is a fixed class (http_401, timeout, api_error, ...) and is the only
// part of a failure that reaches market_data.provenance.json; the reason is
// free text that can quote the server, so it stays on the console.
class FetchFailed extends Error {
  constructor(reason, { kind = 'data_check', ...options } = {}) {
    super(redact(reason, KEY), options)
    this.reason = this.message
    this.kind = kind
  }
}

// ---------------------------------------------------------------- arguments

function readArgs(argv) {
  let v
  try {
    v = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        districts: { type: 'string' },
        state: { type: 'string' },
        only: { type: 'string' },
        window: { type: 'string' },
        resume: { type: 'boolean' },
        write: { type: 'boolean' },
        force: { type: 'boolean' },
        'keep-others': { type: 'boolean' },
        'build-crosswalk': { type: 'boolean' },
        sample: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values
  } catch (e) {
    return { errors: [e.message] }
  }
  const errors = []
  const out = {
    districts: v.districts,
    state: v.state,
    only: v.only ?? null,
    window: 60,
    resume: v.resume === true,
    write: v.write === true,
    force: v.force === true,
    keepOthers: v['keep-others'] === true,
    buildCrosswalk: v['build-crosswalk'] === true,
    sample: v.sample === true,
    help: v.help === true,
  }
  if (out.only !== null && out.only !== 'agmarknet' && out.only !== 'udyam') errors.push(`--only must be agmarknet or udyam, not "${out.only}".`)
  if (v.window !== undefined) {
    const n = Number(v.window)
    if (!/^\d+$/.test(v.window) || n < 8 || n > 366) errors.push(`--window must be a whole number of days from 8 to 366, not "${v.window}". Fewer than 8 days can never yield a price row.`)
    else out.window = n
  }
  if (out.districts !== undefined && out.state !== undefined) errors.push('Give --districts or --state, not both.')
  if (out.sample && out.write) {
    errors.push('--sample never writes: the public sample key returns at most 10 rows a page, so nothing it produces is real. Drop --write, or drop --sample and use your own key.')
  }
  if (out.buildCrosswalk) {
    const stray = [['--districts', out.districts !== undefined], ['--state', out.state !== undefined], ['--only', out.only !== null],
      ['--window', v.window !== undefined], ['--resume', out.resume], ['--force', out.force], ['--keep-others', out.keepOthers]]
      .filter(([, on]) => on).map(([name]) => name)
    if (stray.length) errors.push(`--build-crosswalk reads every state and does not take ${stray.join(', ')}.`)
  }
  return { ...out, errors }
}

// ---------------------------------------------------------------- configuration

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

// The crosswalk decides which frontend district a source's figures are filed
// under, so a name that is not in the dropdown's own list is refused outright.
function checkConfig(crosswalk, commodities, nicMap) {
  const errs = []
  compileNicMap(nicMap) // throws on a malformed prefix or range
  if (!Number.isInteger(crosswalk.version) || !Number.isInteger(nicMap.version) || !Number.isInteger(commodities.version)) {
    errs.push('the crosswalk, the NIC map and the commodity list must each carry a whole-number "version".')
  }
  const seen = new Set()
  for (const e of crosswalk.entries ?? []) {
    const where = `${e.state}/${e.district}`
    if (seen.has(where)) errs.push(`crosswalk: "${where}" is listed twice.`)
    seen.add(where)
    if (!districtsForState(e.state).includes(e.district)) errs.push(`crosswalk: "${where}" is not a district in frontend/src/data/indiaLocations.js.`)
    if (!Number.isInteger(e.lgd_state) || !Number.isInteger(e.lgd_district)) errs.push(`crosswalk: "${where}" needs whole-number lgd_state and lgd_district.`)
    if (typeof e.agmarknet_state !== 'string' || !e.agmarknet_state) errs.push(`crosswalk: "${where}" needs agmarknet_state.`)
    if (!Array.isArray(e.agmarknet_district) || !e.agmarknet_district.every((d) => typeof d === 'string' && d)) errs.push(`crosswalk: "${where}" needs agmarknet_district as a list of names.`)
    if (e.origin !== 'manual' && e.origin !== 'auto') errs.push(`crosswalk: "${where}" has origin "${e.origin}"; it must be manual or auto.`)
  }
  const ids = new Set()
  for (const c of commodities.commodities ?? []) {
    // The list's order is the display order, so an id listed twice has two ranks.
    if (ids.has(c.id)) errs.push(`commodities: "${c.id}" is listed twice.`)
    ids.add(c.id)
    if (!c.id ||!Number.isInteger(c.code) || !Array.isArray(c.kg_band) || c.kg_band.length !== 2 || !c.cmd || !c.en) errs.push(`commodities: "${c.id}" needs id, code, kg_band [low, high], cmd and en.`)
  }
  return errs
}

function selectEntries(args, crosswalk) {
  const all = crosswalk.entries
  if (args.districts !== undefined) {
    const wanted = args.districts.split(',').map((s) => s.trim()).filter(Boolean)
    const picked = []
    const unknown = []
    for (const w of wanted) {
      const cut = w.lastIndexOf('/')
      const entry = cut > 0 ? all.find((e) => e.state === w.slice(0, cut).trim() && e.district === w.slice(cut + 1).trim()) : null
      if (entry) { if (!picked.includes(entry)) picked.push(entry) } else unknown.push(w)
    }
    if (unknown.length) {
      return { error: `Not in tools/market-crosswalk.json: ${unknown.join(', ')}. Use "State/District" with the dropdown's spelling. The crosswalk has: ${all.map((e) => `${e.state}/${e.district}`).join(', ')}.` }
    }
    return { entries: picked }
  }
  if (args.state !== undefined) {
    const state = findState(args.state.trim())
    if (!state) return { error: `"${args.state}" is not a state or union territory in frontend/src/data/indiaLocations.js.` }
    const picked = all.filter((e) => e.state === state.name)
    if (!picked.length) return { error: `The crosswalk has no entries for ${state.name}. Run --build-crosswalk first, and review what it proposes.` }
    return { entries: picked }
  }
  return { entries: [...all] }
}

// Reads the key from the environment or from .env. Never called under --sample,
// which must not touch .env at all, not even to see whether it exists.
function loadKey() {
  if (process.env[KEY_VAR] !== undefined) return checkKeyValue(process.env[KEY_VAR])
  let bytes
  try {
    bytes = readFileSync(ENV_FILE) // raw bytes, so parseEnvKey can recognise a UTF-16 file
  } catch (e) {
    if (e?.code === 'ENOENT') return { error: `There is no .env file at the repo root. Copy .env.example to .env and paste your data.gov.in key after the = sign, or set ${KEY_VAR}.` }
    return { error: `.env could not be read (${e?.code ?? 'unknown error'}).` }
  }
  return parseEnvKey(bytes)
}

// ---------------------------------------------------------------- requests

let lastRequestAt = 0

async function waitWithHeartbeat(ms, what) {
  const end = Date.now() + ms
  const timer = setInterval(() => say(`  ... waiting ${Math.max(0, Math.ceil((end - Date.now()) / 1000))} s more before ${what}`), HEARTBEAT_MS)
  try {
    await sleep(ms)
  } finally {
    clearInterval(timer)
  }
}

// One attempt. Builds the URL, which exists only inside this function and is
// neither returned nor logged; an error from the HTTP stack is reduced to a
// plain reason before it leaves.
async function attemptOnce(resourceId, encodedQuery, label) {
  const url = `${API_BASE}${resourceId}?api-key=${encodeURIComponent(KEY)}&format=json&${encodedQuery}`
  const started = Date.now()
  const timer = setInterval(() => say(`  ... still waiting for ${label} (${Math.round((Date.now() - started) / 1000)} s)`), HEARTBEAT_MS)
  try {
    let res
    let text
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      text = await res.text()
    } catch (e) {
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      return { retry: true, kind: timedOut ? 'timeout' : 'network', reason: timedOut ? `no answer within ${TIMEOUT_MS / 1000} s` : `network error (${e?.cause?.code ?? e?.cause?.message ?? e?.message ?? 'unknown'})` }
    }
    if (res.status === 429) return { retry: true, kind: 'http_429', reason: 'HTTP 429, rate limited' }
    if (res.status >= 500) return { retry: true, kind: 'http_5xx', reason: `HTTP ${res.status}` }
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return { retry: res.ok, kind: 'not_json', reason: `HTTP ${res.status}, and the answer was not JSON` }
    }
    // Redact BEFORE cutting: a cut through the middle of the key or of an API
    // URL leaves a fragment that redact() no longer recognises.
    const message = redact(String(json?.message ?? json?.error ?? ''), KEY).slice(0, 200)
    // data.gov.in reports some failures as HTTP 200 with status "error".
    if (json?.status === 'error') return { retry: true, kind: 'api_error', reason: `data.gov.in reported an error${message ? ` (${message})` : ''}` }
    if (!res.ok) return { retry: false, kind: [401, 403, 404].includes(res.status) ? `http_${res.status}` : 'http_4xx', reason: `HTTP ${res.status}${message ? ` (${message})` : ''}. A 401 or 403 usually means the key is wrong or not yet active.` }
    const total = Number(json?.total)
    if (!Number.isInteger(total) || total < 0) return { retry: false, kind: 'no_total', reason: 'the answer carried no total' }
    return {
      value: {
        total,
        records: Array.isArray(json.records) ? json.records : [],
        title: json.title,
        updated_date: typeof json.updated_date === 'string' ? json.updated_date : null,
      },
    }
  } finally {
    clearInterval(timer)
  }
}

// One request at a time, at least MIN_GAP_MS apart, with backoff on anything a
// retry could fix. Returns {total, records, title, updated_date} and nothing else.
async function api(kind, params, label) {
  const id = RESOURCES[kind].id
  const encoded = buildQuery(id, params, { encoded: true })
  let reason = ''
  let failKind = 'unexpected'
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const gap = lastRequestAt + MIN_GAP_MS - Date.now()
    if (gap > 0) await sleep(gap)
    const outcome = await attemptOnce(id, encoded, label)
    lastRequestAt = Date.now()
    if (outcome.value) return outcome.value
    reason = outcome.reason
    failKind = outcome.kind
    if (!outcome.retry) throw new FetchFailed(`${label}: ${reason}`, { kind: failKind })
    if (attempt < MAX_ATTEMPTS) {
      const wait = Math.round((BACKOFF_S[attempt - 1] + Math.random() * JITTER_S) * 1000)
      say(`  ${label}: ${reason}. Retrying in ${Math.round(wait / 1000)} s (attempt ${attempt + 1} of ${MAX_ATTEMPTS}).`)
      await waitWithHeartbeat(wait, `retrying ${label}`)
    }
  }
  throw new FetchFailed(`${label}: ${reason}, after ${MAX_ATTEMPTS} attempts`, { kind: failKind })
}

// Pages through a query until offset reaches the total. Records are handed to
// onPage and not kept here, so a caller that folds them into a tally never holds
// more than one page. `complete` is the rows == total check.
async function pageThrough(kind, params, label, { startOffset = 0, onPage, progress = false }) {
  let offset = startOffset
  let received = 0
  let pages = 0
  let total = null
  let last = null
  const totals = new Set()
  for (;;) {
    const page = await api(kind, [...params, ['limit', PAGE], ['offset', offset]], `${label}, rows from ${offset}`)
    last = page
    totals.add(page.total)
    total ??= page.total
    const n = page.records.length
    if (n) {
      offset += n
      received += n
      pages++
      onPage(page.records, offset)
      if (progress) say(`  ${label}: ${fmt(offset)} of ${fmt(page.total)} rows read`)
    }
    if (!n || offset >= page.total) break
    if (SAMPLE && pages >= SAMPLE_MAX_PAGES) break
  }
  const reason = totals.size > 1 ? `the reported total changed from ${fmt(total)} to ${fmt(last.total)} while it was being read` : null
  return { total, received, offset, pages, last, reason, complete: reason === null && offset === total }
}

// ---------------------------------------------------------------- run state

const args = readArgs(process.argv.slice(2))
const PAGE = SAMPLE ? SAMPLE_PAGE : FULL_PAGE
const WINDOW = args.window ?? 60
const doAgmarknet = args.only !== 'udyam'
const doUdyam = args.only !== 'agmarknet'

let CROSSWALK
let COMMODITIES
let NIC
let COMMODITY_BY_ID
// The display priority of the crops, staples first: the order of the file.
let COMMODITY_ORDER
let SCRIPT_SHA
let entries = []

const results = []
const failures = []
const succeeded = []
const titleWarned = new Set()

function titleFor(kind, apiTitle) {
  const { title, warning } = resolveTitle(kind, apiTitle)
  if (warning && !titleWarned.has(kind)) {
    titleWarned.add(kind)
    say(`  warning: ${warning}`)
  }
  return title
}

function recordFailure(entry, source, e) {
  const reason = redact(e instanceof FetchFailed ? e.reason : `unexpected error: ${e?.message ?? e}`, KEY)
  const reasonClass = e instanceof FetchFailed ? e.kind : 'unexpected'
  failures.push({ state: entry.state, district: entry.district, source, reason, reason_class: reasonClass })
  say(`  FAILED (${source}): ${reason}`)
  say(`  ${entry.district} is dropped for ${source}; the run continues.`)
}

const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
const addDrops = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b?.[k] ?? 0)]))

// Fields every provenance block shares, whatever the source.
const runFields = () => ({ fetched_at: FETCHED_AT, crosswalk_version: CROSSWALK.version, script_sha256: SCRIPT_SHA })

// ---------------------------------------------------------------- pre-flight

async function preflight() {
  say('Pre-flight:')
  const agg = await api('udyamTotal', [['limit', 0]], 'pre-flight 1, the Ministry district list')
  if (agg.total === 788) say('  1. The Ministry district list answers, with 788 rows as expected.')
  else say(`  1. WARNING: the Ministry district list reports ${fmt(agg.total)} rows, not the 788 it had when this was written. Continuing; --build-crosswalk will show what changed.`)

  const up = await api('udyamList', [['filters[LG_ST_Code]', 9], ['limit', 0], ['fields', 'LG_DT_Code,Activities']], 'pre-flight 2, the Udyam list for Uttar Pradesh')
  if (!(up.total > 4000000)) throw new FetchFailed(`pre-flight 2: the Udyam list reports ${fmt(up.total)} units for Uttar Pradesh, where more than 40,00,000 were expected. The resource or its LGD filter has changed.`)
  say(`  2. The Udyam list answers: ${fmt(up.total)} units in Uttar Pradesh.`)

  const upPrices = await api('agmarknet', [['filters[State]', 'Uttar Pradesh'], ['limit', 0]], 'pre-flight 3, Agmarknet for Uttar Pradesh')
  const allPrices = await api('agmarknet', [['limit', 0]], 'pre-flight 3, Agmarknet in full')
  if (!(upPrices.total > 1000000 && upPrices.total < allPrices.total)) {
    throw new FetchFailed(`pre-flight 3: Agmarknet reports ${fmt(upPrices.total)} rows for Uttar Pradesh out of ${fmt(allPrices.total)}. More than 10,00,000, and fewer than the whole, were expected; the State filter is not working as it did.`)
  }
  say(`  3. Agmarknet answers: ${fmt(upPrices.total)} rows for Uttar Pradesh out of ${fmt(allPrices.total)}.`)

  if (SAMPLE) {
    say('  4. Skipped under --sample: the sample key is capped at 10 rows a page by design.')
    return
  }
  const page = await api('agmarknet', [['filters[State]', 'Uttar Pradesh'], ['limit', 100]], 'pre-flight 4, page size')
  if (page.records.length === 10) {
    throw new FetchFailed('pre-flight 4: data.gov.in returned exactly 10 rows for a 100-row page, which is how it treats the public sample key. Check that the key in .env is your own.')
  }
  say(`  4. A 100-row page returned ${page.records.length} rows, so the key is not being capped like the sample key.`)
}

// ---------------------------------------------------------------- Agmarknet

async function fetchAgmarknet(entry) {
  const where = `${entry.district} Agmarknet`
  const raw = []
  const queries = []
  let totalReported = 0
  let before = null
  let after = null
  let apiTitle = null
  for (const name of entry.agmarknet_district) {
    const place = [['filters[State]', entry.agmarknet_state], ['filters[District]', name]]
    const head = await api('agmarknet', [...place, ['sort[Arrival_Date]', 'desc'], ['limit', 1]], `${where} (${name}), latest date`)
    before ??= head.updated_date
    apiTitle ??= head.title
    after = head.updated_date
    const top = head.records[0]
    if (!head.total || !top) {
      say(`  ${name}: Agmarknet has no rows at all for ${entry.agmarknet_state} / ${name}.`)
      continue
    }
    if (!same(top.State, entry.agmarknet_state) || !same(top.District, name)) {
      throw new FetchFailed(`asked for ${entry.agmarknet_state} / ${name}, the server answered with a row for ${top.State} / ${top.District}`)
    }
    let latest = ymd(top.Arrival_Date)
    if (!latest) throw new FetchFailed(`the latest Arrival_Date for ${name} could not be read`)
    if (latest > TODAY) {
      say(`  warning: ${name}'s latest Arrival_Date is ${latest}, after today; the window ends today instead.`)
      latest = TODAY
    }
    const start = minusDays(latest, WINDOW - 1)
    const windowParams = [...place, ['range[Arrival_Date][gte]', dmy(start)], ['range[Arrival_Date][lte]', dmy(latest)]]
    queries.push(buildQuery(RESOURCES.agmarknet.id, windowParams))
    say(`  ${name}: reading ${start} to ${latest}.`)
    const got = await pageThrough('agmarknet', windowParams, `${where} (${name})`, {
      onPage: (records) => { for (const r of records) raw.push(r) },
    })
    totalReported += got.total
    after = got.last?.updated_date ?? after
    say(`  ${name}: ${fmt(got.received)} of ${fmt(got.total)} rows received.`)
    if (!got.complete) {
      const why = `${name}: received ${fmt(got.received)} rows of ${fmt(got.total)}${got.reason ? `; ${got.reason}` : ''}`
      if (!SAMPLE) throw new FetchFailed(why)
      say(`  ${why}. Expected under --sample (10-row pages, ${SAMPLE_MAX_PAGES} at most); a real run drops the district here.`)
    }
  }

  const clean = cleanPriceRows(raw, { state: entry.agmarknet_state, districts: entry.agmarknet_district, commodities: COMMODITIES.commodities })
  reportCleaning(where, clean)
  const { stats, rejected } = priceStatistic(clean.rows, { fetchDateYmd: TODAY })
  reportStatistic(where, stats, rejected)
  const picked = pickAgricultureRows(stats, { order: COMMODITY_ORDER })
  const title = titleFor('agmarknet', apiTitle)
  if (picked.length && !toIstDate(after)) throw new FetchFailed('Agmarknet sent no readable updated_date, which the attribution needs')
  const query = queries.join(' ; ')
  const rows = picked.map((stat) => priceRow({
    place: { state: entry.state, district: entry.district, scope: 'district' },
    stat,
    commodity: COMMODITY_BY_ID.get(stat.commodity_id),
    lastVerified: TODAY,
    provenance: makeProvenance('agmarknet', {
      ...runFields(),
      title,
      updatedBefore: before,
      updatedAfter: after,
      query,
      total_reported: totalReported,
      rows_fetched: raw.length,
      rows_used: stat.rows_used,
      rows_dropped: clean.droppedBy[stat.commodity_id] ?? emptyPriceDrops(),
      period_start: stat.first_reported,
      period_end: stat.last_reported,
      method: priceMethod('district'),
      nic_map_version: null,
    }),
  }))
  say(`  ${where}: ${rows.length} price row(s)${rows.length ? `: ${rows.map((r) => r.commodity_id).join(', ')}` : ''}.`)
  // Only the cleaned figures are kept for a possible state row, never the raw rows.
  return { rows, cleaned: clean.rows, droppedBy: clean.droppedBy, fetched: raw.length, totalReported, queries, before, after, title }
}

function reportCleaning(label, clean) {
  const dropped = Object.entries(clean.dropped).filter(([, n]) => n).map(([k, n]) => `${k} ${fmt(n)}`)
  say(`  ${label}: ${fmt(clean.rows.length)} rows kept; dropped ${dropped.length ? dropped.join(', ') : 'none'}; skipped ${fmt(clean.skipped.not_listed)} not on the commodity list and ${fmt(clean.skipped.variety)} of a variety not allowed.`)
  for (const w of clean.warnings) say(`  warning: ${w}`)
  if (clean.dropped.wrong_place) say(`  warning: ${fmt(clean.dropped.wrong_place)} rows were for another place, so the server-side State/District filter did not hold.`)
}

function reportStatistic(label, stats, rejected) {
  for (const s of stats) {
    say(`  ${label}: ${s.commodity_id} ${s.indicative_price} (${s.price_low} to ${s.price_high}) rupees/kg over ${s.n_days} day(s) and ${s.n_markets} mandi(s), last ${s.last_reported}${s.stale ? ', stale' : ''}`)
    if (s.future_dates) say(`  warning: ${s.commodity_id} has ${s.future_dates} reporting date(s) after today, left out.`)
  }
  for (const r of rejected) {
    say(`  ${label}: no row for ${r.commodity_id}: ${r.reason}.`)
    if (r.future_dates) say(`  warning: ${r.commodity_id} has ${r.future_dates} reporting date(s) after today, left out.`)
  }
}

// ---------------------------------------------------------------- Udyam list

const checkpointFile = (lgd) => join(CACHE, `udyam-${lgd}${SAMPLE ? '.sample' : ''}.json`)

// A checkpoint holds counts only. It is trusted only if it describes the same
// version of the list (updated_date, total) and the same NIC map; anything else
// is thrown away and the district starts again.
function readCheckpoint(file, { updated, total }) {
  let cp
  try {
    cp = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    if (e?.code !== 'ENOENT') say(`  The checkpoint ${show(file)} could not be read; starting this district again.`)
    return null
  }
  const t = cp?.tallies
  const cats = compileNicMap(NIC).categories.map((c) => c.name).sort().join()
  const shapeOk = Number.isInteger(cp?.offset) && cp.offset >= 0 && t && typeof t.counts === 'object'
    && ['rows', 'used', 'unparseable', 'wrong_place'].every((k) => Number.isInteger(t[k]) && t[k] >= 0)
    && Object.keys(t.counts).sort().join() === cats && t.rows === cp.offset
  if (!shapeOk) { say(`  The checkpoint ${show(file)} is not in the expected shape; starting this district again.`); return null }
  if (cp.updated_date !== updated) { say(`  The checkpoint was taken from an older version of the Udyam list (${cp.updated_date}, now ${updated}); starting this district again.`); return null }
  if (cp.total !== total) { say(`  The checkpoint expected ${fmt(cp.total)} units, the list now reports ${fmt(total)}; starting this district again.`); return null }
  if (cp.nic_map_version !== NIC.version) { say('  The checkpoint was counted with another version of the NIC map; starting this district again.'); return null }
  return cp
}

async function fetchUdyam(entry) {
  const lgd = entry.lgd_district
  const where = `${entry.district} Udyam list`
  const base = [['filters[LG_DT_Code]', lgd], ['fields', 'LG_DT_Code,Activities']]
  const head = await api('udyamList', [...base, ['limit', 0]], `${where}, total`)
  const before = head.updated_date
  if (!toIstDate(before)) throw new FetchFailed('the Udyam list sent no readable updated_date, which the attribution needs')
  const total = head.total
  const file = checkpointFile(lgd)
  let tally = emptyTally(NIC)
  let offset = 0
  if (args.resume) {
    const cp = readCheckpoint(file, { updated: before, total })
    if (cp) {
      tally = cp.tallies
      offset = cp.offset
      say(`  Resuming ${where} from row ${fmt(offset)} of ${fmt(total)}.`)
    }
  }
  say(`  ${where}: ${fmt(total)} units listed; the list was updated ${before}.`)
  const got = await pageThrough('udyamList', base, where, {
    startOffset: offset,
    progress: true,
    onPage: (records, nextOffset) => {
      tally = addToTally(tally, records, { lgd, nicMap: NIC })
      writeAtomic(file, `${JSON.stringify({ offset: nextOffset, tallies: tally, updated_date: before, total, nic_map_version: NIC.version })}\n`)
    },
  })
  const tail = await api('udyamList', [...base, ['limit', 0]], `${where}, updated_date check`)
  const after = tail.updated_date

  const discard = (why) => {
    rmSync(file, { force: true })
    throw new FetchFailed(why)
  }
  if (tooManyUnparseable(tally)) discard(`${fmt(tally.unparseable)} of ${fmt(tally.rows)} units have an Activities field that could not be read, more than 1%`)
  if (after !== before) discard(`the Udyam list was updated while it was being read (${before}, then ${after}); run it again`)
  if (!got.complete || tally.rows !== total || tail.total !== total) {
    const why = `received ${fmt(tally.rows)} rows of ${fmt(total)}${got.reason ? `; ${got.reason}` : ''}${tail.total !== total ? `; the total is now ${fmt(tail.total)}` : ''}`
    if (!SAMPLE) discard(why)
    say(`  ${where}: ${why}. Expected under --sample (10-row pages, ${SAMPLE_MAX_PAGES} at most); a real run drops the district here.`)
  }
  if (tally.wrong_place) say(`  warning: ${fmt(tally.wrong_place)} rows carried another district's LGD code and were not counted.`)
  say(`  ${where}: ${fmt(tally.used)} units classified, ${fmt(tally.unparseable)} unreadable.`)

  const title = titleFor('udyamList', head.title)
  const query = buildQuery(RESOURCES.udyamList.id, base)
  const rows = tallyToRows(tally, { nicMap: NIC, districtTotal: total }).map((part) => countRow({
    place: { state: entry.state, district: entry.district, scope: 'district' },
    part,
    sourceCode: 'src.udyamList',
    lastVerified: TODAY,
    provenance: makeProvenance('udyamList', {
      ...runFields(),
      title,
      updatedBefore: before,
      updatedAfter: after,
      query,
      total_reported: total,
      rows_fetched: tally.rows,
      rows_used: tally.used,
      rows_dropped: { unparseable: tally.unparseable, wrong_place: tally.wrong_place },
      period_start: null,
      period_end: toIstDate(after),
      method: listMethod('district'),
      nic_map_version: NIC.version,
    }),
  }))
  say(`  ${where}: ${rows.length} count row(s), ${rows.filter((r) => r.count_suppressed).length} of them suppressed below 10.`)
  return { rows, tally, total, before, after, title, query }
}

// ---------------------------------------------------------------- Ministry aggregates

// Only when a district's list fetch failed, and only for services and
// manufacturing. The server filter is checked client-side too: a filter that
// silently matched something else yields no match here, never a wrong figure.
async function fetchAggregates(entry) {
  const rows = []
  const problems = []
  const lgd = entry.lgd_district
  const isLgd = (v) => /^\d+$/.test(String(v ?? '').trim()) && Number(v) === Number(lgd)
  for (const [category, spec] of Object.entries(AGGREGATE_KINDS)) {
    const params = [['filters[lg_dt_code]', lgd]]
    const label = `${entry.district} Ministry ${category} count`
    let res
    try {
      res = await api(spec.kind, [...params, ['limit', PAGE]], label)
    } catch (e) {
      if (!(e instanceof FetchFailed)) throw e
      problems.push(e.reason)
      continue
    }
    const matches = res.records.filter((r) => isLgd(r?.lg_dt_code))
    if (matches.length !== 1) { problems.push(`${label}: ${matches.length} rows carry LGD code ${lgd}, where exactly 1 was expected`); continue }
    const m = matches[0]
    if (/^\d+$/.test(String(m.state_id ?? '').trim()) && Number(m.state_id) !== entry.lgd_state) { problems.push(`${label}: the row is filed under state ${m.state_id}, not ${entry.lgd_state}`); continue }
    const part = aggregateToRow(category, m)
    if (!part) { problems.push(`${label}: the published total is not a whole number`); continue }
    if (!toIstDate(res.updated_date)) { problems.push(`${label}: no readable updated_date, which the attribution needs`); continue }
    rows.push(countRow({
      place: { state: entry.state, district: entry.district, scope: 'district' },
      part,
      sourceCode: 'src.udyamAggregate',
      lastVerified: TODAY,
      provenance: makeProvenance(spec.kind, {
        ...runFields(),
        title: titleFor(spec.kind, res.title),
        updatedBefore: res.updated_date,
        updatedAfter: res.updated_date,
        query: buildQuery(RESOURCES[spec.kind].id, params),
        total_reported: res.total,
        rows_fetched: res.records.length,
        rows_used: 1,
        rows_dropped: { unparseable: 0, wrong_place: res.records.length - 1 },
        period_start: null,
        period_end: toIstDate(res.updated_date),
        method: aggregateMethod(category),
        nic_map_version: null,
      }),
    }))
  }
  return { rows, problems }
}

// ---------------------------------------------------------------- state rows

function whyNotState(elig, all) {
  const parts = []
  if (elig.missing.length) parts.push(`the crosswalk covers ${all.length - elig.missing.length} of its ${all.length} districts`)
  if (elig.failed.length) parts.push(`${elig.failed.length} covered district(s) were not fetched in this run or failed (${elig.failed.slice(0, 5).join(', ')}${elig.failed.length > 5 ? ', ...' : ''})`)
  return parts.join('; ') || 'the dropdown lists no districts for it'
}

// A state row pools EVERY district of the state, or it is not emitted at all.
// With today's two-district crosswalk this never fires; the tests cover it.
function buildStateRows() {
  const rows = []
  for (const state of [...new Set(entries.map((e) => e.state))]) {
    const stateDistricts = districtsForState(state)
    const covered = CROSSWALK.entries.filter((e) => e.state === state).map((e) => e.district)
    const inState = results.filter((r) => r.entry.state === state)
    if (doAgmarknet) {
      const ok = inState.filter((r) => r.agmarknet)
      const elig = stateRowEligibility({ stateDistricts, coveredDistricts: covered, succeededDistricts: ok.map((r) => r.entry.district) })
      if (!elig.eligible) say(`No ${state} state price rows: ${whyNotState(elig, stateDistricts)}.`)
      else rows.push(...statePriceRows(state, ok.map((r) => r.agmarknet)))
    }
    if (doUdyam) {
      const ok = inState.filter((r) => r.udyam)
      const elig = stateRowEligibility({ stateDistricts, coveredDistricts: covered, succeededDistricts: ok.map((r) => r.entry.district) })
      if (!elig.eligible) say(`No ${state} state count rows: ${whyNotState(elig, stateDistricts)}.`)
      else if (new Set(ok.map((r) => r.udyam.after)).size !== 1) say(`No ${state} state count rows: its districts were read from different versions of the Udyam list. Run the state again.`)
      else rows.push(...stateCountRows(state, ok.map((r) => r.udyam)))
    }
  }
  return rows
}

function statePriceRows(state, parts) {
  const { stats, rejected } = priceStatistic(parts.flatMap((p) => p.cleaned), { fetchDateYmd: TODAY })
  reportStatistic(`${state} (state)`, stats, rejected)
  const before = parts.map((p) => p.before).find(Boolean)
  const after = [...parts].reverse().map((p) => p.after).find(Boolean)
  return pickAgricultureRows(stats, { order: COMMODITY_ORDER }).map((stat) => priceRow({
    place: { state, district: '', scope: 'state' },
    stat,
    commodity: COMMODITY_BY_ID.get(stat.commodity_id),
    lastVerified: TODAY,
    provenance: makeProvenance('agmarknet', {
      ...runFields(),
      title: parts[0].title,
      updatedBefore: before,
      updatedAfter: after,
      query: parts.flatMap((p) => p.queries).join(' ; '),
      total_reported: parts.reduce((n, p) => n + p.totalReported, 0),
      rows_fetched: parts.reduce((n, p) => n + p.fetched, 0),
      rows_used: stat.rows_used,
      rows_dropped: parts.reduce((acc, p) => addDrops(acc, p.droppedBy[stat.commodity_id]), emptyPriceDrops()),
      period_start: stat.first_reported,
      period_end: stat.last_reported,
      method: priceMethod('state'),
      nic_map_version: null,
    }),
  }))
}

function stateCountRows(state, parts) {
  const tally = sumTallies(parts.map((p) => p.tally))
  const total = parts.reduce((n, p) => n + p.total, 0)
  const after = parts[0].after
  return tallyToRows(tally, { nicMap: NIC, districtTotal: total }).map((part) => countRow({
    place: { state, district: '', scope: 'state' },
    part,
    sourceCode: 'src.udyamList',
    lastVerified: TODAY,
    provenance: makeProvenance('udyamList', {
      ...runFields(),
      title: parts[0].title,
      updatedBefore: parts[0].before,
      updatedAfter: after,
      query: parts.map((p) => p.query).join(' ; '),
      total_reported: total,
      rows_fetched: tally.rows,
      rows_used: tally.used,
      rows_dropped: { unparseable: tally.unparseable, wrong_place: tally.wrong_place },
      period_start: null,
      period_end: toIstDate(after),
      method: listMethod('state'),
      nic_map_version: NIC.version,
    }),
  }))
}

// ---------------------------------------------------------------- output

function leaks(text) {
  const keys = [KEY, KEY && encodeURIComponent(KEY), SAMPLE_KEY].filter(Boolean)
  return keys.some((k) => text.includes(k)) || /api-key/i.test(text) || /https?:\/\/api\.data\.gov\.in/i.test(text)
}

function validateAll(rows) {
  const problems = []
  for (const row of rows) {
    for (const e of validateRow(row, { commodities: COMMODITIES.commodities, nicMap: NIC })) problems.push(`${rowIdentity(row)}: ${e}`)
  }
  return problems
}

// Under --sample the row shapes are the evidence that output validation ran, so
// the key names (never the values) of one row per kind are printed.
function showShapes(rows) {
  const seen = new Set()
  for (const row of rows) {
    const kind = `${row.metric} / ${row.source_code}`
    if (seen.has(kind)) continue
    seen.add(kind)
    say(`  ${kind} row keys: ${Object.keys(row).join(', ')}`)
    say(`  ${kind} provenance keys: ${Object.keys(row.provenance ?? {}).join(', ')}`)
  }
}

function finish(newRows) {
  const problems = []
  let old = []
  try {
    old = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch (e) {
    if (e?.code !== 'ENOENT') problems.push(`${show(DATA_FILE)} could not be read as JSON (${e?.message})`)
  }
  if (!Array.isArray(old)) {
    problems.push(`${show(DATA_FILE)} is not a JSON array`)
    old = []
  }

  // --keep-others keeps the old rows of every district this run did not attempt,
  // and, inside an attempted district, of every metric it did not fetch. A
  // district that was attempted and failed loses its old rows for that metric,
  // exactly as it does without the flag: a failure drops the district, it does
  // not leave figures from an older run standing beside this run's provenance.
  let final = newRows
  if (args.keepOthers) {
    const places = entries.map((e) => `${e.state}/${e.district}`)
    const metrics = [...(doAgmarknet ? [METRIC_PRICE] : []), ...(doUdyam ? [METRIC_COUNT] : [])]
    final = mergeKeepOthers(old, newRows, { places, metrics })
    say(`--keep-others: ${final.length - newRows.length} existing row(s) kept for districts or metrics this run did not attempt.`)
  }

  const invalid = validateAll(final)
  say(`Validation: ${final.length} row(s) checked, ${invalid.length} problem(s).`)
  for (const p of invalid) say(`  invalid: ${p}`)
  problems.push(...invalid)
  if (SAMPLE) showShapes(final)

  say('')
  for (const line of diffSummary(old, final).lines) say(line)
  const vanish = vanishCheck(old, final)
  if (vanish.refuse) say(`${vanish.vanished} of the ${vanish.sourced} sourced rows in the current file would disappear, more than half.${args.force ? ' --force given.' : ''}`)

  const text = buildOutput(final)
  const byMetric = { [METRIC_PRICE]: final.filter((r) => r.metric === METRIC_PRICE).length, [METRIC_COUNT]: final.filter((r) => r.metric === METRIC_COUNT).length }
  const run = {
    fetched_at: FETCHED_AT,
    script_sha256: SCRIPT_SHA,
    crosswalk_version: CROSSWALK.version,
    nic_map_version: NIC.version,
    commodities_version: COMMODITIES.version,
    window_days: WINDOW,
    districts_attempted: entries.map((e) => ({ state: e.state, district: e.district })),
    districts_succeeded: succeeded,
    // The class only. The reason can quote the server, and this file ships.
    districts_failed: failures.map(({ state, district, source, reason_class }) => ({ state, district, source, reason_class })),
    rows_by_metric: byMetric,
  }
  const runText = `${JSON.stringify(run, null, 2)}\n`
  if (leaks(text) || leaks(runText)) problems.push('the output would contain the key, an api-key parameter or an API URL')

  if (!args.write) {
    say('')
    say(`Dry run: nothing was written to backend/. ${final.length} row(s) would be written (${byMetric[METRIC_PRICE]} price, ${byMetric[METRIC_COUNT]} count).`)
    if (problems.length) say(`--write would be refused: ${problems.length} problem(s) above.`)
    else if (vanish.refuse && !args.force) say('--write would be refused without --force, because of the rows that would disappear.')
    else if (!SAMPLE) say('Run again with --write to write them.')
    return problems.length ? 1 : 0
  }
  if (problems.length) {
    say(`Refusing to write: ${problems.length} problem(s) above. Nothing was written.`)
    return 1
  }
  if (vanish.refuse && !args.force) {
    say('Refusing to write: more than half of the sourced rows would disappear, which is far more likely a broken run than a real change. Check the failures above, or run again with --force.')
    return 1
  }
  writeAtomic(DATA_FILE, text)
  wroteData = true
  writeAtomic(RUN_FILE, runText)
  say(`Wrote ${show(DATA_FILE)} (${final.length} rows) and ${show(RUN_FILE)}.`)
  say('Restart uvicorn: load_json is lru_cached.')
  say('Then run:')
  say('  node tools/verify/refresh-cases.mjs')
  say('  node tools/keycheck.mjs')
  say('  cd backend && ../.venv/Scripts/python.exe -m pytest tests -q')
  return 0
}

// ---------------------------------------------------------------- crosswalk proposals

async function buildCrosswalk() {
  const aggregateRows = []
  const agg = await pageThrough('udyamTotal', [], 'the Ministry district list', {
    // No fields= here: "state_name" would trip the personal-data guard, and this
    // resource holds district totals only, no unit's name or address.
    onPage: (records) => {
      for (const r of records) aggregateRows.push({ state_name: r?.state_name, state_id: r?.state_id, district_name: r?.district_name, lg_dt_code: r?.lg_dt_code })
    },
  })
  say(`The Ministry district list: ${fmt(agg.received)} of ${fmt(agg.total)} rows received.`)
  if (!agg.complete) {
    const why = `the Ministry district list was not read in full (${fmt(agg.received)} of ${fmt(agg.total)})`
    if (!SAMPLE) throw new FetchFailed(why)
    say(`${why}. Expected under --sample; a real run stops here.`)
  }

  // The field names of today's mandi list are read off one row rather than
  // assumed, and only those two fields are then requested.
  const probe = await api('agmarknetToday', [['limit', 1]], "today's mandi list, field names")
  const names = Object.keys(probe.records[0] ?? {})
  const stateField = names.find((k) => /^state$/i.test(k))
  const districtField = names.find((k) => /^district$/i.test(k))
  if (!stateField || !districtField) throw new FetchFailed(`today's mandi list has no State and District fields (its fields: ${names.join(', ') || 'none, no rows'})`)
  const pairs = new Map()
  let skippedNa = 0
  const today = await pageThrough('agmarknetToday', [['fields', `${stateField},${districtField}`]], "today's mandi list", {
    onPage: (records) => {
      for (const r of records) {
        const s = String(r?.[stateField] ?? '').trim()
        const d = String(r?.[districtField] ?? '').trim()
        if (!s || !d || /^na$/i.test(s) || /^na$/i.test(d)) { skippedNa++; continue }
        pairs.set(`${s}|${d}`, { State: s, District: d })
      }
    },
  })
  say(`Today's mandi list: ${fmt(today.received)} of ${fmt(today.total)} rows, ${fmt(pairs.size)} distinct State/District pairs, ${fmt(skippedNa)} rows with NA skipped.`)
  if (!today.complete) {
    const why = `today's mandi list was not read in full (${fmt(today.received)} of ${fmt(today.total)})`
    if (!SAMPLE) throw new FetchFailed(why)
    say(`${why}. Expected under --sample; a real run stops here.`)
  }

  const result = proposeCrosswalk({ states: STATES, aggregateRows, todayPairs: [...pairs.values()], crosswalk: CROSSWALK })
  const file = join(CACHE, `crosswalk-proposal${SAMPLE ? '.sample' : ''}.json`)
  writeAtomic(file, `${JSON.stringify({ generated_at: FETCHED_AT, smoke_test: SAMPLE, crosswalk_version: CROSSWALK.version, ...result }, null, 2)}\n`)
  say(`Proposals written to ${show(file)}: ${result.proposals.length} proposed, ${result.ambiguous.length} ambiguous, ${result.unmatched.length} unmatched, ${result.noMandi.length} with no mandi in today's list.`)
  for (const a of result.ambiguous) say(`  ambiguous: ${a.state} / ${a.district}: ${a.candidates.join('; ')}`)
  for (const u of result.unmatched) say(`  unmatched: ${u.state} / ${u.district}`)
  for (const n of result.noMandi) say(`  no mandi today: ${n.state} / ${n.district} (proposed with no Agmarknet district)`)
  say('Ambiguous and unmatched districts are not guessed. Add them to tools/market-crosswalk.json by hand, with "origin": "manual", or add an alias.')

  if (!args.write) {
    say('Dry run: tools/market-crosswalk.json was not changed. Review the proposals, then run again with --build-crosswalk --write to append them.')
    return 0
  }
  if (!result.proposals.length) {
    say('Nothing to append.')
    return 0
  }
  // Appends only. A manual entry is never touched, and an existing entry is
  // never proposed again. The version goes up because the rows' provenance
  // names the crosswalk version it was built with.
  const next = { ...CROSSWALK, version: CROSSWALK.version + 1, entries: [...CROSSWALK.entries, ...result.proposals] }
  const errs = checkConfig(next, COMMODITIES, NIC)
  if (errs.length) {
    for (const e of errs) say(`  invalid: ${e}`)
    say('Refusing to append: the new crosswalk would not pass its own checks.')
    return 1
  }
  writeAtomic(CROSSWALK_FILE, serialiseCrosswalk(next))
  say(`Appended ${result.proposals.length} entr${result.proposals.length === 1 ? 'y' : 'ies'} with "origin": "auto" to ${show(CROSSWALK_FILE)}; its version is now ${next.version}.`)
  return 0
}

// ---------------------------------------------------------------- main

async function main() {
  if (args.errors?.length) {
    for (const e of args.errors) say(e)
    say(USAGE)
    return 1
  }
  if (args.help) {
    say(USAGE)
    return 0
  }

  CROSSWALK = readJson(CROSSWALK_FILE)
  COMMODITIES = readJson(COMMODITIES_FILE)
  NIC = readJson(NIC_FILE)
  COMMODITY_BY_ID = new Map(COMMODITIES.commodities.map((c) => [c.id, c]))
  COMMODITY_ORDER = COMMODITIES.commodities.map((c) => c.id)
  const configErrors = checkConfig(CROSSWALK, COMMODITIES, NIC)
  if (configErrors.length) {
    for (const e of configErrors) say(e)
    return 1
  }
  SCRIPT_SHA = createHash('sha256').update(readFileSync(LIB)).update(readFileSync(SELF)).digest('hex')

  if (!args.buildCrosswalk) {
    const picked = selectEntries(args, CROSSWALK)
    if (picked.error) { say(picked.error); return 1 }
    entries = picked.entries
  }

  if (SAMPLE) {
    KEY = SAMPLE_KEY
    say('The public sample key returns at most 10 rows a page, so no figure below is real, and nothing is written to backend/.')
  } else {
    const loaded = loadKey()
    if (loaded.error) { say(loaded.error); return 1 }
    KEY = loaded.key
  }
  say(`Run ${FETCHED_AT}. Log: ${show(LOG_FILE)}`)

  try {
    await preflight()
  } catch (e) {
    if (!(e instanceof FetchFailed)) throw e
    say(`Pre-flight failed: ${e.reason}`)
    if (SAMPLE && /429/.test(e.reason)) say('The public sample key is rate-limited by data.gov.in right now. Try again later; this says nothing about the fetch code.')
    say('Nothing was fetched or written.')
    return 1
  }

  if (args.buildCrosswalk) {
    try {
      return await buildCrosswalk()
    } catch (e) {
      if (!(e instanceof FetchFailed)) throw e
      say(`--build-crosswalk failed: ${e.reason}. Nothing was changed.`)
      return 1
    }
  }

  say(`Fetching ${entries.length} district(s)${args.only ? `, ${args.only} only` : ''}; mandi window ${WINDOW} days.`)
  for (const entry of entries) {
    const r = { entry, agmarknet: null, udyam: null, aggregate: null }
    say('')
    say(`== ${entry.state} / ${entry.district} ==`)
    if (doAgmarknet) {
      try {
        r.agmarknet = await fetchAgmarknet(entry)
        succeeded.push({ state: entry.state, district: entry.district, source: 'agmarknet' })
      } catch (e) {
        recordFailure(entry, 'agmarknet', e)
      }
    }
    if (doUdyam) {
      try {
        r.udyam = await fetchUdyam(entry)
        succeeded.push({ state: entry.state, district: entry.district, source: 'udyam' })
      } catch (e) {
        recordFailure(entry, 'udyam', e)
        say("  Falling back to the Ministry's own district counts, for services and manufacturing only.")
        try {
          r.aggregate = await fetchAggregates(entry)
          for (const p of r.aggregate.problems) recordFailure(entry, 'udyam-aggregate', new FetchFailed(p))
          if (r.aggregate.rows.length) succeeded.push({ state: entry.state, district: entry.district, source: 'udyam-aggregate' })
          say(`  ${entry.district}: ${r.aggregate.rows.length} Ministry count row(s).`)
        } catch (e2) {
          recordFailure(entry, 'udyam-aggregate', e2)
        }
      }
    }
    results.push(r)
  }

  say('')
  const newRows = [
    ...results.flatMap((r) => [...(r.agmarknet?.rows ?? []), ...(r.udyam?.rows ?? r.aggregate?.rows ?? [])]),
    ...buildStateRows(),
  ]

  // The fallback only runs when a list fetch fails, which under --sample it
  // does not (an incomplete read is a smoke note there). So the smoke test runs
  // it once on purpose, validates what it builds, and emits none of it: one
  // district never carries list and Ministry figures together.
  let smokeProblems = 0
  if (SAMPLE && doUdyam && results[0]?.udyam) {
    const entry = results[0].entry
    say(`Exercising the Ministry fallback for ${entry.district} (validated, not emitted):`)
    const agg = await fetchAggregates(entry)
    for (const p of agg.problems) say(`  fallback problem: ${p}`)
    const invalid = validateAll(agg.rows)
    for (const p of invalid) say(`  invalid: ${p}`)
    smokeProblems = invalid.length
    say(`  ${agg.rows.length} Ministry row(s) built, ${invalid.length} validation problem(s).`)
    showShapes(agg.rows)
    say('')
  }

  const code = finish(newRows)
  say('')
  say(`Done: ${succeeded.length} district source(s) succeeded, ${failures.length} failed.`)
  for (const f of failures) say(`  failed: ${f.state} / ${f.district} (${f.source}): ${f.reason}`)
  return failures.length || smokeProblems || code ? 1 : 0
}

// exitCode first, so a process with nothing left to do exits on its own and
// stdout redirected to a file is not cut short. The unref'd timer exits anyway
// if a kept-alive socket would otherwise hold the process open.
main().then((code) => {
  process.exitCode = code
  setTimeout(() => process.exit(code), 2000).unref()
}, (e) => stop(`unexpected error: ${e?.stack ?? e}`))

// Pure helpers for tools/fetch-market-data.mjs: no network, no fs, no process.
//
// Everything that decides WHAT a market row says lives here, so it can be tested
// on synthetic data by tools/verify/market-lib-test.mjs without a key. The fetch
// script only moves bytes: it asks data.gov.in for pages, hands them to these
// functions, and writes what comes back.
//
// Two rules hold across the whole file. A figure that cannot be backed is left
// out rather than estimated. And nothing here ever sees a full request URL: the
// key is added by the request helper in the fetch script, after buildQuery has
// returned, so a query string built here can be logged or stored as it is.

export const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b'
export const PLACEHOLDER_KEY = 'paste-your-key-here'
export const KEY_VAR = 'DATA_GOV_IN_API_KEY'

export const LICENCE = {
  name: 'Government Open Data License - India',
  url: 'https://www.data.gov.in/Godl',
}

const AGRI_PUBLISHER = 'Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection)'
const MSME_PUBLISHER = 'Ministry of Micro, Small and Medium Enterprises'

// The expected titles are the ones the API sent when this was written. If the API
// sends a different one, resolveTitle() returns the API's and a warning: the
// attribution has to name the dataset as it is published, not as we remember it.
export const RESOURCES = {
  agmarknetToday: {
    id: '9ef84268-d588-465a-a308-a864a43d0070',
    title: 'Current Daily Price of Various Commodities from Various Markets (Mandi)',
    publisher: AGRI_PUBLISHER,
    page_url: null,
  },
  agmarknet: {
    id: '35985678-0d79-46b4-9ed6-6f13308a1d24',
    title: 'Variety-wise Daily Market Prices Data of Commodity',
    publisher: AGRI_PUBLISHER,
    page_url: 'https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity',
  },
  udyamList: {
    id: '8b68ae56-84cf-4728-a0a6-1be11028dea7',
    title: 'List of MSME Registered Units under UDYAM',
    publisher: MSME_PUBLISHER,
    page_url: 'https://www.data.gov.in/resource/list-msme-registered-units-under-udyam',
  },
  udyamTotal: {
    id: 'f8cd85a1-f9b8-4ff1-b195-9f75c10eb338',
    title: 'District Wise Total MSME Registered Enterprises under UDYAM Registration till last date',
    publisher: MSME_PUBLISHER,
    page_url: 'https://www.data.gov.in/resource/district-wise-total-msme-registered-enterprises-under-udyam-registration-till-last-date',
  },
  udyamServices: {
    id: 'c3dfe7e6-0cfd-4ddb-8f79-9cb3695d9866',
    title: 'District wise Services MSME Registered Enterprises under UDYAM Registration till last date',
    publisher: MSME_PUBLISHER,
    page_url: 'https://www.data.gov.in/resource/district-wise-services-msme-registered-enterprises-under-udyam-registration-till-last-date',
  },
  udyamManufacturing: {
    id: 'ae789703-638a-4942-b79e-17868103dec8',
    title: 'District Level Manufacturing MSME Registered Enterprises under UDYAM Registration till last date',
    publisher: MSME_PUBLISHER,
    page_url: 'https://www.data.gov.in/catalog/udyam-registration-msme-registration',
  },
}

// English values, copied exactly from backendStrings.js's `en` dict. The test
// suite parses that file and fails if either side drifts, because `source` and
// `note` on a row must be byte-identical to the translation's English fallback.
export const SOURCE_EN = {
  'src.agmarknetMandi': 'Daily mandi prices reported to Agmarknet, published on data.gov.in',
  'src.udyamList': 'Udyam registrations, published on data.gov.in',
  'src.udyamAggregate': "The Ministry of MSME's district counts of Udyam registrations, published on data.gov.in",
}

export const NOTE_EN = {
  'mknote.ourGrouping': 'We chose which kinds of registered work to count in this figure.',
  'mknote.ministryServices': "This is the Ministry's own count of registered service businesses. It may include shops and traders.",
  'mknote.ministryManufacturing': "This is the Ministry's own count of registered manufacturing businesses. It counts each business once, by its main kind of work.",
  'mknote.dairyProducts': 'This counts registered businesses that make dairy products, such as ghee, paneer or packaged milk. Keeping cows or buffaloes is not counted in it.',
}

// Which aggregate resource and note belong to which fallback category. Only these
// two: the Ministry publishes no district aggregate for the other kinds of work.
export const AGGREGATE_KINDS = {
  services: { kind: 'udyamServices', note_code: 'mknote.ministryServices' },
  manufacturing: { kind: 'udyamManufacturing', note_code: 'mknote.ministryManufacturing' },
}

export const METRIC_PRICE = 'wholesale_price_per_kg'
export const METRIC_COUNT = 'registered_units'

// The English category values CATEGORY_SYNONYMS in scheme_service.py keys off.
// `other` is absent on purpose: the Other button sends typed text, so a row for
// the literal word would never be reached.
export const CATEGORIES = ['agriculture', 'dairy', 'food processing', 'handicrafts', 'manufacturing', 'retail', 'services', 'tailoring']

export const MIN_COUNT = 10
export const MIN_DAYS = 8
export const STALE_AFTER_DAYS = 8
export const DROP_AFTER_DAYS = 30
export const LAST_DATES = 30
export const MAX_AGRI_ROWS = 3
export const MAX_UNPARSEABLE_SHARE = 0.01

// ---------------------------------------------------------------- the key

// Takes the TEXT of a .env file (or its raw bytes), never a path, so this module
// cannot be the thing that opens it. Error messages never quote the value.
export function parseEnvKey(input) {
  let text
  if (input instanceof Uint8Array) {
    const b = input
    if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff) || b.includes(0)) return { error: utf16Error() }
    text = new TextDecoder('utf-8').decode(b)
  } else if (typeof input === 'string') {
    text = input
  } else {
    return { error: 'The .env file could not be read as text.' }
  }
  // A UTF-16 file read as UTF-8 shows up as NULs between the letters, and its
  // byte-order mark as two replacement characters (or as U+FFFE if it was
  // decoded with the wrong byte order).
  if (text.includes('\u0000') || text.startsWith('\uFFFD\uFFFD') || text.startsWith('\uFFFE')) return { error: utf16Error() }
  if (text.startsWith('\uFEFF')) text = text.slice(1)

  let value = null
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?DATA_GOV_IN_API_KEY\s*=(.*)$/.exec(line)
    if (m) value = m[1] // the last one wins, as it does for dotenv
  }
  if (value === null) return { error: `No ${KEY_VAR}= line in .env. Copy .env.example to .env and paste your key after the = sign.` }
  return checkKeyValue(value)
}

// Shared by the .env path and the environment-variable path, so both refuse the
// same things.
export function checkKeyValue(raw) {
  let v = String(raw ?? '').trim()
  const q = v[0]
  if (v.length >= 2 && (q === '"' || q === "'") && v.endsWith(q)) {
    v = v.slice(1, -1).trim()
  } else {
    v = v.replace(/\s+#.*$/, '').trim() // an unquoted inline comment
  }
  if (!v) return { error: `${KEY_VAR} is empty. Paste your data.gov.in key after the = sign.` }
  if (v === PLACEHOLDER_KEY) return { error: `${KEY_VAR} is still the placeholder from .env.example. Replace it with your own data.gov.in key.` }
  if (v === SAMPLE_KEY) return { error: `${KEY_VAR} is the public sample key, which data.gov.in caps at 10 rows a page. Use your own key, or run with --sample for a smoke test.` }
  if (/\s/.test(v)) return { error: `${KEY_VAR} contains a space. Paste the key on one line with nothing after it.` }
  return { key: v }
}

function utf16Error() {
  return 'The .env file is saved as UTF-16. Save it as UTF-8 (in Notepad: File > Save as > Encoding: UTF-8) and run again.'
}

// Every line the fetch prints or logs goes through this. Beyond the key itself it
// masks any api-key= parameter and any api.data.gov.in URL, so an error message
// from the HTTP stack that quotes a URL cannot leak one either.
export function redact(text, key) {
  let s = String(text ?? '')
  if (key) {
    s = s.replaceAll(key, '[key]')
    const enc = encodeURIComponent(key)
    if (enc !== key) s = s.replaceAll(enc, '[key]')
  }
  s = s.replace(/api-key=[^&\s"'<>]*/gi, 'api-key=[key]')
  s = s.replace(/https?:\/\/api\.data\.gov\.in[^\s"'<>]*/gi, '[api url]')
  return s
}

// ---------------------------------------------------------------- queries

// Deliberately broad: any field with "name" in it is refused, so a renamed
// enterprise-name column is refused too. The cost is that the Ministry's
// district tables (udyamTotal, udyamServices) cannot be asked for
// fields=state_name,district_name, so those queries send no fields= at all.
// That is accepted: they hold one published total per district and no unit,
// person or address. fields= stays mandatory on udyamList, the per-unit list,
// which is the resource that carries names and addresses.
const PII_FIELDS = /name|address|pin/i

// Returns the query string WITHOUT the key. The readable form is what goes into
// provenance.query and the log; `encoded: true` is what goes on the wire, with
// brackets left as they are because that is the form the API documents.
export function buildQuery(resourceId, params, { encoded = false } = {}) {
  const pairs = Array.isArray(params) ? params : Object.entries(params ?? {})
  const out = []
  let fields = null
  for (const [k, v] of pairs) {
    if (v === undefined || v === null) continue
    const key = String(k)
    const value = String(v)
    if (/^api[-_ ]?key$/i.test(key)) throw new Error('buildQuery: the key is added by the request helper and must never be a query parameter.')
    if (key === 'fields') {
      if (PII_FIELDS.test(value)) throw new Error(`buildQuery: refusing fields=${value}. Names, addresses and PIN codes are personal data and are never fetched.`)
      fields = value
    }
    if (/registrationdate/i.test(key)) throw new Error('buildQuery: RegistrationDate is a per-unit keyword field; never filter, sort or range on it.')
    if (/^(sort|range)\[/i.test(key) && /price/i.test(key)) throw new Error('buildQuery: never sort or range on price on the server; the statistic is computed here.')
    out.push(encoded ? `${encodeKey(key)}=${encodeURIComponent(value)}` : `${key}=${value}`)
  }
  if (resourceId === RESOURCES.udyamList.id && !(fields && fields.trim())) {
    throw new Error('buildQuery: a Udyam list query must send fields=, or every row would carry names and addresses.')
  }
  return out.join('&')
}

function encodeKey(key) {
  return encodeURIComponent(key).replace(/%5B/gi, '[').replace(/%5D/gi, ']')
}

// ---------------------------------------------------------------- dates

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DMY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const DAY_MS = 86400000
const IST_MS = 330 * 60000

function validDate(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

const pad2 = (n) => String(n).padStart(2, '0')

export function isYmd(s) {
  const m = YMD_RE.exec(String(s ?? ''))
  return Boolean(m) && validDate(+m[1], +m[2], +m[3])
}

// 'dd/mm/yyyy' → 'yyyy-mm-dd'. Also passes an already-ISO date through, since a
// source that changes its date format should not silently lose every row.
export function ymd(value) {
  const s = String(value ?? '').trim()
  if (isYmd(s)) return s
  const m = DMY_RE.exec(s)
  if (!m || !validDate(+m[3], +m[2], +m[1])) return null
  return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`
}

// 'yyyy-mm-dd' → 'dd/mm/yyyy', the form the Agmarknet range filter takes.
export function dmy(value) {
  const m = YMD_RE.exec(String(value ?? ''))
  if (!m || !validDate(+m[1], +m[2], +m[3])) return null
  return `${m[3]}/${m[2]}/${m[1]}`
}

function ymdToMs(s) {
  const m = YMD_RE.exec(s)
  return Date.UTC(+m[1], +m[2] - 1, +m[3])
}

function msToYmd(ms) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function minusDays(day, n) {
  if (!isYmd(day)) return null
  return msToYmd(ymdToMs(day) - n * DAY_MS)
}

export function daysBetween(from, to) {
  if (!isYmd(from) || !isYmd(to)) return NaN
  return Math.round((ymdToMs(to) - ymdToMs(from)) / DAY_MS)
}

// data.gov.in sends updated_date in UTC. A resource updated at 23:40 UTC was
// updated the NEXT day in India, and the attribution has to carry India's date.
// A timestamp with no zone is read as UTC rather than as the machine's local time.
function parseUtc(iso) {
  let s = String(iso ?? '').trim()
  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z'
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

export function toIstDate(iso) {
  const t = parseUtc(iso)
  return t === null ? null : msToYmd(t + IST_MS)
}

export function istTimestamp(ms) {
  const d = new Date(Number(ms) + IST_MS)
  return `${msToYmd(d.getTime())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}+05:30`
}

// ---------------------------------------------------------------- numbers

export function round(x, places) {
  const n = Number(x)
  if (!Number.isFinite(n)) return NaN
  if (/e/i.test(String(n))) return Math.round(n * 10 ** places) / 10 ** places
  return Number(`${Math.round(Number(`${n}e${places}`))}e-${places}`)
}

// Linear interpolation between order statistics: h = (n - 1) p. The median is
// the same rule at p = 0.5, so the middle figure and its range cannot disagree
// about method.
export function quantile(sorted, p) {
  const n = sorted.length
  if (!n) return NaN
  const h = (n - 1) * p
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo])
}

export function median(values) {
  return quantile([...values].sort((a, b) => a - b), 0.5)
}

function toNumber(v) {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().replace(/,/g, '')
  return s === '' ? NaN : Number(s)
}

// ---------------------------------------------------------------- prices

// Trim, collapse whitespace, and strip a leading or trailing "APMC", so
// "Lucknow APMC", "Lucknow" and "APMC Lucknow " are one mandi. Case is kept for
// display; marketKey() folds it for counting and dedupe.
export function normaliseMarket(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ').replace(/^APMC\s+/i, '').replace(/\s+APMC$/i, '').trim()
}

export function marketKey(name) {
  return normaliseMarket(name).toLowerCase()
}

const sameText = (a, b) => String(a ?? '').trim().replace(/\s+/g, ' ').toLowerCase() === String(b ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const PRICE_DROPS = ['zero', 'nonnumeric', 'out_of_range', 'out_of_band', 'dupes', 'wrong_place']
export const emptyPriceDrops = () => Object.fromEntries(PRICE_DROPS.map((k) => [k, 0]))

// Order of the checks, and why:
//   1. wrong_place first, over every row: a row for another place is not ours at
//      all, and a spike here means the server-side filter did not do its job.
//   2. the commodity whitelist and variety allow-list: rows of other commodities
//      are not errors, so they are `skipped`, not `dropped`.
//   3. nonnumeric (price or date), zero, out_of_range.
//   4. dupes, keeping the first.
//   5. ₹/quintal → ₹/kg, then the commodity's kg_band (out_of_band).
// `droppedBy` carries the same counts per commodity, which is what each price
// row's provenance reports; `dropped` is the district-wide total.
export function cleanPriceRows(rows, { state, districts, commodities }) {
  const byCode = new Map((commodities ?? []).map((c) => [Number(c.code), c]))
  const allowedDistricts = [].concat(districts ?? [])
  const dropped = emptyPriceDrops()
  const droppedBy = {}
  const skipped = { not_listed: 0, variety: 0 }
  const warnings = []
  const warned = new Set()
  const seen = new Set()
  const out = []

  const drop = (reason, c) => {
    dropped[reason]++
    if (c) (droppedBy[c.id] ??= emptyPriceDrops())[reason]++
  }

  for (const r of rows ?? []) {
    const c = byCode.get(toNumber(r?.Commodity_Code))
    if (!sameText(r?.State, state) || !allowedDistricts.some((d) => sameText(r?.District, d))) { drop('wrong_place', c); continue }
    if (!c) { skipped.not_listed++; continue }
    if (c.varieties && !c.varieties.some((v) => sameText(v, r?.Variety))) { skipped.variety++; continue }
    const name = String(r?.Commodity ?? '').trim()
    if (name !== c.source_name && !warned.has(`${c.code}|${name}`)) {
      warned.add(`${c.code}|${name}`)
      warnings.push(`Commodity_Code ${c.code} is named "${name}" in the source; expected "${c.source_name}". Kept, matched by code.`)
    }

    const date = ymd(r?.Arrival_Date)
    const modal = toNumber(r?.Modal_Price)
    const min = toNumber(r?.Min_Price)
    const max = toNumber(r?.Max_Price)
    if (Number.isNaN(modal) || !date) { drop('nonnumeric', c); continue }
    if (modal <= 0) { drop('zero', c); continue }
    if (min > 0 && max > 0 && (modal < min || modal > max)) { drop('out_of_range', c); continue }

    const mKey = marketKey(r?.Market)
    const key = [String(r?.State).trim().toLowerCase(), String(r?.District).trim().toLowerCase(), mKey, c.code,
      String(r?.Variety ?? '').trim().toLowerCase(), String(r?.Grade ?? '').trim().toLowerCase(), date].join('|')
    if (seen.has(key)) { drop('dupes', c); continue }
    seen.add(key)

    const modalKg = modal / 100
    const [lo, hi] = c.kg_band
    if (modalKg < lo || modalKg > hi) { drop('out_of_band', c); continue }

    out.push({ date, market: normaliseMarket(r?.Market), market_key: mKey, commodity_id: c.id, modal_kg: modalKg })
  }
  return { rows: out, dropped, droppedBy, skipped, warnings }
}

// Per commodity: the daily median of modal ₹/kg over every remaining row that
// day, then the median and P10/P90 of the last 30 of those daily medians. A
// daily median first, so one mandi that reports ten varieties a day cannot
// outvote one that reports a single row.
//
// A date after the fetch date is a data-entry error, not a price: it is left out
// before the last-30 cut (so it cannot push a real day out) and counted in
// `future_dates` on the result, for the fetch to log.
export function priceStatistic(rows, { fetchDateYmd }) {
  if (!isYmd(fetchDateYmd)) throw new Error(`priceStatistic: fetchDateYmd "${fetchDateYmd}" is not yyyy-mm-dd.`)
  const byCommodity = new Map()
  for (const r of rows ?? []) {
    if (!byCommodity.has(r.commodity_id)) byCommodity.set(r.commodity_id, [])
    byCommodity.get(r.commodity_id).push(r)
  }
  const stats = []
  const rejected = []
  for (const id of [...byCommodity.keys()].sort()) {
    const list = byCommodity.get(id)
    const byDate = new Map()
    for (const r of list) {
      if (!byDate.has(r.date)) byDate.set(r.date, [])
      byDate.get(r.date).push(r)
    }
    const allDates = [...byDate.keys()].sort()
    const futureDates = allDates.filter((d) => d > fetchDateYmd).length
    const dates = allDates.filter((d) => d <= fetchDateYmd).slice(-LAST_DATES)
    const daily = dates.map((d) => median(byDate.get(d).map((r) => r.modal_kg))).sort((a, b) => a - b)
    const used = dates.flatMap((d) => byDate.get(d))
    const nDays = dates.length
    const last = dates[dates.length - 1] ?? null
    const age = last ? daysBetween(last, fetchDateYmd) : NaN
    const base = { commodity_id: id, n_days: nDays, last_reported: last, age_days: age, future_dates: futureDates }
    if (nDays < MIN_DAYS) { rejected.push({ ...base, reason: `only ${nDays} reporting day(s); at least ${MIN_DAYS} are needed` }); continue }
    if (!(age <= DROP_AFTER_DAYS)) { rejected.push({ ...base, reason: `last reported ${age} day(s) before the fetch; more than ${DROP_AFTER_DAYS} is too old to show` }); continue }
    const stat = {
      commodity_id: id,
      indicative_price: round(quantile(daily, 0.5), 2),
      price_low: round(quantile(daily, 0.1), 2),
      price_high: round(quantile(daily, 0.9), 2),
      n_days: nDays,
      n_markets: new Set(used.map((r) => r.market_key)).size,
      first_reported: dates[0],
      last_reported: last,
      rows_used: used.length,
      future_dates: futureDates,
    }
    if (age >= STALE_AFTER_DAYS) stat.stale = true
    stats.push(stat)
  }
  return { stats, rejected }
}

// Which three crops a district shows. Every stat here already cleared MIN_DAYS
// and DROP_AFTER_DAYS in priceStatistic, so reliability is settled; what is left
// is which crops a reader is most likely to grow. So: a stale figure goes last,
// then `order` decides, which is the order of tools/market-commodities.json,
// staples first. Then most reporting days and the id, which only matter for a
// crop missing from `order`, so a tie cannot reorder between two runs.
//
// It ranked on most days, then most rows, then the id until 24 September 2026.
// The first dry run showed why that was wrong: in Varanasi six crops tied at 30
// days on one mandi with one row a day, so the id picked garlic, ginger and green
// chilli over potato, onion and tomato. And more rows only means more varieties
// listed that day, not a steadier median.
export function pickAgricultureRows(stats, { order } = {}) {
  if (!Array.isArray(order)) throw new Error('pickAgricultureRows: order must be the list of commodity ids, staples first.')
  const rank = (id) => { const i = order.indexOf(id); return i < 0 ? Infinity : i }
  const byRank = (a, b) => { const x = rank(a.commodity_id), y = rank(b.commodity_id); return x === y ? 0 : x < y ? -1 : 1 }
  return [...(stats ?? [])]
    .sort((a, b) => (a.stale ? 1 : 0) - (b.stale ? 1 : 0) || byRank(a, b) || b.n_days - a.n_days ||
      (a.commodity_id < b.commodity_id ? -1 : a.commodity_id > b.commodity_id ? 1 : 0))
    .slice(0, MAX_AGRI_ROWS)
}

// ---------------------------------------------------------------- Udyam

// "49-96" means every two-digit prefix from 49 to 96. Both ends must have the
// same width, so the zero padding is unambiguous.
export function expandPrefixes(list) {
  const out = []
  for (const item of list ?? []) {
    const s = String(item).trim()
    const m = /^(\d+)-(\d+)$/.exec(s)
    if (m) {
      if (m[1].length !== m[2].length || +m[1] > +m[2]) throw new Error(`NIC map: range "${s}" must have two ends of the same width, low to high.`)
      for (let i = +m[1]; i <= +m[2]; i++) out.push(String(i).padStart(m[1].length, '0'))
    } else if (/^\d+$/.test(s)) {
      out.push(s)
    } else {
      throw new Error(`NIC map: "${s}" is neither a digit prefix nor a range.`)
    }
  }
  return out
}

const compiledMaps = new WeakMap()

export function compileNicMap(nicMap) {
  if (compiledMaps.has(nicMap)) return compiledMaps.get(nicMap)
  const categories = Object.entries(nicMap?.categories ?? {})
    .map(([name, cfg]) => ({ name, cfg, include: expandPrefixes(cfg.include), exclude: expandPrefixes(cfg.exclude ?? []) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const compiled = { version: nicMap?.version ?? null, categories }
  compiledMaps.set(nicMap, compiled)
  return compiled
}

// NIC codes as five-digit strings. A number loses its leading zero (01110 comes
// back as 1110), so a numeric code, or a digit string shorter than five, is
// padded back. Returns null when the field is not a JSON array, or when it lists
// activities none of which carries a usable code.
export function nicCodes(activities) {
  let list = activities
  if (typeof list === 'string') {
    try { list = JSON.parse(list) } catch { return null }
  }
  if (!Array.isArray(list)) return null
  const codes = new Set()
  for (const a of list) {
    const v = a?.NIC5DigitId
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) codes.add(String(v).padStart(5, '0'))
    else if (typeof v === 'string' && /^\d+$/.test(v.trim())) codes.add(v.trim().padStart(5, '0'))
  }
  if (list.length > 0 && codes.size === 0) return null
  return [...codes]
}

// A unit counts in a category when ANY of its codes starts with an include prefix
// and NONE of those matching codes starts with an exclude prefix. So a unit
// registered only for 10500 (dairy products) is not food processing, but it is
// dairy — and so is a unit that lists 10500 beside a bakery code, which drops
// out of food processing too: the exclude is read strictly, as the map says.
export function classifyUnit(activities, nicMap) {
  const codes = nicCodes(activities)
  if (codes === null) return null
  const set = new Set()
  for (const cat of compileNicMap(nicMap).categories) {
    const matching = codes.filter((code) => cat.include.some((p) => code.startsWith(p)))
    if (matching.length && !matching.some((code) => cat.exclude.some((p) => code.startsWith(p)))) set.add(cat.name)
  }
  return set
}

export function emptyTally(nicMap) {
  return { rows: 0, used: 0, unparseable: 0, wrong_place: 0, counts: Object.fromEntries(compileNicMap(nicMap).categories.map((c) => [c.name, 0])) }
}

// Adds one page of list rows to a tally and returns a NEW tally. Only counts are
// kept: a tally is what gets checkpointed, and a raw Udyam row carries a name and
// an address that must never reach the disk.
export function addToTally(tally, records, { lgd, nicMap }) {
  const t = { ...tally, counts: { ...tally.counts } }
  for (const r of records ?? []) {
    t.rows++
    if (Number(r?.LG_DT_Code) !== Number(lgd)) { t.wrong_place++; continue }
    const cats = classifyUnit(r?.Activities, nicMap)
    if (cats === null) { t.unparseable++; continue }
    t.used++
    for (const c of cats) t.counts[c] = (t.counts[c] ?? 0) + 1
  }
  return t
}

export function tooManyUnparseable(tally) {
  return tally.rows > 0 && tally.unparseable / tally.rows > MAX_UNPARSEABLE_SHARE
}

export function sumTallies(tallies) {
  const out = { rows: 0, used: 0, unparseable: 0, wrong_place: 0, counts: {} }
  for (const t of tallies) {
    for (const k of ['rows', 'used', 'unparseable', 'wrong_place']) out[k] += t[k]
    for (const [c, n] of Object.entries(t.counts)) out.counts[c] = (out.counts[c] ?? 0) + n
  }
  return out
}

// The metric part of each list count row, alphabetical by category. Below 10 a
// count is suppressed rather than printed; dairy is not emitted at all below its
// own floor, because a "fewer than 10" line for a category the NIC map only
// reaches through one class says nothing a reader can use.
export function tallyToRows(tally, { nicMap, districtTotal }) {
  const total = Number.isInteger(districtTotal) && districtTotal > 0 ? districtTotal : null
  const rows = []
  for (const cat of compileNicMap(nicMap).categories) {
    const n = tally.counts?.[cat.name] ?? 0
    const floor = cat.cfg.emit_if_count_at_least
    if (Number.isFinite(floor) && n < floor) continue
    const suppressed = n < MIN_COUNT
    const row = {
      business_category: cat.name,
      count: suppressed ? null : n,
      count_suppressed: suppressed,
      share_percent: suppressed || total === null ? null : round((n / total) * 100, 1),
      district_total: total,
      nic_classes: (cat.cfg.include ?? []).map(String),
    }
    if (cat.cfg.note_code) Object.assign(row, noteFields(cat.cfg.note_code))
    rows.push(row)
  }
  return rows
}

// The Ministry's own district aggregate, for services and manufacturing only.
// `total` arrives as a string; anything that is not a whole number is refused.
export function aggregateToRow(category, record) {
  const spec = AGGREGATE_KINDS[category]
  if (!spec) throw new Error(`No Ministry aggregate exists for "${category}".`)
  const s = String(record?.total ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  const suppressed = n < MIN_COUNT
  return {
    business_category: category,
    count: suppressed ? null : n,
    count_suppressed: suppressed,
    share_percent: null,
    district_total: null,
    nic_classes: [],
    ...noteFields(spec.note_code),
  }
}

function noteFields(code) {
  if (!(code in NOTE_EN)) throw new Error(`Unknown note code "${code}".`)
  return { note_code: code, note: NOTE_EN[code] }
}

// ---------------------------------------------------------------- state rows

// A state row is honest only if it is built from EVERY district the dropdown
// lists for that state. So: every district must have a crosswalk entry, and each
// of those must have succeeded for this source.
export function stateRowEligibility({ stateDistricts, coveredDistricts, succeededDistricts }) {
  const covered = new Set(coveredDistricts ?? [])
  const ok = new Set(succeededDistricts ?? [])
  const all = stateDistricts ?? []
  const missing = all.filter((d) => !covered.has(d))
  const failed = all.filter((d) => covered.has(d) && !ok.has(d))
  return { eligible: all.length > 0 && missing.length === 0 && failed.length === 0, missing, failed }
}

// ---------------------------------------------------------------- provenance

export function resolveTitle(kind, apiTitle) {
  const expected = RESOURCES[kind].title
  const got = typeof apiTitle === 'string' ? apiTitle.trim() : ''
  if (!got) return { title: expected, warning: `The API sent no title for ${kind}; using the expected "${expected}".` }
  if (got !== expected) return { title: got, warning: `The API's title for ${kind} is "${got}", not the expected "${expected}". Using the API's title.` }
  return { title: got, warning: null }
}

export function attribution(kind, { updatedIso, title } = {}) {
  const r = RESOURCES[kind]
  if (!r?.page_url) throw new Error(`No attribution template for "${kind}".`)
  const day = toIstDate(updatedIso)
  if (!day) throw new Error(`attribution: "${updatedIso}" is not a timestamp.`)
  const [yyyy, mm, dd] = day.split('-')
  return `${r.publisher}, ${yyyy}, ${title || r.title}, Open Government Data Platform India, ${dd}/${mm}, ${r.page_url}. Published under ${LICENCE.name}: ${LICENCE.url}.`
}

export function priceMethod(scope) {
  const where = scope === 'state' ? 'every district of the state' : 'the district'
  return `The median of the daily median modal price, in rupees per kg, over the last ${LAST_DATES} reporting days or fewer across every reporting mandi in ${where}, with a range from the 10th to the 90th percentile of those daily medians.`
}

export function listMethod(scope) {
  const where = scope === 'state' ? 'summed over every district of the state' : 'for the district'
  return `A count of the units in the full Udyam unit list ${where} whose registered NIC 2008 activities include one of nic_classes, with a unit that lists several kinds of work counted under each heading it qualifies for.`
}

export function aggregateMethod(category) {
  const kind = category === 'services' ? 'service' : 'manufacturing'
  return `The Ministry of MSME's own published district total of registered ${kind} enterprises (micro, small and medium together), used as published.`
}

// `f` carries what only the fetch knows. The licence, page URL and attribution are
// filled in here so no call site can get them wrong.
export function makeProvenance(kind, f) {
  const r = RESOURCES[kind]
  return {
    resource_id: r.id,
    resource_title: f.title,
    publisher: r.publisher,
    resource_updated_date: { before: f.updatedBefore, after: f.updatedAfter },
    page_url: r.page_url,
    query: f.query,
    total_reported: f.total_reported,
    rows_fetched: f.rows_fetched,
    rows_used: f.rows_used,
    rows_dropped: f.rows_dropped,
    fetched_at: f.fetched_at,
    period_start: f.period_start,
    period_end: f.period_end,
    method: f.method,
    nic_map_version: f.nic_map_version ?? null,
    crosswalk_version: f.crosswalk_version,
    script_sha256: f.script_sha256,
    licence: LICENCE.name,
    licence_url: LICENCE.url,
    attribution: attribution(kind, { updatedIso: f.updatedAfter, title: f.title }),
  }
}

// ---------------------------------------------------------------- rows

export function priceRow({ place, stat, commodity, lastVerified, provenance }) {
  const row = {
    state: place.state,
    district: place.scope === 'state' ? '' : place.district,
    business_category: 'agriculture',
    scope: place.scope,
    metric: METRIC_PRICE,
    commodity: commodity.en,
    commodity_id: commodity.id,
    unit: 'kg',
    indicative_price: stat.indicative_price,
    price_low: stat.price_low,
    price_high: stat.price_high,
    n_days: stat.n_days,
    n_markets: stat.n_markets,
    last_reported: stat.last_reported,
  }
  if (stat.stale === true) row.stale = true
  return { ...row, source: SOURCE_EN['src.agmarknetMandi'], source_code: 'src.agmarknetMandi', last_verified: lastVerified, provenance }
}

export function countRow({ place, part, sourceCode, lastVerified, provenance }) {
  const { note_code: noteCode, note, ...figures } = part
  const row = {
    state: place.state,
    district: place.scope === 'state' ? '' : place.district,
    business_category: figures.business_category,
    scope: place.scope,
    metric: METRIC_COUNT,
    count: figures.count,
    count_suppressed: figures.count_suppressed,
    share_percent: figures.share_percent,
    district_total: figures.district_total,
    nic_classes: figures.nic_classes,
    source: SOURCE_EN[sourceCode],
    source_code: sourceCode,
  }
  if (noteCode) Object.assign(row, { note_code: noteCode, note })
  return { ...row, last_verified: lastVerified, provenance }
}

// ---------------------------------------------------------------- validation

const COMMON_KEYS = ['state', 'district', 'business_category', 'scope', 'metric', 'source', 'source_code', 'last_verified', 'provenance']
const PRICE_KEYS = ['commodity', 'commodity_id', 'unit', 'indicative_price', 'price_low', 'price_high', 'n_days', 'n_markets', 'last_reported']
const COUNT_KEYS = ['count', 'count_suppressed', 'share_percent', 'district_total', 'nic_classes']
const OPTIONAL_KEYS = { [METRIC_PRICE]: ['note_code', 'note', 'stale'], [METRIC_COUNT]: ['note_code', 'note'] }
const PROVENANCE_KEYS = ['resource_id', 'resource_title', 'publisher', 'resource_updated_date', 'page_url', 'query', 'total_reported',
  'rows_fetched', 'rows_used', 'rows_dropped', 'fetched_at', 'period_start', 'period_end', 'method', 'nic_map_version',
  'crosswalk_version', 'script_sha256', 'licence', 'licence_url', 'attribution']
const COUNT_DROPS = ['unparseable', 'wrong_place']

const PII_KEY = /name|address|pin|registrationdate|api.?key/i
// A data.gov.in key is 56 hex characters. The run is BOUNDED so the 64-character
// script_sha256 does not match inside itself; the fetch separately checks the
// serialised output for the actual key before any write.
const KEY_RUN = /(?<![0-9a-f])[0-9a-f]{56}(?![0-9a-f])/i
// The same list as FORBIDDEN_TEXT in backend/tests/test_market_data_guards.py,
// matched case-insensitively in every string value: the API host, the key
// parameter, and the Udyam list's personal-data column names.
const FORBIDDEN_TEXT = ['api-key', 'api.data.gov.in', 'enterprisename', 'communicationaddress', 'registrationdate', 'pincode']

const isInt = (v) => Number.isInteger(v)
const hasDecimals = (v, places) => typeof v === 'number' && Number.isFinite(v) && round(v, places) === v
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function walk(value, visit, path = []) {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, [...path, i]))
  else if (isPlainObject(value)) for (const [k, v] of Object.entries(value)) { visit({ key: k, path: [...path, k] }); walk(v, visit, [...path, k]) }
  else if (typeof value === 'string') visit({ string: value, path })
}

// The same invariants the backend guard test enforces, run on every row before
// the fetch will write. Returns a list of problems; an empty list is a pass.
export function validateRow(row, { commodities = [], nicMap = null } = {}) {
  const errs = []
  const bad = (msg) => errs.push(msg)
  if (!isPlainObject(row)) return ['row is not an object']

  const metric = row.metric
  if (metric !== METRIC_PRICE && metric !== METRIC_COUNT) bad(`metric "${metric}" is not ${METRIC_PRICE} or ${METRIC_COUNT}`)
  const extra = metric === METRIC_PRICE ? PRICE_KEYS : metric === METRIC_COUNT ? COUNT_KEYS : []
  const allowed = new Set([...COMMON_KEYS, ...extra, ...(OPTIONAL_KEYS[metric] ?? ['note_code', 'note'])])
  for (const k of [...COMMON_KEYS, ...extra]) if (!(k in row)) bad(`missing key "${k}"`)
  for (const k of Object.keys(row)) {
    if (!allowed.has(k)) bad(`unexpected key "${k}" on a ${metric} row`)
    if (/_codes?$/.test(k) && k !== 'source_code' && k !== 'note_code') bad(`"${k}" ends in _code; keycheck would read it as a translation code`)
  }

  walk(row, ({ key, string, path }) => {
    if (key !== undefined && PII_KEY.test(key)) bad(`key "${path.join('.')}" looks like personal data or a secret`)
    if (string !== undefined && (KEY_RUN.test(string) || /api-key/i.test(string))) bad(`string at "${path.join('.')}" looks like an API key or carries api-key`)
    if (string !== undefined) {
      const lowered = string.toLowerCase()
      for (const f of FORBIDDEN_TEXT) if (lowered.includes(f)) bad(`string at "${path.join('.')}" contains "${f}"`)
    }
  })

  if (typeof row.state !== 'string' || !row.state) bad('state must be a non-empty string')
  if (row.scope !== 'district' && row.scope !== 'state') bad(`scope "${row.scope}" is not district or state`)
  if (row.scope === 'state' && row.district !== '') bad('a state row must have district ""')
  if (row.scope === 'district' && (typeof row.district !== 'string' || !row.district)) bad('a district row must name its district')
  if (!CATEGORIES.includes(row.business_category)) bad(`business_category "${row.business_category}" is not a category value`)
  if (!(row.source_code in SOURCE_EN)) bad(`source_code "${row.source_code}" is not one of ${Object.keys(SOURCE_EN).join(', ')}`)
  else if (row.source !== SOURCE_EN[row.source_code]) bad('source is not the English of source_code')
  if (!isYmd(row.last_verified)) bad('last_verified is not yyyy-mm-dd')

  const hasCode = 'note_code' in row
  const hasNote = 'note' in row
  if (hasCode !== hasNote) bad('note_code and note must be both present or both absent')
  if (hasCode && hasNote) {
    if (!(row.note_code in NOTE_EN)) bad(`note_code "${row.note_code}" is unknown`)
    else if (row.note !== NOTE_EN[row.note_code]) bad('note is not the English of note_code')
  }

  const p = row.provenance
  if (!isPlainObject(p)) {
    bad('provenance must be an object')
  } else {
    for (const k of PROVENANCE_KEYS) if (!(k in p)) bad(`provenance is missing "${k}"`)
    // Closed, like the row itself: an extra key here is how a raw API record or
    // a debugging field would ride into the shipped file unnoticed.
    for (const k of Object.keys(p)) if (!PROVENANCE_KEYS.includes(k)) bad(`unexpected key "provenance.${k}"`)
    if (p.licence !== LICENCE.name) bad('provenance.licence is not GODL-India')
    if (p.licence_url !== LICENCE.url) bad('provenance.licence_url is not the GODL-India URL')
    if (typeof p.attribution !== 'string' || !p.page_url || !p.attribution.includes(p.page_url) || !p.attribution.includes(LICENCE.url)) {
      bad('provenance.attribution must contain the page URL and the licence URL')
    }
    if (typeof p.query !== 'string' || /api-key/i.test(p.query)) bad('provenance.query must be a string without api-key')
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/.test(String(p.fetched_at))) bad('provenance.fetched_at must be ISO with +05:30')
    if (!isPlainObject(p.resource_updated_date) || typeof p.resource_updated_date.before !== 'string' || typeof p.resource_updated_date.after !== 'string'
      || Object.keys(p.resource_updated_date).sort().join() !== 'after,before') {
      bad('provenance.resource_updated_date must be {before, after}')
    }
    if (!isYmd(p.period_end)) bad('provenance.period_end is not yyyy-mm-dd')
    if (!/^[0-9a-f]{64}$/.test(String(p.script_sha256))) bad('provenance.script_sha256 is not a sha256')
    if (typeof p.method !== 'string' || !p.method) bad('provenance.method must be a sentence')
    for (const k of ['total_reported', 'rows_fetched', 'rows_used']) if (!isInt(p[k]) || p[k] < 0) bad(`provenance.${k} must be a whole number`)
    const drops = metric === METRIC_PRICE ? PRICE_DROPS : COUNT_DROPS
    if (!isPlainObject(p.rows_dropped) || Object.keys(p.rows_dropped).sort().join() !== [...drops].sort().join() || !drops.every((k) => isInt(p.rows_dropped[k]) && p.rows_dropped[k] >= 0)) {
      bad(`provenance.rows_dropped must be {${drops.join(', ')}}`)
    }
  }

  if (metric === METRIC_PRICE) {
    const c = commodities.find((x) => x.id === row.commodity_id)
    if (row.business_category !== 'agriculture') bad('a price row must be agriculture')
    if (row.source_code !== 'src.agmarknetMandi') bad('a price row must come from Agmarknet')
    if (!c) bad(`commodity_id "${row.commodity_id}" is not in tools/market-commodities.json`)
    else if (row.commodity !== c.en) bad('commodity is not the English of its commodity_id')
    if (row.unit !== 'kg') bad('unit must be "kg"')
    for (const k of ['indicative_price', 'price_low', 'price_high']) if (!hasDecimals(row[k], 2) || row[k] < 0) bad(`${k} must be a number with at most 2 decimals`)
    if (!(row.price_low <= row.indicative_price && row.indicative_price <= row.price_high)) bad('price_low <= indicative_price <= price_high does not hold')
    if (!isInt(row.n_days) || row.n_days < MIN_DAYS) bad(`n_days must be a whole number of at least ${MIN_DAYS}`)
    if (!isInt(row.n_markets) || row.n_markets < 1) bad('n_markets must be a whole number of at least 1')
    if (!isYmd(row.last_reported)) bad('last_reported is not yyyy-mm-dd')
    if ('stale' in row && row.stale !== true) bad('stale may only be present as true')
    if (isPlainObject(p)) {
      if (p.resource_id !== RESOURCES.agmarknet.id) bad('a price row must cite the Agmarknet history resource')
      if (p.nic_map_version !== null) bad('provenance.nic_map_version must be null on a price row')
      if (!isYmd(p.period_start)) bad('provenance.period_start is not yyyy-mm-dd')
      if (p.period_end !== row.last_reported) bad('provenance.period_end must be the last date used')
    }
  } else if (metric === METRIC_COUNT) {
    if (!(row.count === null || (isInt(row.count) && row.count >= MIN_COUNT))) bad(`count must be null or a whole number of at least ${MIN_COUNT}`)
    if (typeof row.count_suppressed !== 'boolean' || row.count_suppressed !== (row.count === null)) bad('count_suppressed must be true exactly when count is null')
    if (!(row.share_percent === null || (hasDecimals(row.share_percent, 1) && row.share_percent >= 0 && row.share_percent <= 100))) bad('share_percent must be null or a number with 1 decimal')
    if (!(row.district_total === null || (isInt(row.district_total) && row.district_total > 0))) bad('district_total must be null or a whole number')
    if (!Array.isArray(row.nic_classes) || !row.nic_classes.every((x) => typeof x === 'string')) bad('nic_classes must be an array of strings')
    if (row.count_suppressed && row.share_percent !== null) bad('a suppressed count must have a null share')
    if (row.share_percent !== null && (row.count === null || row.district_total === null || round((row.count / row.district_total) * 100, 1) !== row.share_percent)) {
      bad('share_percent does not equal count / district_total to 1 decimal')
    }
    if (row.source_code === 'src.udyamAggregate') {
      const spec = AGGREGATE_KINDS[row.business_category]
      if (!spec) bad('an aggregate row must be services or manufacturing')
      if (row.share_percent !== null || row.district_total !== null) bad('an aggregate row must have a null share and a null district_total')
      if (Array.isArray(row.nic_classes) && row.nic_classes.length) bad('an aggregate row must have nic_classes []')
      if (spec && row.note_code !== spec.note_code) bad(`an aggregate ${row.business_category} row must carry ${spec.note_code}`)
      if (spec && isPlainObject(p) && p.resource_id !== RESOURCES[spec.kind].id) bad('the aggregate row cites the wrong resource')
      if (isPlainObject(p) && p.nic_map_version !== null) bad('provenance.nic_map_version must be null on an aggregate row: no NIC map was used')
    } else if (row.source_code === 'src.udyamList') {
      if (row.business_category === 'agriculture') bad('agriculture gets prices only, never a count')
      const cat = nicMap ? compileNicMap(nicMap).categories.find((c) => c.name === row.business_category) : null
      if (nicMap && !cat) bad(`"${row.business_category}" is not in the NIC map`)
      if (cat && (row.note_code ?? null) !== (cat.cfg.note_code ?? null)) bad('the note does not match the NIC map for this category')
      if (row.scope === 'district' && row.district_total === null) bad('a district list row must carry the district total')
      if (isPlainObject(p) && p.resource_id !== RESOURCES.udyamList.id) bad('a list row must cite the Udyam list resource')
      if (isPlainObject(p) && !isInt(p.nic_map_version)) bad('provenance.nic_map_version must be the NIC map version on a list row')
    } else if (row.source_code === 'src.agmarknetMandi') {
      bad('a count row cannot come from Agmarknet')
    }
    if (isPlainObject(p) && p.period_start !== null) bad('provenance.period_start must be null on a count row')
    if (isPlainObject(p) && typeof p.resource_updated_date?.after === 'string' && p.period_end !== toIstDate(p.resource_updated_date.after)) {
      bad('provenance.period_end must be the IST date of resource_updated_date.after')
    }
  }
  return errs
}

// ---------------------------------------------------------------- output

export const placeKey = (row) => `${row.state}/${row.district ?? ''}`

export function rowIdentity(row) {
  const what = row.metric === METRIC_PRICE ? row.commodity_id : row.business_category
  return [row.state, row.district ?? '', row.metric ?? 'unsourced', what].join(' / ')
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// State, then the state row ahead of its districts, then district. Inside one
// place the price rows come first in the order they were emitted — file order is
// display order — then the count rows alphabetically.
export function sortRows(rows) {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => cmp(a.row.state, b.row.state)
      || (a.row.scope === 'state' ? 0 : 1) - (b.row.scope === 'state' ? 0 : 1)
      || cmp(a.row.district ?? '', b.row.district ?? '')
      || (a.row.metric === METRIC_PRICE ? 0 : 1) - (b.row.metric === METRIC_PRICE ? 0 : 1)
      || (a.row.metric === METRIC_PRICE ? 0 : cmp(a.row.business_category, b.row.business_category))
      || a.i - b.i)
    .map(({ row }) => row)
}

export function buildOutput(rows) {
  return `${JSON.stringify(sortRows(rows), null, 2)}\n`
}

// `--keep-others`: keep the old rows for every place this run did not attempt.
// Two refinements on "replace the places in this run", both so a partial run
// cannot quietly delete or contradict figures it never looked at:
//   - an old row is replaced only when its METRIC was fetched too, so
//     `--only=agmarknet` leaves a district's count rows alone. A legacy row with
//     no metric is replaced whenever its place is in the run.
//   - the old state row of any state the run touched goes, for the fetched
//     metrics, because it pooled districts whose figures have just moved. If the
//     run could rebuild it, the new one is in `newRows`.
export function mergeKeepOthers(oldRows, newRows, { places = [], metrics = [] } = {}) {
  const inRun = new Set(places)
  const fetched = new Set(metrics)
  const states = new Set([...inRun].map((p) => p.slice(0, p.lastIndexOf('/'))))
  const replaced = (r) => {
    const metricHit = r?.metric === undefined || fetched.has(r.metric)
    if (!metricHit) return false
    if (inRun.has(placeKey(r))) return true
    return r?.scope === 'state' && r?.metric !== undefined && states.has(r.state)
  }
  return [...oldRows.filter((r) => !replaced(r)), ...newRows]
}

function figures(row) {
  const keys = ['indicative_price', 'price_low', 'price_high', 'n_days', 'n_markets', 'last_reported', 'stale',
    'count', 'count_suppressed', 'share_percent', 'district_total', 'source_code', 'note_code']
  return JSON.stringify(keys.map((k) => row[k] ?? null))
}

export function diffSummary(oldRows, newRows) {
  const before = new Map(oldRows.map((r) => [rowIdentity(r), r]))
  const after = new Map(newRows.map((r) => [rowIdentity(r), r]))
  const added = [...after.keys()].filter((k) => !before.has(k)).sort()
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort()
  const changed = [...after.keys()].filter((k) => before.has(k) && figures(before.get(k)) !== figures(after.get(k))).sort()
  const unchanged = [...after.keys()].filter((k) => before.has(k) && figures(before.get(k)) === figures(after.get(k))).length
  const lines = [
    `diff: ${added.length} added, ${removed.length} removed, ${changed.length} changed, ${unchanged} unchanged`,
    ...added.map((k) => `  + ${k}`),
    ...removed.map((k) => `  - ${k}`),
    ...changed.map((k) => `  ~ ${k}`),
  ]
  return { added, removed, changed, unchanged, lines }
}

// Refuse a write that would remove more than half of the rows that came from a
// real fetch: that is far more likely a broken run than a real change.
export function vanishCheck(oldRows, newRows) {
  const kept = new Set(newRows.map(rowIdentity))
  const sourced = oldRows.filter((r) => isPlainObject(r?.provenance))
  const vanished = sourced.filter((r) => !kept.has(rowIdentity(r))).length
  const fraction = sourced.length ? vanished / sourced.length : 0
  return { sourced: sourced.length, vanished, fraction, refuse: fraction > 0.5 }
}

// ---------------------------------------------------------------- crosswalk

export function normaliseName(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

// Proposes crosswalk entries for dropdown districts that have none yet, matched
// by normalised name WITHIN the same state and through the alias table. Anything
// that matches twice is ambiguous and anything that matches nothing is unmatched:
// both are listed for a person to decide, never guessed.
export function proposeCrosswalk({ states, aggregateRows, todayPairs, crosswalk }) {
  // Both sides go through the alias table: a dropdown that still says Faizabad
  // must meet a source that says Ayodhya, and the reverse.
  const aliases = crosswalk?.aliases ?? {}
  const canon = (table, name) => {
    const n = normaliseName(name)
    const target = aliases[table]?.[n]
    return target ? normaliseName(target) : n
  }
  const existing = new Set((crosswalk?.entries ?? []).map((e) => `${e.state}/${e.district}`))
  const proposals = []
  const ambiguous = []
  const unmatched = []
  const noMandi = []
  for (const s of states) {
    const st = canon('state', s.name)
    const aggs = aggregateRows.filter((a) => canon('state', a.state_name) === st)
    const pairs = todayPairs.filter((p) => canon('state', p.State) === st)
    for (const d of s.districts) {
      if (existing.has(`${s.name}/${d}`)) continue
      const dn = canon('district', d)
      const hits = [...new Map(aggs.filter((a) => canon('district', a.district_name) === dn).map((a) => [String(a.lg_dt_code), a])).values()]
      if (hits.length === 0) { unmatched.push({ state: s.name, district: d }); continue }
      if (hits.length > 1) { ambiguous.push({ state: s.name, district: d, candidates: hits.map((a) => `${a.district_name} (${a.lg_dt_code})`) }); continue }
      const a = hits[0]
      if (!/^\d+$/.test(String(a.lg_dt_code)) || !/^\d+$/.test(String(a.state_id))) { ambiguous.push({ state: s.name, district: d, candidates: [`${a.district_name}: no numeric LGD code`] }); continue }
      const mandi = pairs.filter((p) => canon('district', p.District) === dn)
      const mandiStates = [...new Set(mandi.map((p) => p.State))]
      if (mandiStates.length > 1) { ambiguous.push({ state: s.name, district: d, candidates: mandiStates.map((x) => `Agmarknet state "${x}"`) }); continue }
      if (!mandi.length) noMandi.push({ state: s.name, district: d })
      proposals.push({
        state: s.name,
        district: d,
        lgd_state: Number(a.state_id),
        lgd_district: Number(a.lg_dt_code),
        udyam_district: a.district_name,
        agmarknet_state: mandiStates[0] ?? s.name,
        agmarknet_district: [...new Set(mandi.map((p) => p.District))].sort(),
        origin: 'auto',
      })
    }
  }
  return { proposals, ambiguous, unmatched, noMandi }
}

// Keeps the file's one-entry-per-line layout, so appending auto entries does not
// reformat the manual ones. The test round-trips the shipped file through this
// byte for byte.
export function serialiseCrosswalk(cw) {
  const aliases = `{ ${Object.entries(cw.aliases ?? {}).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`
  const entries = cw.entries.map((e) => `    ${JSON.stringify(e)}`).join(',\n')
  return `{ "version": ${JSON.stringify(cw.version)},\n  "aliases": ${aliases},\n  "entries": [\n${entries}\n  ] }\n`
}

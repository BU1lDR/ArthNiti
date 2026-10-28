// What an egg-price row says, and how the page it comes from is read.
//
// The National Egg Co-ordination Committee (NECC) publishes a Daily Rate Sheet:
// one table, a row per centre, a column per day of the month, whole numbers with
// no unit and " - " on a day nothing was published. fetch-necc-prices.mjs moves
// the bytes; every decision lives here, where tools/verify/necc-lib-test.mjs
// tests it on synthetic pages. No network and no files in this module.
//
// The decisions, and why:
//
//  - A price is the LAST number printed for the centre in the month on the page.
//    Nothing is averaged, filled in or carried over from an earlier month. NECC's
//    own Average column is not read at all: it disagrees with its own day cells
//    for one centre, so it is not a figure we can stand behind.
//  - The number is read as paise per egg (640 is Rs 6.40 an egg, Rs 640 for 100
//    eggs). NECC prints no unit, so UNIT_READING says it is our reading, on every
//    row. A number outside 1 to 20 rupees an egg is refused, never clamped: it
//    would be a unit or a page we have misread.
//  - A price 8 days old or more is marked stale, and one more than 30 days old is
//    not shown. Both numbers are market-lib's, so an egg row ages like a mandi row.
//  - A centre becomes a district through tools/necc-crosswalk.json. A centre it
//    does not know is reported and gets no row. Delhi is the one centre that is a
//    whole state, and it is the only state-scope row.
//  - The clarification NECC prints above its sheet travels with every row.

import { DROP_AFTER_DAYS, STALE_AFTER_DAYS, daysBetween, dmy, isYmd, round } from './market-lib.mjs'

export const NECC_URL = 'https://www.e2necc.com/home/eggprice'
export const PUBLISHER = 'National Egg Co-ordination Committee (NECC)'
export const SHEET = 'Daily Rate Sheet'
export const SOURCE_CODE = 'src.necc'
export const SOURCE_EN = 'Daily egg prices published by the National Egg Co-ordination Committee (NECC)'
export const METRIC = 'egg_price'
export const CATEGORY = 'poultry'

// The first three sentences of the clarification NECC prints above its sheet,
// word for word. The fourth asks anyone who passes the prices on to include the
// clarification, which is why every row carries it.
export const CLARIFICATION =
  'The daily egg prices suggested by NECC, on its official website or through any other medium ' +
  '(including verbal, print and digital media) are merely suggestive and not mandatory. ' +
  'The suggested prices are published solely for the reference and information of the trade and industry. ' +
  'NECC does not by itself or through any person enforce compliance or adherence with such suggested egg prices ' +
  'in any manner whatsoever.'

export const UNIT_READING =
  'NECC prints each price as a whole number with no unit. It is read here as paise per egg, ' +
  'so 640 means ₹6.40 an egg, which is also ₹640 for 100 eggs.'

export const PERMISSION = 'Used with the agreement of NECC, given by e-mail in October 2026.'

export const METHOD =
  'The last price NECC printed for this centre in the month shown, read by tools/fetch-necc-prices.mjs. ' +
  'Nothing is averaged or estimated.'

// One to twenty rupees an egg, in the paise NECC prints.
export const PRICE_MIN = 100
export const PRICE_MAX = 2000

const PRICE_KINDS = ['suggested', 'prevailing']

export const ROW_KEYS = [
  'state', 'district', 'business_category', 'scope', 'metric', 'price_kind', 'centre', 'unit',
  'indicative_price', 'last_reported', 'stale', 'source', 'source_code', 'last_verified', 'provenance',
]

export const PROVENANCE_KEYS = [
  'publisher', 'page_url', 'sheet', 'month', 'centre_label', 'published_value', 'unit_reading',
  'permission', 'fetched_at', 'method', 'crosswalk_version', 'script_sha256', 'clarification', 'attribution',
]

// Contact details of the people behind the data must never reach a row. The
// at-sign is written as an escape so that this file itself holds none.
const EMAIL = /[\w.+-]+\x40[\w-]+\.[\w.]+/
const PHONE = /\d(?:[ -]?\d){9,}/
const SHA256 = /^[0-9a-f]{64}$/

const DAY_COLUMNS = 31
const pad2 = (n) => String(n).padStart(2, '0')

// ---------------------------------------------------------------- reading the page

const ENTITIES = new Map([['nbsp', ' '], ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"]])

function decode(text) {
  return text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, dec, hex, name) => {
    if (name) return ENTITIES.get(name.toLowerCase()) ?? all
    const code = dec ? Number(dec) : parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : all
  })
}

// Tags go first, so an encoded tag stays text. Whitespace, the no-break space
// included, collapses to one space: NECC prints "Ranchi  (CC)" with two.
const plain = (html) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

const cellsOf = (row) =>
  [...row.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((m) => ({ tag: m[1].toLowerCase(), text: plain(m[2]) }))

// The value of the option that is marked selected in the list with this id.
function selectedOption(html, id) {
  const list = new RegExp(`<select\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</select>`, 'i').exec(html)
  if (!list) return null
  for (const [, attributes] of list[1].matchAll(/<option\b([^>]*)>/gi)) {
    if (!/\bselected\b/i.test(attributes)) continue
    const value = /\bvalue=(?:"([^"]*)"|'([^']*)')/i.exec(attributes)
    return value ? (value[1] ?? value[2]) : null
  }
  return null
}

const SECTIONS = new Map([['necc suggested egg prices', 'suggested'], ['prevailing prices', 'prevailing']])

function checkHeader(cells) {
  const days = cells.slice(1, -1).map((c) => c.text)
  const numbered = days.length === DAY_COLUMNS && days.every((d, i) => d === String(i + 1))
  if (!numbered || !/^average$/i.test(cells[cells.length - 1].text)) {
    throw new Error(`expected 31 day columns numbered 1 to 31 and then Average, found ${days.length} day columns`)
  }
}

function priceOf(text, label, day) {
  if (text === '' || text === '-') return null
  if (!/^\d{1,9}$/.test(text)) throw new Error(`"${label}" day ${day} says "${text}", which is neither a whole number nor a dash`)
  return Number(text)
}

// -> { month: 'yyyy-mm', rows: [{ section, label, days: [31 numbers or null] }] }.
// Anything it does not recognise is an error and not a guess: a page that has
// changed shape must stop the run, because real people read what comes out.
export function parseEggSheet(html) {
  const page = String(html ?? '')

  const month = selectedOption(page, 'ddlMonth')
  if (!/^(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error(`the page has no selected month (ddlMonth gave ${JSON.stringify(month)})`)
  const year = selectedOption(page, 'ddlYear')
  if (!/^\d{4}$/.test(year ?? '')) throw new Error(`the page has no selected year (ddlYear gave ${JSON.stringify(year)})`)

  const rows = []
  const labels = new Set()
  let section = null
  let sawHeader = false

  for (const [, inner] of page.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const cells = cellsOf(inner)
    if (!sawHeader) {
      // The month and year lists sit in rows of their own above the sheet, with
      // <th> labels of their own. The sheet's header is the first row of <th> only.
      if (cells.length > 1 && cells.every((c) => c.tag === 'th')) {
        checkHeader(cells)
        sawHeader = true
      }
      continue
    }
    if (cells.length === 1) {
      section = SECTIONS.get(cells[0].text.toLowerCase())
      if (!section) throw new Error(`unknown section "${cells[0].text}"`)
      continue
    }
    const label = cells[0]?.text ?? ''
    if (cells.length !== DAY_COLUMNS + 2) {
      throw new Error(`${label ? `"${label}"` : 'a row'} has ${cells.length} cells, expected 33 cells (a name, 31 days and the average)`)
    }
    if (!label) throw new Error('a row of prices has no centre name')
    if (!section) throw new Error(`"${label}" comes before any section row`)
    if (labels.has(label)) throw new Error(`"${label}" appears twice on the page`)
    labels.add(label)
    rows.push({ section, label, days: cells.slice(1, DAY_COLUMNS + 1).map((c, i) => priceOf(c.text, label, i + 1)) })
  }

  if (!sawHeader) throw new Error('the page has no header row of day columns')
  if (rows.length === 0) throw new Error('the page lists no centres')
  return { month: `${year}-${month}`, rows }
}

// The last price on a centre's row, with its day of the month, or null.
export function lastPrice(days) {
  for (let i = days.length - 1; i >= 0; i--) {
    if (Number.isInteger(days[i])) return { day: i + 1, value: days[i] }
  }
  return null
}

// ---------------------------------------------------------------- rows

export const attributionOf = (month, today) => `${PUBLISHER}, ${SHEET} for ${month}, ${NECC_URL}, read on ${dmy(today)}.`

// -> { rows, tooOld, unpriced, missing, skipped, unmapped, bad }. Only `rows` is
// ever written. Every other list is a reason a centre has no row, and `missing`
// (a centre the crosswalk maps that the page no longer has) and `bad` (a price
// that cannot be right) are the two the command line treats as failures.
export function buildRows(parsed, { crosswalk, today, fetchedAt, scriptSha }) {
  if (!isYmd(today)) throw new Error(`the day of the run, ${JSON.stringify(today)}, is not a date`)
  const out = { rows: [], tooOld: [], unpriced: [], missing: [], skipped: [], unmapped: [], bad: [] }
  const entries = new Map(crosswalk.entries.map((e) => [e.necc, e]))
  const skipped = new Set(crosswalk.skipped.map((s) => s.necc))

  for (const { section, label, days } of parsed.rows) {
    if (skipped.has(label)) {
      out.skipped.push(label)
      continue
    }
    const entry = entries.get(label)
    if (!entry) {
      out.unmapped.push(label)
      continue
    }
    const last = lastPrice(days)
    if (!last) {
      out.unpriced.push(label)
      continue
    }
    const date = `${parsed.month}-${pad2(last.day)}`
    if (!isYmd(date)) throw new Error(`"${label}" has a price on day ${last.day} of ${parsed.month}, which is not a date`)
    const age = daysBetween(date, today)
    if (age < 0) {
      out.bad.push({ necc: label, reason: `its price is dated ${date}, after the day of the run, ${today}` })
      continue
    }
    if (age > DROP_AFTER_DAYS) {
      out.tooOld.push({ necc: label, date, age })
      continue
    }
    if (last.value < PRICE_MIN || last.value > PRICE_MAX) {
      out.bad.push({ necc: label, reason: `the number ${last.value} is outside ${PRICE_MIN} to ${PRICE_MAX}, which is 1 to 20 rupees an egg` })
      continue
    }
    out.rows.push({
      state: entry.state,
      district: entry.district,
      business_category: CATEGORY,
      scope: entry.district === '' ? 'state' : 'district',
      metric: METRIC,
      price_kind: section,
      centre: entry.centre,
      unit: 'egg',
      indicative_price: round(last.value / 100, 2),
      last_reported: date,
      stale: age >= STALE_AFTER_DAYS,
      source: SOURCE_EN,
      source_code: SOURCE_CODE,
      last_verified: today,
      provenance: {
        publisher: PUBLISHER,
        page_url: NECC_URL,
        sheet: SHEET,
        month: parsed.month,
        centre_label: label,
        published_value: last.value,
        unit_reading: UNIT_READING,
        permission: PERMISSION,
        fetched_at: fetchedAt,
        method: METHOD,
        crosswalk_version: crosswalk.version,
        script_sha256: scriptSha,
        clarification: CLARIFICATION,
        attribution: attributionOf(parsed.month, today),
      },
    })
  }

  const onPage = new Set(parsed.rows.map((r) => r.label))
  for (const entry of crosswalk.entries) if (!onPage.has(entry.necc)) out.missing.push(entry.necc)
  return out
}

// ---------------------------------------------------------------- the check before a write

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function differingKeys(name, object, wanted) {
  const extra = Object.keys(object).filter((k) => !wanted.includes(k))
  const missing = wanted.filter((k) => !(k in object))
  return extra.length || missing.length ? `${name} keys differ: extra ${JSON.stringify(extra)}, missing ${JSON.stringify(missing)}` : null
}

function* stringsOf(value, path = '') {
  if (typeof value === 'string') yield [path, value]
  else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* stringsOf(item, `${path}.${i}`)
  else if (isObject(value)) for (const [key, item] of Object.entries(value)) yield* stringsOf(item, path ? `${path}.${key}` : key)
}

// Every problem with one row, as sentences. [] is a pass. test_necc_data_guards.py
// runs the same checks, and more, over the file that was written.
export function validateRow(row) {
  if (!isObject(row)) return ['row is not an object']
  const rowKeys = differingKeys('row', row, ROW_KEYS)
  if (rowKeys) return [rowKeys]
  const p = row.provenance
  if (!isObject(p)) return ['provenance is not an object']
  const provenanceKeys = differingKeys('provenance', p, PROVENANCE_KEYS)
  if (provenanceKeys) return [provenanceKeys]

  const problems = []
  const bad = (text) => problems.push(text)

  if (row.business_category !== CATEGORY) bad('business_category is not "poultry"')
  if (row.metric !== METRIC) bad('metric is not "egg_price"')
  if (row.unit !== 'egg') bad('unit is not "egg"')
  if (!PRICE_KINDS.includes(row.price_kind)) bad(`price_kind ${JSON.stringify(row.price_kind)} is neither suggested nor prevailing`)
  if (typeof row.centre !== 'string' || !row.centre || row.centre !== row.centre.trim()) bad('centre is not a trimmed non-empty string')
  if (row.scope === 'district') {
    if (!row.district) bad('a district row has no district')
  } else if (row.scope === 'state') {
    if (row.district !== '') bad('a state row names a district')
  } else {
    bad(`scope ${JSON.stringify(row.scope)} is neither district nor state`)
  }

  const price = row.indicative_price
  const published = p.published_value
  const isNumber = typeof price === 'number' && Number.isFinite(price)
  if (!isNumber || price < PRICE_MIN / 100 || price > PRICE_MAX / 100) bad(`indicative_price ${price} is not a number from 1 to 20 rupees`)
  else if (round(price, 2) !== price) bad(`indicative_price ${price} has more than two decimals`)
  if (!Number.isInteger(published) || published < PRICE_MIN || published > PRICE_MAX) {
    bad(`provenance.published_value ${published} is not a whole number from ${PRICE_MIN} to ${PRICE_MAX}`)
  } else if (isNumber && round(published / 100, 2) !== price) {
    bad(`indicative_price ${price} is not provenance.published_value ${published} over 100`)
  }

  const reported = isYmd(row.last_reported)
  const verified = isYmd(row.last_verified)
  if (!reported) bad('last_reported is not a date')
  if (!verified) bad('last_verified is not a date')
  const month = p.month
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) bad('provenance.month is not yyyy-mm')
  else if (reported && row.last_reported.slice(0, 7) !== month) bad('last_reported is not in provenance.month')
  if (typeof row.stale !== 'boolean') bad('stale is not a boolean')
  if (reported && verified) {
    const age = daysBetween(row.last_reported, row.last_verified)
    if (age < 0) bad('last_reported is after last_verified')
    if (age > DROP_AFTER_DAYS) bad(`last_reported is ${age} days old, past the ${DROP_AFTER_DAYS} a row may show`)
    if (typeof row.stale === 'boolean' && row.stale !== age >= STALE_AFTER_DAYS) bad(`stale is ${row.stale} but the price is ${age} days old`)
  }

  if (row.source_code !== SOURCE_CODE) bad('source_code is not "src.necc"')
  if (row.source !== SOURCE_EN) bad('source is not the English of src.necc')
  if (p.clarification !== CLARIFICATION) bad("provenance.clarification is not NECC's own wording")
  if (p.unit_reading !== UNIT_READING) bad('provenance.unit_reading is not the agreed reading of the unit')
  for (const [key, wanted] of [['publisher', PUBLISHER], ['page_url', NECC_URL], ['sheet', SHEET], ['permission', PERMISSION], ['method', METHOD]]) {
    if (p[key] !== wanted) bad(`provenance.${key} is not ${JSON.stringify(wanted)}`)
  }
  if (verified && typeof month === 'string' && p.attribution !== attributionOf(month, row.last_verified)) {
    bad('provenance.attribution is not the NECC attribution sentence')
  }

  if (typeof p.fetched_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/.test(p.fetched_at)) {
    bad('provenance.fetched_at is not an India-time timestamp')
  } else if (p.fetched_at.slice(0, 10) !== row.last_verified) {
    bad('last_verified is not the date of provenance.fetched_at')
  }
  if (typeof p.script_sha256 !== 'string' || !SHA256.test(p.script_sha256)) bad('provenance.script_sha256 is not a sha256')
  if (!Number.isInteger(p.crosswalk_version) || p.crosswalk_version < 1) bad('provenance.crosswalk_version is not a positive whole number')
  if (typeof p.centre_label !== 'string' || !p.centre_label) bad('provenance.centre_label is empty')

  for (const [path, text] of stringsOf(row)) {
    const isHash = path === 'provenance.script_sha256' && SHA256.test(text)
    if (EMAIL.test(text) || (!isHash && PHONE.test(text))) bad(`string at "${path}" looks like contact details`)
  }
  return problems
}

// Every problem with a whole file's rows. An empty list is a problem, not a pass.
export function checkRows(rows) {
  if (!Array.isArray(rows)) return ['the rows are not a list']
  if (rows.length === 0) return ['there are no rows']

  const problems = []
  const seen = new Set()
  for (const row of rows) {
    const name = `${row?.state ?? '?'} / ${row?.district || 'the whole state'}`
    for (const problem of validateRow(row)) problems.push(`${name}: ${problem}`)
    // One egg price for a place, whatever its kind: a reader must never be handed two.
    const place = JSON.stringify([row?.state, row?.district])
    if (seen.has(place)) problems.push(`${name}: appears twice`)
    seen.add(place)
  }
  for (const key of ['fetched_at', 'script_sha256', 'crosswalk_version', 'month']) {
    if (new Set(rows.map((r) => r?.provenance?.[key])).size > 1) {
      problems.push(`provenance.${key} differs between rows, which come from one run`)
    }
  }
  return problems
}

// Two-space JSON in state, district order, the way market_data.json is written.
export function serialise(rows) {
  const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  const sorted = [...rows].sort((a, b) => order(a.state, b.state) || order(a.district, b.district))
  return `${JSON.stringify(sorted, null, 2)}\n`
}

// Reads the Daily Rate Sheet of the National Egg Co-ordination Committee (NECC)
// into backend/app/data/necc_egg_prices.json: the last price each egg centre
// printed this month, as a market row for the poultry button. Used with the
// agreement of NECC, and every row carries the clarification NECC prints above
// its sheet.
//
// It is a dry run unless --write is given: it reads the page, checks every row
// and prints what would be written, and writes nothing to backend/. What a row
// says is decided in necc-lib.mjs, where it is tested on synthetic pages; this
// file only moves bytes, and refuses to write anything that fails a check.
//
//   node tools/fetch-necc-prices.mjs                  a live dry run
//   node tools/fetch-necc-prices.mjs --write          the live run that writes the file
//   node tools/fetch-necc-prices.mjs --from FILE [--today yyyy-mm-dd]
//                                                     a dry run on a saved page
//
// One GET per run, of the page NECC serves to anyone: no key, no login, no
// cookie. A saved page is never the source of the shipped file, so --from
// refuses --write.
//
// Exit codes: 0 a clean run; 1 a finding or a refused argument, with nothing
// written; 2 the run itself failed (the page could not be read, or something
// unexpected broke), which is never a finding.

import { createHash } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { dmy, isYmd, istTimestamp } from './market-lib.mjs'
import { NECC_URL, buildRows, checkRows, parseEggSheet, serialise } from './necc-lib.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TOOLS = join(ROOT, 'tools')
const SELF = fileURLToPath(import.meta.url)
const LIB = join(TOOLS, 'necc-lib.mjs')
const CROSSWALK = join(TOOLS, 'necc-crosswalk.json')
const DATA_FILE = join(ROOT, 'backend', 'app', 'data', 'necc_egg_prices.json')
const DATA_NAME = 'backend/app/data/necc_egg_prices.json'

const USER_AGENT = 'ArthNiti egg-price reader (hackathon prototype; one read per run)'
const TIMEOUT_MS = 30_000

const USAGE = `Usage: node tools/fetch-necc-prices.mjs [--write]
       node tools/fetch-necc-prices.mjs --from FILE [--today yyyy-mm-dd]

  (no option)  read ${NECC_URL} once and report what would be written
  --write      write ${DATA_NAME}, if every check passes
  --from FILE  read a saved copy of the page instead (a dry run only)
  --today DAY  with --from, the day prices are aged against (default: today in India)`

// The same bytes the Python guard hashes: necc-lib.mjs, then this file.
const scriptSha = () => {
  const digest = createHash('sha256')
  for (const path of [LIB, SELF]) digest.update(readFileSync(path))
  return digest.digest('hex')
}

function writeAtomic(path, text) {
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, text)
    renameSync(tmp, path)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

function readArgs(argv) {
  try {
    const { values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        write: { type: 'boolean' },
        from: { type: 'string' },
        today: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    return { values, errors: [] }
  } catch (e) {
    return { values: {}, errors: [e.message] }
  }
}

function argumentProblems(values) {
  const problems = []
  if (values.write && values.from !== undefined) {
    problems.push('--write cannot be used with --from: a saved page is never the source of the shipped file.')
  }
  if (values.today !== undefined && values.from === undefined) {
    problems.push('--today needs --from: a live run is dated by the clock.')
  }
  if (values.today !== undefined && !isYmd(values.today)) {
    problems.push(`--today ${JSON.stringify(values.today)} is not a date (yyyy-mm-dd).`)
  }
  return problems
}

async function livePage() {
  const response = await fetch(NECC_URL, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const host = new URL(response.url).host
  if (host !== new URL(NECC_URL).host) throw new Error(`the request ended at ${host}, which is not NECC`)
  if (!response.ok) throw new Error(`NECC answered HTTP ${response.status}`)
  return response.text()
}

const names = (list) => list.map((n) => `"${n}"`).join(', ')
const where = (r) => (r.district ? `${r.state} / ${r.district}` : `${r.state} (whole state)`)
const rupees = (r) => `Rs ${r.indicative_price.toFixed(2)}`

function report({ built, parsed, today, source, findings, write }) {
  const lines = [
    `NECC Daily Rate Sheet for ${parsed.month}, read from ${source} on ${dmy(today)}.`,
    `${parsed.rows.length} centres on the page: ${built.rows.length} with a row, ${built.skipped.length} skipped on purpose, ` +
      `${built.unmapped.length} not in the crosswalk, ${built.unpriced.length} with no price this month, ${built.tooOld.length} too old.`,
    '',
    `${built.rows.length} row${built.rows.length === 1 ? '' : 's'}`,
    ...built.rows
      .toSorted((a, b) => (a.state + a.district).localeCompare(b.state + b.district))
      .map((r) => `  ${where(r).padEnd(46)} ${r.centre.padEnd(14)} ${rupees(r).padStart(9)}  ${r.price_kind.padEnd(10)} ${dmy(r.last_reported)}${r.stale ? '  stale' : ''}`),
  ]
  const notes = [
    [built.skipped, 'skipped on purpose (tools/necc-crosswalk.json says why)'],
    [built.unmapped, 'on the page and not in the crosswalk, so without a row (map it, or list it as skipped)'],
    [built.unpriced, 'no price yet this month, so without a row'],
    [built.tooOld.map((t) => `${t.necc} (${t.age} days)`), 'last priced more than 30 days ago, so without a row'],
  ].filter(([list]) => list.length)
  if (notes.length) lines.push('', 'Notes:', ...notes.map(([list, text]) => `  ${text}: ${names(list)}`))

  lines.push('')
  if (findings.length) lines.push('Findings:', ...findings.map((f) => `  ${f}`), '', 'Nothing was written. Fix the findings first.')
  else if (write) lines.push(`Writing ${DATA_NAME}.`)
  else lines.push(`Dry run: nothing was written. Pass --write to write ${DATA_NAME}.`)
  console.log(lines.join('\n'))
}

async function main() {
  const { values, errors } = readArgs(process.argv.slice(2))
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  const problems = errors.length ? errors : argumentProblems(values)
  if (problems.length) {
    console.error([...problems, '', USAGE].join('\n'))
    return 1
  }

  const crosswalk = JSON.parse(readFileSync(CROSSWALK, 'utf8'))
  const fromFile = values.from !== undefined
  const html = fromFile ? readFileSync(values.from, 'utf8') : await livePage()

  const now = istTimestamp(Date.now())
  const today = values.today ?? now.slice(0, 10)
  const fetchedAt = values.today === undefined ? now : `${today}T00:00:00+05:30`

  let parsed
  try {
    parsed = parseEggSheet(html)
  } catch (e) {
    console.log(`Nothing was written: this is not a page the reader knows how to read.\n  ${e.message}`)
    return 1
  }

  const built = buildRows(parsed, { crosswalk, today, fetchedAt, scriptSha: scriptSha() })
  const findings = [
    ...built.missing.map((n) => `missing: "${n}" is in the crosswalk and not on the page`),
    ...built.bad.map((b) => `"${b.necc}": ${b.reason}`),
    ...checkRows(built.rows),
  ]
  report({ built, parsed, today, source: fromFile ? values.from : NECC_URL, findings, write: Boolean(values.write) })
  if (findings.length) return 1

  if (values.write) {
    writeAtomic(DATA_FILE, serialise(built.rows))
    console.log(`Wrote ${built.rows.length} rows.`)
  }
  return 0
}

// exitCode is set first, so that redirected output is not cut short by the forced
// exit: an open connection to NECC would otherwise keep the process up.
main().then(
  (code) => {
    process.exitCode = code
    setTimeout(() => process.exit(code), 2000).unref()
  },
  (e) => {
    console.error(`The run itself failed, which is not a finding: ${e?.message ?? e}`)
    process.exitCode = 2
    setTimeout(() => process.exit(2), 2000).unref()
  },
)

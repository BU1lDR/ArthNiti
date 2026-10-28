// Does every i18n key the source actually USES resolve to a string?
//
// parity4.mjs proves the four dictionaries agree with each other. It cannot see
// the other half of the contract: whether a key a page asks for exists at all.
// Nothing imports a key name, so `t('money.leftt')` type-checks, lints and builds
// clean, then renders the literal text "money.leftt" on the page — t()'s last
// fallback is the key itself, deliberately, so the failure is visible rather than
// silent. This finds it without a browser.
//
// Method: collect every key defined in the `en` dict of the four files, derive the
// set of legitimate key PREFIXES from those keys, then scan every string literal in
// frontend/src. A literal whose prefix is a real i18n prefix but whose full text is
// not a defined key is a leak. Keying on the prefix set is what keeps the false
// positive rate at zero — CSS class names, URLs and file paths do not share a
// prefix with the dictionary.
//
// The BACKEND is the second source of keys, and it fails differently. Every
// sentence a Python service composes travels with a translation code, and every
// scheme in schemes.json carries codes for its own prose. Those codes are never
// written in frontend/src, so the scan above cannot see them — and they cannot
// leak a dotted name onto the page either, because tBackend()'s fallback is the
// English sentence the backend already sent, deliberately, so an untranslated
// scheme still renders. The consequence is the opposite failure: a code with no
// dictionary entry is silently English in all eight languages, on a page that is
// otherwise translated, with nothing anywhere reporting it. That is what the
// backend half below checks.
//
// Run from the repo root:  node tools/keycheck.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Exit 0: nothing found. 1: a finding. 2: the run could not check: the wrong
// working directory, an input file gone missing, a JSON input that does not
// parse, a dictionary file it reads no `en` key from, an `en` line whose key it
// cannot read, a map it reads from backendText.js (CATEGORY_KEYS, LEVEL_KEYS,
// COMMODITY_KEYS) that is not there, holds a line it cannot read or has no
// entries, or any other crash. A dictionary or map it could not read used to
// become findings for keys and values it never compared. Node's own exit on an
// uncaught error is also 1, which read as a finding, so anything thrown that
// nothing catches exits 2 instead.
process.on('uncaughtException', (error) => {
  console.error(error)
  process.exit(2)
})

const DICTS = [
  'frontend/src/i18n/strings.js',
  'frontend/src/i18n/resultStrings.js',
  'frontend/src/i18n/backendStrings.js',
  'frontend/src/i18n/schemeStrings.js',
]
const SRC = 'frontend/src'
const BACKEND_SERVICES = 'backend/app/services'
const SCHEMES_JSON = 'backend/app/data/schemes.json'
const MARKET_JSON = 'backend/app/data/market_data.json'
const NECC_JSON = 'backend/app/data/necc_egg_prices.json'
const BACKEND_TEXT = 'frontend/src/i18n/backendText.js'
// The market fetch tool's own inputs. They are read directly rather than only
// through market_data.json because that file can be empty (no fetch has run),
// and a code the fetch WILL emit should fail here before any data carries it.
const MARKET_LIB = 'tools/market-lib.mjs'
const NECC_LIB = 'tools/necc-lib.mjs'
const MARKET_NIC_MAP = 'tools/market-nic-map.json'
const MARKET_COMMODITIES = 'tools/market-commodities.json'

// --- what is defined -------------------------------------------------------
// A looser form of parity4.mjs's line parse: `const en = {` opens the dict, the
// next line starting `}` closes it, and a key line is any line in it that starts,
// at any indent, with `'some.key':`. Only `en` matters here — parity4 already
// guarantees the other seven carry the same keys. A key this misses would make
// every use of it a false finding, so it throws (exit 2) on an `en` line that
// starts like an entry but not with a single-quoted key, and on a file it reads
// no `en` key from. parity4 refuses, with a 2, every layout but its own.
const ENTRY_SHAPED = /^\s*["'][^"']+["']\s*:/
const defined = new Map() // key -> file it came from
for (const path of DICTS) {
  let lang = null
  let found = 0
  readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const open = line.match(/^const (\w+) = \{/)
    if (open) lang = open[1]
    if (/^\}/.test(line)) lang = null
    if (lang !== 'en') return
    const kv = line.match(/^\s*'([^']+)':/)
    if (kv) {
      defined.set(kv[1], path)
      found++
    } else if (ENTRY_SHAPED.test(line)) {
      throw new Error(`${path}:${i + 1}: cannot read the key on this en line, so every use of it would be a false ` +
        `finding: ${JSON.stringify(line)}. Write the key in single quotes, then the colon: 'some.key':`)
    }
  })
  if (!found) {
    throw new Error(`${path}: no en key read (no \`const en = {\` line, or no line in it starts 'some.key':), so ` +
      'every key it defines would be a false finding')
  }
}

const prefixes = new Set()
for (const key of defined.keys()) {
  const dot = key.indexOf('.')
  if (dot > 0) prefixes.add(key.slice(0, dot))
}

// --- what is used ----------------------------------------------------------
function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p)
  }
  return out
}

// The dictionaries define keys rather than use them, so they are left out of the
// scan. walk() returns paths in the platform's separator (join() on Windows gives
// backslashes) while DICTS is written with forward slashes, so both sides go
// through toPosix() before they are compared. The comparison used to turn DICTS
// into backslashes instead, which matched on Windows only: on Linux no file was
// excluded, and every key a dictionary defines was also counted as used.
const toPosix = (p) => p.replace(/\\/g, '/')
const DICT_PATHS = new Set(DICTS.map(toPosix))
const files = walk(SRC).filter((f) => !DICT_PATHS.has(toPosix(f)))

// Any single- or double-quoted literal shaped like a dotted key. Template literals
// with an interpolation cannot be resolved statically and are reported separately.
const LITERAL = /['"]([a-zA-Z][\w]*\.[\w.]+)['"]/g
const TEMPLATE = /`([a-zA-Z][\w]*\.)\$\{/g

const used = new Map() // key -> [ "file:line", ... ]
const dynamic = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const m of line.matchAll(LITERAL)) {
      const key = m[1]
      const dot = key.indexOf('.')
      if (!prefixes.has(key.slice(0, dot))) continue
      if (!used.has(key)) used.set(key, [])
      used.get(key).push(`${file}:${i + 1}`)
    }
    for (const m of line.matchAll(TEMPLATE)) {
      if (prefixes.has(m[1].slice(0, -1))) dynamic.push(`${file}:${i + 1}  \`${m[1]}\${...}\``)
    }
  })
}

// --- what the backend emits ------------------------------------------------
// Three separate producers, each able to go untranslated on its own.
const backendUsed = new Map() // key -> [ "source", ... ]
const noteBackend = (key, where) => {
  if (!key || typeof key !== 'string') return
  if (!backendUsed.has(key)) backendUsed.set(key, [])
  if (!backendUsed.get(key).includes(where)) backendUsed.get(key).push(where)
}

// 1. Codes written as literals in the Python services (adv.* obs.* rsn.* …).
for (const name of readdirSync(BACKEND_SERVICES).filter((f) => f.endsWith('.py'))) {
  const file = join(BACKEND_SERVICES, name)
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const m of line.matchAll(LITERAL)) {
        const key = m[1]
        if (!prefixes.has(key.slice(0, key.indexOf('.')))) continue
        noteBackend(key, `${file}:${i + 1}`)
      }
    })
}

// 2. Codes carried as data. Any field named *_code or *_codes, whatever it is
//    called, so a new one added to the dataset is covered without editing this.
const collectDataCodes = (path) => {
  for (const row of JSON.parse(readFileSync(path, 'utf8'))) {
    for (const [field, value] of Object.entries(row)) {
      if (!/_codes?$/.test(field)) continue
      for (const code of [].concat(value)) noteBackend(code, `${path} (${field})`)
    }
  }
}
collectDataCodes(SCHEMES_JSON)
collectDataCodes(MARKET_JSON)
collectDataCodes(NECC_JSON)

// 2b. Codes the fetch tools write into rows they have not produced yet.
//     market-lib.mjs spells every source_code and note_code out as a literal
//     (SOURCE_EN / NOTE_EN), necc-lib.mjs spells out its SOURCE_CODE, and the
//     NIC map carries the per-category note_code. A missing file throws rather
//     than being skipped: an absent input is not the same as a clean one.
for (const lib of [MARKET_LIB, NECC_LIB]) {
  readFileSync(lib, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const m of line.matchAll(/['"]((?:src|mknote)\.[A-Za-z]+)['"]/g)) {
        noteBackend(m[1], `${lib}:${i + 1}`)
      }
    })
}
for (const [category, entry] of Object.entries(JSON.parse(readFileSync(MARKET_NIC_MAP, 'utf8')).categories)) {
  if (entry.note_code) noteBackend(entry.note_code, `${MARKET_NIC_MAP} (${category}.note_code)`)
}

// 3. Enum-shaped VALUES the frontend maps to a key. These do not travel as
//    codes: backendText.js holds CATEGORY_KEYS, LEVEL_KEYS and COMMODITY_KEYS,
//    and a value with no entry in the map falls back to the raw English word
//    dropped into an otherwise-translated sentence. So the failure is a missing
//    MAP ENTRY rather than a missing dictionary key, and only comparing the map
//    against the dataset can see it.
const backendTextSrc = readFileSync(BACKEND_TEXT, 'utf8')
// Every line of a map, from the rest of its opening line to the `}` that starts
// a line, is blank, a // comment, or one entry: a bare or single-quoted key, a
// colon, a single-quoted value, an optional comma, an optional // comment.
// Anything else throws (exit 2), and so does a map with no entries: a line this
// skipped used to leave its value unmapped, a false finding, and a map it could
// not read at all made every value one.
const MAP_ENTRY = /^\s*(?:'([^'\\]+)'|([\w$]+))\s*:\s*'([\w.]+)',?\s*(?:\/\/.*)?$/
const mapEntries = (mapName) => {
  const opener = `const ${mapName} = {`
  const open = backendTextSrc.indexOf(opener)
  if (open < 0) return null
  const close = backendTextSrc.indexOf('\n}', open)
  const firstLine = backendTextSrc.slice(0, open).split('\n').length
  const out = new Map()
  backendTextSrc.slice(open + opener.length, close < 0 ? undefined : close).split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^\s*(?:\/\/.*)?$/.test(line)) return
    const m = line.match(MAP_ENTRY)
    if (!m) {
      throw new Error(`${BACKEND_TEXT}:${firstLine + i}: cannot read this ${mapName} line, so the value it maps ` +
        `would be reported unmapped: ${JSON.stringify(raw)}`)
    }
    out.set(m[1] ?? m[2], m[3])
  })
  if (!out.size) {
    throw new Error(`${BACKEND_TEXT}: ${mapName} has no entries, so every value checked against it would be reported unmapped`)
  }
  return out
}

const unmappedValues = []

// `prefixes` here is the dotted prefix the map's right-hand side is combined
// with, plural because LEVEL_KEYS serves two: it stores a bare camelCase suffix
// ('subDistrict') that levelLabel turns into `lvl.subDistrict` and levelNote
// into `lvlnote.subDistrict`. CATEGORY_KEYS stores the whole key, so it passes
// [''] and the suffix is used as-is.
const checkMapped = (mapName, values, what, keyPrefixes) => {
  const map = mapEntries(mapName)
  // Not found means backendText.js no longer declares `const NAME = {`. Nothing
  // was compared, so it throws and exits 2: it used to count as one unmapped
  // value, a finding, for a check that never ran.
  if (!map) throw new Error(`${mapName} not found in ${BACKEND_TEXT}: cannot check ${what}`)
  for (const value of [...values].sort()) {
    if (!map.has(value)) {
      unmappedValues.push(`  ${what} ${JSON.stringify(value)} has no ${mapName} entry`)
      continue
    }
    for (const prefix of keyPrefixes) {
      noteBackend(prefix + map.get(value), `${mapName}[${value}]`)
    }
  }
}

const schemes = JSON.parse(readFileSync(SCHEMES_JSON, 'utf8'))
checkMapped(
  'CATEGORY_KEYS',
  new Set(schemes.flatMap((s) => s.business_categories)),
  'scheme category',
  [''],
)
checkMapped(
  'LEVEL_KEYS',
  new Set(schemes.map((s) => s.level)),
  'scheme level',
  ['lvl.', 'lvlnote.'],
)
// A mandi row's crop, by commodity_id. The union of the ids already in the data
// and the ids the fetch is allowed to write, so a commodity added to the fetch
// list is caught before its first row lands. The list also names the key it
// expects (`cmd`); a map entry pointing somewhere else is the same drift.
const commodityList = JSON.parse(readFileSync(MARKET_COMMODITIES, 'utf8')).commodities
checkMapped(
  'COMMODITY_KEYS',
  new Set([
    ...JSON.parse(readFileSync(MARKET_JSON, 'utf8')).map((r) => r.commodity_id).filter(Boolean),
    ...commodityList.map((c) => c.id),
  ]),
  'market commodity',
  [''],
)
const commodityMap = mapEntries('COMMODITY_KEYS')
for (const c of commodityList) {
  if (commodityMap?.has(c.id) && c.cmd && commodityMap.get(c.id) !== c.cmd) {
    unmappedValues.push(
      `  market commodity ${JSON.stringify(c.id)} maps to ${commodityMap.get(c.id)} in COMMODITY_KEYS ` +
        `but ${MARKET_COMMODITIES} says ${c.cmd}`,
    )
  }
}
// The catch-all arm of both helpers, reachable only through the `|| 'other'`
// fallback rather than through any level in the file, so no sweep of the data
// finds it. Named here so it does not read as an orphan key.
noteBackend('lvl.other', 'backendText.js levelLabel fallback')
noteBackend('lvlnote.other', 'backendText.js levelNote fallback')

// --- report ---------------------------------------------------------------
console.log(`${defined.size} keys defined in en across ${DICTS.length} files`)
console.log(`${prefixes.size} key prefixes: ${[...prefixes].sort().join(' ')}`)
console.log(`${used.size} distinct dictionary-shaped keys referenced in ${SRC}\n`)

const missing = [...used.entries()].filter(([k]) => !defined.has(k))
if (missing.length) {
  console.log(`LEAKED KEYS — used but not defined. Each renders as its own dotted name:`)
  for (const [key, sites] of missing.sort()) {
    console.log(`  ${key}`)
    for (const s of sites) console.log(`      ${s}`)
  }
} else {
  console.log('no leaked keys — every referenced key resolves')
}

// --- the backend half -----------------------------------------------------
console.log(`\n${backendUsed.size} translation codes emitted by the backend`)

const untranslated = [...backendUsed.entries()].filter(([k]) => !defined.has(k))
if (untranslated.length) {
  console.log(`\nUNTRANSLATED BACKEND CODES — emitted but not defined. Each falls back`)
  console.log(`to its English sentence, so it prints English in all 8 languages and`)
  console.log(`nothing on the page or in the console says so:`)
  for (const [key, sources] of untranslated.sort()) {
    console.log(`  ${key}`)
    for (const s of sources) console.log(`      ${s}`)
  }
} else {
  console.log('no untranslated backend codes — every emitted code resolves')
}

if (unmappedValues.length) {
  console.log(`\nUNMAPPED BACKEND VALUES — an enum or category the frontend has no key`)
  console.log(`for. It renders as the raw English word inside a translated sentence:`)
  for (const line of unmappedValues) console.log(line)
} else {
  console.log('every scheme category, level and market commodity maps to a key')
}

// Unused means referenced by NEITHER side. Before the backend half existed this
// list carried every sdata.*, elig.*, doc.*, adv.*, obs.* key — 300-odd entries
// that were all false alarms, which is a good way to train someone to ignore it.
const unused = [...defined.keys()].filter((k) => !used.has(k) && !backendUsed.has(k))
console.log(`\n${unused.length} defined but referenced by neither the frontend nor the backend:`)
if (unused.length) console.log('  ' + unused.sort().join('\n  '))
if (dynamic.length) {
  console.log(`\n${dynamic.length} dynamically-built key(s) — resolved at runtime, so the`)
  console.log('list above cannot account for them. Check each by hand:')
  for (const d of dynamic) console.log('  ' + d)
}

const failures = missing.length + untranslated.length + unmappedValues.length
console.log(
  `\n${failures ? 'FAIL' : 'PASS'} — ${missing.length} leaked, ` +
    `${untranslated.length} untranslated, ${unmappedValues.length} unmapped`,
)
process.exit(failures ? 1 : 0)

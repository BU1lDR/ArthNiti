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
// Run from the repo root:  node screenshots/keycheck.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
const BACKEND_TEXT = 'frontend/src/i18n/backendText.js'

// --- what is defined -------------------------------------------------------
// Same line-oriented parse parity4.mjs uses: `const en = {` opens a dict, and a
// key line is `  'some.key': '...'`. Only `en` matters here — parity4 already
// guarantees the other seven carry the same keys.
const defined = new Map() // key -> file it came from
for (const path of DICTS) {
  let lang = null
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const open = line.match(/^const (\w+) = \{/)
    if (open) lang = open[1]
    if (/^\}/.test(line)) lang = null
    if (lang !== 'en') continue
    const kv = line.match(/^\s*'([^']+)':/)
    if (kv) defined.set(kv[1], path)
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

const files = walk(SRC).filter((f) => !DICTS.some((d) => f.endsWith(d.replace('frontend/src/', '').replace(/\//g, '\\'))))

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

// 3. Enum-shaped VALUES the frontend maps to a key. These do not travel as
//    codes: backendText.js holds CATEGORY_KEYS and LEVEL_KEYS/LEVEL_NOTE_KEYS,
//    and a value with no entry in the map falls back to the raw English word
//    dropped into an otherwise-translated sentence. So the failure is a missing
//    MAP ENTRY rather than a missing dictionary key, and only comparing the map
//    against the dataset can see it.
const backendTextSrc = readFileSync(BACKEND_TEXT, 'utf8')
const mapEntries = (mapName) => {
  const open = backendTextSrc.indexOf(`const ${mapName} = {`)
  if (open < 0) return null
  const body = backendTextSrc.slice(open, backendTextSrc.indexOf('\n}', open))
  const out = new Map()
  for (const m of body.matchAll(/^\s*'?([\w -]+?)'?:\s*'([\w.]+)',/gm)) out.set(m[1], m[2])
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
  if (!map) {
    unmappedValues.push(`  ${mapName} not found in ${BACKEND_TEXT} — cannot check ${what}`)
    return
  }
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
  console.log('every scheme category and level maps to a key')
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

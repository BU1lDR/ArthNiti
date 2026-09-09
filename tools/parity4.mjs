// Key-parity across all four i18n dictionary files, for all eight languages.
//
// Lint and build cannot see any of this: nothing imports a key name, so a missing
// key, a duplicated key, or a key that shadows one in another file is invisible
// until it renders. Run from the repo root:  node screenshots/parity4.mjs
//
// Checks, in order of how badly each one bites:
//   1. every language carries every key `en` carries, per file
//   2. no duplicate key inside one dict (the later one silently wins)
//   3. no key defined in two different FILES (the merge order silently decides)
//   4. no non-English value byte-identical to English (the per-key fallback never
//      fires, so the reader just sees English and nothing reports it)
//   5. placeholder sets match English ({name}, {n}, {office}, ...)

import { readFileSync } from 'node:fs'

const FILES = [
  'frontend/src/i18n/strings.js',
  'frontend/src/i18n/resultStrings.js',
  'frontend/src/i18n/backendStrings.js',
  'frontend/src/i18n/schemeStrings.js',
]

const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']

// Values that are legitimately identical to English: proper nouns, bare numbers,
// pure-Latin scheme wording. Anything else identical is a missed translation.
const ALLOW_IDENTICAL = /^[\s\d\p{P}\p{S}A-Za-z]*$/u

const PLACEHOLDER = /\{(\w+)\}/g

function parse(path) {
  const text = readFileSync(path, 'utf8')
  const dicts = {}
  let lang = null

  for (const line of text.split(/\r?\n/)) {
    const open = line.match(/^const (\w+) = \{/)
    if (open) {
      lang = open[1]
      dicts[lang] = { order: [], map: new Map(), dupes: [] }
      continue
    }
    if (!lang) continue

    // Only top-level entries of the dict, single-quoted key, single-quoted value.
    const entry = line.match(/^ {2}'([^']+)': '(.*)',$/)
    if (!entry) continue

    const [, key, value] = entry
    if (dicts[lang].map.has(key)) dicts[lang].dupes.push(key)
    dicts[lang].order.push(key)
    dicts[lang].map.set(key, value)
  }
  return dicts
}

const parsed = {}
for (const file of FILES) parsed[file] = parse(file)

let failures = 0
const fail = (msg) => { failures++; console.log('  FAIL ' + msg) }

// --- 1 + 2 + 4 + 5: per file, per language --------------------------------

for (const file of FILES) {
  const dicts = parsed[file]
  const en = dicts.en
  if (!en) { console.log(file + '\n  FAIL no `en` dict found'); failures++; continue }

  console.log('\n' + file + '  (' + en.map.size + ' keys in en)')

  for (const lang of LANGS) {
    const d = dicts[lang]
    if (!d) { fail(lang + ': dict missing entirely') ; continue }

    const missing = [...en.map.keys()].filter((k) => !d.map.has(k))
    const extra = [...d.map.keys()].filter((k) => !en.map.has(k))

    const identical = lang === 'en' ? [] : [...d.map.entries()].filter(
      ([k, v]) => en.map.has(k) && en.map.get(k) === v && !ALLOW_IDENTICAL.test(v),
    ).map(([k]) => k)

    const drift = lang === 'en' ? [] : [...d.map.entries()].filter(([k, v]) => {
      if (!en.map.has(k)) return false
      const want = [...en.map.get(k).matchAll(PLACEHOLDER)].map((m) => m[1]).sort().join(',')
      const got = [...v.matchAll(PLACEHOLDER)].map((m) => m[1]).sort().join(',')
      return want !== got
    }).map(([k]) => k)

    const ok = !missing.length && !extra.length && !d.dupes.length && !identical.length && !drift.length
    console.log('  ' + lang + ': ' + d.map.size + '/' + en.map.size + (ok ? ' ok' : ''))

    if (missing.length) fail(lang + ' missing ' + missing.length + ': ' + missing.join(' '))
    if (extra.length) fail(lang + ' extra ' + extra.length + ': ' + extra.join(' '))
    if (d.dupes.length) fail(lang + ' duplicate keys: ' + d.dupes.join(' '))
    if (identical.length) fail(lang + ' identical to English (' + identical.length + '): ' + identical.join(' '))
    if (drift.length) fail(lang + ' placeholder drift: ' + drift.join(' '))
  }
}

// --- 3: a key defined in two files ----------------------------------------
// merge() spreads strings -> resultStrings -> backendStrings -> schemeStrings, so
// a collision means the later file silently wins and the earlier text is dead.

console.log('\ncross-file key collisions')
const owner = new Map()
let collisions = 0
for (const file of FILES) {
  for (const key of parsed[file].en?.map.keys() || []) {
    if (owner.has(key)) {
      collisions++
      fail(key + ' defined in both ' + owner.get(key) + ' and ' + file)
    } else {
      owner.set(key, file)
    }
  }
}
if (!collisions) console.log('  none — ' + owner.size + ' distinct keys across the four files')

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed'))
process.exit(failures ? 1 : 0)

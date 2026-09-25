// Key-parity across all four i18n dictionary files, for all eight languages.
//
// Lint and build cannot see any of this: nothing imports a key name, so a missing
// key, a duplicated key, or a key that shadows one in another file is invisible
// until it renders. Run from the repo root:  node tools/parity4.mjs
//
// Checks, in order of how badly each one bites:
//   1. every language carries every key `en` carries, per file, and no other
//   2. no duplicate key inside one dict (the later one silently wins)
//   3. no key defined in two different FILES (the merge order silently decides)
//   4. no non-English value byte-identical to English (the per-key fallback never
//      fires, so the reader just sees English and nothing reports it)
//   5. placeholder sets match English ({name}, {n}, {office}, ...)
//   6. every translation carries the same figures as English: the multiset of
//      ASCII digit runs (10,000 / 35 / 1.5) must match. A Hindi rule saying
//      Rs.12 lakh where English says Rs.10 lakh passes checks 1-5, reads
//      fluently, and sends a reader to the office with the wrong amount.
//   7. digits stay Latin: no non-ASCII decimal digit (\p{Nd}, e.g. Devanagari or
//      Bengali digits) in any value, English included. That is what Indian
//      currency and government forms print, and check 6 cannot see such a digit.
//   8. every schemeStrings.js English value carries the same figures as the
//      schemes.json sentence it stands for: description_code -> description,
//      support_type_code -> support_type, eligibility_codes[i] ->
//      eligibility_rules[i], document_codes[i] -> documents[i].
//
// 6 and 8 never normalise. A legitimate difference goes in DIGIT_ALLOW or
// SOURCE_ALLOW below, with the figures on both sides and a reason. Both sides are
// pinned, so a later change to either still fails, and an entry that is no longer
// needed fails too, so neither list can quietly outlive its reason.
//
// --root=<dir> reads the four dictionaries and schemes.json from a copy of the
// tree instead of the repo (frontend/src/i18n/ and backend/app/data/ under it).
// That is how 6-8 were proven to fire without editing the real files:
//   node tools/parity4.mjs --root=/tmp/p4copy

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT_ARG = process.argv.find((a) => a.startsWith('--root='))
const ROOT = resolve(ROOT_ARG ? ROOT_ARG.slice('--root='.length) : '.')

const FILES = [
  'frontend/src/i18n/strings.js',
  'frontend/src/i18n/resultStrings.js',
  'frontend/src/i18n/backendStrings.js',
  'frontend/src/i18n/schemeStrings.js',
]
const SCHEME_FILE = 'frontend/src/i18n/schemeStrings.js'
const SCHEMES_JSON = 'backend/app/data/schemes.json'

const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']

const CHECKS = [
  'missing or extra keys',
  'duplicate keys',
  'cross-file collisions',
  'identical to English',
  'placeholder drift',
  'figures vs English',
  'Latin digits only',
  'figures vs schemes.json',
]

// Values that are legitimately identical to English: proper nouns, bare numbers,
// pure-Latin scheme wording. Anything else identical is a missed translation.
const ALLOW_IDENTICAL = /^[\s\d\p{P}\p{S}A-Za-z]*$/u

const PLACEHOLDER = /\{(\w+)\}/g

// A figure: a run of ASCII digits, with any . or , grouping inside it, so
// 10,000 and 1,00,000 and 1.5 are one figure each and Rs.10 is 10.
const FIGURE = /[0-9]+(?:[.,][0-9]+)*/g
const NON_LATIN_DIGIT = /(?![0-9])\p{Nd}/gu

// Check 6: values whose figures legitimately differ from English. Per key: the
// languages, the figures English carries, the figures those languages carry
// instead, and why.
const DIGIT_ALLOW = {
  'elig.common.class8': {
    langs: ['hi', 'ml', 'mr', 'bn'],
    en: ['8'],
    value: [],
    reason: 'class 8 is named by its ordinal word, "eighth" (आठवीं, എട്ടാം, आठवी, অষ্টম), which has no digit',
  },
}

// Check 8, same shape: the figures in the schemes.json sentence, the figures its
// schemeStrings.js English carries instead, and why.
const SOURCE_ALLOW = {
  'sdata.pmvishwakarma.description': {
    source: [],
    dict: ['15,000'],
    reason: 'the plain description names the Rs.15,000 toolkit amount, which schemes.json gives in elig.pmvishwakarma.toolkit rather than in its description',
  },
}

// The figures in a sentence, sorted. Placeholders go first: {n2} is a name, not
// a number, and check 5 already owns placeholders.
function figures(text) {
  return (String(text).replace(PLACEHOLDER, ' ').match(FIGURE) || []).sort()
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const show = (list) => '[' + list.join(' ') + ']'

// 'ok' when the figures agree, 'allowed' when they differ exactly as the
// allowlist entry says, 'differs' otherwise.
function judge(want, got, entry, wantSide, gotSide) {
  if (same(want, got)) return 'ok'
  if (entry && same(want, [...entry[wantSide]].sort()) && same(got, [...entry[gotSide]].sort())) return 'allowed'
  return 'differs'
}

const codePoint = (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')

function parse(file) {
  const text = readFileSync(resolve(ROOT, file), 'utf8')
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

if (ROOT_ARG) console.log('root: ' + ROOT)

const parsed = {}
for (const file of FILES) parsed[file] = parse(file)

let failures = 0
const tally = new Array(CHECKS.length + 1).fill(0)
const fail = (check, msg) => { failures++; tally[check]++; console.log('  FAIL ' + msg) }

// Counters for the check 6 + 7 summary. An allowlist entry is "used" when the
// value differs exactly as it says, and "wrong" when the value differs some other
// way (reported as a figure failure). Neither means "no longer needed".
let valuesScanned = 0
let figuresCompared = 0
const digitAllowUsed = new Set()
const digitAllowWrong = new Set()

// --- 1 + 2 + 4 + 5 + 6 + 7: per file, per language ------------------------

for (const file of FILES) {
  const dicts = parsed[file]
  const en = dicts.en
  if (!en) { console.log(file); fail(1, 'no `en` dict found'); continue }

  console.log('\n' + file + '  (' + en.map.size + ' keys in en)')

  for (const lang of LANGS) {
    const d = dicts[lang]
    if (!d) { fail(1, lang + ': dict missing entirely') ; continue }

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

    // 6 + 7. One finding per key, because the figures on each side are the
    // detail that says what is wrong.
    const nonLatin = []
    const figureDrift = []
    for (const [k, v] of d.map) {
      valuesScanned++
      const odd = [...v.matchAll(NON_LATIN_DIGIT)].map((m) => m[0])
      if (odd.length) nonLatin.push(k + ' ' + odd.map((c) => c + ' (' + codePoint(c) + ')').join(' '))

      if (lang === 'en' || !en.map.has(k)) continue
      figuresCompared++
      const entry = DIGIT_ALLOW[k]?.langs.includes(lang) ? DIGIT_ALLOW[k] : null
      const want = figures(en.map.get(k))
      const got = figures(v)
      const verdict = judge(want, got, entry, 'en', 'value')
      if (verdict === 'allowed') digitAllowUsed.add(k + ' ' + lang)
      if (verdict === 'differs' && entry) digitAllowWrong.add(k + ' ' + lang)
      if (verdict === 'differs') {
        figureDrift.push(k + ': English ' + show(want) + ', here ' + show(got) +
          (entry ? ' (its DIGIT_ALLOW entry expects English ' + show(entry.en) + ', here ' + show(entry.value) + ')' : ''))
      }
    }

    const ok = !missing.length && !extra.length && !d.dupes.length && !identical.length && !drift.length &&
      !figureDrift.length && !nonLatin.length
    console.log('  ' + lang + ': ' + d.map.size + '/' + en.map.size + (ok ? ' ok' : ''))

    if (missing.length) fail(1, lang + ' missing ' + missing.length + ': ' + missing.join(' '))
    if (extra.length) fail(1, lang + ' extra ' + extra.length + ': ' + extra.join(' '))
    if (d.dupes.length) fail(2, lang + ' duplicate keys: ' + d.dupes.join(' '))
    if (identical.length) fail(4, lang + ' identical to English (' + identical.length + '): ' + identical.join(' '))
    if (drift.length) fail(5, lang + ' placeholder drift: ' + drift.join(' '))
    for (const f of figureDrift) fail(6, lang + ' figures differ from English, ' + f)
    for (const n of nonLatin) fail(7, lang + ' non-Latin digit, ' + n)
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
      fail(3, key + ' defined in both ' + owner.get(key) + ' and ' + file)
    } else {
      owner.set(key, file)
    }
  }
}
if (!collisions) console.log('  none — ' + owner.size + ' distinct keys across the four files')

// --- 6 + 7: summary, and allowlist entries that are no longer needed ---------

console.log('\nfigures vs English, and Latin digits only')
for (const [key, entry] of Object.entries(DIGIT_ALLOW)) {
  for (const lang of entry.langs) {
    if (!digitAllowUsed.has(key + ' ' + lang) && !digitAllowWrong.has(key + ' ' + lang)) {
      fail(6, 'DIGIT_ALLOW ' + key + ' ' + lang + ' is not needed: the value agrees with English or no longer exists. Remove it.')
    }
  }
}
console.log('  ' + figuresCompared + ' translated values compared with English: ' + tally[6] + ' failing, ' +
  digitAllowUsed.size + ' allowlisted' + (digitAllowUsed.size ? ' (' + [...digitAllowUsed].join(', ') + ')' : ''))
console.log('  ' + valuesScanned + ' values scanned for non-Latin digits: ' + tally[7] + ' failing')

// --- 8: schemeStrings.js English vs the schemes.json sentences ---------------
// The index pairing is the lockstep rule tBackend relies on, so a list whose
// codes and sentences differ in length cannot be compared and is a failure here.

console.log('\n' + SCHEME_FILE + ' en vs ' + SCHEMES_JSON)
let schemes = null
try {
  schemes = JSON.parse(readFileSync(resolve(ROOT, SCHEMES_JSON), 'utf8'))
} catch (error) {
  fail(8, 'cannot read ' + SCHEMES_JSON + ': ' + error.message)
}
if (schemes) {
  const dictEn = parsed[SCHEME_FILE].en?.map || new Map()
  const pairs = []
  let uncoded = 0
  for (const s of schemes) {
    const id = s.id || s.name
    for (const [codeField, textField] of [['description_code', 'description'], ['support_type_code', 'support_type']]) {
      if (s[codeField] == null) { if (s[textField] != null) uncoded++; continue }
      pairs.push([id, textField, s[codeField], s[textField]])
    }
    for (const [codesField, textsField] of [['eligibility_codes', 'eligibility_rules'], ['document_codes', 'documents']]) {
      const codes = s[codesField]
      const texts = s[textsField] || []
      if (codes == null) { uncoded += texts.length; continue }
      if (codes.length !== texts.length) {
        fail(8, id + ': ' + codes.length + ' ' + codesField + ' against ' + texts.length + ' ' + textsField +
          ', so they cannot be paired by index')
        continue
      }
      codes.forEach((code, i) => pairs.push([id, textsField + '[' + i + ']', code, texts[i]]))
    }
  }

  const sourceAllowUsed = new Set()
  const sourceAllowWrong = new Set()
  for (const [id, where, code, text] of pairs) {
    if (!dictEn.has(code)) {
      fail(8, id + ' ' + where + ': ' + code + ' is not an English key in ' + SCHEME_FILE +
        (owner.has(code) ? ' (it is in ' + owner.get(code) + ')' : ''))
      continue
    }
    const entry = SOURCE_ALLOW[code] || null
    const want = figures(text)
    const got = figures(dictEn.get(code))
    const verdict = judge(want, got, entry, 'source', 'dict')
    if (verdict === 'allowed') sourceAllowUsed.add(code)
    if (verdict === 'differs' && entry) sourceAllowWrong.add(code)
    if (verdict === 'differs') {
      fail(8, id + ' ' + where + ' ' + code + ': schemes.json ' + show(want) + ', ' + SCHEME_FILE + ' ' + show(got) +
        (entry ? ' (its SOURCE_ALLOW entry expects schemes.json ' + show(entry.source) + ', dictionary ' + show(entry.dict) + ')' : ''))
    }
  }
  for (const code of Object.keys(SOURCE_ALLOW)) {
    if (!sourceAllowUsed.has(code) && !sourceAllowWrong.has(code)) {
      fail(8, 'SOURCE_ALLOW ' + code + ' is not needed: the figures agree or no schemes.json sentence carries the code. Remove it.')
    }
  }
  console.log('  ' + pairs.length + ' sentences across ' + schemes.length + ' schemes compared: ' + tally[8] + ' failing, ' +
    sourceAllowUsed.size + ' allowlisted' + (sourceAllowUsed.size ? ' (' + [...sourceAllowUsed].join(', ') + ')' : ''))
  if (uncoded) console.log('  ' + uncoded + ' sentence(s) carry no code and were not compared')
}

const failing = CHECKS.map((name, i) => [name, tally[i + 1]]).filter(([, n]) => n)
console.log('\n' + (failures
  ? failures + ' FAILURE(S): ' + failing.map(([name, n]) => name + ' ' + n).join(', ')
  : 'all checks passed (' + CHECKS.length + '): ' + CHECKS.join(', ')))
process.exit(failures ? 1 : 0)

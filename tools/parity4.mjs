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
//   9. the notice text (every NOTICE_KEYS value, all 8 languages) hashes to the
//      sha256 recorded in tools/notice-version.json for NOTICE_VERSION. A consent
//      record names the notice it was given against only by that version, so the
//      wording behind a version must never change under it.
//
// 6 and 8 never normalise. A legitimate difference goes in DIGIT_ALLOW or
// SOURCE_ALLOW below, with the figures on both sides and a reason. Both sides are
// pinned, so a later change to either still fails, and an entry that is no longer
// needed fails too, so neither list can quietly outlive its reason.
//
// --root=<dir> reads the four dictionaries and schemes.json from a copy of the
// tree instead of the repo (frontend/src/i18n/ and backend/app/data/ under it).
// For check 9 the copy must also hold frontend/src/config/notice.js,
// frontend/src/i18n/languages.js and tools/notice-version.json.
// That is how 6-9 were proven to fire without editing the real files:
//   node tools/parity4.mjs --root=/tmp/p4copy

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exit 0: every check passed. 1: one failed. A file a check compares against
// that is missing, unreadable or does not parse fails that check, so it is a 1
// too: schemes.json fails 8, and notice.js, languages.js or
// tools/notice-version.json fails 9, as does a languages.js whose
// DIALECT_PHRASES is not a plain object of { key: text } objects keyed by
// English keys. 2: a crash, and only a crash: anything thrown that nothing
// catches, such as the wrong working directory, a --root with no dictionaries in
// it, or a dictionary it cannot read or parse (the comment above parse() sets out
// the one layout it reads; it throws on any other). Node's own exit on an
// uncaught error is also 1, which read as a failed check, so this exits 2.
process.on('uncaughtException', (error) => {
  console.error(error)
  process.exit(2)
})

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
const NOTICE_FILE = 'frontend/src/config/notice.js'
const LANGUAGES_FILE = 'frontend/src/i18n/languages.js'
const NOTICE_RECORD = 'tools/notice-version.json'

// Check 9: the backend's consent schema accepts a notice_version only in this
// shape, so a version it would reject fails here first.
const NOTICE_VERSION_RULE = /^[0-9A-Za-z.-]{1,40}$/
const SHA256_HEX = /^[0-9a-f]{64}$/
const PLACEHOLDER_SHA = '0'.repeat(64)
// The keys a notice block or /privacy renders by prefix. Each must be pinned.
const NOTICE_PREFIX = /^(notice|consent|privacy)\./

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
  'notice text vs recorded version',
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

// The layout every check reads. A language's dict opens with `const xx = {`
// alone on its line (a trailing // comment is allowed) and closes at the next
// line that starts with `}`. Each line inside it is blank, a // comment, or one
// whole entry written `  'key': 'value',`: two spaces, single quotes with \' for
// an apostrophe, and the trailing comma. parse() throws on any other line there,
// and on a language dict opened any other way, so the run exits 2. It used to
// skip such a line, which hid its key from every check: a trailing comment,
// double quotes or a re-indent each did that, silently. A file whose en dict is
// missing or empty throws too: there is no English to compare the others with.
// Declarations of any other name, and the lines between dicts, are not read.
const DECLARES = /^(?:export\s+)?(?:const|let|var)\s+([\w$]+)/
const OPENER = /^const (\w+) = \{\s*(?:\/\/.*)?$/
const ENTRY = /^ {2}'([^']+)': '((?:[^'\\]|\\.)*)',$/
const BLANK_OR_COMMENT = /^\s*(?:\/\/.*)?$/

function parse(file) {
  const text = readFileSync(resolve(ROOT, file), 'utf8')
  const dicts = {}
  let lang = null

  text.split(/\r?\n/).forEach((line, i) => {
    const at = file + ':' + (i + 1) + ': '
    if (/^\}/.test(line)) { lang = null; return }

    if (lang) {
      if (BLANK_OR_COMMENT.test(line)) return
      const entry = line.match(ENTRY)
      if (!entry) {
        throw new Error(at + 'cannot read this line of the ' + lang + ' dict, so no check would see what it holds: ' +
          JSON.stringify(line) + ". A line in a dict is blank, a // comment, or one whole entry written  'key': 'value',")
      }
      const [, key, value] = entry
      if (dicts[lang].map.has(key)) dicts[lang].dupes.push(key)
      dicts[lang].order.push(key)
      dicts[lang].map.set(key, value)
      return
    }

    const name = line.match(DECLARES)?.[1]
    if (!LANGS.includes(name)) return
    if (!OPENER.test(line)) {
      throw new Error(at + 'the ' + name + ' dict must open with `const ' + name + ' = {` alone on its line, ' +
        'or no check can read it: ' + JSON.stringify(line))
    }
    lang = name
    dicts[lang] = { order: [], map: new Map(), dupes: [] }
  })

  if (!dicts.en?.map.size) {
    throw new Error(file + ': ' + (dicts.en ? 'the en dict has no entries' : 'no `const en = {` dict') +
      ', so there is no English to compare the other languages with')
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
  const en = dicts.en // parse() threw if it is missing or empty

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

// --- 9: the notice text vs the version recorded for it ----------------------
// The hash covers the text only, not the version, so "text changed, version
// kept" can be told apart from a stale record. It hashes the raw source text
// parse() read (the dictionaries import each other extensionlessly, which Node
// cannot resolve), so re-escaping a value changes it with no visible change:
// that fails safe. parse() strips \r, so CRLF and LF checkouts hash the same. It
// covers the templates, not the deployment values filled into {fiduciary},
// {contact} or {days}.

console.log('\n' + NOTICE_FILE + ' vs ' + NOTICE_RECORD)
let notice = null
try {
  notice = await import(pathToFileURL(resolve(ROOT, NOTICE_FILE)).href)
} catch (error) {
  fail(9, 'cannot import ' + NOTICE_FILE + ': ' + error.message + ' (it must be a plain module with no imports)')
}
if (notice) {
  const version = notice.NOTICE_VERSION
  const keys = notice.NOTICE_KEYS
  const versionOk = typeof version === 'string' && NOTICE_VERSION_RULE.test(version)
  if (!versionOk) {
    fail(9, 'NOTICE_VERSION ' + JSON.stringify(version) +
      ' must be 1-40 characters of 0-9 A-Z a-z . - (the backend rejects anything else)')
  }

  let keysOk = Array.isArray(keys) && keys.length > 0 && keys.every((k) => typeof k === 'string')
  if (!keysOk) fail(9, 'NOTICE_KEYS must be a non-empty array of strings')
  const listed = new Set(keysOk ? keys : [])
  // /privacy renders SENT_FIELD_KEYS, in this order, as the list of what is sent.
  const sent = notice.SENT_FIELD_KEYS
  const sentOk = Array.isArray(sent) && sent.length > 0 && sent.every((k) => typeof k === 'string')
  if (!sentOk) fail(9, 'SENT_FIELD_KEYS must be a non-empty array of strings')

  if (keysOk) {
    const seen = new Set()
    for (const key of keys) {
      if (seen.has(key)) { keysOk = false; fail(9, 'NOTICE_KEYS lists ' + key + ' twice'); continue }
      seen.add(key)
      const file = owner.get(key)
      if (!file) { keysOk = false; fail(9, 'NOTICE_KEYS ' + key + ' is not an English key in any dictionary file'); continue }
      for (const lang of LANGS) {
        if (!parsed[file][lang]?.map.has(key)) { keysOk = false; fail(9, 'NOTICE_KEYS ' + key + ' has no ' + lang + ' value in ' + file) }
      }
    }

    // The notice blocks render every notice.*, consent.* and privacy.* key and
    // /privacy renders every SENT_FIELD_KEYS label, so an unlisted one would
    // change the notice without changing the hash.
    if (sentOk) {
      for (const key of sent) {
        if (!listed.has(key)) fail(9, 'SENT_FIELD_KEYS ' + key + ' is rendered on /privacy but NOTICE_KEYS does not list it, so the hash does not cover it')
      }
    }
    for (const key of owner.keys()) {
      if (NOTICE_PREFIX.test(key) && !listed.has(key)) {
        fail(9, key + ' is a notice key (notice.*, consent.* or privacy.*) but NOTICE_KEYS does not list it, so the hash does not cover it')
      }
    }
  }

  // t() looks a key up in the dialect first, so an override would put words on
  // the page that the hash never saw. t() reads DIALECT_PHRASES[dialect][key],
  // so this can vouch only for that shape: a plain object of plain objects whose
  // keys are English keys. Anything else fails 9. A renamed export, a string, an
  // array or a nested object used to give this loop nothing to look at, and pass.
  let dialects = null
  let imported = false
  try {
    dialects = (await import(pathToFileURL(resolve(ROOT, LANGUAGES_FILE)).href)).DIALECT_PHRASES
    imported = true
  } catch (error) {
    fail(9, 'cannot import ' + LANGUAGES_FILE + ': ' + error.message)
  }
  // Object.keys() has to see every key t() can find, so the prototype must be
  // Object.prototype or null: any other could hold more.
  const plain = (v) => v !== null && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  const kind = (v) => Object.prototype.toString.call(v).slice(8, -1)
  if (imported && !plain(dialects)) {
    fail(9, LANGUAGES_FILE + ' must export DIALECT_PHRASES as a plain object of dialect overrides, and ' +
      (dialects === undefined ? 'it exports none' : 'it is ' + kind(dialects)) + ', so no override of the notice can be checked')
  }
  for (const [dialect, phrases] of plain(dialects) ? Object.entries(dialects) : []) {
    if (!plain(phrases)) {
      fail(9, "DIALECT_PHRASES['" + dialect + "'] is " + kind(phrases) +
        ', not a plain object of { key: text } overrides, so its overrides cannot be checked')
      continue
    }
    for (const key of Object.keys(phrases)) {
      if (listed.has(key)) {
        fail(9, 'NOTICE_KEYS ' + key + " is overridden by DIALECT_PHRASES['" + dialect +
          "'], so the rendered notice differs from the hashed text. Remove the override")
      } else if (!owner.has(key)) {
        fail(9, "DIALECT_PHRASES['" + dialect + "'] overrides " + key + ', which is not an English key in any ' +
          'dictionary file, so this check cannot tell what it replaces')
      }
    }
  }

  let sha = null
  if (keysOk && sentOk) {
    let blob = ''
    for (const key of [...keys].sort()) {
      for (const lang of LANGS) blob += lang + '\t' + key + '\t' + parsed[owner.get(key)][lang].map.get(key) + '\n'
    }
    // Which labels the "what is sent" list shows, and in what order. The labels'
    // text is covered above; this covers a field added to, dropped from or moved
    // in the list, which changes the page without changing any value.
    blob += 'sent\t' + sent.join(',') + '\n'
    sha = createHash('sha256').update(blob, 'utf8').digest('hex')
  }

  let record = null
  let readable = true
  try {
    record = JSON.parse(readFileSync(resolve(ROOT, NOTICE_RECORD), 'utf8'))
  } catch (error) {
    readable = false
    fail(9, 'cannot read ' + NOTICE_RECORD + ': ' + error.message)
  }
  if (readable && !(record?.constructor === Object && typeof record.version === 'string' && SHA256_HEX.test(record.sha256))) {
    fail(9, NOTICE_RECORD + ' must be {"version": "...", "sha256": "<64 hex>"}')
    record = null
  }

  const want = (v) => '{"version":"' + v + '","sha256":"' + sha + '"}'
  if (record && sha && versionOk) {
    const sameText = record.sha256 === sha
    if (record.sha256 === PLACEHOLDER_SHA) {
      fail(9, NOTICE_RECORD + ' holds the placeholder sha256 (64 zeros), so no notice text is recorded yet. Once the notice text is final, set it to ' + want(version))
    } else if (record.version === version && !sameText) {
      fail(9, 'the notice text changed but NOTICE_VERSION is still ' + version + '. Bump NOTICE_VERSION in ' + NOTICE_FILE +
        ' and set ' + NOTICE_RECORD + ' to {"version":"<new>","sha256":"' + sha + '"}')
    } else if (record.version !== version && sameText) {
      fail(9, 'NOTICE_VERSION was bumped to ' + version + ' but the notice text is unchanged (sha256 matches the record for ' +
        record.version + '). Revert the bump, or record ' + want(version))
    } else if (record.version !== version) {
      fail(9, 'NOTICE_VERSION is ' + version + ' but ' + NOTICE_RECORD + ' records ' + record.version + '. Set it to ' + want(version))
    } else {
      console.log('  ' + keys.length + ' keys x ' + LANGS.length + ' languages, NOTICE_VERSION ' + version + ', sha256 ' +
        sha.slice(0, 12) + '... matches ' + NOTICE_RECORD)
    }
  } else if (sha) {
    console.log('  sha256 ' + sha + ' not compared with ' + NOTICE_RECORD + ': fix the failures above first')
  }
}

const failing = CHECKS.map((name, i) => [name, tally[i + 1]]).filter(([, n]) => n)
console.log('\n' + (failures
  ? failures + ' FAILURE(S): ' + failing.map(([name, n]) => name + ' ' + n).join(', ')
  : 'all checks passed (' + CHECKS.length + '): ' + CHECKS.join(', ')))
process.exit(failures ? 1 : 0)

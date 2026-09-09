// One-shot: merge the reviewed err.*/errf.* translations into the seven
// non-English dicts of strings.js. Programmatic rather than by hand because
// transcribing 91 Indic strings by eye is how a wrong codepoint gets in, and a
// wrong codepoint in a dictionary is invisible until a native speaker reads it.
import { readFileSync, writeFileSync } from 'node:fs'

const OUT =
  'C:/Users/Aryan/AppData/Local/Temp/claude/d--DATA-Desktop-SIH-2026-SIH-2026/6c6532eb-02d3-475b-81eb-2b586be59d56/tasks/w9nvt9ysx.output'
const SRC = 'd:/DATA/Desktop/SIH_2026/SIH_2026/frontend/src/i18n/strings.js'

const ORDER = [
  'err.timeout',
  'err.offline',
  'err.badResponse',
  'err.checkFields',
  'err.generic',
  'errf.category',
  'errf.state',
  'errf.capital',
  'errf.expenses',
  'errf.revenue',
  'errf.emi',
  'errf.investment',
  'errf.opExpenses',
]

const raw = JSON.parse(readFileSync(OUT, 'utf8'))
const langs = raw.languages || (raw.result && raw.result.languages)

// Gate everything before touching the file. A half-written dictionary is worse
// than an unwritten one.
let bad = 0
for (const entry of langs) {
  const map = new Map(entry.entries.map((e) => [e.key, e.value]))
  for (const key of ORDER) {
    const value = map.get(key)
    if (!value) {
      console.log('MISSING', entry.lang, key)
      bad++
      continue
    }
    // These go into single-quoted JS literals, so either would break the file.
    if (value.includes("'")) { console.log('APOSTROPHE', entry.lang, key, value); bad++ }
    if (value.includes('\\')) { console.log('BACKSLASH', entry.lang, key, value); bad++ }
    // parity4 checks placeholder sets against English; catch a drift here first,
    // where the message names the language and the key.
    const found = (value.match(/\{[a-z]+\}/g) || []).join(',')
    const want = key === 'err.checkFields' ? '{fields}' : ''
    if (found !== want) {
      console.log('PLACEHOLDER', entry.lang, key, 'got', found || 'none', 'want', want || 'none')
      bad++
    }
    // The whole point of the exercise: a value identical to English is the defect
    // this set of keys was added to fix, and parity4 would reject it anyway.
    if (!/[^\u0000-\u00FF]/.test(value)) {
      console.log('LOOKS-LATIN', entry.lang, key, value)
      bad++
    }
  }
  if (map.size !== ORDER.length) { console.log('COUNT', entry.lang, map.size); bad++ }
}
console.log('gate problems:', bad)
if (bad) process.exit(1)

const lines = readFileSync(SRC, 'utf8').split('\n')
const starts = {}
lines.forEach((line, i) => {
  const m = line.match(/^const (en|hi|ta|te|ml|kn|mr|bn) = \{/)
  if (m) starts[m[1]] = i
})

for (const entry of langs) {
  const map = new Map(entry.entries.map((e) => [e.key, e.value]))
  const from = starts[entry.lang]
  if (from === undefined) throw new Error('no dict named ' + entry.lang)

  // 'area.urban' is the last key in every non-en dict, so it is a stable anchor
  // and puts the new block in the same position it occupies in en.
  let anchor = -1
  for (let i = from; i < lines.length; i++) {
    if (lines[i].startsWith("  'area.urban':")) { anchor = i; break }
  }
  if (anchor < 0) throw new Error('no area.urban anchor in ' + entry.lang)

  const row = (key) => "  '" + key + "': '" + map.get(key) + "',"
  const block = [
    '',
    '  // See the note in the en dict. err.checkFields must keep its single',
    '  // {fields} placeholder and must not acquire number agreement.',
    ...ORDER.slice(0, 5).map(row),
    '',
    ...ORDER.slice(5).map(row),
  ]

  lines.splice(anchor + 1, 0, ...block)
  // Every later dict just moved down by the size of what was inserted.
  for (const key of Object.keys(starts)) {
    if (starts[key] > anchor) starts[key] += block.length
  }
  console.log('inserted 13 keys into', entry.lang, 'after line', anchor + 1)
}

writeFileSync(SRC, lines.join('\n'))

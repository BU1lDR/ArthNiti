// Finds decorative glyphs (emoji, arrows, check marks) that are rendered as bare
// JSX text nodes with no aria-hidden ancestor on the same line. A screen reader
// announces those as "rightwards arrow" / "rocket" before the label.
//
// Glyphs inside a string literal are skipped, either quote style: those are
// `icon=` props and lookup-table values, and the component that consumes them
// (Charts.jsx, MetricCard, Feature, AdvisoryCard, ReportSection) already wraps
// them in aria-hidden. Getting the quote handling wrong makes this report 35
// false positives, which is worse than reporting nothing.
//
// Line-scoped and therefore approximate — it cannot see a wrapper opened on a
// previous line, so a glyph alone on its own line inside a hidden parent still
// shows up. Treat a hit as "go look", not as proof.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../../frontend/src/', import.meta.url).pathname.replace(/^\//, '')

const GLYPH =
  /[←-⇿☀-➿⬀-⯿️\u{1F000}-\u{1FAFF}✓✔✗◐›ℹ]/u

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.jsx')) out.push(full)
  }
  return out
}

// Which tags are still open at `index`, and did any of them carry aria-hidden?
function hiddenAncestor(text) {
  const open = []
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  for (const m of text.matchAll(tag)) {
    if (m[1] === '/') open.pop()
    else if (m[4] !== '/') open.push(m[3])
  }
  return open.some((attrs) => /aria-hidden/.test(attrs))
}

let bare = 0
const glyphAll = new RegExp(GLYPH.source, 'gu')

for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, i) => {
    if (!GLYPH.test(line)) return

    for (const m of line.matchAll(glyphAll)) {
      const before = line.slice(0, m.index)

      // Odd number of quotes before it => we are inside a string literal.
      if ((before.match(/'/g) || []).length % 2 === 1) continue
      if ((before.match(/"/g) || []).length % 2 === 1) continue
      if (hiddenAncestor(before)) continue

      // A glyph alone on its line is the body of an element opened above it;
      // report the enclosing element instead of guessing.
      if (line.trim() === m[0] || line.trim() === m[0] + '️') {
        console.log(
          `${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  ${m[0]}  (alone on line — check the parent opened above)`,
        )
        bare += 1
        break
      }

      const ctx = line.slice(Math.max(0, m.index - 60), m.index + 30).replace(/\s+/g, ' ')
      console.log(`${relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}  ${m[0]}  ...${ctx}...`)
      bare += 1
      break
    }
  })
}

console.log(bare ? `\n${bare} possible bare glyph(s) — check each by hand` : '\nNo bare decorative glyphs found')

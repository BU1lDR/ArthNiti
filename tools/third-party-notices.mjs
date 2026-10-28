// Regenerates THIRD_PARTY_NOTICES.md from the installed packages' own metadata.
//
//   node tools/third-party-notices.mjs            # from the repo root
//
// Needs frontend/node_modules and .venv to exist (npm install / pip install).
// Zero dependencies. Reads, never guesses: the licence name comes from each
// package's own package.json or dist-info METADATA, and the full licence text
// comes from the LICENSE file the package ships. A package whose licence
// cannot be found is printed as UNKNOWN and makes the script exit 1, because
// a notices file that silently skips one is worse than none.
//
// Two groups, and the split is the legal point, not decoration:
//   - "shipped": code that ends up in what a user or client receives — the
//     frontend bundle (lockfile entries without dev:true) and the backend's
//     runtime closure. MIT/BSD/Apache terms require their notices to travel
//     with the copy, so the full text is included.
//   - "development only": build and test tools that never leave the
//     developer's machine. Listed for completeness, text not reproduced.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const FRONT = join(ROOT, 'frontend')
const PY = join(ROOT, '.venv', 'Scripts', 'python.exe')
const OUT = join(ROOT, 'THIRD_PARTY_NOTICES.md')

// Runtime roots of the backend closure. pytest is a test tool, so it is not a
// root here and lands in the development group instead.
const PY_RUNTIME_ROOTS = ['fastapi', 'uvicorn', 'pydantic', 'httpx2']
const PY_DEV_ROOTS = ['pytest']

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|rst))?$|^licen[cs]e[-_.]/i

function licenceTextIn(dir) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort()
  if (!files.length) return null
  return files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n')
}

// ---- frontend ------------------------------------------------------------
const lock = JSON.parse(readFileSync(join(FRONT, 'package-lock.json'), 'utf8'))
const npm = { shipped: [], dev: [] }
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path) continue // the root project itself
  const name = path.replace(/^.*node_modules\//, '')
  const dir = join(FRONT, path)
  let licence = info.license
  if (!licence && existsSync(join(dir, 'package.json'))) {
    licence = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).license
  }
  const entry = { name, version: info.version, licence: licence || 'UNKNOWN', dir }
  ;(info.dev ? npm.dev : npm.shipped).push(entry)
}

// ---- backend -------------------------------------------------------------
// importlib.metadata walks the requirement closure from the installed
// distributions, so the list is what is actually installed rather than what
// requirements.txt hopes for.
const pyScript = String.raw`
import json, re, sys
from importlib import metadata as md

def norm(n): return re.sub(r"[-_.]+", "-", n).lower()
dists = {norm(d.metadata["Name"]): d for d in md.distributions()}

def closure(roots):
    seen, stack = set(), [norm(r) for r in roots]
    while stack:
        n = stack.pop()
        if n in seen or n not in dists: continue
        seen.add(n)
        for req in dists[n].requires or []:
            if "extra ==" in req: continue
            stack.append(norm(re.split(r"[ ;<>=!~\[(]", req, 1)[0]))
    return seen

def info(n):
    d = dists[n]; m = d.metadata
    lic = m.get("License-Expression") or ""
    if not lic:
        cls = [c.split(" :: ")[-1] for c in (m.get_all("Classifier") or []) if c.startswith("License ::")]
        lic = ", ".join(cls) or (m.get("License") or "").splitlines()[0:1] and (m.get("License") or "").splitlines()[0]
    texts = []
    for f in d.files or []:
        base = f.name.lower()
        if re.match(r"^(licen[cs]e|copying|notice)", base):
            try: texts.append(f.read_text(encoding="utf-8").strip())
            except Exception: pass
    return {"name": m["Name"], "version": d.version, "licence": lic or "UNKNOWN", "text": "\n\n".join(texts)}

run = closure(sys.argv[1].split(","))
dev = closure(sys.argv[2].split(",")) - run
print(json.dumps({"shipped": [info(n) for n in sorted(run)], "dev": [info(n) for n in sorted(dev)]}))
`
const py = spawnSync(PY, ['-c', pyScript, PY_RUNTIME_ROOTS.join(','), PY_DEV_ROOTS.join(',')], {
  encoding: 'utf8',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
})
if (py.status !== 0) {
  console.error(py.stderr)
  process.exit(1)
}
const pip = JSON.parse(py.stdout)

// ---- write ---------------------------------------------------------------
const byName = (a, b) => a.name.localeCompare(b.name)
npm.shipped.sort(byName)
npm.dev.sort(byName)

const unknown = []
const row = (e, eco) => {
  if (e.licence === 'UNKNOWN') unknown.push(`${eco}:${e.name}`)
  return `| ${e.name} | ${e.version} | ${e.licence} |`
}

const lines = [
  '# Third-party notices',
  '',
  'Generated by `node tools/third-party-notices.mjs` from the installed packages\' own metadata. Do not edit by hand; re-run it after any dependency change.',
  '',
  'अर्थNiti itself is released under the MIT licence (see [LICENSE](LICENSE)). The components below belong to their authors and are used under the licences shown, which this project\'s licence does not change.',
  '',
  '## Shipped components',
  '',
  'These end up in what a user or client receives: the frontend bundle and the backend\'s runtime.',
  '',
  '### Frontend (npm)',
  '',
  '| Package | Version | Licence |',
  '|---|---|---|',
  ...npm.shipped.map((e) => row(e, 'npm')),
  '',
  '### Backend (Python)',
  '',
  '| Package | Version | Licence |',
  '|---|---|---|',
  ...pip.shipped.map((e) => row(e, 'pip')),
  '',
  '## Development-only tools',
  '',
  'Build, lint and test tools. They run on a developer\'s machine and are not distributed.',
  '',
  `${npm.dev.length} npm packages and ${pip.dev.length} Python packages. Licence counts:`,
  '',
]
const tally = {}
for (const e of [...npm.dev, ...pip.dev]) {
  tally[e.licence] = (tally[e.licence] || 0) + 1
  if (e.licence === 'UNKNOWN') unknown.push(`dev:${e.name}`)
}
lines.push('| Licence | Packages |', '|---|---|')
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`)
lines.push('', '## Licence texts for shipped components', '')

for (const e of npm.shipped) {
  const text = licenceTextIn(e.dir)
  if (!text) unknown.push(`npm-text:${e.name}`)
  lines.push(`### ${e.name} ${e.version} (${e.licence})`, '', '```text', text || '(no licence file shipped in the package)', '```', '')
}
for (const e of pip.shipped) {
  if (!e.text) unknown.push(`pip-text:${e.name}`)
  lines.push(`### ${e.name} ${e.version} (${e.licence})`, '', '```text', e.text || '(no licence file shipped in the distribution)', '```', '')
}

writeFileSync(OUT, lines.join('\n'))
console.log(`shipped: ${npm.shipped.length} npm + ${pip.shipped.length} pip; dev: ${npm.dev.length} npm + ${pip.dev.length} pip`)
if (unknown.length) {
  console.log('UNKNOWN licence or text:', unknown.join(', '))
  process.exit(1)
}
console.log('wrote THIRD_PARTY_NOTICES.md')

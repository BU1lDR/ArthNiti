// Does a real browser DECODE each SVG in this repo, or silently refuse it?
//
// Written because `public/favicon.svg` turned out to be malformed XML: its
// leading comment contains a double hyphen, which XML forbids inside a comment,
// and an SVG is XML. Nothing in the suite could see it — lint, build, parity,
// keycheck and drive.mjs all pass on a favicon that never renders, because none
// of them parses an image.
//
// A refusal is silent by design: the browser drops the icon and shows its
// default. So the check is empirical rather than a lint rule.
//
//   node tools/svgcheck.mjs
// One trap worth knowing, because it made the first version of this script
// report every file as refused: an `about:blank` page has an opaque origin and
// cannot load a file:// image AT ALL. Every SVG came back EncodingError, which
// looked exactly like a parse failure and was really a blocked load. The probe
// page has to itself be a file:// document, so it is written to disk below.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9378
const PROFILE = resolve('screenshots/svgcheck-profile')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const FILES = [
  'frontend/public/favicon.svg',
  'frontend/public/icons.svg',
  'frontend/public/town-consulting.svg',
  'frontend/src/assets/brand/arthniti-mark.svg',
  'frontend/src/assets/brand/arthniti-mark-dark.svg',
]

mkdirSync(PROFILE, { recursive: true })

// The probe page, living at the repo root so every path below is relative to it.
const PROBE_PAGE = resolve('screenshots/svgcheck-probe.html')
writeFileSync(PROBE_PAGE, '<!doctype html><meta charset="utf-8"><title>svgcheck</title>')

const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--remote-allow-origins=*',
  '--allow-file-access-from-files',
  '--disable-gpu', '--no-first-run', '--no-default-browser-check',
], { stdio: 'ignore' })

let wsUrl = null
for (let i = 0; i < 80; i++) {
  try {
    const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    if (info.webSocketDebuggerUrl) { wsUrl = info.webSocketDebuggerUrl; break }
  } catch { /* not listening yet */ }
  await sleep(250)
}
if (!wsUrl) { edge.kill(); throw new Error('Edge never opened the DevTools endpoint') }

const sock = new WebSocket(wsUrl)
let nextId = 1
const pending = new Map()
let sessionId = null
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  const slot = pending.get(msg.id)
  if (!slot) return
  pending.delete(msg.id)
  if (msg.error) slot.rej(new Error(msg.error.message))
  else slot.res(msg.result)
})
function send(method, params = {}, useSession = true) {
  const id = nextId++
  const envelope = { id, method, params }
  if (useSession && sessionId) envelope.sessionId = sessionId
  return new Promise((res, rej) => { pending.set(id, { res, rej }); sock.send(JSON.stringify(envelope)) })
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false)
const attached = await send('Target.attachToTarget', { targetId, flatten: true }, false)
sessionId = attached.sessionId
await send('Runtime.enable')
await send('Page.enable')

// A file:// root the page can reach, with the drive letter kept.
const root = 'file:///' + resolve('.').replace(/\\/g, '/').replace(/^\/+/, '') + '/'

// Navigate to a real file:// document first — see the note at the top.
await send('Page.navigate', { url: 'file:///' + PROBE_PAGE.replace(/\\/g, '/').replace(/^\/+/, '') })
await sleep(800)

const expression = [
  '(async () => {',
  '  const out = {}',
  `  for (const f of ${JSON.stringify(FILES)}) {`,
  '    const img = new Image()',
  `    img.src = ${JSON.stringify(root)} + f`,
  '    try { await img.decode(); out[f] = "DECODES " + img.naturalWidth + "x" + img.naturalHeight }',
  '    catch (e) { out[f] = "REFUSED (" + e.name + ")" }',
  '  }',
  '  return out',
  '})()',
].join('\n')

const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
edge.kill()

const results = r.result.value || {}
let bad = 0
for (const [file, verdict] of Object.entries(results)) {
  if (verdict.startsWith('REFUSED')) bad++
  console.log((verdict.startsWith('REFUSED') ? 'x ' : 'ok ') + file + ' -> ' + verdict)
}
console.log(`\n${Object.keys(results).length} checked, ${bad} refused.`)
process.exit(bad ? 1 : 0)

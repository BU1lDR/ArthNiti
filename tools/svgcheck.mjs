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
//
// The files are every SVG git knows of, tracked or new and not ignored, found
// when it starts. A hand list never saw an SVG added later, and read one it
// listed that had since gone as REFUSED: a finding, where the list was stale.
// One never `git add`ed is named as untracked, once before the run and again on
// its verdict line, so a refusal there reads as a file the repo does not hold.
//
// Exit 0: every file decodes. 1: the browser refused one. 2: it could not check:
// git could not list the SVGs or listed none, a file git lists is not on disk,
// Edge's DevTools endpoint never answered, its socket failed to open or closed
// mid-run, the probe page did not load, a file never came back from the probe,
// the script crashed, the run stopped short of its verdict, or it was started
// outside the repo root. It resolves every path against the working directory,
// so from anywhere else it would write its profile and probe page there; it
// refuses to start instead.
//
// One trap worth knowing, because it made the first version of this script
// report every file as refused: an `about:blank` page has an opaque origin and
// cannot load a file:// image AT ALL. Every SVG came back EncodingError, which
// looked exactly like a parse failure and was really a blocked load. The probe
// page has to itself be a file:// document, so it is written to disk below.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Node's own exit on an uncaught error is 1, which here means a refused SVG, so
// anything thrown or rejected that nothing catches exits 2 instead. Under
// top-level await a rejection arrives here too.
process.on('uncaughtException', (err) => {
  console.error(err)
  crashExit()
})
// A crash exits 2 through this rather than process.exit(2) at once. For up to
// about 100 ms after fetch() reads a response, as the /json/version poll below
// does, V8 can still be recompiling undici's WASM HTTP parser on a worker
// thread, and exiting in that window kills node with 0xC0000409 (Git Bash shows
// 127): neither 0, 1 nor 2. The wait blocks this thread, so nothing else of the
// run happens meanwhile. tools/README.md, Exit codes, has the measurements.
function crashExit() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
  process.exit(2)
}
// A run that ends without reaching its verdict exits 2. Before this, a CDP
// socket that closed under a pending send left it unsettled, the event loop
// drained, and node exited 13, its code for a top-level await that never
// settled. The verdict overrides it.
process.exitCode = 2
// PROFILE, PROBE_PAGE and every file below resolve against the working directory.
if (!existsSync(resolve('tools/svgcheck.mjs'))) {
  console.error(`svgcheck: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/svgcheck.mjs`)
  process.exit(2)
}

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9378
const PROFILE = resolve('screenshots/svgcheck-profile')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Every SVG in the repo, asked of git rather than listed here. --others with
// --exclude-standard adds a file not yet `git add`ed and still skips the ignored
// trees (node_modules/, dist/, screenshots/); :(icase) catches a .SVG. A file
// still in the index but deleted from disk is listed, and cannot be checked. A
// path listed twice (one per stage, mid-merge) is checked once. All of this runs
// before Edge starts and before any fetch(), so process.exit(2) is safe here.
function gitListSvgs(which) {
  try {
    return execFileSync('git', ['ls-files', '-z', ...which, '--', ':(icase)*.svg'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  } catch (err) {
    console.error(`svgcheck: git could not list the SVGs to check (${err.status != null ? 'git exited ' + err.status : err.code || err.message}).`)
    process.exit(2)
  }
}
const FILES = [...new Set(gitListSvgs(['--cached', '--others', '--exclude-standard']))].sort()
if (!FILES.length) {
  console.error('svgcheck: git lists no SVG in this repo, so there is nothing to check.')
  process.exit(2)
}
const gone = FILES.filter((f) => !existsSync(resolve(f)))
if (gone.length) {
  for (const f of gone) console.error(`svgcheck: ${f} is in git but not on disk, so it cannot be checked.`)
  process.exit(2)
}
// The ones never `git add`ed: checked like the rest, and named, so that a
// refusal among them reads as a file still being worked on rather than one the
// repo holds.
const listedUntracked = new Set(gitListSvgs(['--others', '--exclude-standard']))
const UNTRACKED = new Set(FILES.filter((f) => listedUntracked.has(f)))
if (UNTRACKED.size) {
  console.log(`svgcheck: ${UNTRACKED.size} of the ${FILES.length} SVGs ${UNTRACKED.size === 1 ? 'is' : 'are'} not tracked by git yet, and checked with the rest: ${[...UNTRACKED].join(', ')}`)
}

mkdirSync(PROFILE, { recursive: true })

// The probe page: a file:// document, so it may load the file:// images at all.
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
    // Bounded: a listener that accepts and never answers would otherwise hold
    // this for undici's five-minute header timeout.
    const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).json()
    if (info.webSocketDebuggerUrl) { wsUrl = info.webSocketDebuggerUrl; break }
  } catch { /* not listening yet */ }
  await sleep(250)
}
if (!wsUrl) { edge.kill(); throw new Error('Edge never opened the DevTools endpoint') }

const sock = new WebSocket(wsUrl)
let nextId = 1
const pending = new Map()
let sessionId = null
// A handshake that fails fires error and close, never open.
await new Promise((res, rej) => {
  sock.addEventListener('open', res)
  sock.addEventListener('error', () => rej(new Error('svgcheck: the CDP socket failed to open')))
  sock.addEventListener('close', () => rej(new Error('svgcheck: the CDP socket closed before it opened')))
})
sock.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  const slot = pending.get(msg.id)
  if (!slot) return
  pending.delete(msg.id)
  if (msg.error) slot.rej(new Error(msg.error.message))
  else slot.res(msg.result)
})
// undici's send() on a closed socket drops the frame without throwing, so a
// request made after Edge has gone, or still waiting when it goes, rejects
// rather than waiting on a reply that never comes.
sock.addEventListener('close', () => {
  for (const slot of pending.values()) slot.rej(new Error(slot.method + ': CDP socket closed'))
  pending.clear()
})
function send(method, params = {}, useSession = true) {
  if (sock.readyState !== WebSocket.OPEN) return Promise.reject(new Error(method + ': CDP socket closed'))
  const id = nextId++
  const envelope = { id, method, params }
  if (useSession && sessionId) envelope.sessionId = sessionId
  return new Promise((res, rej) => { pending.set(id, { method, res, rej }); sock.send(JSON.stringify(envelope)) })
}

const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false)
const attached = await send('Target.attachToTarget', { targetId, flatten: true }, false)
sessionId = attached.sessionId
await send('Runtime.enable')
await send('Page.enable')

// Each file's file:// URL, built here: pathToFileURL keeps the drive letter and
// escapes a # or % in the path, which would otherwise end or garble the URL and
// read as a refusal.
const TARGETS = FILES.map((f) => [f, pathToFileURL(resolve(f)).href])

// Navigate to a real file:// document first — see the note at the top. If it
// does not load, every file would read as REFUSED, so that is a fault instead.
const nav = await send('Page.navigate', { url: 'file:///' + PROBE_PAGE.replace(/\\/g, '/').replace(/^\/+/, '') })
if (nav.errorText) { edge.kill(); throw new Error(`svgcheck: the probe page did not load (${nav.errorText})`) }
await sleep(800)

const expression = [
  '(async () => {',
  '  const out = {}',
  `  for (const [f, url] of ${JSON.stringify(TARGETS)}) {`,
  '    const img = new Image()',
  '    img.src = url',
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
  console.log((verdict.startsWith('REFUSED') ? 'x ' : 'ok ') + file + (UNTRACKED.has(file) ? ' (untracked)' : '') + ' -> ' + verdict)
}
const checked = Object.keys(results).length
console.log(`\n${checked} checked, ${bad} refused.`)
// A probe that threw, or came back without a file, did not check that file:
// neither a pass nor a refusal.
const incomplete = !!r.exceptionDetails || checked !== FILES.length
if (incomplete) console.error(`svgcheck: ${FILES.length - checked} of ${FILES.length} files never came back from the probe${r.exceptionDetails ? ` (it threw: ${r.exceptionDetails.text})` : ''}.`)
process.exit(incomplete ? 2 : bad ? 1 : 0)

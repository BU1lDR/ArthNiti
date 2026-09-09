// Where does the hero backdrop's edge sit relative to the content that sits on
// it? The report was that the "Start my journey" button's left edge lands exactly
// on the artwork's left edge, and that the artwork's own edges read as a hard
// crop rather than a panel.
//
// Neither question can be answered from index.css. `.ui-hero::before` is pinned
// to `inset: 0`, so the artwork's box IS the section's border box — and the
// section has vertical padding (py-8 / lg:py-14) but NO horizontal padding, so
// the inset is ~56px at the top and 0px at the sides by construction. That much
// is readable. What is not readable is where each child actually lands once the
// grid, `items-center` and `min-h` have had their say, and how the radius reads
// against the size of the panel.
//
// So this measures, per width: the ::before box, the section box, the page
// container, and every hero child's gap to each of the four artwork edges.
//
// Run the Vite dev server first, then: node screenshots/verify/hero-geom.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9355
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/hero-geom')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-geom')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.sessionId = null
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res())
      this.ws.addEventListener('error', () => rej(new Error('CDP socket error')))
    })
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const slot = this.pending.get(msg.id)
      if (!slot) return
      this.pending.delete(msg.id)
      if (msg.error) slot.reject(new Error(slot.method + ': ' + msg.error.message))
      else slot.resolve(msg.result)
    })
  }

  send(method, params = {}, useSession = true) {
    const id = this.next++
    const envelope = { id, method, params }
    if (useSession && this.sessionId) envelope.sessionId = this.sessionId
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej, method })
      this.ws.send(JSON.stringify(envelope))
    })
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) {
      throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    }
    return r.result.value
  }
}

async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch { /* not listening yet */ }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

// A pseudo-element has no node, so its box cannot be measured with
// getBoundingClientRect. But `inset` resolves to used px in getComputedStyle, and
// the offsets are relative to the host's padding box — which for a `position:
// relative` host with no border is the border box. So the artwork's rect is
// derivable from the host's rect plus the four resolved insets, and that stays
// correct if the insets stop being 0.
const PROBE = [
  '(() => {',
  '  const hero = document.querySelector(".ui-hero")',
  '  if (!hero) throw new Error("no .ui-hero")',
  '  const hr = hero.getBoundingClientRect()',
  '  const cs = getComputedStyle(hero, "::before")',
  '  const num = (v) => (v === "auto" ? 0 : parseFloat(v) || 0)',
  '  const art = {',
  '    left: hr.left + num(cs.left),',
  '    top: hr.top + num(cs.top),',
  '    right: hr.right - num(cs.right),',
  '    bottom: hr.bottom - num(cs.bottom),',
  '  }',
  '  art.width = art.right - art.left',
  '  art.height = art.bottom - art.top',
  '',
  '  const main = document.querySelector(".ui-main")',
  '  const mr = main ? main.getBoundingClientRect() : null',
  '',
  // Every element that carries visible hero content, plus the two columns. The
  // gap that matters is to the artwork edge, not to the section edge.
  '  const targets = []',
  '  const add = (sel, label) => {',
  '    const el = document.querySelector(sel)',
  '    if (!el) return',
  '    const r = el.getBoundingClientRect()',
  '    targets.push({',
  '      label,',
  '      box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],',
  '      gapLeft: Math.round((r.left - art.left) * 10) / 10,',
  '      gapRight: Math.round((art.right - r.right) * 10) / 10,',
  '      gapTop: Math.round((r.top - art.top) * 10) / 10,',
  '      gapBottom: Math.round((art.bottom - r.bottom) * 10) / 10,',
  '    })',
  '  }',
  '  add(".ui-hero > div:first-child", "left column")',
  '  add(".ui-hero .ui-eyebrow", "eyebrow chip")',
  '  add(".ui-hero .ui-page-title", "h1")',
  '  add(".ui-hero .ui-page-subtitle", "subtitle")',
  '  add(".ui-hero a[href=\\"/profile\\"], .ui-hero a[href$=\\"/profile\\"]", "Start my journey")',
  '  add(".ui-hero a[href=\\"#how-it-works\\"]", "What we offer")',
  '  add(".ui-hero .ui-card", "right card")',
  '',
  '  const heroStyle = getComputedStyle(hero)',
  '  return {',
  '    viewport: innerWidth + "x" + innerHeight,',
  '    docScrollW: document.documentElement.scrollWidth,',
  '    docClientW: document.documentElement.clientWidth,',
  '    mainBox: mr ? [Math.round(mr.left), Math.round(mr.width)] : null,',
  '    heroBox: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)],',
  '    heroPadding: heroStyle.paddingTop + " " + heroStyle.paddingRight + " " + heroStyle.paddingBottom + " " + heroStyle.paddingLeft,',
  '    artInset: cs.top + " " + cs.right + " " + cs.bottom + " " + cs.left,',
  '    artBox: [Math.round(art.left), Math.round(art.top), Math.round(art.width), Math.round(art.height)],',
  '    artRadius: cs.borderRadius,',
  '    artRadiusPx: Math.round(parseFloat(cs.borderTopLeftRadius) * 10) / 10,',
  '    radiusVsWidth: Math.round((parseFloat(cs.borderTopLeftRadius) / art.width) * 10000) / 100 + "% of the panel width",',
  '    targets,',
  '  }',
  '})()',
].join('\n')

const CASES = [
  { name: 'desktop-1440', width: 1440, height: 900, theme: 'dark', lang: 'en' },
  { name: 'desktop-1280', width: 1280, height: 860, theme: 'light', lang: 'en' },
  { name: 'laptop-1024', width: 1024, height: 800, theme: 'light', lang: 'en' },
  { name: 'tablet-800', width: 800, height: 900, theme: 'light', lang: 'en' },
  { name: 'phone-390', width: 390, height: 844, theme: 'light', lang: 'en', mobile: true },
  { name: 'phone-360-hi', width: 360, height: 800, theme: 'dark', lang: 'hi', mobile: true },
]

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const report = []
  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const kase of CASES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: kase.width, height: kase.height, deviceScaleFactor: 1, mobile: Boolean(kase.mobile),
      })
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(900)
      await cdp.evaluate([
        `localStorage.setItem('sih-theme', '${kase.theme}');`,
        `localStorage.setItem('sih-language', '${kase.lang}');`,
        `localStorage.setItem('sih-textsize', 'md');`,
        `localStorage.removeItem('sih-dialect');`,
        'true',
      ].join(''))
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(1300)

      const m = await cdp.evaluate(PROBE)
      console.log(`\n=== ${kase.name}  (${m.viewport})`)
      console.log(`    .ui-main            left ${m.mainBox?.[0]}  width ${m.mainBox?.[1]}`)
      console.log(`    .ui-hero box        ${m.heroBox.join(', ')}   padding ${m.heroPadding}`)
      console.log(`    ::before inset      ${m.artInset}`)
      console.log(`    artwork box         ${m.artBox.join(', ')}`)
      console.log(`    artwork radius      ${m.artRadius}  = ${m.artRadiusPx}px, ${m.radiusVsWidth}`)
      console.log(`    doc scrollW/clientW ${m.docScrollW} / ${m.docClientW}`)
      console.log(`    gaps from each child to the artwork edge (L / R / T / B):`)
      for (const t of m.targets) {
        console.log(`      ${t.label.padEnd(18)} ${String(t.gapLeft).padStart(7)} ${String(t.gapRight).padStart(7)} ${String(t.gapTop).padStart(7)} ${String(t.gapBottom).padStart(7)}`)
      }
      report.push({ ...kase, measured: m })

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      writeFileSync(`${OUT}/${kase.name}.png`, Buffer.from(shot.data, 'base64'))
    }
  } finally {
    edge.kill()
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  console.log(`\nreport.json and screenshots in ${OUT}`)
}

main()

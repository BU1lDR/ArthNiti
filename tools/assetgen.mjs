// Exports the brand assets that a slide deck, a poster or a document needs, into
// frontend/src/assets/brand/.
//
// This is an EXPORT tool, not a verifier — it exits 0 unless it cannot produce a
// file. It lives here with the rest of the browser scripts because it needs the
// same Edge-over-CDP plumbing, and `screenshots/` is gitignored, so the tool is
// local while its output is committed. The recipe is written down in
// frontend/src/assets/README.md so this can be redone without the script.
//
// Two things it produces, from two different sources, on purpose:
//
//   * the MARK, rasterised from the standalone SVGs in that folder. Going through
//     the shipped file rather than through the React component is the point: it
//     proves the export parses, that the gradient resolves with no page to
//     inherit from, and that the U+20B9 in <text> actually draws. A blank coin
//     here means the SVG is wrong, and the alpha scan reports it.
//   * the LOCKUP and the WORDMARK, captured from the LIVE app. Both are built
//     from --color-* / --wordmark-* tokens and from real text, so re-implementing
//     them in a standalone file would mean guessing at font metrics and would
//     drift from the masthead the moment a token moved. Capturing the real thing
//     cannot drift.
//
// Needs the Vite dev server up for the second half:
//   cd frontend && npm run dev
//   node tools/assetgen.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// Its own port and profile, so this can run beside any of the verifiers.
const DEBUG_PORT = 9377
const APP = 'http://localhost:5173'
const BRAND = resolve('frontend/src/assets/brand')
const WORK = resolve('screenshots/assetgen-work')
const PROFILE_DIR = resolve('screenshots/assetgen-profile')

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

// Rasterise one of the exported SVGs through an <img>, which loads it as its own
// document — the same way a browser tab, PowerPoint or Canva will. An inline
// copy would silently inherit this page's font-family and prove less.
function markPage(svgUrl, cssWidth, cssHeight) {
  return [
    '<!doctype html><meta charset="utf-8">',
    '<style>html,body{margin:0;background:transparent}',
    `#m{display:block;width:${cssWidth}px;height:${cssHeight}px}</style>`,
    `<img id="m" src="${svgUrl}">`,
  ].join('')
}

// Alpha coverage plus how much ink lands in the coin's own box. The second number
// is the one that catches a ₹ that did not render: the coin face is a flat
// #FBCB48 disc, so a missing glyph leaves that box uniform.
const INK_PROBE = [
  '(async () => {',
  '  const img = document.getElementById("m")',
  '  await img.decode()',
  '  const W = img.naturalWidth || 94, H = img.naturalHeight || 122',
  '  const cv = document.createElement("canvas")',
  '  cv.width = 376; cv.height = Math.round(376 * H / W)',
  '  const ctx = cv.getContext("2d")',
  '  ctx.drawImage(img, 0, 0, cv.width, cv.height)',
  '  const px = ctx.getImageData(0, 0, cv.width, cv.height).data',
  '  let painted = 0, total = 0',
  '  for (let i = 3; i < px.length; i += 4) { total++; if (px[i] > 12) painted++ }',
  // The coin sits at viewBox 60,46 r17.5 inside viewBox "13 0 94 122", so in
  // canvas fractions that is x 0.44-0.82, y 0.23-0.52. Count distinct colours in
  // it: a drawn glyph adds a dark one, a missing glyph leaves gold and ring only.
  '  const x0 = Math.round(cv.width * 0.47), x1 = Math.round(cv.width * 0.79)',
  '  const y0 = Math.round(cv.height * 0.26), y1 = Math.round(cv.height * 0.49)',
  '  const seen = new Set()',
  '  let darkInCoin = 0',
  '  for (let y = y0; y < y1; y++) {',
  '    for (let x = x0; x < x1; x++) {',
  '      const i = (y * cv.width + x) * 4',
  '      seen.add((px[i] >> 4) + "," + (px[i+1] >> 4) + "," + (px[i+2] >> 4))',
  '      if (px[i] + px[i+1] + px[i+2] < 300 && px[i+3] > 128) darkInCoin++',
  '    }',
  '  }',
  '  return { pctPainted: +(100 * painted / total).toFixed(1), coinColours: seen.size, darkInCoin }',
  '})()',
].join('\n')

// Strips the surfaces behind a piece of chrome so it can be captured onto
// transparency, without touching the element itself. Injected for the capture
// only; nothing is persisted and the page is reloaded between modes anyway.
function clearBackground(selectors) {
  return [
    '(() => {',
    '  const s = document.createElement("style")',
    '  s.id = "assetgen-clear"',
    `  s.textContent = ${JSON.stringify(selectors.join(',') + '{background:transparent !important;border-color:transparent !important;box-shadow:none !important}')}`,
    '  document.head.appendChild(s)',
    '  return true',
    '})()',
  ].join('\n')
}

const boxOf = (selector) => [
  '(() => {',
  `  const el = document.querySelector(${JSON.stringify(selector)})`,
  '  if (!el) return null',
  '  const r = el.getBoundingClientRect()',
  '  return { x: r.x, y: r.y, width: r.width, height: r.height }',
  '})()',
].join('\n')

async function main() {
  mkdirSync(BRAND, { recursive: true })
  mkdirSync(WORK, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  for (const f of ['arthniti-mark.svg', 'arthniti-mark-dark.svg']) {
    if (!existsSync(`${BRAND}/${f}`)) throw new Error('missing source SVG: ' + f)
  }

  // A page per mark, written to disk so the <img> src is a plain relative file://
  // reference rather than a data: URL with an SVG escaped inside it.
  writeFileSync(`${WORK}/mark-light.html`, markPage('../../frontend/src/assets/brand/arthniti-mark.svg', 376, 488))
  writeFileSync(`${WORK}/mark-dark.html`, markPage('../../frontend/src/assets/brand/arthniti-mark-dark.svg', 376, 488))

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    '--allow-file-access-from-files',
    '--disable-gpu', '--disable-sync', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const written = []
  const notes = {}

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    // Transparent page, so a captured clip carries an alpha channel instead of
    // white. This is the whole reason the marks can be dropped onto any slide.
    await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })

    // ---- 1. the mark, from the shipped standalone SVGs -------------------
    for (const [file, out] of [['mark-light.html', 'arthniti-mark'], ['mark-dark.html', 'arthniti-mark-dark']]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 560, deviceScaleFactor: 1, mobile: false })
      await cdp.send('Page.navigate', { url: 'file:///' + `${WORK}/${file}`.replace(/\\/g, '/').replace(/^\/+/, '') })
      await sleep(700)
      notes[out] = await cdp.evaluate(INK_PROBE)

      // 512 and 1024 wide. 512 covers a slide and every favicon size; 1024 is
      // there for print, where 512 upscaled shows on a poster.
      for (const width of [512, 1024]) {
        const height = Math.round(width * 122 / 94)
        const scale = width / 376
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: 376, height: 488, scale },
        })
        const name = `${out}-${width}.png`
        writeFileSync(`${BRAND}/${name}`, Buffer.from(shot.data, 'base64'))
        written.push(`${name}  (${width}x${height}, transparent)`)
      }
    }

    // ---- 2. the lockup and the wordmark, from the live app ---------------
    let appUp = true
    try {
      await cdp.send('Page.navigate', { url: APP + '/' })
      await sleep(1500)
      const probe = await cdp.evaluate('!!document.querySelector(".ui-brand")')
      if (!probe) appUp = false
    } catch { appUp = false }

    if (!appUp) {
      console.log('\n! Vite is not serving ' + APP + ' — skipped the lockup and wordmark.')
      console.log('  Start it (cd frontend && npm run dev) and re-run for those four files.')
    } else {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

      for (const theme of ['light', 'dark']) {
        await cdp.evaluate([
          `localStorage.setItem('sih-theme', '${theme}');`,
          "localStorage.setItem('sih-language', 'en');",
          "localStorage.setItem('sih-textsize', 'md');",
          "localStorage.removeItem('sih-dialect');",
          'true',
        ].join(''))
        await cdp.send('Page.navigate', { url: APP + '/' })
        await sleep(1500)

        // The lockup: mark + product name + tagline, exactly as the masthead
        // sets it. Surfaces behind it cleared so the capture is transparent.
        //
        // The list runs past the masthead on purpose. The clip is the brand block
        // plus 10px, and the masthead only has ~11px of slack below the block, so
        // a stray 2-3px band from whatever sits immediately underneath lands in
        // the capture — the first run put a grey hairline across the bottom of
        // both lockups. Clearing every chrome surface makes the capture
        // independent of exactly which neighbour is closest, which is the thing
        // that would otherwise change the moment the masthead's padding moves.
        await cdp.evaluate(clearBackground([
          'html', 'body', '.ui-shell',
          '.ui-utilitybar', '.ui-masthead', '.ui-masthead-inner',
          '.ui-tricolour', '.ui-topbar', '.ui-navbar', '.ui-breadcrumb',
        ]))
        const brand = await cdp.evaluate(boxOf('.ui-brand'))
        if (brand) {
          const pad = 10
          const shot = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            clip: {
              x: Math.max(0, brand.x - pad), y: Math.max(0, brand.y - pad),
              // The lockup is only ~305 CSS px wide in the masthead, so it is
              // captured at 6x. This is a re-render at that resolution, not an
              // upscale of a 305px bitmap: the mark is vector and the name is
              // live text, so both come out crisp enough for print.
              width: brand.width + pad * 2, height: brand.height + pad * 2, scale: 6,
            },
          })
          const name = `arthniti-lockup-${theme === 'light' ? 'on-light' : 'on-dark'}.png`
          writeFileSync(`${BRAND}/${name}`, Buffer.from(shot.data, 'base64'))
          written.push(`${name}  (${Math.round((brand.width + 20) * 6)}px wide, transparent)`)
          notes[name] = { cssWidth: Math.round(brand.width), cssHeight: Math.round(brand.height) }
        }
      }

      // ---- 3. the wordmark alone, on transparency, in both colour cases ----
      //
      // This step used to capture ONE file on a navy plate, and the comment here
      // used to say that plate was not optional: --wordmark-niti was #FFF4E0, a
      // cream invisible on white, and the utility strip the wordmark lived in was
      // #08243F in BOTH themes, so one file covered both. Every clause of that
      // died on 11 Sept 2026 when the wordmark moved into the masthead. It sits on
      // var(--color-surface) now, which flips — so the tokens gained a LIGHT case
      // (#8A5A0A / #12233A / #B86F10) that is dark-on-light and needs no plate at
      // all, and the two themes stopped sharing one rendering. Hence two files,
      // both transparent: a dark slide is the plate for the dark case.
      //
      // The step was also BROKEN by that move rather than merely stale, which is
      // the part worth keeping written down. It grew .ui-utilitybar's padding to
      // 34px and then clamped the clip to that band's box — but the band no longer
      // contains .ui-wordmark, and growing it pushed the masthead 68px further
      // down, so the clamp resolved to bottom < top, i.e. a negative-height clip.
      // A capture step that hardcodes which container its subject sits in breaks
      // silently the moment the subject moves; clearing the surfaces and clipping
      // to the element's own box does not.
      for (const theme of ['light', 'dark']) {
        await cdp.evaluate([
          `localStorage.setItem('sih-theme', '${theme}');`,
          "localStorage.setItem('sih-language', 'en');",
          "localStorage.setItem('sih-textsize', 'md');",
          "localStorage.removeItem('sih-dialect');",
          'true',
        ].join(''))
        await cdp.send('Page.navigate', { url: APP + '/' })
        await sleep(1500)
        await cdp.evaluate(clearBackground([
          'html', 'body', '.ui-shell',
          '.ui-utilitybar', '.ui-masthead', '.ui-masthead-inner', '.ui-brand',
          '.ui-tricolour', '.ui-topbar', '.ui-navbar', '.ui-breadcrumb',
        ]))

        const wm = await cdp.evaluate(boxOf('.ui-wordmark'))
        if (!wm) continue
        // The pad is small ON PURPOSE. The tricolour band sits ~11px under the
        // brand block, and a generous margin here would clip a slice of it into
        // the file the way the lockup's first run pulled in a grey hairline. The
        // usable margin is added afterwards, off a measured alpha bounding box,
        // where it cannot pick up a neighbour.
        const pad = 5
        // 40x rather than the lockup's 6x, because the wordmark is only ~74 CSS
        // px wide in the masthead. This is a re-render at that resolution and not
        // an upscale — the name is live text and the swoosh is an SVG path, so
        // both are re-rasterised from vectors. Nothing here is interpolated.
        const scale = 40
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: Math.max(0, wm.x - pad), y: Math.max(0, wm.y - pad),
            width: wm.width + pad * 2, height: wm.height + pad * 2, scale,
          },
        })
        const name = `arthniti-wordmark-${theme === 'light' ? 'on-light' : 'on-dark'}.png`
        writeFileSync(`${BRAND}/${name}`, Buffer.from(shot.data, 'base64'))
        written.push(`${name}  (${Math.round((wm.width + pad * 2) * scale)}px wide, transparent)`)
        notes[name] = {
          cssWidth: +wm.width.toFixed(1),
          cssHeight: +wm.height.toFixed(1),
          scale,
          arth: await cdp.evaluate('getComputedStyle(document.querySelector(".ui-wordmark-arth")).color'),
          niti: await cdp.evaluate('getComputedStyle(document.querySelector(".ui-wordmark-niti")).color'),
        }
      }
    }
  } finally {
    edge.kill()
  }

  console.log('\nWrote ' + written.length + ' file(s) into frontend/src/assets/brand:')
  for (const w of written) console.log('  ' + w)
  console.log('\nMeasurements:')
  console.log(JSON.stringify(notes, null, 2))
  process.exit(written.length ? 0 : 1)
}

main().catch((error) => {
  console.error('assetgen failed: ' + error.message)
  process.exit(1)
})

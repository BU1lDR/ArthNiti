// The error banner on /finance, in all eight languages, on both of the paths a
// reader can actually reach it by.
//
// This is the one piece of user-facing text no other verifier can see. drive.mjs
// and mobile-audit.mjs LOAD routes; mobile-audit and lang-layout measure geometry;
// manual-audit clicks one dialog open. None of them submits the form, so nothing
// has ever rendered this banner — and until 8 Sept 2026 it printed an English
// sentence in all eight languages, which is exactly the failure a screenshot in
// Hindi would have shown instantly and no script would ever report.
//
// It is also the highest-traffic error text in the app. "The backend is not
// running" is the commonest failure on a demo laptop, so a judge watching a
// Hindi walkthrough is more likely to meet this sentence than most of the pages.
//
// Two cases per language, because they exercise different code:
//
//   VALIDATION  /finance submitted with no business category and no state. The
//               backend returns 422 with a list of field objects, api.js turns
//               that into err.checkFields plus two field keys, and the page
//               translates each key and rejoins them. This is the only path that
//               interpolates anything, so it is the only one that can leak a
//               literal {fields} or an [object Object] — both of which have been
//               live bugs in this file's history.
//   OFFLINE     the same submit with the API URL blocked at the network layer, so
//               fetch rejects and api.js throws err.offline. No placeholder, but
//               it is the path a judge is most likely to see.
//
// What it fails on, per banner:
//   * nothing rendered, or an empty banner
//   * a leaked dotted i18n key (err.offline printed as "err.offline")
//   * an unsubstituted {fields}
//   * [object Object] / undefined / null in the text
//   * for a non-English language, text byte-identical to the English banner —
//     which is the original defect and the whole reason this file exists
//   * a validation banner with no field list in it
//
// Run the backend AND the Vite dev server first, then:
//   node screenshots/verify/error-banner.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9347
// localhost, not 127.0.0.1: vite dev binds [::1] only and the IPv4 address refuses.
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/errors')
// Absolute. A relative --user-data-dir silently attaches to the already-running
// Edge profile and exits with no debug port.
const PROFILE_DIR = resolve('screenshots/verify/edge-profile-errors')

const LANGS = ['en', 'hi', 'ta', 'te', 'ml', 'kn', 'mr', 'bn']

// Fills the two fields /finance marks required — without them native validation
// blocks the submit and the request is never made — while leaving the business
// category and the state empty, which is what makes the backend answer 422 and
// name exactly two fields. Two rather than one is deliberate: it exercises the
// join, so an empty field list cannot pass as a rendered one.
const SEED = {
  v: 1,
  data: {
    profile: { name: 'Probe', language: 'Hindi', dialect: '', literacyLevel: 'low' },
    business: {
      businessName: '',
      category: '',
      categoryOther: '',
      initialInvestment: '50000',
      monthlyRevenue: '20000',
      monthlyOperatingExpenses: '5000',
      employees: 0,
      existingDebt: 0,
    },
    location: {
      village: '',
      district: '',
      state: '',
      locationType: 'rural',
      marketType: [],
      customers: '',
    },
    finance: { availableCapital: '10000', monthlyExpenses: '8000', monthlyEmi: '0' },
    result: null,
  },
}

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
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) {
      throw new Error(
        'page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text),
      )
    }
    return r.result.value
  }
}

async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch {
      /* not listening yet */
    }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

// Plain joined strings, not a template literal: this probe carries a regex and
// braces, and a template literal is where those quietly stop being what they
// look like.
const SUBMIT_AND_READ = [
  '(async () => {',
  '  const form = document.querySelector("form")',
  '  if (!form) return { error: "no form on the page" }',
  '  const button = form.querySelector("button[type=submit]")',
  '  if (!button) return { error: "no submit button in the form" }',
  // Native validation would silently swallow the submit and the probe would
  // report an absent banner as a translation failure. Say which it was.
  '  if (!form.checkValidity()) {',
  '    const bad = [...form.querySelectorAll(":invalid")].map(el => el.name || el.tagName)',
  '    return { error: "the form did not pass native validation: " + bad.join(", ") }',
  '  }',
  '  button.click()',
  '  for (let i = 0; i < 60; i++) {',
  '    await new Promise(r => setTimeout(r, 100))',
  '    const alert = document.querySelector("[role=alert].ui-notice-danger")',
  '    if (alert) return { text: alert.textContent.trim() }',
  '  }',
  '  return { error: "no banner appeared within 6s" }',
  '})()',
].join('\n')

const DOTTED_KEY = /(?:^|[\s(])(?:err|errf|common|finance|business|location|money|nav)\.[a-zA-Z]/

function check(entry, englishText) {
  const notes = []
  const { lang, kase, text } = entry

  if (!text) {
    notes.push('no banner text')
    return notes
  }

  if (DOTTED_KEY.test(text)) notes.push(`leaked i18n key in the banner: "${text}"`)
  if (text.includes('{')) notes.push(`unsubstituted placeholder left in the banner: "${text}"`)

  for (const bad of ['[object Object]', 'undefined', 'null', 'NaN']) {
    if (text.includes(bad)) notes.push(`banner contains "${bad}": "${text}"`)
  }

  // The defect this file exists for. An English sentence in a Tamil UI is not a
  // crash and not a missing key — every other check in the repo passes on it.
  if (lang !== 'en' && englishText && text === englishText) {
    notes.push(`banner is byte-identical to English, so it never translated: "${text}"`)
  }

  if (lang !== 'en' && !/[^\u0000-\u00FF]/.test(text)) {
    notes.push(`banner has no non-Latin character, so it is probably still English: "${text}"`)
  }

  // Two fields were left empty, so the list must have rendered both. An empty
  // `fields` array would produce a grammatical sentence naming nothing.
  if (kase === 'validation' && !text.includes(',')) {
    notes.push(`validation banner names no field list: "${text}"`)
  }

  return notes
}

async function main() {
  mkdirSync(OUT, { recursive: true })

  const edge = spawn(
    EDGE,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE_DIR}`,
      '--remote-allow-origins=*',
      '--disable-gpu',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-features=Translate,MediaRouter',
    ],
    { stdio: 'ignore' },
  )

  let failures = 0
  const report = []
  const english = {}

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready
    // Our own target. The first `type === 'page'` from /json/list is
    // edge://sync-confirmation-dialog/ on a signed-in profile.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send(
      'Target.attachToTarget',
      { targetId, flatten: true },
      false,
    )
    cdp.sessionId = sessionId
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    })

    // English first, so every other language has a baseline to be compared
    // against rather than being trusted on its own.
    for (const lang of LANGS) {
      console.log(`\n${lang}`)

      for (const kase of ['validation', 'offline']) {
        await cdp.send('Network.setBlockedURLs', {
          urls: kase === 'offline' ? ['*/api/analysis/run'] : [],
        })

        // Land somewhere same-origin before writing storage, then load /finance
        // so the context hydrates from it.
        await cdp.send('Page.navigate', { url: APP + '/' })
        await sleep(700)
        await cdp.evaluate(
          [
            `localStorage.setItem('sih-language', '${lang}');`,
            `localStorage.removeItem('sih-dialect');`,
            `localStorage.setItem('sih-theme', 'light');`,
            `sessionStorage.setItem('sih-application', ${JSON.stringify(JSON.stringify(SEED))});`,
            'true',
          ].join(''),
        )
        await cdp.send('Page.navigate', { url: APP + '/finance' })
        await sleep(1200)

        const result = await cdp.evaluate(SUBMIT_AND_READ)

        if (result.error) {
          failures++
          console.log(`  ${kase.padEnd(10)} FAIL  ${result.error}`)
          report.push({ lang, kase, error: result.error })
          continue
        }

        const entry = { lang, kase, text: result.text }
        if (lang === 'en') english[kase] = result.text

        const notes = check(entry, english[kase])
        entry.notes = notes
        report.push(entry)

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
        writeFileSync(`${OUT}/${kase}-${lang}.png`, Buffer.from(shot.data, 'base64'))

        if (notes.length) {
          failures++
          console.log(`  ${kase.padEnd(10)} FAIL`)
          for (const n of notes) console.log(`    ${n}`)
        } else {
          console.log(`  ${kase.padEnd(10)} ok    ${result.text.slice(0, 78)}`)
        }
      }
    }
  } finally {
    edge.kill()
  }

  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  console.log(
    `\n${LANGS.length * 2} banners checked across ${LANGS.length} languages, ${failures} with problems.`,
  )
  console.log(`Captures and report.json in ${OUT}`)
  process.exit(failures ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

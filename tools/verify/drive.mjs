// Headless verification driver. No dependencies: Edge is already on this machine
// and Node 24 has a global WebSocket, so this speaks the Chrome DevTools Protocol
// directly rather than pulling in Playwright.
//
// Why it seeds sessionStorage instead of typing into the forms: the analysis call
// fires on the /finance submit, and driving four React-controlled forms through
// CDP is a lot of brittle machinery to reach a state we can just write down. The
// payloads under screenshots/verify/*.json come from the REAL backend, so the
// result pages render against a genuine response — only the typing is skipped.
//
// Two Edge gotchas are baked in below: the user-data-dir must be ABSOLUTE (a
// relative one silently attaches to the already-running profile, and the second
// instance exits without ever opening a debug port), and we create our own target
// through the browser endpoint rather than picking the first "page" in /json/list,
// which on a signed-in profile is a sync-confirmation dialog.
//
// Run from the repo root:  node tools/verify/drive.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9222
// localhost, not 127.0.0.1: the Vite dev server binds [::1] only, so the IPv4
// literal refuses the connection even though the server is plainly up.
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/out')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- the form answers that go with each captured backend response -------------
const FORMS = {
  good: {
    profile: { name: 'Lakshmi Devi', language: 'Tamil', dialect: '', literacyLevel: 'low' },
    business: {
      businessName: 'Lakshmi Tailors', category: 'tailoring', categoryOther: '',
      initialInvestment: '200000', monthlyRevenue: '30000',
      monthlyOperatingExpenses: '18000', employees: 2, existingDebt: 0,
    },
    location: {
      village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
      locationType: 'rural', marketType: ['village', 'weekly'], customers: 'Local families',
    },
    finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000' },
  },
  nulls: {
    profile: { name: 'Ram Prasad', language: 'Hindi', dialect: '', literacyLevel: 'low' },
    business: {
      businessName: 'Ram Tailor Shop', category: 'tailoring', categoryOther: '',
      initialInvestment: '0', monthlyRevenue: '10000',
      monthlyOperatingExpenses: '12000', employees: 0, existingDebt: 40000,
    },
    location: {
      village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh',
      locationType: 'rural', marketType: ['village'], customers: 'Local families',
    },
    finance: { availableCapital: '5000', monthlyExpenses: '20000', monthlyEmi: '5000' },
  },
  // Was agriculture in Delhi until the scheme file grew to thirty, at which
  // point it started matching twelve and stopped testing the "nothing matched"
  // empty state. A typed-in Other is now the only input that reaches it — see
  // refresh-cases.mjs, which regenerates the response beside this.
  empty: {
    profile: { name: 'Suresh Kumar', language: 'Kannada', dialect: '', literacyLevel: 'low' },
    business: {
      businessName: 'Suresh Studio', category: 'other', categoryOther: 'Photography',
      initialInvestment: '80000', monthlyRevenue: '25000',
      monthlyOperatingExpenses: '9000', employees: 1, existingDebt: 0,
    },
    location: {
      village: '', district: 'New Delhi', state: 'Delhi',
      locationType: 'rural', marketType: ['town'], customers: '',
    },
    finance: { availableCapital: '50000', monthlyExpenses: '10000', monthlyEmi: '2000' },
  },

  // Nothing entered. This is the case the other three cannot reach: the form
  // pages compute live previews from `Number(field) || 0`, so an unanswered
  // question arrives as a real 0 and every derived figure reads as good news —
  // "₹30,000 left each month", "you have enough of your planned investment" —
  // before the user has told us anything. That is the same false-reassurance
  // class as known defect 4, and it only shows up with the fields genuinely
  // blank, which is why an all-zeros case is not a substitute.
  blank: {
    profile: { name: '', language: 'Hindi', dialect: '', literacyLevel: 'low' },
    business: {
      businessName: '', category: '', categoryOther: '',
      initialInvestment: '', monthlyRevenue: '',
      monthlyOperatingExpenses: '', employees: 0, existingDebt: 0,
    },
    location: {
      village: '', district: '', state: '',
      locationType: 'rural', marketType: [], customers: '',
    },
    finance: { availableCapital: '', monthlyExpenses: '', monthlyEmi: '' },
  },
}

const RESULTS = {
  good: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')),
  nulls: JSON.parse(readFileSync('screenshots/verify/case_nulls.json', 'utf8')),
  empty: JSON.parse(readFileSync('screenshots/verify/case_empty.json', 'utf8')),
  // Explicitly null, not just absent: the blank case has never submitted, so
  // every result page must show its own "not ready yet" state.
  blank: null,
}

const RESULT_ROUTES = ['/analysis', '/schemes', '/advisory', '/report']
const ALL_ROUTES = ['/', '/login', '/profile', '/business', '/location', '/finance', ...RESULT_ROUTES, '/no-such-page']

// case, language, routes
const PASSES = [
  ['good', 'en', ALL_ROUTES],
  ['good', 'ta', RESULT_ROUTES],
  ['good', 'hi', RESULT_ROUTES],
  ['nulls', 'en', RESULT_ROUTES],
  ['empty', 'en', RESULT_ROUTES],
  ['good', 'bn', ['/analysis']],
  // Blank forms: the four journey pages plus the result pages, which must all
  // fall to their "not ready yet" state rather than rendering a zeroed report.
  ['blank', 'en', ['/profile', '/business', '/location', '/finance', ...RESULT_ROUTES]],
]

// --- minimal CDP client, session-aware ---------------------------------------
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.next = 1
    this.pending = new Map()
    this.consoleErrors = []
    this.pageErrors = []
    this.sessionId = null

    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve())
      this.ws.addEventListener('error', () => reject(new Error('CDP socket error')))
    })

    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)

      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        this.consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '))
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'unknown')
      }

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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
      this.ws.send(JSON.stringify(envelope))
    })
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) {
      throw new Error('page threw: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text))
    }
    return res.result.value
  }
}

async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl
    } catch {
      // Edge is not listening yet.
    }
    await sleep(250)
  }
  throw new Error('Edge never opened the DevTools endpoint on port ' + DEBUG_PORT)
}

// Wait until React has actually painted into the main landmark. A bare
// readyState check passes on an empty shell, which is the failure mode we most
// want to catch.
async function waitForRender(cdp) {
  for (let i = 0; i < 75; i++) {
    const len = await cdp.evaluate(`document.querySelector('#main')?.innerText?.trim().length || 0`).catch(() => 0)
    if (len > 40) return true
    await sleep(200)
  }
  return false
}

async function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  mkdirSync(PROFILE_DIR, { recursive: true })

  const edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-allow-origins=*',
    '--window-size=1440,1600',
    '--disable-gpu',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-features=Translate,MediaRouter',
  ], { stdio: 'ignore' })

  const findings = []
  const report = []

  try {
    const cdp = new CDP(await browserWsUrl())
    await cdp.ready

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }, false)
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }, false)
    cdp.sessionId = sessionId

    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    for (const [caseName, lang, routes] of PASSES) {
      // Establish the origin before writing storage, then seed and navigate.
      await cdp.send('Page.navigate', { url: APP + '/' })
      await waitForRender(cdp)

      const payload = JSON.stringify({ v: 1, data: { ...FORMS[caseName], result: RESULTS[caseName] } })
      await cdp.evaluate(`
        sessionStorage.setItem('sih-application', ${JSON.stringify(payload)});
        localStorage.setItem('sih-language', ${JSON.stringify(lang)});
        localStorage.setItem('sih-theme', 'light');
        localStorage.removeItem('sih-dialect');
        true;
      `)

      for (const route of routes) {
        const tag = `${caseName}-${lang}-${route.replace(/\//g, '_') || '_root'}`
        cdp.consoleErrors.length = 0
        cdp.pageErrors.length = 0

        await cdp.send('Page.navigate', { url: APP + route })
        const rendered = await waitForRender(cdp)
        await sleep(450)

        const text = await cdp.evaluate('document.body.innerText')
        const title = await cdp.evaluate('document.title')
        const htmlLang = await cdp.evaluate('document.documentElement.lang')
        const barCount = await cdp.evaluate(`document.querySelectorAll('.ui-bar-row').length`)
        const unitCount = await cdp.evaluate(`document.querySelectorAll('.ui-unit-chart').length`)

        writeFileSync(
          `${OUT}/${tag}.txt`,
          `route=${route}\ncase=${caseName}\nlang=${lang}\ntitle=${title}\nhtml[lang]=${htmlLang}\n` +
            `rendered=${rendered}\nbars=${barCount}\nunitCharts=${unitCount}\n` +
            `consoleErrors=${JSON.stringify(cdp.consoleErrors)}\npageErrors=${JSON.stringify(cdp.pageErrors)}\n\n${text}`,
        )

        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        writeFileSync(`${OUT}/${tag}.png`, Buffer.from(shot.data, 'base64'))

        // --- automated checks on the rendered text -------------------------
        const problems = []
        if (!rendered) problems.push('BLANK: #main never filled')
        if (cdp.pageErrors.length) problems.push('PAGE EXCEPTION: ' + cdp.pageErrors[0].split('\n')[0])

        // A t() key that exists in no dictionary falls through to the key
        // itself, so an invented key shows up in the rendered text verbatim.
        const rawKeys = [...new Set(text.match(/\b(?:common|nav|res|st|risk|f|an|ch|mk|sc|sch|ad|rp|login|nf|landing|profile|business|location|finance|money|cat|market|area|greeting)\.[a-zA-Z_][a-zA-Z0-9_]*/g) || [])]
        if (rawKeys.length) problems.push('UNTRANSLATED KEY LEAKED: ' + rawKeys.join(', '))

        for (const bad of ['null%', 'NaN', 'undefined', '[object Object]', 'Infinity', '₹null', '₹NaN', '₹undefined']) {
          if (text.includes(bad)) problems.push(`BAD TOKEN: "${bad}"`)
        }
        // Lowercase enum values and backend field names must never reach screen.
        for (const raw of ['attention_needed', 'break_even', 'not_feasible', 'profit_margin', 'match_level', 'pressure_ratio']) {
          if (text.includes(raw)) problems.push(`RAW ENUM/FIELD ON SCREEN: "${raw}"`)
        }

        // With nothing entered, every derived figure must say so. `Number('')`
        // is 0, so the failure mode is not a crash — it is a confident ₹0 and a
        // reassuring sentence about money the user never told us about. This is
        // the check the all-filled cases structurally cannot make.
        if (caseName === 'blank') {
          if (/₹\s?0(?!\d)/.test(text)) {
            problems.push('FALSE ₹0: a derived figure printed zero for an unanswered question')
          }
          for (const claim of ['You have enough', 'enough of your planned investment']) {
            if (text.includes(claim)) problems.push(`FALSE REASSURANCE: "${claim}" with a blank form`)
          }
        }

        report.push({ tag, route, caseName, lang, rendered, chars: text.length, bars: barCount, unitCharts: unitCount, problems })
        if (problems.length) findings.push({ tag, problems })

        console.log(
          `${problems.length ? 'FAIL' : 'ok  '}  ${tag.padEnd(32)} ${String(text.length).padStart(5)}c ` +
            `bars=${String(barCount).padStart(2)} coins=${unitCount}` +
            (problems.length ? '  ' + problems.join(' | ') : ''),
        )
      }
    }

    writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, findings }, null, 2))
    console.log(`\n${report.length} page loads, ${findings.length} with problems.`)
    console.log(`Text dumps and PNGs in ${OUT}`)
  } finally {
    edge.kill()
    spawn('taskkill', ['/F', '/T', '/IM', 'msedge.exe'], { stdio: 'ignore' })
  }
}

main().catch((err) => {
  console.error('DRIVER ERROR:', err.message)
  spawn('taskkill', ['/F', '/T', '/IM', 'msedge.exe'], { stdio: 'ignore' })
  process.exit(1)
})

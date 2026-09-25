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
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const DEBUG_PORT = 9222
// localhost, not 127.0.0.1: the Vite dev server binds [::1] only, so the IPv4
// literal refuses the connection even though the server is plainly up.
const APP = 'http://localhost:5173'
const OUT = resolve('screenshots/verify/out')
const PROFILE_DIR = resolve('screenshots/verify/edge-profile')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- how our Edge dies -----------------------------------------------------------
// By PID and nothing else. This used to finish with `taskkill /IM msedge.exe`,
// which also closed whatever Edge the person running the gate had open. The
// msedge.exe we spawn relaunches itself through a compatibility layer and exits
// within a second, so its PID alone is not enough: --edge-skip-compat-layer-
// relaunch stops that at the source, and ownEdgePids() is the fallback, finding
// the browser process that carries OUR profile path and no --type= (every
// renderer, GPU and utility child carries one; taskkill /T takes those with it).
// The path is anchored at a quote, a space or the end, because this profile dir
// is a prefix of thirteen other scripts' dirs (edge-profile-mobile, -print, ...),
// and a bare substring match would kill a gate running beside this one.
// Same technique as market-ui.mjs.
let edge = null
function ownEdgePids() {
  const script =
    "$p = [regex]::Escape($env:DRIVE_EDGE_PROFILE) + '(?=[\"\\s]|$)'; " +
    "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -and " +
    "$_.CommandLine -match $p -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.ProcessId }"
  const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, DRIVE_EDGE_PROFILE: PROFILE_DIR },
    encoding: 'utf8',
  })
  return (r.stdout || '').split(/\s+/).filter((s) => /^\d+$/.test(s)).map(Number)
}
function killOwnEdge() {
  const kill = (pid) => spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
  // A spawned PID that has already exited is skipped: it may belong to something else by now.
  if (edge && edge.exitCode === null && edge.signalCode === null) kill(edge.pid)
  edge = null
  for (const pid of ownEdgePids()) kill(pid)
}

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

// Answered, submitted, then edited. Changing an answer on /business, /location
// or /finance throws the result away and sets `resultCleared`, so each result
// page must say the old result was removed (res.changedTitle), not show it, and
// not fall to the "not ready yet" state of someone who never submitted. The
// answers are `good`'s, because the flag only ever arises once there are answers.
FORMS.cleared = structuredClone(FORMS.good)

const RESULTS = {
  good: JSON.parse(readFileSync('screenshots/verify/case_good.json', 'utf8')),
  nulls: JSON.parse(readFileSync('screenshots/verify/case_nulls.json', 'utf8')),
  empty: JSON.parse(readFileSync('screenshots/verify/case_empty.json', 'utf8')),
  // Explicitly null, not just absent: the blank case has never submitted, so
  // every result page must show its own "not ready yet" state.
  blank: null,
  // Null because the edit discarded it. What it USED to be is good's response,
  // which is what the cleared checks look for and must not find.
  cleared: null,
}

// Extra fields in the seeded payload, beside the answers and the result.
const SEED_EXTRA = {
  cleared: { resultCleared: true },
}

// --- the sessionStorage envelope ---------------------------------------------
// AppContext reads {v, data} and discards a payload whose v is not in its
// READABLE_VERSIONS, silently, by returning the blank form. FORMS above are
// written in the version 2 shape (version 1 plus `resultCleared`), so the seed
// says 2, and the script refuses to start if AppContext no longer reads that
// version: every result page would fall to its empty state, and the findings
// would point everywhere except at the seed.
const SEED_VERSION = 2
const APP_CONTEXT = 'frontend/src/context/AppContext.jsx'
{
  const m = readFileSync(APP_CONTEXT, 'utf8').match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)/m)
  if (!m) throw new Error(`READABLE_VERSIONS not found in ${APP_CONTEXT}; update the parse in drive.mjs`)
  const readable = m[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number)
  if (!readable.includes(SEED_VERSION)) {
    throw new Error(
      `${APP_CONTEXT} no longer reads version ${SEED_VERSION} payloads (READABLE_VERSIONS is ` +
        `${readable.join(', ')}). Rewrite FORMS in drive.mjs to the new shape and raise SEED_VERSION.`,
    )
  }
}

const RESULT_ROUTES = ['/analysis', '/schemes', '/advisory', '/report']

// --- the scheme-card check ----------------------------------------------------
// Every scheme card must print what its fit_basis says (sc.fitState /
// sc.fitRegion / sc.fitNational in the page's language) and must never print its
// match score as a percentage. The score is 60 + 40 or 60 + 30 and checks no
// eligibility rule, so "90%" reads as a 90% chance of qualifying. This lives in
// the main gate rather than in a one-off probe because it is a standing rule.
//
// It has to open every <details> first: the page text above is innerText,
// which skips the body of a closed <details>, so a percentage re-added inside
// a disclosure would pass everything else in this script.
const CARD_ROUTES = ['/analysis', '/schemes', '/report']
const FIT_KEYS = { state: 'sc.fitState', region: 'sc.fitRegion', national: 'sc.fitNational' }
const { RESULT_STRINGS } = await import(pathToFileURL(resolve('frontend/src/i18n/resultStrings.js')).href)
// Same per-key English fallback as t(), so a key missing in one language is
// judged against the English the page would really print.
const resultText = (lang, key) => RESULT_STRINGS[lang]?.[key] ?? RESULT_STRINGS.en[key]
const fitText = (lang, basis) => resultText(lang, FIT_KEYS[basis])

// --- the cleared-result check -------------------------------------------------
// What each result page prints when there is no result and none was ever made.
// A cleared result must not print it: that sentence tells someone who DID
// submit that they never finished, and sends them back to the start.
const NOT_READY_KEYS = {
  '/analysis': 'res.notReady',
  '/schemes': 'sch.finishTitle',
  '/advisory': 'ad.notReady',
  '/report': 'rp.notReady',
}
const CLEARED_KEYS = ['res.changedTitle', 'res.changedButton']
// Checked here rather than at use: resultText() of a key missing from `en` is
// undefined, and text.includes(undefined) looks for the word "undefined", so a
// renamed key would turn the "must not appear" half of the check into a pass.
for (const key of [...CLEARED_KEYS, ...Object.values(NOT_READY_KEYS)]) {
  if (typeof RESULT_STRINGS.en[key] !== 'string') throw new Error(`${key} is not defined in resultStrings.js en`)
}
// The result the edit threw away. Its scheme names render in English in every
// language (the card check below finds them that way), so they are a direct
// test that none of the old result reached the page.
const DISCARDED_SCHEMES = (RESULTS.good?.scheme_matches || []).map((s) => s.name)
// Score-shaped only: a scheme's own prose legitimately carries percentages
// (PM Vishwakarma's "5% interest"), and the score is only ever 90 or 100.
const SCORE_PCT = /(?<![\d.,-])(90|100)\s*%/

// Runs in the page. For each scheme name, finds its heading, walks up to the
// card that holds it, and returns that card's text with every <details> open.
const cardProbe = (names) => `(() => {
  document.querySelectorAll('details').forEach((d) => { d.open = true })
  const names = ${JSON.stringify(names)}
  const heads = [...document.querySelectorAll('h2, h3')]
  return names.map((name) => {
    const h = heads.find((el) => el.textContent.trim() === name)
    const card = h && h.closest('section.ui-card, .ui-card-soft, div.rounded-2xl.border')
    return card ? { found: true, text: card.innerText } : { found: false }
  })
})()`
const ALL_ROUTES = ['/', '/login', '/profile', '/business', '/location', '/finance', ...RESULT_ROUTES, '/no-such-page']

// case, language, routes. 8 passes, 40 page loads: 11 + 4 + 4 + 4 + 4 + 1 + 8 + 4.
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
  // A result thrown away by an edited answer. In Hindi, the default language,
  // so the expected sentence comes from a real translation rather than from the
  // English fallback.
  ['cleared', 'hi', RESULT_ROUTES],
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

  edge = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--edge-skip-compat-layer-relaunch',
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

      const payload = JSON.stringify({
        v: SEED_VERSION,
        data: { ...FORMS[caseName], result: RESULTS[caseName], ...(SEED_EXTRA[caseName] || {}) },
      })
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
        const rawKeys = [...new Set(text.match(/\b(?:common|nav|res|st|risk|f|an|ch|mk|sc|sch|ad|rp|login|nf|landing|profile|business|location|finance|money|cat|market|area|greeting|cmd|mknote|src)\.[a-zA-Z_][a-zA-Z0-9_]*/g) || [])]
        if (rawKeys.length) problems.push('UNTRANSLATED KEY LEAKED: ' + rawKeys.join(', '))

        for (const bad of ['null%', 'NaN', 'undefined', '[object Object]', 'Infinity', '₹null', '₹NaN', '₹undefined']) {
          if (text.includes(bad)) problems.push(`BAD TOKEN: "${bad}"`)
        }
        // Lowercase enum values and backend field names must never reach screen.
        for (const raw of [
          'attention_needed', 'break_even', 'not_feasible', 'profit_margin', 'match_level', 'pressure_ratio',
          'fit_basis', 'wholesale_price_per_kg', 'registered_units', 'count_suppressed',
          // The household repayment check: its enum values and field names.
          'household_check', 'within_limit', 'over_limit', 'not_checked',
          'household_repayment_percent', 'household_in_microfinance_range',
        ]) {
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

        // A result thrown away by an edited answer. The page must say so in the
        // reader's language, must not show the "not ready yet" state of someone
        // who never submitted, and must show nothing of the old result: no
        // chart, no rupee figure, none of its scheme names. Read from #main so
        // the chrome and the footer cannot satisfy or trip it.
        if (caseName === 'cleared') {
          const mainText = await cdp.evaluate(`document.querySelector('#main')?.innerText || ''`)
          for (const key of CLEARED_KEYS) {
            if (!mainText.includes(resultText(lang, key))) problems.push(`CLEARED STATE MISSING: ${key}`)
          }
          const notReady = NOT_READY_KEYS[route]
          if (notReady && mainText.includes(resultText(lang, notReady))) {
            problems.push(`WRONG EMPTY STATE: ${notReady} shown for a cleared result`)
          }
          if (barCount || unitCount) problems.push(`OLD RESULT SHOWN: ${barCount} bar(s), ${unitCount} coin chart(s)`)
          if (/₹\s?\d/.test(mainText)) problems.push('OLD RESULT SHOWN: a rupee figure')
          const shown = DISCARDED_SCHEMES.filter((name) => mainText.includes(name))
          if (shown.length) problems.push(`OLD RESULT SHOWN: ${shown.length} scheme name(s), e.g. ${shown[0]}`)
        }

        // After the text dump and the screenshot, because it opens every
        // <details> and both of those should show the page as a reader lands on it.
        const schemes = RESULTS[caseName]?.scheme_matches || []
        let cardsChecked = 0
        if (CARD_ROUTES.includes(route) && schemes.length > 0) {
          const cards = await cdp.evaluate(cardProbe(schemes.map((s) => s.name)))
          cards.forEach((card, i) => {
            const scheme = schemes[i]
            if (!card.found) { problems.push(`SCHEME CARD NOT FOUND: ${scheme.name}`); return }
            cardsChecked++
            const pct = SCORE_PCT.exec(card.text)
            if (pct) problems.push(`SCORE AS PERCENT on ${scheme.name}: "${pct[0]}"`)
            const want = fitText(lang, scheme.fit_basis)
            if (!want || !card.text.includes(want)) problems.push(`FIT LABEL MISSING on ${scheme.name} (fit_basis=${scheme.fit_basis})`)
            for (const other of Object.keys(FIT_KEYS)) {
              if (other !== scheme.fit_basis && card.text.includes(fitText(lang, other))) {
                problems.push(`WRONG FIT LABEL on ${scheme.name}: ${other} for ${scheme.fit_basis}`)
              }
            }
          })
        }

        report.push({ tag, route, caseName, lang, rendered, chars: text.length, bars: barCount, unitCharts: unitCount, cardsChecked, problems })
        if (problems.length) findings.push({ tag, problems })

        console.log(
          `${problems.length ? 'FAIL' : 'ok  '}  ${tag.padEnd(32)} ${String(text.length).padStart(5)}c ` +
            `bars=${String(barCount).padStart(2)} coins=${unitCount}` +
            (cardsChecked ? ` cards=${cardsChecked}` : '') +
            (problems.length ? '  ' + problems.join(' | ') : ''),
        )
      }
    }

    writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, findings }, null, 2))
    console.log(`\n${report.length} page loads, ${findings.length} with problems.`)
    console.log(`Text dumps and PNGs in ${OUT}`)
    // Exit 1 on any finding, so a caller that checks the status sees it. It
    // used to exit 0 either way, and only report.json said otherwise.
    process.exitCode = findings.length ? 1 : 0
  } finally {
    killOwnEdge()
  }
}

main().catch((err) => {
  console.error('DRIVER ERROR:', err.message)
  killOwnEdge()
  process.exit(1)
})

// Regenerates the driver's captured backend responses from the LIVE backend.
//
// The fixtures are checked-in-shaped snapshots, so they go stale silently: the
// three case_*.json files still held two schemes with no `level` and no
// translation codes long after schemes.json grew to thirty and the services
// started emitting codes. A driver run against a stale fixture passes while
// telling you nothing about the code you just changed.
//
// Run the backend first, then:  node tools/verify/refresh-cases.mjs
// It builds the same payload FinancePage.jsx builds, so the fixture matches what
// a real submit would have stored: the twelve answers the page sends, and
// nothing it keeps in the tab (the village, market type and customers, the
// names), plus the consent record the page attaches once its box is ticked. The
// consent is sent every time, so the script also works against a backend that
// requires it, and every refresh passes through the consent schema.

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const API = 'http://127.0.0.1:8000/api/analysis/run'

// The notice version the page sends is the one in the app's own module, not a
// copy, so a bumped version reaches the fixtures the next time this runs.
const { NOTICE_VERSION } = await import(pathToFileURL(resolve('frontend/src/config/notice.js')).href)

// The mvp_summary keys the backend returns now. Anything else in a response,
// or a local_context on a market row, is an echo of a field the page no longer
// sends: the running backend is older than the code, and every verifier that
// seeds from these fixtures would read the old shape.
const MVP_SUMMARY_KEYS = new Set(['status', 'simple_message', 'message_code', 'next_step', 'next_step_code', 'priority', 'location_type'])

// Mirrors FORMS in drive.mjs. Kept as the form sections rather than as a request
// body so the mapping below stays the one FinancePage.jsx performs. The village,
// market type and customers stay in the sections because the page holds them,
// but none of them is sent.
//
// The household income question is optional, and the three cases between them
// reach all three answers to it, so a verifier seeding from any one of them sees
// a different household_check:
//   good   within_limit. Gap 200000 - 150000 = 50000, priced at 12% over 60
//          months as a new EMI of 1112. Repayments 3000 + 1112 = 4112 of 20000
//          = 20.56%. 20000 x 12 = 240000 a year, inside the 300000 microfinance
//          range.
//   nulls  not_checked. The question is left blank, which is sent as null.
//   empty  over_limit, see that case.
const CASES = {
  good: {
    profile: { language: 'Tamil' },
    business: { category: 'tailoring', initialInvestment: '200000', monthlyRevenue: '30000', monthlyOperatingExpenses: '18000', existingDebt: 0 },
    location: { village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh', locationType: 'rural', marketType: ['village', 'weekly'], customers: 'Local families' },
    finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000', householdIncome: '20000' },
  },
  nulls: {
    profile: { language: 'Hindi' },
    business: { category: 'tailoring', initialInvestment: '0', monthlyRevenue: '10000', monthlyOperatingExpenses: '12000', existingDebt: 40000 },
    location: { village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh', locationType: 'rural', marketType: ['village'], customers: 'Local families' },
    finance: { availableCapital: '5000', monthlyExpenses: '20000', monthlyEmi: '5000', householdIncome: '' },
  },
  // Used to be agriculture in Delhi, which returned nothing at all. It returns
  // twelve schemes now — the thirty-scheme file covers farming through KCC, the
  // Agriculture Infrastructure Fund and the block-level ATMA and KVK counters —
  // so that input stopped exercising the "nothing matched" state it was written
  // for. A typed-in Other still reaches it, and is the only thing that does.
  //
  // Household income 5000 makes this the over-the-limit case, and it stays
  // inside the microfinance range, where the 50% rule applies: 5000 x 12 =
  // 60000 a year, under 300000. Gap 80000 - 50000 = 30000, a new EMI of 667 at
  // 12% over 60 months. Repayments 2000 + 667 = 2667 of 5000 = 53.34%, over.
  // Without the new loan it is 2000 of 5000 = 40%, within, so it is the loan
  // for the gap that takes the household over, and the next step says so.
  empty: {
    profile: { language: 'Kannada' },
    business: { category: 'other', categoryOther: 'Photography', initialInvestment: '80000', monthlyRevenue: '25000', monthlyOperatingExpenses: '9000', existingDebt: 0 },
    location: { village: '', district: 'New Delhi', state: 'Delhi', locationType: 'rural', marketType: ['town'], customers: '' },
    finance: { availableCapital: '50000', monthlyExpenses: '10000', monthlyEmi: '2000', householdIncome: '5000' },
  },
}

const LANG_CODE = { English: 'en', Hindi: 'hi', Tamil: 'ta', Telugu: 'te', Malayalam: 'ml', Kannada: 'kn', Marathi: 'mr', Bengali: 'bn' }

for (const [name, form] of Object.entries(CASES)) {
  const { profile, business, location, finance } = form
  // Same substitution FinancePage.jsx makes: 'other' is a placeholder for
  // whatever the user typed, and it is the typed text the matcher sees, trimmed
  // the way the page trims it.
  const householdIncome = String(finance.householdIncome ?? '').trim()
  const body = {
    business_category: business.category === 'other' ? String(business.categoryOther || '').trim() : business.category,
    state: location.state,
    district: location.district || '',
    available_capital: Number(finance.availableCapital) || 0,
    monthly_expenses: Number(finance.monthlyExpenses) || 0,
    expected_monthly_revenue: Number(business.monthlyRevenue) || 0,
    monthly_emi: Number(finance.monthlyEmi) || 0,
    // Blank is null, never 0, the same as FinancePage.jsx: 0 would be a
    // household with no income at all.
    household_monthly_income: householdIncome === '' ? null : Number(householdIncome),
    initial_investment: Number(business.initialInvestment) || 0,
    monthly_operating_expenses: Number(business.monthlyOperatingExpenses) || 0,
    existing_debt: Number(business.existingDebt) || 0,
    location_type: location.locationType,
    // What the page attaches after its consent box is ticked. The language is
    // the UI language code; the page reads it from the language switch, and
    // here it is the case's language. No age box is shown unless a deployment
    // turns it on, so there is no answer to record.
    consent: {
      notice_version: NOTICE_VERSION,
      language: LANG_CODE[profile.language],
      given_at: new Date().toISOString(),
      age_confirmed: null,
    },
  }

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.log(`${name}: HTTP ${res.status} — ${await res.text()}`)
    process.exit(1)
  }
  const result = await res.json()
  const echoed = [
    ...Object.keys(result.mvp_summary || {}).filter((key) => !MVP_SUMMARY_KEYS.has(key)).map((key) => `mvp_summary.${key}`),
    ...((result.market_context || []).some((row) => 'local_context' in row) ? ['market_context[].local_context'] : []),
  ]
  if (echoed.length) {
    console.log(`${name}: backend still echoes ${echoed.join(', ')}; restart it on the current code`)
    process.exit(1)
  }
  // screenshots/ is gitignored and holds nothing tracked, so on a FRESH CLONE
  // this directory does not exist and writeFileSync throws ENOENT. That made
  // this the one script a new teammate must run first and the one that could
  // not run at all — and with it, the eight verifiers that read these fixtures
  // (drive, lang-layout, market-ui, mobile-audit, motion-audit, print-audit,
  // scroll-audit, text-align). Every other
  // script that writes here already did this; this one lived in the directory
  // it writes to, so it never needed to until the move to tools/.
  // recursive: true is also what makes it idempotent across the four cases.
  mkdirSync('screenshots/verify', { recursive: true })
  writeFileSync(`screenshots/verify/case_${name}.json`, JSON.stringify(result, null, 2))

  const schemes = result.scheme_matches || []
  const levels = [...new Set(schemes.map((s) => s.level))]
  const scores = [...new Set(schemes.map((s) => s.match_score))]
  const coded = schemes.filter((s) => s.description_code).length
  // What the cards and the scheme-fit chart actually print. A fixture where
  // every scheme has one basis cannot exercise the chart, which needs two.
  const fit = {}
  for (const s of schemes) fit[s.fit_basis ?? 'none'] = (fit[s.fit_basis ?? 'none'] || 0) + 1
  // Which kind of market row each fixture carries. A price row and a count row
  // render different branches of MarketCard, so a fixture holding only one kind
  // leaves the other unexercised by every verifier that seeds from it.
  const market = result.market_context || []
  const metrics = {}
  for (const r of market) metrics[r.metric ?? 'none'] = (metrics[r.metric ?? 'none'] || 0) + 1
  // The household check this fixture carries, so a run shows at a glance that
  // the three cases still reach three different answers. The percentage is null
  // when no income was given.
  const ra = result.risk_analysis || {}
  const householdPercent = ra.household_repayment_percent ?? null
  console.log(
    `${name.padEnd(6)} lang=${LANG_CODE[profile.language]} schemes=${String(schemes.length).padStart(2)}` +
    ` coded=${coded} scores=${JSON.stringify(scores)} market=${market.length} ${JSON.stringify(metrics)}` +
    `\n       levels=${JSON.stringify(levels)}` +
    `\n       fit=${JSON.stringify(fit)}` +
    `\n       household_check=${ra.household_check} household_repayment_percent=${householdPercent === null ? 'null' : householdPercent + '%'}`,
  )
}

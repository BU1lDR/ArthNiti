// Regenerates the driver's captured backend responses from the LIVE backend.
//
// The fixtures are checked-in-shaped snapshots, so they go stale silently: the
// three case_*.json files still held two schemes with no `level` and no
// translation codes long after schemes.json grew to thirty and the services
// started emitting codes. A driver run against a stale fixture passes while
// telling you nothing about the code you just changed.
//
// Run the backend first, then:  node screenshots/verify/refresh-cases.mjs
// It builds the same payload FinancePage.jsx builds, so the fixture matches what
// a real submit would have stored.

import { writeFileSync } from 'node:fs'

const API = 'http://127.0.0.1:8000/api/analysis/run'

// Mirrors FORMS in drive.mjs. Kept as the form sections rather than as a request
// body so the mapping below stays the one FinancePage.jsx performs.
const CASES = {
  good: {
    profile: { language: 'Tamil', literacyLevel: 'low' },
    business: { category: 'tailoring', initialInvestment: '200000', monthlyRevenue: '30000', monthlyOperatingExpenses: '18000', employees: 2, existingDebt: 0 },
    location: { village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh', locationType: 'rural', marketType: ['village', 'weekly'], customers: 'Local families' },
    finance: { availableCapital: '150000', monthlyExpenses: '15000', monthlyEmi: '3000' },
  },
  nulls: {
    profile: { language: 'Hindi', literacyLevel: 'low' },
    business: { category: 'tailoring', initialInvestment: '0', monthlyRevenue: '10000', monthlyOperatingExpenses: '12000', employees: 0, existingDebt: 40000 },
    location: { village: 'Khera', district: 'Lucknow', state: 'Uttar Pradesh', locationType: 'rural', marketType: ['village'], customers: 'Local families' },
    finance: { availableCapital: '5000', monthlyExpenses: '20000', monthlyEmi: '5000' },
  },
  // Used to be agriculture in Delhi, which returned nothing at all. It returns
  // twelve schemes now — the thirty-scheme file covers farming through KCC, the
  // Agriculture Infrastructure Fund and the block-level ATMA and KVK counters —
  // so that input stopped exercising the "nothing matched" state it was written
  // for. A typed-in Other still reaches it, and is the only thing that does.
  empty: {
    profile: { language: 'Kannada', literacyLevel: 'low' },
    business: { category: 'other', categoryOther: 'Photography', initialInvestment: '80000', monthlyRevenue: '25000', monthlyOperatingExpenses: '9000', employees: 1, existingDebt: 0 },
    location: { village: '', district: 'New Delhi', state: 'Delhi', locationType: 'rural', marketType: ['town'], customers: '' },
    finance: { availableCapital: '50000', monthlyExpenses: '10000', monthlyEmi: '2000' },
  },
}

const LANG_CODE = { English: 'en', Hindi: 'hi', Tamil: 'ta', Telugu: 'te', Malayalam: 'ml', Kannada: 'kn', Marathi: 'mr', Bengali: 'bn' }

for (const [name, form] of Object.entries(CASES)) {
  const { profile, business, location, finance } = form
  // Same substitution FinancePage.jsx makes: 'other' is a placeholder for
  // whatever the user typed, and it is the typed text the matcher sees.
  const body = {
    business_category: business.category === 'other' ? business.categoryOther : business.category,
    state: location.state,
    district: location.district || '',
    village: location.village || '',
    market_type: (location.marketType || []).join(', '),
    customers: location.customers || '',
    available_capital: Number(finance.availableCapital) || 0,
    monthly_expenses: Number(finance.monthlyExpenses) || 0,
    expected_monthly_revenue: Number(business.monthlyRevenue) || 0,
    monthly_emi: Number(finance.monthlyEmi) || 0,
    initial_investment: Number(business.initialInvestment) || 0,
    monthly_operating_expenses: Number(business.monthlyOperatingExpenses) || 0,
    employees: Number(business.employees) || 0,
    existing_debt: Number(business.existingDebt) || 0,
    user_language: profile.language,
    preferred_dialect: null,
    literacy_level: profile.literacyLevel,
    location_type: location.locationType,
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
  writeFileSync(`screenshots/verify/case_${name}.json`, JSON.stringify(result, null, 2))

  const schemes = result.scheme_matches || []
  const levels = [...new Set(schemes.map((s) => s.level))]
  const scores = [...new Set(schemes.map((s) => s.match_score))]
  const coded = schemes.filter((s) => s.description_code).length
  console.log(
    `${name.padEnd(6)} lang=${LANG_CODE[profile.language]} schemes=${String(schemes.length).padStart(2)}` +
    ` coded=${coded} scores=${JSON.stringify(scores)} market=${(result.market_context || []).length}` +
    `\n       levels=${JSON.stringify(levels)}`,
  )
}

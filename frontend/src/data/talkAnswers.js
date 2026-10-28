// What the helper's answers become on the form.
//
// /api/intake/extract sends back {field, value, evidence} for each question the
// person answered. A model wrote those values, so each one is checked a second
// time here against what the form can actually hold (its buttons, its list of
// states and districts, the money cap) before the person is shown it. Whatever
// passes is turned into patches for AppContext's fillFromHelper(); whatever does
// not is shown as heard but never written.
//
// No React and no browser calls, so tools/verify/talk-lib-test.mjs runs it in
// plain Node. The imports carry their .js extension for the same reason.

import { SENT_FIELDS } from '../config/notice.js'
import { STATES, districtsForState } from './indiaLocations.js'
import { MAX_RUPEES } from './limits.js'

// The buttons on BusinessPage and LocationPage, value -> the dictionary key of
// its label. The values stay English: they go to the scheme matcher as they are.
// The test reads both pages and fails if these drift from them.
export const CATEGORY_LABELS = {
  retail: 'cat.retail',
  'food processing': 'cat.food',
  handicrafts: 'cat.handicrafts',
  tailoring: 'cat.tailoring',
  agriculture: 'cat.agriculture',
  dairy: 'cat.dairy',
  poultry: 'cat.poultry',
  services: 'cat.services',
  manufacturing: 'cat.manufacturing',
}

export const AREA_LABELS = {
  rural: 'area.rural',
  'semi-urban': 'area.semi',
  urban: 'area.urban',
}

// The interface languages Meta's speech model has no support for, so the person
// types instead of talking. The test reads the backend's own list.
export const NO_SPEECH_LANGUAGES = ['ml']

// Request field -> [section of the application data, field in that section].
// The test fails when this is not exactly the fields of SENT_FIELDS, or names a
// field AppContext does not have.
export const FIELD_TARGETS = {
  business_category: ['business', 'category'],
  initial_investment: ['business', 'initialInvestment'],
  expected_monthly_revenue: ['business', 'monthlyRevenue'],
  monthly_operating_expenses: ['business', 'monthlyOperatingExpenses'],
  existing_debt: ['business', 'existingDebt'],
  state: ['location', 'state'],
  district: ['location', 'district'],
  location_type: ['location', 'locationType'],
  available_capital: ['finance', 'availableCapital'],
  monthly_expenses: ['finance', 'monthlyExpenses'],
  monthly_emi: ['finance', 'monthlyEmi'],
  household_monthly_income: ['finance', 'householdIncome'],
}

// Request field -> the dictionary key of the question's name (errf.*).
export const FIELD_LABEL_KEYS = Object.fromEntries(SENT_FIELDS)

// The same names, by the "section.field" path AppContext's aiFilled list uses,
// so a page can name the questions the helper filled that the reader has not
// looked at yet.
export const LABEL_KEY_BY_PATH = Object.fromEntries(
  Object.entries(FIELD_TARGETS).map(([field, [section, key]]) => [`${section}.${key}`, FIELD_LABEL_KEYS[field]]),
)

// "jammu & kashmir", " Jammu  and Kashmir" and "Jammu and Kashmir" are one name.
const same = (text) =>
  String(text)
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const nameIn = (names, said) => {
  const wanted = same(said)
  return names.find((name) => same(name) === wanted) ?? null
}

// The form's own value for what was said, or null when the form cannot hold it.
function accepted(field, value, state) {
  switch (field) {
    case 'business_category':
      return typeof value === 'string' && Object.hasOwn(CATEGORY_LABELS, value) ? value : null
    case 'location_type':
      return typeof value === 'string' && Object.hasOwn(AREA_LABELS, value) ? value : null
    case 'state':
      return typeof value === 'string' ? nameIn(STATES.map((entry) => entry.name), value) : null
    case 'district':
      return typeof value === 'string' ? nameIn(districtsForState(state), value) : null
    default:
      // Whole rupees from 0 to the cap, held as the text an input holds.
      return Number.isInteger(value) && value >= 0 && value <= MAX_RUPEES ? String(value) : null
  }
}

// One row per field the form asks, in the order it asks, for the review list.
//   ok       the form can hold it; `value` is what it would hold
//   heard    what the helper said it heard, for a row that is not ok
//   evidence the person's own words the helper pointed to
// currentState is the state already on the form: a district heard on its own is
// checked against it. A district heard with a state is checked against that one.
export function matchAnswers(answers, currentState = '') {
  // The first answer for a field wins. A field the form does not ask is never
  // read below, because the loop goes through the fields the form does ask.
  const first = new Map()
  for (const answer of answers ?? []) {
    if (!first.has(answer?.field)) first.set(answer?.field, answer)
  }

  let state = currentState
  const rows = []
  for (const [field] of SENT_FIELDS) {
    const answer = first.get(field)
    if (!answer) continue
    // 0 is a real answer to this question and is confirmed with a tick on
    // /finance, so it is never filled in for the person.
    if (field === 'household_monthly_income' && answer.value === 0) continue
    const value = accepted(field, answer.value, state)
    if (field === 'state' && value !== null) state = value
    rows.push({
      field,
      ok: value !== null,
      value: value ?? undefined,
      heard: String(answer.value ?? ''),
      evidence: String(answer.evidence ?? ''),
    })
  }
  return rows
}

// The rows the person kept -> { business: {...}, location: {...}, finance: {...} },
// leaving out a section nothing was kept for. `location` is the form's current
// {state, district}.
//
// The state and the district are the one pair that can contradict each other, and
// the reader may keep either row without the other, so they are settled last: a
// district is only written when it belongs to the state the form will hold, and a
// new state clears the old district, as the dropdown does (handleStateChange).
export function patchesFor(rows, location = {}) {
  const patches = {}
  const put = (section, key, value) => {
    ;(patches[section] ??= {})[key] = value
  }

  const kept = (field) => rows.find((row) => row.ok && row.field === field)?.value
  for (const row of rows) {
    if (row.ok && row.field !== 'state' && row.field !== 'district') put(...FIELD_TARGETS[row.field], row.value)
  }

  const state = kept('state')
  const district = kept('district')
  if (state !== undefined) put('location', 'state', state)
  if (district !== undefined && districtsForState(state ?? location.state).includes(district)) {
    put('location', 'district', district)
  } else if (state !== undefined && state !== location.state) {
    put('location', 'district', '')
  }
  return patches
}

// What applying `patches` to the form's answers would change, and which of those
// answers the helper put there for the reader to check.
//   changed  the patches with the values the form already holds taken out
//   filled   "section.field" of each changed answer that is not now blank
// Values are compared as text, because an input holds text: the form's default
// debt of 0 and the helper's '0' are the same answer.
export function planFill(answers, patches) {
  const changed = {}
  const filled = []
  for (const [section, data] of Object.entries(patches)) {
    for (const [key, value] of Object.entries(data)) {
      if (String(answers[section][key]) === String(value)) continue
      ;(changed[section] ??= {})[key] = value
      if (String(value) !== '') filled.push(`${section}.${key}`)
    }
  }
  return { changed, filled }
}

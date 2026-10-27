/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { districtsForState } from '../data/indiaLocations'
import { MAX_RUPEES } from '../data/limits'
import { LABEL_KEY_BY_PATH, planFill } from '../data/talkAnswers'
import { isPlan } from '../data/planShape'

const AppContext = createContext(null)

const STORAGE_KEY = 'sih-application'
// Bump this whenever the shape below changes. A payload is read only when its
// version is in READABLE_VERSIONS; any other version is discarded rather than
// half-restored into fields that moved.
//
// 2 added `resultCleared`. 3 added `finance.householdIncome`. 4 removed
// `profile.literacyLevel` and `business.employees`: no page asked for the first,
// and nothing used the second, yet both were sent with every check. 5 added
// `aiFilled`. 6 added `request` and `plan`. None of the bumps moved or renamed
// anything, so every version is still read: hydrate() fills a missing field in
// from EMPTY (the flag as false, the income as '', the list as empty, the request
// and the plan as none) and drops a field EMPTY no longer has. A later bump that
// renames or moves a field must drop the older versions from this set rather than
// let hydrate() half-restore them.
const STORAGE_VERSION = 6
const READABLE_VERSIONS = new Set([1, 2, 3, 4, 5, 6])

const EMPTY = {
  // State and district belong to the location step, which is the single place
  // they are collected. Keeping copies here meant asking for them twice.
  profile: {
    name: '',
    language: 'Hindi',
    dialect: '',
  },

  business: {
    businessName: '',
    category: '',
    // Only used when category is 'other', where the user types their own.
    categoryOther: '',
    initialInvestment: '',
    monthlyRevenue: '',
    monthlyOperatingExpenses: '',
    existingDebt: 0,
  },

  location: {
    village: '',
    district: '',
    state: '',
    locationType: 'rural',
    // A list: customers can buy in more than one place.
    marketType: [],
    customers: '',
  },

  finance: {
    availableCapital: '',
    monthlyExpenses: '',
    monthlyEmi: '',
    // Optional. '' means the question was not answered, and FinancePage sends
    // that as null rather than 0: a 0 would be a household with no income, and
    // the backend would then call every repayment more than half of it.
    householdIncome: '',
  },

  result: null,

  // True when changing an answer threw away a result that was on screen, so a
  // result page can say that an answer changed and the check has to be run
  // again, instead of looking as though nothing was ever checked. False again
  // once a new result arrives, and after starting over.
  resultCleared: false,

  // The answers the result on screen was made from, as they were sent, and the plan
  // the AI wrote for them (null until one is asked for). A plan fits those answers and
  // no others, so both leave with the result when an answer changes (applyEdit()
  // below), and neither is read back without a result. The plan is words the model
  // wrote and figures the rules put in; its shape is in data/planShape.js.
  request: null,
  plan: null,

  // The answers the helper (/talk) wrote into the form that the reader has not
  // changed since, as "section.field" paths. A page lists them so they get
  // checked, and a path leaves the list the moment the reader edits that answer
  // (applyEdit() below). Never sent anywhere, and not part of isStarted(): it only
  // ever names answers that already differ from the defaults.
  aiFilled: [],
}

// Has the reader entered anything worth clearing?
//
// Derived from EMPTY rather than from a hand-listed set of fields, and it lives
// here rather than in the button because this is the file that knows the shape.
// StartOverButton used to test 6 of the 16 answers, so someone who had typed
// their expected monthly revenue and nothing else — a perfectly ordinary way to
// start — had their figures sitting in sessionStorage with no control anywhere in
// the app to clear them short of closing the tab. Someone else may use the same
// device next, and that is the whole reason the storage is per-session.
//
// Note the defaults that are not blank: locationType 'rural', language 'Hindi',
// existingDebt 0. That is why this is a difference from EMPTY and not a
// truthiness test — several of these fields are set before anyone types.
export function isStarted(data) {
  if (!data) return false
  if (data.result) return true

  return ['profile', 'business', 'location', 'finance'].some((section) =>
    Object.keys(EMPTY[section]).some((field) => {
      const value = data[section]?.[field]
      const blank = EMPTY[section][field]
      // marketType is the one list, and [] !== [] for every pair of arrays.
      if (Array.isArray(blank)) return Array.isArray(value) && value.length > 0
      return value !== undefined && value !== blank
    }),
  )
}

// Which sections the analysis is actually computed from, and therefore which
// ones invalidate a result already on screen.
//
// A stale result is worse than no result. Nothing guards the journey order — the
// nav bar links straight to any page — so someone who has seen /analysis can go
// back to /business, change Tailoring to Retail, then click "Schemes" and read
// the tailoring schemes as though they had matched retail. Every figure and every
// card is internally consistent, which is exactly why nothing on the page gives
// it away.
//
// `profile` is deliberately absent. The name, language and dialect are never
// sent, so changing one cannot make a number wrong — and clearing on them would
// mean that switching language on /profile silently threw the results away,
// when switching language is something a reader must be able to do at any
// point.
const ANSWER_SECTIONS = new Set(['business', 'location', 'finance'])

// The answers inside those sections that never leave this tab. The report
// prints them, but the request does not carry them, so editing one cannot make
// a result wrong. Clearing on them would throw away a valid result and then
// tell the reader that an answer changed the check, which is untrue.
const LOCAL_ONLY = {
  business: new Set(['businessName']),
  location: new Set(['village', 'marketType', 'customers']),
}

function changesResult(section, keys) {
  if (!ANSWER_SECTIONS.has(section)) return false
  const local = LOCAL_ONLY[section]
  return keys.some((key) => !local || !local.has(key))
}

// EMPTY's own fields, each taken from the stored section when it has one.
// Only EMPTY's keys come through, so a field a later version removed (a stored
// literacyLevel or employees) is dropped here rather than carried along in
// storage for the rest of the session.
function pick(base, stored) {
  const source = stored && typeof stored === 'object' ? stored : {}
  return Object.fromEntries(
    Object.keys(base).map((key) => [key, Object.hasOwn(source, key) ? source[key] : base[key]]),
  )
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Merge over the defaults section by section rather than trusting the stored
// object wholesale. A field added after a payload was written would otherwise
// arrive as `undefined`, and React silently turns a controlled input with an
// undefined value into an uncontrolled one — the field stops updating and
// nothing in the console says why.
function hydrate(data) {
  if (!data || typeof data !== 'object') return EMPTY

  // The request and the plan mean something only beside the result they belong to,
  // and a plan only beside the request it was written for. One of the wrong shape is
  // dropped here and costs the reader nothing else.
  const request = data.result && isPlainObject(data.request) ? data.request : null
  const plan = request && isPlan(data.plan) ? data.plan : null

  return {
    profile: pick(EMPTY.profile, data.profile),
    business: pick(EMPTY.business, data.business),
    location: {
      ...pick(EMPTY.location, data.location),
      // marketType is a list. A scalar left over from an older payload must
      // never reach .includes() or .join() as a bare string.
      marketType: Array.isArray(data.location?.marketType) ? data.location.marketType : [],
    },
    finance: pick(EMPTY.finance, data.finance),
    // Passed through as stored. A result saved by an older version may still
    // carry fields the backend no longer sends, such as local_context on the
    // market rows; nothing reads them any more, so they are left alone.
    result: data.result ?? null,
    // Only a real `true` counts, and never beside a result: the flag says a
    // result was thrown away, which cannot be so while one is present.
    resultCleared: data.resultCleared === true && !data.result,
    request,
    plan,
    // Only paths of answers the helper can fill: anything else in a stored list
    // would reach the banner as a question with no name. A one-item array would
    // pass hasOwn as its own text, so the type is checked first.
    aiFilled: Array.isArray(data.aiFilled)
      ? data.aiFilled.filter((path) => typeof path === 'string' && Object.hasOwn(LABEL_KEY_BY_PATH, path))
      : [],
  }
}

// sessionStorage rather than localStorage, deliberately. Someone's revenue, debt
// and EMI should not stay on the device after they walk away, because someone
// else may use the same device next, and a closed tab being a clean slate is
// what protects them. Within one tab it survives the refresh, which is the whole
// point: before this,
// reloading any result page dropped it straight to its empty state and the only
// way back was to re-enter all four forms.
function readStored() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY

    const parsed = JSON.parse(raw)
    if (!parsed || !READABLE_VERSIONS.has(parsed.v)) return EMPTY

    return hydrate(parsed.data)
  } catch {
    // Blocked storage, private mode, or a truncated write. Start clean instead
    // of taking the whole app down on a corrupt string.
    return EMPTY
  }
}

// The answers after `data` is written into `section`. Every change to an answer
// goes through here, so the two rules below hold for all of them.
export function applyEdit(current, section, data) {
  // Nothing actually moved. Returning the same object skips the re-render
  // and the sessionStorage write, and — the reason this check is here rather
  // than being an optimisation — it stops an idempotent call from discarding
  // a result that is still perfectly valid.
  const changedKeys = Object.keys(data).filter((key) => current[section][key] !== data[key])
  if (changedKeys.length === 0) return current

  const clears = changesResult(section, changedKeys)
  const edited = new Set(changedKeys.map((key) => `${section}.${key}`))

  return {
    ...current,
    [section]: {
      ...current[section],
      ...data,
    },
    result: clears ? null : current.result,
    // The request and the plan belong to the result, and go with it.
    request: clears ? null : current.request,
    plan: clears ? null : current.plan,
    // Set only when this change is the one that threw a result away. Once
    // set it stays set through later edits, which have no result left to
    // clear, until a new result arrives or the reader starts over.
    resultCleared: clears && current.result ? true : current.resultCleared,
    // An answer the reader has changed is theirs now, not the helper's.
    aiFilled: current.aiFilled.filter((path) => !edited.has(path)),
  }
}

// The answers after the helper's patches (patchesFor, in data/talkAnswers.js)
// are written, with each answer it put there added to aiFilled. Pure, so /talk
// can ask where the reader goes next before it commits anything.
export function applyHelperFill(current, patches) {
  const { changed, filled } = planFill(current, patches)
  if (Object.keys(changed).length === 0) return current

  let next = current
  for (const [section, data] of Object.entries(changed)) next = applyEdit(next, section, data)
  // applyEdit took every path it changed off the list, so none is listed twice.
  return { ...next, aiFilled: [...next.aiFilled, ...filled] }
}

// The answers after a check has come back: the result, the answers it was made from
// (the request, as sent) and no plan, because a plan written for an earlier result is
// not one for this.
export function applyResult(current, result, request) {
  return { ...current, result, request: request ?? null, plan: null, resultCleared: false }
}

// The answers after a plan has come back. It is kept only for the result it was
// written for, whose request is held since the check. One that arrives after an
// answer changed (the result and the request are gone), or after a new check (a
// different request), or that is not a plan at all, is dropped.
export function applyPlan(current, plan, request) {
  if (!request || current.request !== request || !isPlan(plan)) return current

  return { ...current, plan }
}

export function AppProvider({ children }) {
  const [applicationData, setApplicationData] = useState(readStored)

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: STORAGE_VERSION, data: applicationData }),
      )
    } catch {
      // Quota or a blocked API. The in-memory state is still correct, so the
      // session keeps working — it just will not survive a refresh.
    }
  }, [applicationData])

  const updateSection = (section, data) => {
    setApplicationData((current) => applyEdit(current, section, data))
  }

  const fillFromHelper = (patches) => {
    setApplicationData((current) => applyHelperFill(current, patches))
  }

  // `request` is what the check was made from: a plan is written for those answers.
  const setResult = (result, request) => {
    setApplicationData((current) => applyResult(current, result, request))
  }

  const setPlan = (plan, request) => {
    setApplicationData((current) => applyPlan(current, plan, request))
  }

  // Starting over should not mean closing the tab by hand, and the next person
  // on the same device should not find the last person's answers.
  const resetApplication = () => {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to clean up if storage was never available.
    }
    setApplicationData(EMPTY)
  }

  return (
    <AppContext.Provider
      value={{
        applicationData,
        resultCleared: applicationData.resultCleared === true,
        updateSection,
        fillFromHelper,
        setResult,
        setPlan,
        resetApplication,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

// A number field hands the page '' for anything it cannot read, so blank covers
// the unreadable case as well as the unanswered one.
function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === ''
}

// Whether an answer would pass the browser's own check on a number field here:
// min 0, the field's max, and the default step of 1, which refuses decimals.
function isWholeAmount(value, max) {
  if (isBlank(value)) return false
  const amount = Number(value)
  return Number.isInteger(amount) && amount >= 0 && amount <= max
}

// Blank is fine for a question the page does not require; an answer that is
// there must still be one the page would accept.
function isOptionalAmount(value, max) {
  return isBlank(value) || isWholeAmount(value, max)
}

// The first step of the journey whose required answers are missing, as its
// route: '/profile', '/business', '/location' or '/finance'. null when every
// step could be submitted.
//
// Each test mirrors what that page itself refuses to continue without, so a
// reader sent to the step this names lands on something the page will point
// out. That includes a typed "Other" kind of work: the backend refuses a
// business_category under 2 characters once spaces are trimmed, and
// BusinessPage now trims before it checks, so the two agree. A state is always
// picked from the list, so every real one passes.
export function firstUnansweredStep(data) {
  const profile = data?.profile || {}
  const business = data?.business || {}
  const location = data?.location || {}
  const finance = data?.finance || {}

  // The name field is a plain required text box, which accepts spaces.
  if (profile.name === null || profile.name === undefined || String(profile.name) === '') {
    return '/profile'
  }

  const category = String(business.category || '')
  const categorySent = category === 'other' ? String(business.categoryOther || '').trim() : category

  if (
    business.businessName === null ||
    business.businessName === undefined ||
    String(business.businessName) === '' ||
    category === '' ||
    categorySent.length < 2 ||
    !isWholeAmount(business.initialInvestment, MAX_RUPEES) ||
    !isWholeAmount(business.monthlyRevenue, MAX_RUPEES) ||
    !isWholeAmount(business.monthlyOperatingExpenses, MAX_RUPEES) ||
    !isOptionalAmount(business.existingDebt, MAX_RUPEES)
  ) {
    return '/business'
  }

  const state = String(location.state || '')

  if (state.trim().length < 2 || !districtsForState(state).includes(location.district)) {
    return '/location'
  }

  if (
    !isWholeAmount(finance.availableCapital, MAX_RUPEES) ||
    !isWholeAmount(finance.monthlyExpenses, MAX_RUPEES) ||
    !isOptionalAmount(finance.monthlyEmi, MAX_RUPEES) ||
    !isOptionalAmount(finance.householdIncome, MAX_RUPEES)
  ) {
    return '/finance'
  }

  return null
}

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useApp must be used inside AppProvider')
  }

  return context
}

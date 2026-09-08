/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

const AppContext = createContext(null)

const STORAGE_KEY = 'sih-application'
// Bump this whenever the shape below changes, so a payload written by an older
// build is discarded rather than half-restored into fields that moved.
const STORAGE_VERSION = 1

const EMPTY = {
  // State and district belong to the location step, which is the single place
  // they are collected. Keeping copies here meant asking for them twice.
  profile: {
    name: '',
    language: 'Hindi',
    dialect: '',
    literacyLevel: 'low',
  },

  business: {
    businessName: '',
    category: '',
    // Only used when category is 'other', where the user types their own.
    categoryOther: '',
    initialInvestment: '',
    monthlyRevenue: '',
    monthlyOperatingExpenses: '',
    employees: 0,
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
  },

  result: null,
}

// Has the reader entered anything worth clearing?
//
// Derived from EMPTY rather than from a hand-listed set of fields, and it lives
// here rather than in the button because this is the file that knows the shape.
// StartOverButton used to test 6 of the 16 answers, so someone who had typed
// their expected monthly revenue and nothing else — a perfectly ordinary way to
// start — had their figures sitting in sessionStorage with no control anywhere in
// the app to clear them short of closing the tab. On a shared demo laptop that is
// the whole reason the storage is per-session in the first place.
//
// Note the defaults that are not blank: locationType 'rural', language 'Hindi',
// literacyLevel 'low', employees 0. That is why this is a difference from EMPTY
// and not a truthiness test — half these fields are truthy before anyone types.
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
// `profile` is deliberately absent. Name, language, dialect and literacy level
// are echoed back by the backend rather than computed from, so changing one
// cannot make a number wrong — and clearing on them would mean that switching
// language on /profile silently threw the results away, which is the single
// thing this demo does on purpose.
const ANSWER_SECTIONS = new Set(['business', 'location', 'finance'])

// Merge over the defaults section by section rather than trusting the stored
// object wholesale. A field added after a payload was written would otherwise
// arrive as `undefined`, and React silently turns a controlled input with an
// undefined value into an uncontrolled one — the field stops updating and
// nothing in the console says why.
function hydrate(data) {
  if (!data || typeof data !== 'object') return EMPTY

  return {
    profile: { ...EMPTY.profile, ...(data.profile || {}) },
    business: { ...EMPTY.business, ...(data.business || {}) },
    location: {
      ...EMPTY.location,
      ...(data.location || {}),
      // marketType is a list. A scalar left over from an older payload must
      // never reach .includes() or .join() as a bare string.
      marketType: Array.isArray(data.location?.marketType) ? data.location.marketType : [],
    },
    finance: { ...EMPTY.finance, ...(data.finance || {}) },
    result: data.result ?? null,
  }
}

// sessionStorage rather than localStorage, deliberately. Someone's revenue, debt
// and EMI should not sit on a shared demo laptop after they walk away, and a
// closed tab being a clean slate is exactly what we want between two judges.
// Within one tab it survives the refresh, which is the whole point: before this,
// reloading any result page dropped it straight to its empty state and the only
// way back was to re-enter all four forms.
function readStored() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY

    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== STORAGE_VERSION) return EMPTY

    return hydrate(parsed.data)
  } catch {
    // Blocked storage, private mode, or a truncated write. Start clean instead
    // of taking the whole app down on a corrupt string.
    return EMPTY
  }
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
    setApplicationData((current) => {
      // Nothing actually moved. Returning the same object skips the re-render
      // and the sessionStorage write, and — the reason this check is here rather
      // than being an optimisation — it stops an idempotent call from discarding
      // a result that is still perfectly valid.
      const changed = Object.keys(data).some((key) => current[section][key] !== data[key])
      if (!changed) return current

      return {
        ...current,
        [section]: {
          ...current[section],
          ...data,
        },
        result: ANSWER_SECTIONS.has(section) ? null : current.result,
      }
    })
  }

  const setResult = (result) => {
    setApplicationData((current) => ({
      ...current,
      result,
    }))
  }

  // Starting over between two demos should not mean clearing the tab by hand.
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
        updateSection,
        setResult,
        resetApplication,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)

  if (!context) {
    throw new Error('useApp must be used inside AppProvider')
  }

  return context
}

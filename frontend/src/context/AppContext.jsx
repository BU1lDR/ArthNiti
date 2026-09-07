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
    setApplicationData((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...data,
      },
    }))
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

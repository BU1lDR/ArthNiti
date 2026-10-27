// Where the answers are sent. A production build must be given an https://
// address: vite.config.js refuses to build in production mode without one, so
// a deployed copy never falls back to sending financial answers in plain HTTP
// to whatever is listening on the reader's own machine. The loopback default
// is for `npm run dev` and `npm run build:local` only. MODE, not PROD: PROD is
// true for every build, the loopback preview included.
const CONFIGURED_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').trim()
const API_BASE_URL =
  CONFIGURED_BASE_URL || (import.meta.env.MODE === 'production' ? '' : 'http://127.0.0.1:8000')

const REQUEST_TIMEOUT_MS = 20000

// Every error this module throws carries a `code` alongside its English
// `message`, because the banner that shows it is the one piece of user-facing
// text in the app that used to be English in all eight languages — and it is
// the text a reader is most likely to meet, since "the backend is not running"
// is the commonest failure on a demo laptop. The page translates `code` through
// `t()` and falls back to `message`, so an untranslated build still reads.
//
// Codes live in strings.js as `err.*`; the field names they interpolate are
// `errf.*`. Whole sentences, never assembled from parts — see the note in
// CLAUDE.md about Latin word order leaking into Devanagari.
const ERROR_CODES = {
  timeout: 'err.timeout',
  offline: 'err.offline',
  badResponse: 'err.badResponse',
  validation: 'err.checkFields',
  generic: 'err.generic',
}

// Plain-language names for the fields the backend can reject, so a validation
// error reads as something the user can act on instead of Pydantic's wording.
// `key` is what the page renders; `en` is the fallback baked into the thrown
// message so a bare `error.message` is still a readable English sentence.
//
// Each phrase deliberately echoes the wording of the question that collects the
// field, because the reader's next action is to walk back through the steps and
// find it. "the money you already have" is findable on /finance; "available
// capital" is not on the page at all.
//
// One entry for every field FinancePage sends, since any of them can be the
// one a 422 names, and one for the consent record, which the reader answers
// with the box above the button.
const FIELD_LABELS = {
  business_category: { key: 'errf.category', en: 'the kind of work you do' },
  state: { key: 'errf.state', en: 'your state' },
  district: { key: 'errf.district', en: 'your district' },
  location_type: { key: 'errf.areaType', en: 'whether your business is in a village or city' },
  available_capital: { key: 'errf.capital', en: 'the money you already have' },
  monthly_expenses: { key: 'errf.expenses', en: 'how much you spend each month' },
  expected_monthly_revenue: {
    key: 'errf.revenue',
    en: 'the money you expect to earn each month',
  },
  monthly_emi: { key: 'errf.emi', en: 'your monthly EMI or loan payment' },
  household_monthly_income: {
    key: 'errf.householdIncome',
    en: 'how much your household earns in a month',
  },
  initial_investment: { key: 'errf.investment', en: 'how much money you require' },
  monthly_operating_expenses: {
    key: 'errf.opExpenses',
    en: 'how much the business itself will cost each month',
  },
  // Optional on /business, but it has an upper bound the backend enforces, so
  // it can be the field a 422 names.
  existing_debt: { key: 'errf.debt', en: 'your existing business debt' },
  consent: { key: 'errf.consent', en: 'your agreement to how your answers are used' },
}

// One place that builds the thrown Error, so no call site can forget the code.
function analysisError(code, message, fields, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = code
  if (fields && fields.length) error.fields = fields
  return error
}

function timeoutError(cause) {
  return analysisError(
    ERROR_CODES.timeout,
    'The analysis service is taking too long to answer. Please try again.',
    null,
    cause,
  )
}

// The error thrown when the CALLER cancelled the request: the reader left the
// page, or started again. It is not a failure, so it carries no code and the
// page must not show it. Tell it apart with isAbortError(), never by message.
function abortedError(cause) {
  const error = new Error('The request was cancelled.', cause ? { cause } : undefined)
  error.name = 'AbortError'
  error.code = null
  error.aborted = true
  return error
}

export function isAbortError(error) {
  return Boolean(error && error.aborted === true)
}

// `signal` is the caller's own, for cancelling the request when the page that
// asked for it goes away. It is combined with the 20-second timeout rather than
// replacing it, so a caller that passes a signal still gets the timeout.
//
// The two are told apart by WHICH signal fired, not by the error's name. fetch
// rejects with the signal's reason, and a caller abort's reason is whatever the
// caller passed to abort(): a string has no name at all and would be reported as
// "cannot connect". Asking the caller's own signal cannot mistake one for the
// other.
export async function runAnalysis(payload, { signal } = {}) {
  let response

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  if (signal && signal.aborted) throw abortedError(signal.reason)

  try {
    response = await fetch(`${API_BASE_URL}/api/analysis/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: combined,
    })
  } catch (error) {
    if (signal && signal.aborted) throw abortedError(error)

    if (timeout.aborted || (error && (error.name === 'TimeoutError' || error.name === 'AbortError'))) {
      throw timeoutError(error)
    }

    throw analysisError(
      ERROR_CODES.offline,
      'Unable to connect to the analysis service. Please make sure the backend is running and try again.',
      null,
      error,
    )
  }

  let parsed = false
  let data = {}

  try {
    data = await response.json()
    parsed = true
  } catch (error) {
    // The body is read under the same signal, so leaving the page while it
    // downloads lands here, and that is a cancellation, not a bad response.
    if (signal && signal.aborted) throw abortedError(error)
    // So does the timeout: a body that stalls past 20 seconds is a slow
    // service, and "unexpected response" would send the reader looking for the
    // wrong problem.
    if (timeout.aborted) throw timeoutError(error)
    // Otherwise fall through: a 2xx with an unreadable body is as broken as a
    // 500, and returning {} would drop the reader onto empty result pages with
    // nothing said about why.
  }

  if (!parsed) {
    throw analysisError(
      ERROR_CODES.badResponse,
      'The analysis service returned an unexpected response. Please try again.',
    )
  }

  if (!response.ok) {
    throw readError(data)
  }

  return data
}

// FastAPI reports validation errors as a list of objects. Handing that list to
// Error() renders as "[object Object]", so name the fields instead.
function readError(data) {
  const detail = data && data.detail

  if (typeof detail === 'string' && detail.trim()) {
    // A hand-written detail from the backend is already a sentence; there is no
    // code for it, so the page prints it as sent.
    return analysisError(null, detail)
  }

  if (Array.isArray(detail)) {
    const fields = []

    for (const item of detail) {
      const path = Array.isArray(item && item.loc) ? item.loc : []
      // A problem anywhere inside the consent record, ["body","consent"] or
      // ["body","consent","given_at"], is named as the consent itself: its
      // parts are not questions the reader was asked, and "given at" is not
      // something they can go back and fix.
      const field = path[1] === 'consent' ? 'consent' : path[path.length - 1]

      if (field === undefined || field === null) continue

      const label = FIELD_LABELS[field] || {
        key: null,
        en: String(field).replaceAll('_', ' '),
      }

      if (!fields.some((existing) => existing.en === label.en)) fields.push(label)
    }

    if (fields.length) {
      return analysisError(
        ERROR_CODES.validation,
        `Please check ${fields.map((field) => field.en).join(', ')}. Go back and fill in what is missing, then try again.`,
        fields,
      )
    }
  }

  return analysisError(
    ERROR_CODES.generic,
    'The analysis service could not process your request. Please try again.',
  )
}

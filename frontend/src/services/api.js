const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

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
const FIELD_LABELS = {
  business_category: { key: 'errf.category', en: 'the kind of work you do' },
  state: { key: 'errf.state', en: 'your state' },
  available_capital: { key: 'errf.capital', en: 'the money you already have' },
  monthly_expenses: { key: 'errf.expenses', en: 'how much you spend each month' },
  expected_monthly_revenue: {
    key: 'errf.revenue',
    en: 'the money you expect to earn each month',
  },
  monthly_emi: { key: 'errf.emi', en: 'your monthly EMI or loan payment' },
  initial_investment: { key: 'errf.investment', en: 'how much money you require' },
  monthly_operating_expenses: {
    key: 'errf.opExpenses',
    en: 'how much the business itself will cost each month',
  },
}

// One place that builds the thrown Error, so no call site can forget the code.
function analysisError(code, message, fields, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = code
  if (fields && fields.length) error.fields = fields
  return error
}

export async function runAnalysis(payload) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/analysis/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw analysisError(
        ERROR_CODES.timeout,
        'The analysis service is taking too long to answer. Please try again.',
        null,
        error,
      )
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
  } catch {
    // Fall through: a 2xx with an unreadable body is as broken as a 500, and
    // returning {} would drop the reader onto empty result pages with nothing
    // said about why.
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
      const field = path[path.length - 1]

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

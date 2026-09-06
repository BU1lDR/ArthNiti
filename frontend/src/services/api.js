const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

const REQUEST_TIMEOUT_MS = 20000

// Plain-language names for the fields the backend can reject, so a validation
// error reads as something the user can act on instead of Pydantic's wording.
const FIELD_LABELS = {
  business_category: 'the kind of business',
  state: 'your state',
  available_capital: 'the money you already have',
  monthly_expenses: 'how much you spend each month',
  expected_monthly_revenue: 'your expected monthly income',
  monthly_emi: 'your monthly EMI',
  initial_investment: 'the money you will invest',
  monthly_operating_expenses: 'your monthly business expenses',
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
      throw new Error(
        'The analysis service is taking too long to answer. Please try again.',
        { cause: error },
      )
    }

    throw new Error(
      'Unable to connect to the analysis service. Please make sure the backend is running and try again.',
      { cause: error },
    )
  }

  let data = {}

  try {
    data = await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(
        'The analysis service returned an unexpected response. Please try again.',
      )
    }
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(data))
  }

  return data
}

// FastAPI reports validation errors as a list of objects. Handing that list to
// Error() renders as "[object Object]", so name the fields instead.
function readErrorMessage(data) {
  const detail = data && data.detail

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (Array.isArray(detail)) {
    const fields = detail
      .map((item) => {
        const path = Array.isArray(item && item.loc) ? item.loc : []
        const field = path[path.length - 1]

        if (field === undefined || field === null) return null

        return FIELD_LABELS[field] || String(field).replaceAll('_', ' ')
      })
      .filter(Boolean)

    const unique = [...new Set(fields)]

    if (unique.length) {
      return `Please check ${unique.join(', ')}. Go back, fill in the missing details, then try again.`
    }
  }

  return 'The analysis service could not process your request. Please try again.'
}

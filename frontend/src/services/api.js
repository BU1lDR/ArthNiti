const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

export async function runAnalysis(payload) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/analysis/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error(
      'Unable to connect to the analysis service. Please make sure the backend is running and try again.',
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
    throw new Error(
      data.detail || 'The analysis service could not process your request. Please try again.',
    )
  }

  return data
}

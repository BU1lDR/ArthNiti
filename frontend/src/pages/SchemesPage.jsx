import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function SchemesPage() {
  const { applicationData } = useApp()
  const result = applicationData.result

  const schemes = Array.isArray(result?.scheme_matches)
    ? result.scheme_matches
    : []

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">

        <Link
          to="/analysis"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Analysis
        </Link>

        {/* Header */}
        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">
            Step 6 of 6
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
            Government Schemes
          </h1>

          <p className="mt-3 max-w-3xl text-slate-600">
            Explore government support schemes that may be relevant to your
            business and location.
          </p>
        </div>

        {/* No analysis */}
        {!result && (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Complete your analysis first
            </h2>

            <p className="mt-3 text-slate-600">
              Your scheme recommendations will appear after your business
              analysis is completed.
            </p>

            <Link to="/profile" className="mt-6 inline-block">
              <Button className="px-6 py-3">
                Start Business Journey
              </Button>
            </Link>
          </div>
        )}

        {/* Scheme results */}
        {result && (
          <>
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    Matching schemes
                  </p>

                  <h2 className="mt-1 text-2xl font-bold text-slate-900">
                    {schemes.length > 0
                      ? `${schemes.length} scheme${
                          schemes.length === 1 ? '' : 's'
                        } found`
                      : 'No matching schemes found'}
                  </h2>
                </div>

                <div className="rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
                  {applicationData.business.category || 'Business'}
                </div>
              </div>
            </div>

            {schemes.length > 0 ? (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {schemes.map((scheme, index) => (
                  <SchemeCard
                    key={index}
                    scheme={scheme}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl bg-white p-8 shadow-sm">
                <div className="text-center">
                  <div className="text-4xl">🏦</div>

                  <h2 className="mt-4 text-xl font-bold text-slate-900">
                    No schemes matched this profile
                  </h2>

                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                    We could not find a matching scheme for the current
                    business category and state combination. This does not
                    necessarily mean you are ineligible for government
                    support.
                  </p>

                  <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-slate-500">
                    You can review your business and location details and run
                    the analysis again.
                  </p>

                  <Link to="/business" className="mt-6 inline-block">
                    <Button className="px-6 py-3">
                      Review Business Details
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Bottom navigation */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Link to="/analysis">
                <Button
                  className="w-full border border-slate-300 bg-white py-4 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  ← Back to Analysis
                </Button>
              </Link>

              <Link to="/">
                <Button className="w-full py-4">
                  Finish →
                </Button>
              </Link>
            </div>
          </>
        )}

      </div>
    </main>
  )
}

function SchemeCard({ scheme, index }) {
  if (typeof scheme === 'string') {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">
            {index + 1}
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {scheme}
            </h2>
          </div>
        </div>
      </div>
    )
  }

  const name =
    scheme.name ||
    scheme.scheme_name ||
    scheme.title ||
    'Government Scheme'

  const reason =
    scheme.reason ||
    scheme.description ||
    scheme.why_match ||
    'This scheme was identified as potentially relevant to your business.'

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 font-bold text-green-700">
          {index + 1}
        </div>

        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">
            {name}
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            {reason}
          </p>

          {scheme.eligibility && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Eligibility
              </p>

              <p className="mt-1 text-sm text-slate-700">
                {scheme.eligibility}
              </p>
            </div>
          )}

          {scheme.benefit && (
            <div className="mt-4 rounded-xl bg-green-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                Potential benefit
              </p>

              <p className="mt-1 text-sm text-green-800">
                {scheme.benefit}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SchemesPage
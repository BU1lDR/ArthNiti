import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useApp } from '../context/AppContext'

export default function SchemesPage() {
  const { applicationData } = useApp()

  const result = applicationData?.result
  const schemes = result?.scheme_matches || []

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/analysis"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Analysis
        </Link>

        <header className="mt-6">
          <p className="text-sm font-semibold text-green-600">
            Funding & Government Support
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Government Schemes & Support
          </h1>

          <p className="mt-3 max-w-3xl leading-7 text-slate-600">
            Based on your business profile and financial analysis, the
            following government schemes may be relevant to your business.
          </p>
        </header>

        {!result && (
          <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              No Analysis Available
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              Please complete the business and financial assessment first
              to see schemes relevant to your business.
            </p>

            <Link to="/finance">
              <Button className="mt-6">
                Go to Financial Analysis
              </Button>
            </Link>
          </section>
        )}

        {result && schemes.length === 0 && (
          <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              No Matching Schemes Found
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              We could not find any matching schemes for the information
              provided.
            </p>

            <p className="mt-3 leading-7 text-slate-600">
              You may still be eligible for other government programs.
              Please verify eligibility through official government sources.
            </p>
          </section>
        )}

        {schemes.length > 0 && (
          <div className="mt-8 space-y-6">
            {schemes.map((scheme, index) => (
              <section
                key={scheme.name || `scheme-${index}`}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {scheme.name}
                    </h2>

                    {scheme.description && (
                      <p className="mt-3 leading-7 text-slate-600">
                        {scheme.description}
                      </p>
                    )}
                  </div>

                  {scheme.match_score !== undefined && (
                    <div className="shrink-0 rounded-xl bg-green-100 px-4 py-3 text-center">
                      <p className="text-2xl font-bold text-green-700">
                        {scheme.match_score}%
                      </p>

                      <p className="text-sm font-medium text-green-700">
                        Match
                      </p>
                    </div>
                  )}
                </div>

                {scheme.support_type && (
                  <SchemeSection title="Type of Support">
                    <p className="leading-7 text-slate-600">
                      {scheme.support_type}
                    </p>
                  </SchemeSection>
                )}

                {Array.isArray(scheme.match_reasons) &&
                  scheme.match_reasons.length > 0 && (
                    <SchemeSection title="Why This Scheme Matches">
                      <BulletList items={scheme.match_reasons} />
                    </SchemeSection>
                  )}

                {Array.isArray(scheme.eligibility_rules) &&
                  scheme.eligibility_rules.length > 0 && (
                    <SchemeSection title="Eligibility Information">
                      <BulletList items={scheme.eligibility_rules} />
                    </SchemeSection>
                  )}

                {Array.isArray(scheme.documents) &&
                  scheme.documents.length > 0 && (
                    <SchemeSection title="Required Documents">
                      <BulletList items={scheme.documents} />
                    </SchemeSection>
                  )}

                <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  {scheme.official_url && (
                    <a
                      href={scheme.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-green-700 hover:text-green-800"
                    >
                      View Official Scheme →
                    </a>
                  )}

                  {scheme.last_verified && (
                    <p className="text-sm text-slate-500">
                      Last verified: {scheme.last_verified}
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-bold text-amber-900">
            Important
          </h2>

          <p className="mt-3 leading-7 text-amber-900">
            Scheme matching is indicative and is based on the information
            provided during this assessment. A match score does not represent
            final government eligibility or approval.
          </p>

          <p className="mt-3 leading-7 text-amber-900">
            Final eligibility, benefits, documentation requirements, and
            approval are determined by the respective government scheme
            guidelines and approving authority. Please verify the latest
            information through the official scheme website before applying.
          </p>
        </section>

        {result && (
          <div className="mt-8">
            <Link to="/advisory">
              <Button className="w-full py-4">
                Continue to Personalized Advisory →
              </Button>
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

function SchemeSection({ title, children }) {
  return (
    <div className="mt-6">
      <h3 className="font-bold text-slate-900">
        {title}
      </h3>

      <div className="mt-3">
        {children}
      </div>
    </div>
  )
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex gap-3 leading-7 text-slate-600"
        >
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-green-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
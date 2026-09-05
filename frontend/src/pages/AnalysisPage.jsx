import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function AnalysisPage() {
  const { applicationData } = useApp()
  const result = applicationData.result

  if (!result) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              No analysis available yet
            </h1>

            <p className="mt-3 text-slate-600">
              Complete your business and financial details first to generate
              your personalized analysis.
            </p>

            <Link to="/profile" className="mt-6 inline-block">
              <Button className="px-6 py-3">
                Start Business Journey
              </Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const financial = result.financial_analysis || {}
  const risk = result.risk_analysis || {}
  const business = result.business_analysis || {}
  const advisory = result.advisory || {}
  const summary = result.mvp_summary || {}

  const recommendations = Array.isArray(advisory.recommendations)
    ? advisory.recommendations
    : []

  const observations = Array.isArray(business.observations)
    ? business.observations
    : []

  const schemes = Array.isArray(result.scheme_matches)
    ? result.scheme_matches
    : []

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">

        <Link
          to="/finance"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Finance
        </Link>

        {/* Header */}
        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">
            Step 5 of 6
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">
            Your Business Analysis
          </h1>

          <p className="mt-3 max-w-3xl text-slate-600">
            Here is a simple overview of your business situation, financial
            position, risks and recommended next steps.
          </p>
        </div>

        {/* Overall Summary */}
        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Overall assessment
              </p>

              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {summary.simple_message || 'Analysis completed'}
              </h2>

              <p className="mt-2 text-slate-600">
                {summary.next_step ||
                  'Review the recommendations below and decide your next step.'}
              </p>
            </div>

            <StatusBadge
              label={summary.status || 'completed'}
            />
          </div>
        </section>

        {/* Key Metrics */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Financial Status"
            value={formatText(financial.financial_status)}
            description={`${formatNumber(
              financial.profit_margin_percent,
            )}% profit margin`}
          />

          <MetricCard
            title="Monthly Profit"
            value={formatCurrency(financial.monthly_profit)}
            description="Estimated monthly profit"
          />

          <MetricCard
            title="Risk Level"
            value={formatText(risk.risk_level)}
            description={
              risk.reason || 'Based on current repayment pressure.'
            }
          />

          <MetricCard
            title="Business Feasibility"
            value={formatText(business.feasibility_status)}
            description={`${formatNumber(
              business.estimated_roi_percent,
            )}% estimated ROI`}
          />
        </section>

        {/* Financial + Business */}
        <section className="mt-6 grid gap-6 lg:grid-cols-2">

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Financial Position
            </h2>

            <div className="mt-5 space-y-4">
              <DetailRow
                label="Available capital"
                value={formatCurrency(financial.available_capital)}
              />

              <DetailRow
                label="Monthly profit"
                value={formatCurrency(financial.monthly_profit)}
              />

              <DetailRow
                label="Profit margin"
                value={`${formatNumber(
                  financial.profit_margin_percent,
                )}%`}
              />

              <DetailRow
                label="Risk level"
                value={formatText(risk.risk_level)}
              />

              <DetailRow
                label="Repayment pressure"
                value={`${formatNumber(
                  risk.pressure_ratio_percent,
                )}%`}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Business Health
            </h2>

            <div className="mt-5 space-y-4">
              <DetailRow
                label="Business type"
                value={formatText(business.business_type)}
              />

              <DetailRow
                label="Initial investment"
                value={formatCurrency(business.initial_investment)}
              />

              <DetailRow
                label="Monthly revenue"
                value={formatCurrency(
                  business.expected_monthly_revenue,
                )}
              />

              <DetailRow
                label="Operating expenses"
                value={formatCurrency(
                  business.monthly_operating_expenses,
                )}
              />

              <DetailRow
                label="Operating surplus"
                value={formatCurrency(
                  business.monthly_operating_surplus,
                )}
              />

              <DetailRow
                label="Estimated ROI"
                value={`${formatNumber(
                  business.estimated_roi_percent,
                )}%`}
              />
            </div>
          </div>
        </section>

        {/* Observations */}
        {observations.length > 0 && (
          <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Business Observations
            </h2>

            <div className="mt-4 space-y-3">
              {observations.map((observation, index) => (
                <div
                  key={index}
                  className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700"
                >
                  {typeof observation === 'string'
                    ? observation
                    : JSON.stringify(observation)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Advisory */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Recommended Next Steps
          </h2>

          {recommendations.length > 0 ? (
            <div className="mt-5 space-y-3">
              {recommendations.map((recommendation, index) => (
                <div
                  key={index}
                  className="flex gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                    {index + 1}
                  </div>

                  <p className="text-sm leading-6 text-slate-700">
                    {typeof recommendation === 'string'
                      ? recommendation
                      : JSON.stringify(recommendation)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">
              No additional recommendations were returned.
            </p>
          )}
        </section>

        {/* Schemes */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Government Scheme Matches
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Schemes identified for your business profile.
              </p>
            </div>

            <div className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
              {schemes.length} match{schemes.length === 1 ? '' : 'es'}
            </div>
          </div>

          {schemes.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {schemes.map((scheme, index) => (
                <SchemeCard
                  key={index}
                  scheme={scheme}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
              No matching schemes were found for this particular test
              profile. Try reviewing your business category and state
              information.
            </div>
          )}
        </section>

        {/* Footer Actions */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link to="/finance">
            <Button
              className="w-full border border-slate-300 bg-white py-4 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              ← Review Financial Details
            </Button>
          </Link>

          <Link to="/schemes">
            <Button className="w-full py-4">
              Explore Schemes →
            </Button>
          </Link>
        </div>

      </div>
    </main>
  )
}

function MetricCard({ title, value, description }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span className="text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  )
}

function StatusBadge({ label }) {
  return (
    <span className="inline-flex rounded-full bg-green-100 px-4 py-2 text-sm font-semibold capitalize text-green-700">
      {formatText(label)}
    </span>
  )
}

function SchemeCard({ scheme }) {
  if (typeof scheme === 'string') {
    return (
      <div className="rounded-xl border border-slate-200 p-5">
        <p className="font-semibold text-slate-900">
          {scheme}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-900">
        {scheme.name ||
          scheme.scheme_name ||
          scheme.title ||
          'Government Scheme'}
      </h3>

      {scheme.reason && (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {scheme.reason}
        </p>
      )}

      {scheme.description && (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {scheme.description}
        </p>
      )}

      {scheme.eligibility && (
        <p className="mt-3 text-xs text-slate-500">
          Eligibility: {scheme.eligibility}
        </p>
      )}
    </div>
  )
}

function formatCurrency(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '₹0'
  }

  return `₹${number.toLocaleString('en-IN')}`
}

function formatNumber(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '0'
  }

  return number.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })
}

function formatText(value) {
  if (!value) {
    return 'Not available'
  }

  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export default AnalysisPage
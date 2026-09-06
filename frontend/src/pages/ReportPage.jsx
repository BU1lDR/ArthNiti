import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useApp } from '../context/AppContext'

function ReportPage() {
  const { applicationData } = useApp()

  const profile = applicationData?.profile || {}
  const business = applicationData?.business || {}
  const location = applicationData?.location || {}
  const finance = applicationData?.finance || {}
  const result = applicationData?.result

  const financial = result?.financial_analysis
  const risk = result?.risk_analysis
  const businessAnalysis = result?.business_analysis
  const advisory = result?.advisory
  const schemes = result?.scheme_matches || []
  const marketContext = result?.market_context || []

  const formatCurrency = (value) => {
    if (value === undefined || value === null || value === '') {
      return 'Not available'
    }

    return `₹${Number(value).toLocaleString('en-IN')}`
  }

  const formatValue = (value, fallback = 'Not provided') => {
    return value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
      ? value
      : fallback
  }

  const formatMatch = (score) => {
    if (score === undefined || score === null) {
      return 'Match unavailable'
    }

    if (score >= 80) return 'High Match'
    if (score >= 60) return 'Good Match'
    if (score > 0) return 'Possible Match'

    return 'No Match'
  }

  const financialStatus = financial?.financial_status
    ? String(financial.financial_status).replaceAll('_', ' ')
    : 'Not available'

  const riskLevel = risk?.risk_level || risk?.risk_status || 'Not available'

  const feasibility =
    businessAnalysis?.feasibility ||
    businessAnalysis?.feasibility_status ||
    'Not available'

  const recommendations = advisory?.recommendations || []

  const observations = businessAnalysis?.observations || []

  const fundingGap =
    business.initialInvestment !== undefined &&
    finance.availableCapital !== undefined
      ? Math.max(
          Number(business.initialInvestment || 0) -
            Number(finance.availableCapital || 0),
          0
        )
      : null

  if (!result) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <Link
              to="/advisory"
              className="text-sm font-medium text-green-700 hover:text-green-800"
            >
              ← Back to Advisory
            </Link>
          </div>

          <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-green-600">
              Business Advisory Report
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-900">
              Analysis Not Available
            </h1>

            <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-600">
              Complete the financial analysis first. Your personalized report
              will be generated from the analysis results.
            </p>

            <Link to="/finance">
              <Button className="mt-6">
                Go to Financial Analysis
              </Button>
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 print:bg-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between print:hidden">
          <Link
            to="/advisory"
            className="text-sm font-medium text-green-700 hover:text-green-800"
          >
            ← Back to Advisory
          </Link>

          <Button onClick={() => window.print()}>
            🖨️ Save / Print Report
          </Button>
        </div>

        <header className="rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">
            Business Advisory Report
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Your Personalized Business Plan
          </h1>

          <p className="mt-3 leading-7 text-slate-600">
            A summary generated from your business profile, local context,
            financial information, business analysis, funding options, and
            government scheme matches.
          </p>
        </header>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Entrepreneur Profile
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <InfoItem
              label="Name"
              value={formatValue(profile.name)}
            />

            <InfoItem
              label="District"
              value={formatValue(
                location.district || profile.district
              )}
            />

            <InfoItem
              label="State"
              value={formatValue(
                location.state || profile.state
              )}
            />

            <InfoItem
              label="Language"
              value={formatValue(profile.language)}
            />

            <InfoItem
              label="Entrepreneur Type"
              value={formatValue(profile.entrepreneurType)}
            />

            <InfoItem
              label="Location Type"
              value={formatValue(location.locationType)}
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Business Summary
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <InfoItem
              label="Business"
              value={formatValue(business.businessName)}
            />

            <InfoItem
              label="Business Type"
              value={formatValue(business.category)}
            />

            <InfoItem
              label="Employees"
              value={formatValue(business.employees, '0')}
            />

            <InfoItem
              label="Existing Debt"
              value={formatCurrency(business.existingDebt || 0)}
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Local Market
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <InfoItem
              label="Village / Town"
              value={formatValue(location.village)}
            />

            <InfoItem
              label="Main Market"
              value={formatValue(location.marketType)}
            />

            <InfoItem
              label="Customers"
              value={formatValue(location.customers)}
            />
          </div>

          {marketContext.length > 0 && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                Local Market Context
              </p>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                The analysis found {marketContext.length} relevant local
                market data point
                {marketContext.length === 1 ? '' : 's'} for this business
                category and location.
              </p>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Financial Summary
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Total Investment"
              value={formatCurrency(business.initialInvestment)}
            />

            <SummaryCard
              title="Own / Available Capital"
              value={formatCurrency(finance.availableCapital)}
            />

            <SummaryCard
              title="Estimated Funding Gap"
              value={formatCurrency(fundingGap)}
            />

            <SummaryCard
              title="Monthly Surplus"
              value={formatCurrency(financial?.monthly_profit)}
            />

            <SummaryCard
              title="Profit Margin"
              value={
                financial?.profit_margin_percent !== undefined
                  ? `${financial.profit_margin_percent}%`
                  : 'Not available'
              }
            />

            <SummaryCard
              title="Financial Status"
              value={financialStatus}
            />
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Business Analysis
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Business Feasibility"
              value={String(feasibility).replaceAll('_', ' ')}
            />

            {businessAnalysis?.estimated_roi_percent !== undefined && (
              <SummaryCard
                title="Estimated ROI"
                value={`${businessAnalysis.estimated_roi_percent}%`}
              />
            )}

            {businessAnalysis?.monthly_operating_surplus !== undefined && (
              <SummaryCard
                title="Operating Surplus"
                value={formatCurrency(
                  businessAnalysis.monthly_operating_surplus
                )}
              />
            )}

            {businessAnalysis?.annual_operating_surplus !== undefined && (
              <SummaryCard
                title="Annual Surplus"
                value={formatCurrency(
                  businessAnalysis.annual_operating_surplus
                )}
              />
            )}
          </div>

          {observations.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="font-semibold text-slate-900">
                Business Observations
              </p>

              {observations.map((observation, index) => (
                <div
                  key={index}
                  className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"
                >
                  {observation}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Recommended Government Schemes
          </h2>

          {schemes.length > 0 ? (
            <div className="mt-5 space-y-4">
              {schemes.map((scheme, index) => (
                <SchemeItem
                  key={scheme.name || index}
                  name={scheme.name || 'Government Scheme'}
                  match={formatMatch(scheme.match_score)}
                  description={
                    scheme.description ||
                    'Review the official scheme requirements before applying.'
                  }
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-600">
              No matching government schemes were returned for the current
              business category and state.
            </p>
          )}

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Scheme match scores are indicative matching results. They are not
            final eligibility decisions, approvals, or guarantees of funding.
            Always verify the latest requirements with the official scheme
            authority.
          </p>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            AI Advisory
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Business Opportunity"
              value={String(feasibility).replaceAll('_', ' ')}
            />

            <SummaryCard
              title="Risk Level"
              value={String(riskLevel).replaceAll('_', ' ')}
            />

            {risk?.pressure_ratio_percent !== undefined && (
              <SummaryCard
                title="Repayment Pressure"
                value={`${risk.pressure_ratio_percent}%`}
              />
            )}
          </div>

          {recommendations.length > 0 ? (
            <div className="mt-5 space-y-3">
              {recommendations.map((recommendation, index) => (
                <p
                  key={index}
                  className="leading-7 text-slate-600"
                >
                  {recommendation}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-5 leading-7 text-slate-600">
              Review the financial, business, and repayment analysis before
              making major funding or expansion decisions.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            Recommended Action Plan
          </h2>

          <div className="mt-5 space-y-4">
            {recommendations.length > 0 ? (
              recommendations.slice(0, 4).map((recommendation, index) => (
                <ActionItem
                  key={index}
                  number={String(index + 1)}
                  text={recommendation}
                />
              ))
            ) : (
              <>
                <ActionItem
                  number="1"
                  text="Review your investment requirement and monthly expenses."
                />

                <ActionItem
                  number="2"
                  text="Compare the suggested government schemes and their official eligibility requirements."
                />

                <ActionItem
                  number="3"
                  text="Prepare the documents required for the selected support option."
                />

                <ActionItem
                  number="4"
                  text="Confirm repayment affordability before taking additional debt."
                />
              </>
            )}
          </div>
        </section>

        <footer className="mt-8 rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm leading-6 text-slate-500">
            This report provides preliminary business guidance. Final scheme
            eligibility, loan approval, and financial outcomes depend on
            official rules and individual circumstances.
          </p>
        </footer>
      </div>
    </main>
  )
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>

      <p className="mt-1 font-semibold capitalize text-slate-900">
        {value}
      </p>
    </div>
  )
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold capitalize text-green-700">
        {value}
      </p>
    </div>
  )
}

function SchemeItem({ name, match, description }) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-bold text-slate-900">
          {name}
        </h3>

        <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
          {match}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {description}
      </p>
    </div>
  )
}

function ActionItem({ number, text }) {
  return (
    <div className="flex items-start gap-4 rounded-xl bg-slate-50 p-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
        {number}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
          Priority {number}
        </p>

        <p className="mt-1 leading-6 text-slate-700">
          {text}
        </p>
      </div>
    </div>
  )
}

export default ReportPage


import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useApp } from '../context/AppContext'

function AdvisoryPage() {
  const { applicationData } = useApp()
  const result = applicationData?.result
  const financial = result?.financial_analysis
  const risk = result?.risk_analysis
  const business = result?.business_analysis
  const advisory = result?.advisory
  const schemes = Array.isArray(result?.scheme_matches) ? result.scheme_matches : []
  const recommendations = Array.isArray(advisory?.recommendations) ? advisory.recommendations : []
  const observations = Array.isArray(business?.observations) ? business.observations : []

  const financialStatus = financial?.financial_status || 'unknown'
  const monthlyProfit = financial?.monthly_profit
  const profitMargin = financial?.profit_margin_percent
  const riskLevel = risk?.risk_level || risk?.risk_status || 'unknown'
  const repaymentPressure = risk?.pressure_ratio_percent
  const feasibility = business?.feasibility || business?.feasibility_status || 'unknown'

  return (
    <>
      <Link to="/schemes" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline">
        ← Back to schemes
      </Link>

      <header className="ui-page-intro">
        <p className="ui-eyebrow">🧭 Your Personalized Advisory</p>
        <h1 className="ui-page-title">Here is what you can do next</h1>
        <p className="ui-page-subtitle">
          Simple, practical guidance based on your business, money situation, risk and matched government support.
        </p>
      </header>

      {!result ? (
        <section className="ui-card mt-8 text-center sm:p-8">
          <div className="ui-feature-icon mx-auto">📋</div>
          <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]">Your advice is not ready yet</h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--color-text-muted)]">
            Complete the business and financial assessment first.
          </p>
          <Link to="/finance" className="mt-6 inline-block">
            <Button className="min-h-12 px-6">Continue assessment</Button>
          </Link>
        </section>
      ) : (
        <>
          <section className="ui-card mt-8 sm:p-8">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-soft)] text-3xl" aria-hidden="true">
                💡
              </div>
              <div className="min-w-0">
                <p className="ui-eyebrow">Your main takeaway</p>
                <h2 className="mt-1 text-2xl font-extrabold text-[var(--color-text)]">
                  {getBusinessRecommendation(feasibility)}
                </h2>
                <p className="mt-2 leading-7 text-[var(--color-text-muted)]">
                  {observations[0] || recommendations[0] || 'Review the steps below before making your next business decision.'}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <AdvisoryCard icon="💼" title="Business" value={formatStatus(feasibility)} description={getBusinessDescription(feasibility)} />
            <AdvisoryCard icon="💰" title="Money" value={formatStatus(financialStatus)} description={getFinancialDescription(monthlyProfit, profitMargin)} />
            <AdvisoryCard icon="🛡️" title="Risk" value={formatRisk(riskLevel)} description={getRiskDescription(riskLevel, repaymentPressure)} />
            <AdvisoryCard icon="🏛️" title="Government support" value={`${schemes.length} match${schemes.length === 1 ? '' : 'es'}`} description={schemes.length > 0 ? 'Government schemes may be worth checking.' : 'No scheme matched this assessment.'} />
          </section>

          <section className="ui-card mt-6 sm:p-8">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="ui-eyebrow">Action plan</p>
                <h2 className="mt-1 text-2xl font-bold text-[var(--color-text)]">Do these things next</h2>
              </div>
              <span className="shrink-0 text-2xl" aria-hidden="true">👉</span>
            </div>

            <div className="mt-6 space-y-4">
              {recommendations.length > 0 ? recommendations.slice(0, 5).map((recommendation, index) => (
                <ActionItem key={index} number={index + 1} text={recommendation} />
              )) : (
                <>
                  <ActionItem number={1} text="Review your monthly income and expenses." />
                  <ActionItem number={2} text="Check the government schemes suggested for your business." />
                  <ActionItem number={3} text="Prepare the documents needed for the support you choose." />
                  <ActionItem number={4} text="Check your repayment capacity before taking new debt." />
                </>
              )}
            </div>
          </section>

          <details className="ui-disclosure mt-6">
            <summary>Show the details behind this advice</summary>
            <div className="ui-disclosure-body space-y-5">
              {financial && (
                <DetailBlock title="Financial position">
                  <p>{formatStatus(financialStatus)}{hasNumber(monthlyProfit) ? `, with estimated monthly surplus of ${formatCurrency(monthlyProfit)}.` : '.'}</p>
                  {hasNumber(profitMargin) && <p className="mt-1">Profit margin: {formatNumber(profitMargin)}%</p>}
                </DetailBlock>
              )}
              {business && (
                <DetailBlock title="Business feasibility">
                  <p>{formatStatus(feasibility)}.</p>
                </DetailBlock>
              )}
              {risk && (
                <DetailBlock title="Repayment risk">
                  <p>{formatRisk(riskLevel)}{hasNumber(repaymentPressure) ? `, with repayment pressure of ${formatNumber(repaymentPressure)}%.` : '.'}</p>
                </DetailBlock>
              )}
              {observations.length > 0 && (
                <DetailBlock title="Business observations">
                  <ul className="space-y-2">
                    {observations.map((observation, index) => <li key={index}>• {observation}</li>)}
                  </ul>
                </DetailBlock>
              )}
            </div>
          </details>
        </>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link to="/schemes">
          <Button variant="secondary" className="w-full min-h-12 py-4">
            🏛️ Review schemes
          </Button>
        </Link>
        <Link to="/report">
          <Button className="w-full min-h-12 py-4">📄 Generate my report</Button>
        </Link>
      </div>

      <p className="mt-5 text-center text-xs leading-5 text-[var(--color-text-muted)]">
        This advisory is for guidance. It does not guarantee business success, scheme eligibility, loan approval or financial outcomes.
      </p>
    </>
  )
}

function AdvisoryCard({ icon, title, value, description }) {
  return (
    <article className="ui-card">
      <div className="flex min-w-0 items-start gap-4">
        <div className="ui-feature-icon shrink-0" aria-hidden="true">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">{title}</p>
          <p className="mt-1 text-xl font-extrabold text-[var(--color-text)]">{value}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
        </div>
      </div>
    </article>
  )
}

function ActionItem({ number, text }) {
  return (
    <div className="flex min-w-0 items-start gap-4 rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] font-extrabold text-[var(--color-primary-strong)]">
        {number}
      </div>
      <p className="min-w-0 flex-1 break-words pt-1 leading-7 text-[var(--color-text)]">{typeof text === 'string' ? text : JSON.stringify(text)}</p>
    </div>
  )
}

function DetailBlock({ title, children }) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--color-surface-soft)] p-4 text-sm leading-7 text-[var(--color-text-muted)]">
      <h3 className="font-bold text-[var(--color-text)]">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function getBusinessRecommendation(feasibility) {
  if (feasibility === 'feasible') return 'Your business plan looks feasible'
  if (feasibility === 'not_feasible') return 'Review your business plan before investing more'
  return 'Review your business position before the next step'
}

function getBusinessDescription(feasibility) {
  if (feasibility === 'feasible') return 'The current assessment supports moving forward carefully.'
  if (feasibility === 'not_feasible') return 'Some parts of the plan need attention before moving forward.'
  return 'The assessment does not have enough information for a clear conclusion.'
}

function getFinancialDescription(profit, margin) {
  if (!hasNumber(profit)) return 'Review your monthly income and expenses.'
  const marginText = hasNumber(margin) ? ` Profit margin is ${formatNumber(margin)}%.` : ''
  return `Estimated monthly money left is ${formatCurrency(profit)}.${marginText}`
}

function getRiskDescription(level, pressure) {
  const pressureText = hasNumber(pressure) ? ` Repayment pressure is ${formatNumber(pressure)}%.` : ''
  if (level === 'low') return `Current repayment pressure appears manageable.${pressureText}`
  if (level === 'moderate') return `Be careful with new borrowing and watch your cash flow.${pressureText}`
  if (level === 'high') return `Avoid unnecessary borrowing until repayment capacity improves.${pressureText}`
  return `Review repayment capacity before taking additional debt.${pressureText}`
}

function formatRisk(value) {
  if (value === 'low') return 'Low risk'
  if (value === 'moderate') return 'Moderate risk'
  if (value === 'high') return 'High risk'
  return 'Risk not available'
}

function formatStatus(value) {
  if (!value) return 'Not available'
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatCurrency(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `₹${number.toLocaleString('en-IN')}` : '₹0'
}

function formatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'
}

// The backend sends null for percentages it could not compute. Number(null) is 0
// and passes Number.isFinite, so guard on the raw value before printing it.
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

export default AdvisoryPage

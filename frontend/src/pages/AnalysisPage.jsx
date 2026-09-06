import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function AnalysisPage() {
  const { applicationData } = useApp()
  const result = applicationData.result

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl">
        <section className="ui-card p-5 text-center sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-3xl">
            📋
          </div>
          <h1 className="mt-5 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
            Your analysis is not ready yet
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">
            First tell us about your business and money. Then we will explain what it means for you.
          </p>
          <Link to="/profile" className="mt-6 inline-block">
            <Button className="px-6 py-3">Start my journey</Button>
          </Link>
        </section>
      </div>
    )
  }

  const financial = result.financial_analysis || {}
  const risk = result.risk_analysis || {}
  const business = result.business_analysis || {}
  const advisory = result.advisory || {}
  const summary = result.mvp_summary || {}
  const recommendations = Array.isArray(advisory.recommendations) ? advisory.recommendations : []
  const observations = Array.isArray(business.observations) ? business.observations : []
  const schemes = Array.isArray(result.scheme_matches) ? result.scheme_matches : []

  const status = String(summary.status || business.feasibility_status || 'completed').toLowerCase()
  const isPositive = ['feasible', 'low_risk', 'low risk', 'healthy', 'good', 'completed', 'eligible'].includes(status)
  const statusLabel = summary.simple_message || (isPositive ? 'Your business looks feasible' : formatText(status))

  return (
    <>
      <Link to="/finance" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline">
        ← Back to financial details
      </Link>

      <header className="ui-page-intro">
        <p className="ui-eyebrow">Step 5 · Your result</p>
        <h1 className="ui-page-title">What does this mean for you?</h1>
        <p className="ui-page-subtitle">
          We have checked your money, business health, risks and possible government support. Here are the most useful things to know first.
        </p>
      </header>

      <section className="ui-card mt-8 overflow-hidden p-5 sm:p-8">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-3xl" aria-hidden="true">{isPositive ? '✅' : '⚠️'}</span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold capitalize ${isPositive ? 'border-[var(--color-primary)] bg-[var(--color-surface-soft)] text-[var(--color-primary-strong)]' : 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-text)]'}`}>
                {formatText(summary.status || business.feasibility_status || 'completed')}
              </span>
            </div>
            <h2 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">
              {statusLabel}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-text-muted)]">
              {summary.next_step || 'Review the key numbers below and use the recommended next steps to plan what to do next.'}
            </p>
          </div>
          <div className="rounded-2xl bg-[var(--color-surface-soft)] p-5 text-center lg:min-w-52">
            <p className="text-sm font-semibold text-[var(--color-text-muted)]">Monthly money left</p>
            <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
              {formatCurrency(financial.after_emi_surplus ?? financial.monthly_profit ?? business.monthly_operating_surplus)}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">after regular EMI, if available</p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon="💰" title="Money needed" value={formatCurrency(financial.funding_gap)} description="Extra capital you may need" />
        <MetricCard icon="📈" title="Profit margin" value={`${formatNumber(financial.profit_margin_percent)}%`} description="Profit compared with revenue" />
        <MetricCard icon="🛡️" title="Risk" value={formatText(risk.risk_level)} description={risk.reason || 'Based on your current financial position'} />
        <MetricCard icon="🏪" title="Business health" value={formatText(business.feasibility_status)} description={`${formatNumber(business.estimated_roi_percent)}% estimated ROI`} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="ui-card min-w-0 p-5 sm:p-8">
          <SectionHeading icon="💵" title="Your money" subtitle="The numbers that matter most for your decision." />
          <div className="mt-6 space-y-4">
            <DetailRow label="Money you have" value={formatCurrency(financial.available_capital)} />
            <DetailRow label="Monthly income" value={formatCurrency(financial.expected_monthly_revenue)} />
            <DetailRow label="Monthly expenses" value={formatCurrency(financial.monthly_expenses ?? financial.monthly_operating_expenses)} />
            <DetailRow label="Monthly profit" value={formatCurrency(financial.monthly_profit)} />
            <DetailRow label="EMI pressure" value={`${formatNumber(risk.pressure_ratio_percent)}%`} />
          </div>
        </div>

        <div className="ui-card min-w-0 p-5 sm:p-8">
          <SectionHeading icon="🏪" title="Your business" subtitle="A quick view of how the business is performing." />
          <div className="mt-6 space-y-4">
            <DetailRow label="Business type" value={formatText(business.business_type)} />
            <DetailRow label="Investment" value={formatCurrency(business.initial_investment)} />
            <DetailRow label="Monthly sales" value={formatCurrency(business.expected_monthly_revenue)} />
            <DetailRow label="Operating surplus" value={formatCurrency(business.monthly_operating_surplus)} />
            <DetailRow label="Estimated return" value={`${formatNumber(business.estimated_roi_percent)}% ROI`} />
          </div>
        </div>
      </section>

      <details className="ui-disclosure mt-6">
        <summary>⚙️ Show detailed calculations and checks</summary>
        <div className="ui-disclosure-body grid gap-6 lg:grid-cols-2">
          <div className="ui-card-soft min-w-0 p-5">
            <h2 className="font-bold text-[var(--color-text)]">Financial checks</h2>
            <div className="mt-4 space-y-3">
              <DetailRow label="Available capital" value={formatCurrency(financial.available_capital)} />
              <DetailRow label="Monthly profit" value={formatCurrency(financial.monthly_profit)} />
              <DetailRow label="Profit margin" value={`${formatNumber(financial.profit_margin_percent)}%`} />
              <DetailRow label="Repayment pressure" value={`${formatNumber(risk.pressure_ratio_percent)}%`} />
            </div>
          </div>

          <div className="ui-card-soft min-w-0 p-5">
            <h2 className="font-bold text-[var(--color-text)]">Business checks</h2>
            <div className="mt-4 space-y-3">
              <DetailRow label="Initial investment" value={formatCurrency(business.initial_investment)} />
              <DetailRow label="Operating expenses" value={formatCurrency(business.monthly_operating_expenses)} />
              <DetailRow label="Operating surplus" value={formatCurrency(business.monthly_operating_surplus)} />
              <DetailRow label="Estimated ROI" value={`${formatNumber(business.estimated_roi_percent)}%`} />
            </div>
          </div>
        </div>
      </details>

      {observations.length > 0 && (
        <section className="ui-card mt-6 p-5 sm:p-8">
          <SectionHeading icon="🔎" title="What we noticed" subtitle="Important points from your business information." />
          <div className="mt-5 grid gap-3">
            {observations.map((observation, index) => (
              <div
                key={index}
                className="min-w-0 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm leading-6 text-[var(--color-text)] break-words"
              >
                <span className="mr-2 shrink-0 font-bold">{index + 1}.</span>
                {typeof observation === 'string' ? observation : JSON.stringify(observation)}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ui-card mt-6 p-5 sm:p-8">
        <SectionHeading icon="🧭" title="What you can do next" subtitle="Start with the steps that can improve your position." />
        {recommendations.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {recommendations.map((recommendation, index) => (
              <div key={index} className="flex min-w-0 gap-4 rounded-2xl border border-[var(--color-border)] p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] font-bold text-[var(--color-text)]">
                  {index + 1}
                </div>
                <p className="min-w-0 flex-1 break-words text-sm leading-6 text-[var(--color-text)]">
                  {typeof recommendation === 'string' ? recommendation : JSON.stringify(recommendation)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-[var(--color-text-muted)]">No extra recommendations were returned.</p>
        )}
      </section>

      <section className="ui-card mt-6 p-5 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeading icon="🏛️" title="Government support" subtitle="Schemes that may fit your business profile." />
          <span className="inline-flex w-fit shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1 text-sm font-bold text-[var(--color-text)]">
            {schemes.length} match{schemes.length === 1 ? '' : 'es'}
          </span>
        </div>

        {schemes.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {schemes.map((scheme, index) => <SchemeCard key={index} scheme={scheme} />)}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-[var(--color-surface-soft)] p-5 text-sm leading-6 text-[var(--color-text-muted)]">
            No matching schemes were found for this profile. You can still review your information or explore the schemes page.
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Link to="/finance">
          <Button className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] py-4 text-[var(--color-text)]">
            ← Review details
          </Button>
        </Link>
        <Link to="/schemes">
          <Button className="w-full py-4">Explore schemes</Button>
        </Link>
        <Link to="/advisory">
          <Button className="w-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] py-4 text-[var(--color-text)]">
            View advice →
          </Button>
        </Link>
      </div>
    </>
  )
}

function MetricCard({ icon, title, value, description }) {
  return (
    <div className="ui-card flex min-h-40 min-w-0 flex-col justify-between p-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-2xl" aria-hidden="true">{icon}</span>
        <p className="min-w-0 break-words text-sm font-semibold text-[var(--color-text-muted)]">{title}</p>
      </div>

      <div className="mt-4 min-w-0">
        <p className="break-words text-2xl font-bold text-[var(--color-text)]">{value}</p>
        <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
  )
}

function SectionHeading({ icon, title, subtitle }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-2xl" aria-hidden="true">{icon}</span>
        <h2 className="min-w-0 break-words text-xl font-bold text-[var(--color-text)]">{title}</h2>
      </div>
      {subtitle && (
        <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-muted)]">
          {subtitle}
        </p>
      )}
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-start gap-4 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
      <span className="min-w-0 break-words text-sm text-[var(--color-text-muted)]">{label}</span>
      <span className="min-w-0 max-w-full break-words text-right text-sm font-bold text-[var(--color-text)]">{value}</span>
    </div>
  )
}

function SchemeCard({ scheme }) {
  if (typeof scheme === 'string') {
    return (
      <div className="min-w-0 rounded-2xl border border-[var(--color-border)] p-5 font-semibold text-[var(--color-text)] break-words">
        {scheme}
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--color-border)] p-5">
      <h3 className="break-words font-bold text-[var(--color-text)]">
        {scheme.name || scheme.scheme_name || scheme.title || 'Government Scheme'}
      </h3>

      {scheme.reason && (
        <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-muted)]">
          {scheme.reason}
        </p>
      )}

      {scheme.description && (
        <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-muted)]">
          {scheme.description}
        </p>
      )}

      {scheme.eligibility && (
        <p className="mt-3 break-words text-xs leading-5 text-[var(--color-text-muted)]">
          Eligibility: {scheme.eligibility}
        </p>
      )}
    </div>
  )
}

function formatCurrency(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '₹0'
  return `₹${number.toLocaleString('en-IN')}`
}

function formatNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatText(value) {
  if (!value) return 'Not available'
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export default AnalysisPage

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { BarGroup } from '../components/Charts'
import { runAnalysis } from '../services/api'
import { useI18n } from '../i18n/LanguageContext'

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

// Every summary value used to print in the positive brand green, including a
// month with nothing left in it. Green is the app's "this is fine" colour, so a
// loss-making month was being coloured as a good one — the favourable misreading
// this codebase has shipped before. One text utility per tone: two competing
// text-* classes would land in the same cascade layer and be resolved by
// generated-stylesheet order, not by the class attribute.
const TONE_CLASS = {
  good: 'text-[var(--color-primary-strong)]',
  bad: 'text-[var(--color-danger)]',
  muted: 'text-[var(--color-text-muted)]',
}

// The result pages' guard, applied to the form state instead of to a backend
// null. Same trap either way: Number('') and Number(null) are both 0 and both
// pass Number.isFinite, so an unanswered question prints as a confident ₹0.
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function FinancePage() {
  const { applicationData, updateSection, setResult } = useApp()
  const { t, apiLanguage, apiDialect } = useI18n()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const finance = applicationData.finance
  const business = applicationData.business
  const profile = applicationData.profile
  const location = applicationData.location

  const handleChange = (event) => {
    const { name, value } = event.target
    updateSection('finance', { [name]: value })
  }

  const availableCapital = Number(finance.availableCapital) || 0
  const monthlyExpenses = Number(finance.monthlyExpenses) || 0
  const monthlyEmi = Number(finance.monthlyEmi) || 0
  const investment = Number(business.initialInvestment) || 0
  const monthlyRevenue = Number(business.monthlyRevenue) || 0
  const fundingGap = Math.max(investment - availableCapital, 0)
  const monthlySurplus = Math.max(monthlyRevenue - monthlyExpenses - monthlyEmi, 0)

  // What the user has actually told us, as opposed to what `|| 0` above coerced
  // an empty field into. The coercion is right for the payload — the backend
  // wants a number and 0 is the documented default — and wrong for the screen.
  //
  // Both figures below are subtractions, and a subtraction with an unanswered
  // side is not a number yet, it is a guess in the user's favour. Before the
  // spending is entered the surplus equals the entire revenue, so this card sat
  // on step 4 announcing "money left after the loan payment: ₹30,000" in green
  // before a single expense had been named. The funding gap was worse: with the
  // investment and the capital both blank it computed max(0 − 0, 0) = 0 and
  // printed "You have enough of your planned investment."
  //
  // The EMI is genuinely optional, so a blank one really does mean zero and is
  // deliberately not required here.
  const knowsInvestment = hasNumber(business.initialInvestment)
  const knowsRevenue = hasNumber(business.monthlyRevenue)
  const knowsGap = knowsInvestment && hasNumber(finance.availableCapital)
  const knowsSurplus = knowsRevenue && hasNumber(finance.monthlyExpenses)

  // Clamped at zero, so 'bad' has to fire on the boundary: nothing left is not a
  // good month. The bar and the card below it read the same flag, so the chart
  // cannot show red while the card three lines down shows green.
  const surplusIsHealthy = knowsSurplus && monthlySurplus > 0
  // An unknown must not be alarming either, so the warning mark is reserved for a
  // surplus we have actually worked out and found to be nothing.
  const surplusIcon = knowsSurplus && !surplusIsHealthy ? '⚠️' : '💚'

  // 'other' is a placeholder for whatever the user typed on the business step,
  // and the backend expects one market_type string, not the list we collect.
  const businessCategory = business.category === 'other'
    ? (business.categoryOther || '').trim()
    : business.category
  const marketTypes = Array.isArray(location.marketType) ? location.marketType : []

  const handleContinue = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      business_category: businessCategory,
      state: location.state,
      district: location.district || '',
      village: location.village || '',
      market_type: marketTypes.join(', '),
      customers: location.customers || '',
      available_capital: availableCapital,
      monthly_expenses: monthlyExpenses,
      expected_monthly_revenue: monthlyRevenue,
      monthly_emi: monthlyEmi,
      initial_investment: investment,
      monthly_operating_expenses: Number(business.monthlyOperatingExpenses) || 0,
      employees: Number(business.employees) || 0,
      existing_debt: Number(business.existingDebt) || 0,
      // The language context is authoritative here, not `profile`: the header
      // switcher can change the language without the profile form being touched.
      user_language: apiLanguage,
      preferred_dialect: apiDialect,
      literacy_level: profile.literacyLevel || 'low',
      location_type: location.locationType || 'rural',
    }

    try {
      const result = await runAnalysis(payload)
      setResult(result)
      navigate('/analysis')
    } catch (err) {
      setError(err.message || 'Unable to connect to the analysis service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const rupees = (value) => `₹${value.toLocaleString('en-IN')}`

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/location" className="inline-flex min-h-11 min-w-11 items-center text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          <span aria-hidden="true">←</span> {t('nav.location')}
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">{t('common.stepOf', { n: 4, total: 4 })}</span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow"><span aria-hidden="true">💰</span> {t('finance.eyebrow')}</p>
        <h1 className="ui-page-title">{t('finance.title')}</h1>
        <p className="ui-page-subtitle">{t('finance.subtitle')}</p>
      </div>

      <form onSubmit={handleContinue} className="space-y-6">
        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">1</span>
            <h2 className="ui-formsection-title">{t('finance.startHeading')}</h2>
          </div>
          <div className="ui-formsection-body">
            <p className="text-sm text-[var(--color-text-muted)]">{t('finance.startHint')}</p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
                <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('finance.investNeeded')}</p>
                <p className={`mt-2 text-3xl font-black ${knowsInvestment ? TONE_CLASS.good : TONE_CLASS.muted}`}>
                  {knowsInvestment ? rupees(investment) : t('common.notAvailable')}
                </p>
              </div>
              <InputField label={t('finance.capital')} name="availableCapital" value={finance.availableCapital} onChange={handleChange} placeholder="e.g. 150000" required />
            </div>
          </div>
        </div>

        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">2</span>
            <h2 className="ui-formsection-title">{t('finance.flowHeading')}</h2>
          </div>
          <div className="ui-formsection-body">
            <p className="text-sm text-[var(--color-text-muted)]">{t('finance.flowHint')}</p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
                <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('finance.expectedIncome')}</p>
                <p className={`mt-2 text-2xl font-black ${knowsRevenue ? 'text-[var(--color-text)]' : TONE_CLASS.muted}`}>
                  {knowsRevenue ? rupees(monthlyRevenue) : t('common.notAvailable')}
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t('finance.fromBusiness')}</p>
              </div>
              <InputField label={t('finance.expenses')} name="monthlyExpenses" value={finance.monthlyExpenses} onChange={handleChange} placeholder="e.g. 15000" hint={t('finance.expensesHint')} required />
            </div>

            <details className="ui-disclosure mt-6">
              <summary><span aria-hidden="true">💳</span> {t('finance.emiSummary')}</summary>
              <div className="ui-disclosure-body">
                <InputField label={`${t('finance.emi')} (₹)`} name="monthlyEmi" value={finance.monthlyEmi} onChange={handleChange} placeholder={t('finance.emiPh')} />
              </div>
            </details>
          </div>
        </div>

        {/* A live preview while the form is still being filled in: the three bars
            move as the numbers are typed, so the shape of the month is visible
            before the submit ever happens.

            The third bar is revenue − expenses − EMI, which is NOT the figure
            /analysis and /report call 'money.left'. Theirs is the backend's
            monthly_profit, revenue − expenses, with the EMI left in because
            risk_service divides the EMI by it to get the repayment pressure. Two
            different numbers, so two different labels: this one says the loan
            payment is already out of it. */}
        {knowsSurplus && monthlyRevenue > 0 && (
          <div className="ui-card p-5 sm:p-6">
            {/* Named for the chart, not for the form section above it: both used
                to render 'finance.flowHeading', which put the identical <h2> on
                the page twice. 'ch.inOut' is what /analysis calls the same three
                bars, so the chart keeps one name across both pages. */}
            <h2 className="text-lg font-extrabold">{t('ch.inOut')}</h2>
            <div className="mt-5">
              <BarGroup
                items={[
                  { label: t('finance.expectedIncome'), icon: '📥', value: monthlyRevenue, valueText: rupees(monthlyRevenue), tone: 'neutral' },
                  { label: t('finance.expenses'), icon: '📤', value: monthlyExpenses + monthlyEmi, valueText: rupees(monthlyExpenses + monthlyEmi), tone: 'warn' },
                  { label: t('money.leftAfterEmi'), icon: surplusIcon, value: monthlySurplus, valueText: rupees(monthlySurplus), tone: surplusIsHealthy ? 'good' : 'bad' },
                ]}
                caption={t('money.afterExpenses')}
              />
            </div>
          </div>
        )}

        {/* Until a figure is known the card names the question that fills it,
            rather than printing a number nobody has answered for. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard
            icon="📌"
            title={t('money.needed')}
            value={knowsGap ? rupees(fundingGap) : t('common.notAvailable')}
            description={knowsGap ? (fundingGap > 0 ? t('money.needArrange') : t('money.enough')) : t('finance.capital')}
            tone={knowsGap ? 'good' : 'muted'}
          />
          <SummaryCard
            icon={surplusIcon}
            title={t('money.leftAfterEmi')}
            value={knowsSurplus ? rupees(monthlySurplus) : t('common.notAvailable')}
            description={knowsSurplus ? t('money.afterExpenses') : t('finance.expenses')}
            tone={knowsSurplus ? (surplusIsHealthy ? 'good' : 'bad') : 'muted'}
          />
        </div>

        {error && <div role="alert" className="ui-notice ui-notice-danger font-semibold text-[var(--color-danger)]">{error}</div>}

        {/* The arrow is decoration. Concatenated into the label it became part of
            the button's accessible name, which a screen reader reads out as
            "Check my business right arrow" — the same reason the other journey
            steps wrap theirs. */}
        <Button type="submit" disabled={loading} size="lg" className="w-full">
          {loading ? t('finance.checking') : <>{t('finance.submit')} <span aria-hidden="true">→</span></>}
        </Button>
      </form>
    </section>
  )
}

function InputField({ label, name, value, onChange, placeholder, hint, required = false }) {
  return (
    <label className="block">
      <span className="font-extrabold">
        {label}
        {required && <> <span className="ui-required" aria-hidden="true">*</span></>}
      </span>
      {hint && <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">{hint}</span>}
      <input name={name} value={value} onChange={onChange} type="number" min="0" placeholder={placeholder} required={required} className={fieldClass} />
    </label>
  )
}

function SummaryCard({ icon, title, value, description, tone = 'good' }) {
  return (
    <div className="ui-card p-5">
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <p className="mt-3 text-sm font-bold text-[var(--color-text-muted)]">{title}</p>
      <p className={`mt-1 text-2xl font-black ${TONE_CLASS[tone] || TONE_CLASS.good}`}>{value}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{description}</p>
    </div>
  )
}

export default FinancePage

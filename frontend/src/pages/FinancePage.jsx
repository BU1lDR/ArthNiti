import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { BarGroup } from '../components/Charts'
import { MAX_RUPEES } from '../data/limits'
import { isAbortError, runAnalysis } from '../services/api'
import { useI18n } from '../i18n/LanguageContext'

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

// Every summary value used to print in the positive brand green, including a
// month with nothing left in it. Green is the app's "this is fine" colour, so a
// loss-making month was being coloured as a good one — the favourable misreading
// this codebase has shipped before. One text utility per tone: two competing
// text-* classes would land in the same cascade layer and be resolved by
// generated-stylesheet order, not by the class attribute.
// `neutral` is the body-text colour, and it exists because a shortfall to raise
// is neither. --color-accent is the app's warning amber and is unusable as text
// on a pale surface, so the honest third option is no colour claim at all.
const TONE_CLASS = {
  good: 'text-[var(--color-primary-strong)]',
  bad: 'text-[var(--color-danger)]',
  neutral: 'text-[var(--color-text)]',
  muted: 'text-[var(--color-text-muted)]',
}

// The result pages' guard, applied to the form state instead of to a backend
// null. Same trap either way: Number('') and Number(null) are both 0 and both
// pass Number.isFinite, so an unanswered question prints as a confident ₹0.
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

// Payload fields that are echoed back rather than computed from. Changing one
// (the language switcher in the top bar, say) does not make a result wrong,
// which is also why AppContext does not clear the result for them.
const ECHOED_FIELDS = new Set(['user_language', 'preferred_dialect', 'literacy_level'])

// The answers a payload carries, as one comparable string. Sorted, so the same
// answers always give the same string whatever order the object was built in.
function answersKey(payload) {
  return JSON.stringify(
    Object.entries(payload)
      .filter(([field]) => !ECHOED_FIELDS.has(field))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
}

function FinancePage() {
  const { applicationData, updateSection, setResult } = useApp()
  const { t, apiLanguage, apiDialect } = useI18n()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [loading, setLoading] = useState(false)
  // The whole Error, not a finished sentence. api.js throws a translation code
  // plus the fields it names, and the banner is resolved at render time — so a
  // reader who switches language with the banner already on screen sees it
  // change with everything else instead of being left with the sentence that
  // happened to be current when the request failed.
  const [error, setError] = useState(null)
  // True when a response came back for answers that had changed while it was
  // out, so it was thrown away. The button is ready again at that point, and
  // with nothing said the reader sees the check end and nothing happen.
  const [stale, setStale] = useState(false)

  // The request in flight, so it can be cancelled when the reader leaves this
  // page. Without this a slow answer arriving after they had gone on to another
  // step still called setResult and navigate('/analysis'), pulling them off the
  // page they were on.
  const requestRef = useRef(null)
  // Set inside the effect rather than at declaration: StrictMode mounts, unmounts
  // and mounts again in development, and the cleanup in between sets it false.
  const mountedRef = useRef(false)
  const pathRef = useRef(pathname)
  const latestAnswersRef = useRef('')

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      requestRef.current?.abort()
      requestRef.current = null
    }
  }, [])

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
  // NOT clamped at zero, unlike the funding gap above. The two look symmetrical
  // and are not: a clamped gap reads as "you need nothing more", which is true
  // when you have surplus capital, so clamping loses nothing. A clamped
  // shortfall reads as "nothing left over", which is a different and much
  // better month than "you are ₹5,000 short every month" — and it is the
  // favourable misreading, on the figure the whole page is about. /analysis
  // prints the backend's negative monthly_profit as-is for the same reason.
  const monthlySurplus = monthlyRevenue - monthlyExpenses - monthlyEmi

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

  // Strictly greater than zero, so 'bad' fires on the boundary as well as below
  // it: nothing left is not a good month either. The bar and the card below it
  // read the same flag, so the chart cannot show red while the card three lines
  // down shows green. BarGroup gives a negative value no bar at all and colours
  // the figure instead, so an empty track beside a red −₹5,000 is the shortfall
  // rendering — deliberately not a long bar that reads as "plenty".
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
    // Optional, and a blank answer is sent as null, never as 0. A 0 would be a
    // household with no income at all, and the backend would then say every
    // repayment is more than half of it. null tells it the question was not
    // answered, so it says the check was not done.
    household_monthly_income: String(finance.householdIncome ?? '').trim() === '' ? null : Number(finance.householdIncome),
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

  const answers = answersKey(payload)

  // After every render, so an answer changed while the request is out is seen
  // by the time the response comes back. Refs are written here and not during
  // render, which is where React expects them to be written.
  useLayoutEffect(() => {
    latestAnswersRef.current = answers
    pathRef.current = pathname
  })

  const handleContinue = async (event) => {
    event.preventDefault()

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    setLoading(true)
    setError(null)
    setStale(false)

    const sent = answers
    const sentFrom = pathname

    try {
      const result = await runAnalysis(payload, { signal: controller.signal })

      if (controller.signal.aborted || !mountedRef.current) return

      // The fields stay editable while the check runs. If an answer changed in
      // that time, this result describes answers that are no longer on the page,
      // and storing it would show them as though they were the current ones. The
      // button is ready again, and the page says so, so the reader checks the
      // new answers instead.
      if (latestAnswersRef.current !== sent) {
        setStale(true)
        return
      }

      setResult(result)

      if (mountedRef.current && pathRef.current === sentFrom) navigate('/analysis')
    } catch (err) {
      // Leaving the page cancels the request. That is not a failure, and there
      // is nobody left on this page to read a banner about it.
      if (isAbortError(err) || controller.signal.aborted || !mountedRef.current) return
      // An error about answers that have since changed would point the reader
      // at something they may already have fixed. They are told to check again
      // instead, the same as for a result that arrived too late.
      if (latestAnswersRef.current !== sent) {
        setStale(true)
        return
      }

      setError(err)
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        if (mountedRef.current) setLoading(false)
      }
    }
  }

  // Sign before the symbol — see the note in AnalysisPage's formatCurrency. This
  // page needs it as much as that one: the monthly surplus preview below is no
  // longer clamped at zero, so it prints a real shortfall.
  const rupees = (value) => `${value < 0 ? '-₹' : '₹'}${Math.abs(value).toLocaleString('en-IN')}`

  // Opposite fallback contract to t(), and the same one tBackend() uses: never
  // print a dotted code here. There is always a real English sentence on the
  // Error to fall back to, and the one path with no code at all — a hand-written
  // `detail` string from the backend — has nothing else to show.
  const errorText = (err) => {
    if (!err.code) return err.message

    if (!err.fields) return t(err.code)

    // The field names are translated individually and rejoined, rather than the
    // sentence being built from a translated stem plus English fragments. Same
    // reason the scheme match reasons carry a `categories` list instead of a
    // finished sentence.
    const fields = err.fields
      .map((field) => (field.key ? t(field.key) : field.en))
      .join(', ')

    return t(err.code, { fields })
  }

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
                <InputField label={t('finance.emi')} name="monthlyEmi" value={finance.monthlyEmi} onChange={handleChange} placeholder={t('finance.emiPh')} hint={t('finance.emiHint')} />
              </div>
            </details>

            {/* Beside the loan question, and outside its disclosure on purpose:
                someone with no loan today still needs one for any money the plan
                is short of, and the household check counts that loan too, so
                hiding this behind "do you have a loan?" would skip them.

                No live preview. The share of household income that goes on
                repayments needs the estimated loan for the gap, which the backend
                prices, and a second copy of that arithmetic here could disagree
                with the one on /analysis. Blank is sent as null, not 0. */}
            <div className="mt-6">
              <InputField
                label={t('finance.householdIncome')}
                name="householdIncome"
                value={finance.householdIncome ?? ''}
                onChange={handleChange}
                placeholder="e.g. 20000"
                hint={t('finance.householdIncomeHint')}
                optionalText={t('common.optional')}
              />
            </div>
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
            rather than printing a number nobody has answered for.

            The gap card's tone follows the figure, not merely whether we know
            it. A ₹50,000 shortfall printed in the brand green sat directly above
            the sentence "this is the amount you may need to arrange", so the
            colour said "fine" while the words said "raise this". Green is kept
            for the zero-gap case, the only one that is actually good news. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard
            icon="📌"
            title={t('money.needed')}
            value={knowsGap ? rupees(fundingGap) : t('common.notAvailable')}
            description={knowsGap ? (fundingGap > 0 ? t('money.needArrange') : t('money.enough')) : t('finance.capital')}
            tone={knowsGap ? (fundingGap > 0 ? 'neutral' : 'good') : 'muted'}
          />
          <SummaryCard
            icon={surplusIcon}
            title={t('money.leftAfterEmi')}
            value={knowsSurplus ? rupees(monthlySurplus) : t('common.notAvailable')}
            description={knowsSurplus ? t('money.afterExpenses') : t('finance.expenses')}
            tone={knowsSurplus ? (surplusIsHealthy ? 'good' : 'bad') : 'muted'}
          />
        </div>

        {/* Said here, beside the button that sends the answers, because this is
            the step where the money figures are entered. It has to match what
            AppContext does: sessionStorage, so a refresh keeps the answers and a
            closed tab normally loses them. "Normally", because a browser can
            restore a closed tab together with what it had stored. */}
        <p className="text-sm text-[var(--color-text-muted)]">
          {/* The button's name only. The ↺ is the icon's own glyph and is
              aria-hidden on the button, so pasted into the sentence it was read
              out as a symbol and sat mid-word in scripts that have no space. */}
          {t('finance.privacyNote', { button: t('common.startOver') })}
        </p>

        {error && <div role="alert" className="ui-notice ui-notice-danger font-semibold text-[var(--color-danger)]">{errorText(error)}</div>}

        {/* Always in the page, and only its text changes: a live region that is
            inserted together with its message is often not announced, because
            the screen reader was not yet watching it. Hidden but present until
            there is something to say. */}
        <div role="status" className={stale ? 'ui-notice ui-notice-warn font-semibold' : 'sr-only'}>
          {stale ? t('finance.changedWhileChecking', { button: t('finance.submit') }) : null}
        </div>

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

// ui-field, not block: each of these shares a grid row with a preview card that
// stretches to the row's full height, so without it the box floats above the card's
// bottom edge with dead space beneath it. See index.css.
//
// Every question on this page is an amount of money, so the ₹ sits inside the box
// the same way BusinessPage's MoneyField puts it there, and for the same reasons:
// see .ui-money-field in index.css. The marker is aria-hidden because each question
// already names money in words.
//
// `optionalText` marks a question that may be left blank. It is part of the label,
// so a screen reader hears it with the question rather than never at all.
function InputField({ label, name, value, onChange, placeholder, hint, required = false, optionalText }) {
  return (
    <label className="ui-field">
      <span className="font-extrabold">
        {label}
        {/* No space before the asterisk — it would be a place to break the line, and
            the marker would end up alone under a question that wrapped. */}
        {required && <span className="ui-required" aria-hidden="true">*</span>}
        {optionalText && <span className="ml-2 inline-block text-sm font-bold text-[var(--color-text-muted)]">{optionalText}</span>}
      </span>
      {hint && <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">{hint}</span>}
      <span className="ui-money-field">
        <span className="ui-money-prefix" aria-hidden="true">₹</span>
        <input name={name} value={value} onChange={onChange} type="number" min="0" max={MAX_RUPEES} placeholder={placeholder} required={required} className={fieldClass} />
      </span>
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

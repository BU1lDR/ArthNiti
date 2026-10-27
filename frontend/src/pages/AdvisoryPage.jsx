import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { DEPLOYMENT } from '../config/deployment'
import { firstUnansweredStep, isStarted, useApp } from '../context/AppContext'
import { BarRow, UnitChart } from '../components/Charts'
import { LANGUAGES } from '../i18n/languages'
import { useI18n } from '../i18n/LanguageContext'
import { useBackendText } from '../i18n/backendText'
import { isAbortError, requestPlan } from '../services/api'

function AdvisoryPage() {
  const { applicationData, resultCleared } = useApp()
  const { t } = useI18n()
  const bt = useBackendText()
  const result = applicationData?.result
  const financial = result?.financial_analysis
  const risk = result?.risk_analysis
  const business = result?.business_analysis
  const advisory = result?.advisory
  const schemes = Array.isArray(result?.scheme_matches) ? result.scheme_matches : []
  // Backend prose, in the chosen language: each service sends a code beside the
  // sentence it built, and `bt` falls back to that sentence if a code is unknown.
  const recommendations = bt.advice(advisory)
  const observations = bt.observations(business)
  const riskReason = bt.riskReason(risk)

  // Only the field names in the response contract are read here. This file used
  // to try `business.feasibility` and `risk.risk_status` first and fall back to
  // the real names, so the real value was only ever reached by accident.
  const financialStatus = financial?.financial_status
  const monthlyProfit = financial?.monthly_profit
  const profitMargin = financial?.profit_margin_percent
  const riskLevel = risk?.risk_level
  const repaymentPressure = risk?.pressure_ratio_percent
  const feasibility = business?.feasibility_status
  // The pressure figure counts a loan for the funding gap when there is one.
  // Same note as /analysis, so the two pages cannot describe it differently.
  const newLoanNote = hasNumber(risk?.estimated_new_emi) && Number(risk.estimated_new_emi) > 0
    ? t('ch.pressureIncludesNew', {
        rate: risk.assumed_interest_rate_percent,
        years: Number(risk.assumed_tenure_months) / 12,
      })
    : null

  // Ten coins, one for each rupee in ten. A real 0% margin must still draw zero
  // filled coins rather than disappearing, so the guard is on the raw value.
  const marginCoins = hasNumber(profitMargin)
    ? Math.min(10, Math.max(0, Math.round(Number(profitMargin) / 10)))
    : null

  return (
    <>
      <Link to="/schemes" className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline">
        <span aria-hidden="true">←</span> {t('res.backSchemes')}
      </Link>

      <header className="ui-page-intro">
        <p className="ui-eyebrow"><span aria-hidden="true">🧭</span> {t('ad.eyebrow')}</p>
        <h1 className="ui-page-title">{t('ad.title')}</h1>
        <p className="ui-page-subtitle">{t('ad.subtitle')}</p>
      </header>

      {!result ? (
        <section className="ui-card mt-8 text-center sm:p-8">
          <div className="ui-feature-icon mx-auto" aria-hidden="true">📋</div>
          <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]">
            {resultCleared ? t('res.changedTitle') : t('ad.notReady')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--color-text-muted)]">
            {resultCleared ? t('res.changedText', { button: t('finance.submit') }) : t('res.notReadyText')}
          </p>
          {/* Where AnalysisPage's empty-state button goes: the first step still
              missing an answer, or /finance, where the check is run. */}
          <Button to={firstUnansweredStep(applicationData) ?? '/finance'} className="mt-6">
            {resultCleared ? t('res.changedButton') : isStarted(applicationData) ? t('res.finish') : t('res.start')}
          </Button>
        </section>
      ) : (
        <>
          <section className="ui-card mt-8 sm:p-8">
            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-soft)] text-3xl" aria-hidden="true">
                💡
              </div>
              <div className="min-w-0">
                <p className="ui-eyebrow">{t('ad.takeaway')}</p>
                <h2 className="mt-1 text-2xl font-extrabold text-[var(--color-text)]">
                  {businessRecommendation(feasibility, t)}
                </h2>
                {/* Backend prose, and it IS translated now — the services send a
                    code beside every sentence and bt.observations/bt.advice
                    resolve it. What is not translated is a sentence with no code,
                    which falls back to the English the backend sent rather than
                    to a dotted key name. */}
                <p className="mt-2 leading-7 text-[var(--color-text-muted)]">
                  {observations[0] || recommendations[0] || t('ad.reviewSteps')}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            <AdvisoryCard
              icon="💼"
              title={t('ad.business')}
              value={statusText(feasibility, t)}
              description={businessDescription(feasibility, t)}
            />
            {/* No heading above the coins, matching /analysis as of 8 Sept 2026
                — `ch.coinTitle` ("Out of every 10 rupees you earn") read as a
                sentence fragment that `ch.coinLabel` below it then completed, so
                the two lines said one thing twice. UnitChart renders `label`
                visibly and takes its accessible name from `ariaLabel`, so the
                chart is still labelled without it. */}
            <AdvisoryCard
              icon="💰"
              title={t('ad.money')}
              value={statusText(financialStatus, t)}
              description={financialDescription(monthlyProfit, profitMargin, t)}
              chart={marginCoins === null ? null : (
                <div className="mt-2">
                  <UnitChart
                    filled={marginCoins}
                    total={10}
                    icon="🪙"
                    label={t('ch.coinLabel', { n: marginCoins })}
                    ariaLabel={t('ch.coinLabel', { n: marginCoins })}
                  />
                </div>
              )}
            />
            <AdvisoryCard
              icon="🛡️"
              title={t('money.risk')}
              value={riskText(riskLevel, t)}
              description={riskDescription(riskLevel, repaymentPressure, risk?.household_check, t)}
            />
            <AdvisoryCard
              icon="🏛️"
              title={t('an.govHeading')}
              value={t('an.matches', { n: schemes.length })}
              description={schemes.length > 0 ? t('ad.schemesWorth') : t('ad.noScheme')}
            />
          </section>

          <section className="ui-card mt-6 sm:p-8">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="ui-eyebrow">{t('ad.planEyebrow')}</p>
                <h2 className="mt-1 text-2xl font-bold text-[var(--color-text)]">{t('ad.planTitle')}</h2>
              </div>
              <span className="shrink-0 text-2xl" aria-hidden="true">👇</span>
            </div>

            <div className="mt-6 space-y-4">
              {recommendations.length > 0 ? recommendations.slice(0, 5).map((recommendation, index) => (
                <ActionItem key={index} number={index + 1} text={recommendation} />
              )) : (
                <>
                  <ActionItem number={1} text={t('ad.step1')} />
                  <ActionItem number={2} text={t('ad.step2')} />
                  <ActionItem number={3} text={t('ad.step3')} />
                  <ActionItem number={4} text={t('ad.step4')} />
                </>
              )}
            </div>
          </section>

          <FinancingOptions section={result.financing_options} t={t} />

          {/* Only on a build with the helper on, and only for a result whose answers
              were kept: the plan is written for those answers. */}
          {DEPLOYMENT.aiHelper && applicationData.request && <PlanWriter />}

          <details className="ui-disclosure mt-6">
            <summary>{t('ad.details')}</summary>
            <div className="ui-disclosure-body space-y-5">
              {financial && (
                <DetailBlock title={t('ad.finPosition')}>
                  {/* Each translated string is its own line. Appending a Latin
                      full stop to a translated label composes punctuation in
                      code, and Devanagari ends a sentence with । not . */}
                  <p>{statusText(financialStatus, t)}</p>
                  {hasNumber(monthlyProfit) && (
                    <p className="mt-1">{t('ad.finLeft', { amount: formatCurrency(monthlyProfit, t) })}</p>
                  )}
                  {hasNumber(profitMargin) && (
                    <p className="mt-1">{t('ad.marginIs', { value: formatPercent(profitMargin, t) })}</p>
                  )}
                </DetailBlock>
              )}
              {business && (
                <DetailBlock title={t('ad.canWork')}>
                  <p>{statusText(feasibility, t)}</p>
                </DetailBlock>
              )}
              {risk && (
                <DetailBlock title={t('ad.repayRisk')}>
                  <p>{riskText(riskLevel, t)}</p>
                  {hasNumber(repaymentPressure) && (
                    <p className="mt-1">{t('ad.pressureIs', { value: formatPercent(repaymentPressure, t) })}</p>
                  )}
                  {/* pressure_ratio_percent is null when the monthly surplus is
                      not positive. A zero-length bar would read as "no pressure",
                      the most reassuring possible misreading, so the backend's own
                      reason sentence is printed instead of a chart. */}
                  {hasNumber(repaymentPressure) ? (
                    <div className="mt-3">
                      <BarRow
                        label={t('f.emiPressure')}
                        icon="⚖️"
                        valueText={formatPercent(repaymentPressure, t)}
                        fraction={Number(repaymentPressure) / 100}
                        tone={pressureTone(repaymentPressure)}
                        marks={[{ at: 0.3 }, { at: 0.5 }]}
                      />
                      <p className="ui-chart-caption">{t('ch.pressureCaption')}</p>
                      {newLoanNote && <p className="ui-chart-caption">{newLoanNote}</p>}
                    </div>
                  ) : (
                    riskReason && <p className="mt-3">{riskReason}</p>
                  )}
                </DetailBlock>
              )}
              {/* The same loan payments as above, against the household's income
                  instead of the business surplus. Same content as /analysis. */}
              {hasHouseholdCheck(risk) && (
                <DetailBlock title={t('ch.householdTitle')}>
                  <HouseholdCheck risk={risk} t={t} bt={bt} termsShownAbove={hasNumber(repaymentPressure) && Boolean(newLoanNote)} />
                </DetailBlock>
              )}
              {observations.length > 0 && (
                <DetailBlock title={t('an.noticed')}>
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
        <Button to="/schemes" variant="secondary" size="lg" className="w-full">
          <span aria-hidden="true">🏛️</span> {t('ad.reviewSchemes')}
        </Button>
        <Button to="/report" size="lg" className="w-full">
          <span aria-hidden="true">📄</span> {t('ad.makeReport')}
        </Button>
      </div>

      <p className="mt-5 text-center text-xs leading-5 text-[var(--color-text-muted)]">
        {t('ad.disclaimer')}
      </p>
    </>
  )
}

function AdvisoryCard({ icon, title, value, description, chart }) {
  return (
    <article className="ui-card">
      <div className="flex min-w-0 items-start gap-4">
        <div className="ui-feature-icon shrink-0" aria-hidden="true">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-muted)]">{title}</p>
          <p className="mt-1 text-xl font-extrabold text-[var(--color-text)]">{value}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
          {chart && <div className="mt-4">{chart}</div>}
        </div>
      </div>
    </article>
  )
}

function ActionItem({ number, text, children }) {
  return (
    <div className="flex min-w-0 items-start gap-4 rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] font-extrabold text-[var(--color-primary-strong)]">
        {number}
      </div>
      <p className="min-w-0 flex-1 break-words pt-1 leading-7 text-[var(--color-text)]">{children ?? (typeof text === 'string' ? text : JSON.stringify(text))}</p>
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

// How much of the money still needed could be borrowed, and over how long. Every
// figure comes from `financing_options`, which the backend prices with the same
// function as the loan pressure on this page, so a card cannot disagree with it.
// A status this build does not know draws nothing, never a raw code, and neither
// does a result stored before the section existed.
const NO_LOAN_KEYS = {
  no_surplus: 'fo.noSurplus',
  household_over_limit: 'fo.householdOver',
  no_room: 'fo.noRoom',
}

function FinancingOptions({ section, t }) {
  const status = section?.status
  const options = Array.isArray(section?.options) ? section.options : []
  const hasOptions = (status === 'covered' || status === 'partial') && options.length > 0
  const reasonKey = NO_LOAN_KEYS[status]
  if (!hasOptions && !reasonKey) return null

  const bestCode = section.recommended_by_rules
  return (
    <section className="ui-card mt-6 sm:p-8">
      <p className="ui-eyebrow">{t('fo.eyebrow')}</p>
      <h2 className="mt-1 text-2xl font-bold text-[var(--color-text)]">{t('fo.title')}</h2>

      {hasOptions ? (
        <>
          <p className="mt-3 leading-7 text-[var(--color-text-muted)]">
            {t(status === 'covered' ? 'fo.coveredIntro' : 'fo.partialIntro', { gap: formatCurrency(section.funding_gap, t) })}
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {options.map((option) => (
              <OptionCard key={option.code} option={option} best={option.code === bestCode} t={t} />
            ))}
          </div>
          {status === 'partial' && <p className="mt-5 leading-7 text-[var(--color-text)]">{t('fo.partialRest')}</p>}
          {hasNumber(section.assumed_interest_rate_percent) && (
            <p className="ui-chart-caption">{t('fo.assumption', { rate: section.assumed_interest_rate_percent })}</p>
          )}
          <details className="ui-disclosure mt-5">
            <summary>{t('fo.how')}</summary>
            <div className="ui-disclosure-body space-y-3">
              <p>{t('fo.howText')}</p>
              {section.household_checked === true && <p>{t('fo.howHousehold')}</p>}
              {bestCode && <p>{t('fo.howBest')}</p>}
            </div>
          </details>
        </>
      ) : (
        <p className="mt-3 leading-7 text-[var(--color-text-muted)]">{t(reasonKey)}</p>
      )}
    </section>
  )
}

// Both borders are 2px wide so the cards in a row stay the same size; only the
// colour marks the one the rules recommend. The verdict (what is still needed, or
// the badge on the recommended card) is the last line, so every row above it
// lines up across the cards in a row.
function OptionCard({ option, best, t }) {
  const stillNeeded = hasNumber(option.remaining_gap) && Number(option.remaining_gap) > 0
  return (
    <article
      className={
        'min-w-0 rounded-xl border-2 p-4 ' +
        (best ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]')
      }
    >
      <h3 className="text-base font-extrabold text-[var(--color-text)]">
        {t('fo.term', { months: option.tenure_months })}
      </h3>
      <dl className="mt-3 space-y-2 text-sm">
        <OptionRow label={t('fo.loan')} value={formatCurrency(option.loan_amount, t)} />
        <OptionRow label={t('fo.perMonth')} value={formatCurrency(option.monthly_repayment, t)} />
        <OptionRow label={t('fo.totalBack')} value={formatCurrency(option.total_repayment, t)} />
        <OptionRow label={t('fo.interest')} value={formatCurrency(option.total_interest, t)} />
      </dl>
      {hasNumber(option.pressure_ratio_percent) && (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          {t('ad.pressureIs', { value: formatPercent(option.pressure_ratio_percent, t) })}
        </p>
      )}
      {hasNumber(option.household_repayment_percent) && (
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {t('ch.householdPercent', { percent: formatPercent(option.household_repayment_percent, t) })}
        </p>
      )}
      {stillNeeded && (
        <p className="mt-3 text-sm font-bold text-[var(--color-text)]">
          {t('fo.stillNeeded', { amount: formatCurrency(option.remaining_gap, t) })}
        </p>
      )}
      {best && (
        <p className="mt-3 w-fit rounded-xl border border-[var(--color-primary)] bg-[var(--color-surface-soft)] px-3 py-1 text-sm font-bold text-[var(--color-primary-strong)]">
          {t('fo.best')}
        </p>
      )}
    </article>
  )
}

function OptionRow({ label, value }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="min-w-0 text-[var(--color-text-muted)]">{label}</dt>
      <dd className="whitespace-nowrap font-bold text-[var(--color-text)]">{value}</dd>
    </div>
  )
}

// The optional plan, written by an AI service run by Meta in the reader's language.
// What is sent is a short description with no figure, name or place in it, and the
// words below say so. The reply is words around blanks: the backend fills the blanks
// from the fixed rules and refuses a plan that breaks its checks, so a figure or a name
// on screen is one the rules produced. Nothing is sent before the tick, and the advice
// above stands without the plan.
function PlanWriter() {
  const { applicationData, setPlan } = useApp()
  const { t, language } = useI18n()
  const { request, plan } = applicationData

  // Given for what is sent from here, so it lives in this component and nowhere else,
  // and it is unticked again after every plan.
  const [consent, setConsent] = useState(false)
  const [consentMissing, setConsentMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  // A plan.err* code, not a sentence, so it follows a change of language.
  const [error, setError] = useState('')
  const consentRef = useRef(null)
  const requestRef = useRef(null)
  const headingRef = useRef(null)
  const justWritten = useRef(false)

  // Leaving the page abandons the request in flight.
  useEffect(() => () => requestRef.current?.abort(), [])

  // A keyboard or a screen reader lands on a plan that has just been written, and not
  // on one that was already there when the page opened.
  useEffect(() => {
    if (plan && justWritten.current) {
      justWritten.current = false
      headingRef.current?.focus()
    }
  }, [plan])

  async function write() {
    if (requestRef.current) return
    setConsentMissing(!consent)
    if (!consent) {
      consentRef.current?.focus()
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setBusy(true)
    setError('')
    try {
      const written = await requestPlan(request, language, true, { signal: controller.signal })
      justWritten.current = true
      setPlan(written, request)
      setConsent(false)
    } catch (failure) {
      if (!isAbortError(failure)) setError(failure.code ?? 'plan.errGeneric')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setBusy(false)
      }
    }
  }

  const writtenIn = plan ? LANGUAGES.find((entry) => entry.code === plan.language) : null
  const ownLanguage = LANGUAGES.find((entry) => entry.code === language)

  return (
    <section className="ui-card mt-6 sm:p-8">
      <p className="ui-eyebrow">{t('plan.eyebrow')}</p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-[var(--color-text)]">{t('plan.title')}</h2>

      {plan ? (
        <>
          <p className="ui-notice mt-4">{t('plan.aiLabel')}</p>
          {writtenIn && plan.language !== language && (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t('plan.otherLanguage', { language: writtenIn.endonym })}</p>
          )}

          <p className="mt-4 leading-7 text-[var(--color-text)]">
            <PlanLine segments={plan.summary} lang={plan.language} />
          </p>

          <h3 className="mt-6 text-lg font-bold text-[var(--color-text)]">{t('plan.stepsTitle')}</h3>
          <ol className="mt-3 space-y-4">
            {plan.steps.map((step, index) => (
              <li key={index}>
                <ActionItem number={index + 1}>
                  <PlanLine segments={step} lang={plan.language} />
                </ActionItem>
              </li>
            ))}
          </ol>

          {plan.cautions.length > 0 && (
            <>
              <h3 className="mt-6 text-lg font-bold text-[var(--color-text)]">{t('plan.cautionsTitle')}</h3>
              <ul className="mt-3 space-y-2 leading-7 text-[var(--color-text)]">
                {plan.cautions.map((caution, index) => (
                  <li key={index}>• <PlanLine segments={caution} lang={plan.language} /></li>
                ))}
              </ul>
            </>
          )}
          <p className="ui-notice ui-notice-warn mt-4 font-semibold">{t('plan.fixedCaution')}</p>

          <details className="ui-disclosure mt-5">
            <summary>{t('plan.how')}</summary>
            <div className="ui-disclosure-body space-y-3">
              <p>{t('plan.howText')}</p>
              <p>{t('plan.howLimit')}</p>
            </div>
          </details>
        </>
      ) : (
        <p className="mt-3 leading-7 text-[var(--color-text-muted)]">{t('plan.intro')}</p>
      )}

      <div className={plan ? 'mt-6 border-t border-[var(--color-border)] pt-6' : 'mt-5'}>
        <p className="leading-7 text-[var(--color-text)]">{t('plan.sendsText')}</p>
        <div className="mt-4">
          <label className="ui-check">
            <input
              ref={consentRef}
              type="checkbox"
              id="plan-consent"
              name="plan-consent"
              checked={consent}
              disabled={busy}
              onChange={(event) => {
                setConsent(event.target.checked)
                setConsentMissing(false)
              }}
              aria-required="true"
              aria-invalid={consentMissing || undefined}
              aria-describedby={consentMissing ? 'plan-consent-error' : undefined}
            />
            <span>
              {t('plan.consent')}
              <span className="ui-required" aria-hidden="true">*</span>
            </span>
          </label>
          {consentMissing && (
            <p id="plan-consent-error" role="alert" className="ui-notice ui-notice-danger mt-3 font-bold text-[var(--color-danger)]">
              {t('talk.consentRequired')}
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="ui-notice ui-notice-danger mt-4 font-semibold text-[var(--color-danger)]">
            {t(error)}
          </div>
        )}

        {/* Always in the page, so the first message is announced. */}
        <div role="status" className={busy ? 'ui-notice mt-4 font-semibold' : 'sr-only'}>
          {busy ? t('plan.writing') : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button size="lg" onClick={write} disabled={busy} className="w-full sm:w-auto">
            {plan ? t('plan.again', { language: ownLanguage.endonym }) : t('plan.write')}
          </Button>
          {busy && (
            <Button variant="secondary" size="lg" onClick={() => requestRef.current?.abort()}>
              {t('talk.cancel')}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

// One line of the plan: the AI's words as it wrote them, and each figure or name the
// fixed rules put into a blank, in bold. `lang` is the language the plan was written in.
function PlanLine({ segments, lang }) {
  return (
    <span lang={lang}>
      {segments.map((part, index) =>
        part.t === 'fill' ? <strong key={index}>{part.v}</strong> : <span key={index}>{part.v}</span>,
      )}
    </span>
  )
}

// The household check — see the longer note on HouseholdCheck in AnalysisPage.
// Same lines in the same order, so the two pages cannot describe one check two
// ways. It is an estimate, never a lender's decision: within the limit is drawn
// neutral rather than green, and no line says anyone is eligible or will lend.
function HouseholdCheck({ risk, t, bt, termsShownAbove }) {
  const check = String(risk.household_check).trim()
  if (check === 'not_checked') {
    return <p>{t('ch.householdNotChecked', { step: t('nav.finance') })}</p>
  }
  const percent = risk.household_repayment_percent
  const limit = risk.household_limit_percent
  const limitText = hasNumber(limit) ? Number(limit).toLocaleString('en-IN') : null
  const key = HOUSEHOLD_KEYS[check.toLowerCase()]
  const label = key && limitText ? t(key, { limit: limitText }) : titleCaseEnum(check)
  const isOver = check.toLowerCase() === 'over_limit'
  const reason = bt.householdReason(risk)
  const newLoanNote = householdLoanNote(risk, t, termsShownAbove)
  const rbiNote = householdRbiNote(risk, limitText, t)
  return (
    <>
      <p className={`font-bold ${isOver ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>{label}</p>
      {hasNumber(percent) ? (
        <>
          <p className="mt-1">{t('ch.householdPercent', { percent: formatPercent(percent, t) })}</p>
          <div className="mt-3">
            <BarRow
              label={t('ch.householdBar')}
              icon="🏠"
              valueText={formatPercent(percent, t)}
              fraction={Number(percent) / 100}
              tone={isOver ? 'bad' : 'neutral'}
              marks={limitText ? [{ at: Number(limit) / 100 }] : []}
            />
            {limitText && <p className="ui-chart-caption">{t('ch.householdCaption', { limit: limitText })}</p>}
          </div>
        </>
      ) : (
        reason && <p className="mt-1">{reason}</p>
      )}
      {newLoanNote && <p className="ui-chart-caption">{newLoanNote}</p>}
      <p className="ui-chart-caption">{t('ch.householdEstimate')}</p>
      {rbiNote && <p className="mt-3">{rbiNote}</p>}
    </>
  )
}

// household_check is a backend enum, like risk_level. not_checked has its own
// sentence and is handled before this map is read; an unknown value title-cases.
const HOUSEHOLD_KEYS = { within_limit: 'ch.householdWithin', over_limit: 'ch.householdOver' }

// A response written before the household check existed has no household_check
// at all, and then nothing is drawn rather than an empty heading.
function hasHouseholdCheck(risk) {
  const check = risk?.household_check
  return check !== undefined && check !== null && String(check).trim() !== ''
}

// The full sentence carries the assumed rate and tenure; the short one is used
// where the pressure chart has just printed them, or where the response did not
// send them. The short one says on its own that the amount is our estimate
// rather than pointing back at a chart that may not be on the page. Same as
// AnalysisPage.
function householdLoanNote(risk, t, termsShownAbove) {
  const newLoanEmi = risk.estimated_new_emi
  if (!hasNumber(newLoanEmi) || Number(newLoanEmi) <= 0) return null
  const amount = formatCurrency(newLoanEmi, t)
  const hasTerms = hasNumber(risk.assumed_interest_rate_percent) && hasNumber(risk.assumed_tenure_months)
  if (termsShownAbove || !hasTerms) return t('ch.householdIncludesNewShort', { amount })
  return t('ch.householdIncludesNew', {
    amount,
    rate: risk.assumed_interest_rate_percent,
    years: Number(risk.assumed_tenure_months) / 12,
  })
}

// Printed only on a strict true or false; null means the backend could not tell.
function householdRbiNote(risk, limitText, t) {
  const incomeLimit = risk.household_microfinance_income_limit
  if (!hasNumber(incomeLimit) || !limitText) return null
  const values = { income: formatCurrency(incomeLimit, t), limit: limitText }
  if (risk.household_in_microfinance_range === true) return t('ch.householdRbiCovered', values)
  if (risk.household_in_microfinance_range === false) return t('ch.householdRbiNotCovered', values)
  return null
}

// The advice sentences. These are our own copy, not backend prose, so every
// branch resolves to a key and the numbers are composed into the templates
// rather than concatenated into an English sentence.
// feasibility_status has THREE documented values, and break_even used to fall
// through to the unknown arm — so a business the backend had analysed perfectly
// well was told "we do not have enough information for a clear answer". It is
// also the most common shape for a real micro-enterprise and the one where advice
// is worth the most, since it is a few hundred rupees either side of a profit.
// The unknown arm is now reserved for a value we genuinely do not recognise.
function businessRecommendation(feasibility, t) {
  if (feasibility === 'feasible') return t('ad.feasibleTitle')
  if (feasibility === 'break_even') return t('ad.breakEvenTitle')
  if (feasibility === 'not_feasible') return t('ad.notFeasibleTitle')
  return t('ad.unknownTitle')
}

function businessDescription(feasibility, t) {
  if (feasibility === 'feasible') return t('ad.feasibleDesc')
  if (feasibility === 'break_even') return t('ad.breakEvenDesc')
  if (feasibility === 'not_feasible') return t('ad.notFeasibleDesc')
  return t('ad.unknownDesc')
}

function financialDescription(profit, margin, t) {
  if (!hasNumber(profit)) return t('ad.finReview')
  const left = t('ad.finLeft', { amount: formatCurrency(profit, t) })
  if (!hasNumber(margin)) return left
  return left + ' ' + t('ad.marginIs', { value: formatPercent(margin, t) })
}

// "Your loan payment looks manageable" is about the money the business leaves
// each month. When the same payments take more than half of the household's
// income, that sentence would say the opposite of the household check printed
// below it, so the low band gets a sentence that says both. Moderate and high
// already warn against new borrowing, which the household check agrees with.
function riskDescription(level, pressure, householdCheck, t) {
  const householdOver = String(householdCheck ?? '').trim().toLowerCase() === 'over_limit'
  const base = level === 'low' && householdOver ? t('ad.riskLowHouseholdOver') : riskAdvice(level, t)
  if (!hasNumber(pressure)) return base
  return base + ' ' + t('ad.pressureIs', { value: formatPercent(pressure, t) })
}

function riskAdvice(level, t) {
  if (level === 'low') return t('ad.riskLowDesc')
  if (level === 'moderate') return t('ad.riskModDesc')
  if (level === 'high') return t('ad.riskHighDesc')
  return t('ad.riskUnknownDesc')
}

// 30% and 50% are the same bands the backend uses for risk_level, so the bar
// colour and the risk word can never disagree.
function pressureTone(pressure) {
  const value = Number(pressure)
  if (value > 50) return 'bad'
  if (value >= 30) return 'warn'
  return 'good'
}

// Backend enums stay English because they are load-bearing; they are turned
// into plain language only at render, and an unknown value still prints.
const STATUS_KEYS = {
  profitable: 'st.profitable', break_even: 'st.break_even', loss: 'st.loss',
  feasible: 'st.feasible', not_feasible: 'st.not_feasible',
  good: 'st.good', attention_needed: 'st.attention_needed', review: 'st.review',
}

function statusText(value, t) {
  if (value === undefined || value === null || String(value).trim() === '') return t('common.notAvailable')
  const key = STATUS_KEYS[String(value).toLowerCase()]
  if (key) return t(key)
  return titleCaseEnum(value)
}

// Only an enum-shaped value gets title-cased — see the longer note in
// AnalysisPage. Kept byte-identical across the three pages so the same value
// cannot print two ways on two screens.
const ENUM_SHAPED = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

function titleCaseEnum(value) {
  const text = String(value).trim()
  if (!ENUM_SHAPED.test(text)) return text
  return text.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const RISK_KEYS = { low: 'risk.low', moderate: 'risk.moderate', high: 'risk.high' }

function riskText(value, t) {
  const key = RISK_KEYS[String(value || '').toLowerCase()]
  return key ? t(key) : t('risk.unknown')
}

// 'en-IN' grouping with Latin digits is what people read on money in India, so
// the digits stay Latin even when the interface is Tamil or Telugu.
function formatCurrency(value, t) {
  if (!hasNumber(value)) return t('common.notAvailable')
  // Sign before the symbol — see the note in AnalysisPage. Byte-identical there,
  // on /report and on /finance, so one amount cannot print two ways.
  const amount = Number(value)
  return (amount < 0 ? '-₹' : '₹') + Math.abs(amount).toLocaleString('en-IN')
}

function formatPercent(value, t) {
  if (!hasNumber(value)) return t('common.notAvailable')
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '%'
}

// The backend sends null for percentages it could not compute. Number(null) is 0
// and passes Number.isFinite, so guard on the raw value before printing it — a
// missing value must never be rendered as a confident, reassuring zero. A real
// zero still has to print as 0, so this rejects only null, undefined and ''.
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

export default AdvisoryPage

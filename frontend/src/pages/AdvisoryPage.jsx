import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useApp } from '../context/AppContext'
import { BarRow, UnitChart } from '../components/Charts'
import { useI18n } from '../i18n/LanguageContext'
import { useBackendText } from '../i18n/backendText'

function AdvisoryPage() {
  const { applicationData } = useApp()
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
          <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]">{t('ad.notReady')}</h2>
          <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--color-text-muted)]">
            {t('res.notReadyText')}
          </p>
          <Button to="/finance" className="mt-6">{t('res.finish')}</Button>
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
              description={riskDescription(riskLevel, repaymentPressure, t)}
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
                    </div>
                  ) : (
                    riskReason && <p className="mt-3">{riskReason}</p>
                  )}
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

function riskDescription(level, pressure, t) {
  const base = riskAdvice(level, t)
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

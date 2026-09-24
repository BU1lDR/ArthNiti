import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { BarGroup, BarRow, UnitChart } from '../components/Charts'
import { schemeFitItems } from '../components/chartData'
import { useI18n } from '../i18n/LanguageContext'
import { useBackendText } from '../i18n/backendText'
import { APP_NAME } from '../i18n/brand'

function AnalysisPage() {
  const { applicationData } = useApp()
  const { t } = useI18n()
  // Turns the code fields on the response into the chosen language. Falls back to
  // the English sentence the backend sent, never to a dotted code.
  const bt = useBackendText()
  const result = applicationData.result

  if (!result) {
    return (
      <div className="mx-auto max-w-3xl">
        <section className="ui-card p-5 text-center sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-3xl" aria-hidden="true">
            📋
          </div>
          <h1 className="mt-5 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
            {t('res.notReady')}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">
            {t('res.notReadyText')}
          </p>
          <Button to="/profile" className="mt-6">{t('res.start')}</Button>
        </section>
      </div>
    )
  }

  const financial = result.financial_analysis || {}
  const risk = result.risk_analysis || {}
  const business = result.business_analysis || {}
  const advisory = result.advisory || {}
  const summary = result.mvp_summary || {}
  const recommendations = bt.advice(advisory)
  const observations = bt.observations(business)
  const riskReason = bt.riskReason(risk)
  const schemes = Array.isArray(result.scheme_matches) ? result.scheme_matches : []
  const market = Array.isArray(result.market_context) ? result.market_context : []

  // "We were not told" and "the answer is zero" are two different things, and two
  // cards on this page used to print the first when it was the second.
  //
  // The investment field on /business is `required`, so a missing figure is close
  // to unreachable — a null ROI almost always means the user typed a real 0, which
  // is the ordinary case for someone already trading who plans no new spend. The
  // health card then read "Add the money you will put in to see this" while this
  // same page printed "Money put in  ₹0" and "Money still needed  ₹0" a few
  // hundred pixels below it: instructed to fill in a field they had filled in,
  // with no way to clear the instruction except by entering a figure that is not
  // true. Both sections echo the same request field, so either will do.
  const plannedInvestment = financial.initial_investment ?? business.initial_investment
  const noInvestment = hasNumber(plannedInvestment) && Number(plannedInvestment) === 0

  const roiDescription = hasNumber(business.estimated_roi_percent)
    ? t('an.roiWith', { value: formatPercent(business.estimated_roi_percent, t) })
    : noInvestment
      ? t('an.roiNoInvestment')
      : t('an.roiMissing')

  // The status enums stay English in the code because they decide which branch
  // runs; only the printed label goes through the translation table. The only
  // two values the contract can send here are mvp_summary.status
  // (good | attention_needed | review) and, as a fallback,
  // business_analysis.feasibility_status (feasible | break_even |
  // not_feasible). Anything else — including a missing status — gets the
  // warning mark rather than a reassuring tick.
  const status = String(summary.status || business.feasibility_status || '').toLowerCase()
  const isPositive = status === 'good' || status === 'feasible'
  const headline = bt.summaryMessage(summary) || statusText(status, t)

  // One bar per value that the backend could actually compute. A null must not
  // become a zero-length bar sitting next to "Not available".
  const moneyBar = (label, icon, value, tone) => (
    hasNumber(value)
      ? [{ label, icon, value: Number(value), valueText: formatCurrency(value, t), tone }]
      : []
  )

  const monthlyProfit = financial.monthly_profit
  // The icon tracks the sign, the same way the tone already does. It was the
  // literal '💚' whichever way the month went, so a shortfall rendered as
  // "💚 Money left each month  ₹-10,000" — and for a low-literacy reader the icon
  // is the fastest-read thing in the row, saying the opposite of the figure beside
  // it. BarRow puts it in an aria-hidden span, so no accessible name changes.
  const profitIsPositive = Number(monthlyProfit) > 0
  // Strictly negative, and only on a figure we actually have: a missing value
  // must not be captioned as a shortfall, and an exact ₹0 is break-even, not a
  // shortfall. (The chart tone above treats 0 as bad, which is right there and
  // matches risk_service short-circuiting a non-positive surplus to high risk.)
  const isShortfall = hasNumber(monthlyProfit) && Number(monthlyProfit) < 0
  const inOutItems = [
    ...moneyBar(t('f.income'), '📥', financial.expected_monthly_revenue, 'neutral'),
    ...moneyBar(t('f.spending'), '📤', financial.monthly_expenses, 'warn'),
    ...moneyBar(t('f.profit'), profitIsPositive ? '💚' : '💔', monthlyProfit, profitIsPositive ? 'good' : 'bad'),
  ]

  // funding_gap is clamped at zero on the backend, so a zero is not a missing
  // number — it means the planned investment is already covered. "Extra money
  // you may need to arrange" printed next to ₹0 reads as a contradiction.
  const fundingGap = financial.funding_gap
  // And the same distinction on this card: "You have enough of your planned
  // investment" is vacuous when the planned investment is zero, because there is
  // nothing to have enough of.
  const gapIsCovered = hasNumber(fundingGap) && Number(fundingGap) <= 0
  const gapDescription = !gapIsCovered
    ? t('an.needDesc')
    : noInvestment
      ? t('money.noneNeeded')
      : t('money.enough')

  const fundItems = [
    ...moneyBar(t('ch.required'), '🎯', financial.initial_investment, 'neutral'),
    ...moneyBar(t('ch.inHand'), '👛', financial.available_capital, 'neutral'),
    ...moneyBar(t('ch.missing'), '📌', fundingGap, Number(fundingGap) > 0 ? 'warn' : 'good'),
  ]

  // pressure_ratio_percent is null whenever the monthly surplus is not positive,
  // and in that case risk_level is already 'high'. Drawing a bar from the null
  // would read as no pressure at all, the exact opposite of the truth.
  const pressure = risk.pressure_ratio_percent
  const pressureTone = !hasNumber(pressure)
    ? 'bad'
    : Number(pressure) > 50
      ? 'bad'
      : Number(pressure) >= 30
        ? 'warn'
        : 'good'

  // When the plan needs more money than the entrepreneur has, risk_service
  // prices that gap as a new loan and counts its payment in the pressure figure.
  // The reader has to be told, or "Loan pressure" reads as being about a loan
  // they never mentioned. The assumed rate and tenure are printed beside it
  // because they are an assumption, not a quote.
  const newLoanEmi = risk.estimated_new_emi
  const hasNewLoan = hasNumber(newLoanEmi) && Number(newLoanEmi) > 0
  const newLoanNote = hasNewLoan
    ? t('ch.pressureIncludesNew', {
        rate: risk.assumed_interest_rate_percent,
        years: Number(risk.assumed_tenure_months) / 12,
      })
    : null

  // profit_margin_percent is null when there is no revenue to divide by, which is
  // financial_service saying "could not compute" rather than "zero" — it used to
  // return a real 0 there, and this guard was written against that. It is kept
  // now that the backend is honest, for two reasons: Number(null) is 0 and
  // *passes* Number.isFinite, so the guard is what stops a null becoming a
  // confident "0%" with ten empty coins beside it — as though "nothing stays with
  // you out of every ten rupees" had been measured when nothing was measured at
  // all. And it holds the line if an older cached response, or a second caller
  // that still divides by zero itself, sends the 0 back. A real 0% margin on real
  // revenue is a genuine finding and must still print 0% and draw the ten empty
  // coins, which is why the test is on the revenue and not on the margin.
  const hasRevenue = hasNumber(financial.expected_monthly_revenue)
    && Number(financial.expected_monthly_revenue) > 0
  const margin = hasRevenue ? financial.profit_margin_percent : null
  const coins = hasNumber(margin)
    ? Math.min(10, Math.max(0, Math.round(Number(margin) / 10)))
    : 0

  // Grouped by fit basis (your state alone / a few states including yours / all
  // of India), and gated by the helper returning an empty list. This page used
  // to draw one bar per scheme with no gate at all, while /schemes computed the
  // same chart behind a gate written precisely to stop it — so the demo path
  // rendered 16 bars of two lengths here, and a category where every match was
  // nationwide rendered a dozen identical full-length bars reading as a perfect
  // fit for every one of them. Both pages now call the one helper.
  const fitItems = schemeFitItems(schemes, t)

  return (
    <>
      {/* The arrow is decoration on a link that already says where it goes;
          left bare a screen reader announces "leftwards arrow Back to your
          money". Every other page already hides it — see SchemesPage. */}
      <Link to="/finance" className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline">
        <span aria-hidden="true">←</span> {t('res.backFinance')}
      </Link>

      <header className="ui-page-intro">
        {/* The emoji decorates the eyebrow; announcing it would read as
            "chart increasing Your result". */}
        <p className="ui-eyebrow"><span aria-hidden="true">📊</span> {t('an.eyebrow')}</p>
        <h1 className="ui-page-title">{t('an.title')}</h1>
        <p className="ui-page-subtitle">{t('an.subtitle')}</p>
      </header>

      <section className="ui-card mt-8 overflow-hidden p-5 sm:p-8">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-3xl" aria-hidden="true">{isPositive ? '✅' : '⚠️'}</span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${isPositive ? 'border-[var(--color-primary)] bg-[var(--color-surface-soft)] text-[var(--color-primary-strong)]' : 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-[var(--color-text)]'}`}>
                {statusText(status, t)}
              </span>
            </div>
            {/* simple_message and next_step are written by the Python services,
                which send a translatable code beside each one. `bt` prefers the
                code and falls back to the English sentence. */}
            <h2 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">
              {headline}
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--color-text-muted)]">
              {bt.nextStep(summary) || t('an.nextSub')}
            </p>
          </div>
          {/* The largest figure on the page, and it can be negative. It used to
              print a shortfall in the same weight and the same colour as a
              profit, under the same "Money left each month" label — the exact
              favourable misreading the BarGroup forty lines below refuses to
              draw a bar for. Three cues now agree: the label names a shortfall,
              the figure is red, and the sign leads (-₹10,000, not ₹-10,000).
              Exactly ₹0 is not a shortfall and keeps the ordinary label. */}
          <div className="rounded-2xl bg-[var(--color-surface-soft)] p-5 text-center lg:min-w-52">
            <p className="text-sm font-semibold text-[var(--color-text-muted)]">
              {isShortfall ? t('money.shortfall') : t('money.left')}
            </p>
            <p className={`mt-1 text-3xl font-bold ${isShortfall ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>
              {formatCurrency(monthlyProfit, t)}
            </p>
            {/* monthly_profit is expected_monthly_revenue − monthly_expenses and
                nothing else: the EMI is a separate input, and risk_service
                divides the EMI *by* this figure. So it must not be captioned
                "after the loan payment" (an.afterEmi / money.afterExpenses both
                say that and both overstate what is left). Until a key exists for
                "after your monthly spending", the two existing labels spell the
                subtraction out, which is accurate in every language. */}
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {t('f.income')} − {t('f.spending')}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon="💰" title={t('money.needed')} value={formatCurrency(fundingGap, t)} description={gapDescription} />
        <MetricCard icon="📈" title={t('money.margin')} value={formatPercent(margin, t)} description={t('an.marginDesc')} />
        <MetricCard icon="🛡️" title={t('money.risk')} value={riskText(risk.risk_level, t)} description={riskReason || t('an.riskDesc')} />
        <MetricCard icon="🏪" title={t('an.health')} value={statusText(business.feasibility_status, t)} description={roiDescription} />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="ui-card min-w-0 p-5 sm:p-8">
          <SectionHeading icon="💵" title={t('an.moneyHeading')} subtitle={t('an.moneySub')} />

          {hasNumber(financial.expected_monthly_revenue) && inOutItems.length > 0 && (
            <div className="mt-6">
              <ChartTitle title={t('ch.inOut')} />
              <BarGroup items={inOutItems} caption={t('ch.inOutCaption')} />
            </div>
          )}

          <div className="mt-6 space-y-4">
            <DetailRow label={t('f.haveMoney')} value={formatCurrency(financial.available_capital, t)} />
            <DetailRow label={t('f.income')} value={formatCurrency(financial.expected_monthly_revenue, t)} />
            <DetailRow label={t('f.spending')} value={formatCurrency(financial.monthly_expenses, t)} />
            <DetailRow label={t('f.profit')} value={formatCurrency(monthlyProfit, t)} />
            {hasNewLoan && <DetailRow label={t('an.newLoanEmi')} value={formatCurrency(newLoanEmi, t)} />}
            <DetailRow label={t('f.emiPressure')} value={formatPercent(pressure, t)} />
          </div>

          {hasNumber(financial.initial_investment) && fundItems.length > 0 && (
            <div className="mt-7 border-t border-[var(--color-border)] pt-6">
              <ChartTitle title={t('ch.fundTitle')} />
              <BarGroup items={fundItems} caption={t('ch.fundCaption')} />
            </div>
          )}

          <div className="mt-7 border-t border-[var(--color-border)] pt-6">
            <ChartTitle title={t('ch.pressureTitle')} />
            {hasNumber(pressure) ? (
              <>
                <BarRow
                  label={t('f.emiPressure')}
                  icon="⚖️"
                  valueText={formatPercent(pressure, t)}
                  fraction={Number(pressure) / 100}
                  tone={pressureTone}
                  marks={[{ at: 0.3 }, { at: 0.5 }]}
                />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
                  <span>{t('ch.safe')} · 30%</span>
                  <span>{t('ch.heavy')} · 50%</span>
                </div>
                <p className="ui-chart-caption">{t('ch.pressureCaption')}</p>
                {newLoanNote && <p className="ui-chart-caption">{newLoanNote}</p>}
              </>
            ) : (
              // No bar at all when the ratio could not be computed: the backend
              // sentence says why, and it is already the high-risk case.
              <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text)]">
                {riskReason || t('an.riskDesc')}
              </p>
            )}
          </div>
        </div>

        <div className="ui-card min-w-0 p-5 sm:p-8">
          <SectionHeading icon="🏪" title={t('an.bizHeading')} subtitle={t('an.bizSub')} />
          <div className="mt-6 space-y-4">
            <DetailRow label={t('f.workType')} value={choiceText(business.business_type, t)} />
            <DetailRow label={t('f.investment')} value={formatCurrency(business.initial_investment, t)} />
            <DetailRow label={t('f.sales')} value={formatCurrency(business.expected_monthly_revenue, t)} />
            <DetailRow label={t('f.surplus')} value={formatCurrency(business.monthly_operating_surplus, t)} />
            <DetailRow label={t('f.yearReturn')} value={formatPercent(business.estimated_roi_percent, t)} />
          </div>

          {/* Counting coins needs no numeracy. A real 0% margin still draws ten
              empty coins; a negative margin clamps to zero rather than going
              backwards. `margin` is already null when there was no revenue to
              measure a margin against, so the whole chart drops out.

              No <ChartTitle> here, unlike the three charts above, and that is
              deliberate as of 8 Sept 2026 — `ch.coinTitle` ("Out of every 10
              rupees you earn") was removed at the owner's request. It read as a
              sentence fragment that the label below then completed, so the two
              lines together said one thing twice. `ch.coinLabel` is a whole
              sentence on its own and UnitChart renders it visibly, so the chart
              is still labelled. /advisory dropped the same heading later that
              day, so the two pages now agree and `ch.coinTitle` is referenced
              nowhere — it stays in all 8 dictionaries as dead weight rather than
              being deleted, so restoring it is a one-line change if the copy is
              ever wanted back. Don't "restore" it for consistency with the other
              charts on this page. */}
          {hasNumber(margin) && (
            <div className="mt-7 border-t border-[var(--color-border)] pt-6">
              <UnitChart
                filled={coins}
                total={10}
                icon="🪙"
                label={t('ch.coinLabel', { n: coins })}
                ariaLabel={`${t('ch.coinLabel', { n: coins })} — ${formatPercent(margin, t)}`}
              />
            </div>
          )}
        </div>
      </section>

      <section className="ui-card mt-6 p-5 sm:p-8">
        <SectionHeading icon="📍" title={t('an.marketHeading')} subtitle={t('an.marketSub')} />
        {market.length > 0 ? (
          <>
            <div className="mt-5 grid gap-4">
              {market.map((row, index) => <MarketCard key={index} row={row} t={t} bt={bt} />)}
            </div>
            <MarketSources rows={market} t={t} />
          </>
        ) : (
          <p className="mt-5 break-words text-sm leading-6 text-[var(--color-text-muted)]">
            {t('mk.noData')}
          </p>
        )}
      </section>

      <details className="ui-disclosure mt-6">
        <summary><span aria-hidden="true">⚙️</span> {t('an.details')}</summary>
        <div className="ui-disclosure-body grid gap-6 lg:grid-cols-2">
          <div className="ui-card-soft min-w-0 p-5">
            <h2 className="font-bold text-[var(--color-text)]">{t('an.moneyChecks')}</h2>
            <div className="mt-4 space-y-3">
              <DetailRow label={t('f.haveMoney')} value={formatCurrency(financial.available_capital, t)} />
              <DetailRow label={t('f.profit')} value={formatCurrency(monthlyProfit, t)} />
              <DetailRow label={t('f.margin')} value={formatPercent(margin, t)} />
              {hasNewLoan && <DetailRow label={t('an.newLoanEmi')} value={formatCurrency(newLoanEmi, t)} />}
              <DetailRow label={t('f.emiPressure')} value={formatPercent(pressure, t)} />
            </div>
          </div>

          <div className="ui-card-soft min-w-0 p-5">
            <h2 className="font-bold text-[var(--color-text)]">{t('an.bizChecks')}</h2>
            <div className="mt-4 space-y-3">
              <DetailRow label={t('f.investment')} value={formatCurrency(business.initial_investment, t)} />
              <DetailRow label={t('f.bizCosts')} value={formatCurrency(business.monthly_operating_expenses, t)} />
              <DetailRow label={t('f.surplus')} value={formatCurrency(business.monthly_operating_surplus, t)} />
              <DetailRow label={t('f.yearReturn')} value={formatPercent(business.estimated_roi_percent, t)} />
            </div>
          </div>
        </div>
      </details>

      {observations.length > 0 && (
        <section className="ui-card mt-6 p-5 sm:p-8">
          <SectionHeading icon="🔎" title={t('an.noticed')} subtitle={t('an.noticedSub')} />
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
        <SectionHeading icon="🧭" title={t('an.nextHeading')} subtitle={t('an.nextSub')} />
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
          <p className="mt-5 text-sm text-[var(--color-text-muted)]">{t('an.noRecs')}</p>
        )}
      </section>

      <section className="ui-card mt-6 p-5 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionHeading icon="🏛️" title={t('an.govHeading')} subtitle={t('an.govSub')} />
          <span className="inline-flex w-fit shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-1 text-sm font-bold text-[var(--color-text)]">
            {t('an.matches', { n: schemes.length })}
          </span>
        </div>

        {fitItems.length > 0 && (
          <div className="mt-6">
            <ChartTitle title={t('ch.schemeFit')} />
            <BarGroup items={fitItems} caption={t('ch.fitCaption')} />
          </div>
        )}

        {schemes.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {schemes.map((scheme, index) => <SchemeCard key={index} scheme={scheme} t={t} bt={bt} />)}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-[var(--color-surface-soft)] p-5 text-sm leading-6 text-[var(--color-text-muted)]">
            {t('an.noSchemes')}
          </div>
        )}
      </section>

      {/* One element each, not a <Button> wrapped in a <Link>: a <button> inside
          an <a> is invalid, and assistive tech disagrees about which of the two
          nested controls to announce and to activate. */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Button to="/finance" variant="secondary" size="lg" className="w-full">
          <span aria-hidden="true">←</span> {t('an.reviewDetails')}
        </Button>
        <Button to="/schemes" size="lg" className="w-full">{t('an.seeSchemes')}</Button>
        <Button to="/advisory" variant="secondary" size="lg" className="w-full">
          {t('an.seeAdvice')} <span aria-hidden="true">→</span>
        </Button>
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

function ChartTitle({ title }) {
  return (
    <h3 className="mb-3 break-words text-base font-bold text-[var(--color-text)]">{title}</h3>
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

function MarketCard({ row, t, bt }) {
  const context = row.local_context || {}
  // Say plainly whose figures these are. A state-level figure presented as
  // local data would be the wrong kind of confident.
  const provenance = row.match_level === 'district'
    ? t('mk.fromDistrict', { district: formatText(row.district, t) })
    : t('mk.fromState', { state: formatText(row.state, t) })
  // A state row carries district "" by design, so the heading names the place
  // the figure actually describes rather than printing "Not available".
  const place = formatText(row.scope === 'state' ? row.state : row.district, t)
  const isPrice = row.metric === 'wholesale_price_per_kg'
  const isCount = row.metric === 'registered_units'
  const source = bt.marketSource(row)
  const note = bt.marketNote(row)
  // The window sentence names four figures. Printed with any one missing it
  // would read "up to Not available", so it is all four or nothing.
  const hasWindow = hasNumber(row.n_days) && row.last_reported && hasNumber(row.price_low) && hasNumber(row.price_high)

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
      {/* The crop and the category have keys; the place is a proper noun and
          does not, so it stays on formatText. */}
      <h3 className="break-words font-bold text-[var(--color-text)]">
        {isPrice ? bt.commodityName(row) || choiceText(row.business_category, t) : choiceText(row.business_category, t)} · {place}
      </h3>

      {isPrice && (
        <div className="mt-4 min-w-0">
          <p className="text-xl font-bold text-[var(--color-text)]">{formatPrice(row.indicative_price, t)}</p>
          {/* A sentence of its own, not a "label: figure" pair: a colon wedged
              between a translated label and a number is English punctuation in
              every other script. */}
          <p className="mt-1 break-words text-xs font-semibold text-[var(--color-text-muted)]">{t('mk.price')}</p>
          {hasWindow && (
            <p className="mt-3 break-words text-sm leading-6 text-[var(--color-text)]">
              {t('mk.priceWindow', {
                n: Number(row.n_days).toLocaleString('en-IN'),
                date: formatDate(row.last_reported),
                low: formatPrice(row.price_low, t),
                high: formatPrice(row.price_high, t),
              })}
            </p>
          )}
          {hasNumber(row.n_markets) && (
            <p className="mt-1 break-words text-sm leading-6 text-[var(--color-text-muted)]">
              {t('mk.priceMarkets', { markets: Number(row.n_markets).toLocaleString('en-IN') })}
            </p>
          )}
          {/* Only ever true or absent. The fetch sets it when the newest report
              is more than a week old, and an old price read as today's is the
              one way this figure misleads. */}
          {row.stale === true && (
            <p className="ui-notice ui-notice-warn mt-3 break-words">{t('mk.stale')}</p>
          )}
        </div>
      )}

      {isCount && (
        <div className="mt-4 min-w-0 space-y-2">
          {/* A null count is suppressed, not zero: under 10 units is withheld so
              a figure cannot point at one identifiable business. */}
          {row.count_suppressed ? (
            <p className="break-words text-sm leading-6 text-[var(--color-text)]">
              {t('mk.countSuppressed', { district: place })}
            </p>
          ) : hasNumber(row.count) && (
            <p className="break-words text-sm leading-6 text-[var(--color-text)]">
              {t('mk.count', { count: Number(row.count).toLocaleString('en-IN'), district: place })}
            </p>
          )}
          {!row.count_suppressed && hasNumber(row.share_percent) && hasNumber(row.district_total) && (
            <p className="break-words text-sm leading-6 text-[var(--color-text-muted)]">
              {t('mk.countShare', {
                share: Number(row.share_percent).toLocaleString('en-IN', { maximumFractionDigits: 1 }),
                total: Number(row.district_total).toLocaleString('en-IN'),
                district: place,
              })}
            </p>
          )}
          {/* Only the per-unit list lets one business carry several kinds of
              work. The Ministry's own aggregate counts each business once. */}
          {row.source_code === 'src.udyamList' && (
            <p className="break-words text-xs leading-5 text-[var(--color-text-muted)]">{t('mk.countMulti')}</p>
          )}
          {note && (
            <p className="break-words text-xs leading-5 text-[var(--color-text-muted)]">{note}</p>
          )}
        </div>
      )}

      {context.market_type && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('mk.whereSell')}</p>
          <p className="mt-1 text-sm font-bold text-[var(--color-text)]">{choiceListText(context.market_type, t)}</p>
        </div>
      )}

      {/* source is backend prose, translated through source_code. */}
      <p className="mt-3 break-words text-xs leading-5 text-[var(--color-text-muted)]">
        {provenance} {source ? t('mk.source', { source }) : ''} {row.last_verified ? t('mk.checked', { date: formatDate(row.last_verified) }) : ''}
      </p>
    </div>
  )
}

// Printed once under the cards, not per card. GODL-India makes the attribution
// mandatory, so it is shown wherever the figures are, and never inside a
// <details>, which prints collapsed. The attribution is the licence's own form
// of words naming the dataset as published, so it stays English and is marked
// lang="en". Plain text with no link: the outbound government links were removed
// on 10 Sept 2026 and the URLs inside the sentence are part of the citation.
function MarketSources({ rows, t }) {
  const attributions = [...new Set(
    rows.map((row) => row.provenance?.attribution).filter((text) => typeof text === 'string' && text.trim()),
  )]

  return (
    <div className="ui-card-soft mt-5 min-w-0 p-5">
      <h3 className="break-words font-bold text-[var(--color-text)]">{t('mk.sourcesHeading')}</h3>
      {attributions.map((text) => (
        <p key={text} lang="en" className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">{text}</p>
      ))}
      <p className="mt-3 break-words text-xs leading-5 text-[var(--color-text-muted)]">{t('mk.notEndorsed', { app: APP_NAME })}</p>
      <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-muted)]">{t('mk.warranty')}</p>
    </div>
  )
}

function SchemeCard({ scheme, t, bt }) {
  if (typeof scheme === 'string') {
    return (
      <div className="min-w-0 rounded-2xl border border-[var(--color-border)] p-5 font-semibold text-[var(--color-text)] break-words">
        {scheme}
      </div>
    )
  }

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--color-border)] p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-bold text-[var(--color-text)]">
          {scheme.name || t('sc.name')}
        </h3>
        {/* Why it is on the list, in words, not the score as a percentage: the
            score checks no eligibility rule, so "90% match" read as a chance of
            qualifying that nothing computes. No shrink-0: the row wraps, but a
            flex item that cannot shrink stays max-content wide on its own line,
            and the longer translations then push past a 360px card. */}
        {bt.schemeFit(scheme) && (
          <span className="min-w-0 max-w-full break-words rounded-2xl bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-bold text-[var(--color-primary-strong)]">
            {bt.schemeFit(scheme)}
          </span>
        )}
      </div>

      {/* This list is flat, so unlike /schemes it cannot group by tier — the
          office that runs the scheme goes on the card instead. It matters more
          than it looks: a nationwide loan and a Gram Panchayat licence counter
          are the same size on the page but not the same errand. */}
      {scheme.level && (
        <p className="mt-2 break-words text-xs font-semibold text-[var(--color-text-muted)]">
          {t('sch.runBy', { office: bt.schemeLevel(scheme) })}
        </p>
      )}

      {/* description, support_type, match_reasons, eligibility_rules and
          documents are all written by the Python services, each with a
          translatable code alongside. The scheme NAME stays English on purpose:
          PMEGP and PMMY are what the scheme is called on the form and at the
          counter, so a reader has to be able to ask for it by that name. */}
      {scheme.description && (
        <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-muted)]">
          {bt.schemeDescription(scheme)}
        </p>
      )}

      {scheme.support_type && (
        <p className="mt-3 break-words text-xs leading-5 text-[var(--color-text-muted)]">
          <span className="font-bold text-[var(--color-text)]">{t('sc.support')}</span> {bt.schemeSupport(scheme)}
        </p>
      )}

      {/* The backend calls these match_reasons and eligibility_rules, and both
          are lists. Reading scheme.reason / scheme.eligibility rendered nothing. */}
      {Array.isArray(scheme.match_reasons) && scheme.match_reasons.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-[var(--color-text)]">{t('sc.why')}</p>
          <ul className="mt-2 space-y-1">
            {bt.schemeReasons(scheme).map((reason, index) => (
              <li key={index} className="flex min-w-0 gap-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">
                <span className="shrink-0 text-[var(--color-primary-strong)]" aria-hidden="true">✓</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(scheme.eligibility_rules) && scheme.eligibility_rules.length > 0 && (
        <p className="mt-3 break-words text-xs leading-5 text-[var(--color-text-muted)]">
          <span className="font-bold text-[var(--color-text)]">{t('sc.eligibility')}:</span> {bt.schemeEligibility(scheme).join(' · ')}
        </p>
      )}

      {/* The rules above are the scheme's own, transcribed. Nothing compares
          them with the reader's answers, so the card says so beside them. */}
      {Array.isArray(scheme.eligibility_rules) && scheme.eligibility_rules.length > 0 && (
        <p className="mt-1 break-words text-xs leading-5 text-[var(--color-text-muted)]">
          {t('sc.eligUnchecked')}
        </p>
      )}

      {Array.isArray(scheme.documents) && scheme.documents.length > 0 && (
        <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">
          <span className="font-bold text-[var(--color-text)]">{t('sc.documents')}:</span> {bt.schemeDocuments(scheme).join(' · ')}
        </p>
      )}

      {/* No link out to the scheme's government portal — see the note in
          SchemesPage.jsx. */}

      {scheme.last_verified && (
        <p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">
          {t('sc.verified', { date: scheme.last_verified })}
        </p>
      )}
    </div>
  )
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

const RISK_KEYS = { low: 'risk.low', moderate: 'risk.moderate', high: 'risk.high' }

function riskText(value, t) {
  const key = RISK_KEYS[String(value || '').toLowerCase()]
  return key ? t(key) : t('risk.unknown')
}

// The picker values ('tailoring', 'weekly') are English on purpose — they are
// what the request carries and what the scheme matcher keys off — so the label
// is mapped back to the same key the picker used. Anything with no key falls
// through to formatText, which still prints it: that is how a district name and
// a free-typed 'other' trade reach the screen in the user's own words, and how a
// market row in a category with no picker button still reads sensibly.
const CHOICE_KEYS = {
  retail: 'cat.retail', 'food processing': 'cat.food', handicrafts: 'cat.handicrafts', tailoring: 'cat.tailoring',
  agriculture: 'cat.agriculture', dairy: 'cat.dairy', services: 'cat.services', manufacturing: 'cat.manufacturing', other: 'cat.other',
  village: 'market.village', weekly: 'market.weekly', town: 'market.town', online: 'market.online',
}

function choiceText(value, t) {
  const key = CHOICE_KEYS[String(value === undefined || value === null ? '' : value).trim().toLowerCase()]
  return key ? t(key) : formatText(value, t)
}

// market_type reaches the backend as the comma-joined list FinancePage builds
// from the multi-select on /location, so each part is translated on its own
// before being joined back together.
function choiceListText(value, t) {
  const parts = String(value === undefined || value === null ? '' : value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return formatText(value, t)
  return parts.map((part) => choiceText(part, t)).join(', ')
}

function formatCurrency(value, t) {
  // A missing amount must not print as ₹0 — that reads as a real, reassuring
  // figure. Only say ₹0 when the backend actually sent zero.
  if (!hasNumber(value)) return t('common.notAvailable')
  // The sign goes before the symbol: -₹10,000, not ₹-10,000. Both are the same
  // characters, but wedged between the symbol and the first digit the minus is
  // the easiest thing on the page to miss, and this figure appears at text-3xl in
  // the summary card. Leading, it is the first thing read. This is also how a
  // negative amount is written in India. Kept identical in the other three pages
  // that carry their own copy of this formatter.
  const amount = Number(value)
  return (amount < 0 ? '-₹' : '₹') + Math.abs(amount).toLocaleString('en-IN')
}

// A mandi price is per kg and carries paise, so it cannot go through
// formatCurrency, which drops them. Two decimals whenever there are paise —
// ₹26.90, never ₹26.9, which reads as a different price — and none on a whole
// rupee figure. Same null guard and sign-before-symbol rule as formatCurrency.
function formatPrice(value, t) {
  if (!hasNumber(value)) return t('common.notAvailable')
  const amount = Number(value)
  const abs = Math.abs(amount)
  const digits = Number.isInteger(abs)
    ? abs.toLocaleString('en-IN')
    : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (amount < 0 ? '-₹' : '₹') + digits
}

// yyyy-mm-dd from the backend becomes dd/mm/yyyy, the order printed on Indian
// forms. Split as a string rather than parsed with new Date(): that reads a bare
// date as UTC midnight, which is the previous evening anywhere west of Greenwich
// and a timezone-dependent answer everywhere. Anything else prints as sent.
function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim())
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

// The backend sends null for percentages it could not compute (no surplus to
// divide by, no investment amount). Number(null) is 0 and passes
// Number.isFinite, so the raw value has to be checked before it is converted.
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function formatPercent(value, t) {
  if (!hasNumber(value)) return t('common.notAvailable')
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '%'
}

function formatText(value, t) {
  if (value === undefined || value === null || String(value).trim() === '') return t('common.notAvailable')
  return titleCaseEnum(value)
}

// The title-caser exists for ONE case: an enum or a picker value that no map
// above recognises, so it prints legibly rather than vanishing. Every such value
// is snake_case, so gate on that shape — the same helpers also receive district
// names and whatever the user typed into "Other", and title-casing those does
// visible damage. `\b` matches after an apostrophe, so "Meena's shop" became
// "Meena'S Shop", and "Jammu and Kashmir" became "Jammu And Kashmir". Anything
// not enum-shaped is printed as written. Kept identical in AdvisoryPage and
// ReportPage: these formatters are duplicated per page by design, but two copies
// that disagree would show one spelling on /analysis and another on /report.
const ENUM_SHAPED = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

function titleCaseEnum(value) {
  const text = String(value).trim()
  if (!ENUM_SHAPED.test(text)) return text
  return text.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export default AnalysisPage

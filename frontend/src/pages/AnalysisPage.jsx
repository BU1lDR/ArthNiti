import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { BarGroup, BarRow, UnitChart } from '../components/Charts'
import { useI18n } from '../i18n/LanguageContext'
import { useBackendText } from '../i18n/backendText'

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

  // The backend returns null for ROI when there is no investment amount to
  // divide by, so the card explains what to fill in instead of showing 0%.
  const roiDescription = hasNumber(business.estimated_roi_percent)
    ? t('an.roiWith', { value: formatPercent(business.estimated_roi_percent, t) })
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
  const inOutItems = [
    ...moneyBar(t('f.income'), '📥', financial.expected_monthly_revenue, 'neutral'),
    ...moneyBar(t('f.spending'), '📤', financial.monthly_expenses, 'warn'),
    ...moneyBar(t('f.profit'), '💚', monthlyProfit, Number(monthlyProfit) > 0 ? 'good' : 'bad'),
  ]

  // funding_gap is clamped at zero on the backend, so a zero is not a missing
  // number — it means the planned investment is already covered. "Extra money
  // you may need to arrange" printed next to ₹0 reads as a contradiction.
  const fundingGap = financial.funding_gap
  const gapDescription = hasNumber(fundingGap) && Number(fundingGap) <= 0
    ? t('money.enough')
    : t('an.needDesc')

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

  // profit_margin_percent comes back as 0, not null, when there is no revenue to
  // divide by — financial_service falls back to 0 rather than dividing by zero.
  // So a business with no sales yet would print a confident "0%" and draw ten
  // empty coins, as though "nothing stays with you out of every ten rupees" had
  // been measured. Nothing was measured, so with no revenue the margin is
  // treated as missing everywhere it is shown. A real 0% margin on real revenue
  // is a genuine finding and must still print 0% and draw the ten empty coins.
  const hasRevenue = hasNumber(financial.expected_monthly_revenue)
    && Number(financial.expected_monthly_revenue) > 0
  const margin = hasRevenue ? financial.profit_margin_percent : null
  const coins = hasNumber(margin)
    ? Math.min(10, Math.max(0, Math.round(Number(margin) / 10)))
    : 0

  const schemeFitItems = schemes
    .filter((scheme) => scheme && typeof scheme === 'object' && hasNumber(scheme.match_score))
    .map((scheme) => ({
      label: scheme.name || t('sc.name'),
      icon: '🏛️',
      value: Number(scheme.match_score),
      valueText: t('sc.matchPct', { n: Number(scheme.match_score) }),
      tone: 'good',
    }))

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
          <div className="rounded-2xl bg-[var(--color-surface-soft)] p-5 text-center lg:min-w-52">
            <p className="text-sm font-semibold text-[var(--color-text-muted)]">{t('money.left')}</p>
            <p className="mt-1 text-3xl font-bold text-[var(--color-text)]">
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
              measure a margin against, so the whole chart drops out. */}
          {hasNumber(margin) && (
            <div className="mt-7 border-t border-[var(--color-border)] pt-6">
              <ChartTitle title={t('ch.coinTitle')} />
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
          <div className="mt-5 grid gap-4">
            {market.map((row, index) => <MarketCard key={index} row={row} t={t} bt={bt} />)}
          </div>
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

        {schemeFitItems.length > 0 && (
          <div className="mt-6">
            <ChartTitle title={t('ch.schemeFit')} />
            <BarGroup items={schemeFitItems} />
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
  // Say plainly whose district the numbers come from. A state-level fallback
  // presented as local data would be the wrong kind of confident.
  const provenance = row.match_level === 'district'
    ? t('mk.fromDistrict', { district: formatText(row.district, t) })
    : t('mk.fromState', { district: formatText(row.district, t) })

  return (
    <div className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        {/* The category is a picker value and has a key; the district is a proper
            noun and does not, so it stays on formatText. */}
        <h3 className="break-words font-bold text-[var(--color-text)]">
          {choiceText(row.business_category, t)} · {formatText(row.district, t)}
        </h3>
        {row.demand_indicator && (
          <span className="shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-bold text-[var(--color-text)]">
            {demandText(row.demand_indicator, t)}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('mk.price')}</p>
          <p className="mt-1 text-xl font-bold text-[var(--color-text)]">{formatCurrency(row.indicative_price, t)}</p>
        </div>
        {context.market_type && (
          <div>
            <p className="text-xs font-semibold text-[var(--color-text-muted)]">{t('mk.whereSell')}</p>
            <p className="mt-1 text-sm font-bold text-[var(--color-text)]">{choiceListText(context.market_type, t)}</p>
          </div>
        )}
      </div>

      {/* seasonality and source are backend prose, translated through their
          seasonality_code / source_code. The three near-identical festival
          wordings in market_data.json deliberately share one code. */}
      {row.seasonality && (
        <p className="mt-4 break-words text-sm leading-6 text-[var(--color-text)]">{bt.seasonality(row)}</p>
      )}

      <p className="mt-3 break-words text-xs leading-5 text-[var(--color-text-muted)]">
        {provenance} {row.source ? t('mk.source', { source: bt.marketSource(row) }) : ''} {row.last_verified ? t('mk.checked', { date: row.last_verified }) : ''}
      </p>
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
        {hasNumber(scheme.match_score) && (
          <span className="shrink-0 rounded-full bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-bold text-[var(--color-primary-strong)]">
            {t('sc.matchPct', { n: Number(scheme.match_score) })}
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
          PMEGP and PMMY are what the official portal calls them, and a user
          following official_url has to recognise it there. */}
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

      {Array.isArray(scheme.documents) && scheme.documents.length > 0 && (
        <p className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">
          <span className="font-bold text-[var(--color-text)]">{t('sc.documents')}:</span> {bt.schemeDocuments(scheme).join(' · ')}
        </p>
      )}

      {scheme.official_url && (
        <a
          href={scheme.official_url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-11 items-center break-words text-xs font-bold text-[var(--color-primary-strong)] hover:underline"
        >
          {t('sc.openSite')} <span aria-hidden="true">↗</span>
        </a>
      )}

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
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const RISK_KEYS = { low: 'risk.low', moderate: 'risk.moderate', high: 'risk.high' }

function riskText(value, t) {
  const key = RISK_KEYS[String(value || '').toLowerCase()]
  return key ? t(key) : t('risk.unknown')
}

// demand_indicator is a lowercase backend value ('high' / 'medium' in
// market_data.json today). Whole phrases, not a '{level} demand' template:
// slotting an English level word into a translated noun printed "Medium मांग".
// Anything unrecognised falls back to the bare label rather than leaking the raw
// value or building half a sentence.
const DEMAND_KEYS = { high: 'mk.demandHigh', medium: 'mk.demandMedium', low: 'mk.demandLow' }

function demandText(value, t) {
  const key = DEMAND_KEYS[String(value === undefined || value === null ? '' : value).trim().toLowerCase()]
  return key ? t(key) : t('mk.demandLabel')
}

// The picker values ('tailoring', 'weekly') are English on purpose — they are
// what the request carries and what the scheme matcher keys off — so the label
// is mapped back to the same key the picker used. Anything with no key falls
// through to formatText, which still prints it: that is how a district name and
// a free-typed 'other' trade reach the screen in the user's own words, and how a
// market row for 'poultry' (no picker button, no key) still reads sensibly.
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
  return '₹' + Number(value).toLocaleString('en-IN')
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
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export default AnalysisPage

import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import Button from '../components/Button'
import { BarGroup, BarRow } from '../components/Charts'
import { firstUnansweredStep, isStarted, useApp } from '../context/AppContext'
import { APP_NAME } from '../i18n/brand'
import { useI18n } from '../i18n/LanguageContext'
import { useBackendText } from '../i18n/backendText'
import { languageByCode } from '../i18n/languages'

function ReportPage() {
  const { applicationData, resultCleared } = useApp()
  const { t, language, dialect, dialects, apiLanguage } = useI18n()
  const bt = useBackendText()
  const profile = applicationData?.profile || {}
  const business = applicationData?.business || {}
  const location = applicationData?.location || {}
  const finance = applicationData?.finance || {}
  const result = applicationData?.result
  const financial = result?.financial_analysis
  const risk = result?.risk_analysis
  const businessAnalysis = result?.business_analysis
  const advisory = result?.advisory
  const schemes = Array.isArray(result?.scheme_matches) ? result.scheme_matches : []
  const market = Array.isArray(result?.market_context) ? result.market_context : []
  // Backend prose in the chosen language. The report is the page a user prints and carries to a
  // bank, so English advice on an otherwise Hindi sheet is the most visible version of that gap.
  const recommendations = bt.advice(advisory)
  const observations = bt.observations(businessAnalysis)
  // The language shown on the report is the one in use right now, not the copy mirrored onto
  // `profile` at step 1 — that copy goes stale the moment the header language switcher is used.
  const languageLabel = (languageByCode(language) || {}).endonym || apiLanguage
  const dialectLabel = dialect ? ((dialects || []).find((entry) => entry.code === dialect) || {}).label || dialect : ''

  // The same empty state as the other three result pages: the button goes to the
  // first step still missing an answer, or to /finance, where the check is run.
  if (!result) return <div className="mx-auto max-w-3xl"><Link to="/advisory" className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline"><span aria-hidden="true">←</span> {t('res.backAdvisory')}</Link><section className="ui-card mt-8 text-center sm:p-8"><div className="ui-feature-icon mx-auto" aria-hidden="true">📋</div><h1 className="mt-4 text-2xl font-bold text-[var(--color-text)]">{resultCleared ? t('res.changedTitle') : t('rp.notReady')}</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--color-text-muted)]">{resultCleared ? t('res.changedText', { button: t('finance.submit') }) : t('res.notReadyText')}</p><Button to={firstUnansweredStep(applicationData) ?? '/finance'} className="mt-6">{resultCleared ? t('res.changedButton') : isStarted(applicationData) ? t('res.finish') : t('res.start')}</Button></section></div>

  // Prefer the backend figure so this page and /analysis cannot disagree; the client-side sum stays as a fallback.
  const fundingGap = financial?.funding_gap ?? (business.initialInvestment !== undefined && finance.availableCapital !== undefined ? Math.max(Number(business.initialInvestment || 0) - Number(finance.availableCapital || 0), 0) : null)
  const feasibility = businessAnalysis?.feasibility_status
  const riskLevel = risk?.risk_level
  // The pressure figure counts a loan for the funding gap when there is one. This sheet goes to a bank, so the assumed rate and tenure are printed beside it, same note as /analysis.
  const hasNewLoan = hasNumber(risk?.estimated_new_emi) && Number(risk.estimated_new_emi) > 0
  const newLoanNote = hasNewLoan && hasNumber(risk?.pressure_ratio_percent) ? t('ch.pressureIncludesNew', { rate: risk.assumed_interest_rate_percent, years: Number(risk.assumed_tenure_months) / 12 }) : null
  // Revenue for the chart comes from the response, never from `finance.monthlyRevenue` — that
  // field does not exist on the finance section at all, which was defect 5.
  const flowItems = [
    { label: t('f.income'), icon: '📥', value: financial?.expected_monthly_revenue, tone: 'neutral' },
    { label: t('f.spending'), icon: '📤', value: financial?.monthly_expenses, tone: 'warn' },
    // The icon tracks the sign, not just the tone: a '💚' beside a red -₹10,000 is the fastest-read
    // thing in the row saying the opposite of the figure. Same change on /analysis.
    { label: t('f.profit'), icon: Number(financial?.monthly_profit) > 0 ? '💚' : '💔', value: financial?.monthly_profit, tone: Number(financial?.monthly_profit) > 0 ? 'good' : 'bad' },
  ].filter((item) => hasNumber(item.value)).map((item) => ({ ...item, value: Number(item.value), valueText: formatCurrency(item.value, t) }))
  // Strictly negative and only on a figure we have — an exact ₹0 is break-even, not a shortfall. This is the
  // sheet someone carries to a bank, so a shortfall must not print under "Money left each month" in body black.
  const isShortfall = hasNumber(financial?.monthly_profit) && Number(financial.monthly_profit) < 0
  const fundItems = [
    { label: t('ch.required'), icon: '🎯', value: financial?.initial_investment, tone: 'neutral' },
    { label: t('ch.inHand'), icon: '👛', value: financial?.available_capital, tone: 'good' },
    { label: t('ch.missing'), icon: '📌', value: fundingGap, tone: Number(fundingGap) > 0 ? 'warn' : 'good' },
  ].filter((item) => hasNumber(item.value)).map((item) => ({ ...item, value: Number(item.value), valueText: formatCurrency(item.value, t) }))

  return <div className="print:bg-white">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden"><Link to="/advisory" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline"><span aria-hidden="true">←</span> {t('res.backAdvisory')}</Link><Button onClick={() => window.print()}><span aria-hidden="true">🖨️</span> {t('common.print')}</Button></div>
    {/* The answers live in sessionStorage: a refresh keeps them, and closing the
        tab usually ends them, which is why the note says "usually". Screen only,
        like the bar above it: on paper there is nothing left to save. A plain
        paragraph, not a notice box, because that class sets display outside any
        cascade layer and would beat the print utility that hides this. */}
    <p className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--color-text)] print:hidden">{t('rp.keepNote', { button: t('common.print') })}</p>
    {/* A masthead for the sheet itself. `window.print()` hides all the app chrome, so
        without this the PDF a user carries to a bank names no service at all. */}
    <header className="ui-card sm:p-8"><div className="mb-4 flex items-center gap-3 border-b border-[var(--color-border)] pb-4"><BrandMark size="sm" /><span className="text-lg font-extrabold text-[var(--color-text)]">{APP_NAME}</span></div><p className="ui-eyebrow"><span aria-hidden="true">📄</span> {t('rp.eyebrow')}</p><h1 className="ui-page-title mt-1">{t('rp.title')}</h1><p className="ui-page-subtitle">{t('rp.subtitle')}</p></header>
    <section className="ui-card mt-6 sm:p-8"><div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-soft)] text-3xl" aria-hidden="true">{feasibility === 'feasible' ? '✅' : '📌'}</div><div><p className="ui-eyebrow">{t('rp.mainResult')}</p><h2 className="mt-1 text-2xl font-extrabold text-[var(--color-text)]">{statusText(feasibility, t)}</h2><p className="mt-2 leading-7 text-[var(--color-text-muted)]">{t('rp.mainResultText')}</p></div></div></section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon={isShortfall ? '📉' : '💰'} label={isShortfall ? t('money.shortfall') : t('money.left')} value={formatCurrency(financial?.monthly_profit, t)} tone={isShortfall ? 'bad' : undefined} /><MetricCard icon="🏦" label={t('money.fundingNeeded')} value={formatCurrency(fundingGap, t)} /><MetricCard icon="📈" label={t('money.margin')} value={formatPercent(financial?.profit_margin_percent) || t('common.notAvailable')} /><MetricCard icon="🛡️" label={t('money.risk')} value={riskText(riskLevel, t)} /></section>
    <ReportSection icon="👤" title={t('rp.profile')}><div className="ui-simple-grid mt-5"><InfoItem label={t('rp.name')} value={profile.name} t={t} /><InfoItem label={t('location.state')} value={location.state} t={t} /><InfoItem label={t('location.district')} value={location.district} t={t} /><InfoItem label={t('common.language')} value={languageLabel} t={t} />{dialectLabel && <InfoItem label={t('common.dialect')} value={dialectLabel} t={t} />}<InfoItem label={t('rp.businessName')} value={business.businessName} t={t} /><InfoItem label={t('f.workType')} value={choiceText(businessAnalysis?.business_type || business.category, t)} t={t} /></div></ReportSection>
    <ReportSection icon="📍" title={t('an.marketHeading')}><div className="ui-simple-grid mt-5"><InfoItem label={t('rp.villageTown')} value={location.village} t={t} /><InfoItem label={t('rp.marketPlace')} value={choiceList(location.marketType, t)} t={t} /><InfoItem label={t('rp.customers')} value={location.customers} t={t} /><InfoItem label={t('rp.areaType')} value={choiceText(location.locationType, t)} t={t} /></div>{market.length > 0 ? <><div className="mt-5 space-y-3">{market.map((row, index) => <MarketRow key={index} row={row} t={t} bt={bt} />)}</div><MarketSources rows={market} t={t} /></> : <p className="mt-5 text-sm leading-6 text-[var(--color-text-muted)]">{t('mk.noData')}</p>}</ReportSection>
    {/* Every figure here reads the response first and the form only as a fallback, the same rule the funding gap
        above already follows. These four used to read the form outright, so the money-summary grid and the charts
        directly below it drew the same label from two different sources: nothing guards journey order, so a judge
        asking "what if expenses were 30,000?" could edit /finance, come back through the nav without re-submitting,
        and read "Money going out each month ₹30,000" in the grid above "Money going out each month ₹15,000" in the
        chart. Editing an answer now clears the result outright (see AppContext), so this is the second line of
        defence rather than the only one — but a label must not be able to carry two numbers on one page.
        f.emi and f.debt in the disclosure below stay client-only: the response does not echo them at all. */}
    <ReportSection icon="💵" title={t('rp.moneySummary')}><div className="ui-simple-grid mt-5"><InfoItem label={t('f.investment')} value={formatCurrency(financial?.initial_investment ?? business.initialInvestment, t)} t={t} /><InfoItem label={t('f.haveMoney')} value={formatCurrency(financial?.available_capital ?? finance.availableCapital, t)} t={t} /><InfoItem label={t('rp.gap')} value={formatCurrency(fundingGap, t)} t={t} /><InfoItem label={t('f.sales')} value={formatCurrency(financial?.expected_monthly_revenue ?? business.monthlyRevenue, t)} t={t} /><InfoItem label={t('f.spending')} value={formatCurrency(financial?.monthly_expenses ?? finance.monthlyExpenses, t)} t={t} /><InfoItem label={t('f.profit')} value={formatCurrency(financial?.monthly_profit, t)} t={t} /></div>
      {hasNumber(financial?.expected_monthly_revenue) && flowItems.length > 0 && <div className="ui-card-soft mt-5 p-4 sm:p-5"><h3 className="font-bold text-[var(--color-text)]">{t('ch.inOut')}</h3><div className="mt-4"><BarGroup items={flowItems} caption={t('ch.inOutCaption')} /></div></div>}
      {hasNumber(financial?.initial_investment) && fundItems.length > 0 && <div className="ui-card-soft mt-4 p-4 sm:p-5"><h3 className="font-bold text-[var(--color-text)]">{t('ch.fundTitle')}</h3><div className="mt-4"><BarGroup items={fundItems} caption={t('ch.fundCaption')} /></div></div>}
      {/* Outside the <details> below, because a closed disclosure prints as its summary line and this is the sheet a lender reads. The pressure note sits in that disclosure, so the household note here always carries the assumed rate and tenure itself. Same content as /analysis. */}
      {hasHouseholdCheck(risk) && <div className="ui-card-soft mt-4 p-4 sm:p-5"><h3 className="font-bold text-[var(--color-text)]">{t('ch.householdTitle')}</h3><div className="mt-3"><HouseholdCheck risk={risk} t={t} bt={bt} /></div></div>}
      <details className="ui-disclosure mt-5"><summary>{t('rp.detailedFigures')}</summary><div className="ui-disclosure-body ui-simple-grid"><InfoItem label={t('f.margin')} value={formatPercent(financial?.profit_margin_percent)} t={t} /><InfoItem label={t('f.yearReturn')} value={formatPercent(businessAnalysis?.estimated_roi_percent)} t={t} /><InfoItem label={t('f.emi')} value={formatCurrency(finance.monthlyEmi, t)} t={t} /><InfoItem label={t('f.debt')} value={formatCurrency(business.existingDebt, t)} t={t} />{hasNewLoan && <InfoItem label={t('an.newLoanEmi')} value={formatCurrency(risk.estimated_new_emi, t)} t={t} />}<InfoItem label={t('f.emiPressure')} value={formatPercent(risk?.pressure_ratio_percent)} t={t} /></div>{newLoanNote && <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">{newLoanNote}</p>}</details></ReportSection>
    <ReportSection icon="🧭" title={t('rp.nextTitle')}><div className="mt-5 space-y-4">{(recommendations.length ? recommendations.slice(0, 5) : [t('ad.step1'), t('ad.step2'), t('ad.step3'), t('ad.step4')]).map((item, index) => <ActionItem key={index} number={index + 1} text={item} />)}</div></ReportSection>
    <ReportSection icon="🏛️" title={t('an.govHeading')}>{schemes.length > 0 ? <div className="mt-5 space-y-4">{schemes.map((scheme, index) => <div key={scheme.name || index} className="ui-card-soft"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-[var(--color-text)]">{scheme.name || t('sc.name')}</h3>{bt.schemeFit(scheme) && <span className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-sm font-bold text-[var(--color-text)]">{bt.schemeFit(scheme)}</span>}</div>{scheme.level && <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">{t('sch.runBy', { office: bt.schemeLevel(scheme) })}</p>}{scheme.description && <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{bt.schemeDescription(scheme)}</p>}</div>)}</div> : <p className="mt-4 leading-7 text-[var(--color-text-muted)]">{t('rp.noScheme')}</p>}<p className="mt-5 text-xs leading-5 text-[var(--color-text-muted)]">{t('rp.schemeNote')}</p></ReportSection>
    {observations.length > 0 && <ReportSection icon="🔎" title={t('rp.observations')}><div className="mt-5 space-y-3">{observations.map((item, index) => <div key={index} className="ui-card-soft p-4 text-sm leading-6 text-[var(--color-text-muted)]">{item}</div>)}</div></ReportSection>}
    <footer className="ui-card mt-6 text-center print:mt-8"><p className="text-sm leading-6 text-[var(--color-text-muted)]">{t('rp.footer')}</p></footer>
  </div>
}

function ReportSection({ icon, title, children }) { return <section className="ui-card mt-6 sm:p-8"><div className="flex min-w-0 items-center gap-3"><div className="ui-feature-icon shrink-0" aria-hidden="true">{icon}</div><h2 className="text-xl font-bold text-[var(--color-text)]">{title}</h2></div>{children}</section> }
// `tone` is optional and only 'bad' does anything: --color-danger, which the @media print token block resets to its light value so a shortfall prints red on white rather than in a dark-mode colour.
function MetricCard({ icon, label, value, tone }) { return <article className="ui-card"><div className="text-2xl" aria-hidden="true">{icon}</div><p className="mt-3 text-sm text-[var(--color-text-muted)]">{label}</p><p className={`mt-1 text-xl font-extrabold ${tone === 'bad' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>{value}</p></article> }
function InfoItem({ label, value, t }) { return <div className="ui-card-soft p-4"><p className="text-sm text-[var(--color-text-muted)]">{label}</p><p className="mt-1 font-bold text-[var(--color-text)]">{statusText(value, t)}</p></div> }
// match_level says whether the row is the entrepreneur's own district or a same-state fallback, and the report must not blur the two. Same content as MarketCard on /analysis — see the notes there; a state row carries district "", so the heading names the state instead.
function MarketRow({ row, t, bt }) { const place = statusText(row.scope === 'state' ? row.state : row.district, t); const isPrice = row.metric === 'wholesale_price_per_kg'; const isCount = row.metric === 'registered_units'; const source = bt.marketSource(row); const note = bt.marketNote(row); const hasWindow = hasNumber(row.n_days) && row.last_reported && hasNumber(row.price_low) && hasNumber(row.price_high); return <div className="ui-card-soft p-4"><h3 className="font-bold text-[var(--color-text)]">{isPrice ? bt.commodityName(row) || choiceText(row.business_category, t) : choiceText(row.business_category, t)} · {place}</h3>{isPrice && <><p className="mt-2 text-xl font-bold text-[var(--color-text)]">{formatPrice(row.indicative_price, t)}</p><p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">{t('mk.price')}</p>{hasWindow && <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{t('mk.priceWindow', { n: Number(row.n_days).toLocaleString('en-IN'), date: formatDate(row.last_reported), low: formatPrice(row.price_low, t), high: formatPrice(row.price_high, t) })}</p>}{hasNumber(row.n_markets) && <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t('mk.priceMarkets', { markets: Number(row.n_markets).toLocaleString('en-IN') })}</p>}{row.stale === true && <p className="ui-notice ui-notice-warn mt-2">{t('mk.stale')}</p>}</>}{isCount && <>{row.count_suppressed ? <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{t('mk.countSuppressed', { district: place })}</p> : hasNumber(row.count) && <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{t('mk.count', { count: Number(row.count).toLocaleString('en-IN'), district: place })}</p>}{!row.count_suppressed && hasNumber(row.share_percent) && hasNumber(row.district_total) && <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t('mk.countShare', { share: Number(row.share_percent).toLocaleString('en-IN', { maximumFractionDigits: 1 }), total: Number(row.district_total).toLocaleString('en-IN'), district: place })}</p>}{row.source_code === 'src.udyamList' && <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{t('mk.countMulti')}</p>}{note && <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{note}</p>}</>}<p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{row.match_level === 'district' ? t('mk.fromDistrict', { district: statusText(row.district, t) }) : t('mk.fromState', { state: statusText(row.state, t) })} {source ? t('mk.source', { source }) : ''} {row.last_verified ? t('mk.checked', { date: formatDate(row.last_verified) }) : ''}</p></div> }
// Once under the rows, never inside a <details>: GODL-India makes the attribution mandatory and a collapsed disclosure prints as its summary line. English on purpose (the licence's own form of words, naming the dataset as published) and plain text, no link — see MarketSources on /analysis.
function MarketSources({ rows, t }) { const attributions = [...new Set(rows.map((row) => row.provenance?.attribution).filter((text) => typeof text === 'string' && text.trim()))]; return <div className="ui-card-soft mt-4 p-4"><h3 className="font-bold text-[var(--color-text)]">{t('mk.sourcesHeading')}</h3>{attributions.map((text) => <p key={text} lang="en" className="mt-2 break-words text-xs leading-5 text-[var(--color-text-muted)]">{text}</p>)}<p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">{t('mk.notEndorsed', { app: APP_NAME })}</p><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{t('mk.warranty')}</p></div> }
function ActionItem({ number, text }) { return <div className="flex items-start gap-4 rounded-xl border border-[var(--color-border)] p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] font-extrabold text-[var(--color-primary-strong)]">{number}</span><p className="pt-1 leading-7 text-[var(--color-text)]">{typeof text === 'string' ? text : JSON.stringify(text)}</p></div> }
// The household check, same lines in the same order as HouseholdCheck on /analysis (see the notes there). An estimate, never a lender's decision: within the limit is drawn neutral, not green, and no line says anyone is eligible or will lend.
function HouseholdCheck({ risk, t, bt }) { const check = String(risk.household_check).trim(); if (check === 'not_checked') return <p className="break-words text-sm leading-6 text-[var(--color-text)]">{t('ch.householdNotChecked', { step: t('nav.finance') })}</p>; const percent = risk.household_repayment_percent; const limit = risk.household_limit_percent; const limitText = hasNumber(limit) ? Number(limit).toLocaleString('en-IN') : null; const key = HOUSEHOLD_KEYS[check.toLowerCase()]; const label = key && limitText ? t(key, { limit: limitText }) : titleCaseEnum(check); const isOver = check.toLowerCase() === 'over_limit'; const reason = bt.householdReason(risk); const newLoanNote = householdLoanNote(risk, t); const rbiNote = householdRbiNote(risk, limitText, t); return <><p className={`break-words text-sm font-bold ${isOver ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'}`}>{label}</p>{hasNumber(percent) ? <><p className="mt-2 break-words text-sm leading-6 text-[var(--color-text)]">{t('ch.householdPercent', { percent: formatPercent(percent) })}</p><div className="mt-3"><BarRow label={t('ch.householdBar')} icon="🏠" valueText={formatPercent(percent)} fraction={Number(percent) / 100} tone={isOver ? 'bad' : 'neutral'} marks={limitText ? [{ at: Number(limit) / 100 }] : []} /></div>{limitText && <p className="ui-chart-caption">{t('ch.householdCaption', { limit: limitText })}</p>}</> : reason && <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text)]">{reason}</p>}{newLoanNote && <p className="ui-chart-caption">{newLoanNote}</p>}<p className="ui-chart-caption">{t('ch.householdEstimate')}</p>{rbiNote && <p className="mt-3 break-words text-sm leading-6 text-[var(--color-text)]">{rbiNote}</p>}</> }
// household_check is a backend enum; not_checked is handled before this map is read, and an unknown value title-cases.
const HOUSEHOLD_KEYS = { within_limit: 'ch.householdWithin', over_limit: 'ch.householdOver' }
// A response written before the check existed has no household_check at all, and then nothing is drawn.
function hasHouseholdCheck(risk) { const check = risk?.household_check; return check !== undefined && check !== null && String(check).trim() !== '' }
// Always the full sentence here: the pressure note that also names the rate and tenure sits inside the closed disclosure, which does not print. The short one only where the response sent no terms.
function householdLoanNote(risk, t) { const newLoanEmi = risk.estimated_new_emi; if (!hasNumber(newLoanEmi) || Number(newLoanEmi) <= 0) return null; const amount = formatCurrency(newLoanEmi, t); if (!hasNumber(risk.assumed_interest_rate_percent) || !hasNumber(risk.assumed_tenure_months)) return t('ch.householdIncludesNewShort', { amount }); return t('ch.householdIncludesNew', { amount, rate: risk.assumed_interest_rate_percent, years: Number(risk.assumed_tenure_months) / 12 }) }
// Printed only on a strict true or false; null means the backend could not tell.
function householdRbiNote(risk, limitText, t) { const incomeLimit = risk.household_microfinance_income_limit; if (!hasNumber(incomeLimit) || !limitText) return null; const values = { income: formatCurrency(incomeLimit, t), limit: limitText }; if (risk.household_in_microfinance_range === true) return t('ch.householdRbiCovered', values); if (risk.household_in_microfinance_range === false) return t('ch.householdRbiNotCovered', values); return null }
// Guard the raw value, not Number(value): the backend sends null for anything it could not
// compute, and Number(null) is 0, which passes Number.isFinite and prints a confident '₹0'.
function hasNumber(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) }
// Sign before the symbol — see the note in AnalysisPage. Byte-identical logic on all four pages that carry a copy.
function formatCurrency(value, t) { if (!hasNumber(value)) return t('common.notAvailable'); const amount = Number(value); return (amount < 0 ? '-₹' : '₹') + Math.abs(amount).toLocaleString('en-IN') }
// A per-kg mandi price keeps its paise: two decimals whenever there are any (₹26.90, never ₹26.9), none on a whole rupee. Kept identical to AnalysisPage's copy.
function formatPrice(value, t) { if (!hasNumber(value)) return t('common.notAvailable'); const amount = Number(value); const abs = Math.abs(amount); return (amount < 0 ? '-₹' : '₹') + (Number.isInteger(abs) ? abs.toLocaleString('en-IN') : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) }
// yyyy-mm-dd to dd/mm/yyyy by splitting the string: new Date() reads a bare date as UTC midnight, the previous day west of Greenwich. Anything else prints as sent.
function formatDate(value) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim()); return match ? `${match[3]}/${match[2]}/${match[1]}` : value }
// Backend enums stay English because they are load-bearing; they are turned into plain
// language only at render, and an unknown value (a free-typed category) still prints.
const STATUS_KEYS = {
  profitable: 'st.profitable', break_even: 'st.break_even', loss: 'st.loss',
  feasible: 'st.feasible', not_feasible: 'st.not_feasible',
  good: 'st.good', attention_needed: 'st.attention_needed', review: 'st.review',
}
function statusText(value, t) {
  const notAvailable = t('common.notAvailable')
  if (value === undefined || value === null || String(value).trim() === '') return notAvailable
  // InfoItem funnels every value through here, including ones formatCurrency,
  // formatPercent and choiceText already resolved to this exact string. Without
  // this guard the title-caser runs on it a second time and the same phrase
  // reads 'Not Available' in the money summary and 'Not available' on the metric
  // tiles beside it — Latin scripts only, which is why it is easy to miss.
  if (value === notAvailable) return notAvailable
  const key = STATUS_KEYS[String(value).toLowerCase()]
  if (key) return t(key)
  return titleCaseEnum(value)
}
// The title-caser exists for ONE case: a backend enum the map above does not
// recognise, so it prints legibly instead of vanishing. Every such value is
// snake_case, so gate on that shape — because InfoItem funnels the user's own
// words through this same function, and title-casing those does visible damage.
// "Meena's tailoring shop" came out "Meena'S Tailoring Shop" (\b matches after
// the apostrophe), "Jammu and Kashmir" came out "Jammu And Kashmir", and a typed
// customer description was rewritten word by word. Anything not enum-shaped is
// printed as the person wrote it.
const ENUM_SHAPED = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
function titleCaseEnum(value) { const text = String(value).trim(); return ENUM_SHAPED.test(text) ? text.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : text }
// The picker values (`rural`, `weekly`, `tailoring`) are English on purpose — they are what goes
// to the backend and what the scheme matcher keys off. The report has to print the label the user
// actually tapped, so it maps the value back to the same key the picker used; a free-typed "other"
// business has no key and falls through to statusText, which still prints it.
const CHOICE_KEYS = {
  rural: 'area.rural', 'semi-urban': 'area.semi', urban: 'area.urban',
  village: 'market.village', weekly: 'market.weekly', town: 'market.town', online: 'market.online',
  retail: 'cat.retail', 'food processing': 'cat.food', handicrafts: 'cat.handicrafts', tailoring: 'cat.tailoring',
  agriculture: 'cat.agriculture', dairy: 'cat.dairy', services: 'cat.services', manufacturing: 'cat.manufacturing', other: 'cat.other',
}
function choiceText(value, t) { const key = CHOICE_KEYS[String(value === undefined || value === null ? '' : value).trim().toLowerCase()]; return key ? t(key) : statusText(value, t) }
function choiceList(value, t) { const list = Array.isArray(value) ? value : (value ? [value] : []); return list.length ? list.map((item) => choiceText(item, t)).join(', ') : '' }
const RISK_KEYS = { low: 'risk.low', moderate: 'risk.moderate', high: 'risk.high' }
function riskText(value, t) {
  const key = RISK_KEYS[String(value || '').toLowerCase()]
  return key ? t(key) : t('risk.unknown')
}
// Returns null, not '0%', when the backend could not compute the percentage — null
// passes a !== undefined check and would otherwise render as the string 'null%'.
function formatPercent(value) { if (!hasNumber(value)) return null; return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '%' }

export default ReportPage

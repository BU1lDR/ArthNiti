import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { BarGroup } from '../components/Charts'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/LanguageContext'
import { useBackendText } from '../i18n/backendText'
import { languageByCode } from '../i18n/languages'

function ReportPage() {
  const { applicationData } = useApp()
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

  if (!result) return <div className="mx-auto max-w-3xl"><Link to="/advisory" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline"><span aria-hidden="true">←</span> {t('res.backAdvisory')}</Link><section className="ui-card mt-8 text-center sm:p-8"><div className="ui-feature-icon mx-auto" aria-hidden="true">📋</div><h1 className="mt-4 text-2xl font-extrabold text-[var(--color-text)]">{t('rp.notReady')}</h1><p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--color-text-muted)]">{t('res.notReadyText')}</p><Button to="/finance" className="mt-6">{t('res.finish')}</Button></section></div>

  // Prefer the backend figure so this page and /analysis cannot disagree; the client-side sum stays as a fallback.
  const fundingGap = financial?.funding_gap ?? (business.initialInvestment !== undefined && finance.availableCapital !== undefined ? Math.max(Number(business.initialInvestment || 0) - Number(finance.availableCapital || 0), 0) : null)
  const feasibility = businessAnalysis?.feasibility_status
  const riskLevel = risk?.risk_level
  // Revenue for the chart comes from the response, never from `finance.monthlyRevenue` — that
  // field does not exist on the finance section at all, which was defect 5.
  const flowItems = [
    { label: t('f.income'), icon: '📥', value: financial?.expected_monthly_revenue, tone: 'neutral' },
    { label: t('f.spending'), icon: '📤', value: financial?.monthly_expenses, tone: 'warn' },
    { label: t('f.profit'), icon: '💚', value: financial?.monthly_profit, tone: Number(financial?.monthly_profit) > 0 ? 'good' : 'bad' },
  ].filter((item) => hasNumber(item.value)).map((item) => ({ ...item, value: Number(item.value), valueText: formatCurrency(item.value, t) }))
  const fundItems = [
    { label: t('ch.required'), icon: '🎯', value: financial?.initial_investment, tone: 'neutral' },
    { label: t('ch.inHand'), icon: '👛', value: financial?.available_capital, tone: 'good' },
    { label: t('ch.missing'), icon: '📌', value: fundingGap, tone: Number(fundingGap) > 0 ? 'warn' : 'good' },
  ].filter((item) => hasNumber(item.value)).map((item) => ({ ...item, value: Number(item.value), valueText: formatCurrency(item.value, t) }))

  return <div className="print:bg-white">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 print:hidden"><Link to="/advisory" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline"><span aria-hidden="true">←</span> {t('res.backAdvisory')}</Link><Button onClick={() => window.print()}><span aria-hidden="true">🖨️</span> {t('common.print')}</Button></div>
    <header className="ui-card sm:p-8"><p className="ui-eyebrow"><span aria-hidden="true">📄</span> {t('rp.eyebrow')}</p><h1 className="ui-page-title mt-1">{t('rp.title')}</h1><p className="ui-page-subtitle">{t('rp.subtitle')}</p></header>
    <section className="ui-card mt-6 sm:p-8"><div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center"><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-soft)] text-3xl" aria-hidden="true">{feasibility === 'feasible' ? '✅' : '📌'}</div><div><p className="ui-eyebrow">{t('rp.mainResult')}</p><h2 className="mt-1 text-2xl font-extrabold text-[var(--color-text)]">{statusText(feasibility, t)}</h2><p className="mt-2 leading-7 text-[var(--color-text-muted)]">{t('rp.mainResultText')}</p></div></div></section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon="💰" label={t('money.left')} value={formatCurrency(financial?.monthly_profit, t)} /><MetricCard icon="🏦" label={t('money.fundingNeeded')} value={formatCurrency(fundingGap, t)} /><MetricCard icon="📈" label={t('money.margin')} value={formatPercent(financial?.profit_margin_percent) || t('common.notAvailable')} /><MetricCard icon="🛡️" label={t('money.risk')} value={riskText(riskLevel, t)} /></section>
    <ReportSection icon="👤" title={t('rp.profile')}><div className="ui-simple-grid mt-5"><InfoItem label={t('rp.name')} value={profile.name} t={t} /><InfoItem label={t('location.state')} value={location.state} t={t} /><InfoItem label={t('location.district')} value={location.district} t={t} /><InfoItem label={t('common.language')} value={languageLabel} t={t} />{dialectLabel && <InfoItem label={t('common.dialect')} value={dialectLabel} t={t} />}<InfoItem label={t('rp.businessName')} value={business.businessName} t={t} /><InfoItem label={t('f.workType')} value={choiceText(businessAnalysis?.business_type || business.category, t)} t={t} /></div></ReportSection>
    <ReportSection icon="📍" title={t('an.marketHeading')}><div className="ui-simple-grid mt-5"><InfoItem label={t('rp.villageTown')} value={location.village} t={t} /><InfoItem label={t('rp.marketPlace')} value={choiceList(location.marketType, t)} t={t} /><InfoItem label={t('rp.customers')} value={location.customers} t={t} /><InfoItem label={t('rp.areaType')} value={choiceText(location.locationType, t)} t={t} /></div>{market.length > 0 ? <div className="mt-5 space-y-3">{market.map((row, index) => <MarketRow key={index} row={row} t={t} bt={bt} />)}</div> : <p className="mt-5 text-sm leading-6 text-[var(--color-text-muted)]">{t('mk.noData')}</p>}</ReportSection>
    <ReportSection icon="💵" title={t('rp.moneySummary')}><div className="ui-simple-grid mt-5"><InfoItem label={t('f.investment')} value={formatCurrency(business.initialInvestment, t)} t={t} /><InfoItem label={t('f.haveMoney')} value={formatCurrency(finance.availableCapital, t)} t={t} /><InfoItem label={t('rp.gap')} value={formatCurrency(fundingGap, t)} t={t} /><InfoItem label={t('f.sales')} value={formatCurrency(business.monthlyRevenue, t)} t={t} /><InfoItem label={t('f.spending')} value={formatCurrency(finance.monthlyExpenses, t)} t={t} /><InfoItem label={t('f.profit')} value={formatCurrency(financial?.monthly_profit, t)} t={t} /></div>
      {hasNumber(financial?.expected_monthly_revenue) && flowItems.length > 0 && <div className="ui-card-soft mt-5 p-4 sm:p-5"><h3 className="font-bold text-[var(--color-text)]">{t('ch.inOut')}</h3><div className="mt-4"><BarGroup items={flowItems} caption={t('ch.inOutCaption')} /></div></div>}
      {hasNumber(financial?.initial_investment) && fundItems.length > 0 && <div className="ui-card-soft mt-4 p-4 sm:p-5"><h3 className="font-bold text-[var(--color-text)]">{t('ch.fundTitle')}</h3><div className="mt-4"><BarGroup items={fundItems} caption={t('ch.fundCaption')} /></div></div>}
      <details className="ui-disclosure mt-5"><summary>{t('rp.detailedFigures')}</summary><div className="ui-disclosure-body ui-simple-grid"><InfoItem label={t('f.margin')} value={formatPercent(financial?.profit_margin_percent)} t={t} /><InfoItem label={t('f.yearReturn')} value={formatPercent(businessAnalysis?.estimated_roi_percent)} t={t} /><InfoItem label={t('f.emi')} value={formatCurrency(finance.monthlyEmi, t)} t={t} /><InfoItem label={t('f.debt')} value={formatCurrency(business.existingDebt, t)} t={t} /><InfoItem label={t('f.emiPressure')} value={formatPercent(risk?.pressure_ratio_percent)} t={t} /></div></details></ReportSection>
    <ReportSection icon="🧭" title={t('rp.nextTitle')}><div className="mt-5 space-y-4">{(recommendations.length ? recommendations.slice(0, 5) : [t('ad.step1'), t('ad.step2'), t('ad.step3'), t('ad.step4')]).map((item, index) => <ActionItem key={index} number={index + 1} text={item} />)}</div></ReportSection>
    <ReportSection icon="🏛️" title={t('an.govHeading')}>{schemes.length > 0 ? <div className="mt-5 space-y-4">{schemes.map((scheme, index) => <div key={scheme.name || index} className="ui-card-soft"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-[var(--color-text)]">{scheme.name || t('sc.name')}</h3>{hasNumber(scheme.match_score) && <span className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-sm font-bold text-[var(--color-text)]">{t('sc.matchPct', { n: Number(scheme.match_score).toLocaleString('en-IN') })}</span>}</div>{scheme.level && <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">{t('sch.runBy', { office: bt.schemeLevel(scheme) })}</p>}{scheme.description && <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{bt.schemeDescription(scheme)}</p>}</div>)}</div> : <p className="mt-4 leading-7 text-[var(--color-text-muted)]">{t('rp.noScheme')}</p>}<p className="mt-5 text-xs leading-5 text-[var(--color-text-muted)]">{t('rp.schemeNote')}</p></ReportSection>
    {observations.length > 0 && <ReportSection icon="🔎" title={t('rp.observations')}><div className="mt-5 space-y-3">{observations.map((item, index) => <div key={index} className="ui-card-soft p-4 text-sm leading-6 text-[var(--color-text-muted)]">{item}</div>)}</div></ReportSection>}
    <footer className="ui-card mt-6 text-center print:mt-8"><p className="text-sm leading-6 text-[var(--color-text-muted)]">{t('rp.footer')}</p></footer>
  </div>
}

function ReportSection({ icon, title, children }) { return <section className="ui-card mt-6 sm:p-8"><div className="flex min-w-0 items-center gap-3"><div className="ui-feature-icon shrink-0" aria-hidden="true">{icon}</div><h2 className="text-xl font-bold text-[var(--color-text)]">{title}</h2></div>{children}</section> }
function MetricCard({ icon, label, value }) { return <article className="ui-card"><div className="text-2xl" aria-hidden="true">{icon}</div><p className="mt-3 text-sm text-[var(--color-text-muted)]">{label}</p><p className="mt-1 text-xl font-extrabold text-[var(--color-text)]">{value}</p></article> }
function InfoItem({ label, value, t }) { return <div className="ui-card-soft p-4"><p className="text-sm text-[var(--color-text-muted)]">{label}</p><p className="mt-1 font-bold text-[var(--color-text)]">{statusText(value, t)}</p></div> }
// match_level says whether the row is the entrepreneur's own district or a same-state fallback, and the report must not blur the two.
function MarketRow({ row, t, bt }) { return <div className="ui-card-soft p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-[var(--color-text)]">{choiceText(row.business_category, t)} · {statusText(row.district, t)}</h3>{row.demand_indicator && <span className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-sm font-bold text-[var(--color-text)]">{demandText(row.demand_indicator, t)}</span>}</div><p className="mt-2 text-sm text-[var(--color-text-muted)]">{t('mk.price')}: <span className="font-bold text-[var(--color-text)]">{formatCurrency(row.indicative_price, t)}</span></p>{row.seasonality && <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{bt.seasonality(row)}</p>}<p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{row.match_level === 'district' ? t('mk.fromDistrict', { district: statusText(row.district, t) }) : t('mk.fromState', { district: statusText(row.district, t) })} {row.source ? t('mk.source', { source: bt.marketSource(row) }) : ''} {row.last_verified ? t('mk.checked', { date: row.last_verified }) : ''}</p></div> }
function ActionItem({ number, text }) { return <div className="flex items-start gap-4 rounded-xl border border-[var(--color-border)] p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] font-extrabold text-[var(--color-primary-strong)]">{number}</span><p className="pt-1 leading-7 text-[var(--color-text)]">{typeof text === 'string' ? text : JSON.stringify(text)}</p></div> }
// Guard the raw value, not Number(value): the backend sends null for anything it could not
// compute, and Number(null) is 0, which passes Number.isFinite and prints a confident '₹0'.
function hasNumber(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) }
function formatCurrency(value, t) { if (!hasNumber(value)) return t('common.notAvailable'); return '₹' + Number(value).toLocaleString('en-IN') }
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
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
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
// Whole-phrase keys, not a '{level} demand' template: composing the level word with
// the noun is a grammar problem in seven of the eight languages. An unrecognised
// value falls back to the bare label, so the raw lowercase 'high' never reaches the page.
const DEMAND_KEYS = { high: 'mk.demandHigh', medium: 'mk.demandMedium', low: 'mk.demandLow' }
function demandText(value, t) { const key = DEMAND_KEYS[String(value === undefined || value === null ? '' : value).trim().toLowerCase()]; return key ? t(key) : t('mk.demandLabel') }
// Returns null, not '0%', when the backend could not compute the percentage — null
// passes a !== undefined check and would otherwise render as the string 'null%'.
function formatPercent(value) { if (!hasNumber(value)) return null; return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '%' }

export default ReportPage

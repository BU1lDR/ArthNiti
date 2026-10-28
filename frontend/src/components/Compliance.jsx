import { useI18n } from '../i18n/LanguageContext'

// The registrations a business like the reader's usually has to ask about, as a short
// numbered list (result.compliance: Udyam, the local office, FSSAI and GST). Every limit,
// date and verdict is the backend's and nothing here compares or adds. The card never says
// a registration is required, only "usually needed", "depends", "probably not needed" or
// "ask the office", names the source of each limit with the date it was read, and tells the
// reader to confirm with the office. A step or case this build has no words for is left out
// and never shown as a code. `report` swaps only the heading, for the printed sheet.
const NEED_KEYS = {
  free: 'cl.need.free',
  ask: 'cl.need.ask',
  usually: 'cl.need.usually',
  depends: 'cl.need.depends',
  not_needed: 'cl.need.notNeeded',
}
const TITLE_KEYS = { udyam: 'cl.udyam.title', local: 'cl.local.title', fssai: 'cl.fssai.title', gst: 'cl.gst.title' }
const SOURCE_KEYS = { udyam_2026: 'cl.src.udyam', fssai_2017: 'cl.src.fssai', cbic_2019: 'cl.src.gst' }
const PLACE_KEYS = { panchayat: 'cl.local.panchayat', urban_body: 'cl.local.urban' }
const FSSAI_KIND_KEYS = { registration: 'cl.fssai.register', licence: 'cl.fssai.licence' }
const GST_CASE_KEYS = {
  within: 'cl.gst.within',
  above: 'cl.gst.above',
  between: 'cl.gst.between',
  farm_above: 'cl.gst.farmAbove',
}

// What each step says, or null when this build has no words for the case it was given.
const SENTENCES = {
  udyam: (step, t) => [
    t('cl.udyam.what'),
    hasNumber(step.schemes_requiring) && Number(step.schemes_requiring) > 0
      ? t('cl.udyam.schemes', { count: step.schemes_requiring })
      : null,
  ],
  local: (step, t) => (PLACE_KEYS[step.place] ? [t(PLACE_KEYS[step.place])] : null),
  fssai: (step, t) => {
    if (step.need === 'not_needed') return [t('cl.fssai.skip')]
    const kindKey = FSSAI_KIND_KEYS[step.kind]
    return [
      step.need === 'depends' ? t('cl.fssai.ifFood') : null,
      kindKey && hasNumber(step.sales_limit) ? t(kindKey, { limit: money(step.sales_limit, t) }) : null,
      hasNumber(step.food_per_day) && hasNumber(step.milk_per_day)
        ? t('cl.fssai.daily', { food: step.food_per_day, milk: step.milk_per_day })
        : null,
      step.dairy_exemption === true ? t('cl.fssai.dairy') : null,
    ]
  },
  gst: (step, t) => {
    if (!GST_CASE_KEYS[step.case]) return null
    const limits = step.state && hasNumber(step.goods_limit) && hasNumber(step.services_limit)
    return [
      limits ? t('cl.gst.limits', { state: step.state, goods: money(step.goods_limit, t), services: money(step.services_limit, t) }) : null,
      t(GST_CASE_KEYS[step.case]),
    ]
  },
}

function Compliance({ compliance, report = false }) {
  const { t } = useI18n()
  const steps = (Array.isArray(compliance?.steps) ? compliance.steps : [])
    .map((step) => ({ step, lines: drawn(step, t) }))
    .filter((entry) => entry.lines)
  if (steps.length === 0) return null

  return (
    <section className="ui-card mt-6 sm:p-8" data-compliance>
      {report ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="ui-feature-icon shrink-0" aria-hidden="true">📋</div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">{t('cl.title')}</h2>
        </div>
      ) : (
        <>
          <p className="ui-eyebrow">{t('cl.eyebrow')}</p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--color-text)]">{t('cl.title')}</h2>
        </>
      )}
      <p className="mt-3 leading-7 text-[var(--color-text-muted)]">{t('cl.intro')}</p>
      {hasNumber(compliance.yearly_sales) && (
        <p className="mt-2 leading-7 text-[var(--color-text)]">{t('cl.salesUsed', { amount: money(compliance.yearly_sales, t) })}</p>
      )}
      <ol className="mt-5 space-y-4">
        {steps.map(({ step, lines }, index) => (
          <li key={step.id} className="ui-card-soft p-4 sm:p-5" data-compliance-step={step.id}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="ui-formsection-num" aria-hidden="true">{index + 1}</span>
              <h3 className="min-w-0 flex-[1_1_9rem] font-bold text-[var(--color-text)]">{t(TITLE_KEYS[step.id])}</h3>
              <span className="inline-flex w-fit shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-sm font-bold text-[var(--color-text)]">
                {t(NEED_KEYS[step.need])}
              </span>
            </div>
            {lines.map((text) => (
              <p key={text} className="mt-2 text-sm leading-6 text-[var(--color-text)]">{text}</p>
            ))}
            {SOURCE_KEYS[step.source] && (
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{t(SOURCE_KEYS[step.source])}</p>
            )}
          </li>
        ))}
      </ol>
      <p className="ui-chart-caption">{t('cl.caption')}</p>
    </section>
  )
}

// The sentences of one step, or null when it cannot be drawn: an id or a need this build has
// no words for, or a case with none. tools/verify/drive.mjs keeps its own copy of this test.
function drawn(step, t) {
  if (!step || !TITLE_KEYS[step.id] || !NEED_KEYS[step.need] || !SENTENCES[step.id]) return null
  const lines = SENTENCES[step.id](step, t)
  const kept = Array.isArray(lines) ? lines.filter(Boolean) : []
  return kept.length > 0 ? kept : null
}

// Guard the raw value, not Number(value): the backend sends null for anything it could not
// compute, and Number(null) is 0, which passes Number.isFinite and prints a confident '₹0'.
function hasNumber(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) }
// A whole rupee prints bare and an amount with paise prints both decimals, sign before the symbol. The same rule as formatPrice on /report, copied on purpose like the page formatters.
function money(value, t) {
  if (!hasNumber(value)) return t('common.notAvailable')
  const amount = Number(value)
  const abs = Math.abs(amount)
  return (amount < 0 ? '-₹' : '₹') + (Number.isInteger(abs) ? abs.toLocaleString('en-IN') : abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

export default Compliance

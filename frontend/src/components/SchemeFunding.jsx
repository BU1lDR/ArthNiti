import { useI18n } from '../i18n/LanguageContext'

// What a scheme asks the reader to put in, what it pays and what is left to borrow,
// for the schemes the backend priced (result.scheme_funding: PMEGP, PMFME and Mudra).
// Every figure is the backend's and nothing here adds or compares. The card says it
// is an estimate from the terms each scheme has published: not an offer, and not a
// check that the reader qualifies. A scheme without a name in the matched list, and
// a band or case this build has no words for, is left out and never shown as a code.
// `report` swaps only the heading, for the printed sheet.
const MUDRA_BAND_KEYS = { shishu: 'elig.pmmy.shishu', kishore: 'elig.pmmy.kishore', tarun: 'elig.pmmy.tarun', tarun_plus: 'elig.pmmy.tarunPlus' }
const CASE_KEYS = { general: 'fs.caseGeneral', special: 'fs.caseSpecial' }
const AREA_KEYS = { rural: 'fs.areaRural', urban: 'fs.areaUrban' }
// Said when the cost is over the ceiling PMEGP counts, or the money over the PMFME cap.
const LIMIT_KEYS = { cost: 'fs.pmegpCeiling', subsidy: 'fs.pmfmeCap' }
// Caveats that belong to the terms the figures were worked from, so a new terms table brings its own.
const TERMS_NOTES = {
  kvic_2022: ['fs.pmegpLand', 'fs.pmegpDeposit', 'elig.pmegp.period'],
  mofpi_2021: ['elig.pmfme.upgrade'],
}

function SchemeFunding({ funding, schemes = [], report = false }) {
  const { t } = useI18n()
  if (funding?.status !== 'ok' || !hasNumber(funding.project_cost)) return null
  const named = (Array.isArray(funding.schemes) ? funding.schemes : [])
    .filter(isDrawable)
    .map((item) => ({ item, name: schemes.find((scheme) => scheme.scheme_id === item.scheme_id)?.name }))
    .filter((entry) => entry.name)
  if (named.length === 0) return null

  return (
    <section className="ui-card mt-6 sm:p-8" data-scheme-funding>
      {report ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="ui-feature-icon shrink-0" aria-hidden="true">📐</div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">{t('fs.title')}</h2>
        </div>
      ) : (
        <>
          <p className="ui-eyebrow">{t('fs.eyebrow')}</p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--color-text)]">{t('fs.title')}</h2>
        </>
      )}
      <p className="mt-3 leading-7 text-[var(--color-text-muted)]">{t('fs.intro', { cost: money(funding.project_cost, t) })}</p>
      {hasNumber(funding.funding_gap) && Number(funding.funding_gap) === 0 && (
        <p className="mt-2 leading-7 text-[var(--color-text)]">{t('fs.noGap')}</p>
      )}
      <div className="mt-5 space-y-4">
        {named.map(({ item, name }) => (
          <article key={item.scheme_id} className="ui-card-soft p-4 sm:p-5">
            <h3 className="font-bold text-[var(--color-text)]">{name}</h3>
            {item.kind === 'subsidy' ? <Subsidy item={item} t={t} /> : <Loan item={item} t={t} />}
          </article>
        ))}
      </div>
      <p className="ui-chart-caption">{t('fs.caption')}</p>
    </section>
  )
}

// A subsidy scheme draws one block per case. A case is titled only when there is more
// than one (PMEGP: general and special category), and the notes come after the blocks.
function Subsidy({ item, t }) {
  const several = item.cases.length > 1
  const areaKey = item.area_assumed ? 'fs.areaAssumed' : AREA_KEYS[item.area]
  const limitKey = item.limit_applied ? LIMIT_KEYS[item.limit_kind] : null
  const notes = [
    several ? t('fs.specialWho') : null,
    areaKey ? t(areaKey) : null,
    areaKey ? t('fs.areaWho') : null,
    limitKey ? t(limitKey, { limit: money(item.limit, t) }) : null,
    ...(TERMS_NOTES[item.terms] || []).map((key) => t(key)),
  ].filter(Boolean)
  return (
    <>
      <div className={several ? 'mt-3 grid gap-3 sm:grid-cols-2' : 'mt-3'}>
        {item.cases.map((fundCase) => (
          <Case key={fundCase.code} fundCase={fundCase} title={several && CASE_KEYS[fundCase.code] ? t(CASE_KEYS[fundCase.code]) : null} t={t} />
        ))}
      </div>
      {notes.map((text) => (
        <p key={text} className="mt-2 text-sm leading-6 text-[var(--color-text)]">{text}</p>
      ))}
    </>
  )
}

function Case({ fundCase, title, t }) {
  const short = hasNumber(fundCase.own_short_by) && Number(fundCase.own_short_by) > 0
  return (
    <div className={title ? 'min-w-0 rounded-xl border border-[var(--color-border)] p-3' : 'min-w-0'}>
      {title && <p className="font-bold text-[var(--color-text)]">{title}</p>}
      <dl className={(title ? 'mt-2 ' : '') + 'space-y-2 text-sm'}>
        <FundRow label={t('fs.own', { percent: fundCase.own_percent })} value={money(fundCase.own_amount, t)} />
        <FundRow label={t('fs.bank')} value={money(fundCase.bank_amount, t)} />
        <FundRow label={t('fs.subsidy', { percent: fundCase.subsidy_percent })} value={money(fundCase.subsidy_amount, t)} />
        <FundRow label={t('fs.net')} value={money(fundCase.net_loan_amount, t)} strong />
      </dl>
      {short && <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{t('fs.short', { amount: money(fundCase.own_short_by, t) })}</p>}
    </div>
  )
}

// Mudra is a loan with no subsidy and no stated own share, so the card names the loan
// size the money still needed falls in, or says it is above the biggest Mudra loan.
function Loan({ item, t }) {
  const above = item.band === 'above_limit'
  return (
    <>
      <p className="mt-3 text-sm leading-6 text-[var(--color-text)]">
        {t(above ? 'fs.mudraAbove' : 'fs.mudraBand', { amount: money(item.loan_amount, t), limit: money(item.band_limit, t) })}
      </p>
      {!above && <p className="mt-1 text-sm font-bold text-[var(--color-text)]">{t(MUDRA_BAND_KEYS[item.band])}</p>}
      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{t('fs.mudraLoanOnly')}</p>
    </>
  )
}

// Same row as the loan cards on /advisory. The last row of a case is the one that matters, so it is set apart.
function FundRow({ label, value, strong = false }) {
  return (
    <div className={'flex flex-wrap items-baseline justify-between gap-x-4' + (strong ? ' border-t border-[var(--color-border)] pt-2' : '')}>
      <dt className={'min-w-0 ' + (strong ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}>{label}</dt>
      <dd className="whitespace-nowrap font-bold text-[var(--color-text)]">{value}</dd>
    </div>
  )
}

// A kind or band this build has no words for is not drawn; tools/verify/drive.mjs keeps its own copy of this test.
function isDrawable(item) {
  if (item.kind === 'subsidy') return Array.isArray(item.cases) && item.cases.length > 0
  if (item.kind !== 'loan_band' || !hasNumber(item.loan_amount)) return false
  return item.band === 'above_limit' ? hasNumber(item.band_limit) : Boolean(MUDRA_BAND_KEYS[item.band])
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

export default SchemeFunding

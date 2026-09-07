import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { BarGroup } from '../components/Charts'
import { useApp } from '../context/AppContext'
import { useI18n } from '../i18n/LanguageContext'
import { LEVEL_ORDER, useBackendText } from '../i18n/backendText'

export default function SchemesPage() {
  const { applicationData } = useApp()
  const { t } = useI18n()
  // Prefers the backend's translatable codes, falls back to its English prose.
  const bt = useBackendText()
  const result = applicationData?.result
  const schemes = Array.isArray(result?.scheme_matches) ? result.scheme_matches : []

  // The comparison chart only earns its space once there is something to
  // compare, so it needs two or more schemes that actually carry a score. A
  // string entry or a missing score is skipped rather than drawn as a zero bar.
  const scored = schemes.filter((scheme) => typeof scheme !== 'string' && hasNumber(scheme?.match_score))
  // Two or more scored schemes is not enough. The scorer only ever returns 90
  // (open nationwide) or 100 (names your state), so a dozen matches draw a dozen
  // bars of two lengths — a chart that says nothing while pushing every card
  // below the fold. It has to show at least two *different* scores to be worth
  // the space, and a run of more than six bars is a wall rather than a glance.
  const distinctScores = new Set(scored.map((scheme) => Number(scheme.match_score))).size
  const showFitChart = distinctScores > 1 && scored.length > 1 && scored.length <= 6

  // Grouped by the office that runs the scheme, outward from Delhi to the
  // reader's own panchayat. The backend already sorted by (score, level, name),
  // so within a group the order is untouched; only the groups themselves are
  // reordered. Any level the backend adds without a LEVEL_ORDER entry still
  // renders, in its own group at the end, rather than disappearing from the page.
  const groups = groupByLevel(schemes)

  return (
    <>
      <Link to="/analysis" className="inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline">
        <span aria-hidden="true">←</span> {t('res.backAnalysis')}
      </Link>

      <header className="ui-page-intro">
        <p className="ui-eyebrow"><span aria-hidden="true">💰</span> {t('sch.eyebrow')}</p>
        <h1 className="ui-page-title">{t('sch.title')}</h1>
        <p className="ui-page-subtitle">{t('sch.subtitle')}</p>
      </header>

      {!result && (
        <section className="ui-card mt-8 text-center sm:p-8">
          <div className="ui-feature-icon mx-auto" aria-hidden="true">📋</div>
          <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]">{t('sch.finishTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">{t('sch.finishText')}</p>
          <Button to="/finance" className="mt-6">{t('res.finish')}</Button>
        </section>
      )}

      {result && schemes.length === 0 && (
        <section className="ui-card mt-8 sm:p-8">
          <div className="flex min-w-0 gap-4">
            <div className="ui-feature-icon shrink-0" aria-hidden="true">🔎</div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[var(--color-text)]">{t('sch.noneTitle')}</h2>
              <p className="mt-2 leading-7 text-[var(--color-text-muted)]">{t('sch.noneText')}</p>
              {/* Naming what is covered turns a dead end into a next step.
                  sch.noneCovered lists every kind of work the thirty schemes in
                  schemes.json between them support, so a reader whose trade is
                  close to one of them knows which button to go back and press. */}
              <p className="mt-3 leading-7 text-[var(--color-text-muted)]">{t('sch.noneCovered')}</p>
              <Button to="/business" variant="secondary" className="mt-5">{t('sch.changeWork')}</Button>
              <p className="mt-4 text-sm text-[var(--color-text-muted)]">{t('sch.alwaysCheck')}</p>
            </div>
          </div>
        </section>
      )}

      {schemes.length > 0 && (
        <div className="mt-8 space-y-5">
          <div className="ui-card-soft flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-bold text-[var(--color-text)]">{t('sch.found', { n: schemes.length })}</p>
              {/* Not 'start with the closest match' any more: the cards are
                  ordered by which office runs them, so the first one is no
                  longer the highest-scoring one. Saying otherwise would send a
                  reader to a nationwide scheme thinking it was their best fit. */}
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{t('sch.groupHint')}</p>
            </div>
            <span aria-hidden="true" className="shrink-0 text-2xl">👇</span>
          </div>

          {/* One glance before committing to any single card: the bars are all
              scaled against the same maximum, and the percentage is printed as
              text beside each one so the chart is never the only place it is. */}
          {showFitChart && (
            <section className="ui-card sm:p-8">
              <h2 className="text-lg font-bold text-[var(--color-text)]">{t('ch.schemeFit')}</h2>
              <div className="mt-5">
                <BarGroup
                  items={scored.map((scheme) => ({
                    label: scheme.name || t('sc.name'),
                    icon: '🏛️',
                    value: Number(scheme.match_score),
                    valueText: t('sc.matchPct', { n: scheme.match_score }),
                    tone: 'good',
                  }))}
                />
              </div>
            </section>
          )}

          {groups.map((group) => (
            <section key={group.level || 'unknown'} className="space-y-5">
              {/* The heading names the office and the line under it says where
                  the reader would physically go. That pairing is the point of
                  showing the tier at all — 'Block' on its own means nothing to
                  someone who has never been sent to a block office. */}
              <div className="ui-card-soft">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="ui-feature-icon shrink-0" aria-hidden="true">{LEVEL_ICONS[group.level] || '🏛️'}</div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-[var(--color-text)]">
                      {bt.levelLabel(group.level)} <span className="font-normal text-[var(--color-text-muted)]">({group.schemes.length})</span>
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{bt.levelNote(group.level)}</p>
                  </div>
                </div>
              </div>
              {group.schemes.map((scheme, index) => (
                <SchemeCard key={scheme.name || `scheme-${index}`} scheme={scheme} index={index} t={t} bt={bt} />
              ))}
            </section>
          ))}
        </div>
      )}

      <section className="ui-card-soft mt-8 border border-[var(--color-accent)] sm:p-8">
        <div className="flex min-w-0 gap-4">
          <div className="shrink-0 text-2xl" aria-hidden="true">⚠️</div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('sch.before')}</h2>
            <p className="mt-2 leading-7 text-[var(--color-text-muted)]">{t('sch.before1')}</p>
            <p className="mt-2 leading-7 text-[var(--color-text-muted)]">{t('sch.before2')}</p>
          </div>
        </div>
      </section>

      {result && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Button to="/analysis" variant="secondary" size="lg" className="w-full">
            <span aria-hidden="true">←</span> {t('res.backAnalysis')}
          </Button>
          <Button to="/advisory" size="lg" className="w-full">{t('sch.nextSteps')} <span aria-hidden="true">→</span></Button>
        </div>
      )}
    </>
  )
}

// One glyph per tier, getting smaller and nearer as the list goes down. Purely
// decorative — the heading beside it already names the office — so every use is
// aria-hidden.
const LEVEL_ICONS = {
  central: '🇮🇳',
  state: '🏛️',
  regional: '🗺️',
  district: '🏢',
  sub_district: '🏤',
  block: '🏘️',
  local_body: '🏠',
}

// Buckets the matches by `level`, LEVEL_ORDER first and anything unrecognised
// after it in the order it arrived. Empty buckets are dropped, so a category
// that only matches central schemes shows one heading rather than seven.
//
// A plain string entry (the legacy shape SchemeCard still handles) has no level;
// it falls into the catch-all group instead of throwing on a property read.
function groupByLevel(schemes) {
  const buckets = new Map()
  for (const scheme of schemes) {
    const level = typeof scheme === 'string' ? '' : String(scheme?.level || '').trim().toLowerCase()
    if (!buckets.has(level)) buckets.set(level, [])
    buckets.get(level).push(scheme)
  }
  const known = LEVEL_ORDER.filter((level) => buckets.has(level))
  const unknown = [...buckets.keys()].filter((level) => !LEVEL_ORDER.includes(level))
  return [...known, ...unknown].map((level) => ({ level, schemes: buckets.get(level) }))
}

function SchemeCard({ scheme, index, t, bt }) {
  if (typeof scheme === 'string') {
    return (
      <section className="ui-card sm:p-8">
        <div className="flex min-w-0 gap-4">
          <div className="ui-feature-icon shrink-0">{index + 1}</div>
          <p className="min-w-0 font-bold text-[var(--color-text)]">{scheme}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="ui-card sm:p-8">
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <div className="ui-feature-icon shrink-0" aria-hidden="true">🏛️</div>
            <div className="min-w-0">
              <p className="ui-eyebrow">{t('sch.eyebrow')}</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--color-text)]">{scheme.name || t('sc.name')}</h2>
            </div>
          </div>
          {/* Backend prose, translated via the scheme's description_code. The
              scheme NAME above stays English: it is the name on the official
              portal the user is sent to. */}
          {scheme.description && <p className="mt-4 leading-7 text-[var(--color-text-muted)]">{bt.schemeDescription(scheme)}</p>}
        </div>

        {hasNumber(scheme.match_score) && (
          <div className="shrink-0 rounded-2xl bg-[var(--color-surface-soft)] px-5 py-4 text-center" aria-label={t('sc.matchPct', { n: scheme.match_score })}>
            <p className="text-3xl font-extrabold text-[var(--color-primary-strong)]">{scheme.match_score}%</p>
            <p className="mt-1 text-sm font-bold text-[var(--color-text)]">{t('sc.match')}</p>
          </div>
        )}
      </div>

      {scheme.support_type && (
        <SchemeSection title={t('sc.support')}>
          <p className="leading-7 text-[var(--color-text-muted)]">{bt.schemeSupport(scheme)}</p>
        </SchemeSection>
      )}

      {Array.isArray(scheme.match_reasons) && scheme.match_reasons.length > 0 && (
        <SchemeSection title={t('sc.why')}>
          <BulletList items={bt.schemeReasons(scheme)} />
        </SchemeSection>
      )}

      <details className="ui-disclosure mt-6">
        <summary>{t('sc.showMore')}</summary>
        <div className="ui-disclosure-body space-y-5">
          {Array.isArray(scheme.eligibility_rules) && scheme.eligibility_rules.length > 0 && (
            <div>
              <h3 className="font-bold text-[var(--color-text)]">{t('sc.eligibility')}</h3>
              <div className="mt-3"><BulletList items={bt.schemeEligibility(scheme)} /></div>
            </div>
          )}
          {Array.isArray(scheme.documents) && scheme.documents.length > 0 && (
            <div>
              <h3 className="font-bold text-[var(--color-text)]">{t('sc.documents')}</h3>
              <div className="mt-3"><BulletList items={bt.schemeDocuments(scheme)} /></div>
            </div>
          )}
          {scheme.last_verified && (
            <p className="text-sm text-[var(--color-text-muted)]">{t('sc.verified', { date: scheme.last_verified })}</p>
          )}
        </div>
      </details>

      {scheme.official_url && (
        <div className="mt-6 border-t border-[var(--color-border)] pt-5">
          {/* No focus:outline-none and no focus:ring here on purpose. The
              unlayered a:focus-visible rule in index.css already draws the ring
              and cannot be removed anyway; a Tailwind ring would stack a second
              indicator on top of it, and ring-offset-* carries a default white
              offset colour that would show as a halo on a dark card. */}
          <a
            href={scheme.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center rounded-xl bg-[var(--color-btn)] px-5 py-3 font-bold text-[var(--color-on-btn)] transition hover:opacity-90"
          >
            {t('sc.openSite')} <span aria-hidden="true">↗</span>
          </a>
        </div>
      )}
    </section>
  )
}

function SchemeSection({ title, children }) {
  return (
    <div className="mt-6 min-w-0 border-t border-[var(--color-border)] pt-5">
      <h3 className="font-bold text-[var(--color-text)]">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function BulletList({ items }) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex min-w-0 gap-3 leading-7 text-[var(--color-text-muted)]">
          <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-xs font-bold text-[var(--color-primary-strong)]" aria-hidden="true">✓</span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  )
}

// Guards the RAW value, not Number.isFinite alone: the backend sends null for
// anything it could not compute, and Number(null) is 0, which would turn "no
// score" into a confident 0% bar. A genuine 0 still passes and still prints.
function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

import { Link } from 'react-router-dom'
import Button from '../components/Button'
import { useApp } from '../context/AppContext'

export default function SchemesPage() {
  const { applicationData } = useApp()
  const result = applicationData?.result
  const schemes = Array.isArray(result?.scheme_matches) ? result.scheme_matches : []

  return (
    <>
      <Link to="/analysis" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary-strong)] hover:underline">
        ← Back to your analysis
      </Link>

      <header className="ui-page-intro">
        <p className="ui-eyebrow">💰 Funding & Government Support</p>
        <h1 className="ui-page-title">Government schemes that may help you</h1>
        <p className="ui-page-subtitle">
          We found these schemes based on the business and financial details you provided.
          Open a scheme to see why it matched and what to check before applying.
        </p>
      </header>

      {!result && (
        <section className="ui-card mt-8 text-center sm:p-8">
          <div className="ui-feature-icon mx-auto">📋</div>
          <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]">Complete your assessment first</h2>
          <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">
            Finish your business and financial details so we can show support options relevant to you.
          </p>
          <Link to="/finance" className="mt-6 inline-block">
            <Button className="min-h-12 px-6">Continue assessment</Button>
          </Link>
        </section>
      )}

      {result && schemes.length === 0 && (
        <section className="ui-card mt-8 sm:p-8">
          <div className="flex min-w-0 gap-4">
            <div className="ui-feature-icon shrink-0">🔎</div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-[var(--color-text)]">No matching schemes found</h2>
              <p className="mt-2 leading-7 text-[var(--color-text-muted)]">
                The schemes we check do not cover the kind of work you selected. That is not a rejection — it only means we cannot confirm a match from what we know.
              </p>
              {/* Naming what is covered turns a dead end into a next step. Crop
                  farming on its own is not covered by these three schemes; the
                  allied activities below are. */}
              <p className="mt-3 leading-7 text-[var(--color-text-muted)]">
                The schemes we check support: shops and trading, manufacturing, services, food processing, dairy, poultry and beekeeping. If you also do any of these, go back and change the kind of business.
              </p>
              <Link to="/business" className="mt-5 inline-block">
                <Button variant="secondary" className="min-h-12 px-6">Change my business type</Button>
              </Link>
              <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                Always check the latest eligibility rules with the official government authority.
              </p>
            </div>
          </div>
        </section>
      )}

      {schemes.length > 0 && (
        <div className="mt-8 space-y-5">
          <div className="ui-card-soft flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-bold text-[var(--color-text)]">{schemes.length} support option{schemes.length === 1 ? '' : 's'} found</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Start with the highest-match options.</p>
            </div>
            <span aria-hidden="true" className="shrink-0 text-2xl">👉</span>
          </div>

          {schemes.map((scheme, index) => (
            <SchemeCard key={scheme.name || `scheme-${index}`} scheme={scheme} index={index} />
          ))}
        </div>
      )}

      <section className="ui-card-soft mt-8 border border-[var(--color-accent)] sm:p-8">
        <div className="flex min-w-0 gap-4">
          <div className="shrink-0 text-2xl" aria-hidden="true">⚠️</div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--color-text)]">Before you apply</h2>
            <p className="mt-2 leading-7 text-[var(--color-text-muted)]">
              A match score is only an indication. It does not mean final government eligibility or approval.
            </p>
            <p className="mt-2 leading-7 text-[var(--color-text-muted)]">
              Check the latest eligibility, benefits, documents and application process on the official scheme website.
            </p>
          </div>
        </div>
      </section>

      {result && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link to="/analysis">
            <Button variant="secondary" className="w-full min-h-12 py-4">
              ← Back to analysis
            </Button>
          </Link>
          <Link to="/advisory">
            <Button className="w-full min-h-12 py-4">Get my next steps →</Button>
          </Link>
        </div>
      )}
    </>
  )
}

function SchemeCard({ scheme, index }) {
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
              <p className="ui-eyebrow">Government support</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--color-text)]">{scheme.name || 'Government Scheme'}</h2>
            </div>
          </div>
          {scheme.description && <p className="mt-4 leading-7 text-[var(--color-text-muted)]">{scheme.description}</p>}
        </div>

        {scheme.match_score !== undefined && (
          <div className="shrink-0 rounded-2xl bg-[var(--color-surface-soft)] px-5 py-4 text-center" aria-label={`Match score ${scheme.match_score} percent`}>
            <p className="text-3xl font-extrabold text-[var(--color-primary-strong)]">{scheme.match_score}%</p>
            <p className="mt-1 text-sm font-bold text-[var(--color-text)]">Match</p>
          </div>
        )}
      </div>

      {scheme.support_type && (
        <SchemeSection title="What support is offered?">
          <p className="leading-7 text-[var(--color-text-muted)]">{scheme.support_type}</p>
        </SchemeSection>
      )}

      {Array.isArray(scheme.match_reasons) && scheme.match_reasons.length > 0 && (
        <SchemeSection title="Why this matched you">
          <BulletList items={scheme.match_reasons} />
        </SchemeSection>
      )}

      <details className="ui-disclosure mt-6">
        <summary>Show eligibility & application details</summary>
        <div className="ui-disclosure-body space-y-5">
          {Array.isArray(scheme.eligibility_rules) && scheme.eligibility_rules.length > 0 && (
            <div>
              <h3 className="font-bold text-[var(--color-text)]">Eligibility to check</h3>
              <div className="mt-3"><BulletList items={scheme.eligibility_rules} /></div>
            </div>
          )}
          {Array.isArray(scheme.documents) && scheme.documents.length > 0 && (
            <div>
              <h3 className="font-bold text-[var(--color-text)]">Documents you may need</h3>
              <div className="mt-3"><BulletList items={scheme.documents} /></div>
            </div>
          )}
          {scheme.last_verified && (
            <p className="text-sm text-[var(--color-text-muted)]">Last verified: {scheme.last_verified}</p>
          )}
        </div>
      </details>

      {scheme.official_url && (
        <div className="mt-6 border-t border-[var(--color-border)] pt-5">
          <a
            href={scheme.official_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center rounded-xl bg-[var(--color-primary-strong)] px-5 py-3 font-bold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)] focus:ring-offset-2"
          >
            Open official scheme website ↗
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

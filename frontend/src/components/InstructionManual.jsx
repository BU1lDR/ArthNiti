import { useEffect, useRef, useState } from 'react'
import Button from './Button'
import { useI18n } from '../i18n/LanguageContext'
import { LANGUAGES } from '../i18n/languages'

// The guide to the journey, for a reader who has never used a service like this
// and may not read well in any language.
//
// It is deliberately two things at once. Collapsed it is a small strip at the top
// of the landing page — in the normal flow, not floating over the content, because
// a dismissable overlay on first load is the pattern every user has learned to
// swipe away without reading. Expanded it is a modal, so the eight steps get the
// whole screen instead of competing with the hero.
//
// It carries its OWN language dropdown. The one in the utility bar is above the
// masthead and above the fold, which is exactly where a reader who cannot read
// the page is least likely to look; putting one inside the guide means the first
// thing they can do with the guide is make it readable.

const STEPS = [
  ['👤', 'nav.profile', 'man.s1'],
  ['🏪', 'nav.business', 'man.s2'],
  ['📍', 'nav.location', 'man.s3'],
  ['💰', 'nav.finance', 'man.s4'],
]

const RESULTS = [
  ['📊', 'nav.analysis', 'man.r1'],
  ['🛠️', 'nav.schemes', 'man.r2'],
  ['💡', 'nav.advisory', 'man.r3'],
  ['📄', 'nav.report', 'man.r4'],
]

// What the focus trap treats as a stop. Deliberately not a library: this panel
// holds one select, one close button and two footer buttons, and the general
// case has edge cases (contenteditable, iframes, shadow roots) that none of them
// can reach. `[tabindex="-1"]` is excluded so the panel itself — which is the
// focus target on open — is not also a stop in the cycle.
const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function InstructionManual() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const openerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    // Escape closes it, and the page behind must not scroll under the panel —
    // on a phone the scrim covers the viewport and a stray swipe would otherwise
    // move the landing page while the guide sits still on top of it.
    //
    // Tab and Shift+Tab wrap inside the panel, because the panel claims
    // aria-modal="true" and that has to be true. Without the wrap, a keyboard or
    // screen-reader user tabs off the last control and walks the entire landing
    // page behind an opaque scrim — announced, focusable, and invisible. The
    // reader most likely to open this guide is the one least able to recover
    // from that.
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        // Escape used to skip this and leave focus on a node that had just been
        // unmounted, which drops a keyboard user back at the top of the document.
        openerRef.current?.focus()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      // Queried on every Tab rather than captured once on open: changing the
      // language from the dropdown inside the panel re-renders its whole body,
      // so a list taken at open time would hold detached nodes and the trap
      // would send focus nowhere. getClientRects() rather than offsetParent —
      // it is the more robust "is this actually laid out" test inside a
      // position: fixed overlay.
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (element) => element.getClientRects().length > 0,
      )

      if (!focusable.length) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        // The panel itself is the focus target on open, so backwards from there
        // has to reach the end of the panel rather than the chrome behind it.
        if (active === panel || active === first || !panel.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !panel.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    // Focus the panel itself rather than the first control: a screen reader then
    // announces the guide's title before its language box, which is the order the
    // sighted reader gets.
    panelRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    // Send focus back where it came from, or a keyboard user lands at the top of
    // the document and has to walk the whole chrome again.
    openerRef.current?.focus()
  }

  return (
    <>
      <section className="ui-manual" aria-labelledby="manual-strip-title">
        <BookIcon className="ui-manual-icon" />
        <div className="ui-manual-strip-text">
          <p className="ui-manual-badge">{t('man.badge')}</p>
          <h2 className="ui-manual-strip-title" id="manual-strip-title">{t('man.title')}</h2>
          <p className="ui-manual-lead">{t('man.lead')}</p>
        </div>
        <button
          type="button"
          className="ui-manual-open"
          onClick={() => setOpen(true)}
          ref={openerRef}
          aria-expanded={open}
        >
          {t('man.open')} <span aria-hidden="true">↗</span>
        </button>
      </section>

      {open && (
        <div className="ui-manual-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
          <div
            className="ui-manual-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-title"
            tabIndex={-1}
            ref={panelRef}
          >
            <header className="ui-manual-head">
              <BookIcon className="ui-manual-icon" />
              <div className="min-w-0">
                <h2 className="ui-manual-title" id="manual-title">{t('man.title')}</h2>
                <p className="ui-manual-lead">{t('man.lead')}</p>
              </div>
              <button type="button" className="ui-icon-button ui-manual-close" onClick={close} aria-label={t('man.close')} title={t('man.close')}>
                <span aria-hidden="true">✕</span>
              </button>
            </header>

            <div className="ui-manual-body">
              {/* The guide's own language box. It drives the same global setting
                  as the one in the utility bar, so changing it here changes the
                  whole interface too — which is the honest behaviour: a reader who
                  needs the guide in Tamil needs the form in Tamil next. */}
              <label className="ui-manual-lang">
                <span className="ui-manual-lang-label"><span aria-hidden="true">🌐</span> {t('man.langLabel')}</span>
                <LanguageSelect />
              </label>

              <h3 className="ui-manual-section">{t('man.stepsTitle')}</h3>
              <ol className="ui-manual-list">
                {STEPS.map(([icon, titleKey, textKey], index) => (
                  <li className="ui-manual-step" key={titleKey}>
                    <span className="ui-manual-num">{index + 1}</span>
                    <span className="ui-manual-step-icon" aria-hidden="true">{icon}</span>
                    <span>
                      <span className="ui-manual-step-title">{t(titleKey)}</span>
                      <span className="ui-manual-step-text">{t(textKey)}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <h3 className="ui-manual-section">{t('man.resultsTitle')}</h3>
              <ul className="ui-manual-list">
                {RESULTS.map(([icon, titleKey, textKey]) => (
                  <li className="ui-manual-step" key={titleKey}>
                    <span className="ui-manual-step-icon" aria-hidden="true">{icon}</span>
                    <span>
                      <span className="ui-manual-step-title">{t(titleKey)}</span>
                      <span className="ui-manual-step-text">{t(textKey)}</span>
                    </span>
                  </li>
                ))}
              </ul>

              <div className="ui-card-soft ui-manual-note">
                <p className="ui-manual-note-title">{t('man.needTitle')}</p>
                <p className="ui-manual-note-text">{t('man.needText')}</p>
              </div>

              <div className="ui-card-soft ui-manual-note">
                <p className="ui-manual-note-title">{t('man.tipTitle')}</p>
                <p className="ui-manual-note-text">{t('man.tipText')}</p>
              </div>
            </div>

            <footer className="ui-manual-foot">
              <Button to="/profile" size="lg" onClick={close} className="w-full sm:w-auto">
                <span aria-hidden="true">🚀</span> {t('landing.cta')}
              </Button>
              <button type="button" className="ui-manual-secondary" onClick={close}>
                {t('man.close')}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}

// Only the language, not the dialect: the guide is the one place a reader is
// still working out what the service is, and a second cascading choice there is
// one decision too many. The dialect picker stays in the utility bar.
function LanguageSelect() {
  const { language, setLanguage, t } = useI18n()

  return (
    <select
      className="ui-manual-select"
      value={language}
      onChange={(event) => setLanguage(event.target.value)}
      title={t('common.language')}
    >
      {LANGUAGES.map((entry) => (
        <option key={entry.code} value={entry.code}>
          {entry.endonym}
          {entry.endonym === entry.name ? '' : ` · ${entry.name}`}
        </option>
      ))}
    </select>
  )
}

// The manual's icon: a bound book with a gold seal and a seedling coming out of
// it. Inline SVG and every colour a --book-* token, for the same reasons as
// BrandMark — one asset covers light and dark mode, and it stays crisp at the
// strip's size and in print. Never hardcode a hex here; the tokens are in
// index.css.
function BookIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      {/* The seedling, drawn first so the cover overlaps its stem. */}
      <path
        d="M60 54V16"
        fill="none"
        style={{ stroke: 'var(--book-sprout)', strokeWidth: 3.6, strokeLinecap: 'round' }}
      />
      <path d="M58 30C49 30 42 24 42 15C51 15 58 21 58 30Z" style={{ fill: 'var(--book-sprout)' }} />
      <path d="M62 34C62 24 69 17 78 17C78 27 71 34 62 34Z" style={{ fill: 'var(--book-sprout)' }} />

      {/* Cover, then the fore-edge page block sitting proud of its bottom edge. */}
      <rect x="16" y="44" width="88" height="56" rx="10" style={{ fill: 'var(--book-cover)' }} />
      <rect x="16" y="44" width="13" height="56" rx="10" style={{ fill: 'var(--book-spine)' }} />
      <rect x="30" y="86" width="66" height="12" rx="4" style={{ fill: 'var(--book-pages)' }} />
      <path
        d="M35 90h56M35 94h56"
        fill="none"
        style={{ stroke: 'var(--book-pageline)', strokeWidth: 1.6, strokeLinecap: 'round' }}
      />

      {/* The band and its seal. The rim is a larger filled circle rather than a
          stroke so it cannot pick up a stroke-width from anywhere above it. */}
      <rect x="53" y="44" width="16" height="43" style={{ fill: 'var(--book-band)' }} />
      <circle cx="61" cy="66" r="17" style={{ fill: 'var(--book-seal-rim)' }} />
      <circle cx="61" cy="65" r="14" style={{ fill: 'var(--book-seal)' }} />
    </svg>
  )
}

export default InstructionManual

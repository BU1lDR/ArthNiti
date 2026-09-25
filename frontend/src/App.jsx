import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BrandMark from './components/BrandMark'
import BrandWordmark from './components/BrandWordmark'
import Button from './components/Button'
import InstructionManual from './components/InstructionManual'
import { isStarted, useApp } from './context/AppContext'
import { SCHEMES_CHECKED_FROM, SCHEMES_CHECKED_TO, formatReviewDate } from './data/reviewDates'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import BusinessPage from './pages/BusinessPage'
import LocationPage from './pages/LocationPage'
import AnalysisPage from './pages/AnalysisPage'
import FinancePage from './pages/FinancePage'
import SchemesPage from './pages/SchemesPage'
import AdvisoryPage from './pages/AdvisoryPage'
import ReportPage from './pages/ReportPage'
import { APP_NAME } from './i18n/brand'
import { useI18n } from './i18n/LanguageContext'
import { LANGUAGES } from './i18n/languages'

const journey = [
  { path: '/profile', label: 'nav.profile', icon: '👤' },
  { path: '/business', label: 'nav.business', icon: '🏪' },
  { path: '/location', label: 'nav.location', icon: '📍' },
  { path: '/finance', label: 'nav.finance', icon: '💰' },
]

const resultLinks = [
  { path: '/analysis', label: 'nav.analysis', icon: '📊' },
  { path: '/schemes', label: 'nav.schemes', icon: '🛠️' },
  { path: '/advisory', label: 'nav.advisory', icon: '💡' },
  { path: '/report', label: 'nav.report', icon: '📄' },
]

// Three steps only. A stepper with a dozen sizes is a settings screen; this is a
// utility. The scale multiplies the reader's own browser font size rather than
// replacing it, so someone who already runs their browser at 20px keeps that.
const TEXT_SCALES = { sm: 0.94, md: 1, lg: 1.18 }

function ThemeToggle() {
  const { t } = useI18n()
  const [theme, setTheme] = useState(() => localStorage.getItem('sih-theme') || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('sih-theme', theme)
  }, [theme])

  const label = theme === 'light' ? t('common.darkMode') : t('common.lightMode')

  return (
    <button
      type="button"
      className="ui-utility-button"
      onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function TextSizeControl() {
  const { t } = useI18n()
  const [size, setSize] = useState(() => localStorage.getItem('sih-textsize') || 'md')

  useEffect(() => {
    const scale = TEXT_SCALES[size] || 1
    document.documentElement.style.setProperty('--ui-scale', String(scale))
    localStorage.setItem('sih-textsize', size)
  }, [size])

  const steps = [
    ['sm', 'A－', t('common.decreaseText')],
    ['md', 'A', t('common.normalText')],
    ['lg', 'A＋', t('common.increaseText')],
  ]

  return (
    <span className="ui-textsize" role="group" aria-label={t('common.textSize')}>
      {steps.map(([value, glyph, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setSize(value)}
          aria-pressed={size === value}
          aria-label={label}
          title={label}
        >
          {glyph}
        </button>
      ))}
    </span>
  )
}

// A ContrastToggle sat here until 8 September 2026, writing
// `data-contrast="high"` on <html> against a token block in index.css. Removed
// at the owner's instruction, together with every rule that read the attribute.
// A stale `sih-contrast` key may still be in a returning visitor's
// localStorage; nothing reads it any more, so it is inert rather than a bug.
//
// The answers now survive a refresh, so a refresh no longer clears them. This is
// the replacement: the only way back to an empty form without closing the tab.
// It renders only once there is something to lose, which keeps it from being
// clicked idly on a fresh load.
//
// It asks first. One tap used to wipe every answer with no way back, and the
// control sits in the same strip as the language and text-size buttons, where
// a thumb meant for one of those can land on it.
//
// A native <dialog> opened with showModal(), so the browser supplies what a
// modal needs: the page behind cannot be reached, Escape closes it, and focus
// stays inside. It is rendered into <body> rather than inside the utility strip,
// so it does not take on the strip's small light text.
//
// "No" comes first in the markup and is the one focused on opening. Enter or a
// stray tap on the default control must keep the answers, never clear them.
function StartOverButton() {
  const { applicationData, resetApplication } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const titleId = useId()
  const textId = useId()

  // isStarted lives in AppContext because it is derived from EMPTY. The list of
  // fields that used to be spelled out here covered 6 of the 16 answers, so it
  // went stale silently every time the form grew.
  if (!isStarted(applicationData)) return null

  const openDialog = () => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return

    dialog.showModal()
    // The first button in the dialog is "No". Button does not pass a ref
    // through, so it is found in the markup instead.
    dialog.querySelector('button')?.focus()
  }

  const keepAnswers = () => {
    dialogRef.current?.close()
  }

  const clearAnswers = () => {
    dialogRef.current?.close()
    resetApplication()
    navigate('/')
    // With nothing left to clear, this button and its dialog unmount, so the
    // focus close() just gave back to the button would fall to <body> and a
    // keyboard or screen-reader user would be sent to the top of the document.
    // Put it on the page instead. preventScroll, because useOpenAtTop owns the
    // scroll position on a route change.
    document.getElementById('main')?.focus({ preventScroll: true })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ui-utility-button"
        onClick={openDialog}
        title={t('common.startOver')}
        // The words beside the icon are not shown on a phone, so the button
        // carries its name itself instead of being announced as nothing.
        aria-label={t('common.startOver')}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">↺</span>
        <span className="hidden sm:inline">{t('common.startOver')}</span>
      </button>

      {createPortal(
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          aria-describedby={textId}
          // Fires for Escape as well as for either button, so focus goes back
          // to the control that opened the dialog in every case. After "Yes"
          // that control is gone, because there is nothing left to clear.
          onClose={() => triggerRef.current?.focus()}
          className="ui-card m-auto w-[min(28rem,calc(100%-2rem))] p-6 text-[var(--color-text)] backdrop:bg-[rgba(0,0,0,0.55)]"
        >
          <h2 id={titleId} className="text-lg font-extrabold">{t('common.startOverTitle')}</h2>
          <p id={textId} className="mt-2 text-base">{t('common.startOverText')}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button variant="primary" onClick={keepAnswers} className="w-full sm:w-auto">
              {t('common.startOverNo')}
            </Button>
            <Button variant="secondary" onClick={clearAnswers} className="w-full sm:w-auto">
              {t('common.startOverYes')}
            </Button>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  )
}

// Language first, dialect second, and the dialect list is filtered by the
// language — the same cascade as state and district.
function LanguagePicker() {
  const { language, setLanguage, dialect, setDialect, dialects, t } = useI18n()

  // The option-list colours live on .ui-utility-select in index.css, not here:
  // the open panel is native chrome on a permanently dark strip, so it must not
  // follow the theme tokens the way the rest of the page does.
  const selectClass =
    'ui-utility-select rounded-md border border-white/35 bg-transparent px-2 py-1 text-xs font-bold text-inherit outline-none'

  return (
    <>
      <label className="inline-flex items-center gap-2">
        <span className="sr-only">{t('common.chooseLanguage')}</span>
        <span aria-hidden="true">🌐</span>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className={selectClass}
          title={t('common.language')}
        >
          {LANGUAGES.map((entry) => (
            // Endonym first: a reader who cannot read English still recognises
            // their own script. The English name follows for everyone else.
            <option key={entry.code} value={entry.code}>
              {entry.endonym}
              {entry.endonym === entry.name ? '' : ` · ${entry.name}`}
            </option>
          ))}
        </select>
      </label>

      {/* Visible at every width. This was `hidden md:inline-flex` from the era
          when .ui-utilitybar-tools was one unbreakable row, so anything droppable
          got dropped to fit a phone. The row wraps now, and hiding this was the
          worst possible choice of what to drop: the reader most likely to need a
          dialect is the one on a phone, and the utility bar is the only place in
          the app that offers one. .ui-utility-select already gets a 44px minimum
          on a coarse pointer, so the tap target comes for free. */}
      {dialects.length > 1 && (
        <label className="inline-flex items-center gap-2">
          <span className="sr-only">{t('common.dialect')}</span>
          <select
            value={dialect}
            onChange={(event) => setDialect(event.target.value)}
            className={selectClass}
            title={t('common.dialect')}
          >
            <option value="">{t('common.dialect')}</option>
            {dialects.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

// Every route opens at the top of the page. In a single-page app the browser
// never resets the scroll offset — react-router swaps the component and the
// window stays exactly where it was — so tapping Continue at the bottom of
// /business landed on /location already scrolled past its heading. Every form
// step's Continue button sits at the bottom, so this hit the whole journey.
//
// Four details are load-bearing:
//
//   - useLayoutEffect, not useEffect. A layout effect runs before the browser
//     paints, so the new page is never shown at the old offset. useEffect runs
//     after paint and would flash the mid-scrolled page for one frame.
//   - `behavior: 'instant'` rather than the two-argument scrollTo(0, 0). Both
//     are instant today because nothing sets `scroll-behavior: smooth`, but the
//     two-argument form obeys that property if anyone ever adds it — and a
//     half-second animated scroll on every navigation would also move geometry
//     under the fixed sleeps every browser verifier measures at.
//   - A non-empty hash is left alone. `#how-it-works` and the `#main` skip link
//     are same-page anchors, so they do not change `pathname` and this effect
//     does not re-run on them — but a cold deep link to /#how-it-works would,
//     and scrolling to the top there would defeat the anchor.
//   - scrollRestoration is 'manual'. Left on 'auto' the browser restores the
//     previous offset on back/forward ASYNCHRONOUSLY, i.e. possibly after this
//     effect has already run, which reintroduces the exact bug via the back
//     button. Accepted consequence: a refresh now also opens at the top. The
//     answers survive it either way — they are in sessionStorage, not in the
//     scroll position.
function useOpenAtTop(pathname, hash) {
  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useLayoutEffect(() => {
    if (hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
}

function AppShell({ children }) {
  const location = useLocation()
  const { t } = useI18n()
  const isJourneyPage = journey.some((item) => item.path === location.pathname)
  const isResultPage = resultLinks.some((item) => item.path === location.pathname)
  const isLanding = location.pathname === '/'

  useOpenAtTop(location.pathname, location.hash)

  return (
    <div className="ui-shell">
      <a className="ui-skip-link" href="#main">
        {t('common.skipToMain')}
      </a>

      {/* Tools only. The wordmark used to sit at the left of this strip and now
          serves as the masthead's product name instead, so the strip carries no
          branding at all — see the .ui-utilitybar-inner rule, which right-aligns
          the cluster explicitly rather than relying on space-between. */}
      <div className="ui-utilitybar">
        <div className="ui-utilitybar-inner">
          <div className="ui-utilitybar-tools">
            <LanguagePicker />
            <TextSizeControl />
            <ThemeToggle />
            <StartOverButton />
          </div>
        </div>
      </div>

      <header className="ui-masthead">
        <div className="ui-masthead-inner">
          {/* The wordmark reads APP_NAME itself, and APP_NAME rather than t() is
              the point: the product name is a proper noun and does not change
              when the interface language does — see i18n/brand.js.

              This was a plain bold <span className="ui-brand-name"> until 11 Sept
              2026, when the owner asked for the styled wordmark here instead of
              in the utility strip. The masthead is a THEMED surface, unlike the
              strip, which is why --wordmark-* gained a dark case — see the token
              block in index.css. */}
          <Link to="/" className="ui-brand" aria-label={`${APP_NAME} — ${t('nav.home')}`}>
            <BrandMark />
            <span>
              <BrandWordmark className="ui-wordmark-brand" />
              <span className="ui-brand-sub">{t('common.appTagline')}</span>
            </span>
          </Link>

          <div className="ui-header-actions">
            {/* The only link to /login anywhere in the app, so `hidden
                sm:inline-flex` did not shorten the masthead on a phone — it made
                the page unreachable on the device the target user actually holds.
                .ui-masthead-inner wraps, so the button takes its own row rather
                than squeezing the brand block. min-h-11 because these are
                Tailwind utilities, not .ui-utility-button, so the 44px rule in
                the coarse-pointer block does not reach them: py-2 on text-sm is a
                36px target. Same pattern as the eight journey back links. */}
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)]"
            >
              {t('common.login')}
            </Link>
          </div>
        </div>
      </header>

      <div className="ui-tricolour" aria-hidden="true" />

      <nav className="ui-navbar" aria-label={t('nav.journey')}>
        <div className="ui-navbar-inner">
          <NavLink to="/" end className={({ isActive }) => `ui-navbar-link ${isActive ? 'is-active' : ''}`}>
            <span aria-hidden="true">🏠</span>
            {t('nav.home')}
          </NavLink>
          {[...journey, ...resultLinks].map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `ui-navbar-link ${isActive ? 'is-active' : ''}`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {t(item.label)}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* tabIndex -1 so script can focus it (after Start over) without adding
          it to the Tab order. The skip link's #main target works either way. */}
      <main className="ui-main" id="main" tabIndex={-1}>
        {!isLanding && <Breadcrumb pathname={location.pathname} />}
        {(isJourneyPage || isResultPage) && (
          <JourneyBar isResultPage={isResultPage} currentPath={location.pathname} />
        )}
        {children}
      </main>

      <GovFooter />
    </div>
  )
}

// The last crumb has to name the page the reader is on. Only two routes are
// outside the journey and the results — /login and the catch-all — and both used
// to fall back to the product name, which reads as though the page itself were
// called अर्थNiti and tells a lost reader nothing about where they landed.
const CRUMB_FALLBACK = { '/login': 'common.login' }

function Breadcrumb({ pathname }) {
  const { t } = useI18n()
  const current = [...journey, ...resultLinks].find((item) => item.path === pathname)
  const label = current ? current.label : CRUMB_FALLBACK[pathname] || 'nf.title'

  return (
    <nav className="ui-breadcrumb" aria-label={t('common.breadcrumb')}>
      <Link to="/">{t('nav.home')}</Link>
      <span className="ui-breadcrumb-sep" aria-hidden="true">›</span>
      <span>{t(label)}</span>
    </nav>
  )
}

function GovFooter() {
  const { t } = useI18n()

  return (
    <>
      <div className="ui-footer-gov">
        <div className="ui-footer-inner">
          <div>
            {/* Government footers lead with the owning body's emblem. Ours leads
                with the mark, which is also the one place on the page where it
                appears at rest rather than as a link target.

                The mark sits BESIDE the text, not above it. Stacked, it was in
                the flow ahead of this column's heading and pushed it ~50px below
                "Your business journey" and "Where to get help" — so the three columns
                started their text on three different lines. Beside it, all three
                headings share a baseline and so do the three body lines. See
                .ui-footer-brandblock. */}
            <div className="ui-footer-brandblock">
              <BrandMark size="sm" />
              <div>
                <p className="ui-footer-title">{APP_NAME}</p>
                <p>{t('common.appTagline')}</p>
              </div>
            </div>
          </div>
          <div>
            <p className="ui-footer-title">{t('nav.journey')}</p>
            <p>
              {journey.map((item, index) => (
                <span key={item.path}>
                  {index > 0 && ' · '}
                  <Link to={item.path} className="text-[var(--color-primary-strong)]">
                    {t(item.label)}
                  </Link>
                </span>
              ))}
            </p>
          </div>
          <div>
            <p className="ui-footer-title">{t('common.helpTitle')}</p>
            <p>{t('common.helpText')}</p>
          </div>
        </div>
      </div>

      <div className="ui-footer-bottom">
        <div className="ui-footer-bottom-inner">
          <span>{t('common.disclaimer')}</span>
          {/* A range, not one date: the schemes were not all checked on the same
              day. The dates come from data/reviewDates.js, which a backend test
              holds to schemes.json, and the sentence is one key so no language
              gets an English colon glued to its words. */}
          <span>
            {t('common.schemesChecked', {
              from: formatReviewDate(SCHEMES_CHECKED_FROM),
              to: formatReviewDate(SCHEMES_CHECKED_TO),
            })}
          </span>
        </div>
      </div>
    </>
  )
}

function JourneyBar({ isResultPage, currentPath }) {
  const { t } = useI18n()
  const steps = isResultPage ? resultLinks : journey
  const currentIndex = steps.findIndex((step) => step.path === currentPath)

  // The dots are decoration and are marked aria-hidden: the label beside them
  // already says which step this is, so per-dot labels were four redundant
  // announcements — and an aria-label on a plain <div> with no role is ignored by
  // most screen readers anyway, so those labels were untranslated English doing
  // nothing.
  //
  // The four journey pages print their own "Step N of 4" chip next to the back
  // link, so printing it here too showed the same number twice on one screen.
  // The result pages have no such chip, so there it stays visible. Either way the
  // number is announced, because the dots themselves say nothing.
  const stepText = t('common.stepOf', { n: currentIndex + 1, total: steps.length })
  const sectionText = isResultPage ? t('nav.results') : t('nav.journey')

  return (
    <div className="ui-progress">
      {steps.map((step, index) => (
        <div
          key={step.path}
          aria-hidden="true"
          className={`ui-progress-step ${index < currentIndex ? 'is-complete' : ''} ${index === currentIndex ? 'is-active' : ''}`}
        />
      ))}
      <span className="ui-progress-label">
        <span className={isResultPage ? undefined : 'sr-only'}>{stepText} · </span>
        {sectionText}
      </span>
    </div>
  )
}

function LandingPage() {
  const { t } = useI18n()

  return (
    <div>
      {/* Above the hero, not inside it: the artwork backdrop lives on .ui-hero,
          and a help card is the one thing on this page that must not have a
          picture behind its text. */}
      <InstructionManual />

      {/* px-* is as load-bearing as py-* here, and it was missing until 8 Sept 2026.
          The artwork is a ::before pinned to `inset: 0`, and for an absolutely
          positioned box `inset` resolves against the host's PADDING box — so this
          padding insets the content while the artwork still covers the whole
          section. Measured before the fix: every hero child sat 0px from the
          artwork's left edge at every width, and below 800px the heading and
          subtitle touched BOTH edges, so a full-width button's border landed
          exactly on the photo's border. The vertical inset was already 56/32px,
          which is why the imbalance read as a mis-crop.

          Both paddings switch on `lg` on purpose. index.css's own breakpoints are
          800px and 640px, and using one of those here would open a 800-1024px band
          with a 56px vertical inset next to a 20px horizontal one.

          Deliberate consequence: the heading no longer shares a vertical line with
          the breadcrumb above or "What we offer" below. That is the panel reading,
          not a misalignment — .ui-card insets its own content the same way — and it
          is the only option that cannot overflow. Bleeding the artwork outward
          instead keeps the line but needs a clamp against .ui-main's margin, which
          is 16px at 1024px and 12px at 390px, so any fixed bleed puts the artwork
          off-canvas and trips mobile-audit's OVERFLOW. */}
      <section className="ui-hero grid min-h-[calc(100vh-320px)] items-center gap-10 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-14">
        <div>
          {/* The greeting, not the product name. `greeting.hello` was translated
              into all 8 languages and overridden by 9 of the 9 dialect phrase
              sets — and rendered nowhere in the app, so it was 8 translations and
              9 overrides of dead weight.

              That mattered beyond the waste: DIALECT_PHRASES overrides exactly
              three keys, and for ta-madurai, te-telangana, ml-malabar and
              bn-sylheti the other two are `landing.cta` (Hindi dialects only) and
              `money.left` (a result page). So picking one of those four dialects
              changed nothing a reader could see until they had filled in all four
              forms. The greeting is the one string where a dialect is instantly
              recognisable, which is the whole point of the feature.

              The brand is not lost: the wordmark is in the masthead, directly
              above this line. */}
          <p className="ui-eyebrow">{t('greeting.hello')}</p>
          <h1 className="ui-page-title max-w-3xl text-[clamp(2.1rem,5vw,3.9rem)]">
            {t('landing.title')}
          </h1>
          <p className="ui-page-subtitle mt-6 max-w-2xl text-lg sm:text-xl">{t('landing.subtitle')}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button to="/profile" size="lg" className="w-full sm:w-auto">
              <span aria-hidden="true">🚀</span> {t('landing.cta')}
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 font-bold text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)]"
            >
              {t('landing.offerEyebrow')} <span aria-hidden="true">↓</span>
            </a>
          </div>

          {/* Full-strength text, not the muted grey these would normally use.
              This used to say the artwork is "at its strongest" here because the
              SVG's softTop mask ramped to 1 at the bottom edge. That mask went with
              the SVG on 8 Sept 2026 — the JPEG is opaque and `cover` fills the box,
              so there is no weak end any more and every line in the hero sits on
              full-strength artwork. The reason for the full-strength text is now
              simply that at 14px this is "normal text" for WCAG and needs the whole
              4.5:1 with no help from anywhere. */}
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-[var(--color-text)]">
            <span><span aria-hidden="true">✓</span> {t('landing.chip1')}</span>
            <span><span aria-hidden="true">✓</span> {t('landing.chip2')}</span>
            <span><span aria-hidden="true">✓</span> {t('landing.chip3')}</span>
          </div>
        </div>

        <div className="ui-card relative overflow-hidden p-6 sm:p-8">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[var(--color-accent)] opacity-40 blur-3xl" aria-hidden="true" />
          <div className="relative">
            {/* gap-4 / min-w-0 / shrink-0 are all three load-bearing, and the row
                had none of them. justify-between leaves NO space between the
                children once the slack runs out, and a flex item will not shrink
                past its min-content width without min-width: 0 — so a title that
                grew in translation pushed straight into the badge instead of
                wrapping. Measured flush at 0px in Tamil, Telugu, Malayalam and
                Kannada; the heading's first line ran under the ✓. */}
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--color-text-muted)]">{t('landing.miniLead')}</p>
                <h2 className="mt-1 text-2xl font-extrabold">{t('landing.miniTitle')}</h2>
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-btn)] text-xl text-[var(--color-on-btn)]" aria-hidden="true">✓</span>
            </div>

            <div className="space-y-3">
              <MiniCard icon="💰" title={t('landing.money.title')} text={t('landing.money.text')} />
              <MiniCard icon="🛠️" title={t('landing.schemes.title')} text={t('landing.schemes.text')} />
              <MiniCard icon="💡" title={t('landing.next.title')} text={t('landing.next.text')} />
            </div>

            <div className="ui-card-soft mt-5 p-4">
              <p className="text-sm font-bold">{t('landing.detailTitle')}</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('landing.detailText')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Top padding, not just the hero's bottom padding: the street artwork is a
          ::before pinned to `inset: 0` of .ui-hero, so its bottom edge lands
          exactly where the hero section ends and the eyebrow chip below it had
          nothing to sit against. */}
      <section id="how-it-works" className="scroll-mt-24 pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="ui-page-intro">
          <p className="ui-eyebrow">{t('landing.offerEyebrow')}</p>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t('landing.offerTitle')}</h2>
        </div>
        <div className="ui-simple-grid">
          <Feature icon="📍" title={t('landing.f1.title')}>{t('landing.f1.text')}</Feature>
          <Feature icon="📈" title={t('landing.f2.title')}>{t('landing.f2.text')}</Feature>
          <Feature icon="🤝" title={t('landing.f3.title')}>{t('landing.f3.text')}</Feature>
        </div>
      </section>
    </div>
  )
}

function MiniCard({ icon, title, text }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--color-surface-soft)] text-lg" aria-hidden="true">{icon}</span>
      <div>
        <h3 className="font-extrabold">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{text}</p>
      </div>
    </div>
  )
}

function Feature({ icon, title, children }) {
  return (
    <article className="ui-card ui-feature-card">
      <div className="ui-feature-icon" aria-hidden="true">{icon}</div>
      <h3 className="ui-feature-title">{title}</h3>
      <p className="ui-feature-text">{children}</p>
    </article>
  )
}

function NotFoundPage() {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-2xl">
      <section className="ui-card p-5 text-center sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-3xl" aria-hidden="true">
          🧭
        </div>
        <h1 className="mt-5 text-2xl font-extrabold sm:text-3xl">{t('nf.title')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">{t('nf.text')}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/" className="w-full sm:w-auto">{t('nf.home')}</Button>
          <Button to="/profile" variant="secondary" className="w-full sm:w-auto">
            {t('landing.cta')}
          </Button>
        </div>
      </section>
    </div>
  )
}

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/business" element={<BusinessPage />} />
        <Route path="/location" element={<LocationPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/schemes" element={<SchemesPage />} />
        <Route path="/advisory" element={<AdvisoryPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  )
}

export default App

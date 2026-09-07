import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import BrandMark from './components/BrandMark'
import BrandWordmark from './components/BrandWordmark'
import Button from './components/Button'
import InstructionManual from './components/InstructionManual'
import { useApp } from './context/AppContext'
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

function ContrastToggle() {
  const { t } = useI18n()
  const [high, setHigh] = useState(() => localStorage.getItem('sih-contrast') === 'high')

  useEffect(() => {
    if (high) {
      document.documentElement.dataset.contrast = 'high'
    } else {
      delete document.documentElement.dataset.contrast
    }
    localStorage.setItem('sih-contrast', high ? 'high' : 'normal')
  }, [high])

  return (
    <button
      type="button"
      className="ui-utility-button"
      onClick={() => setHigh((current) => !current)}
      aria-pressed={high}
      title={t('common.highContrast')}
    >
      <span aria-hidden="true">◐</span>
      <span className="hidden sm:inline">{t('common.highContrast')}</span>
    </button>
  )
}

// The answers now survive a refresh, so a refresh no longer clears them. This is
// the replacement: the only way back to an empty form without closing the tab.
// It renders only once there is something to lose, which keeps it from being
// clicked idly on a fresh load.
function StartOverButton() {
  const { applicationData, resetApplication } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()

  const { profile, business, location, finance, result } = applicationData
  const started = Boolean(
    result ||
      profile.name ||
      business.businessName ||
      business.category ||
      location.state ||
      finance.availableCapital,
  )

  if (!started) return null

  return (
    <button
      type="button"
      className="ui-utility-button"
      onClick={() => {
        resetApplication()
        navigate('/')
      }}
      title={t('common.startOver')}
    >
      <span aria-hidden="true">↺</span>
      <span className="hidden sm:inline">{t('common.startOver')}</span>
    </button>
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

      {dialects.length > 1 && (
        <label className="hidden items-center gap-2 md:inline-flex">
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

function AppShell({ children }) {
  const location = useLocation()
  const { t } = useI18n()
  const isJourneyPage = journey.some((item) => item.path === location.pathname)
  const isResultPage = resultLinks.some((item) => item.path === location.pathname)
  const isLanding = location.pathname === '/'

  return (
    <div className="ui-shell">
      <a className="ui-skip-link" href="#main">
        {t('common.skipToMain')}
      </a>

      <div className="ui-utilitybar">
        <div className="ui-utilitybar-inner">
          <BrandWordmark />
          <div className="ui-utilitybar-tools">
            <LanguagePicker />
            <TextSizeControl />
            <ContrastToggle />
            <ThemeToggle />
            <StartOverButton />
          </div>
        </div>
      </div>

      <header className="ui-masthead">
        <div className="ui-masthead-inner">
          {/* APP_NAME, not t(). The product name is a proper noun and does not
              change when the interface language does — see i18n/brand.js. */}
          <Link to="/" className="ui-brand" aria-label={`${APP_NAME} — ${t('nav.home')}`}>
            <BrandMark />
            <span>
              <span className="ui-brand-name">{APP_NAME}</span>
              <span className="ui-brand-sub">{t('common.appTagline')}</span>
            </span>
          </Link>

          <div className="ui-header-actions">
            <Link
              to="/login"
              className="hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--color-text)] transition hover:bg-[var(--color-surface-soft)] sm:inline-flex"
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

      <main className="ui-main" id="main">
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
                appears at rest rather than as a link target. */}
            <BrandMark size="sm" className="mb-3" />
            <p className="ui-footer-title">{APP_NAME}</p>
            <p>{t('common.appTagline')}</p>
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
            <p className="ui-footer-title">{t('common.helpline')}</p>
            {/* The real national MSME helpline, so the page ends on something a
                user can actually act on. */}
            <p>Udyami Helpline 1800-11-6666</p>
          </div>
        </div>
      </div>

      <div className="ui-footer-bottom">
        <div className="ui-footer-bottom-inner">
          <span>{t('common.disclaimer')}</span>
          <span>{t('common.lastReviewed')}: 07/09/2026</span>
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

      <section className="ui-hero grid min-h-[calc(100vh-320px)] items-center gap-10 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-14">
        <div>
          <p className="ui-eyebrow">{APP_NAME}</p>
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
              This line sits lowest in the hero, which is where the street artwork
              behind it is at its strongest — the softTop mask ramps to 1 at the
              bottom edge — so it is the worst-case pairing on the page. At 14px
              it is "normal text" for WCAG, so it needs the full 4.5:1. */}
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

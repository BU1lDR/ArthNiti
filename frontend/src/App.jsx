import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Button from './components/Button'
import ProfilePage from './pages/ProfilePage'
import BusinessPage from './pages/BusinessPage'
import LocationPage from './pages/LocationPage'
import AnalysisPage from './pages/AnalysisPage'
import FinancePage from './pages/FinancePage'
import SchemesPage from './pages/SchemesPage'
import AdvisoryPage from './pages/AdvisoryPage'
import ReportPage from './pages/ReportPage'

const journey = [
  { path: '/profile', label: 'Profile', icon: '👤' },
  { path: '/business', label: 'Business', icon: '🏪' },
  { path: '/location', label: 'Location', icon: '📍' },
  { path: '/finance', label: 'Finance', icon: '💰' },
]

const resultLinks = [
  { path: '/analysis', label: 'Analysis', icon: '📊' },
  { path: '/schemes', label: 'Schemes', icon: '🛠️' },
  { path: '/advisory', label: 'Advice', icon: '💡' },
  { path: '/report', label: 'Report', icon: '📄' },
]

function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem('sih-theme') || 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('sih-theme', theme)
  }, [theme])

  return (
    <button
      type="button"
      className="ui-icon-button"
      onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}

function AppShell({ children }) {
  const location = useLocation()
  const isJourneyPage = journey.some((item) => item.path === location.pathname)
  const isResultPage = resultLinks.some((item) => item.path === location.pathname)

  return (
    <div className="ui-shell">
      <header className="ui-topbar">
        <div className="ui-topbar-inner">
          <Link to="/" className="ui-brand" aria-label="Sahyog home">
            <span className="ui-brand-mark" aria-hidden="true">स</span>
            <span className="ui-brand-name">Sahyog</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <NavLink to="/" className="rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-[var(--color-surface-soft)]">Home</NavLink>
            {journey.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-[var(--color-surface-soft)] ${isActive ? 'bg-[var(--color-surface-soft)] text-[var(--color-primary-strong)]' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ui-header-actions">
            <span className="hidden text-sm font-semibold text-[var(--color-text-muted)] sm:inline">Hindi / English</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="ui-main">
        {(isJourneyPage || isResultPage) && <JourneyBar isResultPage={isResultPage} currentPath={location.pathname} />}
        {children}
      </main>

      <footer className="ui-footer">
        <div className="flex flex-col justify-between gap-2 border-t border-[var(--color-border)] pt-5 sm:flex-row">
          <span>Sahyog · Your business, your next step.</span>
          <span>Simple by default · Detailed when you need it.</span>
        </div>
      </footer>
    </div>
  )
}

function JourneyBar({ isResultPage, currentPath }) {
  const steps = isResultPage ? resultLinks : journey
  const currentIndex = steps.findIndex((step) => step.path === currentPath)

  return (
    <div className="ui-progress" aria-label="Application progress">
      {steps.map((step, index) => (
        <div
          key={step.path}
          className={`ui-progress-step ${index < currentIndex ? 'is-complete' : ''} ${index === currentIndex ? 'is-active' : ''}`}
          aria-label={`${step.label}: ${index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming'}`}
        />
      ))}
      <span className="ui-progress-label">
        {isResultPage ? `${currentIndex + 1} of ${steps.length} · Your results` : `${currentIndex + 1} of ${steps.length} · Your business journey`}
      </span>
    </div>
  )
}

function LandingPage() {
  return (
    <div>
      <section className="grid min-h-[calc(100vh-150px)] items-center gap-10 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
        <div>
          <p className="ui-eyebrow">🌱 AI-powered business guidance</p>
          <h1 className="ui-page-title max-w-3xl text-[clamp(2.5rem,6vw,4.8rem)]">
            Start your business journey with confidence.
          </h1>
          <p className="ui-page-subtitle mt-6 max-w-2xl text-lg sm:text-xl">
            Tell us about yourself and your business. We will turn your information into simple financial guidance, useful schemes, local insights, and clear next steps.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/profile">
              <Button className="w-full px-7 py-4 sm:w-auto">🚀 Start my journey</Button>
            </Link>
            <Link to="/analysis" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 font-bold text-[var(--color-text)] shadow-sm transition hover:bg-[var(--color-surface-soft)]">
              See how it works
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-[var(--color-text-muted)]">
            <span>✓ Simple language</span>
            <span>✓ Local context</span>
            <span>✓ Scheme matching</span>
          </div>
        </div>

        <div className="ui-card relative overflow-hidden p-6 sm:p-8">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-[var(--color-accent)] opacity-70 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[var(--color-text-muted)]">A simple view</p>
                <h2 className="mt-1 text-2xl font-extrabold">Know what to do next.</h2>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-primary)] text-xl">✓</span>
            </div>

            <div className="space-y-3">
              <MiniCard icon="💰" title="Your money" text="See profit, funding need and repayment pressure." />
              <MiniCard icon="🛠️" title="Useful schemes" text="Understand which government schemes may fit." />
              <MiniCard icon="💡" title="Your next steps" text="Get practical advice based on your situation." />
            </div>

            <div className="ui-card-soft mt-5 p-4">
              <p className="text-sm font-bold">Need more detail?</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">Advanced information stays available whenever you want it.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-8 sm:pb-12">
        <div className="ui-page-intro">
          <p className="ui-eyebrow">Three things in one place</p>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">From idea to action.</h2>
        </div>
        <div className="ui-simple-grid">
          <Feature icon="📍" title="Local insights">Advice shaped by your village, district, customers and market.</Feature>
          <Feature icon="📈" title="Financial clarity">Understand whether the business looks sustainable and where money is going.</Feature>
          <Feature icon="🤝" title="Government support">Find relevant schemes and see why they may match your profile.</Feature>
        </div>
      </section>
    </div>
  )
}

function MiniCard({ icon, title, text }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--color-surface-soft)] text-lg" aria-hidden="true">{icon}</span>
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

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/business" element={<BusinessPage />} />
        <Route path="/location" element={<LocationPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/schemes" element={<SchemesPage />} />
        <Route path="/advisory" element={<AdvisoryPage />} />
        <Route path="/report" element={<ReportPage />} />
      </Routes>
    </AppShell>
  )
}

export default App

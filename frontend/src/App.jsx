import Button from './components/Button'
import { Link, Routes, Route } from 'react-router-dom'
import ProfilePage from './pages/ProfilePage'
import BusinessPage from './pages/BusinessPage'
import LocationPage from './pages/LocationPage'
import AnalysisPage from './pages/AnalysisPage'
import FinancePage from './pages/FinancePage'
import SchemesPage from './pages/SchemesPage'
import AdvisoryPage from './pages/AdvisoryPage'
import ReportPage from './pages/ReportPage'

function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
          AI-powered rural business advisor
        </p>

        <h1 className="max-w-4xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
          Grow your business with the right advice, funding and local insights.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
          Get simple, personalized guidance for your business idea, finances,
          government schemes and next steps — all in one place.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
  <Link to="/profile">
    <Button className="w-full px-8 py-4 sm:w-auto">
      Start My Business Journey
    </Button>
  </Link>

  <Button
    className="border border-slate-300 bg-white px-8 py-4 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
  >
    🎙️ Try Voice Assistant
  </Button>
</div>


        <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          <Feature icon="📍" title="Local Insights">
            Advice based on your local market and business context.
          </Feature>

          <Feature icon="💰" title="Financial Planning">
            Understand investment, funding needs and repayment pressure.
          </Feature>

          <Feature icon="🏛️" title="Scheme Matching">
            Find relevant support schemes and understand why they match.
          </Feature>
        </div>
      </section>
    </main>
  )
}

function Feature({ icon, title, children }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="text-3xl">{icon}</div>
      <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </div>
  )
}



function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/business" element={<BusinessPage />} />
      <Route path="/location" element={<LocationPage />} />
      <Route path="/analysis" element={<AnalysisPage />} />
      <Route path="/finance" element={<FinancePage />} />
      <Route path="/schemes" element={<SchemesPage />} />
      <Route path="/advisory" element={<AdvisoryPage />} />
      <Route path="/report" element={<ReportPage />} />
    </Routes>
  )
}

export default App
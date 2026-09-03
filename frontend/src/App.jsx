import { useState } from 'react'
import { Link, Routes, Route } from 'react-router-dom'


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
          <Link
            to="/profile"
            className="rounded-xl bg-green-600 px-8 py-4 font-semibold text-white transition hover:bg-green-700"
          >
            Start My Business Journey
          </Link>

          <button
            type="button"
            className="rounded-xl border border-slate-300 bg-white px-8 py-4 font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            🎙️ Try Voice Assistant
          </button>
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

function ProfilePage() {
  const [profile, setProfile] = useState({
    name: '',
    state: '',
    district: '',
  })

  const handleChange = (event) => {
    const { name, value } = event.target

    setProfile((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleContinue = (event) => {
    event.preventDefault()

    console.log('Profile data:', profile)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Home
        </Link>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">Step 1 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Tell us about yourself
          </h1>

          <p className="mt-3 text-slate-600">
            We’ll use this information to personalize your business advice.
          </p>

          <form onSubmit={handleContinue} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Your name
              </label>

              <input
                name="name"
                value={profile.name}
                onChange={handleChange}
                type="text"
                placeholder="Enter your name"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                State
              </label>

              <input
                name="state"
                value={profile.state}
                onChange={handleChange}
                type="text"
                placeholder="e.g. Uttar Pradesh"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                District
              </label>

              <input
                name="district"
                value={profile.district}
                onChange={handleChange}
                type="text"
                placeholder="Enter your district"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-green-600 px-6 py-4 font-semibold text-white transition hover:bg-green-700"
            >
              Continue →
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/profile" element={<ProfilePage />} />
    </Routes>
  )
}

export default App
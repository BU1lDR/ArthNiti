import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'

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

  window.location.href = '/business'
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

            <Button type="submit" className="w-full py-4">
              Continue →
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}

export default ProfilePage

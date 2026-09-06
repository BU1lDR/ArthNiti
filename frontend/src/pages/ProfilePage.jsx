import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function ProfilePage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()

  const profile = applicationData.profile

  const handleChange = (event) => {
    const { name, value } = event.target

    updateSection('profile', {
      [name]: value,
    })
  }

  const handleContinue = (event) => {
    event.preventDefault()

    console.log('Profile data:', applicationData.profile)

    navigate('/business')
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

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Preferred language
              </label>

              <select
                name="language"
                value={profile.language || 'Hindi'}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="Hindi">Hindi</option>
                <option value="English">English</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Preferred dialect
                <span className="ml-1 font-normal text-slate-500">
                  (optional)
                </span>
              </label>

              <input
                name="dialect"
                value={profile.dialect || ''}
                onChange={handleChange}
                type="text"
                placeholder="e.g. Awadhi, Bhojpuri, Braj"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                How comfortable are you with reading?
              </label>

              <select
                name="literacyLevel"
                value={profile.literacyLevel || 'low'}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="low">Basic — keep advice very simple</option>
                <option value="medium">
                  Comfortable — simple explanations are fine
                </option>
                <option value="high">
                  Advanced — detailed explanations are fine
                </option>
              </select>
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
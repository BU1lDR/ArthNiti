import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function LocationPage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()

  const location = applicationData.location

  const handleChange = (event) => {
    const { name, value } = event.target

    updateSection('location', {
      [name]: value,
    })
  }

  const handleContinue = (event) => {
    event.preventDefault()

    console.log('Location data:', applicationData.location)

    navigate('/finance')
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/business"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Business
        </Link>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">Step 3 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Tell us about your location
          </h1>

          <p className="mt-3 text-slate-600">
            This helps us understand your local market and provide more
            relevant business advice.
          </p>

          <form onSubmit={handleContinue} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Village / Town
              </label>

              <input
                name="village"
                value={location.village}
                onChange={handleChange}
                type="text"
                placeholder="Enter your village or town"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                District
              </label>

              <input
                name="district"
                value={location.district}
                onChange={handleChange}
                type="text"
                placeholder="e.g. Varanasi"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                State
              </label>

              <input
                name="state"
                value={location.state}
                onChange={handleChange}
                type="text"
                placeholder="e.g. Uttar Pradesh"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Location type
              </label>

              <select
                name="locationType"
                value={location.locationType}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                required
              >
                <option value="rural">Rural</option>
                <option value="urban">Urban</option>
                <option value="semi-urban">Semi-Urban</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Local market type
              </label>

              <select
                name="marketType"
                value={location.marketType}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="">Select market type</option>
                <option value="village">Village / Local Market</option>
                <option value="weekly">Weekly Market / Haats</option>
                <option value="town">Nearby Town</option>
                <option value="online">Online / Digital</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Main customer base
              </label>

              <input
                name="customers"
                value={location.customers}
                onChange={handleChange}
                type="text"
                placeholder="e.g. Local families, farmers, nearby shops"
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

export default LocationPage
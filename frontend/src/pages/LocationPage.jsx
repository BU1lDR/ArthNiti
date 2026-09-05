import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'

function LocationPage() {
  const [location, setLocation] = useState({
    village: '',
    district: '',
    state: '',
    marketType: '',
    customers: '',
  })

  const handleChange = (event) => {
    const { name, value } = event.target

    setLocation((current) => ({
      ...current,
      [name]: value,
    }))
  }


  const handleContinue = (event) => {
  event.preventDefault()

  console.log('Location data:', location)

  window.location.href = '/analysis'
}

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/business"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back
        </Link>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">Step 3 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Understand your local market
          </h1>

          <p className="mt-3 text-slate-600">
            Tell us a little about your location and customers so we can give
            you more relevant local business advice.
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
                placeholder="e.g. Meerut"
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
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Where do you mainly sell?
              </label>

              <select
                name="marketType"
                value={location.marketType}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="">Select market type</option>
                <option value="village">Village / Local area</option>
                <option value="nearby-town">Nearby town</option>
                <option value="district">District market</option>
                <option value="online">Online / Digital</option>
                <option value="mixed">Multiple markets</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Who are your main customers?
              </label>

              <select
                name="customers"
                value={location.customers}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="">Select customer group</option>
                <option value="local-families">Local families</option>
                <option value="farmers">Farmers</option>
                <option value="students">Students</option>
                <option value="shops">Local shops / businesses</option>
                <option value="mixed">Mixed customers</option>
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

export default LocationPage
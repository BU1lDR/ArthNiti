import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'

function BusinessPage() {
  const [business, setBusiness] = useState({
    businessName: '',
    businessType: '',
    experience: '',
    stage: '',
  })

  const handleChange = (event) => {
    const { name, value } = event.target

    setBusiness((current) => ({
      ...current,
      [name]: value,
    }))
  }


  const handleContinue = (event) => {
  event.preventDefault()

  console.log('Business data:', business)

  window.location.href = '/location'
}

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/profile"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back
        </Link>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">Step 2 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Tell us about your business
          </h1>

          <p className="mt-3 text-slate-600">
            Share a few details so we can understand your business and
            personalize the advice.
          </p>

          <form onSubmit={handleContinue} className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Business name
              </label>

              <input
                name="businessName"
                value={business.businessName}
                onChange={handleChange}
                type="text"
                placeholder="e.g. Sharma Dairy Farm"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                What type of business is it?
              </label>

              <select
                name="businessType"
                value={business.businessType}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="">Select business type</option>
                <option value="dairy">Dairy</option>
                <option value="retail">Retail / Shop</option>
                <option value="agriculture">Agriculture</option>
                <option value="handicraft">Handicraft / Artisan</option>
                <option value="food">Food / Processing</option>
                <option value="services">Local Services</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Business experience
              </label>

              <select
                name="experience"
                value={business.experience}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="">Select experience</option>
                <option value="new">I am just starting</option>
                <option value="less-than-1">Less than 1 year</option>
                <option value="1-3">1–3 years</option>
                <option value="3-5">3–5 years</option>
                <option value="5-plus">More than 5 years</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Current business stage
              </label>

              <select
                name="stage"
                value={business.stage}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >
                <option value="">Select stage</option>
                <option value="idea">Business idea</option>
                <option value="starting">Planning to start</option>
                <option value="existing">Already running</option>
                <option value="expanding">Looking to expand</option>
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

export default BusinessPage
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function BusinessPage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()

  const business = applicationData.business

  const handleChange = (event) => {
    const { name, value } = event.target

    updateSection('business', {
      [name]: value,
    })
  }

  const handleContinue = (event) => {
    event.preventDefault()

    console.log('Business data:', applicationData.business)

    navigate('/location')
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/profile"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Profile
        </Link>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold text-green-600">Step 2 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Tell us about your business
          </h1>

          <p className="mt-3 text-slate-600">
            Share a few details so we can understand your business and provide
            useful financial advice.
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
                placeholder="e.g. Rahul General Store"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Business category
              </label>

              <select
                name="category"
                value={business.category}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                required
              >
                <option value="">Select business category</option>
                <option value="Retail">Retail</option>
                <option value="Food">Food / Food Processing</option>
                <option value="Handicrafts">Handicrafts</option>
                <option value="Tailoring">Tailoring / Garments</option>
                <option value="Agriculture">Agriculture</option>
                <option value="Livestock">Livestock / Dairy</option>
                <option value="Services">Services</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Initial investment (₹)
              </label>

              <input
                name="initialInvestment"
                value={business.initialInvestment}
                onChange={handleChange}
                type="number"
                min="0"
                placeholder="e.g. 100000"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Expected monthly revenue (₹)
              </label>

              <input
                name="monthlyRevenue"
                value={business.monthlyRevenue}
                onChange={handleChange}
                type="number"
                min="0"
                placeholder="e.g. 30000"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Monthly operating expenses (₹)
              </label>

              <input
                name="monthlyOperatingExpenses"
                value={business.monthlyOperatingExpenses}
                onChange={handleChange}
                type="number"
                min="0"
                placeholder="e.g. 18000"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Number of employees
              </label>

              <input
                name="employees"
                value={business.employees}
                onChange={handleChange}
                type="number"
                min="0"
                placeholder="e.g. 2"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Existing debt (₹)
              </label>

              <input
                name="existingDebt"
                value={business.existingDebt}
                onChange={handleChange}
                type="number"
                min="0"
                placeholder="Enter 0 if you have no existing debt"
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

export default BusinessPage
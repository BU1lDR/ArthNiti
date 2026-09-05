import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { runAnalysis } from '../services/api'

function FinancePage() {
  const { applicationData, updateSection, setResult } = useApp()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const finance = applicationData.finance
  const business = applicationData.business
  const profile = applicationData.profile
  const location = applicationData.location

  const handleChange = (event) => {
    const { name, value } = event.target

    updateSection('finance', {
      [name]: value,
    })
  }

  const availableCapital = Number(finance.availableCapital) || 0
  const monthlyExpenses = Number(finance.monthlyExpenses) || 0
  const monthlyEmi = Number(finance.monthlyEmi) || 0

  const investment = Number(business.initialInvestment) || 0
  const monthlyRevenue = Number(business.monthlyRevenue) || 0

  const fundingGap = Math.max(investment - availableCapital, 0)

  const monthlySurplus = Math.max(
    monthlyRevenue - monthlyExpenses - monthlyEmi,
    0,
  )

  const handleContinue = async (event) => {
    event.preventDefault()

    setLoading(true)
    setError('')

  const payload = {
    business_category: business.category,

    state: location.state || profile.state,
    district: location.district || profile.district || '',
    village: location.village || '',
    market_type: location.marketType || '',
    customers: location.customers || '',

    available_capital: availableCapital,
    monthly_expenses: monthlyExpenses,
    expected_monthly_revenue: monthlyRevenue,
    monthly_emi: monthlyEmi,

    initial_investment: investment,
    monthly_operating_expenses:
      Number(business.monthlyOperatingExpenses) || 0,

    employees: Number(business.employees) || 0,
    existing_debt: Number(business.existingDebt) || 0,

    user_language: profile.language || 'Hindi',
    preferred_dialect: profile.dialect || null,
    literacy_level: profile.literacyLevel || 'low',
    entrepreneur_type: profile.entrepreneurType || null,

    location_type: location.locationType || 'rural',
  }

    try {
      console.log('Sending analysis payload:', payload)

      const result = await runAnalysis(payload)

      console.log('Analysis API response:', result)

      setResult(result)

      navigate('/analysis')
    } catch (err) {
      console.error('Analysis API error:', err)

      setError(
        err.message ||
          'Unable to connect to the analysis service. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/location"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back to Location
        </Link>

        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">
            Step 4 of 6
          </p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Plan your finances
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            Enter a few simple numbers so we can understand your funding needs,
            expenses and repayment pressure.
          </p>
        </div>

        <form onSubmit={handleContinue} className="mt-8 space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Investment & Funding
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Total investment needed (₹)
                </label>

                <input
                  value={investment}
                  type="number"
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 outline-none"
                />
              </div>

              <InputField
                label="Available capital / own contribution (₹)"
                name="availableCapital"
                value={finance.availableCapital}
                onChange={handleChange}
                placeholder="e.g. 150000"
                required
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Monthly Financial Position
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Expected monthly revenue (₹)
                </label>

                <input
                  value={monthlyRevenue}
                  type="number"
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-600 outline-none"
                />
              </div>

              <InputField
                label="Monthly expenses (₹)"
                name="monthlyExpenses"
                value={finance.monthlyExpenses}
                onChange={handleChange}
                placeholder="e.g. 15000"
                required
              />

              <InputField
                label="Monthly EMI / loan payment (₹)"
                name="monthlyEmi"
                value={finance.monthlyEmi}
                onChange={handleChange}
                placeholder="Enter 0 if none"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Estimated Funding Gap"
              value={`₹${fundingGap.toLocaleString('en-IN')}`}
              description="Amount that may need external funding."
            />

            <SummaryCard
              title="Estimated Monthly Surplus"
              value={`₹${monthlySurplus.toLocaleString('en-IN')}`}
              description="Revenue remaining after expenses and EMI."
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-4"
          >
            {loading
              ? 'Analyzing your business...'
              : 'Continue to Analysis →'}
          </Button>
        </form>
      </div>
    </main>
  )
}

function InputField({
  label,
  name,
  value,
  onChange,
  placeholder,
  required = false,
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        name={name}
        value={value}
        onChange={onChange}
        type="number"
        min="0"
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
      />
    </div>
  )
}

function SummaryCard({ title, value, description }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-green-700">
        {value}
      </p>

      <p className="mt-2 text-sm text-slate-600">
        {description}
      </p>
    </div>
  )
}

export default FinancePage
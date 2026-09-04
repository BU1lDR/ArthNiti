import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

function FinancePage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()

  const finance = applicationData.finance
  const business = applicationData.business

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

  const handleContinue = (event) => {
    event.preventDefault()

    console.log('Financial data:', {
      ...applicationData.finance,
      fundingGap,
      monthlySurplus,
    })

    navigate('/analysis')
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
          <p className="text-sm font-semibold text-green-600">Step 4 of 6</p>

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

          <Button type="submit" className="w-full py-4">
            Continue to Analysis →
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
      <p className="text-sm font-medium text-slate-500">{title}</p>

      <p className="mt-2 text-2xl font-bold text-green-700">{value}</p>

      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </div>
  )
}

export default FinancePage
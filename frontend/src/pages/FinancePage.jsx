import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button'

function FinancePage() {
  const [finance, setFinance] = useState({
    investment: '',
    ownContribution: '',
    monthlyRevenue: '',
    monthlyExpenses: '',
  })

  const handleChange = (event) => {
    const { name, value } = event.target

    setFinance((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const investment = Number(finance.investment) || 0
  const ownContribution = Number(finance.ownContribution) || 0
  const monthlyRevenue = Number(finance.monthlyRevenue) || 0
  const monthlyExpenses = Number(finance.monthlyExpenses) || 0

  const fundingGap = Math.max(investment - ownContribution, 0)
  const monthlySurplus = Math.max(monthlyRevenue - monthlyExpenses, 0)

  const handleContinue = (event) => {
    event.preventDefault()

    console.log('Financial data:', {
      ...finance,
      fundingGap,
      monthlySurplus,
    })

    window.location.href = '/schemes'
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/analysis"
          className="text-sm font-medium text-green-700 hover:text-green-800"
        >
          ← Back
        </Link>

        <div className="mt-8">
          <p className="text-sm font-semibold text-green-600">Step 5 of 6</p>

          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Plan your finances
          </h1>

          <p className="mt-3 max-w-2xl text-slate-600">
            Enter a few simple numbers to understand your funding requirement
            and monthly business position.
          </p>
        </div>

        <form onSubmit={handleContinue} className="mt-8 space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Investment & Funding
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <InputField
                label="Total investment needed (₹)"
                name="investment"
                value={finance.investment}
                onChange={handleChange}
                placeholder="e.g. 400000"
              />

              <InputField
                label="Your own contribution (₹)"
                name="ownContribution"
                value={finance.ownContribution}
                onChange={handleChange}
                placeholder="e.g. 150000"
              />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Monthly Business Position
            </h2>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <InputField
                label="Estimated monthly revenue (₹)"
                name="monthlyRevenue"
                value={finance.monthlyRevenue}
                onChange={handleChange}
                placeholder="e.g. 50000"
              />

              <InputField
                label="Estimated monthly expenses (₹)"
                name="monthlyExpenses"
                value={finance.monthlyExpenses}
                onChange={handleChange}
                placeholder="e.g. 30000"
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
              description="Revenue remaining after estimated expenses."
            />
          </div>

          <Button type="submit" className="w-full py-4">
            Continue to Scheme Matching →
          </Button>
        </form>
      </div>
    </main>
  )
}

function InputField({ label, name, value, onChange, placeholder }) {
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

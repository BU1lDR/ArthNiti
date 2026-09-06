import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { runAnalysis } from '../services/api'

const fieldClass = 'mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

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
    updateSection('finance', { [name]: value })
  }

  const availableCapital = Number(finance.availableCapital) || 0
  const monthlyExpenses = Number(finance.monthlyExpenses) || 0
  const monthlyEmi = Number(finance.monthlyEmi) || 0
  const investment = Number(business.initialInvestment) || 0
  const monthlyRevenue = Number(business.monthlyRevenue) || 0
  const fundingGap = Math.max(investment - availableCapital, 0)
  const monthlySurplus = Math.max(monthlyRevenue - monthlyExpenses - monthlyEmi, 0)

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
      monthly_operating_expenses: Number(business.monthlyOperatingExpenses) || 0,
      employees: Number(business.employees) || 0,
      existing_debt: Number(business.existingDebt) || 0,
      user_language: profile.language || 'Hindi',
      preferred_dialect: profile.dialect || null,
      literacy_level: profile.literacyLevel || 'low',
      entrepreneur_type: profile.entrepreneurType || null,
      location_type: location.locationType || 'rural',
    }

    try {
      const result = await runAnalysis(payload)
      setResult(result)
      navigate('/analysis')
    } catch (err) {
      setError(err.message || 'Unable to connect to the analysis service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/location" className="text-sm font-bold text-[var(--color-primary-strong)] hover:underline">← Location</Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">Step 4 of 4</span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow">💰 Your money</p>
        <h1 className="ui-page-title">Let’s understand your finances</h1>
        <p className="ui-page-subtitle">You don’t need exact numbers. Simple estimates are enough for us to check funding needs and monthly business health.</p>
      </div>

      <form onSubmit={handleContinue} className="space-y-6">
        <div className="ui-card p-5 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="ui-feature-icon" aria-hidden="true">🏦</span>
            <div>
              <h2 className="text-xl font-extrabold">Money needed to start</h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">We already have your planned investment from the previous step.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
              <p className="text-sm font-bold text-[var(--color-text-muted)]">Total investment needed</p>
              <p className="mt-2 text-3xl font-black text-[var(--color-primary-strong)]">₹{investment.toLocaleString('en-IN')}</p>
            </div>
            <InputField label="How much money do you already have?" name="availableCapital" value={finance.availableCapital} onChange={handleChange} placeholder="e.g. 150000" required />
          </div>
        </div>

        <div className="ui-card p-5 sm:p-8">
          <h2 className="text-xl font-extrabold">Money coming in and going out</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Think about an average month.</p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
              <p className="text-sm font-bold text-[var(--color-text-muted)]">Expected monthly income</p>
              <p className="mt-2 text-2xl font-black text-[var(--color-text)]">₹{monthlyRevenue.toLocaleString('en-IN')}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Taken from your business details.</p>
            </div>
            <InputField label="How much do you spend each month?" name="monthlyExpenses" value={finance.monthlyExpenses} onChange={handleChange} placeholder="e.g. 15000" required />
          </div>

          <details className="ui-disclosure mt-6">
            <summary>💳 Do you have a loan or EMI?</summary>
            <div className="ui-disclosure-body">
              <InputField label="Monthly EMI / loan payment (₹)" name="monthlyEmi" value={finance.monthlyEmi} onChange={handleChange} placeholder="0 if none" required />
            </div>
          </details>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SummaryCard icon="📌" title="Money still needed" value={`₹${fundingGap.toLocaleString('en-IN')}`} description={fundingGap > 0 ? 'This is the amount you may need to arrange.' : 'You have enough of your planned investment.'} />
          <SummaryCard icon="💚" title="Money left each month" value={`₹${monthlySurplus.toLocaleString('en-IN')}`} description="Estimated after expenses and EMI." />
        </div>

        {error && <div role="alert" className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-surface)] p-4 font-semibold text-[var(--color-danger)]">{error}</div>}

        <Button type="submit" disabled={loading} className="w-full py-4 text-base">
          {loading ? 'Checking your business…' : 'Check my business →'}
        </Button>
      </form>
    </section>
  )
}

function InputField({ label, name, value, onChange, placeholder, required = false }) {
  return (
    <label className="block">
      <span className="font-extrabold">{label}</span>
      <input name={name} value={value} onChange={onChange} type="number" min="0" placeholder={placeholder} required={required} className={fieldClass} />
    </label>
  )
}

function SummaryCard({ icon, title, value, description }) {
  return (
    <div className="ui-card p-5">
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <p className="mt-3 text-sm font-bold text-[var(--color-text-muted)]">{title}</p>
      <p className="mt-1 text-2xl font-black text-[var(--color-primary-strong)]">{value}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{description}</p>
    </div>
  )
}

export default FinancePage

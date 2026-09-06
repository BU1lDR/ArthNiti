import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

const fieldClass = 'mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

const categories = [
  ['retail', '🛒', 'Retail / Shop'],
  ['food processing', '🍲', 'Food / Food Processing'],
  ['handicrafts', '🧵', 'Handicrafts'],
  ['tailoring', '✂️', 'Tailoring / Garments'],
  ['agriculture', '🌾', 'Agriculture'],
  ['dairy', '🐄', 'Livestock / Dairy'],
  ['services', '🧰', 'Services'],
  ['manufacturing', '🏭', 'Manufacturing'],
  ['other', '➕', 'Other'],
]

function BusinessPage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()
  const business = applicationData.business

  const handleChange = (event) => {
    const { name, value } = event.target
    updateSection('business', { [name]: value })
  }

  const handleCategory = (category) => {
    updateSection('business', { category })
  }

  const handleContinue = (event) => {
    event.preventDefault()
    navigate('/location')
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/profile" className="text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          ← Profile
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">Step 2 of 4</span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow">🏪 Your business</p>
        <h1 className="ui-page-title">Tell us about your business</h1>
        <p className="ui-page-subtitle">Choose what you do, then tell us a few numbers. We’ll use them to check how your business is doing.</p>
      </div>

      <form onSubmit={handleContinue} className="ui-card overflow-hidden">
        <div className="space-y-7 p-5 sm:p-8">
          <div>
            <label className="text-base font-extrabold" htmlFor="business-name">What is your business called?</label>
            <input id="business-name" name="businessName" value={business.businessName} onChange={handleChange} type="text" placeholder="e.g. Rahul General Store" className={fieldClass} required />
          </div>

          <fieldset>
            <legend className="text-base font-extrabold">What kind of business do you run?</legend>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tap one option.</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {categories.map(([value, icon, label]) => {
                const selected = business.category === value
                return (
                  <button key={value} type="button" onClick={() => handleCategory(value)} className={`rounded-2xl border-2 p-4 text-left transition ${selected ? 'border-[var(--color-primary-strong)] bg-[var(--color-surface-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'}`} aria-pressed={selected}>
                    <span className="text-2xl" aria-hidden="true">{icon}</span>
                    <span className="mt-2 block text-sm font-extrabold">{label}</span>
                  </button>
                )
              })}
            </div>
            <input type="text" name="category" value={business.category} onChange={handleChange} tabIndex="-1" aria-hidden="true" className="sr-only" required />
          </fieldset>

          <div className="ui-card-soft p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="ui-feature-icon" aria-hidden="true">₹</span>
              <div>
                <h2 className="text-lg font-extrabold">Your business numbers</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Rough estimates are okay. You can change them later.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="font-bold">How much money will you invest? <span className="font-normal text-[var(--color-text-muted)]">₹</span></span>
                <input name="initialInvestment" value={business.initialInvestment} onChange={handleChange} type="number" min="0" placeholder="e.g. 100000" className={fieldClass} required />
              </label>
              <label className="block">
                <span className="font-bold">Expected monthly sales / income <span className="font-normal text-[var(--color-text-muted)]">₹</span></span>
                <input name="monthlyRevenue" value={business.monthlyRevenue} onChange={handleChange} type="number" min="0" placeholder="e.g. 30000" className={fieldClass} required />
              </label>
              <label className="block">
                <span className="font-bold">Monthly business expenses <span className="font-normal text-[var(--color-text-muted)]">₹</span></span>
                <input name="monthlyOperatingExpenses" value={business.monthlyOperatingExpenses} onChange={handleChange} type="number" min="0" placeholder="e.g. 18000" className={fieldClass} required />
              </label>
            </div>
          </div>

          <details className="ui-disclosure">
            <summary>⚙️ More business details</summary>
            <div className="ui-disclosure-body grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="font-bold">How many people work here?</span>
                <input name="employees" value={business.employees} onChange={handleChange} type="number" min="0" placeholder="e.g. 2" className={fieldClass} />
              </label>
              <label className="block">
                <span className="font-bold">Existing business debt <span className="font-normal text-[var(--color-text-muted)]">(₹)</span></span>
                <input name="existingDebt" value={business.existingDebt} onChange={handleChange} type="number" min="0" placeholder="0 if none" className={fieldClass} />
              </label>
            </div>
          </details>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5 sm:px-8">
          <Button type="submit" className="w-full py-4 text-base sm:w-auto sm:min-w-56">Continue to location →</Button>
        </div>
      </form>
    </section>
  )
}

export default BusinessPage

import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

const locationTypes = [
  ['rural', '🌾', 'Village / Rural'],
  ['semi-urban', '🏘️', 'Semi-Urban'],
  ['urban', '🏙️', 'City / Urban'],
]

const marketTypes = [
  ['village', '🏪', 'Village / Local Market'],
  ['weekly', '🧺', 'Weekly Market / Haat'],
  ['town', '🏬', 'Nearby Town'],
  ['online', '📱', 'Online / Digital'],
  ['mixed', '🔄', 'More than one'],
]

const fieldClass = 'mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

function ChoiceGrid({ value, options, onChange, columns = 'sm:grid-cols-3' }) {
  return (
    <div className={`mt-4 grid grid-cols-1 gap-3 ${columns}`}>
      {options.map(([option, icon, label]) => {
        const selected = value === option
        return (
          <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={selected} className={`rounded-2xl border-2 p-4 text-left transition ${selected ? 'border-[var(--color-primary-strong)] bg-[var(--color-surface-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'}`}>
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <span className="mt-2 block text-sm font-extrabold">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function LocationPage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()
  const location = applicationData.location

  const handleChange = (event) => {
    const { name, value } = event.target
    updateSection('location', { [name]: value })
  }

  const setValue = (name, value) => {
    updateSection('location', { [name]: value })
  }

  const handleContinue = (event) => {
    event.preventDefault()
    navigate('/finance')
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/business" className="text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          ← Business
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">Step 3 of 4</span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow">📍 Your local area</p>
        <h1 className="ui-page-title">Where does your business operate?</h1>
        <p className="ui-page-subtitle">Your location helps us understand the nearby market and find more relevant schemes and advice.</p>
      </div>

      <form onSubmit={handleContinue} className="ui-card overflow-hidden p-0">
        <div className="space-y-8 p-5 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="font-extrabold">Village / Town</span>
              <input name="village" value={location.village} onChange={handleChange} type="text" placeholder="e.g. Khera" className={fieldClass} />
            </label>
            <label className="block">
              <span className="font-extrabold">District</span>
              <input name="district" value={location.district} onChange={handleChange} type="text" placeholder="e.g. Meerut" className={fieldClass} required />
            </label>
          </div>

          <label className="block sm:max-w-xl">
            <span className="font-extrabold">State</span>
            <input name="state" value={location.state} onChange={handleChange} type="text" placeholder="e.g. Uttar Pradesh" className={fieldClass} required />
          </label>

          <fieldset>
            <legend className="text-base font-extrabold">Is your business in a village or city?</legend>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose the closest option.</p>
            <ChoiceGrid value={location.locationType} options={locationTypes} onChange={(value) => setValue('locationType', value)} />
          </fieldset>

          <fieldset className="ui-card-soft p-5 sm:p-6">
            <legend className="text-base font-extrabold">Where do your customers usually buy from you?</legend>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">This helps us understand your main market.</p>
            <ChoiceGrid value={location.marketType} options={marketTypes} onChange={(value) => setValue('marketType', value)} columns="sm:grid-cols-2 lg:grid-cols-3" />
          </fieldset>

          <details className="ui-disclosure">
            <summary>👥 Tell us more about your customers</summary>
            <div className="ui-disclosure-body">
              <label className="block">
                <span className="font-bold">Who are your main customers?</span>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">For example: local families, farmers, nearby shops.</p>
                <input name="customers" value={location.customers} onChange={handleChange} type="text" placeholder="e.g. Local families" className={fieldClass} />
              </label>
            </div>
          </details>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5 sm:px-8">
          <Button type="submit" className="w-full py-4 text-base sm:w-auto sm:min-w-56">Continue to finance →</Button>
        </div>
      </form>
    </section>
  )
}

export default LocationPage

import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

const fieldClass = 'mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

function ProfilePage() {
  const { applicationData, updateSection } = useApp()
  const navigate = useNavigate()
  const profile = applicationData.profile

  const handleChange = (event) => {
    const { name, value } = event.target
    updateSection('profile', { [name]: value })
  }

  const handleContinue = (event) => {
    event.preventDefault()
    navigate('/business')
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/" className="text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          ← Home
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">
          Step 1 of 4
        </span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow">👋 Let’s get to know you</p>
        <h1 className="ui-page-title">Tell us about yourself</h1>
        <p className="ui-page-subtitle">
          A few simple details help us give advice that fits your situation.
        </p>
      </div>

      <form onSubmit={handleContinue} className="ui-card overflow-hidden p-0">
        <div className="space-y-6 p-5 sm:p-8">
          <div>
            <label className="text-base font-extrabold" htmlFor="profile-name">What is your name?</label>
            <input id="profile-name" name="name" value={profile.name} onChange={handleChange} type="text" placeholder="Your name" className={fieldClass} autoComplete="name" required />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="text-base font-extrabold" htmlFor="profile-state">Which state are you in?</label>
              <input id="profile-state" name="state" value={profile.state} onChange={handleChange} type="text" placeholder="e.g. Uttar Pradesh" className={fieldClass} autoComplete="address-level1" required />
            </div>
            <div>
              <label className="text-base font-extrabold" htmlFor="profile-district">Which district?</label>
              <input id="profile-district" name="district" value={profile.district} onChange={handleChange} type="text" placeholder="e.g. Meerut" className={fieldClass} autoComplete="address-level2" required />
            </div>
          </div>

          <div className="ui-card-soft p-5">
            <h2 className="text-base font-extrabold">How should we talk to you?</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">You can change this later.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold">Language</span>
                <select name="language" value={profile.language || 'Hindi'} onChange={handleChange} className={fieldClass}>
                  <option value="Hindi">हिन्दी / Hindi</option>
                  <option value="English">English</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-bold">Dialect <span className="font-normal text-[var(--color-text-muted)]">(optional)</span></span>
                <input name="dialect" value={profile.dialect || ''} onChange={handleChange} type="text" placeholder="Awadhi, Bhojpuri, Braj…" className={fieldClass} />
              </label>
            </div>
          </div>

          <details className="ui-disclosure">
            <summary>⚙️ More personalisation</summary>
            <div className="ui-disclosure-body">
              <label className="block">
                <span className="font-bold text-[var(--color-text)]">How comfortable are you with reading?</span>
                <select name="literacyLevel" value={profile.literacyLevel || 'low'} onChange={handleChange} className={fieldClass}>
                  <option value="low">Basic — keep advice very simple</option>
                  <option value="medium">Comfortable — simple explanations</option>
                  <option value="high">Advanced — detailed explanations</option>
                </select>
              </label>
              <p className="mt-3 text-sm">This setting helps us decide how much detail to show. Your answers and calculations remain the same.</p>
            </div>
          </details>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5 sm:px-8">
          <Button type="submit" className="w-full py-4 text-base sm:w-auto sm:min-w-56">
            Continue to my business →
          </Button>
        </div>
      </form>
    </section>
  )
}

export default ProfilePage

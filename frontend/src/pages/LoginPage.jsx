import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'

const fieldClass = 'mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

function LoginPage() {
  const { updateSection } = useApp()
  const navigate = useNavigate()
  const [details, setDetails] = useState({ name: '', phone: '', address: '', email: '' })

  const handleChange = (event) => {
    const { name, value } = event.target
    setDetails((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // Carry the name into the journey so step 1 does not ask for it again.
    updateSection('profile', { name: details.name })
    navigate('/profile')
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link to="/" className="text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          ← Home
        </Link>
      </div>

      <div className="ui-page-intro text-center">
        <span className="ui-brand-mark mx-auto" aria-hidden="true">अ</span>
        <h1 className="ui-page-title mt-4">Log in to ArthNiti</h1>
        <p className="ui-page-subtitle mx-auto">
          Your details stay with you. We use them only to keep your advice personal.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="ui-card overflow-hidden p-0">
        <div className="space-y-6 p-5 sm:p-8">
          <div>
            <label className="text-base font-extrabold" htmlFor="login-name">Full name</label>
            <input id="login-name" name="name" value={details.name} onChange={handleChange} type="text" placeholder="Your full name" className={fieldClass} autoComplete="name" required />
          </div>

          <div>
            <label className="text-base font-extrabold" htmlFor="login-phone">Phone number</label>
            <span className="mt-1 block text-sm text-[var(--color-text-muted)]">10 digits, the number you use on your phone.</span>
            <input id="login-phone" name="phone" value={details.phone} onChange={handleChange} type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="e.g. 9876543210" className={fieldClass} autoComplete="tel" required />
          </div>

          <div>
            <label className="text-base font-extrabold" htmlFor="login-address">Address</label>
            <span className="mt-1 block text-sm text-[var(--color-text-muted)]">House or shop, village or town, district and state.</span>
            <textarea id="login-address" name="address" value={details.address} onChange={handleChange} rows={3} placeholder="e.g. Shop 4, Main Bazaar, Khera, Lucknow, Uttar Pradesh" className={fieldClass} autoComplete="street-address" required />
          </div>

          <div>
            <label className="text-base font-extrabold" htmlFor="login-email">
              Email <span className="font-normal text-[var(--color-text-muted)]">(only if you have one)</span>
            </label>
            <input id="login-email" name="email" value={details.email} onChange={handleChange} type="email" placeholder="e.g. name@example.com" className={fieldClass} autoComplete="email" />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5 sm:px-8">
          <Button type="submit" className="w-full py-4 text-base sm:w-auto sm:min-w-56">
            Log in and continue →
          </Button>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            No password needed. You can start your journey straight away.
          </p>
        </div>
      </form>
    </section>
  )
}

export default LoginPage

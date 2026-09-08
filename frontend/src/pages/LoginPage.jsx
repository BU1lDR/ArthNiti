import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import BrandMark from '../components/BrandMark'
import Button from '../components/Button'
import { APP_NAME } from '../i18n/brand'
import { useI18n } from '../i18n/LanguageContext'

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

function LoginPage() {
  const { updateSection } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [details, setDetails] = useState({ name: '', phone: '', address: '', email: '' })

  const handleChange = (event) => {
    const { name, value } = event.target
    setDetails((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    // Carry the name into the journey so step 1 does not ask for it again.
    // Trimmed: `required` accepts a value of only spaces, and an untrimmed name
    // reaches the report, where it prints as a blank line under "Name".
    updateSection('profile', { name: details.name.trim() })
    navigate('/profile')
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link to="/" className="inline-flex min-h-11 min-w-11 items-center text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          <span aria-hidden="true">←</span> {t('nav.home')}
        </Link>
      </div>

      <div className="ui-page-intro text-center">
        <BrandMark size="lg" className="mx-auto" />
        {/* The brand goes in as a placeholder rather than being written into each
            translation, so the eight versions of this sentence can be translated
            without eight spellings of the product name. Languages that need a
            case ending attach it to the placeholder with a hyphen, which is the
            normal convention for a foreign-script word in Tamil or Telugu. */}
        <h1 className="ui-page-title mt-4">{t('login.title', { app: APP_NAME })}</h1>
        <p className="ui-page-subtitle mx-auto">{t('login.subtitle')}</p>
      </div>

      {/* Only `login.namePh` exists as a placeholder string, so the other three
          examples are kept free of translatable words — digits, proper nouns and
          an address format read the same in every language. */}
      <form onSubmit={handleSubmit} className="ui-card overflow-hidden p-0">
        <div className="space-y-6 p-5 sm:p-8">
          <div>
            <label className="text-base font-extrabold" htmlFor="login-name">
              {t('login.name')}<span className="ui-required" aria-hidden="true">*</span>
            </label>
            <input id="login-name" name="name" value={details.name} onChange={handleChange} type="text" placeholder={t('login.namePh')} className={fieldClass} autoComplete="name" required />
          </div>

          <div>
            <label className="text-base font-extrabold" htmlFor="login-phone">
              {t('login.phone')}<span className="ui-required" aria-hidden="true">*</span>
            </label>
            <span id="login-phone-hint" className="mt-1 block text-sm text-[var(--color-text-muted)]">{t('login.phoneHint')}</span>
            {/* `title` is what the browser appends to its own pattern-mismatch
                bubble. Without it the user sees only "Please match the requested
                format", which says nothing and is in the browser's language, not
                the one they picked. */}
            <input id="login-phone" name="phone" value={details.phone} onChange={handleChange} type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="9876543210" title={t('login.phoneHint')} className={fieldClass} autoComplete="tel" aria-describedby="login-phone-hint" required />
          </div>

          <div>
            <label className="text-base font-extrabold" htmlFor="login-address">
              {t('login.address')}<span className="ui-required" aria-hidden="true">*</span>
            </label>
            <span id="login-address-hint" className="mt-1 block text-sm text-[var(--color-text-muted)]">{t('login.addressHint')}</span>
            <textarea id="login-address" name="address" value={details.address} onChange={handleChange} rows={3} placeholder="Khera, Lucknow, Uttar Pradesh" className={fieldClass} autoComplete="street-address" aria-describedby="login-address-hint" required />
          </div>

          <div>
            <label className="text-base font-extrabold" htmlFor="login-email">
              {t('login.email')} <span className="font-normal text-[var(--color-text-muted)]">{t('login.emailOptional')}</span>
            </label>
            <input id="login-email" name="email" value={details.email} onChange={handleChange} type="email" placeholder="name@example.com" className={fieldClass} autoComplete="email" />
          </div>
        </div>

        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5 sm:px-8">
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56">
            {t('login.submit')} <span aria-hidden="true">→</span>
          </Button>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t('login.noPassword')}</p>
        </div>
      </form>
    </section>
  )
}

export default LoginPage

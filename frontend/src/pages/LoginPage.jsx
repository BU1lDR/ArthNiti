import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import BrandMark from '../components/BrandMark'
import Button from '../components/Button'
import ShortNotice from '../components/ShortNotice'
import { APP_NAME } from '../i18n/brand'
import { useI18n } from '../i18n/LanguageContext'

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

function LoginPage() {
  const { updateSection } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  // The name is the only question. This page used to ask for a phone number
  // and an address as well, required, and then threw both away: nothing here
  // authenticates anyone, so nothing needed them.
  const [name, setName] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    // Carry the name into the journey so step 1 does not ask for it again.
    // Trimmed: `required` accepts a value of only spaces, and an untrimmed name
    // reaches the report, where it prints as a blank line under "Name".
    updateSection('profile', { name: name.trim() })
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

      <ShortNotice className="mb-6" />

      <form onSubmit={handleSubmit} className="ui-card overflow-hidden p-0">
        <div className="space-y-6 p-5 sm:p-8">
          <div>
            <label className="text-base font-extrabold" htmlFor="login-name">
              {t('login.name')}<span className="ui-required" aria-hidden="true">*</span>
            </label>
            <input id="login-name" name="name" value={name} onChange={(event) => setName(event.target.value)} type="text" placeholder={t('login.namePh')} className={fieldClass} autoComplete="off" required />
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

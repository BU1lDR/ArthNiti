import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { useI18n } from '../i18n/LanguageContext'
import { LANGUAGES } from '../i18n/languages'

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

function ProfilePage() {
  const { applicationData, updateSection } = useApp()
  const { t, language, setLanguage, dialect, setDialect, dialects } = useI18n()
  const navigate = useNavigate()
  const profile = applicationData.profile

  const handleChange = (event) => {
    const { name, value } = event.target
    updateSection('profile', { [name]: value })
  }

  // The picker here and the one in the header are the same setting, so this
  // writes through to the language context rather than keeping a second copy.
  // It also mirrors the choice onto `profile` because that is what the request
  // payload and the report read.
  const handleLanguageChange = (event) => {
    const code = event.target.value
    const entry = LANGUAGES.find((item) => item.code === code)
    setLanguage(code)
    updateSection('profile', { language: entry ? entry.name : 'English', dialect: '' })
  }

  const handleDialectChange = (event) => {
    setDialect(event.target.value)
    updateSection('profile', { dialect: event.target.value })
  }

  const handleContinue = (event) => {
    event.preventDefault()
    navigate('/business')
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/" className="inline-flex min-h-11 min-w-11 items-center text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          <span aria-hidden="true">←</span> {t('nav.home')}
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">
          {t('common.stepOf', { n: 1, total: 4 })}
        </span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow"><span aria-hidden="true">👋</span> {t('profile.eyebrow')}</p>
        <h1 className="ui-page-title">{t('profile.title')}</h1>
        <p className="ui-page-subtitle">{t('profile.subtitle')}</p>
      </div>

      <form onSubmit={handleContinue} className="space-y-6">
        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">1</span>
            <h2 className="ui-formsection-title">{t('profile.title')}</h2>
          </div>
          <div className="ui-formsection-body space-y-6">
            <div>
              <label className="text-base font-extrabold" htmlFor="profile-name">
                {t('profile.name')} <span className="ui-required" aria-hidden="true">*</span>
              </label>
              <input id="profile-name" name="name" value={profile.name} onChange={handleChange} type="text" placeholder={t('profile.namePh')} className={fieldClass} autoComplete="name" required />
            </div>

            <div>
              <label className="text-base font-extrabold" htmlFor="profile-language">{t('profile.language')}</label>
              <span className="mt-1 block text-sm text-[var(--color-text-muted)]">{t('profile.languageHint')}</span>
              <select id="profile-language" value={language} onChange={handleLanguageChange} className={fieldClass}>
                {LANGUAGES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.endonym}
                    {entry.endonym === entry.name ? '' : ` / ${entry.name}`}
                  </option>
                ))}
              </select>
            </div>

            {dialects.length > 1 && (
              <div>
                <label className="text-base font-extrabold" htmlFor="profile-dialect">{t('profile.dialect')}</label>
                <span className="mt-1 block text-sm text-[var(--color-text-muted)]">{t('profile.dialectHint')}</span>
                <select id="profile-dialect" value={dialect} onChange={handleDialectChange} className={fieldClass}>
                  <option value="">{t('common.select')}</option>
                  {dialects.map((entry) => (
                    <option key={entry.code} value={entry.code}>{entry.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="ui-card p-5">
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56">
            {t('profile.submit')} <span aria-hidden="true">→</span>
          </Button>
        </div>
      </form>
    </section>
  )
}

export default ProfilePage

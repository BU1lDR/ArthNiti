import { useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import HelperFilledBanner from '../components/HelperFilledBanner'
import { useI18n } from '../i18n/LanguageContext'
import { MAX_CATEGORY_LENGTH, MAX_RUPEES } from '../data/limits'

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)]'

// The value is what goes to the backend and must stay English — the scheme
// matcher and CATEGORY_SYNONYMS key off these exact strings. Only the label is
// translated.
const categories = [
  ['retail', '🛒', 'cat.retail'],
  ['food processing', '🍲', 'cat.food'],
  ['handicrafts', '🧵', 'cat.handicrafts'],
  ['tailoring', '✂️', 'cat.tailoring'],
  ['agriculture', '🌾', 'cat.agriculture'],
  ['dairy', '🐄', 'cat.dairy'],
  ['poultry', '🐔', 'cat.poultry'],
  ['services', '🧰', 'cat.services'],
  ['manufacturing', '🏭', 'cat.manufacturing'],
  ['other', '➕', 'cat.other'],
]

function BusinessPage() {
  const { applicationData, updateSection } = useApp()
  const { t } = useI18n()
  const navigate = useNavigate()
  const business = applicationData.business
  const [categoryError, setCategoryError] = useState(false)
  const categoryRef = useRef(null)
  const [otherError, setOtherError] = useState(false)
  const otherRef = useRef(null)

  const handleChange = (event) => {
    const { name, value } = event.target
    if (name === 'categoryOther') setOtherError(false)
    updateSection('business', { [name]: value })
  }

  const handleCategory = (category) => {
    setCategoryError(false)
    setOtherError(false)
    updateSection('business', { category })
  }

  const handleContinue = (event) => {
    event.preventDefault()

    // The category is chosen with buttons, so nothing native validates it.
    if (!business.category) {
      setCategoryError(true)
      categoryRef.current?.scrollIntoView({ block: 'center' })
      return
    }

    // A typed kind of work is sent trimmed (FinancePage.jsx), and the backend
    // refuses one under 2 characters. The box's own minLength counts spaces, so
    // "  " passed it here and came back from /finance as an error about a page
    // the reader had already left. Check the trimmed text instead.
    if (business.category === 'other') {
      const trimmed = String(business.categoryOther || '').trim()

      if (trimmed.length < 2) {
        setOtherError(true)
        otherRef.current?.focus()
        return
      }

      // Store the trimmed text so the box shows what will be sent. Not while a
      // result is on screen: that result was already worked out from the
      // trimmed text, and storing it counts as an edit, which would throw the
      // still-correct result away.
      if (trimmed !== business.categoryOther && !applicationData.result) {
        updateSection('business', { categoryOther: trimmed })
      }
    }

    navigate('/location')
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/profile" className="inline-flex min-h-11 min-w-11 items-center text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          <span aria-hidden="true">←</span> {t('nav.profile')}
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">{t('common.stepOf', { n: 2, total: 4 })}</span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow"><span aria-hidden="true">🏪</span> {t('business.eyebrow')}</p>
        <h1 className="ui-page-title">{t('business.title')}</h1>
        <p className="ui-page-subtitle">{t('business.subtitle')}</p>
      </div>

      <HelperFilledBanner section="business" />

      <form onSubmit={handleContinue} className="space-y-6">
        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">1</span>
            <h2 className="ui-formsection-title">{t('business.category')}</h2>
          </div>
          <div className="ui-formsection-body space-y-6">
            <div>
              <label className="text-base font-extrabold" htmlFor="business-name">
                {t('business.nameLabel')}<span className="ui-required" aria-hidden="true">*</span>
              </label>
              <input id="business-name" name="businessName" value={business.businessName} onChange={handleChange} type="text" placeholder="e.g. Rahul General Store" className={fieldClass} autoComplete="off" aria-describedby="business-name-local" required />
              {/* The name is never sent. Saying so where it is asked is what lets
                  someone who would rather not give it type any name at all. */}
              <p id="business-name-local" className="mt-2 text-sm text-[var(--color-text-muted)]">{t('form.localOnly')}</p>
            </div>

            <fieldset ref={categoryRef} aria-describedby={categoryError ? 'category-error' : undefined}>
              <legend className="text-base font-extrabold">
                {t('business.category')}<span className="ui-required" aria-hidden="true">*</span>
              </legend>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('business.tapOne')}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categories.map(([value, icon, labelKey]) => {
                  const selected = business.category === value
                  // flex flex-col, because a <button> CENTRES its content
                  // vertically. These sit in a grid, so every button is as tall
                  // as the tallest one — and the moment a label wraps to two
                  // lines its icon and text are pushed half a line ABOVE the
                  // icons either side of it. Measured at 10px in Tamil, and it
                  // is not a translation problem: on a phone the labels wrap
                  // unevenly in every language including English. A flex column
                  // top-aligns instead, so the icons share a line and so do the
                  // first lines of the labels. Same fix at both button sites in
                  // LocationPage.jsx.
                  return (
                    <button key={value} type="button" onClick={() => handleCategory(value)} className={`flex flex-col rounded-xl border-2 p-4 text-left transition ${selected ? 'border-[var(--color-primary-strong)] bg-[var(--color-surface-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'}`} aria-pressed={selected}>
                      <span className="text-2xl" aria-hidden="true">{icon}</span>
                      <span className="mt-2 block text-sm font-extrabold">{t(labelKey)}</span>
                    </button>
                  )
                })}
              </div>
              {business.category === 'other' && (
                <label className="mt-4 block">
                  <span className="font-bold">{t('business.otherLabel')}</span>
                  <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">{t('business.otherHint')}</span>
                  <input ref={otherRef} name="categoryOther" value={business.categoryOther} onChange={handleChange} type="text" minLength={2} maxLength={MAX_CATEGORY_LENGTH} autoComplete="off" placeholder={t('business.otherPh')} className={fieldClass} required aria-invalid={otherError || undefined} aria-describedby={otherError ? 'category-other-error' : undefined} />
                </label>
              )}

              {business.category === 'other' && otherError && (
                <p id="category-other-error" role="alert" className="ui-notice ui-notice-danger mt-3 font-bold text-[var(--color-danger)]">
                  {t('business.otherError')}
                </p>
              )}

              {categoryError && (
                <p id="category-error" role="alert" className="ui-notice ui-notice-danger mt-3 font-bold text-[var(--color-danger)]">
                  {t('business.categoryError')}
                </p>
              )}
            </fieldset>
          </div>
        </div>

        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">2</span>
            <h2 className="ui-formsection-title">{t('business.numbersTitle')}</h2>
          </div>
          <div className="ui-formsection-body">
            <p className="text-sm text-[var(--color-text-muted)]">{t('business.numbersHint')}</p>

            {/* ui-field, not block: these three questions are different lengths in
                every language, so the boxes only line up if each cell's spare height
                is collected under its own question. See index.css. */}
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="ui-field">
                <span className="font-bold">{t('business.investment')}<span className="ui-required" aria-hidden="true">*</span></span>
                <MoneyField name="initialInvestment" value={business.initialInvestment} onChange={handleChange} placeholder="e.g. 100000" required />
              </label>
              <label className="ui-field">
                <span className="font-bold">{t('business.revenue')}<span className="ui-required" aria-hidden="true">*</span></span>
                <MoneyField name="monthlyRevenue" value={business.monthlyRevenue} onChange={handleChange} placeholder="e.g. 30000" required />
              </label>
              <label className="ui-field">
                <span className="font-bold">{t('business.opex')}<span className="ui-required" aria-hidden="true">*</span></span>
                <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">{t('business.opexHint')}</span>
                <MoneyField name="monthlyOperatingExpenses" value={business.monthlyOperatingExpenses} onChange={handleChange} placeholder="e.g. 18000" required />
              </label>
            </div>

            <details className="ui-disclosure mt-6">
              <summary><span aria-hidden="true">⚙️</span> {t('business.moreDetails')}</summary>
              <div className="ui-disclosure-body grid gap-5 sm:grid-cols-2">
                <label className="ui-field">
                  <span className="font-bold">{t('business.debt')}</span>
                  <MoneyField name="existingDebt" value={business.existingDebt} onChange={handleChange} placeholder="0" />
                </label>
              </div>
            </details>
          </div>
        </div>

        <div className="ui-card p-5">
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56">{t('business.submit')} <span aria-hidden="true">→</span></Button>
        </div>
      </form>
    </section>
  )
}

// A money input with the ₹ set inside the box rather than trailing the question.
// See .ui-money-field in index.css for why it moved: as an inline span at the end
// of the label it dropped onto a line of its own whenever the question wrapped.
//
// The marker is aria-hidden because it is not the field's name. Every one of these
// questions already says "money" in words — "How much money do you require?" — so a
// screen reader reading the label has the unit, and announcing a bare "rupee sign"
// after it would only add noise. Same call the codebase makes for the ₹ that
// formatCurrency prints.
function MoneyField({ name, value, onChange, placeholder, required = false }) {
  return (
    <span className="ui-money-field">
      <span className="ui-money-prefix" aria-hidden="true">₹</span>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type="number"
        min="0"
        max={MAX_RUPEES}
        placeholder={placeholder}
        required={required}
        className={fieldClass}
      />
    </span>
  )
}

export default BusinessPage

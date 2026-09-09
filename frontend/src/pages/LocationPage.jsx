import { useNavigate, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Button from '../components/Button'
import { STATES, districtsForState } from '../data/indiaLocations'
import { useI18n } from '../i18n/LanguageContext'

// Values stay English because they are sent to the backend; only labels move.
const locationTypes = [
  ['rural', '🌾', 'area.rural'],
  ['semi-urban', '🏘️', 'area.semi'],
  ['urban', '🏙️', 'area.urban'],
]

// No "more than one" tile: the grid is multi-select, so choosing two tiles
// already says that, and a "mixed" value alongside them would be redundant.
const marketTypes = [
  ['village', '🏪', 'market.village'],
  ['weekly', '🧺', 'market.weekly'],
  ['town', '🏬', 'market.town'],
  ['online', '📱', 'market.online'],
]

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-base text-[var(--color-text)] shadow-sm outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary-strong)] disabled:opacity-60'

function ChoiceGrid({ value, options, onChange, label, columns = 'sm:grid-cols-3' }) {
  return (
    <div className={`mt-4 grid grid-cols-1 gap-3 ${columns}`}>
      {options.map(([option, icon, labelKey]) => {
        const selected = value === option
        // flex flex-col so a two-line label does not lift this button's icon
        // half a line above its neighbours' — see the comment at the category
        // buttons in BusinessPage.jsx for the measurement.
        return (
          <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={selected} className={`flex flex-col rounded-xl border-2 p-4 text-left transition ${selected ? 'border-[var(--color-primary-strong)] bg-[var(--color-surface-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'}`}>
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <span className="mt-2 block text-sm font-extrabold">{label(labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}

// Same grid, but the selection is a list: tapping a tile adds or removes it.
function MultiChoiceGrid({ values, options, onToggle, label, columns = 'sm:grid-cols-3' }) {
  const selected = Array.isArray(values) ? values : []

  return (
    <div className={`mt-4 grid grid-cols-1 gap-3 ${columns}`}>
      {options.map(([option, icon, labelKey]) => {
        const isSelected = selected.includes(option)
        // flex flex-col, as above. `relative` stays: the tick is absolutely
        // positioned against this button and is unaffected by the flow.
        return (
          <button key={option} type="button" onClick={() => onToggle(option)} aria-pressed={isSelected} className={`relative flex flex-col rounded-xl border-2 p-4 text-left transition ${isSelected ? 'border-[var(--color-primary-strong)] bg-[var(--color-surface-soft)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]'}`}>
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <span className="mt-2 block text-sm font-extrabold">{label(labelKey)}</span>
            {isSelected && <span className="absolute right-3 top-3 font-black text-[var(--color-primary-strong)]" aria-hidden="true">✓</span>}
          </button>
        )
      })}
    </div>
  )
}

function LocationPage() {
  const { applicationData, updateSection } = useApp()
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const location = applicationData.location

  const handleChange = (event) => {
    const { name, value } = event.target
    updateSection('location', { [name]: value })
  }

  const setValue = (name, value) => {
    updateSection('location', { [name]: value })
  }

  // Districts belong to a state, so changing the state has to clear the district
  // too — otherwise "Lucknow" would survive a switch to Kerala and get sent to
  // the backend, which would then look up a district that cannot exist there.
  const handleStateChange = (event) => {
    updateSection('location', { state: event.target.value, district: '' })
  }

  const districts = districtsForState(location.state)

  const toggleMarketType = (option) => {
    const current = Array.isArray(location.marketType) ? location.marketType : []

    updateSection('location', {
      marketType: current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option],
    })
  }

  const handleContinue = (event) => {
    event.preventDefault()
    navigate('/finance')
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link to="/business" className="inline-flex min-h-11 min-w-11 items-center text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          <span aria-hidden="true">←</span> {t('nav.business')}
        </Link>
        <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--color-text-muted)]">{t('common.stepOf', { n: 3, total: 4 })}</span>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow"><span aria-hidden="true">📍</span> {t('location.eyebrow')}</p>
        <h1 className="ui-page-title">{t('location.title')}</h1>
        <p className="ui-page-subtitle">{t('location.subtitle')}</p>
      </div>

      <form onSubmit={handleContinue} className="space-y-6">
        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">1</span>
            <h2 className="ui-formsection-title">{t('location.state')} · {t('location.district')}</h2>
          </div>
          <div className="ui-formsection-body space-y-6">
            {/* State first, because the district list is filtered by it. */}
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="ui-field">
                <span className="font-extrabold">{t('location.state')}<span className="ui-required" aria-hidden="true">*</span></span>
                <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">{t('location.stateHint')}</span>
                <select name="state" value={location.state} onChange={handleStateChange} className={fieldClass} required>
                  <option value="">{t('location.selectState')}</option>
                  {STATES.map((entry) => (
                    <option key={entry.code} value={entry.name}>
                      {entry.name}
                      {/* The Hindi endonym is shown alongside only when the UI is
                          in Hindi; adding it in every language would just be
                          noise for a Tamil reader. */}
                      {language === 'hi' && entry.hi ? ` / ${entry.hi}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* ui-field, not block: the two hints are different lengths and the
                  district one changes with the chosen state, so without it the two
                  dropdowns sit at different heights. See index.css. */}
              <label className="ui-field">
                <span className="font-extrabold">{t('location.district')}<span className="ui-required" aria-hidden="true">*</span></span>
                <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">
                  {location.state ? t('location.districtIn', { state: location.state }) : t('location.chooseStateFirst')}
                </span>
                <select name="district" value={location.district} onChange={handleChange} className={fieldClass} disabled={!location.state} required>
                  <option value="">{location.state ? t('location.selectDistrict') : t('location.selectStateFirst')}</option>
                  {districts.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block sm:max-w-xl">
              <span className="font-extrabold">{t('location.village')}</span>
              <span className="mt-1 block text-sm font-normal text-[var(--color-text-muted)]">{t('location.villageHint')}</span>
              <input name="village" value={location.village} onChange={handleChange} type="text" placeholder="e.g. Khera" className={fieldClass} />
            </label>
          </div>
        </div>

        <div className="ui-formsection">
          <div className="ui-formsection-head">
            <span className="ui-formsection-num" aria-hidden="true">2</span>
            <h2 className="ui-formsection-title">{t('location.market')}</h2>
          </div>
          <div className="ui-formsection-body space-y-8">
            <fieldset>
              <legend className="text-base font-extrabold">{t('location.areaType')}</legend>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('location.areaTypeHint')}</p>
              <ChoiceGrid value={location.locationType} options={locationTypes} onChange={(value) => setValue('locationType', value)} label={t} />
            </fieldset>

            <fieldset>
              <legend className="text-base font-extrabold">{t('location.market')}</legend>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('location.marketHint')}</p>
              <MultiChoiceGrid values={location.marketType} options={marketTypes} onToggle={toggleMarketType} label={t} columns="sm:grid-cols-2 lg:grid-cols-4" />
            </fieldset>

            <details className="ui-disclosure">
              <summary><span aria-hidden="true">👥</span> {t('location.customersMore')}</summary>
              <div className="ui-disclosure-body">
                <label className="block">
                  <span className="font-bold">{t('location.customersQ')}</span>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('location.customersHint')}</p>
                  <input name="customers" value={location.customers} onChange={handleChange} type="text" placeholder="e.g. Local families" className={fieldClass} />
                </label>
              </div>
            </details>
          </div>
        </div>

        <div className="ui-card p-5">
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:min-w-56">{t('location.submit')} <span aria-hidden="true">→</span></Button>
        </div>
      </form>
    </section>
  )
}

export default LocationPage

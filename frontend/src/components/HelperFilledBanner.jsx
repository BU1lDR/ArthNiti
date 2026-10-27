import { useApp } from '../context/AppContext'
import { LABEL_KEY_BY_PATH } from '../data/talkAnswers'
import { useI18n } from '../i18n/LanguageContext'

// On a form page, after /talk: the answers in this section that the AI helper
// filled in and the reader has not touched since. Changing one removes it from the
// list (AppContext's applyEdit), so what is left is what still has not been looked
// at. Nothing on screen when there are none, which is every page for someone who
// typed their answers.
function HelperFilledBanner({ section }) {
  const { applicationData } = useApp()
  const { t } = useI18n()
  const paths = applicationData.aiFilled.filter((path) => path.startsWith(`${section}.`))

  if (paths.length === 0) return null

  return (
    <div className="ui-notice ui-notice-warn mb-6" data-helper-banner={section}>
      <div>
        <p className="font-extrabold">{t('talk.filledTitle')}</p>
        <p>{t('talk.filledText')}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {paths.map((path) => (
            <li key={path} className="first-letter:uppercase">{t(LABEL_KEY_BY_PATH[path])}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default HelperFilledBanner

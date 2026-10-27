import { NOTICE_KEYS } from '../config/notice'
import { useI18n } from './LanguageContext'

const NOTICE_KEY_SET = new Set(NOTICE_KEYS)

// t(), for the sentences that tell a person what happens to their answers.
//
// A consent record names NOTICE_VERSION, and parity4 ties that version to a hash
// of the NOTICE_KEYS text. A sentence rendered in a notice block but missing from
// NOTICE_KEYS could change without the version changing, and a record would then
// point at words the person never read. In development this throws on such a key,
// so the page fails loudly the first time it renders; a production build falls
// through to plain t() rather than blanking a page someone is reading.
//
// Navigation labels (a back link, a breadcrumb) say nothing about the data, so
// those use plain t().
export function useNoticeText() {
  const { t } = useI18n()

  return (key, values) => {
    if (import.meta.env.DEV && !NOTICE_KEY_SET.has(key)) {
      throw new Error(
        `"${key}" is rendered as privacy notice text but is not in NOTICE_KEYS in src/config/notice.js. Add it there, then bump NOTICE_VERSION and record the new hash (node tools/parity4.mjs prints it).`,
      )
    }
    return t(key, values)
  }
}

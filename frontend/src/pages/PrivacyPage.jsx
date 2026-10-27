import { Link, useLocation } from 'react-router-dom'
import { DEMO_MODE, DEPLOYMENT } from '../config/deployment'
import { NOTICE_VERSION, SENT_FIELD_KEYS } from '../config/notice'
import { APP_NAME } from '../i18n/brand'
import { useI18n } from '../i18n/LanguageContext'
import { useNoticeText } from '../i18n/noticeText'

// Where the back link may lead, and what it says. `from` arrives in router
// state from whichever link opened this page, so it is only trusted when it
// names a page of this app; anything else, and a direct visit, goes home.
const BACK_LABELS = {
  '/': 'nav.home',
  '/login': 'common.login',
  '/profile': 'nav.profile',
  '/business': 'nav.business',
  '/location': 'nav.location',
  '/finance': 'nav.finance',
  '/analysis': 'nav.analysis',
  '/schemes': 'nav.schemes',
  '/advisory': 'nav.advisory',
  '/report': 'nav.report',
}

// The full privacy notice. Outside the journey: no step marker and no journey
// bar, because it is not a step and can be opened from any page.
//
// Every sentence here has to be true of the shipped code, so what varies by
// deployment (who is responsible, how to reach them, how long records are
// kept) comes from config/deployment.js, and a value that is not set prints a
// sentence saying so rather than a guess. What is sent is the SENT_FIELD_KEYS
// list, one label per request field. Every notice sentence goes through
// useNoticeText(), so NOTICE_VERSION covers it; only the back link, which says
// nothing about the data, uses plain t().
function PrivacyPage() {
  const { t } = useI18n()
  const tn = useNoticeText()
  const { state } = useLocation()

  const from = typeof state?.from === 'string' && Object.hasOwn(BACK_LABELS, state.from) ? state.from : '/'
  const fiduciary = DEPLOYMENT.fiduciaryName || tn('notice.demoOperator')
  const contact = DEPLOYMENT.privacyContact
  const button = tn('finance.submit')
  const startover = tn('common.startOver')

  let kept = tn('privacy.keptUnknown')
  if (DEPLOYMENT.retentionDays !== null) {
    kept = tn('privacy.keptDays', { fiduciary, days: DEPLOYMENT.retentionDays })
  } else if (contact) {
    kept = tn('privacy.keptAsk', { contact })
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link to={from} className="inline-flex min-h-11 min-w-11 items-center text-sm font-bold text-[var(--color-primary-strong)] hover:underline">
          <span aria-hidden="true">←</span> {t(BACK_LABELS[from])}
        </Link>
      </div>

      <div className="ui-page-intro">
        <p className="ui-eyebrow">{tn('privacy.eyebrow')}</p>
        <h1 className="ui-page-title">{tn('privacy.title')}</h1>
        <p className="ui-page-subtitle">{tn('privacy.subtitle')}</p>
      </div>

      <div className="space-y-6">
        <NoticeSection title={tn('privacy.whoTitle')}>
          {DEMO_MODE ? (
            <>
              <p>{tn('privacy.whoDemo', { app: APP_NAME })}</p>
              <p className="ui-notice ui-notice-warn font-bold">{tn('notice.demo')}</p>
            </>
          ) : (
            <p>{tn('privacy.whoText', { fiduciary, app: APP_NAME })}</p>
          )}
          {/* The organisation's own website, which the notice has to point to.
              No target: it opens in this tab like every other link here. */}
          {DEPLOYMENT.fiduciaryUrl && (
            <p>
              <a href={DEPLOYMENT.fiduciaryUrl} rel="noopener noreferrer" className="break-words font-bold text-[var(--color-primary-strong)] underline">
                {tn('privacy.fiduciarySite', { fiduciary })}
              </a>
            </p>
          )}
          {DEPLOYMENT.requireAgeCheck && <p>{tn('privacy.age')}</p>}
        </NoticeSection>

        <NoticeSection title={tn('privacy.sentTitle')}>
          <p>{tn('privacy.sentLead', { button })}</p>
          <ul className="list-disc space-y-1 pl-6">
            {SENT_FIELD_KEYS.map((key) => (
              <li key={key}>{tn(key)}</li>
            ))}
          </ul>
          <p>{tn('privacy.sentConsent')}</p>
        </NoticeSection>

        <NoticeSection title={tn('privacy.localTitle')}>
          <p>{tn('privacy.localText', { startover })}</p>
        </NoticeSection>

        <NoticeSection title={tn('privacy.whyTitle')}>
          <p>{tn('privacy.whyText')}</p>
        </NoticeSection>

        <details className="ui-disclosure">
          <summary>{tn('privacy.keptTitle')}</summary>
          <div className="ui-disclosure-body space-y-3 leading-7">
            <p>{tn('privacy.keptText')}</p>
            <p>{kept}</p>
            <p>{tn('privacy.hostLogs')}</p>
          </div>
        </details>

        <NoticeSection title={tn('privacy.choicesTitle')}>
          <p>{tn('privacy.choiceStop', { button })}</p>
          <p>{tn('privacy.choiceStartOver', { startover })}</p>
          {/* Plain text, never a link: it may be an email address, a phone
              number or a postal address, and break-words keeps a long address
              inside the card on a phone. */}
          <p className="break-words">
            {contact ? tn('privacy.choiceRights', { contact }) : tn('privacy.choiceNoContact')}
          </p>
          {DEPLOYMENT.grievanceUrl && (
            <p>
              <a href={DEPLOYMENT.grievanceUrl} rel="noopener noreferrer" className="break-words font-bold text-[var(--color-primary-strong)] underline">
                {tn('privacy.grievanceLink', { fiduciary })}
              </a>
            </p>
          )}
          <p>{tn('privacy.board')}</p>
        </NoticeSection>

        <p className="text-sm text-[var(--color-text-muted)]">{tn('privacy.version', { version: NOTICE_VERSION })}</p>
      </div>
    </section>
  )
}

function NoticeSection({ title, children }) {
  return (
    <section className="ui-card p-5 sm:p-8">
      <h2 className="text-xl font-bold text-[var(--color-text)]">{title}</h2>
      <div className="mt-3 space-y-3 leading-7">{children}</div>
    </section>
  )
}

export default PrivacyPage

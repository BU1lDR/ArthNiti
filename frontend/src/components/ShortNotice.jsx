import { Link, useLocation } from 'react-router-dom'
import { DEMO_MODE, DEPLOYMENT } from '../config/deployment'
import { useNoticeText } from '../i18n/noticeText'

// The short privacy notice: what is sent, to whom, what stays in this tab, and a
// link to the full notice on /privacy. /login and /profile show it before their
// first field, and /finance shows it again inside the consent block, just before
// the button that sends the answers.
//
// Every sentence goes through useNoticeText(), so each one is covered by
// NOTICE_VERSION. The organisation is a placeholder, never part of a translation:
// in demo mode there is none, and the sentence names "the people running this
// demonstration" instead, with a line above it asking for made-up figures.
//
// The demo line lives here, inside the notice, and never in the chrome: it is a
// statement about whose data this is, not the prototype pill the owner removed.
function ShortNotice({ className = '' }) {
  const tn = useNoticeText()
  const { pathname } = useLocation()
  const fiduciary = DEPLOYMENT.fiduciaryName || tn('notice.demoOperator')

  return (
    <div className={`space-y-3 ${className}`}>
      {DEMO_MODE && <p className="ui-notice ui-notice-warn font-bold">{tn('notice.demo')}</p>}

      {/* Turned into a column: .ui-notice is a flex row, meant for an icon
          beside one paragraph, and these are three paragraphs one under
          another. */}
      <div className="ui-notice flex-col">
        <p>{tn('notice.sent', { button: tn('finance.submit'), fiduciary })}</p>
        <p>{tn('notice.local')}</p>
        <p>
          {/* A Link rather than Button: Button forwards no router state, and
              /privacy reads `from` to build its back link. */}
          <Link
            to="/privacy"
            state={{ from: pathname }}
            className="inline-flex min-h-11 min-w-11 items-center font-bold text-[var(--color-primary-strong)] underline"
          >
            {tn('notice.readFull')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ShortNotice

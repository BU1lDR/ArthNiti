// The privacy notice, as data: its version, and every dictionary key whose text
// is part of it.
//
// No imports and no import.meta, on purpose. tools/parity4.mjs imports this file
// in plain Node, hashes the text of every key below in all 8 languages, and fails
// when that hash no longer matches tools/notice-version.json. A consent record
// names NOTICE_VERSION, so the version has to change whenever the words a person
// agreed to change: edit a notice sentence, bump the version, record the new hash.
//
// Every key is written out in full. tools/keycheck.mjs reads quoted literals and
// cannot see a key built from a template string.
export const NOTICE_VERSION = '2026-09-27.1'

// What FinancePage sends, one [request field, label key] pair per field, in the
// order the questions are asked. /privacy renders the labels as the itemised list
// of what leaves the device. They are the same errf.* labels the 422 banner uses
// (FIELD_LABELS in api.js). backend/tests/test_notice_sent_fields.py fails when
// these fields are not exactly the fields of FinancePage's payload and the
// request fields the backend reads, or when a label differs from FIELD_LABELS.
// parity4 hashes the list, so adding, removing or reordering a field needs a new
// NOTICE_VERSION.
export const SENT_FIELDS = [
  ['business_category', 'errf.category'],
  ['initial_investment', 'errf.investment'],
  ['expected_monthly_revenue', 'errf.revenue'],
  ['monthly_operating_expenses', 'errf.opExpenses'],
  ['existing_debt', 'errf.debt'],
  ['state', 'errf.state'],
  ['district', 'errf.district'],
  ['location_type', 'errf.areaType'],
  ['available_capital', 'errf.capital'],
  ['monthly_expenses', 'errf.expenses'],
  ['monthly_emi', 'errf.emi'],
  ['household_monthly_income', 'errf.householdIncome'],
]

export const SENT_FIELD_KEYS = SENT_FIELDS.map(([, key]) => key)

// Every key the short notice, the consent block and /privacy render, plus the
// other sentences that say how answers are handled, and the button names that
// are filled into them. useNoticeText() refuses, in development, to render a key
// that is missing here, so the hash cannot quietly miss a sentence on screen.
export const NOTICE_KEYS = [
  // The short notice on /login, /profile and /finance.
  'notice.sent',
  'notice.local',
  'notice.demo',
  'notice.demoOperator',
  'notice.readFull',

  // The /finance consent block.
  'consent.title',
  'consent.agree',
  'consent.required',
  'consent.age',
  'consent.ageRequired',

  // /privacy.
  'privacy.eyebrow',
  'privacy.title',
  'privacy.subtitle',
  'privacy.whoTitle',
  'privacy.whoText',
  'privacy.whoDemo',
  'privacy.fiduciarySite',
  'privacy.sentTitle',
  'privacy.sentLead',
  'privacy.sentConsent',
  'privacy.localTitle',
  'privacy.localText',
  'privacy.whyTitle',
  'privacy.whyText',
  'privacy.keptTitle',
  'privacy.keptText',
  'privacy.keptDays',
  'privacy.keptAsk',
  'privacy.keptUnknown',
  'privacy.hostLogs',
  'privacy.choicesTitle',
  'privacy.choiceStop',
  'privacy.choiceStartOver',
  'privacy.choiceRights',
  'privacy.choiceNoContact',
  'privacy.grievanceLink',
  'privacy.board',
  'privacy.age',
  'privacy.version',

  // The itemised list of what is sent.
  'errf.category',
  'errf.investment',
  'errf.revenue',
  'errf.opExpenses',
  'errf.debt',
  'errf.state',
  'errf.district',
  'errf.areaType',
  'errf.capital',
  'errf.expenses',
  'errf.emi',
  'errf.householdIncome',

  // Elsewhere on the pages, each saying what is kept or sent.
  'form.localOnly',
  'finance.privacyNote',
  'login.subtitle',
  'common.startOverText',
  'rp.keepNote',
  'man.needText',

  // Filled into the sentences above as {button} or {startover}, and the footer
  // link that opens /privacy.
  'finance.submit',
  'common.startOver',
  'common.privacy',
]

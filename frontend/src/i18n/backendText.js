import { useI18n } from './LanguageContext'

// One place that knows how to read the code fields the Python services attach to
// their prose. Without this, four result pages would each re-derive the same
// "prefer the code, fall back to the English sentence" logic, and the scheme
// reason — the only one that needs a placeholder filled — would get it wrong in
// three of them.
//
// The formatters (formatCurrency, hasNumber) stay duplicated per page as the rest
// of this codebase does, because each page wants slightly different empty-state
// wording. This is different: the mapping from a code to a string is the same
// everywhere, and a copy that drifts shows a user English on one page and their
// own language on the next.

// Scheme documents name a kind of work in their own vocabulary. Those words are
// data, not UI copy, so they live in schemes.json in English and are translated
// here at render. Every value in schemes.json's `business_categories` must have a
// key; an unmapped one falls through to the English word rather than vanishing.
// All 13 distinct values in the file are mapped. If you add a scheme with a
// fourteenth, add the word here and to schemeStrings.js in the same edit.
const CATEGORY_KEYS = {
  'food processing': 'scat.foodProcessing',
  'food manufacturing': 'scat.foodManufacturing',
  'agri-food processing': 'scat.agriFoodProcessing',
  'street vending': 'scat.streetVending',
  agriculture: 'scat.agriculture',
  manufacturing: 'scat.manufacturing',
  services: 'scat.services',
  trading: 'scat.trading',
  tailoring: 'scat.tailoring',
  handicrafts: 'scat.handicrafts',
  dairy: 'scat.dairy',
  poultry: 'scat.poultry',
  beekeeping: 'scat.beekeeping',
}

// Which layer of government runs a scheme. `level` is a backend enum and stays
// English internally because scheme_service sorts on it (LEVEL_RANK in
// scheme_service.py must stay in step with LEVEL_ORDER below); it becomes a
// reader-facing phrase only here.
//
// Deliberately camelCase on the right: `t()` renders a missing key as its own
// dotted name, so `lvl.sub_district` would leak an underscore into the page if
// the key were ever mistyped. The keys in resultStrings.js are lvl.subDistrict
// and lvl.localBody for that reason.
const LEVEL_KEYS = {
  central: 'central',
  state: 'state',
  regional: 'regional',
  district: 'district',
  sub_district: 'subDistrict',
  block: 'block',
  local_body: 'localBody',
}

// Outward from Delhi to the reader's own panchayat — the same order the backend
// sorts by, so a grouped page and an ungrouped list agree about what comes first.
export const LEVEL_ORDER = ['central', 'state', 'regional', 'district', 'sub_district', 'block', 'local_body']

const normalise = (level) => String(level === undefined || level === null ? '' : level).trim().toLowerCase()

// An unrecognised level title-cases rather than vanishing or printing a dotted
// key — the same contract STATUS_KEYS and CHOICE_KEYS follow on the result
// pages. A missing level is different from an unknown one: it gets the catch-all
// heading, because there is no enum text to show.
function levelLabel(level, t) {
  const raw = normalise(level)
  if (!raw) return t('lvl.other')
  const key = LEVEL_KEYS[raw]
  if (key) return t(`lvl.${key}`)
  return raw.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// A tier name on its own teaches a reader nothing — plenty of people have never
// heard the words "block office". The note says where they would physically go,
// which is the whole reason the tier is worth showing.
function levelNote(level, t) {
  return t(`lvlnote.${LEVEL_KEYS[normalise(level)] || 'other'}`)
}

// Why a scheme is on the reader's list, as the scorer decided it. `fit_basis` is
// a backend enum set in the same branch as the +40 / +30 in scheme_service.py:
// "state" when the scheme's own states list names the reader's state and no
// other, "region" when it names theirs among several (UNNATI's eight
// North-Eastern states, Vibrant Villages' six border ones), "national" when it
// is for every state.
//
// This is what the card prints INSTEAD of the score. The score is only ever 90
// or 100 and it checks no eligibility rule, so "90% match" read as a 90% chance
// of qualifying, which nothing in the backend computes. The label says the one
// true thing the difference between the two numbers means. Do not bring the
// percentage back as a badge, a chart label or an aria-label.
const FIT_KEYS = {
  state: 'sc.fitState',
  region: 'sc.fitRegion',
  national: 'sc.fitNational',
}

// Narrowest list first, the same way the backend's sort puts score 100 above
// score 90 (state and region both score 100), so the chart and the card list
// agree about what comes first.
export const FIT_ORDER = ['state', 'region', 'national']

// A missing basis prints nothing: the backend sends null only when neither
// geography branch ran, and no real request reaches that. An unknown one
// title-cases rather than vanishing or printing a dotted key, the same contract
// levelLabel follows.
export function fitLabel(basis, t) {
  const raw = normalise(basis)
  if (!raw) return ''
  const key = FIT_KEYS[raw]
  if (key) return t(key)
  return raw.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// The crop a mandi price row is about. `commodity_id` is a stable id the fetch
// tool writes (tools/market-commodities.json holds the list), and the row's
// `commodity` is the English name beside it. Keyed on the id, not the name,
// because the id is what cannot drift; keycheck compares this map against both
// the data file and that list, so a commodity added there without an entry here
// fails the check rather than printing English inside a translated card.
// Deliberately not `commodity_code`: keycheck reads every *_code field as a
// translation code.
const COMMODITY_KEYS = {
  wheat: 'cmd.wheat',
  paddy_common: 'cmd.paddyCommon',
  potato: 'cmd.potato',
  onion: 'cmd.onion',
  tomato: 'cmd.tomato',
  ginger_green: 'cmd.gingerGreen',
  green_chilli: 'cmd.greenChilli',
  garlic: 'cmd.garlic',
  mustard: 'cmd.mustard',
  coriander_leaves: 'cmd.corianderLeaves',
}

// A scheme's own prose is keyed by its id. The backend sends the key outright as
// description_code / support_type_code; deriving it from `scheme_id` is the
// fallback for a scheme row that has an id but no explicit code. Neither one
// means no key, which means tBackend prints the English the backend sent — so a
// scheme added to schemes.json without either still renders, just untranslated.
const schemeKey = (scheme, part, explicit) =>
  explicit || (scheme && scheme.scheme_id ? `sdata.${scheme.scheme_id}.${part}` : null)

export function useBackendText() {
  const { t, tBackend, tBackendEach } = useI18n()

  // Joined with ' / ' here rather than in Python, because the backend would have
  // to join English words before we ever saw them. Translating each word and
  // rejoining is what keeps "manufacturing / services" from appearing inside an
  // otherwise Tamil sentence.
  const categoryWords = (categories) =>
    (categories || [])
      .map((name) => {
        const key = CATEGORY_KEYS[String(name).toLowerCase().trim()]
        return key ? t(key) : name
      })
      .join(' / ')

  return {
    advice: (advisory) =>
      tBackendEach(advisory?.recommendation_codes, advisory?.recommendations),

    observations: (business) =>
      tBackendEach(business?.observation_codes, business?.observations),

    riskReason: (risk) => tBackend(risk?.reason_code, risk?.reason),

    summaryMessage: (summary) => tBackend(summary?.message_code, summary?.simple_message),

    // `next_step_code` is null in one branch on purpose: when the step is
    // borrowed from the advisory list the backend copies that entry's code, and
    // if the list were somehow empty there is no code to copy.
    nextStep: (summary) => tBackend(summary?.next_step_code, summary?.next_step),

    marketSource: (row) => tBackend(row?.source_code, row?.source),

    // Not tBackend: the commodity is a name the fetch chose from a fixed list,
    // not a sentence. An unknown id falls back to the English name the row
    // carries, then to nothing, so a caller never prints a dotted key.
    commodityName: (row) => {
      const key = COMMODITY_KEYS[normalise(row?.commodity_id)]
      return key ? t(key) : row?.commodity || ''
    },

    // Optional on a row, as a pair: note_code and note are both present or
    // both absent. Empty when there is none, so a caller can gate on it.
    marketNote: (row) => tBackend(row?.note_code, row?.note),

    // Not tBackend: `level` is an enum the backend chose, not a sentence it
    // wrote, so there is no English prose to fall back to — the label comes from
    // our own dictionary via t().
    schemeLevel: (scheme) => levelLabel(scheme?.level, t),

    schemeLevelNote: (scheme) => levelNote(scheme?.level, t),

    levelLabel: (level) => levelLabel(level, t),

    levelNote: (level) => levelNote(level, t),

    // Not tBackend, for the same reason as schemeLevel: fit_basis is an enum,
    // not a sentence. Empty string when the backend sent none, so a caller can
    // gate on the result and render nothing.
    schemeFit: (scheme) => fitLabel(scheme?.fit_basis, t),

    schemeDescription: (scheme) =>
      tBackend(schemeKey(scheme, 'description', scheme?.description_code), scheme?.description),

    schemeSupport: (scheme) =>
      tBackend(schemeKey(scheme, 'support', scheme?.support_type_code), scheme?.support_type),

    // Not tBackendEach: each code here is an object carrying its own
    // `categories`, so the placeholder has to be filled per item.
    schemeReasons: (scheme) => {
      const english = Array.isArray(scheme?.match_reasons) ? scheme.match_reasons : []
      const codes = Array.isArray(scheme?.match_reason_codes) ? scheme.match_reason_codes : []
      return english.map((text, index) => {
        const entry = codes[index]
        if (!entry || !entry.code) return text
        return tBackend(entry.code, text, { categories: categoryWords(entry.categories) })
      })
    },

    schemeEligibility: (scheme) =>
      tBackendEach(scheme?.eligibility_codes, scheme?.eligibility_rules),

    schemeDocuments: (scheme) => tBackendEach(scheme?.document_codes, scheme?.documents),
  }
}

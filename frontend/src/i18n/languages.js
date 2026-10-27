// The language and dialect catalogue.
//
// Each language carries its own endonym (its name in its own script) because a
// user who cannot read English cannot find "Tamil" in a list — they can find
// "தமிழ்". `sample` is a short line shown next to the option so the reader can
// confirm the script before committing to the switch.
//
// Dialects cascade from the language: picking Hindi offers Hindi dialects only.
// See DIALECT_PHRASES below for exactly how far dialect support goes — it is a
// curated phrase layer, not a full translation, and the UI says so.

export const LANGUAGES = [
  { code: 'en', name: 'English', endonym: 'English', sample: 'Money left each month' },
  { code: 'hi', name: 'Hindi', endonym: 'हिन्दी', sample: 'हर महीने बचने वाला पैसा' },
  { code: 'ta', name: 'Tamil', endonym: 'தமிழ்', sample: 'மாதம் மிச்சமாகும் பணம்' },
  { code: 'te', name: 'Telugu', endonym: 'తెలుగు', sample: 'నెలకు మిగిలే డబ్బు' },
  { code: 'ml', name: 'Malayalam', endonym: 'മലയാളം', sample: 'മാസം ബാക്കിയാകുന്ന പണം' },
  { code: 'kn', name: 'Kannada', endonym: 'ಕನ್ನಡ', sample: 'ತಿಂಗಳಿಗೆ ಉಳಿಯುವ ಹಣ' },
  { code: 'mr', name: 'Marathi', endonym: 'मराठी', sample: 'दर महिन्याला उरणारे पैसे' },
  { code: 'bn', name: 'Bengali', endonym: 'বাংলা', sample: 'প্রতি মাসে বাকি থাকা টাকা' },
]

export const DEFAULT_LANGUAGE = 'hi'

// Dialects and regional varieties, by language. These are the widely recognised
// varieties of each language; where a variety is often argued to be a language
// in its own right (Bhojpuri, Chhattisgarhi, Sylheti, Tulu) it is still listed
// under the language whose speakers most often select it on a form, which is a
// practical choice and not a linguistic claim.
export const DIALECTS = {
  en: [
    { code: 'en-IN', label: 'Indian English' },
  ],
  hi: [
    { code: 'hi-khari', label: 'खड़ी बोली / Khari Boli' },
    { code: 'hi-awadhi', label: 'अवधी / Awadhi' },
    { code: 'hi-bhojpuri', label: 'भोजपुरी / Bhojpuri' },
    { code: 'hi-braj', label: 'ब्रज / Braj' },
    { code: 'hi-bundeli', label: 'बुंदेली / Bundeli' },
    { code: 'hi-chhattisgarhi', label: 'छत्तीसगढ़ी / Chhattisgarhi' },
    { code: 'hi-haryanvi', label: 'हरियाणवी / Haryanvi' },
    { code: 'hi-magahi', label: 'मगही / Magahi' },
    { code: 'hi-marwari', label: 'मारवाड़ी / Marwari' },
  ],
  ta: [
    { code: 'ta-chennai', label: 'சென்னை / Chennai' },
    { code: 'ta-kongu', label: 'கொங்கு / Kongu' },
    { code: 'ta-madurai', label: 'மதுரை / Madurai' },
    { code: 'ta-nellai', label: 'நெல்லை / Nellai' },
  ],
  te: [
    { code: 'te-telangana', label: 'తెలంగాణ / Telangana' },
    { code: 'te-rayalaseema', label: 'రాయలసీమ / Rayalaseema' },
    { code: 'te-coastal', label: 'కోస్తా ఆంధ్ర / Coastal Andhra' },
  ],
  ml: [
    { code: 'ml-malabar', label: 'മലബാർ / Malabar' },
    { code: 'ml-central', label: 'മധ്യ കേരളം / Central Kerala' },
    { code: 'ml-travancore', label: 'തിരുവിതാംകൂർ / Travancore' },
  ],
  kn: [
    { code: 'kn-mysuru', label: 'ಮೈಸೂರು / Mysuru' },
    { code: 'kn-dharwad', label: 'ಧಾರವಾಡ / Dharwad' },
    { code: 'kn-mangaluru', label: 'ಮಂಗಳೂರು / Mangaluru' },
    { code: 'kn-kalyana', label: 'ಕಲ್ಯಾಣ ಕರ್ನಾಟಕ / Kalyana Karnataka' },
  ],
  mr: [
    { code: 'mr-deshi', label: 'देशी / Deshi' },
    { code: 'mr-varhadi', label: 'वऱ्हाडी / Varhadi' },
    { code: 'mr-khandeshi', label: 'खानदेशी / Khandeshi' },
    { code: 'mr-konkan', label: 'कोंकणी बाज / Konkan coast' },
  ],
  bn: [
    { code: 'bn-rarhi', label: 'রাঢ়ী / Rarhi' },
    { code: 'bn-varendri', label: 'বরেন্দ্রী / Varendri' },
    { code: 'bn-sylheti', label: 'সিলেটি / Sylheti' },
  ],
}

// How dialect support actually works, stated plainly because it would be easy
// to overclaim: the whole UI is translated at the LANGUAGE level. A dialect
// selection then overrides a small curated set of the highest-visibility
// phrases — the greeting and the words for money. It stays in this browser: it
// is never sent to the backend, and it changes no figure or advice.
//
// Anything not listed here falls through to the language translation, so a
// dialect with no overrides is still a completely usable UI.
export const DIALECT_PHRASES = {
  'hi-bhojpuri': {
    'greeting.hello': 'प्रणाम',
    'landing.cta': 'आपन सफर सुरू करीं',
    'money.left': 'हर महीना बाचल पइसा',
  },
  'hi-awadhi': {
    'greeting.hello': 'राम-राम',
    'landing.cta': 'आपन जतरा सुरू करौ',
    'money.left': 'हर महीना बचा पैसा',
  },
  'hi-haryanvi': {
    'greeting.hello': 'राम-राम',
    'landing.cta': 'अपणा सफर शुरू कर',
    'money.left': 'हर महीने बचण आळा पैसा',
  },
  'hi-marwari': {
    'greeting.hello': 'खम्मा घणी',
    'landing.cta': 'आपणी शुरुआत करो',
    'money.left': 'हर महीनै बचण वाळो पैसो',
  },
  'hi-chhattisgarhi': {
    'greeting.hello': 'जय जोहार',
    'landing.cta': 'अपन सफर सुरू करव',
    'money.left': 'हर महीना बचे पईसा',
  },
  'ta-madurai': {
    'greeting.hello': 'வணக்கம்ங்க',
    'money.left': 'மாசம் மீதமாகுற காசு',
  },
  'te-telangana': {
    'greeting.hello': 'నమస్కారం',
    'money.left': 'నెలకు మిగిలే పైసలు',
  },
  'ml-malabar': {
    'greeting.hello': 'അസ്സലാമു അലൈക്കും / നമസ്കാരം',
    'money.left': 'മാസം ബാക്കിയാവുന്ന കായി',
  },
  'bn-sylheti': {
    'greeting.hello': 'আদাব',
    'money.left': 'প্রতি মাসো বাকি ট্যাকা',
  },
}

export function dialectsFor(languageCode) {
  return DIALECTS[languageCode] || []
}

export function languageByCode(code) {
  return LANGUAGES.find((entry) => entry.code === code) || null
}

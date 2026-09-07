// The product name, as one constant, deliberately NOT a translatable string.
//
// It used to be `common.appName` and `landing.eyebrow` in strings.js, translated
// eight ways (अर्थनीति / அர்த்நீதி / అర్థనీతి / ...). That was wrong: a brand is a
// proper noun, so switching the interface to Tamil renamed the product, and a
// judge switching languages mid-demo saw four different names for the same app.
// The mark, the masthead, the footer, the breadcrumb and the <title> all read
// from here now, so the name cannot drift between them either.
//
// It lives in i18n/ on purpose rather than somewhere neutral: this is the folder
// anyone reaches for when they want to add a translation, and this comment is
// what they need to read before adding `common.appName` back.
//
// The mixed script is intentional and is the logo's own wordmark — Devanagari
// अर्थ ("wealth") plus Latin Niti ("policy"). Do not transliterate either half.
// The only string that still names the product is `login.title`, which carries
// it as an {app} placeholder so the sentence around it can still be translated.
export const APP_NAME = 'अर्थNiti'

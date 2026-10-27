// Who runs this copy of the app, read once from the build environment.
//
// In a client deployment the client is the Data Fiduciary: it decides why the
// answers are collected and answers for them, and the privacy notice has to name
// it and say how to reach it. Those details differ per client, so they come from
// VITE_* variables set at build time (frontend/.env.example lists them) rather
// than from the dictionaries.
//
// Every VITE_* value is compiled into the JavaScript bundle that any visitor can
// download, so nothing here may ever be a secret. Vite reads .env files from
// frontend/ only (envDir is left at its default), so the repo-root .env, which
// holds the data.gov.in key, is never read into the bundle.
//
// No fiduciary name means demo mode: the notices then say this is a demonstration
// and ask for made-up figures, because no organisation has taken responsibility
// for real ones.

const env = import.meta.env

// Anything that is not a string, or is only spaces, counts as unset.
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// A link the notice prints must be https. Anything else, including a bare domain
// or an http:// address, counts as unset rather than being printed as a link.
function https(value) {
  const raw = text(value)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

// A whole number of days from 1 to 99999. Anything else counts as unset, and the
// notice then says the period has not been set rather than printing a guess.
function days(value) {
  const raw = text(value)
  return /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : null
}

export const DEPLOYMENT = Object.freeze({
  fiduciaryName: text(env.VITE_FIDUCIARY_NAME),
  fiduciaryUrl: https(env.VITE_FIDUCIARY_URL),
  // Printed as plain text, never as a link: it may be an email address, a phone
  // number or a postal address.
  privacyContact: text(env.VITE_PRIVACY_CONTACT),
  grievanceUrl: https(env.VITE_GRIEVANCE_URL),
  retentionDays: days(env.VITE_RECORD_RETENTION_DAYS),
  // Only the exact string 'true' turns the age question on.
  requireAgeCheck: text(env.VITE_REQUIRE_AGE_CHECK) === 'true',
  // Only the exact string 'true' offers the voice-and-text helper (/talk). The
  // backend has to be started with ARTHNITI_AI_ENABLED=true too: this decides
  // only whether the pages show the way in. Off, no page mentions it.
  aiHelper: text(env.VITE_AI_HELPER) === 'true',
})

export const DEMO_MODE = DEPLOYMENT.fiduciaryName === ''

/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, DIALECT_PHRASES, dialectsFor, languageByCode } from './languages'
import { FALLBACK_LANGUAGE, STRINGS } from './strings'

const LanguageContext = createContext(null)

const LANGUAGE_KEY = 'sih-language'
const DIALECT_KEY = 'sih-dialect'

// The lookup order is dialect override, then the chosen language, then English.
// The English fallback is per key rather than per language, so a language that
// is only half translated still shows every string it does have instead of
// falling back wholesale — and a missing key never leaks as raw `money.left`.
function lookup(key, languageCode, dialectCode) {
  const dialect = dialectCode ? DIALECT_PHRASES[dialectCode] : null
  if (dialect && dialect[key] !== undefined) return dialect[key]

  const table = STRINGS[languageCode]
  if (table && table[key] !== undefined) return table[key]

  const fallback = STRINGS[FALLBACK_LANGUAGE]
  if (fallback[key] !== undefined) return fallback[key]

  return key
}

// {name} style placeholders. Kept deliberately simple: no plural rules, no
// number formatting. Indic plurals and grammatical case are a real problem, but
// the strings here are written to avoid needing them.
function fill(template, values) {
  if (!values) return template
  return Object.keys(values).reduce(
    (text, name) => text.split(`{${name}}`).join(String(values[name])),
    template,
  )
}

function readStored(key, fallbackValue) {
  try {
    return window.localStorage.getItem(key) || fallbackValue
  } catch {
    return fallbackValue
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const stored = readStored(LANGUAGE_KEY, DEFAULT_LANGUAGE)
    return STRINGS[stored] ? stored : DEFAULT_LANGUAGE
  })
  const [dialect, setDialectState] = useState(() => readStored(DIALECT_KEY, ''))

  // `lang` on <html> is not decoration: it tells the browser which font and
  // which hyphenation and which voice a screen reader should use. Getting it
  // wrong makes Tamil read out in an English voice.
  useEffect(() => {
    document.documentElement.lang = language
    try {
      window.localStorage.setItem(LANGUAGE_KEY, language)
    } catch {
      // A blocked storage API should not break the app.
    }
  }, [language])

  useEffect(() => {
    try {
      window.localStorage.setItem(DIALECT_KEY, dialect)
    } catch {
      // Same.
    }
  }, [dialect])

  const value = useMemo(() => {
    // Changing the language has to clear a dialect that belonged to the old
    // one, the same way changing state clears the district.
    const setLanguage = (next) => {
      setLanguageState(STRINGS[next] ? next : FALLBACK_LANGUAGE)
      setDialectState('')
    }

    const setDialect = (next) => {
      const allowed = dialectsFor(language).some((entry) => entry.code === next)
      setDialectState(allowed ? next : '')
    }

    const t = (key, values) => fill(lookup(key, language, dialect), values)

    // For prose the backend generated. Unlike `t`, this must never fall back to
    // the key: `adv.growRevenue` on screen is worse than the English sentence
    // the backend already sent alongside it. So a code with no translation
    // degrades to that English, and a brand-new rules branch stays readable
    // instead of leaking a dotted name.
    const tBackend = (code, englishText, values) => {
      if (!code) return englishText ?? ''
      const found = lookup(code, language, dialect)
      if (found === code) return englishText ?? code
      return fill(found, values)
    }

    // The list form. Backend services build a sentence list and a code list in
    // lockstep, so index i of one describes index i of the other — but the
    // English list is the one that decides the length, because it is the list
    // that is guaranteed to exist.
    const tBackendEach = (codes, englishItems, values) =>
      (englishItems || []).map((text, index) =>
        tBackend(codes?.[index], text, values?.[index]),
      )

    const meta = languageByCode(language)

    return {
      language,
      dialect,
      setLanguage,
      setDialect,
      t,
      tBackend,
      tBackendEach,
      // What the backend should be told. The API contract already carries both
      // fields; it just does not act on them yet.
      apiLanguage: meta ? meta.name : 'English',
      apiDialect: dialect || null,
      dialects: dialectsFor(language),
    }
  }, [language, dialect])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useI18n() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useI18n must be used inside LanguageProvider')
  return context
}

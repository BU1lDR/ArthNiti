// The dates the scheme rules in backend/app/data/schemes.json were checked,
// printed in the footer.
//
// FROM is the earliest last_verified in that file and TO is the latest. They
// are a range, not one date, because the schemes were not all checked on the
// same day: printing only the latest would say that every rule was checked then.
//
// backend/tests/test_review_dates.py reads this file with a regex and fails if
// either constant stops matching schemes.json, so a dataset update that moves a
// date cannot leave the footer printing the old one. Keep both as plain
// 'yyyy-mm-dd' string literals.

export const SCHEMES_CHECKED_FROM = '2026-09-01'

export const SCHEMES_CHECKED_TO = '2026-09-07'

// 2026-09-07 -> 07/09/2026: day first, as Indian forms write it, and in Latin
// digits in every language, like the money figures.
export function formatReviewDate(iso) {
  const [year, month, day] = String(iso).split('-')
  return `${day}/${month}/${year}`
}

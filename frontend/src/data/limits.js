// The largest values a form will accept, in one place.
//
// The backend refuses anything above these (backend/app/schemas/limits.py), so
// the form stops the reader first with the browser's own message instead of a
// round trip that ends in an error banner. The figures are generous on purpose:
// Rs 100 crore is far beyond any micro enterprise, so a real answer never meets
// the cap. It exists to stop a number that is not an answer, such as a slip of
// the finger that adds six zeros.
//
// backend/tests/test_input_bounds.py reads this file with a regex and fails if
// the two files disagree, so keep each line a plain number literal.

export const MAX_RUPEES = 1_000_000_000

export const MAX_EMPLOYEES = 10_000

// The longest business category the backend accepts. The fixed choices are far
// shorter; this caps the typed "Other" category, which is sent as the category.
export const MAX_CATEGORY_LENGTH = 100

// The voice-and-text helper on /talk. The text box stops typing at the first;
// the recorder stops before a recording grows past the second (a minute at 16 kHz,
// mono, 16-bit is 1.92 MB), which is the most the backend takes.
export const MAX_TALK_TEXT = 2000

export const MAX_AUDIO_BYTES = 3_000_000

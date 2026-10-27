"""The largest values a request may carry, in one place.

Every rupee field on every request model is capped at MAX_RUPEES and every
headcount at MAX_EMPLOYEES, and each rupee field also refuses Infinity and NaN
(allow_inf_nan=False). Without the caps, a typed 1e308 went through the whole
pipeline and came back as "profitable", "low" risk and status "good", and
Infinity came back as the same verdicts beside figures that were all null.

The figures are generous on purpose. ₹100 crore is far beyond any micro
enterprise, so a real answer never meets the cap; it exists to stop a number
that is not an answer from being treated as one.

Every text field is capped too (max_length), for the same reason and one more:
an unbounded string is an unbounded amount of someone's personal data held in
memory for the request. The lengths below were measured against what the
frontend can send (see each constant) and then given generous room for other
callers' spellings. tests/test_string_limits.py reads the OpenAPI schema and
fails if any string in any request body has no maxLength.

frontend/src/data/limits.js exports MAX_RUPEES, MAX_EMPLOYEES,
MAX_CATEGORY_LENGTH, MAX_TALK_TEXT and MAX_AUDIO_BYTES for the frontend.
tests/test_input_bounds.py fails if the two files disagree.
"""

MAX_RUPEES = 1_000_000_000

MAX_EMPLOYEES = 10_000

# The business category. The fixed choices are at most 15 characters; "Other"
# is typed free text and is sent as the category, so the frontend caps that
# input at this same figure (mirrored in limits.js).
MAX_CATEGORY_LENGTH = 100

# A state or district name. The longest of the 36 states and union territories
# is 40 characters ("Dadra and Nagar Haveli and Daman and Diu"), the longest of
# the 768 districts 31.
MAX_PLACE_LENGTH = 60

# Short free text: a village, a market type, a person's name, a location.
MAX_SHORT_TEXT = 100

# Longer free text: who the customers are.
MAX_LONG_TEXT = 200

# The entrepreneur profile's goals: a sentence or two.
MAX_GOALS_LENGTH = 500

# A language name or dialect code, or an entrepreneur type. The longest the
# frontend has ever sent is 16 characters.
MAX_CODE_LENGTH = 40

# A one-word setting: literacy_level, location_type (at most 10 measured).
MAX_ENUM_LENGTH = 20

# The consent record (schemas/analysis.py Consent): the version of the notice
# the person was shown, the UI language code it was shown in, and when they
# agreed, as an ISO 8601 date and time with its offset.
MAX_NOTICE_VERSION_LENGTH = 40
MAX_LANGUAGE_CODE_LENGTH = 8
MAX_TIMESTAMP_LENGTH = 40

# The voice-and-text helper (api/routes/intake.py). What a person types or says
# about their business: a minute of speech is about 150 words, well under this.
# Mirrored in limits.js, where the text box stops typing at it.
MAX_TALK_TEXT = 2000

# A recording as a WAV file. The page records at most 60 seconds at 16 kHz, mono,
# 16-bit, which is 1.92 MB; this leaves room for 24 kHz (62 seconds). Meta's own
# limit is 32 MB, so this is the tighter one. Mirrored in limits.js.
MAX_AUDIO_BYTES = 3_000_000

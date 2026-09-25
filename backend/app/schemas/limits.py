"""The largest values a request may carry, in one place.

Every rupee field on every request model is capped at MAX_RUPEES and every
headcount at MAX_EMPLOYEES, and each rupee field also refuses Infinity and NaN
(allow_inf_nan=False). Without the caps, a typed 1e308 went through the whole
pipeline and came back as "profitable", "low" risk and status "good", and
Infinity came back as the same verdicts beside figures that were all null.

The figures are generous on purpose. ₹100 crore is far beyond any micro
enterprise, so a real answer never meets the cap; it exists to stop a number
that is not an answer from being treated as one.

frontend/src/data/limits.js exports the same two constants for the frontend.
tests/test_input_bounds.py fails if the two files disagree.
"""

MAX_RUPEES = 1_000_000_000

MAX_EMPLOYEES = 10_000

# API contract: `POST /api/analysis/run`

This is the one endpoint the अर्थNiti frontend calls. This page covers what it takes, what it returns, and how it fails. Everything here was measured against the running backend on 27 Sept 2026. With the optional AI helper switched on, the frontend also calls two intake routes; they are covered in their own section near the end, measured on 27 Oct 2026.

`docs/PROCESSOR_SCHEDULE.md` covers what the deployment sends, logs and keeps, and how to configure it. This page does not repeat that.

## Where it runs

| Mode | Set by | Base URL | What is mounted |
|---|---|---|---|
| development | `ARTHNITI_ENV` unset or `development` | `http://127.0.0.1:8000` | all 8 routers (9 with the AI helper on); Swagger at `/docs`, plus `/redoc` and `/openapi.json` |
| production | `ARTHNITI_ENV=production` | the deployer's own https origin | `GET /health` and `POST /api/analysis/run` only, plus the two intake routes when the AI helper is on. Everything else, the docs included, is a 404 |

The frontend takes the base URL from `VITE_API_BASE_URL`. `npm run build` refuses to build unless that URL starts with `https://`. `npm run build:local` builds against `http://127.0.0.1:8000`.

The other development routes wrap single services:

- `POST /api/entrepreneur/profile`
- `/api/business/analyze`
- `/api/financial/analyze`
- `/api/schemes/match`
- `/api/advisory/recommend`
- `/api/market/context`

They are not part of this contract. `/api/advisory/recommend` does not price the funding gap as a loan, so its advice can disagree with this endpoint's.

## Request

`Content-Type: application/json` is required. Any other content type gets a 422.

```json
{
  "business_category": "tailoring",
  "state": "Uttar Pradesh",
  "district": "Lucknow",
  "location_type": "rural",
  "available_capital": 50000,
  "monthly_expenses": 12000,
  "expected_monthly_revenue": 30000,
  "monthly_emi": 0,
  "initial_investment": 80000,
  "monthly_operating_expenses": 12000,
  "existing_debt": 0,
  "household_monthly_income": 40000,
  "consent": {
    "notice_version": "2026-09-27.1",
    "language": "hi",
    "given_at": "2026-09-27T10:00:00.000Z",
    "age_confirmed": null
  }
}
```

This is the request behind the test vector in §4.3 of the schedule. The frontend sends exactly these 12 answer fields and the `consent` object.

### Answer fields

All rupee amounts are numbers between 0 and 1,000,000,000 (₹100 crore). Infinity and NaN are refused.

| Field | Type | Required | Default | Limits and meaning |
|---|---|---|---|---|
| `business_category` | string | yes | | 2–100 characters. The UI sends one of `retail`, `food processing`, `handicrafts`, `tailoring`, `agriculture`, `dairy`, `services` or `manufacturing`, or the reader's own words for "Other". It is matched against scheme categories by substring, so keep the values in English |
| `state` | string | yes | | 2–60 characters. A state or union territory name, spelled as in `frontend/src/data/indiaLocations.js` |
| `district` | string | no | `""` | Up to 60 characters. Market figures are returned only for the reader's own district, or state-wide ones for their state |
| `location_type` | string | no | `"rural"` | 2–20 characters. `rural`, `semi-urban` or `urban`. Some schemes are open only to some of these |
| `available_capital` | number | yes | | money already in hand |
| `monthly_expenses` | number | yes | | monthly spending; drives `monthly_profit` |
| `expected_monthly_revenue` | number | yes | | monthly sales expected |
| `monthly_emi` | number | yes | | instalments already paid each month |
| `initial_investment` | number | yes | | cost of starting |
| `monthly_operating_expenses` | number | yes | | monthly cost of running the business; drives `monthly_operating_surplus`. A separate input from `monthly_expenses`, and it can disagree with it |
| `existing_debt` | number | no | `0` | the principal still owed on the loan `monthly_emi` repays. Not counted again in the repayment pressure |
| `household_monthly_income` | number or `null` | no | `null` | the household's income from all sources. **`null` means "not asked" and skips the household check. `0` is a real answer, a household with no income, and puts any repayment over the limit.** |

### The consent object

`consent` is required when the backend runs with `ARTHNITI_REQUIRE_CONSENT` on. That is the default in production and off in development. Without it the reply is a 422 with `loc` `["body", "consent"]`.

The object refuses fields it does not define. It is written to the request's processing log line. It is never passed to the analysis and never returned.

| Field | Type | Rule |
|---|---|---|
| `notice_version` | string | 1–40 characters of `0-9 A-Z a-z . -`. The version of the notice the reader was shown |
| `language` | string | the UI language code the notice was shown in, such as `hi`. Pattern `^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$` |
| `given_at` | string | when the reader agreed. It must be an ISO 8601 date and time with an offset (`Z` or `+05:30`), as `Date.prototype.toISOString()` writes it, and a real moment. A Unix time is refused |
| `age_confirmed` | boolean or `null` | recorded as sent. The server does not check it |

### Fields accepted and ignored

`employees`, `village`, `market_type`, `customers`, `user_language`, `preferred_dialect`, `literacy_level` and `entrepreneur_type` are validated and capped, then dropped before the analysis. They change nothing and are not echoed. The frontend does not send them.

Any other top-level field is ignored silently.

## Response

A 200 carries these seven top-level keys:

| Section | Keys |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` |
| `risk_analysis` (19) | `pressure_ratio_percent`, `risk_level`, `risk_level_without_new_loan`, `reason`, `reason_code`, `monthly_emi`, `estimated_new_emi`, `total_monthly_emi`, `assumed_interest_rate_percent`, `assumed_tenure_months`, `household_monthly_income`, `household_repayment_percent`, `household_check`, `household_check_without_new_loan`, `household_limit_percent`, `household_microfinance_income_limit`, `household_in_microfinance_range`, `household_reason`, `household_reason_code` |
| `business_analysis` | `business_type`, `initial_investment`, `expected_monthly_revenue`, `monthly_operating_expenses`, `monthly_operating_surplus`, `operating_margin_percent`, `annual_operating_surplus`, `estimated_roi_percent`, `feasibility_status`, `observations[]`, `observation_codes[]` |
| `market_context` | a list, often empty. Every row has `state, district, business_category, scope, metric, source, source_code, last_verified, provenance{20 keys}, match_level`. A `wholesale_price_per_kg` row adds `commodity, commodity_id, unit, indicative_price, price_low, price_high, n_days, n_markets, last_reported`, and sometimes `stale`. A `registered_units` row adds `count, count_suppressed, share_percent, district_total, nic_classes`, and sometimes `note_code`/`note` |
| `scheme_matches` | a list. Every entry has `name, level, scheme_id, description, support_type, match_score, fit_basis, match_reasons[], match_reason_codes[], eligibility_rules[], documents[], description_code, support_type_code, eligibility_codes[], document_codes[], last_verified` |
| `advisory` | `recommendations[]`, `recommendation_codes[]` |
| `mvp_summary` | `status, simple_message, message_code, next_step, next_step_code, priority, location_type` |

**Enums** are English codes. Map them to labels; don't print them.

| Field | Values |
|---|---|
| `financial_status` | `profitable` / `break_even` / `loss` |
| `risk_level`, `risk_level_without_new_loan` | `low` / `moderate` / `high` |
| `household_check`, `household_check_without_new_loan` | `within_limit` / `over_limit` / `not_checked` |
| `feasibility_status` | `feasible` / `break_even` / `not_feasible` |
| `mvp_summary.status` | `good` / `attention_needed` / `review` |
| `level` (scheme) | `central` / `state` / `regional` / `district` / `sub_district` / `block` / `local_body` |
| `fit_basis` (scheme) | `state` / `region` / `national` |
| `metric` (market) | `wholesale_price_per_kg` / `registered_units` |
| `match_level` (market) | `district` / `state` |

**Read these before rendering:**

- **Some fields can be `null`, meaning "cannot be worked out", never 0:**
  - `profit_margin_percent` and `operating_margin_percent`, when revenue is 0;
  - `estimated_roi_percent`, when the investment is 0;
  - `pressure_ratio_percent`, when the surplus is 0 or less (the risk is then `high`);
  - `household_repayment_percent`, when no income was given or the income is 0;
  - `household_in_microfinance_range`, when no income was given.

  `Number(null)` is 0 in JavaScript, so check for `null` before formatting.
- **`estimated_new_emi` is an assumption.** It prices `funding_gap` as a loan at `assumed_interest_rate_percent` (12) over `assumed_tenure_months` (60). `total_monthly_emi` includes it, and so do the pressure and household figures. The `*_without_new_loan` fields show the same checks without it.
- **`match_score` checks no eligibility rule.** Don't show it as a percentage or a likelihood. Show `fit_basis` instead:
  - `state`: "made for your state";
  - `region`: "for a few states, including yours";
  - `national`: "for all of India".

  No rule in `eligibility_rules` is evaluated for the reader.
- **A `match_level: "state"` market row is a state-wide figure,** not a local one. Say so. Rows are never taken from another district. There is data for only 2 districts.
- **Every sentence has a code beside it** (`reason_code`, `observation_codes`, `recommendation_codes`, `message_code` and so on). The English is a fallback. The frontend translates by code, from the dictionaries in `frontend/src/i18n/`. `eligibility_codes` is index-aligned with `eligibility_rules`, and `document_codes` with `documents`.
- **Nothing in the response is advice a lender has agreed to.** The household check follows our reading of the RBI microfinance direction (2022). It is not a lending decision.

## Errors

| Status | When | Body |
|---|---|---|
| 422 | a field is missing, out of range, too long or the wrong type; the JSON is malformed; the body is empty; `consent` is missing when required | `{"detail": [{"type", "loc", "msg"}, …]}` |
| 404 | a route not mounted in this mode | `{"detail": "Not Found"}` |
| 500 | a bug on our side | `{"detail": "Internal Server Error"}` |

A 422 lists every failing field. The rejected value is never echoed: `input` and `ctx` are stripped on purpose. `loc` is the path to the field, and its last element names it. The frontend reads that element to say which question to fix. For example, `"state": "U"` with `"available_capital": -1` gives:

```json
{"detail": [
  {"type": "string_too_short", "loc": ["body", "state"], "msg": "String should have at least 2 characters"},
  {"type": "greater_than_equal", "loc": ["body", "available_capital"], "msg": "Input should be greater than or equal to 0"}
]}
```

## The optional AI helper: `/api/intake/*`

Two more routes exist only when the backend runs with `ARTHNITI_AI_ENABLED=true` and `MODEL_API_KEY` set. They are mounted in production too. The frontend calls them from `/talk`, which exists only in a build made with `VITE_AI_HELPER=true`. They are not part of the contract above. They fill in the form, they compute nothing, and `POST /api/analysis/run` behaves the same with or without them. What they send to Meta, what they log and what to do before switching them on is `docs/PROCESSOR_SCHEDULE.md` §10.

| Route | Takes | Returns |
|---|---|---|
| `POST /api/intake/transcribe?language=<code>` | The raw bytes of a WAV as the body: mono, 16-bit, 16 or 24 kHz, at most 3,000,000 bytes. The frontend sends `Content-Type: audio/wav`; the server does not check it. `language` is required and is one of `en`, `hi`, `ta`, `te`, `kn`, `mr`, `bn`. There is no `ml`, because the speech model has no Malayalam | `{"transcript": "…"}` |
| `POST /api/intake/extract` | `{"text": "…", "language": "<code>"}`. `text` is 1 to 2,000 characters. `language` is one of the eight interface codes, `ml` included | `{"answers": [{"field", "value", "evidence"}, …], "ignored": <int>}` |

`answers` holds only what passed the server's checks (`docs/PROCESSOR_SCHEDULE.md` §10.1); `ignored` counts the rest. `field` is a form field: `business_category`, `state`, `district` or `location_type` (each with a string `value`), or one of the money fields (`value` is a whole number of rupees). `evidence` is the stretch of the person's own words the answer rests on. One measured example, with a stand-in model that returned four answers, two of which quoted words the person never said:

```json
{"answers": [
  {"field": "business_category", "value": "tailoring", "evidence": "I make clothes"},
  {"field": "initial_investment", "value": 50000, "evidence": "50 thousand"}
], "ignored": 2}
```

**A spoken amount ("50 thousand", "1.5 lakh") is converted by the model, and no code checks the conversion.** The frontend shows `evidence` beside the amount so the person can.

| Status | When | Body |
|---|---|---|
| 422 | `language` missing or not one of the codes; `text` empty or over 2,000 characters; the recording is not a mono 16-bit WAV at 16 or 24 kHz | `{"detail": [{"type", "loc", "msg"}, …]}`, as above |
| 413 | the recording is over 3,000,000 bytes | `{"detail": "The recording is too large."}` |
| 429 | the hourly limit is used up, or Meta says it is busy | `{"detail": "The helper is busy. Try again later."}` and a `Retry-After` header in seconds (30 when Meta gave no wait). CORS does not expose it to browser code |
| 502 | Meta rejected the request, or its reply was not the shape asked for | `{"detail": "The helper could not make sense of that."}` |
| 503 | the key is wrong or missing, there is no balance, Meta is down, or the spend cap is reached | `{"detail": "The helper is not available right now."}` |
| 404 | the helper is off | `{"detail": "Not Found"}` |

The body does not say which of the 503 causes it was. The stderr line names the kind (`docs/PROCESSOR_SCHEDULE.md` §10.4). `frontend/src/services/api.js` turns 404 and 503 into `talk.errUnavailable`, 429 into `talk.errBusy`, 502 into `talk.errUnclear`, 413 and 422 on the recording into `talk.errRecording`, and anything else into `talk.errGeneric`.

## Headers and CORS

- Every response carries `X-Request-ID`, the same id as the request's processing log line. CORS does not expose it, so browser code on another origin cannot read it. A server-side caller can.
- **CORS:**
  - production allows only the exact origins in `ARTHNITI_CORS_ORIGINS`, https only;
  - development allows `http://localhost` and `http://127.0.0.1` on any port;
  - both allow methods `GET, POST`, the header `Content-Type`, no credentials, and a preflight cache of 600 s.

  The schedule, §6, has the details.
- The frontend gives up after 20 seconds (60 seconds for the two intake routes).

## Running the backend

From `./backend`, with the repo's virtual environment:

```bash
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

That starts development mode. The production flags and variables are in §3 of the schedule.

# API contract: `POST /api/analysis/run`

This is the one endpoint the अर्थNiti frontend calls. This page covers what it takes, what it returns, and how it fails. Everything here was measured against the running backend on 27 Sept 2026. With the optional AI helper switched on, the frontend also calls two intake routes and one plan route; they are covered in their own sections near the end, measured on 27 Oct 2026.

`docs/PROCESSOR_SCHEDULE.md` covers what the deployment sends, logs and keeps, and how to configure it. This page does not repeat that.

## Where it runs

| Mode | Set by | Base URL | What is mounted |
|---|---|---|---|
| development | `ARTHNITI_ENV` unset or `development` | `http://127.0.0.1:8000` | all 8 routers (10 with the AI helper on); Swagger at `/docs`, plus `/redoc` and `/openapi.json` |
| production | `ARTHNITI_ENV=production` | the deployer's own https origin | `GET /health` and `POST /api/analysis/run` only, plus the two intake routes and the plan route when the AI helper is on. Everything else, the docs included, is a 404 |

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

A 200 carries these eight top-level keys:

| Section | Keys |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` |
| `risk_analysis` (19) | `pressure_ratio_percent`, `risk_level`, `risk_level_without_new_loan`, `reason`, `reason_code`, `monthly_emi`, `estimated_new_emi`, `total_monthly_emi`, `assumed_interest_rate_percent`, `assumed_tenure_months`, `household_monthly_income`, `household_repayment_percent`, `household_check`, `household_check_without_new_loan`, `household_limit_percent`, `household_microfinance_income_limit`, `household_in_microfinance_range`, `household_reason`, `household_reason_code` |
| `financing_options` (6) | `status`, `funding_gap`, `assumed_interest_rate_percent`, `household_checked`, `options[]`, `recommended_by_rules`. Every entry of `options` has `code, tenure_months, loan_amount, remaining_gap, monthly_repayment, total_repayment, total_interest, pressure_ratio_percent, risk_level, household_repayment_percent, household_check` |
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
| `financing_options.status` | `covered` / `partial` / `no_gap` / `no_surplus` / `household_over_limit` / `no_room` |
| `financing_options.options[].code` | `term_12` / `term_24` / `term_36` / `term_60` |
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
- **`financing_options` answers "how much of the gap can be borrowed, over how long, and stay in the low band".**
  - Each option is the largest loan, in whole thousands of rupees or the whole gap, whose total repayment is `low` and inside the household cap, for 12, 24, 36 or 60 months at the same assumed rate as `estimated_new_emi`. It is priced by the same function as `risk_analysis`, so the 60-month option is the loan `risk_analysis` already prices whenever the gap fits.
  - `options` is empty unless `status` is `covered` (some option has `remaining_gap` 0) or `partial` (none does). The other four statuses say why no loan is offered. A tenure that allows no loan at all is left out of `options`.
  - `recommended_by_rules` is the `code` of the shortest option with `remaining_gap` 0, which costs the least interest, and `null` otherwise.
  - `household_repayment_percent` is `null` when no income was given (`household_checked` false) or the income is 0. `pressure_ratio_percent` is never `null` here, because a surplus of 0 or less gives `no_surplus` and no options.
  - "Safe" is this app's own line (under 30% of the surplus) plus our reading of the RBI household cap. It is not a lending decision and not a quote.
- **`match_score` checks no eligibility rule.** Don't show it as a percentage or a likelihood. Show `fit_basis` instead:
  - `state`: "made for your state";
  - `region`: "for a few states, including yours";
  - `national`: "for all of India".

  No rule in `eligibility_rules` is evaluated for the reader.
- **A `match_level: "state"` market row is a state-wide figure,** not a local one. Say so. Rows are never taken from another district. There is data for 13 districts.
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

## The optional AI plan: `POST /api/advisor/plan`

One more route, mounted under the same two conditions as the intake routes (`ARTHNITI_AI_ENABLED=true` and `MODEL_API_KEY` set; production too). The frontend calls it from `/advisory`, in a build made with `VITE_AI_HELPER=true`, when the reader ticks the plan card's box and presses its button. It is not part of the contract above, and `POST /api/analysis/run` behaves the same with or without it. The route runs the analysis again on the answers it is sent, by the same rules. A Meta model then words a plan around blanks, and the rules fill the blanks with their own figures. The model is shown no figure, name or place; `docs/PROCESSOR_SCHEDULE.md` §10.1 says what it is shown and §10.4 what is logged.

Request, `Content-Type: application/json`:

```json
{"answers": {…}, "language": "hi", "send_to_meta": true}
```

- `answers` takes the same fields, limits and checks as the body of `POST /api/analysis/run`. A `consent` object, and the fields that route ignores, are accepted and dropped. This route keeps no consent record.
- `language` is one of the eight interface codes. The plan is written in it.
- `send_to_meta` must be a real `true`. A missing key, `false`, `1` and `"true"` all get a 422 and nothing is sent to Meta. It is the reader's own tick.

Response, measured on 27 Oct 2026 against a stand-in model. The wording is the stand-in's; every `fill` is a figure the rules worked out for the answers sent:

```json
{"language": "en",
 "summary": [{"t": "text", "v": "Your business earns "}, {"t": "fill", "v": "₹15,000"},
             {"t": "text", "v": " each month after costs, but you still need "}, {"t": "fill", "v": "₹70,000"},
             {"t": "text", "v": " to start it."}],
 "steps": [[{"t": "text", "v": "Think about a loan of "}, {"t": "fill", "v": "₹70,000"},
            {"t": "text", "v": " over "}, {"t": "fill", "v": "24"},
            {"t": "text", "v": " months, with a monthly repayment of "}, {"t": "fill", "v": "₹3,295"},
            {"t": "text", "v": "."}], …],
 "cautions": [[{"t": "text", "v": "These figures are estimates, so check them with a lender before you decide."}]],
 "attempts": 1}
```

| Key | Holds |
|---|---|
| `language` | the code asked for |
| `summary` | one list of segments |
| `steps` | 3 to 5 lists of segments |
| `cautions` | 1 to 3 lists of segments |
| `attempts` | 1, or 2 when the first reply failed the checks and the second passed |

A segment is `{"t": "text" | "fill", "v": "<string>"}`. `text` is the model's wording. `fill` is a figure or a name the rules put in: the model never wrote it and could not change it, and the frontend prints it in bold. A plan with a digit of the model's own, a link, a placeholder that is unknown or missing, the wrong script for the language, or the wrong number of steps or cautions is refused (`plan_service.verify_plan`). The route asks once more with the reasons, and two refusals end in a 502. **Nothing checks that a plan is wise.** The checks prove that every figure in it is the rules' own, and no more. In a plan that is not in English, a scheme's bold name is the English name from `schemes.json`.

The server keeps no plan. The frontend stores the last one beside the result it was written for (`docs/PROCESSOR_SCHEDULE.md` §10.3) and drops it when the answers change. The real model took 10.6 s (English) and 11.9 s (Hindi) for one plan on 27 Oct 2026 (§10.7).

| Status | When | Body |
|---|---|---|
| 422 | `send_to_meta` missing or not a real `true`; `language` not one of the codes; `answers` fails the analysis route's checks (the `loc` starts `["body", "answers", …]`); the body is not a JSON object | `{"detail": [{"type", "loc", "msg"}, …]}`, as above |
| 429 | the hourly limit is used up, or Meta says it is busy. The plan and the two intake routes share one count, and each try is counted, so a retry uses a second call | `{"detail": "The helper is busy. Try again later."}` and a `Retry-After` header in seconds (30 when Meta gave no wait). CORS does not expose it to browser code |
| 502 | the plan failed the checks twice, or the reply was not the shape asked for twice | `{"detail": "A plan could not be written. The advice above still applies."}` |
| 502 | Meta rejected the request | `{"detail": "The helper could not make sense of that."}` |
| 503 | the key is wrong or missing, there is no balance, Meta is down, or the spend cap is reached | `{"detail": "The helper is not available right now."}` |
| 404 | the helper is off | `{"detail": "Not Found"}` |

A refused reply is logged as the codes of the checks it failed and nothing else; no body, log line or stderr line holds the model's words or the reader's answers (`test_advisor_log_privacy.py`). `frontend/src/services/api.js` turns 404, 503, no connection and the 330-second timeout into `plan.errUnavailable`, 429 into `plan.errBusy`, 502 into `plan.errNoPlan`, and anything else, a 422 and a reply that is not a plan included, into `plan.errGeneric`. The advice above the card is the rules' and stays on the page whatever happens here.

## Headers and CORS

- Every response carries `X-Request-ID`, the same id as the request's processing log line. CORS does not expose it, so browser code on another origin cannot read it. A server-side caller can.
- **CORS:**
  - production allows only the exact origins in `ARTHNITI_CORS_ORIGINS`, https only;
  - development allows `http://localhost` and `http://127.0.0.1` on any port;
  - both allow methods `GET, POST`, the header `Content-Type`, no credentials, and a preflight cache of 600 s.

  The schedule, §6, has the details.
- The frontend gives up after 20 seconds (60 seconds for the two intake routes, 330 for the plan: two tries of up to 150 seconds each, with a margin).

## Running the backend

From `./backend`, with the repo's virtual environment:

```bash
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

That starts development mode. The production flags and variables are in §3 of the schedule.

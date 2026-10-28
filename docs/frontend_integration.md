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
| `business_category` | string | yes | | 2–100 characters. The UI sends one of `retail`, `food processing`, `handicrafts`, `tailoring`, `agriculture`, `dairy`, `poultry`, `services` or `manufacturing`, or the reader's own words for "Other". It is matched against scheme categories by substring, so keep the values in English |
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

A 200 carries these ten top-level keys:

| Section | Keys |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` |
| `risk_analysis` (19) | `pressure_ratio_percent`, `risk_level`, `risk_level_without_new_loan`, `reason`, `reason_code`, `monthly_emi`, `estimated_new_emi`, `total_monthly_emi`, `assumed_interest_rate_percent`, `assumed_tenure_months`, `household_monthly_income`, `household_repayment_percent`, `household_check`, `household_check_without_new_loan`, `household_limit_percent`, `household_microfinance_income_limit`, `household_in_microfinance_range`, `household_reason`, `household_reason_code` |
| `financing_options` (6) | `status`, `funding_gap`, `assumed_interest_rate_percent`, `household_checked`, `options[]`, `recommended_by_rules`. Every entry of `options` has `code, tenure_months, loan_amount, remaining_gap, monthly_repayment, total_repayment, total_interest, dscr, pressure_ratio_percent, risk_level, household_repayment_percent, household_check, schedule` |
| `business_analysis` | `business_type`, `initial_investment`, `expected_monthly_revenue`, `monthly_operating_expenses`, `monthly_operating_surplus`, `operating_margin_percent`, `annual_operating_surplus`, `estimated_roi_percent`, `feasibility_status`, `observations[]`, `observation_codes[]` |
| `market_context` | a list, often empty. Every row has `state, district, business_category, scope, metric, source, source_code, last_verified, provenance{20 keys}, match_level`. A `wholesale_price_per_kg` row adds `commodity, commodity_id, unit, indicative_price, price_low, price_high, n_days, n_markets, last_reported`, and sometimes `stale`. A `registered_units` row adds `count, count_suppressed, share_percent, district_total, nic_classes`, and sometimes `note_code`/`note`. An `egg_price` row (poultry, from NECC) has `provenance{14 keys}` and no commodity: it adds `price_kind, centre, unit, indicative_price, last_reported, stale` |
| `scheme_matches` | a list. Every entry has `name, level, scheme_id, description, support_type, match_score, fit_basis, match_reasons[], match_reason_codes[], eligibility_rules[], documents[], description_code, support_type_code, eligibility_codes[], document_codes[], last_verified` |
| `scheme_funding` (5) | `status`, `project_cost`, `money_in_hand`, `funding_gap`, `schemes[]`. `schemes` has one entry for each of PMEGP, PMFME and Mudra that the matcher found, in its order, and no other scheme is priced. A `kind: "subsidy"` entry (PMEGP, PMFME) has `scheme_id, kind, terms, limit_kind, limit, limit_applied, cases[]`, and PMEGP adds `area, area_assumed`. Every case has `code, own_percent, own_amount, own_short_by, subsidy_percent, subsidy_amount, bank_amount, net_loan_amount`. A `kind: "loan_band"` entry (Mudra) has `scheme_id, kind, terms, loan_amount, band, band_limit` |
| `compliance` (2) | `yearly_sales`, `steps[]`. `yearly_sales` is the expected monthly income times 12, and every limit below is tested against it. `steps` is always four entries in this order: `udyam`, `local`, `fssai`, `gst`. Every step has `id`, `need` and `source`. `udyam` adds `schemes_requiring`; `local` adds `place`; `fssai` adds `kind`, `sales_limit`, `food_per_day`, `milk_per_day`, `dairy_exemption`; `gst` adds `state`, `supply`, `goods_limit`, `services_limit`, `limit`, `farm`, `case` |
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
| `scheme_funding.status` | `ok` / `no_scheme` / `no_project_cost` |
| `scheme_funding.schemes[].kind` | `subsidy` / `loan_band` |
| `scheme_funding.schemes[].terms` | `kvic_2022` / `mofpi_2021` / `dfs_2026` |
| `scheme_funding.schemes[].area` | `rural` / `urban` |
| `scheme_funding.schemes[].limit_kind` | `cost` / `subsidy` |
| `scheme_funding.schemes[].cases[].code` | `general` / `special` / `all` |
| `scheme_funding.schemes[].band` | `none` / `shishu` / `kishore` / `tarun` / `tarun_plus` / `above_limit` |
| `compliance.steps[].id` | `udyam` / `local` / `fssai` / `gst` |
| `compliance.steps[].need` | `free` (udyam) / `ask` (local) / `usually` / `depends` / `not_needed` (fssai, gst) |
| `compliance.steps[].source` | `udyam_2026` / `fssai_2017` / `cbic_2019`, and `null` for `local` |
| `compliance.steps[].place` (local) | `panchayat` / `urban_body` |
| `compliance.steps[].kind` (fssai) | `registration` / `licence`, and `null` when `need` is `not_needed` |
| `compliance.steps[].supply` (gst) | `goods` / `services` / `mixed` |
| `compliance.steps[].case` (gst) | `within` / `above` / `between` / `farm_above` |
| `feasibility_status` | `feasible` / `break_even` / `not_feasible` |
| `mvp_summary.status` | `good` / `attention_needed` / `review` |
| `level` (scheme) | `central` / `state` / `regional` / `district` / `sub_district` / `block` / `local_body` |
| `fit_basis` (scheme) | `state` / `region` / `national` |
| `metric` (market) | `wholesale_price_per_kg` / `registered_units` / `egg_price` |
| `price_kind` (egg price) | `suggested` / `prevailing` |
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
  - `schedule` is that loan paid off month by month at the assumed rate: rows of `month, opening_balance, payment, interest, principal, closing_balance`. It is counted in whole paise, so the `payment` column adds up to `total_repayment` and the `interest` column to `total_interest` exactly, and the last `closing_balance` is 0. Every `payment` is `monthly_repayment` (a whole rupee) except the last, which also clears the few rupees that rounding the instalment leaves, so `total_repayment` is **not** `monthly_repayment × tenure_months`. For a gap too small to repay in whole rupees, `schedule` is `[]` and both totals are 0. A result stored before this field existed has no `schedule` and no `dscr`, so the client must tolerate their absence.
  - `dscr` is the money left each month (`financial_analysis.monthly_profit`) divided by every loan payment a month (`risk_analysis.total_monthly_emi` for that option): the pressure ratio read the other way up, so it says nothing the pressure figure does not. `null` when no loan payment is made. No lender threshold is attached to it, because a lender may count it differently.
  - `household_repayment_percent` is `null` when no income was given (`household_checked` false) or the income is 0. `pressure_ratio_percent` is never `null` here, because a surplus of 0 or less gives `no_surplus` and no options.
  - "Safe" is this app's own line (under 30% of the surplus) plus our reading of the RBI household cap. It is not a lending decision and not a quote.
- **`scheme_funding` is arithmetic on the terms three schemes have published. It does not check that the reader qualifies, and it is not an offer.**
  - It is priced on `initial_investment` (`project_cost`, the money needed to start) and `available_capital` (`money_in_hand`), so `funding_gap` is the figure `financial_analysis` already shows. `status` is `no_project_cost` when the investment is 0, `no_scheme` when none of the three was matched (`schemes` is `[]` in both), else `ok`.
  - In a `subsidy` case, `own_amount` is `own_percent` of the whole project cost, `bank_amount` is the cost less that, `subsidy_amount` is the government money, and `net_loan_amount` is `bank_amount` less `subsidy_amount`, the part left to repay. `own_short_by` is how far `available_capital` falls short of `own_amount` (0 when it covers it).
  - PMEGP is priced twice, as a `general` and a `special` case, because the app never asks for a social category and the reader reads their own. The subsidy is worked on at most `limit` of the cost (Rs.20 lakh, the lower of the scheme's two ceilings, used for everyone), and `limit_applied` says the cost was over it. `area` is the rate table used. `area_assumed` is true when `location_type` was neither `rural` nor `urban`, and the urban rates, the lower ones, were used.
  - PMFME has one case, `all`, with the subsidy capped at `limit` (Rs.10 lakh a unit); `limit_applied` says it was.
  - Mudra has no subsidy and no stated own share. `loan_amount` is the funding gap, `band` is the loan size it falls in and `band_limit` that size's upper limit. `none` means there is no gap; `above_limit` means the gap is past the largest band, and `band_limit` is then that band's limit.
  - `terms` names the published document the percentages came from, and each has a caveat the client has to print. PMEGP's rules approve the scheme for 2021-22 to 2025-26, and nothing found says it continues after 31 March 2026. The PMFME page is about units that want to upgrade and does not say whether a new unit gets the money. The frontend reuses `elig.pmegp.period` and `elig.pmfme.upgrade` for these, from `terms`.
  - Amounts can carry paise: print a whole rupee bare and any other with two decimals.
  - The repayment of `net_loan_amount` is not checked against the reader's surplus, so it can be larger than the loans in `financing_options`. The page says these are estimates.
  - A result stored before this field existed has no `scheme_funding`, so the client must tolerate its absence. The frontend draws nothing then.
- **`compliance` lists the registrations to ask about, from three published sources, and decides nothing.** It never says a registration is required, and no fee or eligibility rule is evaluated.
  - `need` is `usually`, `depends` or `not_needed` for FSSAI and GST, `free` for Udyam (it costs nothing to register) and `ask` for the local office. Print the source beside each step and tell the reader to confirm with the office, because the limits change. `source` names the Udyam portal (read on 28 October 2026), the FSSAI Licensing and Registration Regulations 2011 as compiled by FSSAI on 9 November 2017, and the CBIC booklet "GST: An Update" of 1 June 2019.
  - **FSSAI:** `kind` is `registration` when `yearly_sales` is at most `sales_limit` (Rs.12 lakh) and `licence` above it. The regulation joins that limit and the daily quantities with "and/or", so the verdict is never firmer than `usually`; print `food_per_day` (kg or litres of food) and `milk_per_day` (litres of milk) beside it. `need` is `not_needed` for handicrafts and tailoring, `usually` when a whole word of the category is a food word, `depends` otherwise. `dairy_exemption` is true when the category holds the word dairy or milk: the regulation exempts a milk producer who is a registered member of a dairy cooperative society and sells all the milk to it.
  - **GST:** `goods_limit` and `services_limit` are the State's limits (Rs.40 lakh and Rs.20 lakh, or Rs.20 lakh and Rs.10 lakh in the States the booklet names). Registration is mandatory only if sales exceed the limit, so sales equal to it are `within`. `supply` is our own reading of the category. For `mixed` (tailoring, no match, or a match both ways) the booklet gives no rule: `within` is under the lower limit, `above` over the higher, and `between` anywhere in between, where `limit` is `null` and the card tells the reader to ask the GST office. `farm` is true for agriculture, dairy and poultry, and above the limit their case is `farm_above`, because the booklet says only that an agriculturist's own produce can be treated differently.
  - `udyam.schemes_requiring` counts the matched schemes whose `eligibility_codes` include `elig.common.udyamNeeded`.
  - Not stated, because no source was read for it: fees, goods sent between States, e-commerce, and whether farming alone can register on Udyam.
  - Amounts are whole rupees except `yearly_sales`, which can carry paise: print a whole rupee bare and any other with two decimals.
  - A result stored before this field existed has no `compliance`, so the client must tolerate its absence. The frontend draws nothing then.
- **`match_score` checks no eligibility rule.** Don't show it as a percentage or a likelihood. Show `fit_basis` instead:
  - `state`: "made for your state";
  - `region`: "for a few states, including yours";
  - `national`: "for all of India".

  No rule in `eligibility_rules` is evaluated for the reader.
- **A `match_level: "state"` market row is a state-wide figure,** not a local one. Say so. Rows are never taken from another district. There is data for 13 districts, and egg prices for 30 NECC centres (29 districts and Delhi as a whole).
- **An `egg_price` row is the price of one egg, in rupees.** NECC prints it as a whole number with no unit; `indicative_price` is our reading of it as paise (`provenance.published_value` is the number as printed and `provenance.unit_reading` says how it is read), and NECC has not confirmed that reading. `price_kind` says whose price it is: `suggested` is a price NECC suggests and `prevailing` is the going price it lists, and neither is a price the reader will always get. `centre` is NECC's own name for the centre (it can differ from the district). NECC allows its prices to be passed on only with its clarification, so print `provenance.clarification` (the same on every egg row) beside the prices, and do not draw an egg row that lacks it or whose `unit` is not `egg`. The frontend does both in `frontend/src/data/marketRows.js`.
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

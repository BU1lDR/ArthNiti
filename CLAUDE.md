# ArthNiti — SIH 2026 MVP

**Project statement:** "AI-Driven Hyper-Local Business Advisory and Financial Structuring Assistant for Rural Micro-Entrepreneurs."

**Milestone:** internal college round presentation, **11 September 2026**. This is demo-driven prototype work judged by a panel — not production software. Prefer changes that make the demo path work end to end and read clearly on a projector over refactors and infrastructure.

**Repo:** `https://github.com/BU1lDR/SIH_2026` (**private**).

> **Ask for explicit confirmation before any action that changes the GitHub repo** — push, PR, branch/tag creation or deletion, releases, settings. Local commits are fine when requested. Approval for one push does not carry to the next. The repo is shared with a 6-person team; a push lands in teammates' working copies.

---

## Read this before trusting the other docs

`OUR_MVP.md` is the team-facing companion to this file — product/team view, where this one is the code view. It was `OUR_PROJECT.md`, the team's aspirational blueprint, and was rewritten on 7 Sept 2026 to describe the MVP as built. **It is now accurate**, and it labels anything unbuilt `PLANNED` or `NOT BUILT`. Keep the two in sync: this file wins on code detail, `OUR_MVP.md` carries the demo script, the judge answers and the team split.

The blueprint it replaced claimed several things that never existed, and those claims still surface in teammates' notes and in older chat threads:

| The old blueprint claimed | Reality |
|---|---|
| `models/`, `calculations/`, `ai/` dirs | None exist. Layout is `api/routes`, `core`, `data`, `schemas`, `services`. |
| An AI/LLM layer (§"AI Layer", Day 5) | **No LLM anywhere.** No SDK, no API key, no env var, no HTTP client used for inference. See below. |
| `POST /api/chat` conversational assistant | Does not exist. |
| `GET /api/report/{id}` | Does not exist. `/report` is a client-side print view. |
| SQLite/Postgres, 6 entities | No database. Client-side `sessionStorage` only — see below. |
| Recharts / charts on the results pages | No Recharts, but there **are** charts as of 8 Sept — hand-rolled in `components/Charts.jsx`. |
| Hindi / regional-language output | Now true for the UI **and** for backend prose: 8 languages + a dialect phrase layer, and every generated sentence carries a translation code. See the translation-code section below. |

`docs/frontend_integration.md` is still stale in two specific ways: it says CORS allows only `localhost:3000` and `localhost:5173` (the real config is a loopback regex — see below), and it says the response has **five** top-level sections (it has **seven**).

`frontend/README.md` is unmodified Vite boilerplate. `docs/requirements.txt` is unrelated to `backend/requirements.txt`. `README.md` is team onboarding notes, not project documentation.

### The "AI" is currently 100% deterministic rules

Every number and every sentence the user sees is produced by hand-written Python `if`/`else` in `backend/app/services/`. There is no model call. This is defensible for the round — `OUR_MVP.md` §15 states the position and the LLM boundary for when a model *is* added, and §17 turns it into judge answers — but **do not describe the current build as using an LLM**, and if asked to "improve the AI", clarify whether the ask is to wire up a real model or to improve the rules.

---

## Running it

Two processes. Backend first.

```bash
# Backend — from repo root (venv is at ./.venv, Python 3.14.6)
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000   # run from ./backend

# Frontend — from ./frontend
npm run dev        # Vite dev server, default port 5173
npm run build      # production build into frontend/dist (gitignored)
npm run lint       # ESLint 10
```

Docs are auto-served at `http://127.0.0.1:8000/docs` (Swagger), `/redoc`, `/openapi.json`.

**Always clean up processes you start.** Leaked servers have broken this environment twice — a stray listener on 8000 causes `[Errno 10048] only one usage of each socket address`, and a stray Vite server causes confusing CORS/preflight failures against a backend that looks fine. In Git Bash:

```bash
netstat -ano | grep -E ':8000|:5173'
taskkill //F //T //PID <pid>          # note the doubled slashes under Git Bash
```

Note `uvicorn --host 127.0.0.1` binds IPv4 only; `vite dev` and `vite preview` may bind `[::1]` only. If a URL refuses while the server is clearly up, that mismatch is usually why — try `localhost` vs `127.0.0.1`, or pass `--host 127.0.0.1`.

There is also a zero-dependency browser driver that loads every route and checks the rendered text — see "Verifying in a real browser" below. Lint and build cannot catch a leaked i18n key or a `null%`, so run it after any UI change.

---

## Architecture

```
backend/app/
  main.py                 FastAPI app + CORS + 8 include_router calls
  api/routes/             8 routers (one file each)
  schemas/                Pydantic request/response models
  services/               all business logic — pure functions, no classes, no I/O
  core/data_loader.py     loads JSON from app/data (absolute path, cwd-independent)
  data/                   schemes.json (30 schemes, 7 tiers), market_data.json (9 rows)
  gen_schemes.py          the generator that produced schemes.json — provenance, not runtime
backend/tests/            25 files, 151 tests
frontend/src/
  App.jsx                 shell (utility bar/topbar/main/footer) + JourneyBar + LandingPage
                          + NotFoundPage + 10 routes + a `*` catch-all
  context/AppContext.jsx  the entire client state, persisted to sessionStorage
  i18n/                   languages.js (catalogue + dialects), LanguageContext.jsx (the
                          `t()` / `tBackend()` provider), backendText.js (code→string for
                          backend prose, + the scheme tier labels), and four dictionary
                          files that merge: strings.js, resultStrings.js,
                          backendStrings.js, schemeStrings.js
  data/indiaLocations.js  36 states/UTs × 768 districts, for the cascading dropdown
  pages/                  9 page components
  components/Button.jsx   the shared button — variant + size + optional `to`
  components/Charts.jsx   BarRow / BarGroup / UnitChart, hand-rolled on CSS
  services/api.js         the only network call in the app
  index.css               design tokens + the .ui-* design system + @media print
```

**The backend exposes 8 routers, but the frontend calls exactly one endpoint.** Everything funnels through `POST /api/analysis/run`.

| Endpoint | Used by frontend |
|---|---|
| `POST /api/analysis/run` | **yes — the only one** |
| `GET /health` | no |
| `POST /api/entrepreneur/profile` | no |
| `POST /api/business/analyze` | no |
| `POST /api/financial/analyze` | no |
| `POST /api/schemes/match` | no |
| `POST /api/advisory/recommend` | no |
| `POST /api/market/context` | no |

The unused routers are thin wrappers over the same services and are covered by tests. Don't delete them, but don't assume a change there affects the UI.

CORS ([main.py:24-30](backend/app/main.py#L24-L30)) uses `allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?"` so any loopback port works. Replace with an explicit list before any real deployment.

### Frontend routes

`/` landing → optional `/login` (name, phone, address, email — no password, nothing authenticated, it carries the name into step 1) → 4-step journey `/profile` → `/business` → `/location` → `/finance` → then 4 result pages `/analysis`, `/schemes`, `/advisory`, `/report`, plus a `*` catch-all rendering `NotFoundPage`. The single API call fires on the `/finance` submit ([FinancePage.jsx](frontend/src/pages/FinancePage.jsx)).

Nothing guards the journey order: the topbar nav links straight to any step, so `/finance` can be submitted with an empty `business_category` and `state`. That returns 422, which `api.js` now renders as a readable sentence rather than `[object Object]`.

### Chrome and design direction

The look is **deliberately modelled on Indian e-governance portals** — the ask was "somewhat like government apps", for the reason that a rural user has met that visual language before on a real service and knows how to read it. `AppShell` stacks: skip link → utility bar (prototype notice + language, text size, contrast, theme, start-over) → masthead (`अ` mark, name, tagline, login) → tricolour rule → horizontal nav bar → breadcrumb → journey progress → page → multi-column government-style footer.

**The prototype notice in the utility bar is not optional and must not be removed.** It appears on every page precisely *because* the visual language borrows government cues: a viewer must never be able to conclude this is an official service. If you restyle the chrome, the notice stays. It was `display: none` below 800px until 7 Sept 2026 — see "Phones" for why that was the worst place to have dropped it, and don't hide it there again to reclaim vertical space.

"Government-like" here means the structural conventions — a masthead, a tricolour band, a persistent utility bar, breadcrumbs, plain bordered cards, a dense footer. It does **not** mean 2000s-era visual quality, and the brief was explicit that the UI should be understandable by low-literacy users *without being basic*. Accessibility affordances (text scale, high contrast, skip link, dialect phrasing) are part of the government-service register, not additions to it.

### Client state — sessionStorage, versioned

`AppContext` ([AppContext.jsx](frontend/src/context/AppContext.jsx)) holds every answer and the API result, and mirrors the whole thing into **`sessionStorage['sih-application']`** as `{v: STORAGE_VERSION, data}` on every change. `profile` holds `name`/`language`/`dialect`/`literacyLevel`; **state and district live only on `location`** — they used to be duplicated on `profile` and asked for twice. `location.marketType` is an **array** (multi-select), not a string.

Four things about this are load-bearing:

- **`sessionStorage`, not `localStorage`, and that is deliberate.** Someone's revenue, debt and EMI must not sit on a shared demo laptop after they walk away, and a closed tab being a clean slate is what we want between two judges. Within one tab it survives a refresh, which was the whole point — a refresh used to wipe the demo and drop every result page to its empty state.
- **`STORAGE_VERSION` must be bumped whenever the `EMPTY` shape changes.** A payload with a mismatched `v` is discarded rather than half-restored.
- **`hydrate()` merges section-by-section over `EMPTY`, never trusting the stored object wholesale.** A field added after a payload was written would otherwise arrive `undefined`, and React silently converts a controlled input with an `undefined` value into an uncontrolled one — the field stops updating and nothing in the console says why.
- **`resetApplication()` is the only way back to a blank form** without closing the tab. `StartOverButton` in the utility bar calls it, and renders only once there is something to lose.

Language and dialect are separate, in `localStorage` (`sih-language`, `sih-dialect`) — a UI preference is not personal financial data, and it *should* outlive the tab. Theme (`sih-theme`), text size (`sih-textsize`) and contrast (`sih-contrast`) are there for the same reason.

Result pages still cannot be *deep-linked* from a cold tab — there is no URL state — but a refresh no longer loses anything.

### Language, dialect and location data

**8 languages**, each with its endonym and a sample line so a reader who cannot read English can still find their own script: `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn` ([languages.js](frontend/src/i18n/languages.js)). **`DEFAULT_LANGUAGE` is `hi`** — the target user is a rural micro-entrepreneur, so Hindi is the default and English is the fallback, not the reverse.

Strings live in **four** files, split purely by size and by who wrote the sentence. Each exports one dict per language code, and `merge()` in `strings.js` spreads them in this order — so a key defined in two files means the later file silently wins and the earlier text is dead code:

| File | Keys × 8 | Holds |
|---|---|---|
| [strings.js](frontend/src/i18n/strings.js) | 159 | chrome, landing, the four data-entry steps — and the `merge()` that assembles the other three |
| [resultStrings.js](frontend/src/i18n/resultStrings.js) | 207 | the four result pages, `/login`, `/404`, and the enum→label maps' targets (`st.*`, `risk.*`, `lvl.*`, `lvlnote.*`) |
| [backendStrings.js](frontend/src/i18n/backendStrings.js) | 30 | sentences a **Python service composes** (`adv.*`, `obs.*`, `rsn.*`, `sum.*`, `nxt.*`, `why.*`, `seas.*`, `src.*`) |
| [schemeStrings.js](frontend/src/i18n/schemeStrings.js) | 188 | prose **typed into schemes.json** (`sdata.*`, `elig.*`, `doc.*`, `scat.*`) |

**584 distinct keys, 4,672 strings.** The split rule is one line: *if a Python function builds the sentence it belongs in `backendStrings.js`; if the sentence is typed into `schemes.json` it belongs in `schemeStrings.js`.*

**All 8 dicts are at full parity in all four files — verified by script, not by self-report.** `node screenshots/parity4.mjs` from the repo root checks five things nothing else can see, in order of how badly each bites: every language carries every `en` key per file; no duplicate key inside one dict; **no key defined in two different files**; no non-English value byte-identical to English (the per-key fallback never fires, so the reader just sees English and nothing reports it); and placeholder sets matching English. It is zero-dependency and exits 1 on failure. Run it after touching any dictionary.

Two figures in this file used to read "344 keys" and "186 keys". They were stale by a wide margin in both directions; the table above is measured.

**The English fallback is per key, not per language.** `lookup()` tries the dialect override, then the chosen language, then `en`, then returns the key itself ([LanguageContext.jsx:16-28](frontend/src/i18n/LanguageContext.jsx#L16-L28)). Two consequences worth knowing:

- You can add an English key and use it immediately; the other 7 languages show English for that one string and stay correct everywhere else.
- A **typo'd or missing key renders as the literal dotted name** (`money.left`) on the page. Lint and build cannot catch this — nothing imports the key names. `screenshots/verify/drive.mjs` greps rendered text for the known key prefixes precisely because this is the one failure class only a browser can see.

`t(key, values)` fills `{name}` placeholders by plain string replacement. **No plural rules and no number formatting** — Indic plurals and grammatical case are real problems, so the strings are written to avoid needing them. Corollary: **never compose a sentence from parts in JSX.** `t('label') + ' ' + value + '.'` puts English word order and a Latin full stop into a Devanagari sentence (which ends in `।`). Give the whole phrase its own key with a placeholder. This is also why `mk.demandHigh` / `mk.demandMedium` / `mk.demandLow` are three keys rather than one `'{level} demand'` template — that template produced the literal "Medium मांग".

**Dialects cascade from the language** and are a *curated phrase layer*, not a translation: `DIALECT_PHRASES` overrides a handful of the highest-visibility strings (the greeting, the CTA, the words for money) for 9 of the 30 listed varieties. Anything not overridden falls through to the language, so a dialect with no entries is still a fully usable UI. `setLanguage` **clears the dialect**, the same way changing state clears the district. Don't overclaim this in the demo — say "dialect-aware phrasing", not "translated into Bhojpuri".

The selection reaches the backend through the fields the contract already carried: `apiLanguage` → `user_language`, `apiDialect` → `preferred_dialect`. **The backend still does nothing with them** — it echoes them back in `mvp_summary`. All result-page *prose* is backend-generated English.

**What is and is not translated on a result page.** This section used to say backend prose was never wrapped in `t()` and always printed in English. **That gap is closed** — read the rest of this section before assuming otherwise, because the mechanism has a rule that is easy to break.

Our own labels go through `t()`. Backend prose goes through **`tBackend()`**, and the two have *opposite* fallback contracts:

- `t(key)` → dialect override, then language, then `en`, then **the key itself**. A typo renders as the literal dotted name on the page. That visibility is the point.
- `tBackend(code, english)` → the translation for `code`, else **the English sentence the backend already sent**. It must *never* print a dotted code — there is always real prose to fall back to, so a scheme added without codes still renders, just untranslated.

Every service that composes a sentence now emits a code beside it: `advisory.recommendation_codes`, `business_analysis.observation_codes`, `risk_analysis.reason_code`, `mvp_summary.message_code`/`next_step_code`, market `seasonality_code`/`source_code`, and per scheme `description_code`, `support_type_code`, `match_reason_codes[]`, `eligibility_codes[]`, `document_codes[]`. [backendText.js](frontend/src/i18n/backendText.js) is the single place that resolves them — `useBackendText()` returns `advice`, `observations`, `riskReason`, `summaryMessage`, `nextStep`, `seasonality`, `marketSource`, `schemeDescription`, `schemeSupport`, `schemeReasons`, `schemeEligibility`, `schemeDocuments`, `schemeLevel`, `schemeLevelNote`. It is shared rather than duplicated per page precisely because a copy that drifts shows a user English on one page and their own language on the next.

**The lockstep rule.** `eligibility_codes` / `eligibility_rules` and `document_codes` / `documents` are **index-aligned arrays**. Insert an English rule without inserting its code at the same index and every later rule silently gets the wrong translation — which reads perfectly fluently and is completely wrong. `test_every_scheme_carries_complete_translation_codes` enforces the alignment; do not weaken it.

**Two things are still English by construction.** `match_reason_codes[]` carries a `categories` list rather than a finished sentence, because the reason names the *scheme's own* wording for a kind of work — the frontend translates each word through `CATEGORY_KEYS` in `backendText.js` and rejoins, so a sentence is never assembled from a translated template plus untranslated English fragments. And backend **enums** stay English internally because they are load-bearing: `financial_status`, `risk_level`, `feasibility_status`, `match_level`, and the scheme `level`. They become plain language only at render, via the `STATUS_KEYS` / `RISK_KEYS` / `CHOICE_KEYS` maps each result page carries and the `LEVEL_KEYS` map in `backendText.js`. An unrecognised enum value still prints, title-cased, rather than vanishing. That is also why the tier keys are camelCase (`lvl.subDistrict`, not `lvl.sub_district`) — a mistyped key would otherwise leak an underscore into the page.

**Digits stay Latin** and money stays `'en-IN'`-grouped even in Tamil or Telugu — that is what is printed on Indian currency and on government forms.

**`data/indiaLocations.js` drives the cascading dropdown**: 36 states/UTs, 768 districts, `districtsForState(name)` returning `[]` for an unknown state so the caller can render a disabled empty select with no special-casing. The district select is `disabled` until a state is chosen, and **`handleStateChange` clears `district`** — otherwise "Lucknow" would survive a switch to Kerala and be sent to the backend, which would then look up a district that cannot exist there. District names are indicative and in the Latin script that appears on official documents; boundaries change, so re-check before any real deployment.

**Category and market-type values sent to the backend must stay English.** `CATEGORY_SYNONYMS` in `scheme_service.py` keys off the exact strings `retail`, `food processing`, `handicrafts`, `tailoring`, `agriculture`, `dairy`, `services`, `manufacturing`, `other`. Only the *label* is translated — the tuple in `BusinessPage.jsx` is `[value, icon, labelKey]` for exactly this reason. Same for `locationTypes` and `marketTypes` on `/location`.

---

## The data contract

Request — `UnifiedAnalysisRequest` ([schemas/analysis.py:4-34](backend/app/schemas/analysis.py#L4-L34)). Required: `business_category` (min 2 chars), `state` (min 2), and `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `monthly_emi`, `initial_investment`, `monthly_operating_expenses` (all `>= 0`). Optional with defaults: `employees` 0, `existing_debt` 0, `district`/`village`/`market_type`/`customers` `""`, `user_language` "Hindi", `preferred_dialect` `None`, `literacy_level` "low", `entrepreneur_type` `None`, `location_type` "rural". Validation failures return **422**.

`entrepreneur_type` is still accepted by the schema and still echoed in `mvp_summary`, but **no page collects it and the frontend no longer sends it** — it is always `None`. Don't wire a UI field to it without deciding what should consume it.

**A 422 body's `detail` is a list of objects, not a string.** `readErrorMessage` in [api.js](frontend/src/services/api.js) turns it into one plain-language sentence using a `FIELD_LABELS` map. Passing `detail` straight to `Error()` renders as the literal string `[object Object]` — that was a live bug.

Response — **7** top-level keys ([analysis_service.py:106-114](backend/app/services/analysis_service.py#L106-L114)). These are the exact and complete key sets:

| Section | Keys |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` — the last four were added 7 Sept 2026 to fix defect 4 |
| `risk_analysis` | `pressure_ratio_percent`, `risk_level`, `reason` |
| `business_analysis` | `business_type`, `initial_investment`, `expected_monthly_revenue`, `monthly_operating_expenses`, `monthly_operating_surplus`, `operating_margin_percent`, `annual_operating_surplus`, `estimated_roi_percent`, `feasibility_status`, `observations[]` |
| `market_context` | list of `{state, district, business_category, indicative_price, demand_indicator, seasonality, source, last_verified, match_level, local_context:{village, market_type, customers}}` |
| `scheme_matches` | list of `{name, description, support_type, match_score, match_reasons[], eligibility_rules[], documents[], official_url, last_verified}` |
| `advisory` | `recommendations[]` — only this one key |
| `mvp_summary` | `status`, `simple_message`, `next_step`, `priority`, `language`, `preferred_dialect`, `literacy_level`, `entrepreneur_type`, `location_type` |

Enumerated values: `financial_status` ∈ `profitable` / `break_even` / `loss`. `risk_level` ∈ `low` / `moderate` / `high`. `feasibility_status` ∈ `feasible` / `break_even` / `not_feasible`. `mvp_summary.status` ∈ `good` / `attention_needed` / `review`. `market_context[].match_level` ∈ `district` / `state`.

`match_level` is not decoration — it is the honesty marker on the hyperlocal claim. `district` means the row is the entrepreneur's own district; `state` means we had no row for their district and fell back to the same state. Both `/analysis` and `/report` print a different sentence for each. Never render a `state` row as though it were local.

Two different expense notions flow through, and mixing them up is easy: `monthly_expenses` drives `financial_analysis.monthly_profit`, while `monthly_operating_expenses` drives `business_analysis.monthly_operating_surplus`. They are separate inputs and can disagree.

### The scheme dataset — 30 schemes across 7 tiers

`schemes.json` grew from 3 to **30** on 7 Sept 2026, on the brief "include Block/Taluka/Circle, Village/Urban Local Body, Regional, District, Sub-District, State/UT and Central schemes". Every scheme carries a `level`, and that is the axis the UI is organised around:

| `level` | rank | Examples in the file |
|---|---|---|
| `central` | 0 | PMEGP, PMMY, PMFME, PM Vishwakarma, Stand-Up India, NLM, AHIDF, AIF, KCC |
| `state` | 1 | UP Mukhyamantri Yuva, UP VSSY, Maharashtra CMEGP, Tamil Nadu NEEDS, Kerala ESS, Bengal Bhabishyat Credit Card, Karnataka Udyogini |
| `regional` | 2 | UNNATI (North East), Vibrant Villages (border blocks) |
| `district` | 3 | District Industries Centre, RSETI, Krishi Vigyan Kendra, ODOP (UP) |
| `sub_district` | 4 | Tehsil/Taluka certificate counter, Sub-Divisional agriculture office |
| `block` | 5 | BDO / NRLM SHG desk, Block Level Bankers' Committee, ATMA block unit |
| `local_body` | 6 | Gram Panchayat trade licence, Common Service Centre, PM SVANidhi (urban local body) |

`LEVEL_RANK` in `scheme_service.py` holds those ranks; `level_rank(level)` is tolerant of an unknown value; `DEFAULT_LEVEL` is `"central"`. Matches sort by **`(-match_score, level_rank, name)`** — score first, then outward from the national government, then alphabetically. Sorting on score alone left thirty schemes in *file* order within each score, so the same category could list a Gram Panchayat counter above PMEGP.

The frontend mirrors this: `LEVEL_ORDER` in [backendText.js](frontend/src/i18n/backendText.js) must stay in step with `LEVEL_RANK`. **`/schemes` groups the cards by tier** under a `lvl.*` heading with a `lvlnote.*` line beneath it; `/analysis` and `/report` are flat lists and carry a `sch.runBy` badge on each card instead. The `lvlnote.*` strings cost 64 extra translated keys and are worth it: a tier label alone teaches a rural reader nothing, so the note names the office they would physically walk into ("The block office near you. Its staff come to villages."). Empty tiers are dropped, so a category matching only central schemes shows one heading rather than seven.

[gen_schemes.py](backend/gen_schemes.py) is the generator that produced the file, kept as **provenance rather than runtime** — nothing imports it and the backend reads only `schemes.json`. It is how to regenerate the dataset consistently if the tiers change; `gen_schemes_keys.json` records the key inventory it emitted (`{eligibility: 94, documents: 21, ids: 30}`).

**29 of the 30 `official_url`s were confirmed HTTP 200 on 7 Sept 2026.** The exception is PMEGP's `https://www.kviconline.gov.in/pmegpeportal/` — a pre-existing repo URL the team verified on 1 Sept; its host resolves but refuses connections from this network, so it is unverified rather than known-bad. Worth a manual click before the demo.

### Formulas and thresholds

All deterministic, all unit-tested. Keep them that way — never move arithmetic into a model.

- `monthly_profit = expected_monthly_revenue - monthly_expenses`; margin = profit/revenue×100, 0 when revenue is 0 ([financial_service.py](backend/app/services/financial_service.py))
- `funding_gap = max(initial_investment - available_capital, 0)` — clamped, so surplus capital reads as no gap rather than a negative one. `/report` prefers this over its own client-side sum so the two pages cannot disagree.
- `pressure_ratio = monthly_emi / monthly_surplus × 100`; **<30 low, 30–50 moderate, >50 high**. Non-positive surplus short-circuits to `high` with `pressure_ratio_percent: None` ([risk_service.py:5-24](backend/app/services/risk_service.py#L5-L24))
- `estimated_roi_percent = (monthly_operating_surplus × 12) / initial_investment × 100`, or `None` when investment is 0 ([business_service.py:30-35](backend/app/services/business_service.py#L30-L35))
- Observation/advice text is chosen by margin bands at 10% and 30% ([business_service.py:63-71](backend/app/services/business_service.py#L63-L71), [advisory_service.py:23-31](backend/app/services/advisory_service.py#L23-L31))
- Scheme score: **+60** if the category matches, then geography splits — **+40** if the scheme names the entrepreneur's own state (→ 100) or **+30** if it is open nationwide (→ 90). No category match returns `0, []` and the scheme is dropped ([scheme_service.py](backend/app/services/scheme_service.py)). The split exists because with 30 schemes a flat +40 for both put almost every match on exactly 100, and a percentage that is always 100 tells the reader nothing. **Only 90 and 100 are reachable** — which is why `/schemes` gates its comparison chart on there being more than one *distinct* score.
- **Availability is decided before scoring, not by it.** `serves_state(scheme, state)` drops a scheme whose `states` list names a specific set the entrepreneur is not in. Showing a Uttar Pradesh-only subsidy to a Kerala entrepreneur as a "60% match" is worse than not showing it: they would spend a trip to the block office on it.
- Category matching runs the user's pick through `CATEGORY_SYNONYMS` first, then keeps the substring test. The map only bridges wording (`retail` → `trading`, `handicraft`/`tailoring` → `manufacturing`, `livestock` → `dairy`); **it must never widen real eligibility.**
- **The matcher's direction is `if scheme_category in phrase`** — the *scheme's* word must be a substring of the *user's* phrase, not the reverse. Two consequences that have each been a live bug: a scheme must never claim the category `"livestock"` (the synonym map goes livestock→dairy, not dairy→livestock, so nothing would ever reach it), and never `"other"` (the Other button sends the user's typed text, not the literal word). `test_no_scheme_claims_a_category_the_matcher_cannot_reach` pins both.
- Market context is tiered: exact state+district+category first, else same state+category with `match_level: "state"`, else `[]` ([market_service.py](backend/app/services/market_service.py)). Before 7 Sept it required an exact district, so every district without a row got an empty section.

---

## Known defects

Ranked by demo impact, all confirmed against the code. **Numbers are stable** — a fixed item keeps its number and gets marked, so references in commit messages and teammate notes keep resolving.

**All ten were fixed on 7 September 2026.** The descriptions below are kept because each one explains a trap the codebase can fall back into. What remains open is listed under "Still open" further down — do not read this section as a to-do list.

**1. FIXED — the product was branded "Sahyog", not ArthNiti.** Brand mark, nav name and footer in `App.jsx` all said Sahyog, and `<title>` said `frontend`. Now "अ" / "ArthNiti" and a real `<title>` plus a meta description. The landing page's "See how it works" also pointed at `/analysis`, which on a fresh load only ever shows the empty state; it now anchors to `#how-it-works` on the landing page itself.

**2. FIXED — five of the nine business categories matched zero schemes.** `scheme_service` tested `scheme_category in category`, so the scheme's string had to be a **substring of** the user's pick — and no scheme ever says "retail". Fixed with `CATEGORY_SYNONYMS` (see Formulas above). Coverage measured after the fix:

| Category button ([BusinessPage.jsx](frontend/src/pages/BusinessPage.jsx)) | Schemes | Market rows, UP/Lucknow |
|---|---|---|
| Retail / Shop | 2 (PMEGP, PMMY) | 0 |
| Handicrafts | 2 | 1 |
| Tailoring | 2 | 1 |
| Services | 2 | 0 |
| Manufacturing | 2 | 0 |
| Food / Food Processing | 1 (PMFME) | 1 |
| Livestock / Dairy | 1 (PMMY) | 1 |
| Agriculture, Other | **0** | 0 |

**That table is now historical.** The 30-scheme expansion superseded it — measured against the live backend on 7 Sept 2026 with Uttar Pradesh / Lucknow:

| Category button | Schemes | Tiers | Market rows |
|---|---|---|---|
| Food / Food Processing | 16 | 6 | 1 |
| Handicrafts | 14 | 6 | 1 |
| Tailoring | 14 | 6 | 1 |
| Manufacturing | 14 | 6 | 0 |
| Livestock / Dairy | 13 | 5 | 1 |
| Services | 13 | 6 | 0 |
| Retail / Shop | 12 | 6 | 0 |
| **Agriculture** | **12** | 5 | 0 |
| Other, typed (e.g. "Photography") | 0 | — | 0 |

**Agriculture is no longer a dead end** — it matches 12 schemes across 5 tiers. This is *not* the forbidden widening: the eligibility warning under Formulas is about `CATEGORY_SYNONYMS` bridging *wording*, and these are real schemes that genuinely serve crop farmers (KCC, the Agriculture Infrastructure Fund, the district Krishi Vigyan Kendra, the block ATMA unit, the Sub-Divisional agriculture office). No synonym was loosened to get there.

**The `sch.noneCovered` empty state is still reachable, but only through a typed-in "Other".** It was rewritten in all 8 languages to name every kind of work the 30 schemes between them cover. Note the knock-on for verification: `screenshots/verify/drive.mjs`'s `empty` case used to be agriculture-in-Delhi and silently stopped testing the empty state once it started matching 12 — it is now a typed "Photography", which is the only input that reaches it.

**3. FIXED — `market_context` was computed and then silently discarded.** No frontend file read it, so the hyperlocal data never reached the UI even though "Hyperlocal" is the first differentiator in `OUR_MVP.md` §2. Now rendered on `/analysis` (a "Your local market" section with `MarketCard`) and inside `/report`'s local-market section (`MarketRow`). The exact-district requirement was also relaxed to the tier described under Formulas, and `market_data.json` grew from 5 rows to 9 (added Lucknow × {handicrafts, tailoring}, Varanasi × {handicrafts, food processing}). Every row is labelled `"source": "Prototype estimate / illustrative data"` — keep it that way; the data is illustrative and the UI says so.

**4. FIXED — `/analysis` showed ₹0 where `/report` showed a real number.** `financial_analysis` carried only four keys, so `funding_gap`, `expected_monthly_revenue` and `monthly_expenses` all read `undefined`, and `formatCurrency` printed `'₹0'` — a confident, wrong, reassuring number. Fixed on the backend by computing and returning all four (`calculate_financial_metrics` now takes `initial_investment`, default 0). `formatCurrency` on `/analysis` also now returns "Not available" for a missing value instead of `₹0`.

**5. FIXED — `/report` always showed "Monthly revenue: Not Available."** It read `finance.monthlyRevenue`; the value lives at `business.monthlyRevenue`.

**6. FIXED — `a { color: inherit }` defeated every Tailwind `text-*` utility on anchors, app-wide.** The reset was **unlayered**, and unlayered author CSS beats everything in `@layer utilities` regardless of specificity. Verified before the fix: a link asking for `#00804c` computed to `rgb(22,49,38)`. Now wrapped in `@layer base` together with the other element resets — confirmed in the built CSS, at brace depth 1 inside `@layer base{`, with `.text-white` landing later in `@layer utilities`. The `:focus-visible` outline was deliberately **left unlayered** so a stray `focus:outline-none` cannot remove the keyboard focus ring.

**7. FIXED — `/analysis` scheme cards dropped match reasons and eligibility.** Its `SchemeCard` read `scheme.reason` and `scheme.eligibility`; the backend returns `match_reasons[]` and `eligibility_rules[]`, so both rendered as nothing. Now renders match reasons as a checked list and eligibility rules joined with `·`.

**8. FIXED — `Button` bypassed the theme tokens.** It hardcoded `bg-green-600 hover:bg-green-700 text-white`. Now `bg-[var(--color-primary-strong)]` via a `variant` prop (`primary` | `secondary`). The four call sites that used to pass their own `bg-*`/`text-*` classes were converted to `variant="secondary"`, which removes the real hazard: two competing utilities land in the same cascade layer, where **stylesheet order decides the winner, not class-attribute order.** Don't reintroduce colour overrides at call sites — add a variant.

**9. FIXED — `/report` cards split across print page breaks.** `index.css` now has an `@media print` block: `break-inside: avoid` on the card classes, app chrome hidden, `<details>` forced open so the detailed figures reach the PDF, and the theme tokens reset to light values so a dark-mode laptop still prints on white.

**10. FIXED — dead scaffolding removed.** `frontend/src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg` deleted. Note `src/assets/hero.png` and `public/icons.svg` are also unreferenced but were **left in place** — they may be a teammate's in-progress work.

### Still open

- ~~**Agriculture and Other match no schemes.**~~ **CLOSED 7 Sept 2026** by the 30-scheme expansion — agriculture now matches 12 across 5 tiers. A typed-in "Other" that resembles nothing in the file still matches zero, which is correct behaviour and is what the empty state is for.
- **Dialect coverage is 9 of 30 varieties**, and each is a handful of phrases rather than a translation. Deliberate and disclosed in the UI — see the i18n section. Don't describe it as a translation.
- **Non-English translations are unreviewed by a native speaker.** Covered by the entry above; the specific errors found by eye were Tamil `money.left` reading "moderate money" (மிதம் for மிச்சம்) and a duplicated word in Malayalam `elig.bdo.funds`.
- ~~**Backend prose is English only.**~~ **CLOSED 7 Sept 2026.** Every generated sentence now carries a translation code and resolves through `tBackend()` in all 8 languages — see the translation-code section above. What remains English is narrow and deliberate: an enum value the `LEVEL_KEYS`/`STATUS_KEYS` maps do not recognise falls back to the title-cased enum, and a scheme added to `schemes.json` without codes falls back to its English prose.
- **Non-English wording quality is still unreviewed by a native speaker** — now across 584 keys × 8 languages rather than 530. Parity, placeholder integrity and identical-to-English are all script-verified; *naturalness* is not. Two real errors have already been found by eye (Tamil `money.left` read "moderate money", Malayalam `elig.bdo.funds` had a duplicated word), which is evidence there are more.
- **The print PDF layout and the `api.js` timeout path still need a manual click-through.** The driver below covers page rendering, not `window.print()` output or a stalled backend.
- ~~**Mobile is not pixel-verified.** Desktop widths only.~~ **CLOSED 7 Sept 2026** — see "Phones" below. All ten routes now pass a measured audit at 360 / 390 / 412 px. What is still unverified there: landscape orientation, real touch scrolling on a physical device, and the on-screen keyboard covering a focused input.

### Verifying in a real browser

Lint, build and pytest cannot see a leaked `t()` key, a `null%`, or a page that renders as an empty shell. [screenshots/verify/drive.mjs](screenshots/verify/drive.mjs) drives Edge over CDP with **zero dependencies** (Node 24 has a global `WebSocket`), seeds `sessionStorage` so result pages can be loaded directly, walks **7 passes → 36 page loads**, and writes text dumps, full-page PNGs and a `report.json`. It fails on: an unrendered page, a page exception, a leaked dotted i18n key, the bad tokens `null%` / `NaN` / `undefined` / `[object Object]` / `₹null`, and raw enum names.

```bash
node screenshots/parity4.mjs              # i18n key parity, 4 files × 8 languages, no server
node screenshots/verify/refresh-cases.mjs  # regenerate the fixtures; needs the BACKEND up
node screenshots/verify/drive.mjs          # needs the Vite dev server up; 36 page loads
node screenshots/verify/glyph-audit.mjs    # bare decorative glyphs, no server needed
node screenshots/verify/mobile-audit.mjs   # phone widths; needs Vite up; 40 page loads
```

**`refresh-cases.mjs` exists because the fixtures go stale silently.** `drive.mjs` seeds `sessionStorage` from three captured `case_*.json` responses, and those snapshots sat at 2 schemes with no `level` and no translation codes long after `schemes.json` grew to 30 and the services started emitting codes — so the driver kept passing while telling you nothing about the scheme UI. `refresh-cases.mjs` re-POSTs the same payload `FinancePage.jsx` builds and rewrites the three files. **Run it after any change to the services, the schemas or `schemes.json`.**

Four form cases, and **the fourth is the one that finds bugs**: `good` (tailoring/UP/Lucknow, everything populated — 14 schemes across 6 tiers), `nulls` (zero investment and a negative surplus, so `estimated_roi_percent` and `pressure_ratio_percent` both come back `null`), `empty` (a typed-in "Photography" in Delhi — no schemes, no market row; it was agriculture-in-Delhi until that started matching 12), and `blank` (**nothing entered at all**). `blank` exists because the form pages compute live previews from `Number(field) || 0`, so an unanswered question arrives as a real `0` and every derived figure reads as good news — "₹30,000 left each month", "you have enough of your planned investment" — before the user has said anything. Four bugs of exactly that class were live on `/finance`. The blank pass asserts no `₹0` and no reassurance copy survives an empty form; an all-zeros case is **not** a substitute, because a typed 0 must still print as ₹0.

`glyph-audit.mjs` flags decorative emoji and arrows rendered as bare JSX text with no `aria-hidden` ancestor. It skips glyphs inside string literals of **either** quote style — those are `icon=` props whose consumer already wraps them — and reports a glyph alone on its own line separately, since it cannot see a wrapper opened on the line above. Expect exactly 3 such hits (`App.jsx`, `AdvisoryPage.jsx`, `AnalysisPage.jsx` empty-state icons); all three have `aria-hidden` on the parent div.

**`mobile-audit.mjs` is the phone equivalent, and it is a different tool from `drive.mjs`, not a wider version of it.** `drive.mjs` asks "did the right text render"; this one asks "can a thumb use it". It emulates 360 / 390 / 412 CSS px with `Emulation.setDeviceMetricsOverride({mobile: true, deviceScaleFactor: 2})` plus touch emulation — **`mobile: true` is the load-bearing part**, because without it the viewport meta tag never applies and every measurement is a desktop measurement in a narrow window. It seeds `sessionStorage` from `case_good.json`, walks all 10 routes × 3 widths, writes PNGs and `report.json`, and exits 1 on any finding. Four classes:

| Class | Test | Why it is a defect |
|---|---|---|
| `OVERFLOW` | `documentElement.scrollWidth > clientWidth` | The page scrolls sideways: content sits off-screen and the layout jitters under a thumb. Worst mobile defect there is. It also names the widest offending elements — "the page is 73px too wide" is useless without knowing what did it. |
| `TAP` | interactive element under 44×44 | Below that a user misses and re-taps; on a form page that means abandoning the journey. |
| `TINY` | leaf text under 12px | The audience is low-literacy readers. |
| `CLIP` | `el.scrollWidth > el.clientWidth` with a non-scrolling `overflow-x` | A long unbroken word — a district name, a scheme name, a typed email — pushing out of its card. |
| `SPLIT-FIGURE` | an element whose entire text matches `/^₹\s?[\d,]+(\.\d+)?$/` occupying more than one line box | `₹30,000` wrapped as `₹30,00` / `0` is not cosmetic — the reader parses a different number. **Every other check passes on it**: nothing overflows, nothing is clipped, all the text is present. |

Four exclusions in the probe are deliberate; re-adding them just floods the output with noise that is not wrong. `.sr-only` is a deliberately clipped 1px box, so it reported `CLIP` on every page. Anything inside an ancestor whose computed `overflow-x` is `auto`/`scroll` is scrolled-out content, not overflow — `.ui-navbar-inner` scrolls on purpose, so without this every nav link reported `OVERFLOW`. An element entirely off the left edge (`right <= 0`) is the standard skip-link parking spot: it cannot widen the document and cannot be seen. And **`.ui-unit-chart` spans are exempt from `CLIP`**: the coin box is sized in `rem` on purpose, decoupled from the glyph's `font-size`, so an empty slot's ring and a filled coin stay the same size — but an emoji's advance width is ~1.28em, so at the largest text scale the glyph measures ~2px wider than its `1.6rem` box. It overhangs a *transparent* border with `overflow` visible, so nothing is actually hidden; sizing the box to the glyph instead would grow every coin and re-couple the two.

The probe **measures used values rather than reading CSS**, because a rule can look correct and still lose to the cascade. One measurement trap cost real time and is worth not rediscovering: **`el.getClientRects()` returns one rect per line box only for `inline` elements.** On a block or flex box it returns a single rect however many lines the text wrapped to — so the first `SPLIT-FIGURE` check reported 0 problems, twice, on output that was visibly broken. Use `document.createRange()` + `selectNodeContents(el)` and count distinct rounded `top` values; a Range reports line boxes either way. The general lesson: **when a new check reports zero, break the thing it watches on purpose and confirm it fires** before believing it.

Two gotchas cost real time and are both handled in the script — don't undo them. `--user-data-dir` **must be absolute**: a relative path silently attaches to the already-running Edge profile and exits with no debug port. And you must create your own target (`/json/version` → `webSocketDebuggerUrl` → `Target.createTarget` → `Target.attachToTarget({flatten: true})`, then pass `sessionId` on every command) rather than taking the first `type === 'page'` from `/json/list`, which on a signed-in profile is `edge://sync-confirmation-dialog/`. Use `http://localhost:5173` — **Vite binds `[::1]` only**, so `127.0.0.1:5173` refuses.

`screenshots/` is gitignored, so the driver is **not version-controlled** — it lives with the output it produces. Kill Edge and both servers when done.

### Also fixed 7 Sept 2026 (found after the list above was written)

These were separate from the numbered list. Recorded so nobody re-diagnoses them.

- **`[object Object]` in the error banner.** See the 422 note in the data contract above.
- **No request timeout.** `api.js` now uses `AbortSignal.timeout(20000)` with its own message.
- **Backend `null` rendered as `0%` and as the literal `Null%`.** See the null-guard convention below.
- **No catch-all route** — a typo'd URL rendered the shell with a blank body. `NotFoundPage` now handles `*`.
- **`aria-hidden="true"` on a `required` control.** `BusinessPage` had a `sr-only` mirror input to make native validation cover the button-based category picker. Replaced with an explicit check in `handleContinue` plus a visible `role="alert"` message.
- **State and district were asked twice**, on both `/profile` and `/location`. Removed from profile; `district` is now `required` on `/location` to preserve what profile used to guarantee.
- **The two expense questions were indistinguishable.** Both now carry hint text: business-only costs on `/business`, everything-including-household on `/finance`.

### The 8 Sept 2026 redesign (branch `aryan-gov-ui`)

Everything below was added after the ten defects were closed. Recorded so a later session can tell the redesign apart from the fixes, and so nobody re-litigates a decision that was made for a reason.

- **Government-style chrome** — utility bar, masthead, tricolour band, nav bar, breadcrumbs, government footer. See the design-direction section.
- **8-language UI + a dialect phrase layer**, Hindi by default. See the i18n section for the parts that are easy to break.
- **Charts** — `BarRow`, `BarGroup`, `UnitChart`, hand-rolled on CSS so they survive print, dark mode and high contrast.
- **Cascading state → district dropdowns** from 36 states/UTs and 768 districts, replacing two free-text boxes.
- **`sessionStorage` persistence**, which closed the single largest demo risk: a refresh no longer wipes everything.
- **Accessibility controls** — three-step text scale, high-contrast mode, skip link, `<html lang>` tracking the language, `aria-hidden` on decorative glyphs.
- **A `/login` page** collecting name, phone, address and email. Nothing is authenticated and no password exists; it only carries the name into step 1. Don't present it as auth.
- **A real browser-verification driver.** See "Verifying in a real browser".
- **Two fixes found only by looking at rendered output**: the Tamil `money.left` mistranslation, and "Step 3 of 4" printing twice in the journey bar.

Deliberately **not** added, so these don't get proposed as oversights: no charting library, no i18n library, no localStorage for financial answers, no route guards, no frontend test framework. (Backend translation *was* on this list and is now built — see the translation-code section.)

### The scheme expansion, 7 Sept 2026

On the brief "add more schemes — Block/Taluka/Circle, Village/Urban Local Body, Regional, District, Sub-District, State/UT, Central". What landed:

- **`schemes.json` 3 → 30 schemes across all 7 tiers**, each with a `level`, a stable `id`, and translation codes for every sentence. `serves_state()` gates availability; the score split gives 100 to a state-specific match and 90 to a nationwide one. See "The scheme dataset" above.
- **The full backend-prose translation layer** — every service sentence carries a code, resolved through `tBackend()` / `backendText.js`. This is what closed the "backend prose is English only" gap.
- **`schemeStrings.js`, the fourth dictionary file** — 188 keys × 8 languages for the scheme prose alone.
- **Tier grouping on `/schemes`** under `lvl.*` headings with `lvlnote.*` office notes, and a `sch.runBy` badge on the flat lists on `/analysis` and `/report`.
- **`screenshots/parity4.mjs`** — the 4-file, 8-language, 5-check parity verifier. It is the only thing that catches a cross-file key collision.
- **`screenshots/verify/refresh-cases.mjs`** — regenerates the driver's fixtures, which had gone stale and were masking exactly this kind of change.
- **151 tests** (was 135), including `test_the_seven_levels_are_all_reachable_from_real_input`, which sweeps 8 (category, state) pairs and asserts every tier is reachable — so a tier with no UI heading would be caught as dead data.

### Safest demo configuration

**Food Processing, Handicrafts or Tailoring, in Uttar Pradesh / Lucknow.** Measured against the live backend on 7 Sept 2026, those fill *every* section and show the widest tier spread: 14–16 schemes across **6 of the 7 tiers**, both scores (100 and 90) present so the grouping reads as deliberate, plus a district-level market row.

Give the location step a village name, a market type and a customer description too — all three flow into `market_context[].local_context` and are printed back.

**Agriculture is now safe to demo** — 12 schemes across 5 tiers — and is arguably the better story, since it was the long-standing dead end. It has no market row, so `/analysis`'s market section shows its empty state. Only a typed-in **Other** that resembles nothing in the file matches zero.

The one tier no UP pick reaches is `regional`: UNNATI is North-East-only and Vibrant Villages is border-block-only. If a judge asks to see all seven, use **Assam** (UNNATI) — but check the market section will be empty there.

Verified end to end with `tailoring` / Uttar Pradesh / Lucknow: 200, 7 top-level keys, `funding_gap` 50000, 14 schemes (2 at 100, 12 at 90) with populated `match_reasons` and `eligibility_rules`, tiers `{state, district, central, sub_district, block, local_body}`, 1 market row at `match_level: "district"`, `risk_level: low`, `estimated_roi_percent: 126.0`.

**On language for a live demo:** switching to Hindi or Tamil is the strongest single moment in the walkthrough, and the whole interface changes with it — **including the generated advice and the scheme text**, which is new as of 7 Sept and is the part worth pausing on. A result page is now a *better* place to demonstrate it than a form page, which is the reverse of the advice this file used to give. Picking a dialect is worth showing on the landing page, where the greeting and the CTA both change. If a judge asks what is still English: an unmapped enum falls back to a title-cased English word, and the wording has not been reviewed by a native speaker — say that rather than overclaiming.

---

## Conventions

Match the surrounding file; the two halves of the codebase have genuinely different styles.

**Backend.** Plain module-level functions, no classes, no framework magic. Type hints on parameters, none on returns. Services return plain `dict`s. Numeric outputs are `round(x, 2)`. Routers are one file per domain with `APIRouter(prefix="/api/<domain>", tags=[...])`. Services never touch FastAPI, and routes never do arithmetic. `str | None` syntax is fine (Python 3.14).

**Frontend.** Function components, no TypeScript, no prop types. Named helper components live at the bottom of the page file that uses them (`MetricCard`, `SectionHeading`, `DetailRow`, `SummaryCard`, `MarketCard`, `MarketRow`). Formatters (`formatCurrency`, `formatPercent`, `formatText`, `hasNumber`) are duplicated per page by design. Colors always go through `var(--color-*)`, never literal hex. `ReportPage.jsx` is deliberately written one-element-per-line and dense — preserve that when editing it.

**`Button` takes `variant`, `size` and `to` — never colour or padding classes.** `variant` ∈ `primary` | `secondary`, `size` ∈ `md` | `lg` (both clear the 44px touch target). Passing `to` renders a react-router `<Link>` styled as a button instead of a `<button>`; a **disabled `to` falls back to `<button disabled>`**, because `aria-disabled` on an anchor still leaves it tabbable and still follows the href. Never nest `<Button>` inside `<Link>` — a `<button>` inside an `<a>` is invalid HTML and the nesting is what `to` exists to remove. And never pass `bg-*` / `text-*` / `px-*` / `py-*` to it: those land in the same cascade layer as the component's own utilities, so stylesheet order decides the winner, not class-attribute order. Add a variant or a size instead.

**Charts are hand-rolled in [Charts.jsx](frontend/src/components/Charts.jsx), not a library**, for three reasons that all matter here: colours come from the theme tokens so dark mode and high contrast work with no extra code; the bars survive `window.print()`, where a JS library has already measured a screen-width container before the paper layout re-measures; and **the number is always printed as text beside the bar**, so a chart is decoration over a readable figure rather than the only place a value exists. That last point is the accessibility contract — the track carries `aria-hidden="true"` because the label and value above it already say the same thing.

Two chart rules exist because breaking them produces a *favourable* misreading, which is the worst kind:

- **`BarGroup` gives negative values no bar at all**, and takes its shared maximum over the positive values only. It used to scale on `Math.abs`, so a ₹10,000 loss drew exactly the bar a ₹10,000 profit drew — and in a group of {money in, money out, money left} a long bar reads as "plenty" to anyone not also parsing the minus sign. A shortfall draws an empty track and `.ui-bar-value.is-bad` colours the figure so the empty track cannot read as missing data.
- **A group must share one maximum.** Scaling each bar to its own value makes ₹5,000 and ₹5,00,000 draw identically.

`UnitChart` (10 coins, first N filled) is the one chart that needs no numeracy at all, which is why the result pages lead with it. It takes `ariaLabel` from the caller so the sentence is translated; the English default is a fallback, not the norm.

**Decorative emoji and glyphs need `aria-hidden="true"`** — either on the glyph's own `<span>` or on a parent that contains nothing else. A screen reader announcing "rocket emoji" or "rightwards arrow" before every button label is noise. Check the parent first: `.ui-feature-icon` wrappers and the `icon=` props on `MiniCard`/`Feature`/`AdvisoryCard` already carry it, so wrapping again is redundant. Numbers that are content (a step number, a scheme's position in a list) stay visible to the reader.

**Guard on the raw value before printing a number, never on `Number.isFinite` alone.** The backend sends `None` for anything it could not compute, which arrives as JSON `null` — and `Number(null)` is `0`, which *passes* `Number.isFinite`. So a naive formatter turns "could not compute" into a confident `0%`, the most favourable possible reading. A `!== undefined` check has the same hole and yields the literal string `"null%"`. Both were live bugs. Use `hasNumber(value)`, which rejects `null`, `undefined` and `''`. The two fields that go null are `risk_analysis.pressure_ratio_percent` (non-positive surplus) and `business_analysis.estimated_roi_percent` (zero investment). A genuine `0` must still render as `0%` — don't collapse real zeros into "Not available".

**ESLint 10 enforces `preserve-caught-error`.** If you bind a caught error and throw a new one, pass `{ cause: error }` or the lint fails. Bare `catch {}` with no binding is exempt.

**CSS cascade layers — read this before touching `index.css`.** Tailwind v4's `@import "tailwindcss"` emits `@layer theme, base, components, utilities`. **Unlayered author declarations beat all layered ones regardless of specificity.** This cuts both ways and explains four separate things: the default card padding sits inside `@layer components` so a call-site `p-5` or `p-0` still wins; `.ui-feature-card { padding: 22px }` is unlayered so it beats that default; the element resets now sit in `@layer base` so `text-*` utilities win on anchors (defect 6); and the `:focus-visible` outline is deliberately left unlayered so it cannot be removed by `focus:outline-none`. When adding a `.ui-*` rule meant to be overridable by Tailwind, put it in `@layer components`; when adding an element reset, put it in `@layer base`.

**Two competing Tailwind utilities for the same property do not resolve by class-attribute order** — they land in the same layer, and generated-stylesheet order decides. That is why `Button` uses `variant` and `size` props rather than accepting `bg-*` or `px-*` from call sites. If you catch yourself passing a colour or padding class to a component that already sets one, add a variant or a size instead.

**Print styles live in the `@media print` block at the end of `index.css`.** Anything added to `/report` that is a card needs to be covered by the `break-inside: avoid` selector list, or it will split across a page break in the PDF.

**Design system** (`index.css`). **Not all of it is inside `@layer components`, despite what this file used to say here** — `@layer base` opens at line 112 and `@layer components` at line 589, so the **chrome block (lines ~195–580) is unlayered and therefore beats every Tailwind utility**, regardless of specificity or class-attribute order. That is why the phone rules below can set a `min-height` that wins over a call-site `py-1`, and it is a trap in the other direction: a chrome rule you *want* a call site to override has to be moved into `@layer components` first. Chrome: `.ui-shell`, `.ui-utilitybar(-inner|-note|-tools)`, `.ui-utility-button`, `.ui-textsize`, `.ui-masthead(-inner)`, `.ui-tricolour`, `.ui-topbar(-inner)`, `.ui-navbar(-inner|-link)`, `.ui-brand(-mark|-name|-sub)`, `.ui-breadcrumb(-sep)`, `.ui-skip-link`, `.ui-main`, `.ui-footer(-inner|-title|-gov|-bottom|-bottom-inner)`. Content: `.ui-page-intro`, `.ui-eyebrow`, `.ui-page-title`, `.ui-page-subtitle`, `.ui-hero`, `.ui-card`, `.ui-card-soft`, `.ui-simple-grid`, `.ui-feature-*`, `.ui-progress*`, `.ui-disclosure(-body)`, `.ui-icon-button`, `.ui-notice(-danger|-warn)`, `.ui-required`. Forms: `.ui-formsection(-head|-num|-title|-body)`. Charts: `.ui-bar-row`, `.ui-bar-head`, `.ui-bar-label`, `.ui-bar-value`, `.ui-bar-track`, `.ui-bar-fill`, `.ui-bar-mark`, `.ui-unit-chart`, `.ui-chart-caption`.

**Three independent presentation switches on `<html>`, all persisted**, and anything added to `index.css` has to survive all of them: `data-theme="dark"` (`sih-theme`), `data-contrast="high"` (`sih-contrast`), and `--ui-scale` (`sih-textsize`, one of 0.94 / 1 / 1.18). The text scale **multiplies** the reader's own browser font size rather than replacing it, so someone already running their browser at 20px keeps that. Sizes that must scale with it need `rem`/`em` or `calc()` against `--ui-scale`, not fixed `px`.

### Phones (7 Sept 2026)

**The target user reads this on a phone, not a laptop**, so narrow-width behaviour is correctness, not polish. Before this work every one of the ten routes scrolled sideways at all three phone widths, and all seven accessibility controls were under the 44px touch minimum. Measured clean now: **40 page loads (10 routes × 360/390/412 plus a 360 stress pass), 0 findings.** Desktop was re-verified unchanged in the same pass — `drive.mjs` 36/36, parity 584 keys, 151 tests.

**The stress viewport is the one that earns its keep.** `360-stress` is 360px *and* dark *and* high-contrast *and* the 1.18 text scale *and* Hindi, all at once, because `index.css` has to survive every combination of the three switches and the narrowest screen with the largest type is where a fixed box overflows again. The three plain widths were clean when it was added; it immediately found four defects the others could not.

There are now **three** breakpoints in `index.css`, and they do different jobs. Don't collapse them:

| Query | Job |
|---|---|
| `max-width: 800px` | pre-existing — collapses the grids and narrows the chrome containers to `min(100% - 24px, 680px)` |
| `pointer: coarse`, `max-width: 640px` | touch-target sizing. **Pointer, not just width**, because a tablet has a thumb at 1024px too; the width arm is there so a narrow desktop window gets the same treatment and so the audit sees it either way |
| `max-width: 640px` | narrow-layout-only fixes: `overflow-wrap: anywhere` on `.ui-page-title` / `.ui-bar-label`, and the nav scroll hint |

Six things are worth knowing before touching this:

- **The whole-page sideways scroll was one missing declaration.** `.ui-utilitybar-inner` already wrapped, but `.ui-utilitybar-tools` inside it was `display: flex` with no `flex-wrap`, so the language select + the `A-/A/A+` trio + three icon buttons formed one unbreakable ~396px row inside a 336px box. That single overflow pushed the document 73px wide on **every route in the app**. It now has `flex-wrap: wrap`.
- **The prototype notice is visible on phones again.** It used to be `display: none` below 800px — hidden purely because the utility bar was one unwrappable row and something had to give. That is the worst possible place to drop it: the notice exists so a government-styled masthead can never read as an official service, and it was being hidden on the device the target user actually holds. Now that the tools wrap, the notice takes its own full-width row and the tools drop beneath it. **Do not hide it again to save vertical space.**
- **`.ui-navbar-inner` keeps its `overflow-x: auto` and hidden scrollbar** — that is a deliberate design decision, and its links are already ≥44px. What was added is only a *hint*: a `::after` fade on `.ui-navbar` below 640px, because the last link was being sliced mid-word ("Your busi") with nothing to say more existed, which reads as broken rather than scrollable. The gradient runs to `var(--color-btn)`, the band's own background, so dark mode and high contrast need no extra rule.
- **`min-width`, not padding, on the breadcrumb link.** Height alone does not make a target: `Home` is ~35px wide, so it stayed a 35×44 box. `min-width: 44px` keeps the text flush with the left edge of the page content below it and does nothing once a longer translation (Hindi `मुख्य पृष्ठ`) already exceeds it. Padding would have shifted the text and misaligned the column.
- **The footer's journey links were deliberately left alone.** They are inline links separated by `·` inside a single `<p>`; a 44px box on each would blow the line height apart, and the nav bar above already offers every journey step at full size. The audit excludes inline links inside `p`/`li` for the same reason — if you "fix" these, you are fighting the tool on purpose.
- **A money figure must never wrap mid-number, and `overflow-wrap: anywhere` will do exactly that.** `.ui-card` and `.ui-card-soft` carry `anywhere` **unconditionally** (index.css:571 and :580), every descendant inherits it, and in a squeezed `.ui-bar-head` flex row that rendered `₹30,000` as `₹30,00` / `0` on **9 of the 40 pages** — a reader parses a different number, and it happens to be a smaller, more reassuring one. The fix is two halves and both are load-bearing: `.ui-bar-label { min-width: 0 }` so the *label* absorbs the squeeze (a flex item will not shrink past min-content without it), and `.ui-bar-value { flex-shrink: 0; overflow-wrap: normal; word-break: keep-all }` so the *figure* neither shrinks nor breaks. Both are unconditional, because the ingredients are width-independent. Anything new that prints a figure into a narrow flex row needs the same opt-out, and `mobile-audit.mjs` guards it as `SPLIT-FIGURE`.

Five back links on `/login`, `/profile`, `/business`, `/location`, `/finance` were 20px tall; they now carry `inline-flex min-h-11 items-center`, which is the pattern the four result pages already used. Then **all eight** (those five plus `/analysis`, `/schemes`, `/advisory`) gained `min-w-11`, because Hindi `← होम` measures only 42px wide — the existing four were never as safe as they looked. `ReportPage`'s two `inline-flex min-h-11` hits are `<div>`s, not links, and are correctly left alone. **These plus the chart rules above are the only changes here visible on desktop** — those back-link rows are 44px tall now instead of 20px.

Watch `--ui-scale` when adding a font size here: `0.75rem` is 12px at scale 1 but **11.28px at the 0.94 scale**, which is a `TINY` finding waiting to happen. `.ui-brand-sub` moved from `0.74rem` to `0.82rem` for exactly this reason.

Still unverified on phones: landscape orientation, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.

**UI copy is for low-literacy users, and that is a product requirement, not a style preference.** Plain language over jargon ("Money needed", "Money left each month", not "funding gap" / "net surplus"). Advanced detail hides inside `<details className="ui-disclosure">`. Every page carries a back link and a "Step N of 4" marker. Don't "improve" labels into financial terminology — and don't add the terminology in translation either, where it is harder to notice.

**Two labels on `/analysis` and `/finance` describe different figures and must not be given the same words.** `money.left` is the pre-EMI monthly surplus (`revenue − expenses`); `money.leftAfterEmi` is after the loan payment. `monthly_profit` is pre-EMI **on purpose** — `risk_service.py` divides the EMI *by* it to get repayment pressure, so the EMI must not already be subtracted. Labelling both "money left each month" was a live bug.

---

## Tests

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q     # 151 passed in ~0.8s
```

Backend only — there are no frontend tests. `test_frontend_contract.py` and `test_mvp_api_contract.py` pin the response shape by subscripting every key, so **removing or renaming a response key raises `KeyError` and fails them** — that is intended, and it is the fastest way to check whether a contract change is safe. Note the corollary: they assert only that the documented keys are *present*, so **adding** keys passes silently. Run the suite after any service or schema edit.

That corollary is exactly why defect 4 survived so long: `test_frontend_contract_financial_section` asserted precisely the four keys the backend happened to return, encoding the *current* behaviour rather than what the UI needed. It now also asserts the four added keys plus `funding_gap == 0` for the surplus case, and `test_frontend_contract_funding_gap_when_capital_falls_short` pins the shortfall case against `/report`'s own arithmetic.

Some tests pin user-visible **wording**, not behaviour, and are meant to be edited alongside a copy change — `test_scheme_service.py` asserts substrings of `match_reasons`. Those strings now appear on `/analysis` (defect 7), so they are UI copy and bound by the plain-language rule. Two market tests were also rewritten when the district fallback landed: `test_market_context_falls_back_to_the_same_state` replaced one that asserted `[]` for UP/Kanpur.

`httpx2` in `requirements.txt` is correct and intentional, not a typo for `httpx` — it is the httpx 2.x line published by the pydantic org, and Starlette 1.6 uses it directly. `import httpx` fails in this venv while `TestClient` works.

---

## Git

Current branch is **`aryan-gov-ui`** (local only, branched from `aryan-ui-redesign` on 8 Sept 2026 to carry the government-style redesign — the i18n layer, the charts, the cascading location data, `sessionStorage` and the accessibility controls). `aryan-ui-redesign` is the state before all of that and is deliberately left intact. Remote branches are per-person: `netra`, `saad`, `tripti`, `Manjeet` (capital M), `aryan`, `aryan-frontend`, `aryan-ui-redesign`, plus `main`, `backend`, `frontend`, `before-main`. Team ownership per `OUR_MVP.md` §10 — Netra & Anmol frontend, Aryan & Manjeet backend, Saad & Tripti presentation/research. Note §11 there records the real branch scheme; the blueprint's `develop` + `frontend/<name>` layout was never adopted.

Never commit directly to `main`. Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots`.

`screenshots/{light,dark,light-expanded}/` holds 27 full-page PNGs (9 routes × 3 passes, 2880px wide) captured for teammate review. **They predate both the 7 Sept fixes and the redesign** — old Sahyog branding, no market section, ₹0 on `/analysis`, no i18n, no charts. Recapture before circulating them again; `screenshots/verify/out/` now holds current ones. Gitignored, so hand it over as a zip rather than a repo link. Desktop widths only — `screenshots/verify/mobile/` holds the phone-width captures. `presentation/` exists but is empty.

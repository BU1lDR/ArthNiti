# अर्थNiti — MVP

**Project statement:** "AI-Driven Hyper-Local Business Advisory and Financial Structuring Assistant for Rural Micro-Entrepreneurs" is the SIH 2026 problem statement, quoted as issued. It is not this build's claim: no AI writes the advice (see "The model's job").

**Status:** an **individual project**. Aryan Verma builds it alone since 26 Oct 2026, entered in the **Meta Global AI Developer Hackathon, Indie Track** ([event](https://dev.meta.ai/events/global-hackathon), [Cerebral Valley](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)). The window is 26 Oct to 4 Nov 2026. **Submission is due 4 Nov, 9:00 PM ET = 5 Nov, 07:30 IST**: finish by the evening of 3 Nov IST. Until 26 Oct it was a six-person team project for the SIH 2026 internal college round (14 Sept), where the team was not selected. It is still a prototype. Work in this order:

1. the advice is correct for the inputs it is given;
2. nothing on screen claims more than the code can back, the model's role included;
3. a fresh clone can reproduce and verify the build;
4. polish.

Until 3 Nov IST, "demo path over refactors" applies again to new work. `docs/HACKATHON.md` holds the demo path, the built-before-vs-during note and the submission checklist.

**Decided by the owner:**

- **23 Sept 2026. Purpose: a portfolio piece, and mainly a B2B product** for NBFCs, MFIs, SHG federations, CSC operators and similar. **Real people will act on the output**, so correctness, data honesty, DPDP compliance and security are requirements, not polish.
- **Ownership: Aryan Verma** owns the project and the scheme data. `LICENSE` is proprietary, which conflicts with the hackathon's open-source rule (see **Legal** under Still open).
- **26 Oct 2026. Solo, and entered in the Meta hackathon.** Spend only the free Meta credits ($150), never pay, keep the account balance at ₹0.00: the app's spend cap enforces it for this app's calls (see Data protection).
- **The hyperlocal claim stays, backed by real data**: 20 sourced market rows for Lucknow and Varanasi from data.gov.in under GODL-India (`DATA_SOURCES.md`). `match_level` is the honesty marker for how local a figure is.
- **DPDP is in scope.** In a B2B deployment the client is the Data Fiduciary and we are its Data Processor. Never write "compliant", "secure", "anonymous" or "untraceable"; the Rules apply from 13 May 2027. What a deployer needs is in `docs/PROCESSOR_SCHEDULE.md`.

**Still open:** whether an on-screen non-affiliation line comes back or the government look goes, and what `/login` becomes.

**Repo:** `https://github.com/BU1lDR/ArthNiti` (**private** until the owner makes it public for the hackathon; renamed from `SIH_2026` on 26 Oct 2026, and GitHub redirects the old URL). The repo and folder name is ASCII `ArthNiti` because a path cannot reasonably be Devanagari; the product name in the app stays `अर्थNiti` (see `APP_NAME`).

> **Ask for explicit confirmation before any action that changes the GitHub repo**: push, PR, branch or tag creation or deletion, releases, settings, visibility, rename. Local commits are fine when requested. Approval for one push does not carry to the next. The earlier team members may still hold clones.

---

## Context hygiene (read first)

This file loads into every session and every subagent. **The long-form history — every defect, audit, measurement and the reason behind each rule — is in [docs/ENGINEERING_HISTORY.md](docs/ENGINEERING_HISTORY.md).**

- **Never read that file whole.** List its sections with `grep -n "^## \|^### " docs/ENGINEERING_HISTORY.md` and read only the one you need, using offset and limit. Where it disagrees with this file, this file wins, and its counts are not maintained.
- A code comment that says "see CLAUDE.md" for a long explanation points at a section of the history file.
- **Do not grow this file back.** Put a dated narrative ("what happened on X, and why") in the history file and keep only the resulting rule here. The original aim was under 40 KB; it was 42 KB before the hackathon sections and is about 48 KB now (`wc -c CLAUDE.md`), so trim before you add.
- Don't read a source file over about 300 lines in one go. Grep, then read a range. Redirect long command output to a file under `D:/tmp` and read the part you need.

---

## The docs, and which one wins

| File | Job | Audience |
|---|---|---|
| `README.md` | front door: what it is, how to run it, where things live | anyone with a fresh clone |
| `CLAUDE.md` (this file) | code view: the rules, current facts and traps | whoever edits the code next |
| `docs/ENGINEERING_HISTORY.md` | the archive: why each rule exists, measured at the time | read by section, on demand |
| `docs/frontend_integration.md` | the request, response and error contract of `POST /api/analysis/run` and the two intake routes | an engineer calling the API |
| `docs/PROCESSOR_SCHEDULE.md` | what is sent, held and logged; config; C1–C11, D1–D10; lawyer items | the client's technical and compliance staff, their lawyer, the deployer |
| `docs/HACKATHON.md` | the Meta entry: dates, built before vs during, where the model is used and where not, demo path, submission checklist | the owner, a judge |
| `OUR_MVP.md` | the product view: what is built and what is not | anyone who needs the product picture |

**Standing instruction: update `README.md` every time the MVP changes.** A change that adds a route, a language, a scheme tier, an endpoint, a verifier script or a dependency is not finished until the README reflects it. **README, CLAUDE.md and OUR_MVP.md state counts, and every count is measured, never carried forward.** When a count changes, `grep -rn "<number>" README.md CLAUDE.md OUR_MVP.md`. Measure with:

- `node tools/parity4.mjs` for the dictionary keys;
- `cd backend && ../.venv/Scripts/python.exe -m pytest tests -q` for the tests;
- `ls tools/*.mjs tools/verify/*.mjs | wc -l` for the scripts.

A doc that contradicts itself by one does not look broken. Readers take it as a puzzle and invent an explanation.

Stale docs: `frontend/README.md` is Vite boilerplate. `docs/requirements.txt` is unrelated to `backend/requirements.txt`.

### The model's job

The analysis has **no model**: every number and sentence of advice is hand-written Python `if`/`else` in `backend/app/services/`. The only model use is the optional **intake helper** (`/talk`, added for the Meta hackathon): Muse Voice Transcribe turns a recording into text and Muse Spark proposes form answers from it. It is off unless the server has `ARTHNITI_AI_ENABLED=true` **and** the build has `VITE_AI_HELPER=true`. Each answer carries the person's own words, `validate_extraction` drops one whose words are not in the transcript, and nothing reaches the form before the person has seen it. **A model never computes a figure, a risk band, a scheme match or the advice, and never sees scheme, market or advice data.** Say "AI-assisted intake", **never "AI-driven advice"**. Detail: `docs/HACKATHON.md` §3–§6, `OUR_MVP.md` §15.

---

## Running it

```bash
# Backend, from ./backend (venv at ./.venv, Python 3.14.6; floor 3.10)
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Frontend, from ./frontend
npm run dev      # Vite, port 5173, binds [::1]: use http://localhost:5173
npm run build    # into frontend/dist (gitignored); refuses unless VITE_API_BASE_URL is https://
npm run build:local   # the same build pointed at http://127.0.0.1:8000 (mode "loopback")
npm run lint     # ESLint 10
```

`ARTHNITI_ENV` defaults to `development`:

- **development** serves 8 routers and Swagger at `/docs`;
- **production** serves only `/health` and `/api/analysis/run`;
- with `ARTHNITI_AI_ENABLED=true`, both also serve the 2 intake routes (the 9th router).

The backend variables are in `core/settings.py`. The `VITE_*` ones are in `frontend/.env.example`; with none set, the build runs in demo mode. **The Meta helper spends the owner's free credits.** Read `docs/HACKATHON.md` §5 before setting `MODEL_API_KEY`; the README has the key entry and the capped three-call smoke test.

**Always clean up processes you start, by PID and never by image name.** A stray listener on 8000 gives `[Errno 10048]`, and a stray Vite gives confusing CORS failures. `netstat -ano | grep -E ':8000|:5173'`, then `taskkill //F //T //PID <pid>` (the slashes are doubled under Git Bash). Killing `msedge.exe` by image name also kills the owner's own browser.

The Bash tool's cwd persists between calls and every verifier resolves paths against the repo root, so prefix an explicit `cd` to it. Never pipe a driver through `| head` (`EPIPE` stops it before `report.json`); redirect to a file. `report.json` is the authority for a pass, not the terminal.

Never open or print `.env`. It holds the data.gov.in key. `.env.example` is the template.

---

## Architecture

```
backend/app/
  main.py               create_app(settings, model_client=None): CORS, the 422 handler (_public_error),
                        a response-validation handler, the log middleware; 8 routers in dev, 2 in
                        production, plus the intake router in both when the helper is on
  smoke_meta.py         `python -m app.smoke_meta`: 3 real Meta calls, prints the cost and the tokens
  core/                 settings.py (ARTHNITI_* env), processing_log.py (JSON lines on stdout),
                        data_loader.py (lru_cached JSON; the object is SHARED: read-only),
                        meta_client.py (the only code that calls Meta), spend.py (the spend ledger)
  api/routes/           9 routers, one file each
  schemas/              Pydantic request/response models; limits.py holds MAX_RUPEES (₹100 crore),
                        MAX_EMPLOYEES (10,000) and the string max_lengths (frontend/src/data/limits.js)
  services/             all business logic: pure functions, no classes, no I/O. intake_service.py
                        builds the helper's prompt and validates the model's answers; the call is in core/
  data/                 schemes.json (30 schemes, 7 tiers), market_data.json (20 rows),
                        market_data.provenance.json
  gen_schemes.py        the SOURCE of schemes.json; test_gen_schemes.py holds the two equal
backend/tests/          48 test files, conftest.py and 4 fixture modules (deployment, intake, market,
                        privacy); 1558 tests
backend/requirements.txt       every runtime dependency pinned, transitive ones too (no hashes)
backend/requirements-dev.txt   -r requirements.txt + pytest + httpx2 (httpx2 is correct, not a typo)
.github/workflows/ci.yml       pytest (3.10 + 3.14) + no-server frontend gates. written without being run (no Linux or Python 3.10 here): the Actions tab has the result
frontend/src/
  App.jsx               shell + JourneyBar + LandingPage + NotFoundPage + 12 routes + `*`
  audio/                record.js (microphone to a 16 kHz WAV, released on every exit path), wav.js
  config/               deployment.js (VITE_* notice values, DEMO_MODE, aiHelper), notice.js
                        (NOTICE_VERSION, NOTICE_KEYS, SENT_FIELDS)
  context/AppContext.jsx  the entire client state, in sessionStorage
  i18n/                 languages.js, LanguageContext.jsx (t / tBackend), backendText.js, noticeText.js,
                        brand.js (APP_NAME), and the dictionaries strings.js, resultStrings.js,
                        backendStrings.js, schemeStrings.js
  data/                 indiaLocations.js (36 states/UTs, 768 districts), limits.js, reviewDates.js,
                        talkAnswers.js (helper answers to form fields)
  pages/                11 page components
  components/           Button, BrandMark, BrandWordmark, Figure, HelperFilledBanner, InstructionManual,
                        ShortNotice, Charts, chartData.js
  services/api.js       the only module that touches the network
  index.css             design tokens + the .ui-* system + @media print
tools/                  verifiers (tools/verify/), parity4, keycheck, notice-version.json, market fetch;
                        screenshots/ is output only
```

**The backend has 9 routers. The frontend calls `POST /api/analysis/run`, and, only with the helper on, `POST /api/intake/transcribe` and `/api/intake/extract`.** The others, `GET /health` and `POST /api/{entrepreneur/profile, business/analyze, financial/analyze, schemes/match, advisory/recommend, market/context}`, are thin wrappers with tests. Don't delete them, and don't assume a change there reaches the UI. Production does not mount them.

CORS is `ARTHNITI_CORS_ORIGINS`, a list of exact origins (https-only and required in production; `*` refused in both modes). Unset in development, it is the loopback regex `http://(localhost|127\.0\.0\.1)(:\d+)?`. Credentials off, GET and POST, `Content-Type` only.

**Routes:** `/` → optional `/login` → `/profile` → `/business` → `/location` → `/finance` → `/analysis`, `/schemes`, `/advisory`, `/report` (print view), plus `/privacy` (the full notice), `/talk` (the helper; with `VITE_AI_HELPER` off it falls to `*`) and `*` → `NotFoundPage`. `/login` asks only for a name, authenticates nothing and has no password. Nothing guards the journey order, so `/finance` can be submitted empty and gets a 422, which `api.js` renders as a sentence. The analysis call fires on the `/finance` submit, and only with the consent box ticked.

### Chrome

The look is deliberately modelled on Indian e-governance portals. `AppShell` renders, in order:

- skip link;
- utility bar, **tools only**: language, dialect, text size, theme and start-over;
- masthead: lotus mark, the `अर्थNiti` wordmark, tagline, login;
- tricolour rule, nav bar;
- `<main id="main" tabIndex={-1}>`, holding the breadcrumb (not on the landing page), the journey progress (journey and result pages) and the page;
- three-column footer (brand, journey links, `common.helpTitle`/`helpText`);
- a bottom line with `common.disclaimer`, `common.schemesChecked` and the `common.privacy` link to `/privacy`.

**If you change what AppShell renders, edit this list.** Nothing checks it.

- **The prototype notice was removed at the owner's instruction (8 Sept)**; `manual-audit.mjs` fails if `.ui-prototype-pill` returns, and it does not come back without the owner. `mk.notEndorsed` is a different thing, a GODL-India licence condition, and stays with `common.disclaimer`, `common.schemesChecked`, the market attribution and `mk.warranty`. The demo-mode `notice.demo` lives only in `ShortNotice`.
- **High contrast mode was removed at the owner's instruction (8 Sept).** Two presentation switches remain on `<html>`: `data-theme="dark"` (`sih-theme`) and `--ui-scale` (`sih-textsize`: 0.94, 1 or 1.18, multiplying the browser's own size). Everything in `index.css` has to work under both. Sizes that should scale use `rem`, and `0.75rem` at the 0.94 scale is under the 12px floor.
- **The outbound government links were removed at the owner's instruction (10 Sept)**, a legal call. Schemes carry no `official_url` (tests assert it); `gen_schemes.py` keeps the URLs as internal citations. Market attribution URLs print as plain text, never `<a>` (`market-ui.mjs` checks). The only outbound links are the Fiduciary's own URLs on `/privacy`, which Rule 3 requires.
- **The product name is `APP_NAME` in `i18n/brand.js`: `अर्थNiti`, mixed script, never translated, never `ArthNiti`.** A sentence that names the product uses an `{app}` placeholder (`login.title`); the notice does the same with `{fiduciary}`, `{contact}` and `{days}`. Putting the brand string into all 8 dictionaries would fail parity4's identical-to-English check by design.
- **The wordmark colours are themed.** `--wordmark-*` has a light case (`:root`) and a dark case, because the masthead's surface is themed. Never hardcode a hex in a component. The `--mark-*` tokens drive `BrandMark`. `public/favicon.svg` is the one file with hardcoded hexes.

### Client state (`AppContext.jsx`)

Everything lives in **`sessionStorage['sih-application']` as `{v: STORAGE_VERSION, data}`**, on purpose: on a shared laptop, financial answers must not outlive the tab. `profile` = name, language, dialect. State and district live only on `location`. `location.marketType` is an array.

- **`STORAGE_VERSION` is 5, and `READABLE_VERSIONS` is {1, 2, 3, 4, 5}.** Bump the version whenever `EMPTY`'s shape changes (5 added `aiFilled`). A bump that **renames or moves** a field must drop the older versions from the set.
- **`hydrate()` merges section by section over `EMPTY`**, `pick()` drops keys `EMPTY` no longer has, and `result` passes through untouched. A field left `undefined` would silently turn a controlled input into an uncontrolled one.
- **`isStarted(data)` is a difference from `EMPTY`, not a truthiness test**, because several defaults are not blank ('rural', 'Hindi', 0). `marketType` needs its own arm.
- **Start over** (↺) opens a native `<dialog>` via `showModal()`, with No first and focused. Yes runs close → `resetApplication()` → `navigate('/')` → focus `#main`. `resetApplication` leaves `{v: STORAGE_VERSION, data: EMPTY}` in storage and does not touch localStorage.
- **Editing `business`, `location` or `finance` clears the result**, except the `LOCAL_ONLY` fields (businessName, village, marketType, customers), which never leave the tab (`updateSection` sets `result: null`, and `resultCleared: true` if a result was thrown away). `profile` is deliberately excluded, because switching language must never discard results. `updateSection` returns the same object when nothing changed, which is a guard, not an optimisation. The empty result pages show `res.changed*` when `resultCleared` is set, and their button goes to `firstUnansweredStep(data) ?? '/finance'`.
- **A request in flight cannot overwrite newer answers** (`FinancePage`): the earlier request is aborted; `answersKey(payload)` covers every sent field (the consent record is added after it), and if the answers changed the response is dropped and `finance.changedWhileChecking` is shown; the page navigates only if the path is unchanged. `api.js` combines the caller's signal with the 20 s timeout through `AbortSignal.any` and tells them apart by which signal fired.
- **The consent, age and zero-income ticks live in `FinancePage` state only**: not in `EMPTY`, not in sessionStorage, not in `answersKey`. `/talk` has its own consent and age ticks, in `TalkPage` state only.
- **`aiFilled`** lists the form paths the helper filled (`applyHelperFill`, `fillFromHelper`). `applyEdit` drops a path once the reader edits it, and `HelperFilledBanner` shows on a form page that received an answer. It never leaves the tab and is not part of `isStarted`. The helper writes string values and never writes a household income of 0.
- localStorage holds UI preferences only: `sih-language`, `sih-dialect`, `sih-theme`, `sih-textsize`. `sih-contrast` is inert.

### i18n

**8 languages:** `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn`. **`DEFAULT_LANGUAGE` is `hi`.** Four dictionary files, merged in this order by `merge()` in `strings.js`, so a later file wins:

| File | Keys × 8 | Holds |
|---|---|---|
| `strings.js` | 222 | chrome, landing, the four form steps, `notice.*`, `consent.*`, `errf.*` |
| `resultStrings.js` | 303 | result pages, `/login`, `/privacy`, `/404`, the helper page (`talk.*`, 40 keys), the enum→label targets (`st.*`, `risk.*`, `lvl.*`, `lvlnote.*`) |
| `backendStrings.js` | 59 | sentences a **Python service composes** (`adv.*`, `obs.*`, `rsn.*`, `sum.*`, `nxt.*`, `why.*`, `src.*`, `cmd.*`, `mknote.*`) |
| `schemeStrings.js` | 188 | prose **typed into schemes.json** (`sdata.*`, `elig.*`, `doc.*`, `scat.*`) |

**772 keys, 6,176 strings** (measured 27 Oct 2026). No key may be defined in two files, so **the per-file counts must add up to the total exactly**. A difference of one means a number is wrong.

- **`node tools/parity4.mjs`** runs 9 checks and exits 1 on a failure: every `en` key in every language; no duplicate key; no key in two files; no non-English value identical to English; placeholders and digit runs match English; no non-ASCII digits; `schemeStrings` figures match `schemes.json`; the notice hash (see Data protection). `DIGIT_ALLOW`/`SOURCE_ALLOW` entries carry a reason, and one no longer needed fails the run. **`node tools/keycheck.mjs`** checks that every key the code uses exists and flags leaked keys, untranslated codes and unmapped enums (6 keys are unreferenced, on purpose). Run both after touching a dictionary.
- **`t(key)`** falls back from the dialect to the language to `en` to **the key itself**, so a typo shows up on the page as a dotted name. **`tBackend(code, english)`** falls back to the backend's English and never prints a code.
- **Never compose a sentence in JSX.** `t('a') + ' ' + value + '.'` puts English word order and a Latin full stop into Devanagari. Give the whole phrase its own key with `{placeholders}`. Punctuation is included: a label that needs a colon gets its own `…Label` key.
- Placeholder filling is plain string replacement, with no plural rules and no number formatting. **Digits stay Latin, and money is grouped `en-IN` in every language.**
- **Dialects** are a curated phrase layer covering 9 of 30 varieties, not translations. Say "dialect-aware phrasing". `setLanguage` clears the dialect.
- **Translation codes:** every generated sentence carries a code, resolved in one place: `useBackendText()` in `backendText.js`. **`eligibility_codes`/`eligibility_rules` and `document_codes`/`documents` are index-aligned.** The test checks only that each pair is the same length, so an insertion at the wrong index reads fluently, is wrong, and needs to be checked by eye.
- **Enums stay English internally** (`financial_status`, `risk_level`, `feasibility_status`, `match_level`, `level`, `fit_basis`, `household_check`) and are mapped to labels at render time. **Category and location-type values sent to the backend must stay English.** Only the label is translated.
- **No native speaker has reviewed any non-English wording**, the 40 `talk.*` keys included (their 7 non-English sets are machine-written). Two real errors have already been found by eye.
- **Dropdown:** `handleStateChange` clears `district`. `districtsForState` returns `[]` for an unknown state.

---

## The data contract

**Request: `UnifiedAnalysisRequest`** (`schemas/analysis.py`).

- **Required:** `business_category` (at least 2 characters), `state` (at least 2), `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `monthly_emi`, `initial_investment` and `monthly_operating_expenses` (all ≥ 0).
- **Optional:**
  - `existing_debt` 0;
  - `district` "";
  - `location_type` "rural";
  - `household_monthly_income` None;
  - `consent` None, which is required when `ARTHNITI_REQUIRE_CONSENT` is on.
- **`IGNORED_FIELDS` are accepted, validated and capped for other callers, then dropped by the route.** They are `employees`, `village`, `market_type`, `customers`, `user_language`, `preferred_dialect`, `literacy_level` and `entrepreneur_type`. The UI sends none of them. It sends exactly the 12 fields in `SENT_FIELDS`, plus `consent`.
- **`household_monthly_income`: None means "not asked", never 0.** A 0 is a real answer, a household with no income, and it puts any repayment over the limit. `FinancePage` sends `null` when the field is blank.
- **Every number is capped:** `le=MAX_RUPEES, allow_inf_nan=False`, and `employees` `le=MAX_EMPLOYEES`, on all five request models, and every `str` field has a `max_length` from `limits.py` (`test_string_limits.py`). `test_input_bounds.py` reads the routes from OpenAPI and fails if `limits.py` and `limits.js` disagree.
- **A 422 `detail` is a list of `{type, loc, msg}`** (`_public_error` strips `input` and `ctx`). `loc` must stay, because `readError` in `api.js` names the field from its last element through `FIELD_LABELS`. **Each label echoes the wording of the question** that collects the field ("the money you already have", never "available capital"). The `errf.*` translations follow the same rule.

**Response: 7 top-level keys** (`analysis_service.py`): `financial_analysis`, `risk_analysis` (19 keys), `business_analysis`, `market_context` (a list), `scheme_matches` (a list of 16-key entries), `advisory` and `mvp_summary` (7 keys).

- **`docs/frontend_integration.md` lists every key and enum. Update it with any change to them.**
- Contract tests subscript the keys, so a *removed* key fails and an *added* one passes silently. To confirm the current set, call the service and print the keys.
- `household_check_without_new_loan` drives advice and is not rendered.
- Scheme entries carry no `official_url`. Market rows carry no `local_context`, and `mvp_summary` echoes nothing the UI does not send.

**`match_level` is the honesty marker.** Never render a `state` row as local.

**A `response_model` filters silently.** A key added to a service is dropped from a typed route until the model declares it. That is how `match_level` once disappeared.

`monthly_expenses` drives `monthly_profit`, and `monthly_operating_expenses` drives `monthly_operating_surplus`. They are separate inputs and can disagree. `money.left` is the surplus before EMI; `money.leftAfterEmi` is the surplus after it. Never label the two alike.

### Formulas (all deterministic, all unit-tested)

**Profit and investment**

- `monthly_profit = revenue − monthly_expenses`. Margin is `None` when revenue is 0 (not 0%), and the same holds for `operating_margin_percent`.
- `funding_gap = max(initial_investment − available_capital, 0)`.
- `estimated_roi_percent = operating_surplus × 12 / investment × 100`, or `None` when investment is 0.

**Repayment pressure**

- `pressure_ratio = total_monthly_emi / monthly_surplus × 100`, where `total_monthly_emi = monthly_emi + estimated_new_emi`.
- `estimated_new_emi` prices the funding gap as a loan at an assumed **12% a year over 60 months** (annuity). The pages say it is an assumption (`ch.pressureIncludesNew`).
- Bands: **under 30 low, 30–50 moderate, over 50 high**, classified on the *rounded* figure. A surplus ≤ 0 gives `high` with a `None` ratio.
- **`existing_debt` is excluded**: it is the principal of the loan `monthly_emi` already repays.

**Household check** (RBI Master Direction on microfinance loans, 2022, paras 5.1–5.3 and 3.1; Annex I)

- `household_repayment_percent = total_monthly_emi / household_monthly_income × 100`.
- Over 50 is `over_limit`; exactly 50 is `within_limit`. A `None` income gives `not_checked`. An income of 0 gives `over_limit` if any EMI is paid.
- `household_in_microfinance_range` = income × 12 ≤ ₹3,00,000 (`None` when there is no income).
- It is computed before the surplus early return.
- **Never call a result RBI-compliant, and never say a lender will lend** (`ch.householdEstimate`). Above ₹3 lakh a year, `ch.householdRbiNotCovered` applies.
- **Who counts as the household for an unmarried adult is our own reading of RBI**, and nobody has checked it.

**Summary, next step and advice**

- **Status chain** (`mvp_service`): profitability first, then risk moderate or high, then household `over_limit`, then a funding gap on a profitable, feasible plan (`sum.needsFunding`), then `review`.
- `good` requires profitable, feasible, low risk, no gap and a household check that is not `over_limit`.
- **Next step:** not profitable, then risk high (`nxt.gapTooLarge` when only the gap loan tips it over), then household (`nxt.householdNewLoanOver` / `nxt.householdOverLimit`).
- **Advice:** `adv.maintainExpand` and `adv.healthyMargin` are withheld while there is a funding gap or the household check is `over_limit`. `not_checked` adds no advice.
- `POST /api/advisory/recommend` prices no gap loan, so it can disagree with the unified endpoint.

**Scheme matching**

- **Score:** +60 for a category match, then +40 if the scheme names the reader's state or +30 if it is nationwide. Only 90 and 100 can occur, and **the score checks no eligibility rule, so it is never printed as a percentage.**
- Cards print `fit_basis` through `fitLabel()`:
  - `state`, when the scheme's `states` list is only the reader's state: "Made for your state";
  - `region`, when the list names several states including the reader's: "For a few states, including yours";
  - `national`, when the list is `ALL`: "For all of India".

  `drive.mjs` fails on a `90%` or `100%` on a card. Don't bring the percentage back anywhere.
- **Availability gates come before scoring:** `serves_state` and `serves_location` filter on `states` and `location_types`. **An empty user value means "do not filter".** Don't merge the two functions.
- **Sort** by `(-match_score, level_rank, name)`. `LEVEL_ORDER` in `backendText.js` mirrors `LEVEL_RANK`.
- **Category matching** is **`if scheme_category in phrase`**: the scheme's word must be a substring of the user's phrase. `CATEGORY_SYNONYMS` bridges wording only and must never widen eligibility (`dairy → poultry` exists so the Livestock button reaches NLM); the map is walked once, not recursively. A scheme must never claim `livestock` or `other` as a category (there is a test), and plain `agriculture` maps to nothing.

**Market context**

- The lookup takes the reader's own district's `scope:"district"` rows first, then that state's `scope:"state"` rows (as `match_level:"state"`), then `[]`. **Another district's row is never returned.** Don't widen the fallback; grow `tools/market-crosswalk.json` and fetch again.
- **All 20 rows are Lucknow ×10 and Varanasi ×10, in UP.** Agriculture gets 3 mandi prices per district (the median over the last 30 reporting days, with a P10–P90 range). The other 7 category buttons get one Udyam count each (Lucknow tailoring: 5,826 of 249,493), suppressed under 10. There are no poultry rows, and every other district shows the empty state.

### The scheme dataset

**30 schemes across 7 tiers.** `LEVEL_RANK` runs from 0 to 6: `central`, `state`, `regional`, `district`, `sub_district`, `block`, `local_body`.

- **`location_types`:** 25 schemes are `ALL`. Four are `["rural"]`: Vibrant Villages, RSETI, the BDO/NRLM desk and the Gram Panchayat licence. PM SVANidhi is `["semi-urban","urban"]`.
- `/schemes` groups cards by tier with `lvl.*` and `lvlnote.*` headings. `/analysis` and `/report` show flat lists with a `sch.runBy` badge.
- **Field-name trap:** the file key is `business_categories`, and `_scheme_index()` renames it to `categories`, stored as an ordered tuple because the matcher does a substring test. `target_segment` exists on every scheme and nothing reads it.
- **To change the dataset, edit `SPEC` or `LOCATION_TYPES` in `gen_schemes.py` and run it from `./backend`.** Hand edits to `schemes.json` fail `test_gen_schemes.py`. New codes need all 8 `schemeStrings.js` entries added by hand; keycheck reports any that are missing.
- **No single input reaches all 7 tiers; the maximum is 6.** States with their own scheme and states reached by a regional scheme do not overlap.
- **Demo-safe input:** tailoring, handicrafts or food processing in UP / Lucknow gives 14–16 schemes across 6 tiers, both UP fit labels (so the chart renders) and a district market row. Agriculture gives 11 schemes plus 3 mandi prices.

### Data protection

`docs/PROCESSOR_SCHEDULE.md` tells a deployer what is sent, held and logged. Keep it true.

- **The notice text is versioned.** Editing any of the 60 `NOTICE_KEYS` in any language, or reordering `SENT_FIELDS`, fails parity4 check 9. Fix it by bumping `NOTICE_VERSION` and recording the printed hash in `tools/notice-version.json`. Commit `notice.js`, that JSON and the dictionaries together.
- **A new request field goes in `SENT_FIELDS`, with an `errf.*` label in `FIELD_LABELS`, or in `IGNORED_FIELDS`.** `test_notice_sent_fields.py` enforces this. Either way the field changes every payload code, so redo the schedule's test vector (§4.3).
- **Only the consent record reaches a log from a request body.** `path` is the route template or `"unmatched"`. Extend `test_log_privacy.py` for any new field or route.
- **Never call the payload code anonymous.** It is pseudonymous.
- **A field the backend never reads must not claim to shape the result** (`form.localOnly`).
- **`settings.py` refuses a bad value at startup.** Add no silent fallback.
- **The server records `age_confirmed` and does not enforce it.**
- **The helper sends the person's words to Meta and nothing else** (typed text, or a recording of up to 60 s). `talk.sendsText` says so before use, free-credit data use included. Meta is a new processor and a cross-border transfer (`PROCESSOR_SCHEDULE.md` §10). The helper routes keep no text and record no consent (`test_intake_log_privacy.py`).
- **Every Meta call is charged to the spend ledger first** (`core/spend.py`, worst-case cost) and refused once the total would pass `ARTHNITI_AI_SPEND_CAP_USD` (default $10, at most $100, never the whole $150). It fails closed, counts this app's calls only, and deleting the file resets it. `settings.py` refuses `-contributor` models, which let Meta train on content. Add no Meta call that bypasses `MetaClient`.
- **Never write a Meta key into a file, test, doc, log or message.** Environment only; the backend reads no `.env`. Tests use fake keys, and `conftest.py` fails any test that connects off this machine or writes the real ledger.

---

## Conventions

**Backend**

- Plain module-level functions, no classes. Type hints on parameters, none on returns.
- Services return plain dicts and round with `round(x, 2)`.
- One router file per domain, `APIRouter(prefix="/api/<domain>")`. Services never touch FastAPI; routes never do arithmetic.
- **`None < 10` is a TypeError**: guard every comparison on a field that can be `None`.
- **Never mutate what `load_json` returns.** It is a shared cache. Each data file has a poisoning test; add one for any new service that reads it.

**Frontend: code**

- Function components, no TypeScript, no prop types. Helper components go at the bottom of the page file that uses them.
- **Formatters are duplicated per page on purpose, so they drift.** A negative amount prints as `-₹5,000` (sign before the symbol) in all four copies: `AnalysisPage`, `AdvisoryPage`, `ReportPage` and `FinancePage`'s `rupees`. Change one, change all four. (`TalkPage`'s `valueText` is a fifth copy that only ever prints non-negative amounts.)
- **Guard numbers with `hasNumber(value)`, never with `Number.isFinite` alone.** `Number(null)` is 0, so a backend `None` would render as a confident `0%`. Five numeric fields can be null: `pressure_ratio_percent`, `estimated_roi_percent`, `profit_margin_percent`, `operating_margin_percent` and `household_repayment_percent`. Also `household_in_microfinance_range` (a boolean), for which only a strict `true`/`false` prints. A real 0 still prints as 0.
- **Every UI string goes through `t()`.** Decorative glyphs get `aria-hidden="true"` (`glyph-audit` expects exactly 3 documented hits).
- ESLint's `preserve-caught-error` requires `{ cause }` when rethrowing.

**Frontend: CSS**

- **Colours always go through `var(--color-*)`**, never a hex.
- **`Button` takes `variant` (primary/secondary), `size` (md/lg) and `to`, and never colour or padding classes**: two utilities for one property resolve by stylesheet order. Never nest a `<Button>` in a `<Link>`; use `to`.
- **Cascade layers:** unlayered author CSS beats every `@layer`, whatever the specificity. Nearly every `.ui-*` rule is unlayered, so it beats Tailwind utilities (`.ui-notice`'s `display:flex` beats `print:hidden`), and the `:focus-visible` outline is unlayered on purpose. `@layer components` holds only the default card padding, and a rule a call site should be able to override goes there; element resets sit in `@layer base`.
- **Tailwind:** it uses `@import "tailwindcss" source(none)` plus `@source` rules. Tailwind generates classes from *prose*, so never write a class-shaped literal in a comment under `src/`.
- **Print:** `@media print` at the end of `index.css`. Every card needs to be in the `break-inside: avoid` list, and the token reset covers the *whole* palette.
- **Motion:** use `--motion-fast`, `--motion` and `--motion-ease`, never a literal duration, and name the transitioned properties, never `all`. An undefined token silently deletes the whole declaration. The `prefers-reduced-motion` guard must stay in `@layer base`, because an unlayered `!important` is the weakest important. Never ease `.ui-skip-link`, or `font-size` on `.ui-unit-chart`.
- **Charts** are hand-rolled in `Charts.jsx`, not a library, and always print the figure as text next to the bar. `BarGroup` draws no bar for a negative value and shares one maximum across the group. The scheme-fit chart has one bar per `fit_basis` (`chartData.js` `schemeFitItems`) and returns `[]` for fewer than 2 groups.
- **Phones:** 44px tap targets under `pointer: coarse` and ≤ 640px. The nav wraps on desktop and scrolls on phones.
- **A figure must never wrap mid-number** (the cards set `overflow-wrap: anywhere`). `.ui-bar-value` sets `word-break: keep-all`; a tile or hero figure goes in `<Figure>`, which shrinks to fit the nearest `@container`. The /analysis hero is `max-lg:@container`: containment collapses its `auto` column at lg.
- **`.ui-field`** keeps the controls in a grid row aligned. `.ui-required::before` inserts U+2060 so the asterisk never orphans.

**Frontend: behaviour and copy**

- **Scroll:** `useOpenAtTop()` in `App.jsx` uses a layout effect with `behavior:'instant'`, bails out when there is a hash, and sets `scrollRestoration = 'manual'`. Run `scroll-audit` after adding anything that navigates.
- **Copy is written for low-literacy readers:** plain language, and detail inside `<details className="ui-disclosure">`. Every page has a back link and a "Step N of 4" marker. Don't turn labels into financial jargon in any language.

Deliberately not added, and still decided: a charting library, an i18n library, localStorage for financial answers. Still open: a frontend test framework and route guards.

---

## Tests and verifiers

```bash
python -m pip install -r backend/requirements-dev.txt
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q      # 1558 passed, ~13s
```

- **The backend is tested with pytest.** The frontend has no test framework; `node --test` covers three pure modules (below) and the browser gates cover the pages. Some tests pin user-visible wording, so edit them together with a copy change.
- **When you add a branch, add a test proving a real request can reach it**, a sweep through `run_unified_analysis`, and not only a unit call.
- Market tests bring their own rows from `tests/market_fixtures.py`; Meta tests use the fake model client in `tests/intake_fixtures.py`.
- `conftest.py` pins `ARTHNITI_ENV=development`, clears the other `ARTHNITI_*` variables and `MODEL_API_KEY`, and blocks any connection that is not to this machine and any write to the real ledger (`test_network_guard.py`; it covers blocking sockets, not asyncio on Windows). Build a production app with `create_app(load_settings({...}))`.
- Verifiers that submit `/finance` tick the consent box first.

**No server needed:** `node tools/parity4.mjs`, `node tools/keycheck.mjs`, `node tools/verify/glyph-audit.mjs`, and `node --test` on `tools/verify/market-lib-test.mjs` (185 tests), `talk-lib-test.mjs` (45, the answer mapping and the WAV encoder) and `app-state-test.mjs` (22, the stored state). The two newer ones load JSX through Vite's `ssrLoadModule`.

**Backend up:**

- `node tools/verify/refresh-cases.mjs` regenerates the `case_*.json` fixtures. Run it after any change to services, schemas or data. The fixtures are untracked and go stale silently.

**Vite up** (`http://localhost:5173`): the browser gates. `drive` (8 passes / 41 loads: leaked keys, `null%`, `NaN`, raw enums, the fit label), `mobile-audit`, `print-audit`, `text-align`, `field-align`, `lang-layout`, `motion-audit`, `hero-art`, `brand-mark`, `manual-audit` (it includes the no-pill check), `market-ui` (it starts its own Vite on 5179), and `error-banner`, `scroll-audit` and `figure-audit`, which also need the backend. **`talk-ui`** needs neither: it starts its own backend (8012, `tools/verify/talk_fake_backend.py` with a fake model client, so it never reaches Meta), three Vites (5182–5184) and Edge (CDP 9379, fake microphone), runs scenarios S0–S15 of `/talk` (`--only=S15` runs one) and kills all of it by PID. Each gate has its own CDP port and Edge profile, and `tools/README.md` says what each checks. They drive Edge at a hardcoded Windows path, so they are Windows-only and not in CI.

- **`--broken` must exit 1:** `scroll-audit`, `text-align`, `field-align`, `market-ui`, `figure-audit` (`=split|over|tiny`) and `motion-audit`.
- **Exit 2 is an instrument fault, never a finding or a pass:** a crash, the wrong cwd, a server or Edge down or lost, a page with nothing to measure, a refuter that missed, or a seed the app discards (it measures clean as a blank page). The seeding scripts refuse a `SEED_VERSION` outside `READABLE_VERSIONS` and fail an empty result route as `UNSEEDED`. `drive` seeds v2 on purpose, for its hydrate check. Only `market-lib-test` (`node --test`) exits 1 on a crash. Details: `tools/README.md` § Exit codes. A `report.json` starts with `exit`; a run stopped by a thrown fault leaves none.
- **Reports only:** `hero-geom`, `hero-vibrance` and `load-perf`'s timings. `load-perf` needs `npm run preview` on 4173 and exits 1 only when the app does not mount.
- `art-contrast.mjs` is retired (it exits 2). **Port 9369 is kept free for one-off probes.**

Traps:

- **When a new check reports zero, break the thing it watches on purpose and confirm it fires.** When a check *passes* under its refuter, find out why.
- **A "nothing was sent" check must watch the page's own requests** (`talk-ui` hooks `fetch` in the page): the fake backend logs a call only when the model client is reached, and the real routes reject an unusable WAV with a 422 before that. `talk_fake_backend.py` must track the real client's signature (`test_talk_fake_backend.py` guards it).
- **A recording that is stopped at once is sometimes reported unusable** (`talk.errRecording`): 3 of 40 runs of `talk-ui` S15 without a pause before Stop, 0 of 40 with a 1.2 s pause (too few for significance; `docs/HACKATHON.md` §7). A browser check that records waits before it presses Stop, and a wait for a state the page owes the reader is soft (`settleSnap`, which reports) and not a never-ending wait (a fault).
- `drive` reads `innerText`, so it cannot see inside a closed `<details>`. Verify changes there with a probe that opens every disclosure first.
- Edge's `--user-data-dir` must be an absolute path. Create your own target through `Target.createTarget`.
- Keep `process.exitCode = 2` first in every verifier, and never `process.exit()` just after a `fetch()` (Node 24 aborts, 127); use `crashExit()`.

`tools/fetch-market-data.mjs` refetches the market rows. It is a dry run unless `--write` is passed, and it reads the key from `.env`. `script_sha256` hashes `market-lib.mjs` + `fetch-market-data.mjs`, which `.gitattributes` pins to LF, so don't edit either without refetching.

---

## Still open

**Advice and data:** a household income of 0 needs a tick and then gives "do not take a new loan"; the household income is self-reported; the pressure figure errs high when another earner pays their own loan; **no eligibility rule is evaluated anywhere** (`sc.eligUnchecked` says so on the page); `stale` is decided at fetch time; the Udyam counts cannot be reproduced; the scheme rules have no re-check schedule (the footer date and `test_review_dates.py` are the only guard); there is no helpline number.

**Build and verification:** the verifier gaps (Edge leaks, unrefuted arms, narrow coverage, slow blank-page 2s) are in the history section "Verifier exit codes". The dependencies have no hashes. `backend/venv/` is stale; `.venv` is in use. The print PDF and the `api.js` timeout have not been clicked through by hand. Phones: landscape, real touch and the on-screen keyboard are unverified.

Also open, stated where they apply: the household definition, market coverage, dialect coverage and the translation review, CI written without being run, the Windows-only gates.

**Meta helper** (the full list is `docs/HACKATHON.md` §8): nothing has run against the live API until the owner's first `python -m app.smoke_meta`, so `MAX_COMPLETION_TOKENS`, the reasoning effort, `prompt_cache_key` and the speech `keywords` are as documented, not as observed. The helper routes have no authentication, no per-user limit and no consent record (the ledger and the hourly limit are the only brakes), and `/privacy` says nothing about the helper (`PROCESSOR_SCHEDULE.md` §10.5). No `safety_identifier` is sent and zero data retention is not requested. Malayalam has no speech model (typing works) and Meta has no text-to-speech. `talk.errRecording` says "speak for less than a minute" even for a recording that was too short.

**Legal:** the hackathon asks for open-source, public entries and `LICENSE` is proprietary. The owner has to choose a licence or ask the organisers; nothing is changed. The September build has commits by Manjeet and Netra and no written assignment on file; the owner's position (26 Oct 2026) is that none is needed, which is a legal question and not a code one. The Official Rules are behind a login and have not been read.

**DPDP** (the full list is `docs/PROCESSOR_SCHEDULE.md` §9):

- **S16:** no native speaker has reviewed the 60 notice keys in the 7 other languages. This blocks shipping a non-English notice.
- **S17**, deferred to the next refetch: the Udyam fetch does not reject fields it did not request. The two fetch scripts are frozen by `script_sha256`.
- The app has no rate, body-size or `Host` check and no HSTS, which leaves them to the proxy. It deletes no logs.
- uvicorn sends `server: uvicorn` unless started with `--no-server-header`. Its access log (IP address, query string) is on unless started with `--no-access-log`.
- stderr tracebacks have not been audited for answer values.
- The lawyer items are listed in §9.3 of the schedule.

---

## Git

- **History is one line on top of `4a2307e`**, pushed as three branches that sit on it: `feature/dpdp-compliance` (the September DPDP work, the verifier work and the brand-asset files, uncommitted until 27 Oct), `feature/security-hardening` (adds the Meta client, the spend cap and the network guard) and `feature/voice-assistant` (the tip: the `/talk` page, its i18n, the verifiers and the docs). The commit titled "chore: the project as it stood at the hackathon start" is the 12:00 PM ET start of the hackathon on 26 Oct 2026; `docs/HACKATHON.md` §2.3 shows how to diff against it. The other `feature/*` branches are empty placeholders.
- **The remote has two other branches, `before-main` and `main`.** `origin/main` is still the old scaffold, and the finished code reaches it by a pull request or by changing the default branch, which is the owner's step. Compare `origin/` refs, not local names: local `main` carries unpushed scaffolding commits.
- Never commit to `main`. **Commit messages carry no Co-Authored-By line and no Claude attribution.**
- The brand-asset changes dated 13 Sept (`tools/assetgen.mjs`, `frontend/src/assets/README.md`, two regenerated lockups, and the two `arthniti-wordmark-on-*.png` files) are the owner's and have their own commit. Keep them out of other commits.
- Ignored: `.venv/`, `venv/`, `node_modules/`, `dist/`, `.env*` except `.env.example`, `.claude/`, `screenshots/` (verifier output, 8 GB) and `.market-cache/`.
- **Team:** none. Aryan Verma works alone since 26 Oct 2026; the September build had six contributors (`DATA_SOURCES.md`, People).

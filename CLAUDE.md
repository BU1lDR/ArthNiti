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
- **Ownership: Aryan Verma** owns the project and the scheme data. `LICENSE` has been MIT since 29 Oct 2026 (the hackathon wants a public, open-source entry); the GODL-India rows, NECC egg prices and `hero-backdrop.jpeg` are outside it (README, **Licence**).
- **26 Oct 2026. Solo, and entered in the Meta hackathon.** Spend only the free Meta credits ($150), never pay, keep the account balance at ₹0.00: the app's spend cap enforces it for this app's calls (see Data protection).
- **The hyperlocal claim stays, backed by real data**: 125 sourced market rows for 13 districts from data.gov.in under GODL-India (`DATA_SOURCES.md`). `match_level` is the honesty marker for how local a figure is.
- **DPDP is in scope.** In a B2B deployment the client is the Data Fiduciary and we are its Data Processor. Never write "compliant", "secure", "anonymous" or "untraceable"; the Rules apply from 13 May 2027. What a deployer needs is in `docs/PROCESSOR_SCHEDULE.md`.

**Still open:** whether an on-screen non-affiliation line comes back or the government look goes, and what `/login` becomes.

**Repo:** `https://github.com/BU1lDR/ArthNiti` (**public** as of 28 Oct 2026, switched by the owner, so anything pushed is published at once; renamed from `SIH_2026` on 26 Oct 2026, and GitHub redirects the old URL). The repo and folder name is ASCII `ArthNiti` because a path cannot reasonably be Devanagari; the product name in the app stays `अर्थNiti` (see `APP_NAME`).

> **Ask for explicit confirmation before any action that changes the GitHub repo**: push, PR, branch or tag creation or deletion, releases, settings, visibility, rename. Local commits are fine when requested. Approval for one push does not carry to the next. The earlier team members may still hold clones.

---

## Context hygiene (read first)

This file loads into every session and every subagent. **The long-form history — every defect, audit, measurement and the reason behind each rule — is in [docs/ENGINEERING_HISTORY.md](docs/ENGINEERING_HISTORY.md).**

- **Never read that file whole.** List its sections with `grep -n "^## \|^### " docs/ENGINEERING_HISTORY.md` and read only the one you need, using offset and limit. Where it disagrees with this file, this file wins, and its counts are not maintained.
- A code comment that says "see CLAUDE.md" for a long explanation points at a section of the history file.
- **Do not grow this file back.** Put a dated narrative ("what happened on X, and why") in the history file and keep only the resulting rule here. The original aim was under 40 KB; it was 42 KB before the hackathon sections. `wc -c CLAUDE.md` gives the size now, so trim before you add.
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

**Standing instruction: update `README.md` every time the MVP changes.** A change that adds a route, a language, a scheme tier, an endpoint, a verifier script or a dependency is not finished until the README reflects it. **README and CLAUDE.md state counts, and every count is measured, never carried forward.** When a count changes, `grep -rn "<number>" README.md CLAUDE.md`. Measure with:

- `node tools/parity4.mjs` for the dictionary keys;
- `cd backend && ../.venv/Scripts/python.exe -m pytest tests -q` for the tests;
- `ls tools/*.mjs tools/verify/*.mjs | wc -l` for the scripts.

A doc that contradicts itself by one does not look broken. Readers take it as a puzzle and invent an explanation.

Stale docs: `frontend/README.md` is Vite boilerplate. `docs/requirements.txt` is unrelated to `backend/requirements.txt`.

### The model's job

The analysis has **no model**: every number, risk band, scheme match and sentence of advice is hand-written Python `if`/`else` in `backend/app/services/`. The model is used in two optional places, both off unless the server has `ARTHNITI_AI_ENABLED=true` **and** the build has `VITE_AI_HELPER=true`, both added for the Meta hackathon:

- **Intake** (`/talk`): Muse Voice Transcribe turns a recording into text and Muse Spark proposes form answers from it. Each answer carries the person's own words, `validate_extraction` drops one whose words are not in the transcript, and nothing reaches the form before the person has seen it.
- **The written plan** (`/advisory`, `POST /api/advisor/plan`): Muse Spark writes a short plan in the reader's language around `{{blanks}}` that the rules fill. It is shown no figure, name or place: only the rules' verdict words, their advice sentences (one with a digit in it is left out), and the kind and level of each matched scheme. `verify_plan` refuses a reply with a digit in any script, a number word, a link, an abbreviation, the wrong script or an unknown blank; the route tries at most twice and otherwise shows no plan.

**A model never computes a figure, a risk band, a scheme match or the advice.** `tests/test_model_boundary.py` pins it in the imports: a module under `services/` other than the helper's two can import neither the Meta client, those two services nor anything that opens a connection. Say "AI-assisted intake" and "AI-written, rule-verified plan", **never "AI-driven advice"**. Detail: `docs/HACKATHON.md` §3–§6.

---

## Running it

```bash
# Backend, from ./backend (venv at ./.venv, Python 3.14.7; floor 3.10)
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
- with `ARTHNITI_AI_ENABLED=true`, both also serve the 2 intake routes and the plan route (the 9th and 10th routers).

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
                        production, plus the intake and advisor routers in both when the helper is on
  smoke_meta.py         `python -m app.smoke_meta`: 3 real Meta calls, prints the cost and the tokens;
                        `--plan` makes 2 instead (one plan in English, one in Hindi)
  core/                 settings.py (ARTHNITI_* env), processing_log.py (JSON lines on stdout),
                        data_loader.py (lru_cached JSON; the object is SHARED: read-only),
                        meta_client.py (the only code that calls Meta), spend.py (the spend ledger)
  api/routes/           10 routers, one file each (intake.py and advisor.py are the helper's)
  schemas/              Pydantic request/response models; limits.py holds MAX_RUPEES (₹100 crore),
                        MAX_EMPLOYEES (10,000) and the string max_lengths (frontend/src/data/limits.js)
  services/             all business logic: pure functions, no classes, no I/O. intake_service.py
                        builds the helper's prompt and validates the model's answers; plan_service.py
                        does the same for the written plan; options_service.py prices the 12, 24, 36
                        and 60 month loans, schedule_service.py their schedules, structuring_service.py
                        what PMEGP, PMFME and Mudra ask for and pay, compliance_service.py the
                        registrations to ask about; the call is in core/
  data/                 schemes.json (30 schemes, 7 tiers), market_data.json (125 rows),
                        market_data.provenance.json, necc_egg_prices.json (30 rows)
  gen_schemes.py        the SOURCE of schemes.json; test_gen_schemes.py holds the two equal
backend/tests/          58 test files, conftest.py and 6 fixture modules (deployment, intake, market,
                        necc, plan, privacy); 2177 tests
backend/requirements.txt       every runtime dependency pinned, transitive ones too (no hashes)
backend/requirements-dev.txt   -r requirements.txt + pytest + httpx2 (httpx2 is correct, not a typo)
.github/workflows/ci.yml       pytest (3.10 + 3.14) + no-server frontend gates, on Linux; green since its first run (27 Oct 2026): the Actions tab has every run
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
                        talkAnswers.js (helper answers to form fields), planShape.js (what a stored
                        plan must look like), marketRows.js (which market rows may be drawn)
  pages/                11 page components
  components/           Button, BrandMark, BrandWordmark, Figure, HelperFilledBanner, InstructionManual,
                        SchemeFunding, Compliance, ShortNotice, Charts, chartData.js
  services/api.js       the only module that touches the network
  index.css             design tokens + the .ui-* system + @media print
tools/                  verifiers (tools/verify/), parity4, keycheck, notice-version.json, the market
                        and egg-price fetches;
                        screenshots/ is output only
```

**The backend has 10 routers. The frontend calls `POST /api/analysis/run`, and, only with the helper on, `POST /api/intake/transcribe`, `/api/intake/extract` and `/api/advisor/plan`.** The others, `GET /health` and `POST /api/{entrepreneur/profile, business/analyze, financial/analyze, schemes/match, advisory/recommend, market/context}`, are thin wrappers with tests. Don't delete them, and don't assume a change there reaches the UI. Production does not mount them.

CORS is `ARTHNITI_CORS_ORIGINS`, a list of exact origins (https-only and required in production; `*` refused in both modes). Unset in development, it is the loopback regex `http://(localhost|127\.0\.0\.1)(:\d+)?`. Credentials off, GET and POST, `Content-Type` only.

**Routes:** `/` → optional `/login` → `/profile` → `/business` → `/location` → `/finance` → `/analysis`, `/schemes`, `/advisory`, `/report` (print view), plus `/privacy` (the full notice), `/talk` (the helper; with `VITE_AI_HELPER` off it falls to `*`) and `*` → `NotFoundPage`. `/login` asks only for a name, authenticates nothing and has no password. Nothing guards the journey order, so `/finance` can be submitted empty and gets a 422, which `api.js` renders as a sentence. The analysis call fires on the `/finance` submit, and only with the consent box ticked. `/advisory` also shows the loan options (12, 24, 36 and 60 months) and, with the helper on, the plan card; `/report` prints each option's month-by-month schedule.

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

- **`STORAGE_VERSION` is 6, and `READABLE_VERSIONS` is {1, 2, 3, 4, 5, 6}.** Bump the version whenever `EMPTY`'s shape changes (5 added `aiFilled`, 6 added `request` and `plan`). A bump that **renames or moves** a field must drop the older versions from the set.
- **`hydrate()` merges section by section over `EMPTY`**, `pick()` drops keys `EMPTY` no longer has, and `result` passes through untouched. A field left `undefined` would silently turn a controlled input into an uncontrolled one.
- **`isStarted(data)` is a difference from `EMPTY`, not a truthiness test**, because several defaults are not blank ('rural', 'Hindi', 0). `marketType` needs its own arm.
- **Start over** (↺) opens a native `<dialog>` via `showModal()`, with No first and focused. Yes runs close → `resetApplication()` → `navigate('/')` → focus `#main`. `resetApplication` leaves `{v: STORAGE_VERSION, data: EMPTY}` in storage and does not touch localStorage.
- **Editing `business`, `location` or `finance` clears the result**, except the `LOCAL_ONLY` fields (businessName, village, marketType, customers), which never leave the tab (`updateSection` sets `result`, `request` and `plan` to null, and `resultCleared: true` if a result was thrown away). `profile` is deliberately excluded, because switching language must never discard results. `updateSection` returns the same object when nothing changed, which is a guard, not an optimisation. The empty result pages show `res.changed*` when `resultCleared` is set, and their button goes to `firstUnansweredStep(data) ?? '/finance'`.
- **A request in flight cannot overwrite newer answers** (`FinancePage`): the earlier request is aborted; `answersKey(payload)` covers every sent field (the consent record is added after it), and if the answers changed the response is dropped and `finance.changedWhileChecking` is shown; the page navigates only if the path is unchanged. `api.js` combines the caller's signal with the 20 s timeout through `AbortSignal.any` and tells them apart by which signal fired.
- **The consent, age and zero-income ticks live in `FinancePage` state only**: not in `EMPTY`, not in sessionStorage, not in `answersKey`. `/talk` has its own consent and age ticks, in `TalkPage` state only.
- **`aiFilled`** lists the form paths the helper filled (`applyHelperFill`, `fillFromHelper`). `applyEdit` drops a path once the reader edits it, and `HelperFilledBanner` shows on a form page that received an answer. It never leaves the tab and is not part of `isStarted`. The helper writes string values and never writes a household income of 0.
- **`request` and `plan`** are stored beside `result`. `request` is the 12 fields as sent (`setResult(result, payload)`) and `plan` is the written plan for that result, or null. `hydrate` reads them back only with a result, and `applyPlan` keeps a plan only for the request it was written for, so one that arrives after the answers changed is dropped. A plan stays in the language it was written in (`plan.otherLanguage` says so after a language switch). `PlanWriter` has its own consent tick, in component state only, unticked after every plan.
- localStorage holds UI preferences only: `sih-language`, `sih-dialect`, `sih-theme`, `sih-textsize`. `sih-contrast` is inert.

### i18n

**8 languages:** `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn`. **`DEFAULT_LANGUAGE` is `hi`.** Four dictionary files, merged in this order by `merge()` in `strings.js`, so a later file wins:

| File | Keys × 8 | Holds |
|---|---|---|
| `strings.js` | 223 | chrome, landing, the four form steps, `notice.*`, `consent.*`, `errf.*` |
| `resultStrings.js` | 416 | result pages, `/login`, `/privacy`, `/404`, the helper page (`talk.*`, 40 keys), the loan-options card (`fo.*`, 21), the schedule table (`rp.schedule*`, 10), the scheme-funding card (`fs.*`, 24), the registrations card (`cl.*`, 32) and the plan card (`plan.*`, 20), the enum→label targets (`st.*`, `risk.*`, `lvl.*`, `lvlnote.*`) |
| `backendStrings.js` | 60 | sentences a **Python service composes** (`adv.*`, `obs.*`, `rsn.*`, `sum.*`, `nxt.*`, `why.*`, `src.*`, `cmd.*`, `mknote.*`) |
| `schemeStrings.js` | 191 | prose **typed into schemes.json** (`sdata.*`, `elig.*`, `doc.*`, `scat.*`) |

**890 keys, 7,120 strings** (measured 28 Oct 2026). No key may be defined in two files, so **the per-file counts must add up to the total exactly**. A difference of one means a number is wrong.

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

**Response: 10 top-level keys** (`analysis_service.py`): `financial_analysis`, `risk_analysis` (19 keys), `business_analysis`, `market_context` (a list), `scheme_matches` (a list of 16-key entries), `scheme_funding` (5 keys), `compliance` (2 keys), `advisory`, `financing_options` (6 keys) and `mvp_summary` (7 keys).

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

**Loan options** (`options_service.py`, the `financing_options` key; it has no rule of its own)

- For each tenure of 12, 24, 36 and 60 months: the largest loan towards the funding gap (whole thousands, or the whole gap) that `calculate_repayment_pressure` still calls `low` and that keeps the household check off `over_limit`, at the same assumed 12% a year. A tenure that allows no loan is left out.
- `recommended_by_rules` is the shortest tenure that covers the whole gap, else `None`. `status` is `covered`, `partial`, `no_gap`, `no_surplus`, `household_over_limit` or `no_room`. It is a calculation at an assumed rate, never a quote.
- Each option carries `schedule` (`schedule_service.amortization_schedule`: integer paise, the instalment is rounded to a whole rupee and the last payment clears the remainder, so `total_repayment` ≠ `monthly_repayment × tenure`) and `dscr` (`monthly_profit ÷ total_monthly_emi`: the pressure ratio the other way up, `None` when no EMI is paid, no lender cut-off cited). `/report` draws the table and `/advisory` prints the totals with `formatExact` (two decimals; same sign rule as the four formatters).

**Scheme funding** (`structuring_service.py`, the `scheme_funding` key: arithmetic on three small tables that each cite their source)

- Priced for PMEGP, PMFME and Mudra only, and only when the matcher found them (Stand-Up India's margin figures conflict: a status sentence, no sum). `project_cost` is `initial_investment`; own money is a share of the **whole** cost; `net_loan_amount` = cost − own − subsidy. PMEGP prices `general` and `special` both (the app never asks the person's category), caps the subsidy base at ₹20 lakh for everyone, and gives a place that is neither `rural` nor `urban` the urban rates with `area_assumed`. Mudra has no subsidy: `band` follows the funding gap. The rates and their sources are in `docs/frontend_integration.md` and `docs/HACKATHON.md` §2.2.
- `terms` (`kvic_2022`, `mofpi_2021`, `dfs_2026`) selects the caveats `SchemeFunding.jsx` prints. Never say a scheme is open. No eligibility rule is evaluated and the repayment is not tested against the household, so a net loan can exceed the loan-options cards: the card says "estimate, not an offer".
- `SchemeFunding.jsx` draws only what the backend sent and leaves out a scheme with no name in `scheme_matches` or a band it has no words for. `drive.mjs` checks it on `/advisory` and `/report`.

**Compliance** (`compliance_service.py`, the `compliance` key: `{yearly_sales, steps}`; no request field, so no `SENT_FIELDS` or notice change)

- Four steps in this order: `udyam`, `local`, `fssai`, `gst`. `need` is `free`, `ask`, `usually`, `depends` or `not_needed`, never "required". `yearly_sales` is `expected_monthly_revenue × 12`, the person's own figure.
- FSSAI: sales up to ₹12 lakh (and 100 kg or litres a day, 500 litres of milk) is a registration, above it a licence; "usually", because the source says "and/or". GST: goods ₹40 lakh (₹20 lakh in 10 States), services ₹20 lakh (₹10 lakh in 4); exactly the limit is `within`; both or neither word is `mixed`, which gives `between` and "ask". The sources and their dates are in `DATA_SOURCES.md`; the limits are as published in 2017 and 2019 and **not checked against later amendments**.
- Not stated, because no source was read: fees, a farmer's own produce (only "can be treated differently"), goods between States, online sales, Udyam for farming alone. The food, goods and services lookups are whole-word tables of our own, never `CATEGORY_SYNONYMS`. `Compliance.jsx` draws only what the backend sent; `drive.mjs` checks it with its own copy of the mapping and a pass for a result stored without the key.

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
- **All 125 rows are `scope:"district"`, for 13 districts in 12 states** (measured 27 Oct 2026): Lucknow and Varanasi (UP, fetched 24 Sept) and 11 added on 27 Oct (Coimbatore, Warangal, Ernakulam, Mysuru, Pune, Jaipur, Indore, Ludhiana, Nadia, Guntur, Gaya). Agriculture gets up to 3 mandi prices per district (the median over the last 30 reporting days, with a P10–P90 range; Guntur has none and Gaya one). The other 7 category buttons get one Udyam count each (Lucknow tailoring: 5,826 of 249,493), suppressed under 10. Every other district shows the empty state, except for eggs (next).
- **Egg prices** (`necc_egg_prices.json`, merged in by `load_market_data()`): 30 rows for the Poultry / Eggs button from the daily sheet of the National Egg Co-ordination Committee (NECC), 16 states, fetched 28 Oct 2026. 29 are `scope:"district"`; Delhi's is the one `scope:"state"` row. NECC is not under GODL: it agreed by e-mail (keep the owner's contact details out of the repo). Each row carries the first three sentences of NECC's clarification, the pages print them once, and `drawableMarketRows` (`marketRows.js`) refuses to draw an egg row without them. **The unit is our reading** (whole numbers, no unit; 640 is taken as 640 paise an egg, ₹6.40) and unconfirmed, so the page prints NECC's number beside it. The `Average` column is never read. 4 of 34 centres are skipped on purpose (`tools/necc-crosswalk.json`). A price goes stale in 8 days: refetch before a demo. `plan_service` sends Meta no egg row.

### The scheme dataset

**30 schemes across 7 tiers.** `LEVEL_RANK` runs from 0 to 6: `central`, `state`, `regional`, `district`, `sub_district`, `block`, `local_body`.

- **`location_types`:** 25 schemes are `ALL`. Four are `["rural"]`: Vibrant Villages, RSETI, the BDO/NRLM desk and the Gram Panchayat licence. PM SVANidhi is `["semi-urban","urban"]`.
- `/schemes` groups cards by tier with `lvl.*` and `lvlnote.*` headings. `/analysis` and `/report` show flat lists with a `sch.runBy` badge.
- **Field-name trap:** the file key is `business_categories`, and `_scheme_index()` renames it to `categories`, stored as an ordered tuple because the matcher does a substring test. `target_segment` exists on every scheme and nothing reads it.
- **To change the dataset, edit `SPEC` or `LOCATION_TYPES` in `gen_schemes.py` and run it from `./backend`.** Hand edits to `schemes.json` fail `test_gen_schemes.py`. New codes need all 8 `schemeStrings.js` entries added by hand; keycheck reports any that are missing.
- **`last_verified`:** `EXISTING_VERIFIED` in `gen_schemes.py` puts PMFME, PMEGP, PMMY and Stand-Up India at 2026-10-28 (their official pages were read again for the funding card) and every other scheme at 2026-09-07. `reviewDates.js` prints the earliest and latest in the footer, and `test_review_dates.py` keeps them equal.
- **No single input reaches all 7 tiers; the maximum is 6.** States with their own scheme and states reached by a regional scheme do not overlap.
- **Demo-safe input:** tailoring, handicrafts or food processing in UP / Lucknow gives 14, 14 and 18 schemes across 6 tiers, both UP fit labels (so the chart renders) and a district market row. Agriculture gives 11 schemes plus 3 mandi prices; poultry gives 15, all national (no fit chart) plus the NECC egg price.

### Data protection

`docs/PROCESSOR_SCHEDULE.md` tells a deployer what is sent, held and logged. Keep it true.

- **The notice text is versioned.** Editing any of the 60 `NOTICE_KEYS` in any language, or reordering `SENT_FIELDS`, fails parity4 check 9. Fix it by bumping `NOTICE_VERSION` and recording the printed hash in `tools/notice-version.json`. Commit `notice.js`, that JSON and the dictionaries together.
- **A new request field goes in `SENT_FIELDS`, with an `errf.*` label in `FIELD_LABELS`, or in `IGNORED_FIELDS`.** `test_notice_sent_fields.py` enforces this. Either way the field changes every payload code, so redo the schedule's test vector (§4.3).
- **Only the consent record reaches a log from a request body.** `path` is the route template or `"unmatched"`. Extend `test_log_privacy.py` for any new field or route.
- **Never call the payload code anonymous.** It is pseudonymous.
- **A field the backend never reads must not claim to shape the result** (`form.localOnly`).
- **`settings.py` refuses a bad value at startup.** Add no silent fallback.
- **The server records `age_confirmed` and does not enforce it.**
- **The helper sends the person's words to Meta and nothing else** (typed text, or a recording of up to 60 s). `talk.sendsText` says so before use, free-credit data use included. Meta is a new processor and a cross-border transfer (`PROCESSOR_SCHEDULE.md` §10). The helper routes keep no text and record no consent (`test_intake_log_privacy.py`). **The plan route sends Meta no figure, name or place**: only a description the rules built (the kind of business from a fixed list, village, town or city, verdict words, the rules' advice sentences (one with a digit in it is left out), and the kind and level of each scheme, never its name). The answers go to our backend only. It keeps no consent record, and a refused reply is logged as the codes of the checks it failed (`test_advisor_log_privacy.py`). Its tick lives in `PlanWriter` state only.
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
- **Formatters are duplicated per page on purpose, so they drift.** A negative amount prints as `-₹5,000` (sign before the symbol) in all four copies: `AnalysisPage`, `AdvisoryPage`, `ReportPage` and `FinancePage`'s `rupees`. Change one, change all four. (`TalkPage`'s `valueText` is a fifth copy that only ever prints non-negative amounts, `SchemeFunding`'s `money` a sixth that mirrors `ReportPage`'s, and `Compliance`'s `money` a seventh.)
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
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q      # 2177 passed, ~17s
```

- **The backend is tested with pytest.** The frontend has no test framework; `node --test` covers four pure modules (below) and the browser gates cover the pages. Some tests pin user-visible wording, so edit them together with a copy change.
- **When you add a branch, add a test proving a real request can reach it**, a sweep through `run_unified_analysis`, and not only a unit call.
- Market tests bring their own rows from `tests/market_fixtures.py`; Meta tests use the fake model client in `tests/intake_fixtures.py`.
- `conftest.py` pins `ARTHNITI_ENV=development`, clears the other `ARTHNITI_*` variables and `MODEL_API_KEY`, and blocks any connection that is not to this machine and any write to the real ledger (`test_network_guard.py`; it covers blocking sockets, not asyncio on Windows). Build a production app with `create_app(load_settings({...}))`.
- Verifiers that submit `/finance` tick the consent box first.

**No server needed:** `node tools/parity4.mjs`, `node tools/keycheck.mjs`, `node tools/verify/glyph-audit.mjs`, and `node --test` on `tools/verify/market-lib-test.mjs` (185 tests), `talk-lib-test.mjs` (45, the answer mapping and the WAV encoder), `app-state-test.mjs` (41, the stored state) and `necc-lib-test.mjs` (74, the egg-price parser and checks). The two before the last load JSX through Vite's `ssrLoadModule`.

**Backend up:**

- `node tools/verify/refresh-cases.mjs` regenerates the `case_*.json` fixtures. Run it after any change to services, schemas or data. The fixtures are untracked and go stale silently.

**Vite up** (`http://localhost:5173`): the browser gates. `drive` (9 passes / 43 loads: leaked keys, `null%`, `NaN`, raw enums, the fit label), `mobile-audit`, `print-audit`, `text-align`, `field-align`, `lang-layout`, `motion-audit`, `hero-art`, `brand-mark`, `manual-audit` (it includes the no-pill check), `market-ui` (it starts its own Vite on 5179), and `error-banner`, `scroll-audit` and `figure-audit`, which also need the backend. **`talk-ui`** needs neither: it starts its own backend (8012, `tools/verify/talk_fake_backend.py` with a fake model client, so it never reaches Meta), three Vites (5182–5184) and Edge (CDP 9379, fake microphone), runs scenarios S0–S22 (S0–S15 drive `/talk`, S16–S22 the plan card; `--only=S15` runs one) and kills all of it by PID. Each gate has its own CDP port and Edge profile, and `tools/README.md` says what each checks. They drive Edge at a hardcoded Windows path, so they are Windows-only and not in CI.

- **`--broken` must exit 1:** `scroll-audit`, `text-align`, `field-align`, `market-ui`, `figure-audit` (`=split|over|tiny`) and `motion-audit`.
- **Exit 2 is an instrument fault, never a finding or a pass:** a crash, the wrong cwd, a server or Edge down or lost, a page with nothing to measure, a refuter that missed, or a seed the app discards (it measures clean as a blank page). The seeding scripts refuse a `SEED_VERSION` outside `READABLE_VERSIONS` and fail an empty result route as `UNSEEDED`. `drive` seeds v2 on purpose, for its hydrate check. Only the four `node --test` files exit 1 on a crash. Details: `tools/README.md` § Exit codes. A `report.json` starts with `exit`; a run stopped by a thrown fault leaves none.
- **Reports only:** `hero-geom`, `hero-vibrance` and `load-perf`'s timings. `load-perf` needs `npm run preview` on 4173 and exits 1 only when the app does not mount.
- `art-contrast.mjs` is retired (it exits 2). **Port 9369 is kept free for one-off probes.**

Traps:

- **When a new check reports zero, break the thing it watches on purpose and confirm it fires.** When a check *passes* under its refuter, find out why.
- **A "nothing was sent" check must watch the page's own requests** (`talk-ui` hooks `fetch` in the page): the fake backend logs a call only when the model client is reached, and the real routes reject an unusable WAV with a 422 before that. `talk_fake_backend.py` must track the real client's signature (`test_talk_fake_backend.py` guards it).
- **A recording that is stopped at once is sometimes reported unusable** (`talk.errRecording`): 3 of 40 runs of `talk-ui` S15 without a pause before Stop, 0 of 40 with a 1.2 s pause (too few for significance; `docs/HACKATHON.md` §7). A browser check that records waits before it presses Stop, and a wait for a state the page owes the reader is soft (`settleSnap`, which reports) and not a never-ending wait (a fault).
- `drive` reads `innerText`, so it cannot see inside a closed `<details>`. Verify changes there with a probe that opens every disclosure first.
- Edge's `--user-data-dir` must be an absolute path. Create your own target through `Target.createTarget`.
- Keep `process.exitCode = 2` first in every verifier, and never `process.exit()` just after a `fetch()` (Node 24 aborts, 127); use `crashExit()`.

`tools/fetch-market-data.mjs` refetches the market rows. It is a dry run unless `--write` is passed, and it reads the key from `.env`. `script_sha256` hashes `market-lib.mjs` + `fetch-market-data.mjs`, which `.gitattributes` pins to LF, so don't edit either without refetching. `tools/fetch-necc-prices.mjs` does the same for the egg prices with `necc-lib.mjs` (no key; `--from FILE` reads a saved page and refuses `--write`).

---

## Still open

**Advice and data:** a household income of 0 needs a tick and then gives "do not take a new loan"; the household income is self-reported; the pressure figure errs high when another earner pays their own loan; **no eligibility rule is evaluated anywhere** (`sc.eligUnchecked` says so on the page); `stale` is decided at fetch time; the Udyam counts cannot be reproduced; the egg-price unit is unconfirmed and NECC's permission is an e-mail (`DATA_SOURCES.md`); the scheme rules have no re-check schedule (the footer date and `test_review_dates.py` are the only guard); the funding card rests on three pages with a gap each and does not test affordability, and the registrations card's limits are the 2017 and 2019 figures, not checked against later amendments (`docs/HACKATHON.md` §8); there is no helpline number.

**Build and verification:** the verifier gaps (Edge leaks, unrefuted arms, narrow coverage, slow blank-page 2s) are in the history section "Verifier exit codes". The dependencies have no hashes. `backend/venv/` is stale; `.venv` is in use. The print PDF and the `api.js` timeout have not been clicked through by hand. Phones: landscape, real touch and the on-screen keyboard are unverified.

Also open, stated where they apply: the household definition, market coverage, dialect coverage and the translation review, the Windows-only gates.

**Meta helper** (the full list is `docs/HACKATHON.md` §8): the owner ran `python -m app.smoke_meta` and `--plan` on 27 Oct 2026: the key works, and both plans passed the checks first time at about 1.1 to 1.2 cents each (`PROCESSOR_SCHEDULE.md` §10.7). Not observed: the speech `keywords`, a real person's speech and the Billing balance since `--plan`. **The plan card has been driven in a browser only against the fake model** (`talk-ui` S16–S22). The helper routes have no authentication, no per-user limit and no consent record (the ledger and the hourly limit are the only brakes), and `/privacy` says nothing about the helper (`PROCESSOR_SCHEDULE.md` §10.5). No `safety_identifier` is sent and zero data retention is not requested. Malayalam has no speech model (typing works).

**Legal:** `LICENSE` became MIT on 29 Oct 2026. The owner states that Manjeet and Netra agree; nothing from either is on file, and a line from each is the safe step. Outside the licence: the NECC egg prices (an e-mail agreement) and `hero-backdrop.jpeg` (no source). The Official Rules are behind a login and unread.

**DPDP** (the full list is `docs/PROCESSOR_SCHEDULE.md` §9):

- **S16:** no native speaker has reviewed the 60 notice keys in the 7 other languages. This blocks shipping a non-English notice.
- **S17**, deferred to the next refetch: the Udyam fetch does not reject fields it did not request. The two fetch scripts are frozen by `script_sha256`.
- The app has no rate, body-size or `Host` check and no HSTS, which leaves them to the proxy. It deletes no logs.
- uvicorn sends `server: uvicorn` unless started with `--no-server-header`. Its access log (IP address, query string) is on unless started with `--no-access-log`.
- stderr tracebacks have not been audited for answer values.
- The lawyer items are listed in §9.3 of the schedule.

---

## Git

- **History is one line on top of `4a2307e`, and `main` is the only branch.** Until 29 Oct 2026 it sat on three branches: `feature/dpdp-compliance` (the September DPDP work, the verifier work and the brand-asset files, uncommitted until 27 Oct), `feature/security-hardening` (the Meta client, the spend cap and the network guard) and `feature/voice-assistant` (the tip). `main` was fast-forwarded to the tip and the others, each an ancestor of it, were deleted. The commit titled "chore: the project as it stood at the hackathon start" is the 12:00 PM ET start of the hackathon on 26 Oct 2026; `docs/HACKATHON.md` §2.3 shows how to diff against it.
- **New work goes on a new branch cut from `main`.** A clone from before 29 Oct may hold a local `main` with unpushed scaffolding commits: compare `origin/` refs.
- Never commit on `main` itself: `main` moves only by a push the owner has approved, as a fast-forward. **Commit messages carry no Co-Authored-By line and no Claude attribution.**
- The brand-asset changes dated 13 Sept (`tools/assetgen.mjs`, `frontend/src/assets/README.md`, two regenerated lockups, and the two `arthniti-wordmark-on-*.png` files) are the owner's and have their own commit. Keep them out of other commits.
- Ignored: `.venv/`, `venv/`, `node_modules/`, `dist/`, `.env*` except `.env.example`, `.claude/`, `screenshots/` (verifier output, 8 GB) and `.market-cache/`.
- **Team:** none. Aryan Verma works alone since 26 Oct 2026; the September build had six contributors (`DATA_SOURCES.md`, People).

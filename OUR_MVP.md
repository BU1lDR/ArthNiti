# अर्थNiti — SIH 2026 MVP
## Shared team context: what we actually built

> **Purpose:** the single shared context document for all six team members and their AI assistants.
> **Rule:** this file describes the MVP **as it exists in the repository**. When you change the build, change this file in the same commit. Anything not yet built is labelled **PLANNED** — never write a planned thing as though it works.
> **Engineering detail lives in [CLAUDE.md](CLAUDE.md)** — exact file paths, response keys, thresholds, known traps. This file is the product/team view; CLAUDE.md is the code view. If they disagree, CLAUDE.md is newer.

**Status as of 7 September 2026 — presentation is 11 September 2026 (4 days out).**

| | |
|---|---|
| Project name | **अर्थNiti** (frozen) |
| Phase | Working prototype, feature-frozen except polish |
| Backend | Runs. 8 routers, 135 passing tests |
| Frontend | Runs. 9 routes, full journey works end to end |
| Integration | Done — one API call carries the whole journey |
| Datasets | 3 government schemes, 9 market rows (illustrative) |
| LLM / AI model | **None. Zero model calls.** See §15 |
| Database | **None. No persistence of any kind.** See §8 |
| Presentation | Owned by Saad + Tripti, in progress |

---

# 1. Project Identity

## Project Name
**अर्थNiti** — *अर्थ* (money / economy) + *नीति* (policy, plan, prudent course). "A money plan."

Written exactly like that: Devanagari **अर्थ** and Latin **Niti**, one word, no space. The mixed script is the wordmark and is what appears in the logo. It was written `ArthNiti` until 8 September 2026 — that spelling is retired.

**The name does not translate.** Switching the interface to Tamil or Bengali changes every other word on the page and leaves the name alone, because a brand is a proper noun. It lives in one place in the code (`frontend/src/i18n/brand.js`) so it cannot drift between the masthead, the footer, the report sheet and the browser tab. If you are writing a slide, a script or a caption, spell it `अर्थNiti` there too.

**The logo** is an eight-petal lotus rosette around a ₹ coin with three coins falling below it, drawn as SVG so it recolours itself for dark mode and for both high-contrast modes and still prints in full colour on the `/report` PDF. It appears in the masthead, on `/login`, in the footer, on the printed report and as the browser tab icon.

## SIH Problem Statement
**AI-Driven Hyper-Local Business Advisory and Financial Structuring Assistant for Rural Micro-Entrepreneurs**

## One-Line Pitch
> अर्थNiti asks a rural micro-entrepreneur eight plain-language questions and returns a structured, explainable business and financing assessment — local market prices, monthly profit, repayment risk, matched government schemes, and a printable action plan.

## Core Idea
We are NOT building a generic AI chatbot. We built a guided four-step form that feeds a deterministic advisory engine and returns five kinds of answer on one screen.

Of the ten questions the blueprint set out to answer, here is where the MVP actually stands:

| # | Question | Status |
|---|---|---|
| 1 | What business should I pursue? | **Not built** — the user tells us their category, we don't recommend one |
| 2 | Is my business idea financially viable? | **Built** — `feasibility_status`, operating surplus, margin, ROI |
| 3 | What does my local market look like? | **Built** — district-level price/demand rows, honestly labelled |
| 4 | How much money do I need? | **Built** — `funding_gap` |
| 5 | How much from my own capital? | **Built** — available capital is an input and shown against the gap |
| 6 | How much external financing is appropriate? | **Partial** — we show the gap and the repayment risk, but no suggested loan amount or EMI scenarios |
| 7 | Which support schemes are relevant? | **Built** — 3 schemes, scored 0–100 with reasons |
| 8 | Can I safely afford the repayment? | **Built** — repayment-pressure ratio → low / moderate / high |
| 9 | What documents do I need? | **Built** — per-scheme document list |
| 10 | What should I do next? | **Built** — ranked recommendations + printable report |

Seven of ten fully, one partially, two not at all. Say this honestly if a judge asks; the gaps are §22 Future Scope, not hidden.

---

# 2. Core Product Philosophy

## The product should feel like
**"A digital business advisor for a rural entrepreneur."**

## It should NOT feel like
- ChatGPT with a rural-themed UI
- A static government-scheme directory
- A loan calculator only
- A dashboard full of fake data

## Key Differentiators — and whether we delivered them

1. **Hyperlocal — DELIVERED.** State + district + business category select real rows from `market_data.json`, and every row is stamped `match_level`: `district` when it is the entrepreneur's own district, `state` when we had nothing for their district and fell back. Both cases print a *different sentence*. This is the honesty marker on our central claim — never render a state-level row as though it were local.
2. **Personalized — DELIVERED.** Every number derives from the eight figures the user entered. Two different users get genuinely different results.
3. **Financially structured — PARTIALLY DELIVERED.** We convert investment and capital into a funding gap and test the EMI against surplus. We do not yet produce financing scenarios or an EMI schedule (§22).
4. **Explainable — DELIVERED.** Scheme matches carry `match_reasons`; risk carries a `reason` sentence; business analysis carries `observations`. Advanced numbers sit behind a "Show detailed calculations" disclosure so the first screen stays readable.
5. **Actionable — DELIVERED.** Every result page ends in next steps; `/report` prints.
6. **Regional-language ready — NOT DELIVERED.** We collect language, dialect and literacy level and echo them back in `mvp_summary`, but **all output is English**. The plumbing exists; the translation does not. Do not claim Hindi output.
7. **Responsible — DELIVERED.** A non-positive surplus short-circuits to `high` risk. Nothing in the app recommends borrowing a specific amount. Scheme cards carry a verify-with-the-authority disclaimer, and every market row is labelled *"Prototype estimate / illustrative data"*.

---

# 3. What the MVP Does

## The journey as built

Nine frontend routes, plus a catch-all for typo'd URLs:

```text
/               Landing page
    ↓
/profile        Step 1 of 4 — name, language, dialect, literacy level
    ↓
/business       Step 2 of 4 — category (9 buttons), business name, investment,
                monthly sales, monthly operating expenses, employees, existing debt
    ↓
/location       Step 3 of 4 — village, district, state, location type, market type, customers
    ↓
/finance        Step 4 of 4 — available capital, monthly expenses (incl. household), monthly EMI
    ↓
        ── ONE API CALL: POST /api/analysis/run ──
    ↓
/analysis       Money, business health, risk, LOCAL MARKET, observations, next steps, schemes
/schemes        Scheme cards with score, reasons, eligibility, documents, official link
/advisory       The recommendations, expanded
/report         Print/PDF-ready one-page summary of everything
    ↓
*               NotFoundPage
```

The whole assessment is one HTTP request. That is deliberate: fewer moving parts to fail on a projector.

## The demo persona — use this one

**Tailoring (or Handicrafts) · Uttar Pradesh · Lucknow.**

Measured against the live backend, this is the only combination that fills *every* section on screen: 2 scheme matches at 100%, plus a **district-level** market row.

Also give the location step a **village name, a market type and a customer description**. All three flow into `market_context[].local_context` and are printed back to the entrepreneur — that read-back is what makes the hyperlocal claim land.

## The exact demo payload, and what it returns

Enter these figures and you get the result below. Re-verified against the engine on 7 September 2026.

| Step | Field | Value |
|---|---|---|
| `/business` | Category · investment · monthly sales · operating expenses | Tailoring · ₹1,00,000 · ₹30,000 · ₹18,000 |
| `/location` | State · district · village · market · customers | Uttar Pradesh · Lucknow · Khera · Weekly haat · Local families |
| `/finance` | Available capital · monthly expenses · EMI | ₹50,000 · ₹15,000 · ₹2,000 |

Result — HTTP 200, all 7 sections populated:

```text
Money needed (funding gap)     ₹50,000
Money left each month          ₹15,000        profit margin 50%     → profitable
Risk                           LOW            EMI is 13.33% of surplus
Business health                FEASIBLE       operating surplus ₹12,000/mo, ROI 144%
Government support             2 schemes at 100%  (PMEGP, PMMY)
Local market                   1 row, match_level "district" — Lucknow tailoring, ₹320
Overall status                 good  → "Maintain the current business model and
                                             consider controlled expansion."
```

Those are the numbers to have in your head on stage. If a figure on screen disagrees with this table, something regressed — check before presenting.

**Avoid on stage:** *Agriculture* and *Other* match zero schemes and zero market rows (§21 explains why this is correct rather than broken). *Retail* now matches 2 schemes but still has no market row.

## The one thing that can break the demo

**State lives only in React memory.** There is no `localStorage`, no `sessionStorage`, no URL parameters, no database. Consequences the whole team must know:

- **A page refresh wipes everything** and every result page falls back to its "not ready yet" empty state.
- **You cannot open `/report` or `/analysis` directly.** To show a populated result you must walk all four forms again.
- **Do not refresh, and do not deep-link, during the presentation.** Walk the journey.

This is our single largest demo risk. Fixing it (§25) is a small change with a large payoff.

---

# 4. Feature-by-Feature Status

## Feature 1 — Entrepreneur Profile · **BUILT (reduced)**
Collects: name, preferred language, dialect (free text), literacy level.
Cut from the original plan: age range, gender, experience years, existing-vs-new. **State and district were deliberately removed from this page** — they were being asked twice, here and on `/location`, and now live only on `/location`.

## Feature 2 — Business Profile · **BUILT**
Category (9 buttons: retail, food processing, handicrafts, tailoring, agriculture, dairy, services, manufacturing, other), business name, initial investment, expected monthly sales, monthly operating expenses, employees, existing debt.
Note the hint text: this page's expense question means **business-only costs**. `/finance` asks a *different* expense question. See §9.

## Feature 3 — Hyperlocal Context · **BUILT**
Village, district, state, location type (rural / semi-urban / urban), market type (village / weekly haat / town / online / mixed), customer description.
Matching is tiered: exact state + district + category first; else same state + category flagged `match_level: "state"`; else an empty section. Rendered on `/analysis` and inside `/report`.

## Feature 4 — Business Feasibility Engine · **BUILT (reduced)**
Returns operating surplus, operating margin %, annual surplus, estimated ROI %, `feasibility_status` (feasible / break_even / not_feasible) and plain-language observations.
**Break-even units and cash-flow projection were not built** — we have no unit-economics inputs (selling price, variable cost per unit) to compute them from. See §25.

## Feature 5 — Financial Structuring Engine · **PARTIAL**
Built: monthly profit, profit margin, `funding_gap = max(initial_investment − available_capital, 0)`, and repayment-pressure risk.
**Not built:** suggested financing range, indicative EMI scenarios, cash-flow coverage schedule. The user supplies their own EMI; we assess it rather than propose one.
Framing that must stay: अर्थNiti is a **decision-support prototype, not a lender and not a financial guarantee**.

## Feature 6 — Scheme Matching · **BUILT**
`backend/app/data/schemes.json` holds **3 verified central schemes**, each with description, target segment, business categories, states, eligibility rules, support type, documents, official URL and `last_verified` date:

| Scheme | Support type | Covers |
|---|---|---|
| **PMFME** | Credit-linked capital subsidy | food processing, food manufacturing, agri-food processing |
| **PMEGP** | Credit-linked margin money subsidy | manufacturing, services, trading |
| **PMMY (MUDRA)** | Collateral-free business loan | manufacturing, trading, services, dairy, poultry, beekeeping |

Scoring is transparent: **+60 if the business category matches, +40 more if the state matches.** No category match returns 0 and the scheme is dropped entirely. All three are `states: ["ALL"]`, so in practice a match is 100 or nothing — say "matched on category and state", not "scored by a model".

## Feature 7 — Explainability · **BUILT**
`match_reasons[]` per scheme ("Your kind of work is supported by this scheme (listed as …)", "This scheme is available in your state."), a `reason` sentence on risk, `observations[]` on business analysis, `match_level` provenance on every market row, and a source label on every price.

## Feature 8 — Risk Indicator · **BUILT**
`pressure_ratio = monthly_emi / monthly_surplus × 100` → **below 30% low, 30–50% moderate, above 50% high**. Non-positive surplus short-circuits to `high` with a null ratio and the sentence "There is no positive monthly surplus available for repayment."
**These thresholds are our prototype assumptions and must be presented as such** — not as universal financial rules. That framing is a judge-facing requirement, not a footnote.

## Feature 9 — Action Plan · **BUILT**
`advisory.recommendations[]` selected by financial status, profit-margin band (10% / 30%) and cash reserve. `/report` renders up to five as numbered steps and falls back to four sensible defaults if the engine returns none. `/report` prints to PDF with `break-inside: avoid` on every card and a forced-light colour set, so a dark-mode laptop still prints on white.

## Feature 10 — AI Chat Assistant · **NOT BUILT**
There is no chat endpoint and no chat UI. `POST /api/chat` does not exist. Nobody should demo or promise it. It is the first item in §22.

---

# 5. What We Deliberately Did Not Build

Still-correct exclusions, and they are defensible answers to "why not?":

- Nationwide real-time market intelligence — we use a small curated, source-labelled dataset instead
- Banking integration, real loan applications, credit scoring
- Aadhaar/PAN verification
- ML models trained on data we do not have
- A mobile app alongside the web app
- A large multilingual voice system
- Web scraping
- Autonomous financial decisions
- Production authentication, blockchain, microservices

Added to that list during the build:

- **A database.** The demo has no multi-session requirement, so persistence would have been cost without payoff. Losing state on refresh is the price, and we know it (§3).
- **A browser test suite.** No Playwright/Puppeteer is installed; four items are verified by reading code and by lint/build/tests only (§13).

The goal was a **convincing, functional MVP**, and that is what exists.

---

# 6. Technical Architecture (as built)

## Frontend
React **19.2.8** · Vite **8.2.2** · Tailwind CSS **4.3.3** · react-router-dom **7.18.3** · ESLint **10.9.0**. No TypeScript. **No chart library** — Recharts was in the plan and was not used; results are cards and numbers, which read better on a projector than small charts.

```text
frontend/src/
  App.jsx                 shell (topbar / main / footer) + JourneyBar + landing + 9 routes + catch-all
  context/AppContext.jsx  the entire client state — one useState, in memory only
  pages/                  8 page components
  components/Button.jsx   the only shared component (variant: primary | secondary)
  services/api.js         the only network call in the app
  index.css               design tokens + the .ui-* design system + @media print
```

Theming: `[data-theme="dark"]` on `<html>`, persisted in `localStorage['sih-theme']`. Ironically the theme persists across a refresh and the user's answers do not.

## Backend
Python **3.14.6** · FastAPI **0.141.1** · Pydantic **2.13.5** · uvicorn **0.52.4** · pytest **9.1.1**.

```text
backend/app/
  main.py                 FastAPI app + CORS + 8 include_router calls
  api/routes/             8 routers, one file per domain
  schemas/                Pydantic request/response models
  services/               ALL business logic — plain functions, no classes, no I/O
  core/data_loader.py     loads JSON from app/data by absolute path (cwd-independent)
  data/                   schemes.json (3), market_data.json (9)
backend/tests/            25 files, 135 tests
```

The planned `models/`, `calculations/` and `ai/` directories **do not exist**. Calculations live in `services/`; there are no ORM models because there is no database; there is no `ai/` because there is no model call.

Style rules, if you are adding code: services are pure functions returning plain dicts, rounded to 2 decimals; services never import FastAPI; routers never do arithmetic.

## Database
**None.** No SQLite, no PostgreSQL, no ORM, no migrations. Two JSON files are the only data store, loaded read-only on each request. Nothing the user enters is written anywhere.

## AI Layer
**None.** See §15 — this needs a whole section, because it is the single most likely thing for someone to misstate on stage.

## CORS
`allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?"` — any loopback port, so a Vite server that falls back from 5173 to 5174 still works. Replace with an explicit allow-list before any real deployment.

## Running it

Two processes, backend first.

```bash
# Backend — run from ./backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend — run from ./frontend
npm run dev          # Vite dev server, port 5173
npm run build        # production build into frontend/dist
npm run lint         # ESLint 10

# Tests — run from ./backend
../.venv/Scripts/python.exe -m pytest tests -q      # 135 passed in ~0.9s
```

API docs are auto-served at `http://127.0.0.1:8000/docs` and `/redoc`.

**Always kill servers you start.** A stray listener on 8000 gives `[Errno 10048] only one usage of each socket address`; a stray Vite server causes confusing CORS failures against a backend that looks fine.

```bash
netstat -ano | grep -E ':8000|:5173'
taskkill //F //T //PID <pid>          # doubled slashes under Git Bash
```

---

# 7. API (as built)

Eight routers exist. **The frontend calls exactly one of them.**

| Endpoint | Purpose | Used by the UI |
|---|---|---|
| `POST /api/analysis/run` | Runs all seven engines, returns everything | **Yes — the only one** |
| `GET /health` | Liveness | No |
| `POST /api/entrepreneur/profile` | Echo/validate a profile | No |
| `POST /api/business/analyze` | Feasibility only | No |
| `POST /api/financial/analyze` | Financial metrics only | No |
| `POST /api/schemes/match` | Scheme matching only | No |
| `POST /api/advisory/recommend` | Recommendations only | No |
| `POST /api/market/context` | Market rows only | No |

The seven unused routers are thin wrappers over the same service functions and are covered by tests. They are useful in Swagger when demonstrating the architecture to a judge — but a change there does not affect the UI.

`POST /api/chat` and `GET /api/report/{id}` were in the plan and **do not exist**. `/report` is a client-side print view, not a server-generated document.

## The one request

`UnifiedAnalysisRequest`. **Required:** `business_category` (≥2 chars), `state` (≥2), and `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `monthly_emi`, `initial_investment`, `monthly_operating_expenses` (all ≥ 0).
**Optional with defaults:** `employees` 0, `existing_debt` 0, `district`/`village`/`market_type`/`customers` `""`, `user_language` "Hindi", `preferred_dialect` null, `literacy_level` "low", `entrepreneur_type` null, `location_type` "rural".

Validation failures return **422**. Nothing guards the journey order — the topbar links to any step — so `/finance` can be submitted with an empty category and state. That 422 is now rendered as a readable sentence rather than `[object Object]`.

`entrepreneur_type` is still accepted and echoed but **no page collects it**; it is always null.

## The one response — seven top-level sections

| Section | Contents |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` |
| `risk_analysis` | `pressure_ratio_percent`, `risk_level`, `reason` |
| `business_analysis` | `business_type`, `initial_investment`, `expected_monthly_revenue`, `monthly_operating_expenses`, `monthly_operating_surplus`, `operating_margin_percent`, `annual_operating_surplus`, `estimated_roi_percent`, `feasibility_status`, `observations[]` |
| `market_context` | list of `{state, district, business_category, indicative_price, demand_indicator, seasonality, source, last_verified, match_level, local_context:{village, market_type, customers}}` |
| `scheme_matches` | list of `{name, description, support_type, match_score, match_reasons[], eligibility_rules[], documents[], official_url, last_verified}` |
| `advisory` | `recommendations[]` |
| `mvp_summary` | `status`, `simple_message`, `next_step`, `priority`, `language`, `preferred_dialect`, `literacy_level`, `entrepreneur_type`, `location_type` |

Enumerated values: `financial_status` ∈ profitable / break_even / loss · `risk_level` ∈ low / moderate / high · `feasibility_status` ∈ feasible / break_even / not_feasible · `mvp_summary.status` ∈ good / attention_needed / review · `match_level` ∈ district / state.

**Contract discipline:** two test files subscript every one of those keys, so removing or renaming a key fails the suite immediately. That is intentional. Note the corollary — *adding* a key passes silently, which is exactly how a bug where `/analysis` showed ₹0 survived for days.

---

# 8. Data (there is no data model)

No entities, no tables, no `id` fields, no `created_at`. The planned `Entrepreneur` / `BusinessProfile` / `MarketData` / `Scheme` / `FinancialProjection` / `AdvisoryReport` entities were never created. What actually holds data:

## `backend/app/data/schemes.json` — 3 records
Fields: `name`, `description`, `target_segment`, `business_categories[]`, `states[]`, `eligibility_rules[]`, `support_type`, `documents[]`, `official_url`, `last_verified`. Every entry is transcribed from an official government source with a verification date. **Never edit eligibility text without an official source** — this is the one dataset a judge can fact-check against the internet in real time.

## `backend/app/data/market_data.json` — 9 records
Fields: `state`, `district`, `business_category`, `indicative_price`, `demand_indicator`, `seasonality`, `source`, `last_verified`. Coverage is Uttar Pradesh only: Lucknow × {dairy, poultry, food processing, handicrafts, tailoring} and Varanasi × {handicrafts, food processing, dairy, tailoring}.
Every row carries `"source": "Prototype estimate / illustrative data"` and the UI prints it. Keep it that way.

## Client state — `frontend/src/context/AppContext.jsx`
One `useState` holding four form sections plus the API result:

```text
profile   { name, language, dialect, literacyLevel }
business  { category, businessName, initialInvestment, monthlyRevenue,
            monthlyOperatingExpenses, employees, existingDebt }
location  { village, district, state, locationType, marketType, customers }
finance   { availableCapital, monthlyExpenses, monthlyEmi }
result    the full 7-section API response
```

State and district live **only** on `location`. In memory only — see §3.

---

# 9. Financial Calculations (as implemented)

All deterministic, all unit-tested. **Keep them that way — never move arithmetic into a model.**

```text
monthly_profit            = expected_monthly_revenue − monthly_expenses
profit_margin_percent     = monthly_profit / expected_monthly_revenue × 100    (0 when revenue is 0)
financial_status          = profitable | break_even | loss

funding_gap               = max(initial_investment − available_capital, 0)
                            clamped, so surplus capital reads as no gap, not a negative one

monthly_operating_surplus = expected_monthly_revenue − monthly_operating_expenses
operating_margin_percent  = monthly_operating_surplus / expected_monthly_revenue × 100
annual_operating_surplus  = monthly_operating_surplus × 12
estimated_roi_percent     = annual_operating_surplus / initial_investment × 100  (null when investment is 0)
feasibility_status        = feasible (>0) | break_even (=0) | not_feasible (<0)

pressure_ratio_percent    = monthly_emi / monthly_profit × 100
                            <30 low · 30–50 moderate · >50 high
                            surplus ≤ 0 → high, ratio null

scheme match_score        = 60 (category matches) + 40 (state matches); 0 → scheme dropped
```

## Two different expense questions — do not mix them up

This trips people up, including on stage:

- **`monthly_expenses`** (asked on `/finance`) means *everything the household spends*. It drives `monthly_profit`, and therefore the risk assessment.
- **`monthly_operating_expenses`** (asked on `/business`) means *business costs only*. It drives `monthly_operating_surplus`, and therefore feasibility and ROI.

They are separate inputs and are allowed to disagree. Both fields carry hint text in the UI for exactly this reason. When a judge asks "why two expense numbers?", the answer is: a business can be viable while the family is still short of money, and conflating the two hides that.

## Not implemented
**Break-even units** and **cash-flow projection** need selling price and variable cost per unit, which we do not collect. `Gross Profit = Revenue − Variable Costs` is likewise uncomputed. Do not put these formulas on a slide as though they run.

## Category synonyms — a wording bridge, not an eligibility widening
Scheme documents say "trading", "manufacturing", "services"; the UI asks the entrepreneur to tap a plain-language button. A map bridges the two (`retail`/`shop`/`kirana` → trading, `handicraft`/`handicrafts` → manufacturing, `tailoring` → manufacturing + services, `livestock` → dairy).

**This translates wording only. It must never widen a scheme's real eligibility.** That is precisely why plain `agriculture` maps to nothing: PMEGP and PMMY cover *allied* activities like dairy, poultry and beekeeping — not crop farming. Mapping agriculture to a scheme to make a demo look complete would be telling an entrepreneur they qualify for money they cannot get. We chose an honest empty state instead.

---

# 10. Team Structure

## Saad — Presentation / Product Story
Problem statement · user personas · solution narrative · SIH pitch · judge-facing demo script · PPT · storytelling · research/source tracking with Tripti.

## Tripti — Presentation / Research
Problem research · government/scheme research · competitive analysis · sources and citations · PPT support · demo narration · **validation of claims** — including the §2 "delivered / not delivered" column, which is the difference between confident and overclaiming.

## Netra — Frontend
UI architecture · landing page · forms · navigation · results layout · responsive design · API integration.

## Anmol — Frontend
Component development · advisory results · scheme cards · action-plan UI · loading and error states · UI polish.
*(Chat UI was on this list. There is no chat feature — reassign that time to §25.)*

## Aryan — Backend
FastAPI setup · API design · business calculations · financial engine · validation · backend testing.
*(AI integration was on this list and did not happen — see §15.)*

## Manjeet — Backend
Data layer · scheme matching · market dataset · report content · backend integration · API testing.

## Cross-team rule
Nobody works in isolation. Every day: a 15-minute stand-up, one shared task board, one shared Git repository, one integration checkpoint, an end-of-day update.

---

# 11. Git / Collaboration

**Repo:** `https://github.com/BU1lDR/SIH_2026` (private).

The planned `develop` + `frontend/<name>` scheme was not adopted. Real branches are per-person and flat:

```text
main            before-main
backend         frontend
aryan           aryan-frontend      aryan-ui-redesign
netra           saad                tripti              Manjeet   (capital M)
```

Rules, still in force:
1. **Never push directly to `main`.**
2. Small commits with messages that say what changed.
3. Pull/rebase before a merge.
4. Keep `.env` and API keys out of Git; maintain `.env.example` if a key is ever introduced.
5. **A push lands in five other people's working copies — confirm before you push near the presentation.**

Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots`.

`screenshots/{light,dark,light-expanded}/` holds 27 full-page PNGs (9 routes × 3 passes, 2880px). **They predate the 7 September fixes** — old branding, no market section, ₹0 on `/analysis`. Recapture before circulating. Gitignored, so hand them over as a zip.

---

# 12. Where the Ten-Day Plan Landed

Kept as a record, because the day numbers appear in earlier notes and stand-ups.

| Planned | Outcome |
|---|---|
| Day 1 — freeze scope, stack, repo, API contract | **Done.** Name landed later than Day 1; everything else held |
| Day 2 — core UI + backend foundations | **Done.** Forms and validation |
| Day 3 — financial engine, dashboard works without AI | **Done** — and it turned out to be the whole product |
| Day 4 — scheme matching + local context | **Done**, though scheme matching had a category-direction bug that silently zeroed five of nine categories until 7 Sept |
| Day 5 — **AI integration**, full happy path end-to-end | **Half done.** The end-to-end path works. The LLM was never connected |
| Day 6 — hyperlocal + personalization | **Done**, then found to be broken: `market_context` was computed and silently discarded by the UI. Fixed 7 Sept |
| Day 7 — UX, explainability, responsible framing | **Done.** Disclosures, source labels, disclaimers, plain-language copy |
| Day 8 — testing + demo scenarios | **Partial.** 135 backend tests; no frontend tests; one polished scenario rather than three |
| Day 9 — polish + presentation | **In progress.** 7 Sept: a full defect sweep — 10 numbered defects plus 7 more, all fixed |
| Day 10 — rehearsal + final build | **Pending.** §25 |

The honest lesson, and a good answer to "what did you learn?": **the deterministic engine that was supposed to be scaffolding for the AI turned out to be the product.** Day 3's deliverable — "the financial dashboard works without AI" — is what we are demonstrating.

---

# 13. Definition of Done — current state

- [x] Frontend runs reliably
- [x] Backend runs reliably
- [x] Profile input works
- [x] Business input works
- [x] Financial calculations work
- [x] Funding gap works
- [x] Risk indicator works
- [x] Scheme matching works — 7 of 9 categories match; 2 correctly match none
- [x] Hyperlocal market context works, with honest district/state provenance
- [ ] ~~AI advisory works~~ → **deterministic advisory works. There is no AI advisory.** Reworded rather than ticked
- [x] Explainability works
- [x] Action plan works
- [x] Printable report works
- [x] Error and empty states exist on every result page
- [x] At least 2–3 business categories work — 7 do
- [x] One polished demo persona works (§3)
- [x] Sources recorded with verification dates
- [x] 135 backend tests pass; lint and production build are clean
- [x] No API keys to protect (there are none)
- [ ] **State survives a page refresh** — it does not (§3, §25)
- [ ] Three demo scenarios — we have one
- [ ] Presentation complete
- [ ] Demo rehearsed at least 3 times

## Verified only by reading code
No browser automation is installed, so four things have never been clicked by a human or a driver: the `/business` category error message and its scroll-into-view, the `*` catch-all page, the `api.js` 20-second timeout path, and the print PDF layout. **Mobile widths are not pixel-verified** — desktop only. Somebody should click all five before the 11th.

---

# 14. Repository Structure (actual)

```text
SIH_2026/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/routes/       8 routers
│   │   ├── schemas/          Pydantic models
│   │   ├── services/         all business logic
│   │   ├── core/             data_loader.py
│   │   └── data/             schemes.json, market_data.json
│   ├── tests/                25 files, 135 tests
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/            8 pages
│   │   ├── components/       Button.jsx
│   │   ├── context/          AppContext.jsx
│   │   ├── services/         api.js
│   │   └── index.css
│   ├── index.html
│   └── package.json
│
├── docs/                     frontend_integration.md, requirements.txt
├── presentation/             empty — Saad + Tripti
├── screenshots/              gitignored, 27 stale PNGs
├── .venv/                    Python 3.14.6, gitignored
├── CLAUDE.md                 engineering context
├── OUR_MVP.md                this file
└── README.md
```

Differences from the plan worth knowing: no `.env.example` (nothing needs one), no `docs/architecture.md` / `api.md` / `sources.md` / `demo-script.md`, no `hooks/` or `utils/` on the frontend. `docs/frontend_integration.md` exists but is **stale** — it claims CORS allows only two fixed origins (it is a loopback regex) and claims five response sections (there are seven). `docs/requirements.txt` is unrelated to `backend/requirements.txt`.

---

# 15. The AI Question — read this before you present

**अर्थNiti currently makes zero LLM calls.** There is no model SDK in `requirements.txt`, no API key, no environment variable, no HTTP client used for inference, no `ai/` module. Every number and every sentence the user sees is produced by hand-written Python `if`/`else` in `backend/app/services/`.

**Nobody on the team should describe the current build as using an LLM.** If a judge asks whether AI is running and the honest answer is dodged, one follow-up question — "which model?" — ends the conversation badly. If someone asks us to "improve the AI", clarify first whether they mean wiring up a real model or improving the rules.

## What to say instead

> "The advisory logic is a deterministic rules engine. That is a design decision, not a shortfall: for financial guidance to a first-time borrower, a wrong number that sounds confident is worse than no number. Every figure we show is traceable to a formula you can read, and it is unit-tested — 135 tests. The AI-driven part of the problem statement is where this goes next: natural-language input, regional-language output, and a conversational 'why?' layer on top of the same engine, with the arithmetic staying in code."

This is a strong position, honestly held. Do not weaken it by overclaiming.

## PLANNED — the LLM layer, if and when it is added

Boundary, non-negotiable:

| The LLM may | The LLM must never |
|---|---|
| Rephrase our output in Hindi or a dialect | Compute any number |
| Interpret a free-text business description | Decide scheme eligibility |
| Answer "why?" from the structured result | Invent a scheme, a rule, an amount or a document |
| Ask for a missing input | Replace a formula |

Intended system role: *a rural micro-enterprise advisory assistant that uses only the provided structured data, distinguishes facts from assumptions, never invents scheme eligibility, never guarantees loans or profits, uses the deterministic outputs verbatim, recommends verification for important claims, and answers in simple language.*

Context to supply: the entrepreneur profile, business profile, location, the computed financial metrics, the risk result, the matched schemes, the market rows and the stated assumptions — i.e. our existing 7-section response, unchanged.

Preferred response shape:

```json
{
  "summary": "...",
  "key_insights": [],
  "financial_explanation": [],
  "scheme_explanation": [],
  "risks": [],
  "actions": []
}
```

---

# 16. Presentation Structure

Recommended 8–10 slides:

1. Title — **अर्थNiti**
2. Problem
3. Who is affected
4. Current gap
5. Our solution
6. How it works
7. Innovation / USP
8. Technology architecture
9. Impact + scalability
10. Demo / future vision

## Key message
Do not spend the presentation explaining technology. Spend it on **problem → insight → solution → demo → impact.**

## Live demo sequence (matches the real routes)

```text
1.  Frame the rural entrepreneur's problem
2.  /profile   — name, language, literacy level
3.  /business  — Tailoring, investment ₹1,00,000, sales ₹30,000, operating expenses ₹18,000
4.  /location  — Uttar Pradesh, Lucknow, a village name, weekly market, "local families"
5.  /finance   — capital ₹50,000, monthly expenses ₹15,000, EMI ₹2,000  → submit
6.  /analysis  — money needed ₹50,000 · profit margin · risk LOW · business health FEASIBLE
7.  /analysis  — scroll to "Your local market": read the district provenance line aloud.
                 This is the hyperlocal claim, on screen, labelled
8.  /analysis  — open "Show detailed calculations" — every figure is traceable
9.  /schemes   — 2 matches at 100%, with reasons, eligibility, documents, official link
10. /advisory  — the recommendations
11. /report    — print preview → this is what the entrepreneur takes to the bank
12. Impact + what comes next (§22)
```

**Do not refresh the browser between steps 5 and 11** (§3).

Have a fallback: a saved PDF of `/report` and the light-mode screenshots, in case a laptop or port misbehaves.

---

# 17. Judge Questions to Prepare For

## "Why AI? Where is the AI?"
Answer honestly, and lead with the design decision — see §15. Then: the *AI-driven* framing of the problem statement is the roadmap — natural-language input, regional-language output, conversational explanation — layered on an engine whose arithmetic stays deterministic. Do not claim a model is running.

## "How do you prevent hallucinations?"
There is nothing to hallucinate. Every number comes from a unit-tested formula; every scheme fact comes from a structured dataset transcribed from an official source with a verification date and a link the judge can open. When we do add a model, it will be allowed to rephrase and explain, never to calculate or to decide eligibility (§15).

## "How is this different from ChatGPT?"
ChatGPT does not know the indicative price of handicrafts in Lucknow, cannot tell you whether *your* EMI fits *your* surplus, and will not tell you when it has no data for your district. अर्थNiti combines structured entrepreneur input, a district-level dataset, deterministic financial calculation, rule-based scheme matching with visible reasons, and a printable next-step plan — and it says out loud when a number is a state-level fallback rather than local.

## "Show me the hyperlocal part."
`/analysis` → "Your local market". Then point at the provenance line. `district` means it is their own district; `state` means we had no district row and said so. **This is the differentiator judges remember**, because most prototypes silently present national averages as local.

## "Is your market data real?"
No — and the app says so on every row: *"Prototype estimate / illustrative data"*, with a date. The scheme data **is** real, transcribed from official portals with `last_verified` dates and official URLs. We chose to label the honest thing rather than dress up nine rows as a national dataset. Scaling this means integrating verified government and open-data sources (§22).

## "Can this replace banks or financial advisors?"
No. It is decision-support and financial-literacy assistance — not a lender, not an approval authority. Scheme eligibility, interest rates and approval are decided by the relevant institution, and the app says so.

## "What if the user should not borrow?"
The engine flags it. A non-positive monthly surplus returns `high` risk with an explicit reason, and an EMI above half the surplus is `high` too. Nothing in the app recommends a loan amount; the recommendations point at reducing expenses, improving margin and keeping a cash reserve before new investment.

## "Why two different expense figures?"
Because a business can be viable while the family is still short of money — see §9. Conflating the two hides exactly the situation the app exists to surface.

## "How do you scale?"
The engine does not change. What changes is data: more districts and states in `market_data.json`, more schemes including state-level ones in `schemes.json`, more categories. Add a database when there is a reason to remember a user, and translation when there is a reason to speak Awadhi.

## "What is not finished?"
Answer it straight: no persistence (a refresh restarts the journey), English-only output, no chat, no EMI scenarios or break-even units, nine market rows in one state, and Agriculture is deliberately unmatched because our schemes genuinely do not cover crop farming. Knowing your own gaps reads as competence.

---

# 18. Product Success Metrics

For the prototype: time to generate an advisory plan (currently one request, sub-second) · journey completion · correctness of financial calculations (135 tests) · correctness of scheme matching (7 of 9 categories, 2 correctly empty) · explanation quality · number of actionable recommendations · demo reliability.

For future production: entrepreneurs assisted · plans generated · financial-literacy improvement · successful formal-finance connections · business survival and growth · **reduction in inappropriate borrowing** — the metric that matters most and the reason the risk indicator exists.

---

# 19. Risk Register (current)

## Demo risks — the ones that can bite on the 11th

| Risk | Mitigation |
|---|---|
| **A page refresh wipes the journey** and every result page empties | Do not refresh. Better: add `sessionStorage` (§25) |
| Deep-linking a result page shows an empty state | Walk the journey from `/profile` |
| Picking **Agriculture** or **Other** on stage shows zero schemes | Use Tailoring or Handicrafts (§3) |
| Picking a district outside UP shows no market data | Use Lucknow |
| Port conflict — a stray uvicorn or Vite process | `netstat` + `taskkill` before starting (§6) |
| `localhost` vs `127.0.0.1` mismatch (uvicorn binds IPv4; `vite preview` may bind `[::1]`) | Try both; pass `--host 127.0.0.1` |
| Four UI paths never clicked by a human | Click them before the 11th (§13) |
| Screenshots are stale — old branding, no market section | Recapture before circulating (§11) |

## Project risks

| Risk | Mitigation |
|---|---|
| **Someone claims an LLM is running** | §15. Whole team reads it |
| Overclaiming Hindi output because the field exists | §2 differentiator 6. We collect the preference; we do not translate |
| Presenting prototype risk thresholds as financial rules | Label them as prototype assumptions every time (§4 Feature 8) |
| Presenting illustrative market prices as verified | The label is in the UI — say it out loud too |
| Late push breaking a teammate's copy | Confirm before pushing near the presentation (§11) |
| Feature creep in the last four days | Feature freeze. §25 is a fix list, not a feature list |
| A contract change silently breaking the UI | Contract tests subscript every key — run `pytest` after any service edit |

---

# 20. Daily Team Ritual

Four days left. Keep it tight.

### 15-minute stand-up
1. What did I finish? 2. What am I doing today? 3. What is blocking me?

### End of day
```text
DONE:
IN PROGRESS:
BLOCKED:
NEXT:
```

### Integration rule
Frontend and backend talk directly about the contract at least once a day. Since **all seven UI sections come from one response**, a single renamed key breaks several pages at once — and the contract tests are the fastest way to find out.

---

# 21. Prototype Data Strategy

A small, high-quality, source-labelled dataset beats a large unverifiable one. That principle is why we ship 9 market rows and admit it.

## Actual coverage

| Category button | Scheme matches | Market rows (UP / Lucknow) |
|---|---|---|
| Retail / Shop | 2 — PMEGP, PMMY | 0 |
| **Handicrafts** | **2** | **1** |
| **Tailoring / Garments** | **2** | **1** |
| Services | 2 | 0 |
| Manufacturing | 2 | 0 |
| Food / Food Processing | 1 — PMFME | 1 |
| Livestock / Dairy | 1 — PMMY | 1 |
| Agriculture | **0** | 0 |
| Other | **0** | 0 |

Handicrafts and Tailoring are the only rows filled in both columns — hence §3.

`/schemes` handles the zero case with an empty state that names what *is* covered (shops and trading, manufacturing, services, food processing, dairy, poultry, beekeeping) and links back to `/business`. It is a redirect, not a dead end.

## Rules for anyone extending the data

1. **Scheme facts need an official source and a `last_verified` date.** No exceptions — this is the fact-checkable dataset.
2. **Never widen eligibility to make a demo look better.** Telling an entrepreneur they qualify for money they cannot get is the worst failure this product can have (§9).
3. **Market rows stay labelled `"Prototype estimate / illustrative data"`** until someone sources a real figure, and then the label changes to the real source.
4. Adding a market row is the cheapest possible coverage win: one JSON object, no code change.

---

# 22. Future Scope

In rough order of value per unit of effort:

1. **Persistence** — `sessionStorage` for the demo; a real database when a user should be remembered across days
2. **Regional-language output** — the language, dialect and literacy fields are already collected and already carried through the response; only translation is missing
3. **The LLM layer under the §15 boundary** — natural-language input, a "why?" explainer, a conversational assistant
4. **Read-aloud output** (`speechSynthesis`) — high impact for low-literacy users, small implementation
5. **Loan and EMI structuring** — suggested financing range, EMI scenarios, cash-flow coverage
6. **Break-even and runway** — needs selling price and variable cost per unit added to the business form
7. **More data** — more districts, more states, state-level schemes, more categories (especially something real for agriculture)
8. Charts, GIS/location intelligence, government open-data integrations
9. Document OCR, server-side PDF generation, a WhatsApp-style interface
10. Offline / low-connectivity mode, financial-literacy modules, longitudinal tracking, human-advisor escalation

---

# 23. Product Vision — and what is live today

`[LIVE]` runs in the repository today. `[PLANNED]` does not.

```text
                 RURAL ENTREPRENEUR
                         ↓
        Text input, English UI            [LIVE]
        Voice / regional language         [PLANNED]
                         ↓
                 Entrepreneur Profile     [LIVE]
                         ↓
                 Business Understanding   [LIVE — structured form, not free text]
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
       Hyperlocal Data        Financial Data
       [LIVE — 9 rows,        [LIVE — user input]
        UP only]
              ↓                     ↓
              └──────────┬──────────┘
                         ↓
                  ADVISORY ENGINE         [LIVE — deterministic Python]
                         ↓
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      Business       Financial       Scheme
      Feasibility    Structuring     Matching
      [LIVE]         [PARTIAL —      [LIVE — 3 schemes]
                      gap + risk,
                      no EMI plan]
          ↓              ↓              ↓
          └──────────────┼──────────────┘
                         ↓
                Explainable Advice        [LIVE — rule-based reasons]
                         ↓
                    Risk Check            [LIVE]
                         ↓
                  Action Plan             [LIVE — printable report]
                         ↓
             RURAL BUSINESS GROWTH
```

---

# 24. Team Decision Rules

1. Prefer features that directly solve the entrepreneur's problem.
2. **Prefer deterministic calculation over generated numbers.** This is now the product's identity, not just a rule.
3. **Prefer verified data over impressive-looking fake data**, and label anything indicative.
4. Prefer one polished workflow over many unfinished features.
5. Integrate early; the contract is shared.
6. **No new features before the 11th.** Fixes and rehearsal only.
7. If a feature cannot be demonstrated clearly in under 60 seconds, question whether it belongs.
8. **Never make the demo look more capable than the build.** An honest gap is defensible; a discovered overclaim is not.

---

# 25. Remaining Work Before 11 September

Ordered by demo impact. **Fixes and rehearsal only — no new features.**

### Should happen
- [ ] **`sessionStorage` persistence in `AppContext`.** Removes the single largest demo risk: a refresh no longer wipes the journey, and result pages become directly openable for rehearsal. Small change, large payoff (§3)
- [ ] **Manual click-through of the four unverified paths** — category error + scroll, catch-all page, API timeout, print PDF (§13)
- [ ] **Three full rehearsals** on the presentation laptop, in the presentation browser
- [ ] **Whole team reads §15** so nobody misstates the AI position
- [ ] **Recapture the 27 screenshots** — the current set shows the old branding and stale numbers (§11)

### Nice to have
- [ ] A second and third demo scenario — a moderate-risk and a high-repayment-pressure persona, to show the risk engine actually moving
- [ ] Two or three more market rows so Retail, Services and Manufacturing are not empty in the market section
- [ ] One mobile-width pass
- [ ] Refresh `docs/frontend_integration.md` (stale on CORS and on the number of response sections) or delete it

### Explicitly not doing before the 11th
LLM integration · a database · Hindi translation · charts · EMI scenarios · break-even units · frontend tests.

---

# 26. AI Continuity Instructions

Any AI assistant reading this file should:

- Treat **[CLAUDE.md](CLAUDE.md)** as the authoritative engineering context and this file as the product/team context. CLAUDE.md is more likely to be current on code detail.
- **Never describe अर्थNiti as using an LLM.** It does not (§15). If asked to "improve the AI", ask whether that means wiring up a model or improving the rules.
- Remember there is **no database and no persistence**. Do not suggest a migration, an ORM model, or a query.
- Keep financial calculations deterministic and unit-tested. Never move arithmetic into a model.
- **Never widen scheme eligibility** to make output look more complete (§9, §21).
- Guard on the raw value before printing a number. The backend sends `null` for anything it could not compute, and `Number(null)` is `0` — a naive guard turns "could not compute" into a confident, favourable `0%`. This has been a live bug twice.
- Prefer changes that make the demo path work end to end and read clearly on a projector over refactors and infrastructure. The milestone is **11 September 2026**.
- **Ask for explicit confirmation before any action that changes the GitHub repository** — push, PR, branch or tag creation or deletion, releases, settings. Local commits when requested are fine. Approval for one push does not carry to the next. Six people share this repo.
- Run `pytest` after any service or schema edit; run `npm run lint` and `npm run build` after any frontend edit.
- Clean up any server you start (§6).
- When suggesting code, name the exact file path. When changing architecture, explain why and update this file in the same commit.

---

# 27. Current Status — 7 September 2026

**Phase:** working prototype, feature-frozen except polish
**Time to presentation:** 4 days (11 September 2026)
**Branch:** `aryan-ui-redesign`

| | |
|---|---|
| **MVP status** | **Working end to end.** 9 routes, one API call, 7 populated result sections |
| **Backend** | 8 routers · 135 tests passing in ~0.9s |
| **Frontend** | Lint clean · production build clean |
| **Data** | 3 schemes (official sources, verified 1 Sept) · 9 market rows (illustrative, UP only) |
| **AI integration** | **None, by decision.** Deterministic rules engine (§15) |
| **Database** | **None.** In-memory client state only |
| **Language output** | English only. Preference is collected, not applied |
| **Known defects** | 17 found and fixed on 7 September (10 numbered + 7 more). See CLAUDE.md |
| **Still open** | No persistence · Agriculture/Other match nothing (correct) · 4 paths unclicked · mobile unverified |
| **Presentation** | In progress — Saad + Tripti. `presentation/` is still empty |

**Next milestone:** add `sessionStorage`, click the four unverified paths, then rehearse three times (§25).

**The team:** Saad — presentation · Tripti — presentation/research · Netra — frontend · Anmol — frontend · Aryan — backend · Manjeet — backend.

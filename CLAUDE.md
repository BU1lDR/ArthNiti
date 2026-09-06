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
| SQLite/Postgres, 6 entities | No database. No persistence of any kind. |
| Recharts / charts on the results pages | Not used. Results are cards and numbers. |
| Hindi / regional-language output | English only. The preference is collected and echoed, never applied. |

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

Note `uvicorn --host 127.0.0.1` binds IPv4 only; `vite preview` may bind `[::1]` only. If a URL refuses while the server is clearly up, that mismatch is usually why — try `localhost` vs `127.0.0.1`, or pass `--host 127.0.0.1`.

---

## Architecture

```
backend/app/
  main.py                 FastAPI app + CORS + 8 include_router calls
  api/routes/             8 routers (one file each)
  schemas/                Pydantic request/response models
  services/               all business logic — pure functions, no classes, no I/O
  core/data_loader.py     loads JSON from app/data (absolute path, cwd-independent)
  data/                   schemes.json (3 schemes), market_data.json (9 rows)
backend/tests/            25 files, 135 tests
frontend/src/
  App.jsx                 shell (topbar/main/footer) + JourneyBar + LandingPage + 9 routes + a `*` catch-all
  context/AppContext.jsx  the entire client state, in memory only
  pages/                  8 page components
  components/Button.jsx   the only shared component
  services/api.js         the only network call in the app
  index.css               design tokens + the .ui-* design system
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

`/` landing → 4-step journey `/profile` → `/business` → `/location` → `/finance` → then 4 result pages `/analysis`, `/schemes`, `/advisory`, `/report`, plus a `*` catch-all rendering `NotFoundPage`. The single API call fires on the `/finance` submit ([FinancePage.jsx](frontend/src/pages/FinancePage.jsx)).

Nothing guards the journey order: the topbar nav links straight to any step, so `/finance` can be submitted with an empty `business_category` and `state`. That returns 422, which `api.js` now renders as a readable sentence rather than `[object Object]`.

### State is in memory only — this shapes every demo

`AppContext` is a plain `useState` with no localStorage, no sessionStorage, no URL params ([AppContext.jsx](frontend/src/context/AppContext.jsx)). `profile` holds `name`/`language`/`dialect`/`literacyLevel`; **state and district live only on `location`** — they used to be duplicated on `profile` and asked for twice. Consequences:

- **A page refresh wipes everything** and every result page falls back to its "not ready yet" empty state.
- The result pages cannot be reached directly or demoed in isolation. To see a populated `/report`, you must walk all four forms again.
- This is the largest remaining structural risk to the demo. Adding `sessionStorage` persistence would remove it, and nothing has been done about it yet.

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

### Formulas and thresholds

All deterministic, all unit-tested. Keep them that way — never move arithmetic into a model.

- `monthly_profit = expected_monthly_revenue - monthly_expenses`; margin = profit/revenue×100, 0 when revenue is 0 ([financial_service.py](backend/app/services/financial_service.py))
- `funding_gap = max(initial_investment - available_capital, 0)` — clamped, so surplus capital reads as no gap rather than a negative one. `/report` prefers this over its own client-side sum so the two pages cannot disagree.
- `pressure_ratio = monthly_emi / monthly_surplus × 100`; **<30 low, 30–50 moderate, >50 high**. Non-positive surplus short-circuits to `high` with `pressure_ratio_percent: None` ([risk_service.py:5-24](backend/app/services/risk_service.py#L5-L24))
- `estimated_roi_percent = (monthly_operating_surplus × 12) / initial_investment × 100`, or `None` when investment is 0 ([business_service.py:30-35](backend/app/services/business_service.py#L30-L35))
- Observation/advice text is chosen by margin bands at 10% and 30% ([business_service.py:63-71](backend/app/services/business_service.py#L63-L71), [advisory_service.py:23-31](backend/app/services/advisory_service.py#L23-L31))
- Scheme score: +60 if category matches, +40 more if state matches. No match returns `0, []` and the scheme is dropped ([scheme_service.py](backend/app/services/scheme_service.py))
- Category matching runs the user's pick through `CATEGORY_SYNONYMS` first, then keeps the substring test. The map only bridges wording (`retail` → `trading`, `handicraft`/`tailoring` → `manufacturing`, `livestock` → `dairy`); **it must never widen real eligibility.** That is why plain `agriculture` still matches nothing — PMEGP and PMMY cover allied activities like dairy, poultry and beekeeping, not crop farming.
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

Agriculture and Other still match nothing, and that is deliberate — see the eligibility warning under Formulas. `/schemes` now handles it with an empty state that names what *is* covered and offers a link back to `/business`, instead of a dead end.

**3. FIXED — `market_context` was computed and then silently discarded.** No frontend file read it, so the hyperlocal data never reached the UI even though "Hyperlocal" is the first differentiator in `OUR_MVP.md` §2. Now rendered on `/analysis` (a "Your local market" section with `MarketCard`) and inside `/report`'s local-market section (`MarketRow`). The exact-district requirement was also relaxed to the tier described under Formulas, and `market_data.json` grew from 5 rows to 9 (added Lucknow × {handicrafts, tailoring}, Varanasi × {handicrafts, food processing}). Every row is labelled `"source": "Prototype estimate / illustrative data"` — keep it that way; the data is illustrative and the UI says so.

**4. FIXED — `/analysis` showed ₹0 where `/report` showed a real number.** `financial_analysis` carried only four keys, so `funding_gap`, `expected_monthly_revenue` and `monthly_expenses` all read `undefined`, and `formatCurrency` printed `'₹0'` — a confident, wrong, reassuring number. Fixed on the backend by computing and returning all four (`calculate_financial_metrics` now takes `initial_investment`, default 0). `formatCurrency` on `/analysis` also now returns "Not available" for a missing value instead of `₹0`.

**5. FIXED — `/report` always showed "Monthly revenue: Not Available."** It read `finance.monthlyRevenue`; the value lives at `business.monthlyRevenue`.

**6. FIXED — `a { color: inherit }` defeated every Tailwind `text-*` utility on anchors, app-wide.** The reset was **unlayered**, and unlayered author CSS beats everything in `@layer utilities` regardless of specificity. Verified before the fix: a link asking for `#00804c` computed to `rgb(22,49,38)`. Now wrapped in `@layer base` together with the other element resets — confirmed in the built CSS, at brace depth 1 inside `@layer base{`, with `.text-white` landing later in `@layer utilities`. The `:focus-visible` outline was deliberately **left unlayered** so a stray `focus:outline-none` cannot remove the keyboard focus ring.

**7. FIXED — `/analysis` scheme cards dropped match reasons and eligibility.** Its `SchemeCard` read `scheme.reason` and `scheme.eligibility`; the backend returns `match_reasons[]` and `eligibility_rules[]`, so both rendered as nothing. Now renders match reasons as a checked list and eligibility rules joined with `·`.

**8. FIXED — `Button` bypassed the theme tokens.** It hardcoded `bg-green-600 hover:bg-green-700 text-white`. Now `bg-[var(--color-primary-strong)]` via a `variant` prop (`primary` | `secondary`). The four call sites that used to pass their own `bg-*`/`text-*` classes were converted to `variant="secondary"`, which removes the real hazard: two competing utilities land in the same cascade layer, where **stylesheet order decides the winner, not class-attribute order.** Don't reintroduce colour overrides at call sites — add a variant.

**9. FIXED — `/report` cards split across print page breaks.** `index.css` now has an `@media print` block: `break-inside: avoid` on the card classes, app chrome hidden, `<details>` forced open so the detailed figures reach the PDF, and the theme tokens reset to light values so a dark-mode laptop still prints on white.

**10. FIXED — dead scaffolding removed.** `frontend/src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg` deleted. Note `src/assets/hero.png` and `public/icons.svg` are also unreferenced but were **left in place** — they may be a teammate's in-progress work.

### Still open

- **In-memory-only state.** See the section above. A refresh wipes the demo. This is the biggest remaining risk.
- **Agriculture and Other match no schemes.** Correct behaviour, mitigated by the empty state. Only fixable with real scheme data for those activities.
- **Four things need a manual click-through** — no browser automation is installed, so these were verified by reading code and by build/lint/test only: the `/business` category error message and its scroll-into-view, the `*` catch-all page, the `api.js` timeout path, and the print PDF layout.
- **Mobile is not pixel-verified.** Desktop widths only.

### Also fixed 7 Sept 2026 (found after the list above was written)

These were separate from the numbered list. Recorded so nobody re-diagnoses them.

- **`[object Object]` in the error banner.** See the 422 note in the data contract above.
- **No request timeout.** `api.js` now uses `AbortSignal.timeout(20000)` with its own message.
- **Backend `null` rendered as `0%` and as the literal `Null%`.** See the null-guard convention below.
- **No catch-all route** — a typo'd URL rendered the shell with a blank body. `NotFoundPage` now handles `*`.
- **`aria-hidden="true"` on a `required` control.** `BusinessPage` had a `sr-only` mirror input to make native validation cover the button-based category picker. Replaced with an explicit check in `handleContinue` plus a visible `role="alert"` message.
- **State and district were asked twice**, on both `/profile` and `/location`. Removed from profile; `district` is now `required` on `/location` to preserve what profile used to guarantee.
- **The two expense questions were indistinguishable.** Both now carry hint text: business-only costs on `/business`, everything-including-household on `/finance`.

### Safest demo configuration

**Handicrafts or Tailoring, in Uttar Pradesh / Lucknow.** Measured against the live backend after the 7 Sept fixes, that is the only pick that fills *every* section: 2 scheme matches at 100% plus a district-level market row. Before the fixes no single category managed both, and the old advice ("pick Manufacturing") left the new market section empty.

Give the location step a village name, a market type and a customer description too — all three flow into `market_context[].local_context` and are printed back.

Avoid **Agriculture** and **Other**: both legitimately match no schemes and no market rows. **Retail** now matches 2 schemes but still has no market row.

Verified end to end with `tailoring` / Uttar Pradesh / Lucknow: 200, 7 top-level keys, `funding_gap` 50000, 2 schemes at 100 with populated `match_reasons` and `eligibility_rules`, 1 market row at `match_level: "district"`, `risk_level: low`, `estimated_roi_percent: 126.0`.

---

## Conventions

Match the surrounding file; the two halves of the codebase have genuinely different styles.

**Backend.** Plain module-level functions, no classes, no framework magic. Type hints on parameters, none on returns. Services return plain `dict`s. Numeric outputs are `round(x, 2)`. Routers are one file per domain with `APIRouter(prefix="/api/<domain>", tags=[...])`. Services never touch FastAPI, and routes never do arithmetic. `str | None` syntax is fine (Python 3.14).

**Frontend.** Function components, no TypeScript, no prop types. Named helper components live at the bottom of the page file that uses them (`MetricCard`, `SectionHeading`, `DetailRow`, `SummaryCard`, `MarketCard`, `MarketRow`). Formatters (`formatCurrency`, `formatPercent`, `formatText`, `hasNumber`) are duplicated per page by design. Colors always go through `var(--color-*)`, never literal hex. `ReportPage.jsx` is deliberately written one-element-per-line and dense — preserve that when editing it.

**Guard on the raw value before printing a number, never on `Number.isFinite` alone.** The backend sends `None` for anything it could not compute, which arrives as JSON `null` — and `Number(null)` is `0`, which *passes* `Number.isFinite`. So a naive formatter turns "could not compute" into a confident `0%`, the most favourable possible reading. A `!== undefined` check has the same hole and yields the literal string `"null%"`. Both were live bugs. Use `hasNumber(value)`, which rejects `null`, `undefined` and `''`. The two fields that go null are `risk_analysis.pressure_ratio_percent` (non-positive surplus) and `business_analysis.estimated_roi_percent` (zero investment). A genuine `0` must still render as `0%` — don't collapse real zeros into "Not available".

**ESLint 10 enforces `preserve-caught-error`.** If you bind a caught error and throw a new one, pass `{ cause: error }` or the lint fails. Bare `catch {}` with no binding is exempt.

**CSS cascade layers — read this before touching `index.css`.** Tailwind v4's `@import "tailwindcss"` emits `@layer theme, base, components, utilities`. **Unlayered author declarations beat all layered ones regardless of specificity.** This cuts both ways and explains four separate things: the default card padding sits inside `@layer components` so a call-site `p-5` or `p-0` still wins; `.ui-feature-card { padding: 22px }` is unlayered so it beats that default; the element resets now sit in `@layer base` so `text-*` utilities win on anchors (defect 6); and the `:focus-visible` outline is deliberately left unlayered so it cannot be removed by `focus:outline-none`. When adding a `.ui-*` rule meant to be overridable by Tailwind, put it in `@layer components`; when adding an element reset, put it in `@layer base`.

**Two competing Tailwind utilities for the same property do not resolve by class-attribute order** — they land in the same layer, and generated-stylesheet order decides. That is why `Button` uses a `variant` prop rather than accepting `bg-*` from call sites. If you catch yourself passing a colour class to a component that already sets one, add a variant instead.

**Print styles live in the `@media print` block at the end of `index.css`.** Anything added to `/report` that is a card needs to be covered by the `break-inside: avoid` selector list, or it will split across a page break in the PDF.

**Design system** (`index.css`): `.ui-shell`, `.ui-topbar(-inner)`, `.ui-brand(-mark|-name)`, `.ui-main`, `.ui-page-intro`, `.ui-eyebrow`, `.ui-page-title`, `.ui-page-subtitle`, `.ui-card`, `.ui-card-soft`, `.ui-simple-grid`, `.ui-feature-*`, `.ui-progress*`, `.ui-disclosure(-body)`, `.ui-icon-button`, `.ui-footer`. Theme is `[data-theme="dark"]` on `<html>`, toggled and persisted under `localStorage['sih-theme']` ([App.jsx:27-46](frontend/src/App.jsx#L27-L46)).

**UI copy is for low-literacy users, and that is a product requirement, not a style preference.** Plain language over jargon ("Money needed", "Money left each month", not "funding gap" / "net surplus"). Advanced detail hides inside `<details className="ui-disclosure">`. Every page carries a back link and a "Step N of 4" marker. Don't "improve" labels into financial terminology.

---

## Tests

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q     # 135 passed in ~0.9s
```

Backend only — there are no frontend tests. `test_frontend_contract.py` and `test_mvp_api_contract.py` pin the response shape by subscripting every key, so **removing or renaming a response key raises `KeyError` and fails them** — that is intended, and it is the fastest way to check whether a contract change is safe. Note the corollary: they assert only that the documented keys are *present*, so **adding** keys passes silently. Run the suite after any service or schema edit.

That corollary is exactly why defect 4 survived so long: `test_frontend_contract_financial_section` asserted precisely the four keys the backend happened to return, encoding the *current* behaviour rather than what the UI needed. It now also asserts the four added keys plus `funding_gap == 0` for the surplus case, and `test_frontend_contract_funding_gap_when_capital_falls_short` pins the shortfall case against `/report`'s own arithmetic.

Some tests pin user-visible **wording**, not behaviour, and are meant to be edited alongside a copy change — `test_scheme_service.py` asserts substrings of `match_reasons`. Those strings now appear on `/analysis` (defect 7), so they are UI copy and bound by the plain-language rule. Two market tests were also rewritten when the district fallback landed: `test_market_context_falls_back_to_the_same_state` replaced one that asserted `[]` for UP/Kanpur.

`httpx2` in `requirements.txt` is correct and intentional, not a typo for `httpx` — it is the httpx 2.x line published by the pydantic org, and Starlette 1.6 uses it directly. `import httpx` fails in this venv while `TestClient` works.

---

## Git

Current branch is typically `aryan-ui-redesign`. Remote branches are per-person: `netra`, `saad`, `tripti`, `Manjeet` (capital M), `aryan`, `aryan-frontend`, `aryan-ui-redesign`, plus `main`, `backend`, `frontend`, `before-main`. Team ownership per `OUR_MVP.md` §10 — Netra & Anmol frontend, Aryan & Manjeet backend, Saad & Tripti presentation/research. Note §11 there records the real branch scheme; the blueprint's `develop` + `frontend/<name>` layout was never adopted.

Never commit directly to `main`. Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots`.

`screenshots/{light,dark,light-expanded}/` holds 27 full-page PNGs (9 routes × 3 passes, 2880px wide) captured for teammate review. **They predate the 7 Sept fixes and now show the old Sahyog branding, no market section and ₹0 on `/analysis`** — recapture before circulating them again. It is gitignored, so hand it over as a zip rather than a repo link. Desktop widths only — mobile is not pixel-verified. `presentation/` exists but is empty.

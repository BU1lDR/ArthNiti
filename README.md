# अर्थNiti

**AI-Driven Hyper-Local Business Advisory and Financial Structuring Assistant for Rural Micro-Entrepreneurs** — Smart India Hackathon 2026.

A web app a rural micro-entrepreneur — a tailor, a weaver, a dairy farmer — can open on a cheap phone, answer sixteen plain-language questions in their own language, and get back four things: whether the business makes money, how risky the loan repayment is, which government schemes they are actually eligible for, and a printable one-page sheet to carry to a bank.

Runs in **8 Indian languages** with a dialect phrase layer. Matches against **30 real government schemes across all 7 administrative tiers**, from Central ministries down to the Gram Panchayat counter.

> **Next milestone: internal college round presentation, 11 September 2026.** This is demo-driven prototype work judged by a panel — not production software.

### One thing to be straight about

**There is no LLM in this build.** Every number and every sentence the user sees is produced by hand-written deterministic Python `if`/`else` in `backend/app/services/` — no model call, no SDK, no API key, no inference endpoint. That is a defensible position for this round and `OUR_MVP.md` §15 argues it, but do not describe the app as using generative AI. If you are asked to "improve the AI", find out first whether the ask is to wire up a real model or to improve the rules.

There is also **no database**. All client state lives in the browser's `sessionStorage`.

---

## Quick start

Two processes. Backend first. Everything below is from the **repo root** in Git Bash (the whole team is on Windows).

**Prerequisites**

| | Version here | Notes |
|---|---|---|
| Python | 3.14.6 | |
| Node | 24.18.1 | 24+ is **required** — the verifier scripts rely on a global `WebSocket` |
| npm | 11.16.0 | |
| Edge | any current | only needed for the browser verifiers |

There is no `.env` to fill in, no API key to obtain and no database to provision.

**`.venv/` and `node_modules/` are gitignored, so a fresh clone has neither.** Create both once:

```bash
# 1. the virtualenv, at the repo root — every command below expects it exactly here
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt

# 2. frontend deps
cd frontend && npm install && cd ..
```

You never need to *activate* the venv — every command in this file calls `.venv/Scripts/python.exe` directly, which works from any shell.

> **`httpx2` in `backend/requirements.txt` is not a typo for `httpx`.** It is the httpx 2.x line published by the pydantic org, and Starlette 1.6 uses it directly. In this venv `import httpx` fails while FastAPI's `TestClient` works — so don't "correct" it.

**Run it** — two terminals, backend first:

```bash
# terminal 1 — from ./backend
cd backend && ../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 2 — from ./frontend
cd frontend && npm run dev
```

Open **http://localhost:5173**. API docs are served at http://127.0.0.1:8000/docs (Swagger), `/redoc` and `/openapi.json`. A one-line check that the backend is really up:

```bash
curl http://127.0.0.1:8000/health
```

The frontend hardcodes `http://127.0.0.1:8000` as its API base, overridable with a `VITE_API_BASE_URL` env var if you ever need to point it elsewhere. Requests give up after **20 seconds** and show a timeout message rather than hanging.

> Use `localhost:5173`, not `127.0.0.1:5173` — Vite may bind `[::1]` only. The backend is the reverse: `uvicorn --host 127.0.0.1` is IPv4-only. If a URL refuses while the server is plainly up, that mismatch is usually why.

**Always kill what you start.** A stray listener on 8000 gives `[Errno 10048] only one usage of each socket address`; a stray Vite server gives confusing CORS failures against a backend that looks fine. Both have broken this environment before.

```bash
netstat -ano | grep -E ':8000|:5173|:4173'
taskkill //F //T //PID <pid>          # doubled slashes under Git Bash
```

**Other commands**

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q   # 171 tests, ~0.9s
cd frontend && npm run build                                   # production build → frontend/dist
cd frontend && npm run lint                                    # ESLint 10
cd frontend && npm run preview                                 # serve the build on 4173
```

> **`cd backend` first is not optional for pytest.** Run it from the repo root and you get **25 collection errors** — the tests import `app.*`, and there is no `pyproject.toml` or `conftest.py` putting `backend/` on the path. The errors look like a broken test suite and are purely a working-directory problem.

There is no CI, no Makefile and no Dockerfile. The commands above are the only way to run anything here.

---

## The demo path

Landing → *(optional)* `/login` → a four-step journey → four result pages.

| # | Route | What it asks / shows |
|---|---|---|
| — | `/` | landing, with the instruction manual and a dialect picker |
| — | `/login` | name, phone, address, email. **Not authentication** — no password exists; it carries the name into step 1 |
| 1 | `/profile` | name, language, dialect, reading comfort |
| 2 | `/business` | kind of work, investment, expected revenue, running costs, employees, debt |
| 3 | `/location` | state → district (cascading), village, rural/semi-urban/urban, market type, customers |
| 4 | `/finance` | capital in hand, household+business costs, EMI — **the submit here fires the only API call in the app** |
| → | `/analysis` | profit, margin, risk, feasibility, local market rows, charts |
| → | `/schemes` | matched schemes grouped by administrative tier |
| → | `/advisory` | the recommendations and next step |
| → | `/report` | a one-page printable sheet |

Anything else renders a 404 page. **Nothing guards the journey order** — the nav links straight to any step, so `/finance` can be submitted empty, which returns 422 rendered as a readable sentence.

**Safest demo configuration: Food Processing, Handicrafts or Tailoring, in Uttar Pradesh / Lucknow.** Those fill every section — 14–16 schemes across 6 of the 7 tiers, both match scores present, plus a district-level market row. Give the location step a village name, a market type and a customer description too; all three are printed back. Switching language on a *result* page is the strongest single moment in the walkthrough, because the generated advice and the scheme text change too, not just the labels.

---

## Repo map

| Path | What is in it |
|---|---|
| `backend/app/main.py` | FastAPI app, CORS, 8 `include_router` calls |
| `backend/app/api/routes/` | 8 routers, one file per domain |
| `backend/app/schemas/` | Pydantic request/response models |
| `backend/app/services/` | **all business logic** — pure functions, no classes, no I/O |
| `backend/app/core/data_loader.py` | cached JSON loading; what it returns is **shared, treat as read-only** |
| `backend/app/data/` | `schemes.json` (30 schemes), `market_data.json` (9 rows) |
| `backend/tests/` | 25 files, 171 tests |
| `frontend/src/App.jsx` | shell, chrome, 10 routes + catch-all |
| `frontend/src/pages/` | 9 page components |
| `frontend/src/components/` | `Button`, `BrandMark`, `BrandWordmark`, `InstructionManual`, `Charts`, `chartData` |
| `frontend/src/context/AppContext.jsx` | the entire client state, mirrored to `sessionStorage` |
| `frontend/src/i18n/` | 8 languages, 4 dictionary files, the `t()` / `tBackend()` provider |
| `frontend/src/data/indiaLocations.js` | 36 states/UTs, 768 districts |
| `frontend/src/services/api.js` | the only network call in the app |
| `frontend/src/index.css` | design tokens, the `.ui-*` design system, `@media print` |
| `tools/` | 21 verification scripts — see [tools/README.md](tools/README.md) |
| `presentation/` | empty — Saad + Tripti |

---

## Architecture

**Backend — FastAPI, 8 routers, but the frontend calls exactly one of them.** Everything funnels through `POST /api/analysis/run`, which returns **7 top-level sections**: `financial_analysis`, `risk_analysis`, `business_analysis`, `market_context`, `scheme_matches`, `advisory`, `mvp_summary`.

| Endpoint | Called by the frontend |
|---|---|
| `POST /api/analysis/run` | **yes — the only one** |
| `GET /health` | no |
| `POST /api/entrepreneur/profile` | no |
| `POST /api/business/analyze` | no |
| `POST /api/financial/analyze` | no |
| `POST /api/schemes/match` | no |
| `POST /api/advisory/recommend` | no |
| `POST /api/market/context` | no |

The seven unused routers are thin wrappers over the same services and are covered by tests. Don't delete them, but don't assume a change there shows up in the UI.

CORS allows any loopback port via `allow_origin_regex`. Replace with an explicit list before any real deployment.

**Frontend — React 19 + Vite 8 + Tailwind 4 + react-router 7.** No TypeScript, no charting library, no i18n library, no state library, no frontend test framework — all deliberate. Charts are hand-rolled on CSS in `components/Charts.jsx` so they survive dark mode and `window.print()`, and every chart prints its number as text beside the bar.

Client state lives in `AppContext` and is mirrored into `sessionStorage`, **not** `localStorage` — someone's revenue, debt and EMI must not sit on a shared demo laptop after they walk away, and a closed tab is a clean slate between two judges. Within one tab it survives a refresh. Language, dialect, theme and text size *do* use `localStorage`, because a UI preference is not financial data.

**The interface is deliberately modelled on Indian e-governance portals** — masthead, tricolour band, persistent utility bar, breadcrumbs, dense footer. The reason is that a rural user has met that visual language before on a real service and knows how to read it.

---

## The data

**30 schemes across all 7 tiers** in `backend/app/data/schemes.json`:

| Tier | Count | Examples |
|---|---|---|
| `central` | 9 | PMEGP, PMMY, PMFME, PM Vishwakarma, Stand-Up India, KCC |
| `state` | 7 | UP Mukhyamantri Yuva, Maharashtra CMEGP, Tamil Nadu NEEDS, Karnataka Udyogini |
| `regional` | 2 | UNNATI (North East), Vibrant Villages (border blocks) |
| `district` | 4 | District Industries Centre, RSETI, Krishi Vigyan Kendra, ODOP |
| `sub_district` | 2 | Tehsil/Taluka certificate counter, Sub-Divisional agriculture office |
| `block` | 3 | BDO / NRLM SHG desk, Block Level Bankers' Committee, ATMA block unit |
| `local_body` | 3 | Gram Panchayat trade licence, Common Service Centre, PM SVANidhi |

Availability is **gated before scoring** on two axes — the entrepreneur's state and whether they work rural / semi-urban / urban. Showing a UP-only subsidy to a Kerala entrepreneur as a "60% match" is worse than not showing it: they would spend a trip to the block office on it.

`market_data.json` holds **9 rows**, and it is worth knowing exactly how thin that is: **all nine are Uttar Pradesh** — 5 for Lucknow, 4 for Varanasi — across 5 categories. So a district row falls back to a state row where possible, and **35 of the 36 states/UTs show the market section's empty state**, correctly. That is a data-coverage limit, not a bug, and it is the reason the safest demo location is UP/Lucknow.

Every row is labelled `"Prototype estimate / illustrative data"` and the UI prints that label on the page. Keep it that way — the honesty about provenance is part of the pitch, not something to tidy up.

## Languages

**8 languages** — `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn`. **The default is Hindi**, not English, because that is who this is for; English is the fallback.

**619 distinct keys across 4 dictionary files, all 8 languages at full parity** — verified by script, not by self-report. Backend-generated prose is translated too: every service sentence carries a translation code resolved through `tBackend()`.

The **dialect layer is a curated phrase layer, not a translation** — 9 of the 30 listed varieties override a handful of the highest-visibility strings. Say "dialect-aware phrasing" in the demo, not "translated into Bhojpuri".

Digits stay Latin and money stays `en-IN`-grouped even in Tamil, because that is what is printed on Indian currency and on government forms.

```bash
node tools/parity4.mjs     # key parity, 4 files x 8 languages, 5 checks, no server
node tools/keycheck.mjs    # the other half: does every key the code ASKS for exist
```

---

## Verifying

`npm run lint`, `npm run build` and `pytest` structurally cannot see a leaked translation key, a `null%`, a page that scrolls sideways under a thumb, a `₹30,000` that wrapped as `₹30,00 / 0`, a logo that prints invisible, or a transition that silently does nothing. **21 zero-dependency scripts in `tools/` cover those.** Full guide and traps: **[tools/README.md](tools/README.md)**.

On a fresh clone, in this order:

```bash
node tools/parity4.mjs                 # 1. no server, ~1s, fastest real signal
node tools/verify/refresh-cases.mjs    # 2. needs the BACKEND — generates the test fixtures
node tools/verify/drive.mjs            # 3. needs VITE — the main gate, 36 page loads
node tools/verify/mobile-audit.mjs     # 4. needs VITE — phone widths, 40 page loads
```

Step 2 is not optional: it generates fixtures that are deliberately untracked, and **five of the browser drivers cannot run until you do it**.

Run the browser verifiers after any UI change, and `refresh-cases.mjs` after any change to the services, the schemas or `schemes.json`.

---

## Which doc to read

| File | What it is | Read it when |
|---|---|---|
| **this file** | the front door | you just cloned it |
| [CLAUDE.md](CLAUDE.md) | the code view — every trap, every reason, every measured figure | you are about to edit code |
| [OUR_MVP.md](OUR_MVP.md) | the product/team view — demo script, judge answers, feature-by-feature built/not-built | you are presenting, or need the team split |
| [tools/README.md](tools/README.md) | the verification suite | a verifier fails, or you are adding one |
| `docs/frontend_integration.md` | **stale.** Says CORS allows two fixed origins (it's a loopback regex) and that the response has five sections (it has seven) | — |
| `frontend/README.md` | unmodified Vite boilerplate | — |
| `docs/requirements.txt` | one sentence of prose, unrelated to `backend/requirements.txt` | — |

**Keep this README current.** A change that adds a route, a language, a scheme tier, an endpoint, a verifier script or a dependency is not finished until this file reflects it. The counts above are the ones that have gone stale before — re-measure with `node tools/parity4.mjs`, `pytest tests -q` and `ls tools/*.mjs tools/verify/*.mjs | wc -l` rather than editing a number by hand.

---

## Team and git

| Who | Owns |
|---|---|
| Netra, Anmol | Frontend |
| Aryan, Manjeet | Backend |
| Saad, Tripti | Presentation, product story, research |

The working branch is **`before-main`** — everything described in this file lives there, and it is what to check out. The remote has two branches, `before-main` and `main`.

**`main` has diverged from `before-main`, it is not simply behind it.** `git rev-list --left-right --count main...before-main` reports **1 / 166**: `before-main` carries 166 commits `main` lacks, but `main` also carries one that `before-main` lacks. So merging is a real merge, not a fast-forward — don't reason about it as "main is 166 commits behind".

**Never commit directly to `main`.** The repo is private and shared with six people, so a push lands in everyone's working copy — say so before you push. Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots/`.

`screenshots/` is where the verifier scripts write their PNGs and reports. It is ignored because it reaches several gigabytes of browser-profile data; the scripts themselves live in `tools/` and are tracked.

---

## Known limits

Honest list, so nobody is surprised by a question at the round:

- **No LLM, no database, no authentication.** All three are architectural choices for this milestone, documented above.
- **Non-English wording is unreviewed by a native speaker.** Parity, placeholder integrity and identical-to-English are all script-verified; *naturalness* is not. Two real errors have already been found by eye, which is evidence there are more.
- **Dialect coverage is 9 of 30 varieties**, each a handful of phrases.
- **The market data is illustrative** — 9 rows, all of them Uttar Pradesh, and the UI labels them as prototype estimates. Everywhere else shows an empty market section.
- **Nothing guards the journey order**, and result pages cannot be deep-linked from a cold tab.
- **Unverified on phones:** landscape orientation, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.
- **A typed-in "Other" business category matches no schemes.** That is correct behaviour, and there is an empty state for it.

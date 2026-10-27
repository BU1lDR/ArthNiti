# अर्थNiti

Hyper-local business advice and financial structuring for rural micro-entrepreneurs. An individual project by Aryan Verma, entered in the [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon), Indie Track.

Someone running a small business in a village — a tailor, a weaver, a woman keeping four buffaloes — opens this on a cheap Android phone, answers nineteen plain questions in their own language, and gets four things back:

- whether the business actually makes money
- how risky the loan repayment looks, counting the loan they would need if they do not yet have all the money the plan requires (at an assumed 12% over 5 years, which the page states), and, if they give their household's monthly income, whether the household's loan repayments stay within half of it
- which government schemes cover their kind of work where they live, from Central ministries down to the Gram Panchayat counter (it checks the kind of work and the place, not full eligibility)
- a one-page sheet to print and carry to a bank

Eight Indian languages, with dialect-aware phrasing layered on top. Thirty real schemes across all seven administrative tiers.

**Where it stands.** One person, Aryan Verma, builds and owns this. It began in September 2026 as a six-person college team project for the Smart India Hackathon (SIH) 2026 internal round, held on 14 September, where the team wasn't selected. Since 26 October 2026 it is an individual project, entered in the Meta Global AI Developer Hackathon, Indie Track (26 October to 4 November 2026; submissions are due 4 November, 9:00 PM ET, which is 5 November, 07:30 IST). Beyond the hackathon it stays a portfolio piece and, mainly, a product for businesses that work with real users. It is proprietary; see [LICENSE](LICENSE). This is not open source, even though the repo may be shared. It is still a prototype, not production software, and the rest of this file tries not to pretend otherwise. [docs/HACKATHON.md](docs/HACKATHON.md) says what existed before the hackathon and what was added during it. Anything below about "the demo" or "the round" dates from the team build and is not a current goal.

## Two things to know before you read the code

**No model writes a number or a line of advice.** Every figure and every sentence the user sees comes out of hand-written Python in `backend/app/services/` — plain `if`/`else`, nothing more. As of 26 October 2026 there is no SDK, API key or inference call anywhere in the repo. That's a deliberate choice, and `OUR_MVP.md` §15 makes the argument for it. For the Meta hackathon a voice and text intake layer on the Meta Model API is being added (planned, not built yet: this paragraph and [docs/HACKATHON.md](docs/HACKATHON.md) change when it exists). The rule holds whatever gets added: a model may help someone fill in the form, and they check what it filled in, but it never computes a figure, a risk band or a scheme match, and it never writes the advice. Please don't describe the app as giving AI-generated advice. If someone asks you to "improve the AI", find out first whether they mean the intake or the rules.

There's no database either. All client state lives in the browser's `sessionStorage`. The answers leave the browser once, when step 4 is submitted, so the backend can work the result out. The backend stores none of them. It writes one log line per request, which holds no answer but does hold a code computed from them ([docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) §4).

## Getting it running

You'll need:

| | What we're on | |
|---|---|---|
| Python | 3.14.6 | the pinned dependencies set a floor of 3.10. Only 3.14.6 has actually been run |
| Node | 24.18.1 | 24+ really is required — the verifier scripts use a global `WebSocket` |
| npm | 11.16.0 | |
| Edge | whatever's current | only for the browser verifiers |

Nothing to configure to run it locally: the backend starts in development mode and the frontend in demo mode, whose notices ask for made-up figures. A real deployment needs both configured (see [Deploying it](#deploying-it)). No database to provision, and no `.env` or API key unless you want to refresh the market data from data.gov.in. That needs your own key in `.env` (copy `.env.example`); see [tools/README.md](tools/README.md).

`.venv/` and `node_modules/` are gitignored, so a fresh clone has neither. Set both up once, from the repo root:

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt   # or requirements.txt to only run it

cd frontend && npm install && cd ..
```

`backend/requirements.txt` is the runtime: FastAPI, uvicorn and everything they pull in, each pinned to an exact version, Starlette included (1.6.0). There are no hashes. `backend/requirements-dev.txt` includes that file and adds pytest and httpx2, which is what the test suite needs.

You never have to *activate* the venv. Every command in this file calls `.venv/Scripts/python.exe` directly, which works from any shell. We're all on Windows and Git Bash, so that's what the snippets assume.

One thing that looks wrong and isn't: `backend/requirements-dev.txt` asks for **`httpx2`**, not `httpx`. That's the httpx 2.x line published by the pydantic org, and Starlette 1.6 uses it directly. In this venv `import httpx` fails while FastAPI's `TestClient` works fine. Please don't "fix" it.

Then two terminals, backend first:

```bash
# terminal 1
cd backend && ../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 2
cd frontend && npm run dev
```

Open **http://localhost:5173**. In development FastAPI serves its own docs at http://127.0.0.1:8000/docs, plus `/redoc` and `/openapi.json`. A production backend switches them off. If you just want to know whether the backend came up, `curl http://127.0.0.1:8000/health`.

Use `localhost:5173` rather than `127.0.0.1:5173` — Vite sometimes binds `[::1]` only. The backend is the opposite way round, since `uvicorn --host 127.0.0.1` is IPv4-only. When a URL refuses while the server is obviously running, that mismatch is nearly always the reason.

`npm run dev` points the frontend at `http://127.0.0.1:8000`. A production build has no default and needs an `https://` address (see [Deploying it](#deploying-it)). Requests give up after 20 seconds and show a timeout message instead of hanging.

**Kill your servers when you're done.** A leftover listener on 8000 gives you `[Errno 10048] only one usage of each socket address`, and a leftover Vite gives you CORS errors against a backend that looks perfectly healthy. Both have wasted an afternoon here already.

```bash
netstat -ano | grep -E ':8000|:5173|:4173'
taskkill //F //T //PID <pid>          # yes, doubled slashes, that's Git Bash
```

### The other commands

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q   # 867 tests, a few seconds
cd frontend && npm run build                                   # → frontend/dist; needs an https VITE_API_BASE_URL
cd frontend && npm run build:local                             # the same, against the backend on 127.0.0.1:8000
cd frontend && npm run lint                                    # ESLint 10
cd frontend && npm run preview                                 # serves the build on 4173
```

The `cd backend` in front of pytest matters. Run it from the repo root and you get collection errors, because the tests import `app.*` and nothing puts `backend/` on the path: there's no `pyproject.toml`, and `tests/conftest.py` only pins the `ARTHNITI_*` settings to development. It looks like a broken suite and it's just the working directory.

### Deploying it

Two switches turn the demo into something a real person can use.

- **Backend: `ARTHNITI_ENV=production`.** Production changes four things:
  - it mounts only `GET /health` and `POST /api/analysis/run`;
  - it serves no API docs;
  - it refuses a request that carries no consent record;
  - it won't start without `ARTHNITI_CORS_ORIGINS`, a comma-separated list of exact `https://` origins.

  The other settings are `ARTHNITI_TENANT`, `ARTHNITI_REQUIRE_CONSENT` and `ARTHNITI_LOG_HASH_KEY`.
- **Frontend:** `npm run build` refuses to build unless `VITE_API_BASE_URL` is an `https://` address. `VITE_FIDUCIARY_NAME` names the organisation responsible in every notice; without it the build stays in demo mode. [frontend/.env.example](frontend/.env.example) lists the rest. Every `VITE_*` value ends up in the JavaScript a visitor downloads, so none of them may be a secret.

[docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) is the full reference, written for the organisation deploying it. It covers:

- every setting;
- the processing log;
- the consent record;
- CORS;
- what that organisation still has to do itself.

[docs/frontend_integration.md](docs/frontend_integration.md) is the API contract.

### CI

`.github/workflows/ci.yml` runs on every push and pull request, on `ubuntu-latest`, as two jobs:

- **backend**: installs `requirements-dev.txt` and runs pytest from `backend/`, on Python 3.10 and 3.14.
- **frontend**: on Node 24, `npm ci`, lint, build (with a placeholder `https://api.example.invalid` as `VITE_API_BASE_URL`, which a production build requires), `parity4.mjs`, `keycheck.mjs` and `market-lib-test.mjs`, plus `glyph-audit.mjs`, which only reports and exits 0 whenever it runs.

**It has not run yet.** The branch that adds it has not been pushed, so it has never run on GitHub or on Linux, and Python 3.10 has not been tried at all. The browser gates in `tools/verify/` are not in it: they drive a local Edge at a hardcoded Windows path, so they only run on a Windows machine with Edge installed. There's still no Makefile and no Dockerfile.

## The demo path

Landing, then an optional login, then four question pages, then four result pages, plus the privacy notice.

| | Route | What happens |
|---|---|---|
| | `/` | landing page, with the instruction manual and the dialect picker |
| | `/login` | a name, nothing else. Not authentication — there's no password. It just carries the name into step 1 |
| 1 | `/profile` | name, language, dialect |
| 2 | `/business` | business name, kind of work, investment, expected revenue, running costs, existing debt |
| 3 | `/location` | state → district (cascading), village, rural/semi-urban/urban, market type, customers |
| 4 | `/finance` | capital in hand, household + business costs, the household's monthly loan repayments, optionally the household's monthly income, and an unticked box agreeing to the privacy notice. Submitting here fires the only API call in the app |
| | `/analysis` | profit, margin, risk, feasibility, the household loan check, local market rows, charts |
| | `/schemes` | schemes listed for your work and state, grouped by administrative tier |
| | `/advisory` | recommendations, a next step, and the household loan check |
| | `/report` | the printable one-page sheet, household loan check included |
| | `/privacy` | the full privacy notice: who is responsible, what is sent and kept, and how to withdraw. Linked from the footer of every page |

Anything else hits a 404 page. Nothing enforces the order, since the nav links straight to any step — so `/finance` can be submitted empty, which comes back as a 422 that we render as a readable sentence rather than a stack trace.

Six behaviours worth knowing before you click through:

- **The household loan check.** If the reader gives the household's monthly income, the backend compares every loan repayment the household makes, plus our estimate for a loan covering the money the plan still needs, against half of that income, and `/analysis`, `/advisory` and `/report` show the result. Half is the limit in RBI's 2022 microfinance directions (paras 5.1–5.3). This checks the figures the reader typed. It is not a lending decision, and nothing on the page calls the result RBI-compliant or says a lender will lend. Left blank, the check is skipped and the page says so. An income of exactly 0 has to be confirmed with a tick first, because it means no income at all and turns the advice into "do not take a new loan". A household earning more than ₹3,00,000 a year is outside RBI's microfinance range (para 3.1), so for it the 50% line is shown only as a warning sign.
- **Nothing is sent without a tick.** Step 4 has an unticked box agreeing to the privacy notice, and the check won't run until it's ticked. A short version of the notice sits on `/login`, `/profile` and `/finance`. With no organisation configured, the notices say this is a demonstration and ask for made-up figures.
- **Start over asks first.** The button opens a confirmation dialog, and "No" has the focus. It clears what this tab holds. It can't recall answers already sent, and the dialog says so.
- **Changing an answer clears the results, and the page says so.** After an edit on steps 2–4, the result pages say the answers changed instead of showing old figures. The answers that are never sent (business name, village, market type, customers) don't clear anything. An empty result page links to the first step that still has a missing answer, or to `/finance` if none does.
- **The footer shows when the scheme rules were checked** (01/09/2026 to 07/09/2026). The helpline number is gone, because we could not verify it. The footer now points to the District Industries Centre or the block office instead.
- **Inputs are capped** at ₹100 crore for any rupee amount, on the form and in the API, and every text field has a length limit in the API.

For a live walkthrough, pick **Food Processing, Handicrafts or Tailoring in Uttar Pradesh / Lucknow**. Those fill every section on the page: 14–16 schemes spread across 6 of the 7 tiers, both of the fit labels Uttar Pradesh can show ("Made for your state" and "For all of India"), and a district-level market row: how many businesses in Lucknow have registered that kind of work. Agriculture in Lucknow shows three mandi wholesale prices instead. Fill in the village name, market type and customer description on the location step too, since the report prints all three (from the tab: they're never sent), and give a household income on `/finance`, or the household check is skipped. Switch language on a *result* page rather than a form page if you can — the generated advice and the scheme text change too, not just the labels, and that's the moment that lands.

## Where things are

| Path | |
|---|---|
| `backend/app/main.py` | the FastAPI app, CORS, and the routers: all 8 in development, 2 in production |
| `backend/app/api/routes/` | 8 routers, one file per domain |
| `backend/app/schemas/` | Pydantic request and response models |
| `backend/app/services/` | all the business logic. Pure functions, no classes, no I/O |
| `backend/app/core/settings.py` | the `ARTHNITI_*` deployment settings, checked at startup |
| `backend/app/core/processing_log.py` | one JSON log line per request, with no answer in it |
| `backend/app/core/data_loader.py` | cached JSON loading. What it hands back is shared, so treat it as read-only |
| `backend/app/data/` | `schemes.json` (30 schemes), `market_data.json` (20 rows from data.gov.in, Lucknow and Varanasi), `market_data.provenance.json` (how the last fetch ran) |
| `backend/tests/` | 38 test files, 867 tests |
| `frontend/src/App.jsx` | the shell, all the chrome, 11 routes and a catch-all |
| `frontend/src/pages/` | 10 page components |
| `frontend/src/components/` | `Button`, `BrandMark`, `BrandWordmark`, `Figure`, `InstructionManual`, `ShortNotice`, `Charts`, `chartData` |
| `frontend/src/config/` | `deployment.js` (the `VITE_*` settings) and `notice.js` (the notice version and the keys it covers) |
| `frontend/src/context/AppContext.jsx` | the entire client state, mirrored into `sessionStorage` |
| `frontend/src/i18n/` | 8 languages, 4 dictionary files, the `t()` and `tBackend()` provider |
| `frontend/src/data/indiaLocations.js` | 36 states and UTs, 768 districts |
| `frontend/src/data/limits.js` | the input caps, mirroring `backend/app/schemas/limits.py`. A test fails if the two disagree |
| `frontend/src/data/reviewDates.js` | the dates the footer prints for when the scheme rules were checked. A test fails if they drift from `schemes.json` |
| `frontend/src/services/api.js` | the only network call in the app |
| `frontend/.env.example` | the `VITE_*` build settings, documented |
| `frontend/src/index.css` | design tokens, the `.ui-*` system, and the print stylesheet |
| `tools/` | 28 `.mjs` files, nearly all of them verifiers, plus the market data fetch and its maps — [tools/README.md](tools/README.md) explains them |
| `.github/workflows/ci.yml` | the CI workflow, which has not run yet (see [CI](#ci)) |
| `presentation/` | empty, and git does not keep empty folders. Left over from the team build; nothing reads it |

## How it fits together

The backend is FastAPI with 8 routers, and the frontend calls exactly one of them. A production backend mounts only that one and `/health`. Everything goes through `POST /api/analysis/run`, which answers with 7 top-level sections: `financial_analysis`, `risk_analysis`, `business_analysis`, `market_context`, `scheme_matches`, `advisory` and `mvp_summary`.

The other seven (`/health`, `/api/entrepreneur/profile`, `/api/business/analyze`, `/api/financial/analyze`, `/api/schemes/match`, `/api/advisory/recommend`, `/api/market/context`) are thin wrappers over the same services, and they're covered by tests. All but `/health` exist in development only. Don't delete them, but don't assume a change in one shows up in the UI either.

CORS in development allows any `localhost` or `127.0.0.1` port. In production it allows only the exact `https://` origins in `ARTHNITI_CORS_ORIGINS`, and the backend won't start without them. Neither mode allows credentials.

The frontend is React 19, Vite 8, Tailwind 4 and react-router 7. No TypeScript, no charting library, no i18n library, no state library, no frontend test framework. Those were choices for a fast prototype build and not all of them have been revisited since. Treat the missing frontend tests as open, not decided: apart from lint, the build and the dictionary scripts, the frontend is checked only by the Windows-only browser scripts in `tools/verify/`. The charts are hand-rolled on CSS in `components/Charts.jsx` so they survive dark mode and `window.print()`, and every one of them prints its number as text next to the bar.

Client state sits in `AppContext` and is mirrored into `sessionStorage` rather than `localStorage`. That's on purpose: someone's revenue, debt and EMI shouldn't still be sitting on a shared phone or a CSC computer after they walk away, and a closed tab should be a clean slate between two visitors. Within a single tab it survives a refresh, which is what we actually needed. `sessionStorage` only decides where the answers sit in the browser: submitting step 4 still sends them to the backend. Language, dialect, theme and text size *do* use `localStorage`, because a UI preference isn't financial data.

The whole interface is modelled on Indian e-governance portals — masthead, tricolour band, a utility bar that's always there, breadcrumbs, a dense footer. That's not nostalgia. A rural user has met this visual language on a real government service and already knows how to read it.

## The data

Thirty schemes in `backend/app/data/schemes.json`, covering every tier:

| Tier | | Examples |
|---|---|---|
| `central` | 9 | PMEGP, PMMY, PMFME, PM Vishwakarma, Stand-Up India, KCC |
| `state` | 7 | UP Mukhyamantri Yuva, Maharashtra CMEGP, Tamil Nadu NEEDS, Karnataka Udyogini |
| `regional` | 2 | UNNATI (North East), Vibrant Villages (border blocks) |
| `district` | 4 | District Industries Centre, RSETI, Krishi Vigyan Kendra, ODOP |
| `sub_district` | 2 | Tehsil/Taluka certificate counter, Sub-Divisional agriculture office |
| `block` | 3 | BDO / NRLM SHG desk, Block Level Bankers' Committee, ATMA block unit |
| `local_body` | 3 | Gram Panchayat trade licence, Common Service Centre, PM SVANidhi |

We filter on availability *before* scoring, on two axes: the entrepreneur's state, and whether they work rural, semi-urban or urban. Showing a UP-only subsidy to someone in Kerala as a partial match is worse than showing nothing at all, because they'd spend a day travelling to the block office over it.

The score is 60 for the kind of work plus 40 if the scheme names your state, or 30 if it is open everywhere. It checks no eligibility rule (age, income, loan size and so on), so the UI never prints it as a percentage. Each card says **"Made for your state"** (the scheme names only your state), **"For a few states, including yours"** (it names yours among several, as UNNATI does for the eight North-Eastern states) or **"For all of India"** instead, from the `fit_basis` field, and the eligibility list carries a line saying those rules have not been checked against the reader's answers. `match_score` stays in the API for sorting.

`market_data.json` has 20 rows, all government open data from data.gov.in, fetched on 24 September 2026. It's worth being blunt about how thin the coverage is: two districts, Lucknow and Varanasi, both in Uttar Pradesh. Agriculture gets three mandi wholesale prices per district, from Agmarknet. The other seven kinds of work get a count of businesses registered on Udyam, the Ministry of MSME's list. Poultry has nothing yet. Every other district lands on the market section's empty state. There's no state-level row to fall back to, because a Lucknow figure says nothing about Kanpur. That's a data coverage limit rather than a bug, and it's the real reason UP/Lucknow is the safe demo location.

Both datasets are used under the Government Open Data Licence – India. Below the market cards the page prints each dataset's attribution once, in English, then two lines in the reader's language: that the publishers don't endorse the app, and that open data can have errors and gaps. Leave all three there. The licence requires the attribution, and being honest about where the numbers come from is part of the product, not clutter to tidy away. [DATA_SOURCES.md](DATA_SOURCES.md) has the method, the provenance and what's still unresolved.

## Languages

Eight: `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn`. The default is **Hindi**, not English, because that's who this is for. English is the fallback.

732 distinct keys across 4 dictionary files, 5,856 strings in all, and all 8 languages are at full parity. That's checked by a script rather than by anyone's word. The backend prose is translated too — every sentence a Python service composes carries a translation code that the frontend resolves through `tBackend()`.

The dialect layer is a curated set of phrases, not a translation. Nine of the thirty listed varieties override a handful of the most visible strings. In the demo, say "dialect-aware phrasing" — not "translated into Bhojpuri".

Digits stay Latin and money stays `en-IN`-grouped even in Tamil, because that's what's printed on Indian currency and on every government form.

```bash
node tools/parity4.mjs     # 9 checks across 4 files x 8 languages, figures and the notice version included, no server needed
node tools/keycheck.mjs    # the other half: does every key the code asks for actually exist
```

## Checking your work

Lint, build and pytest can't see a leaked translation key, a `null%`, a page that scrolls sideways under a thumb, a `₹30,000` that wrapped into `₹30,00 / 0`, a logo that prints invisible, a transition that silently does nothing, a route that opens halfway down the page, or a footer column whose heading starts 50px below its neighbours'. We've shipped every one of those. The scripts in `tools/` are what catch them — [tools/README.md](tools/README.md) has the full guide and the traps.

From a fresh clone, in this order:

```bash
node tools/parity4.mjs                 # no server, about a second, best signal per second
node tools/verify/refresh-cases.mjs    # needs the BACKEND up — generates the test fixtures
node tools/verify/drive.mjs            # needs VITE — the main gate, 8 passes, 41 page loads; exits 1 on a finding
node tools/verify/mobile-audit.mjs     # needs VITE — phone widths, 48 page loads
node tools/verify/figure-audit.mjs     # needs the BACKEND and VITE — amounts at the ₹100 crore cap, 352 measurements
```

Step two isn't optional. Those fixtures are deliberately untracked, and eight of the browser drivers can't run without them. `figure-audit` asks the backend for its own cases instead.

Exit 0 means a script measured and found nothing, 1 is a finding, and 2 means it could not measure: the wrong directory, a server or Edge that is down or went away mid-run, a page that never rendered what it checks, a `--broken` refuter that missed, a crash. A 2 is neither a pass nor a finding. A run that stops early leaves no `report.json`, so any report on disk is from a run that finished. [tools/README.md](tools/README.md#exit-codes) lists every cause and the three scripts that are narrower.

Run the browser verifiers after any UI change, and `refresh-cases.mjs` after touching the services, the schemas or `schemes.json`.

## Which doc you want

| | | Read it when |
|---|---|---|
| this file | the front door | you've just cloned the repo |
| [CLAUDE.md](CLAUDE.md) | the code view: the current rules, traps and measured figures | you're about to edit something |
| [docs/ENGINEERING_HISTORY.md](docs/ENGINEERING_HISTORY.md) | the archive: the full reasoning behind each fix and verifier, dated: CLAUDE.md as it read up to 25 Sept 2026, plus later entries. About 300 KB, so read one section at a time | CLAUDE.md names a decision and you need the reason for it |
| [docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) | for the organisation deploying it: what is collected, sent, logged and kept, every setting, consent, CORS, and what that organisation has to do itself | you're deploying it, or a client's security or compliance staff ask |
| [docs/frontend_integration.md](docs/frontend_integration.md) | the API contract of `POST /api/analysis/run`: request, response, errors | you're calling the API or changing its shape |
| [docs/HACKATHON.md](docs/HACKATHON.md) | the Meta Global AI Developer Hackathon entry: the dates, what existed before it and what was built during it, how the AI is used and where it is not, the demo path, the submission checklist | you're judging, submitting or demoing the entry |
| [OUR_MVP.md](OUR_MVP.md) | the product view: what's built and what isn't | you need the product picture |
| [tools/README.md](tools/README.md) | the verification suite | a verifier failed, or you're writing a new one |
| [LICENSE](LICENSE) | proprietary licence: all rights reserved by the owner | before you copy, share or deploy any of it |
| [DATA_SOURCES.md](DATA_SOURCES.md) | where every dataset and image came from, what licence it's under, and which ones are still unresolved | you're adding data or an image, or a buyer asks |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | licences of every npm and Python dependency, generated by `node tools/third-party-notices.mjs` | a dependency changed (re-run the script) |

Two files in the repo are stale and we've left them alone rather than half-fixing them: `frontend/README.md` is untouched Vite boilerplate, and `docs/requirements.txt` is one line of prose with nothing to do with `backend/requirements.txt`.

**Keep this file current.** Adding a route, a language, a scheme tier, an endpoint, a verifier script or a dependency isn't finished until it's reflected here. The counts above are exactly the ones that have gone stale on us before, so re-measure instead of editing a number by hand:

```bash
node tools/parity4.mjs                          # the key count
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q    # the test count
ls tools/*.mjs tools/verify/*.mjs | wc -l       # the script count
```

## Who built it, and how git is used

Aryan Verma builds and owns this alone from 26 October 2026. The September 2026 SIH build was a team effort: Netra and Anmol on the frontend, Aryan and Manjeet on the backend, Saad and Tripti on presentation, product story and research. Their earlier work is in the git history, and the written permission to reuse it is still outstanding ([DATA_SOURCES.md](DATA_SOURCES.md), "People").

The remote has two branches, `before-main` and `main`, and **`before-main`** is the one to check out. It does not yet hold everything this file describes. `LICENSE`, `DATA_SOURCES.md` and `THIRD_PARTY_NOTICES.md`, the sourced market data, the funding-gap and scheme-fit fixes, the household check, CI and input caps, and the privacy and deployment work above were all made locally and haven't been pushed. As measured on 27 September 2026, `fix/standalone-backlog` is 6 commits ahead of `origin/before-main` (`git rev-list --left-right --count origin/before-main...fix/standalone-backlog` gives `0 / 6`). The working branch, `feature/dpdp-compliance`, sits on the same commit (`4a2307e`), and its privacy and deployment changes are not yet committed.

On the remote, `before-main` is simply ahead of `main`: `git rev-list --left-right --count origin/main...origin/before-main` gives `0 / 185`. There's nothing on `main` that `before-main` doesn't have, so merging is a fast-forward.

Compare the `origin/` refs, though, not your local branch names. A local `main` left over from early backend work can be sitting several commits ahead of `origin/main` and never have been pushed. One here is, by six, and then `main...before-main` reports `1 / 181` and looks like a genuine divergence. It isn't. Those commits exist on one laptop. This README said `1 / 166` and called it a real merge for exactly that reason.

Never commit to `main`. The repo is private, and the earlier team members may still have clones, so say so before you push, rename or delete a branch.

Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots/`. That last one is where the verifiers dump their PNGs and reports, and it's ignored because it reaches several gigabytes of browser profile data. The scripts themselves are in `tools/` and are tracked.

## What this doesn't do

These are the current limits, written down so nobody overclaims:

- No database and no authentication, both deliberate for the prototype. Whether they stay that way depends on what the project gets used for next. No model produces any figure or advice, and until the Meta intake layer is built there is no model in the repo at all.
- The non-English wording hasn't been checked by a native speaker, and that now covers 732 keys, the household-check wording and the privacy notice included. The non-English notice shouldn't be shown to real users until someone has reviewed it ([docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) §9.1). Parity, placeholders, identical-to-English and the figures are all script-verified; *naturalness* isn't. We've already caught two real mistakes by eye, which suggests there are more.
- The household income is whatever the reader types, and nothing checks it. Who counts as the household for an unmarried adult (their parents and their parents' unmarried children, themselves included) is our reading of RBI's definition, and nobody has verified it. A reader who types 0 instead of leaving the field blank has to confirm it with a tick, and is then treated as having no income.
- Nothing here settles whether a deployment meets the DPDP Act. The deploying organisation is the Data Fiduciary and we are its processor. The build gives it a notice, a consent record, a processing log with no answer in it, and production defaults. The organisation still has its own obligations (schedule §7 and §8), and some points need its lawyer (§9.3). The DPDP Rules apply from May 2027.
- CI is unproven. It has never run on GitHub or on Linux, and the browser gates are not in it, because they only run on Windows with Edge installed.
- Dialect coverage is 9 of 30 varieties, each a handful of phrases.
- The market data covers two districts, Lucknow and Varanasi. Everywhere else gets an empty market section. The business counts can't be fetched again as they were, because the Udyam list is live. And a price is marked stale when the data is fetched, not when the page loads, so the file needs refreshing at least weekly.
- Nothing enforces the order of the journey, and the result pages can't be deep-linked from a cold tab.
- Untested on phones: landscape, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.
- A typed-in "Other" business category matches no schemes. That's correct, and there's an empty state for it.

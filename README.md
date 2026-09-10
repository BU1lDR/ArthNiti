# अर्थNiti

Hyper-local business advice and financial structuring for rural micro-entrepreneurs. Our entry for Smart India Hackathon 2026.

Someone running a small business in a village — a tailor, a weaver, a woman keeping four buffaloes — opens this on a cheap Android phone, answers sixteen plain questions in their own language, and gets four things back:

- whether the business actually makes money
- how risky the loan repayment looks
- which government schemes they're genuinely eligible for, from Central ministries down to the Gram Panchayat counter
- a one-page sheet to print and carry to a bank

Eight Indian languages, with dialect-aware phrasing layered on top. Thirty real schemes across all seven administrative tiers.

Our next milestone is the internal college round on **11 September 2026**. This is prototype work built to be judged by a panel, not production software, and the rest of this file tries not to pretend otherwise.

## Two things to know before you read the code

**There is no LLM in here.** Every number and every sentence the user sees comes out of hand-written Python in `backend/app/services/` — plain `if`/`else`, nothing more. No SDK, no API key, no inference call anywhere in the repo. We think that's a defensible position for this round and `OUR_MVP.md` §15 makes the argument, but please don't describe the app as using generative AI. If someone asks you to "improve the AI", find out first whether they mean wire up a real model or sharpen the rules.

There's no database either. All client state lives in the browser's `sessionStorage`.

## Getting it running

You'll need:

| | What we're on | |
|---|---|---|
| Python | 3.14.6 | |
| Node | 24.18.1 | 24+ really is required — the verifier scripts use a global `WebSocket` |
| npm | 11.16.0 | |
| Edge | whatever's current | only for the browser verifiers |

Nothing to configure. No `.env`, no API key to request, no database to provision.

`.venv/` and `node_modules/` are gitignored, so a fresh clone has neither. Set both up once, from the repo root:

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt

cd frontend && npm install && cd ..
```

You never have to *activate* the venv. Every command in this file calls `.venv/Scripts/python.exe` directly, which works from any shell. We're all on Windows and Git Bash, so that's what the snippets assume.

One thing that looks wrong and isn't: `backend/requirements.txt` asks for **`httpx2`**, not `httpx`. That's the httpx 2.x line published by the pydantic org, and Starlette 1.6 uses it directly. In this venv `import httpx` fails while FastAPI's `TestClient` works fine. Please don't "fix" it.

Then two terminals, backend first:

```bash
# terminal 1
cd backend && ../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# terminal 2
cd frontend && npm run dev
```

Open **http://localhost:5173**. FastAPI serves its own docs at http://127.0.0.1:8000/docs, plus `/redoc` and `/openapi.json`. If you just want to know whether the backend came up, `curl http://127.0.0.1:8000/health`.

Use `localhost:5173` rather than `127.0.0.1:5173` — Vite sometimes binds `[::1]` only. The backend is the opposite way round, since `uvicorn --host 127.0.0.1` is IPv4-only. When a URL refuses while the server is obviously running, that mismatch is nearly always the reason.

The frontend points at `http://127.0.0.1:8000` by default; set `VITE_API_BASE_URL` if you ever need it somewhere else. Requests give up after 20 seconds and show a timeout message instead of hanging.

**Kill your servers when you're done.** A leftover listener on 8000 gives you `[Errno 10048] only one usage of each socket address`, and a leftover Vite gives you CORS errors against a backend that looks perfectly healthy. Both have wasted an afternoon here already.

```bash
netstat -ano | grep -E ':8000|:5173|:4173'
taskkill //F //T //PID <pid>          # yes, doubled slashes, that's Git Bash
```

### The other commands

```bash
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q   # 171 tests, about a second
cd frontend && npm run build                                   # → frontend/dist
cd frontend && npm run lint                                    # ESLint 10
cd frontend && npm run preview                                 # serves the build on 4173
```

The `cd backend` in front of pytest matters. Run it from the repo root and you get 25 collection errors, because the tests import `app.*` and there's no `pyproject.toml` or `conftest.py` putting `backend/` on the path. It looks like a broken suite and it's just the working directory.

There's no CI, no Makefile and no Dockerfile. The commands above are the whole story.

## The demo path

Landing, then an optional login, then four questions pages, then four result pages.

| | Route | What happens |
|---|---|---|
| | `/` | landing page, with the instruction manual and the dialect picker |
| | `/login` | name, phone, address, email. Not authentication — there's no password. It just carries the name into step 1 |
| 1 | `/profile` | name, language, dialect, reading comfort |
| 2 | `/business` | kind of work, investment, expected revenue, running costs, employees, existing debt |
| 3 | `/location` | state → district (cascading), village, rural/semi-urban/urban, market type, customers |
| 4 | `/finance` | capital in hand, household + business costs, EMI. Submitting here fires the only API call in the app |
| | `/analysis` | profit, margin, risk, feasibility, local market rows, charts |
| | `/schemes` | matched schemes, grouped by administrative tier |
| | `/advisory` | recommendations and a next step |
| | `/report` | the printable one-page sheet |

Anything else hits a 404 page. Nothing enforces the order, since the nav links straight to any step — so `/finance` can be submitted empty, which comes back as a 422 that we render as a readable sentence rather than a stack trace.

For a live walkthrough, pick **Food Processing, Handicrafts or Tailoring in Uttar Pradesh / Lucknow**. Those fill every section on the page: 14–16 schemes spread across 6 of the 7 tiers, both match scores showing, and a district-level market row. Fill in the village name, market type and customer description on the location step too, since all three get printed back. Switch language on a *result* page rather than a form page if you can — the generated advice and the scheme text change too, not just the labels, and that's the moment that lands.

## Where things are

| Path | |
|---|---|
| `backend/app/main.py` | the FastAPI app, CORS, and 8 `include_router` calls |
| `backend/app/api/routes/` | 8 routers, one file per domain |
| `backend/app/schemas/` | Pydantic request and response models |
| `backend/app/services/` | all the business logic. Pure functions, no classes, no I/O |
| `backend/app/core/data_loader.py` | cached JSON loading. What it hands back is shared, so treat it as read-only |
| `backend/app/data/` | `schemes.json` (30 schemes), `market_data.json` (9 rows) |
| `backend/tests/` | 25 files, 171 tests |
| `frontend/src/App.jsx` | the shell, all the chrome, 10 routes and a catch-all |
| `frontend/src/pages/` | 9 page components |
| `frontend/src/components/` | `Button`, `BrandMark`, `BrandWordmark`, `InstructionManual`, `Charts`, `chartData` |
| `frontend/src/context/AppContext.jsx` | the entire client state, mirrored into `sessionStorage` |
| `frontend/src/i18n/` | 8 languages, 4 dictionary files, the `t()` and `tBackend()` provider |
| `frontend/src/data/indiaLocations.js` | 36 states and UTs, 768 districts |
| `frontend/src/services/api.js` | the only network call in the app |
| `frontend/src/index.css` | design tokens, the `.ui-*` system, and the print stylesheet |
| `tools/` | 23 verification scripts — [tools/README.md](tools/README.md) explains them |
| `presentation/` | empty for now. Saad and Tripti |

## How it fits together

The backend is FastAPI with 8 routers, and the frontend calls exactly one of them. Everything goes through `POST /api/analysis/run`, which answers with 7 top-level sections: `financial_analysis`, `risk_analysis`, `business_analysis`, `market_context`, `scheme_matches`, `advisory` and `mvp_summary`.

The other seven (`/health`, `/api/entrepreneur/profile`, `/api/business/analyze`, `/api/financial/analyze`, `/api/schemes/match`, `/api/advisory/recommend`, `/api/market/context`) are thin wrappers over the same services, and they're covered by tests. Don't delete them, but don't assume a change in one shows up in the UI either.

CORS currently allows any loopback port through a regex. That needs to become an explicit list before this goes anywhere real.

The frontend is React 19, Vite 8, Tailwind 4 and react-router 7. No TypeScript, no charting library, no i18n library, no state library, no frontend test framework — all of that is deliberate for a two-week prototype. The charts are hand-rolled on CSS in `components/Charts.jsx` so they survive dark mode and `window.print()`, and every one of them prints its number as text next to the bar.

Client state sits in `AppContext` and is mirrored into `sessionStorage` rather than `localStorage`. That's on purpose: someone's revenue, debt and EMI shouldn't still be sitting on a shared demo laptop after they walk away, and a closed tab should be a clean slate between two judges. Within a single tab it survives a refresh, which is what we actually needed. Language, dialect, theme and text size *do* use `localStorage`, because a UI preference isn't financial data.

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

We filter on eligibility *before* scoring, on two axes: the entrepreneur's state, and whether they work rural, semi-urban or urban. Showing a UP-only subsidy to someone in Kerala as a "60% match" is worse than showing nothing at all, because they'd spend a day travelling to the block office over it.

`market_data.json` has 9 rows, and it's worth being blunt about how thin that is. All nine are Uttar Pradesh — five Lucknow, four Varanasi — across five categories. A missing district row falls back to a state row where one exists, so 35 of the 36 states and UTs land on the market section's empty state. That's a data coverage limit rather than a bug, and it's the real reason UP/Lucknow is the safe demo location.

Every row is labelled `"Prototype estimate / illustrative data"`, and the UI prints that label on the page where the reader can see it. Leave it there. Being honest about where the numbers come from is part of the pitch, not clutter to tidy away.

## Languages

Eight: `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn`. The default is **Hindi**, not English, because that's who this is for. English is the fallback.

618 distinct keys across 4 dictionary files, and all 8 languages are at full parity. That's checked by a script rather than by anyone's word. The backend prose is translated too — every sentence a Python service composes carries a translation code that the frontend resolves through `tBackend()`.

The dialect layer is a curated set of phrases, not a translation. Nine of the thirty listed varieties override a handful of the most visible strings. In the demo, say "dialect-aware phrasing" — not "translated into Bhojpuri".

Digits stay Latin and money stays `en-IN`-grouped even in Tamil, because that's what's printed on Indian currency and on every government form.

```bash
node tools/parity4.mjs     # key parity across 4 files x 8 languages, no server needed
node tools/keycheck.mjs    # the other half: does every key the code asks for actually exist
```

## Checking your work

Lint, build and pytest can't see a leaked translation key, a `null%`, a page that scrolls sideways under a thumb, a `₹30,000` that wrapped into `₹30,00 / 0`, a logo that prints invisible, a transition that silently does nothing, a route that opens halfway down the page, or a footer column whose heading starts 50px below its neighbours'. We've shipped every one of those. The 23 scripts in `tools/` are what catch them — [tools/README.md](tools/README.md) has the full guide and the traps.

From a fresh clone, in this order:

```bash
node tools/parity4.mjs                 # no server, about a second, best signal per second
node tools/verify/refresh-cases.mjs    # needs the BACKEND up — generates the test fixtures
node tools/verify/drive.mjs            # needs VITE — the main gate, 36 page loads
node tools/verify/mobile-audit.mjs     # needs VITE — phone widths, 40 page loads
```

Step two isn't optional. Those fixtures are deliberately untracked, and five of the browser drivers can't run without them.

Run the browser verifiers after any UI change, and `refresh-cases.mjs` after touching the services, the schemas or `schemes.json`.

## Which doc you want

| | | Read it when |
|---|---|---|
| this file | the front door | you've just cloned the repo |
| [CLAUDE.md](CLAUDE.md) | the code view: every trap, every reason, every measured figure | you're about to edit something |
| [OUR_MVP.md](OUR_MVP.md) | the product view: demo script, judge answers, what's built and what isn't | you're presenting, or you need the team split |
| [tools/README.md](tools/README.md) | the verification suite | a verifier failed, or you're writing a new one |

Three files in the repo are stale and we've left them alone rather than half-fixing them: `docs/frontend_integration.md` claims CORS allows two fixed origins (it's a regex) and that the response has five sections (seven), `frontend/README.md` is untouched Vite boilerplate, and `docs/requirements.txt` is one line of prose with nothing to do with `backend/requirements.txt`.

**Keep this file current.** Adding a route, a language, a scheme tier, an endpoint, a verifier script or a dependency isn't finished until it's reflected here. The counts above are exactly the ones that have gone stale on us before, so re-measure instead of editing a number by hand:

```bash
node tools/parity4.mjs                          # the key count
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q    # the test count
ls tools/*.mjs tools/verify/*.mjs | wc -l       # the script count
```

## Team, and how we're using git

| | |
|---|---|
| Netra, Anmol | Frontend |
| Aryan, Manjeet | Backend |
| Saad, Tripti | Presentation, product story, research |

Work on **`before-main`**. Everything this file describes lives there, and that's what you want checked out. The remote has two branches, `before-main` and `main`.

On the remote, `before-main` is simply ahead of `main` — `git rev-list --left-right --count origin/main...origin/before-main` gives `0 / 172`. There's nothing on `main` that `before-main` doesn't have, so merging is a fast-forward.

Compare the `origin/` refs, though, not your local branch names. A local `main` left over from early backend work can be sitting several commits ahead of `origin/main` and never have been pushed — one here is, by six — and then `main...before-main` reports `1 / 167` and looks like a genuine divergence. It isn't. Those commits exist on one laptop. This README said `1 / 166` and called it a real merge for exactly that reason.

Never commit to `main`. The repo is private and shared between six of us, so a push lands in everyone's working copy — tell people before you do it.

Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots/`. That last one is where the verifiers dump their PNGs and reports, and it's ignored because it reaches several gigabytes of browser profile data. The scripts themselves are in `tools/` and are tracked.

## What this doesn't do

Written down so nobody gets caught out by a question at the round:

- No LLM, no database, no authentication. All three are deliberate for this milestone.
- The non-English wording hasn't been checked by a native speaker. Parity, placeholders and identical-to-English are all script-verified; *naturalness* isn't. We've already caught two real mistakes by eye, which suggests there are more.
- Dialect coverage is 9 of 30 varieties, each a handful of phrases.
- The market data is illustrative, all of it Uttar Pradesh, and the UI says so on the page. Everywhere else gets an empty market section.
- Nothing enforces the order of the journey, and the result pages can't be deep-linked from a cold tab.
- Untested on phones: landscape, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.
- A typed-in "Other" business category matches no schemes. That's correct, and there's an empty state for it.

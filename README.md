# अर्थNiti

Hyper-local business advice and financial structuring for rural micro-entrepreneurs. An individual project by Aryan Verma, entered in the [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon), Indie Track.

Someone running a small business in a village — a tailor, a weaver, a woman keeping four buffaloes — opens this on a cheap Android phone, answers nineteen plain questions in their own language, and gets four things back:

- whether the business actually makes money
- how risky the loan repayment looks, counting the loan they would need if they do not yet have all the money the plan requires (at an assumed 12% over 5 years, which the page states), and, if they give their household's monthly income, whether the household's loan repayments stay within half of it
- which government schemes cover their kind of work where they live, from Central ministries down to the Gram Panchayat counter (it checks the kind of work and the place, not full eligibility)
- a one-page sheet to print and carry to a bank

Eight Indian languages, with dialect-aware phrasing layered on top. Thirty real schemes across all seven administrative tiers. Where the deployer switches it on, a person can also say or type their answers instead of filling in the form, and ask for a short plan written in their language around the figures the rules worked out (see [the voice and text helper](#the-voice-and-text-helper-optional)).

**Where it stands.** One person, Aryan Verma, builds and owns this. It began in September 2026 as a six-person college team project for the Smart India Hackathon (SIH) 2026 internal round, held on 14 September, where the team wasn't selected. Since 26 October 2026 it is an individual project, entered in the Meta Global AI Developer Hackathon, Indie Track (26 October to 4 November 2026; submissions are due 4 November, 9:00 PM ET, which is 5 November, 07:30 IST). Beyond the hackathon it stays a portfolio piece and, mainly, a product for businesses that work with real users. It is proprietary; see [LICENSE](LICENSE). This is not open source, even though the repo may be shared. It is still a prototype, not production software, and the rest of this file tries not to pretend otherwise. [docs/HACKATHON.md](docs/HACKATHON.md) says what existed before the hackathon and what was added during it. Anything below about "the demo" or "the round" dates from the team build and is not a current goal.

## Two things to know before you read the code

**No model writes a number or a line of advice.** Every figure and every sentence the user sees comes out of hand-written Python in `backend/app/services/` — plain `if`/`else`, nothing more. A model is used in two optional places, both added for the Meta hackathon. The first is the voice and text helper at `/talk`: Meta's Model API turns a recording into words (Muse Voice Transcribe) and picks form answers out of the words (Muse Spark), and the answers land in the ordinary form for the person to check. The second is the written plan on `/advisory`: Muse Spark words a short plan around blanks, the code refuses any reply that carries a digit or a link of its own, and the rules put their own figures into the blanks. The model is shown no figure, name or place. Nothing checks that a plan is wise, only that every figure in it is the rules' own. Both are off unless the deployer switches them on twice, once on the server and once in the frontend build. With both off there is no model call anywhere. The rule holds whatever gets added: a model may help someone fill in the form, or word what the rules already concluded, and the person checks what it wrote, but it never computes a figure, a risk band or a scheme match, and it never decides what the advice is. Please don't describe the app as giving AI-generated advice; say "AI-assisted intake" and "AI-written, rule-verified plan". If someone asks you to "improve the AI", find out first whether they mean the intake, the plan or the rules.

There's no database either. All client state lives in the browser's `sessionStorage`. The answers leave the browser once, when step 4 is submitted, so the backend can work the result out. The backend stores none of them. It writes one log line per request, which holds no answer but does hold a code computed from them ([docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) §4). With the helper on, a person's recording or words also go to Meta through the backend each time they use `/talk`, a short description of their business (no figure, name or place) goes each time they ask for a plan on `/advisory`, and the backend keeps one more file: a running total of what those calls cost, one whole number per call, with no words, no key and no identity in it (§10).

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
cd backend && ../.venv/Scripts/python.exe -m pytest tests -q   # 1922 tests in 52 files, about 16 seconds
node --test tools/verify/talk-lib-test.mjs tools/verify/app-state-test.mjs tools/verify/market-lib-test.mjs   # no server, no key
cd frontend && npm run build                                   # → frontend/dist; needs an https VITE_API_BASE_URL
cd frontend && npm run build:local                             # the same, against the backend on 127.0.0.1:8000
cd frontend && npm run lint                                    # ESLint 10
cd frontend && npm run preview                                 # serves the build on 4173
```

The `cd backend` in front of pytest matters. Run it from the repo root and you get collection errors, because the tests import `app.*` and nothing puts `backend/` on the path: there's no `pyproject.toml`, and `tests/conftest.py` only pins the `ARTHNITI_*` settings to development. It looks like a broken suite and it's just the working directory.

### Deploying it

Two switches turn the demo into something a real person can use.

- **Backend: `ARTHNITI_ENV=production`.** Production changes four things:
  - it mounts only `GET /health` and `POST /api/analysis/run` (and the helper's three routes, `/api/intake/*` and `/api/advisor/plan`, if the helper is switched on);
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

### The voice and text helper (optional)

Off by default. It does two things. It lets a person say or type their answers at `/talk`: Meta's Model API turns speech into words and picks form answers out of the words, and the person checks them in the ordinary form. And on `/advisory` it can write a plan: after the person ticks a box, Muse Spark words a short plan in their language around blanks, and the rules fill the blanks with their own figures. A reply with a digit or a link of its own, or a blank that is unknown or missing, is refused, asked for once more and then dropped, and the advice the rules wrote stays on the page whatever happens. The helper computes nothing. [docs/HACKATHON.md](docs/HACKATHON.md) says what it is for and how it was built, and [docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) §10 says what it sends, keeps and logs, which a deployer needs before switching it on.

It needs both switches, and the server one needs a key:

| Where | Setting | |
|---|---|---|
| backend | `ARTHNITI_AI_ENABLED=true` and `MODEL_API_KEY` | environment only. The backend reads no `.env` file, and it refuses to start with the helper on and no key |
| backend | `ARTHNITI_AI_MODEL`, `ARTHNITI_AI_ASR_MODEL` | `muse-spark-1.3` and `muse-voice-transcribe-1.0` unless set. A `-contributor` model is refused, because those may be trained on |
| backend | `ARTHNITI_AI_HOURLY_LIMIT` | calls an hour in all, counted by this process. Default 100 |
| backend | `ARTHNITI_AI_SPEND_CAP_USD`, `ARTHNITI_AI_SPEND_FILE` | the most the app will let itself bill in all (default 10, at most 100), and the file that keeps the running total (default `backend/.ai_spend`, gitignored) |
| frontend build | `VITE_AI_HELPER=true` | shows the `/talk` page and its two entry points, and the plan card on `/advisory`. Any other value leaves `/talk` a 404 and hides the card |

Every call is priced at its worst case against the cap *before* it is sent, and a call that would pass the cap is refused. That keeps this app's own bill inside a number you chose. It is not Meta's limit and it is not a guarantee: deleting the file resets the total, and each server process counts its own hourly limit. Check the balance on Meta's billing page as well.

To try it with a real key, type the key so it is not echoed or kept in the shell history, run the smoke script first, then start the backend:

```bash
cd backend
read -rs MODEL_API_KEY; export MODEL_API_KEY       # paste the key, press Enter. Nothing shows
export ARTHNITI_AI_ENABLED=true
../.venv/Scripts/python.exe -m app.smoke_meta      # 3 real calls (2 text, 1 of silence): up to about $0.045 against the cap
../.venv/Scripts/python.exe -m app.smoke_meta --plan   # 2 real calls, a plan in English and one in Hindi: about $0.08 against the cap
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

and in another terminal `cd frontend && VITE_AI_HELPER=true npm run dev`. The smoke script needs only the key and sets the helper switch itself. On 27 October 2026 both runs passed against the live service, and the second recorded $0.0797 against the cap for calls whose reported token counts come to about 2 cents at the listed prices (the cap books the worst case before each call, by design). The test suite clears `MODEL_API_KEY`, and a guard in `tests/conftest.py` fails any test that connects to anything but this machine (it covers blocking sockets, not asyncio on Windows).

### CI

`.github/workflows/ci.yml` runs on every push and pull request, on `ubuntu-latest`, as two jobs:

- **backend**: installs `requirements-dev.txt` and runs pytest from `backend/`, on Python 3.10 and 3.14.
- **frontend**: on Node 24, `npm ci`, lint, build (with a placeholder `https://api.example.invalid` as `VITE_API_BASE_URL`, which a production build requires), `parity4.mjs`, `keycheck.mjs`, `market-lib-test.mjs`, `talk-lib-test.mjs` and `app-state-test.mjs`, plus `glyph-audit.mjs`, which only reports and exits 0 whenever it runs. One test in `talk-lib-test.mjs` runs only where the Windows `.venv` exists, so CI skips it.

**It was written without being run.** The machine it was written on has no Linux and no Python 3.10, so nothing in it was tried on either. Whether it passes is shown by the repository's Actions tab, not by this file. The browser gates in `tools/verify/` are not in it: they drive a local Edge at a hardcoded Windows path, so they only run on a Windows machine with Edge installed. There's still no Makefile and no Dockerfile.

## The demo path

Landing, then an optional login, then four question pages, then four result pages, plus the privacy notice. With the helper switched on there is one more page, `/talk`, as a way in.

| | Route | What happens |
|---|---|---|
| | `/` | landing page, with the instruction manual and the dialect picker |
| | `/login` | a name, nothing else. Not authentication — there's no password. It just carries the name into step 1 |
| | `/talk` | only when the helper is on. Say or type the answers instead of filling in the form. Nothing is sent until the box on the page is ticked. The answers land in the ordinary form, marked as filled in by the helper, and the reader is taken to the first question still unanswered |
| 1 | `/profile` | name, language, dialect |
| 2 | `/business` | business name, kind of work, investment, expected revenue, running costs, existing debt |
| 3 | `/location` | state → district (cascading), village, rural/semi-urban/urban, market type, customers |
| 4 | `/finance` | capital in hand, household + business costs, the household's monthly loan repayments, optionally the household's monthly income, and an unticked box agreeing to the privacy notice. Submitting here sends the answers to `POST /api/analysis/run`, which is the only call that produces a result |
| | `/analysis` | profit, margin, risk, feasibility, the household loan check, local market rows, charts |
| | `/schemes` | schemes listed for your work and state, grouped by administrative tier |
| | `/advisory` | recommendations, a next step, the household loan check, the loan options (12, 24, 36 and 60 months), and, with the helper on, the plan card |
| | `/report` | the printable one-page sheet, household loan check included |
| | `/privacy` | the full privacy notice: who is responsible, what is sent and kept, and how to withdraw. Linked from the footer of every page |

Anything else hits a 404 page. Nothing enforces the order, since the nav links straight to any step — so `/finance` can be submitted empty, which comes back as a 422 that we render as a readable sentence rather than a stack trace.

Eight behaviours worth knowing before you click through:

- **The household loan check.** If the reader gives the household's monthly income, the backend compares every loan repayment the household makes, plus our estimate for a loan covering the money the plan still needs, against half of that income, and `/analysis`, `/advisory` and `/report` show the result. Half is the limit in RBI's 2022 microfinance directions (paras 5.1–5.3). This checks the figures the reader typed. It is not a lending decision, and nothing on the page calls the result RBI-compliant or says a lender will lend. Left blank, the check is skipped and the page says so. An income of exactly 0 has to be confirmed with a tick first, because it means no income at all and turns the advice into "do not take a new loan". A household earning more than ₹3,00,000 a year is outside RBI's microfinance range (para 3.1), so for it the 50% line is shown only as a warning sign.
- **Loan options.** When the money in hand falls short of the investment, `/advisory` shows one card for each loan length (12, 24, 36 and 60 months). A card is the largest loan, in whole thousands of rupees and no bigger than the shortfall, whose repayment still counts as low pressure (under 30% of the monthly surplus) and keeps the household check within half of its income, at the same assumed 12% a year the risk figure uses. The rules mark the shortest length that covers the whole shortfall, and a card that does not cover it says how much is still missing. When no loan is safe, the page says why (no surplus, a household already over its limit, or no room left after the current loans). These are planning figures and not a quote: no lender has offered these terms, and nothing on the page says one will.
- **The written plan.** With the helper on, `/advisory` ends in a card that can write a short plan in the reader's language. The card has its own unticked box, because pressing the button sends a description of the business to Meta; the box is cleared after every plan. The plan is the model's wording with the rules' figures put in, in bold, and it is labelled as AI-written. It takes about ten seconds. If the model fails, the checks refuse its reply twice, or the spend cap is reached, the card says so and the rest of the page is unchanged.
- **Nothing is sent without a tick.** Step 4 has an unticked box agreeing to the privacy notice, and the check won't run until it's ticked. A short version of the notice sits on `/login`, `/profile` and `/finance`. With no organisation configured, the notices say this is a demonstration and ask for made-up figures.
- **Start over asks first.** The button opens a confirmation dialog, and "No" has the focus. It clears what this tab holds. It can't recall answers already sent, and the dialog says so.
- **Changing an answer clears the results, and the page says so.** After an edit on steps 2–4, the result pages say the answers changed instead of showing old figures. The answers that are never sent (business name, village, market type, customers) don't clear anything. An empty result page links to the first step that still has a missing answer, or to `/finance` if none does.
- **The footer shows when the scheme rules were checked** (01/09/2026 to 07/09/2026). The helpline number is gone, because we could not verify it. The footer now points to the District Industries Centre or the block office instead.
- **Inputs are capped** at ₹100 crore for any rupee amount, on the form and in the API, and every text field has a length limit in the API.

For a live walkthrough, pick **Food Processing, Handicrafts or Tailoring in Uttar Pradesh / Lucknow**. Those fill every section on the page: 14–16 schemes spread across 6 of the 7 tiers, both of the fit labels Uttar Pradesh can show ("Made for your state" and "For all of India"), and a district-level market row: how many businesses in Lucknow have registered that kind of work. Agriculture in Lucknow shows three mandi wholesale prices instead. Fill in the village name, market type and customer description on the location step too, since the report prints all three (from the tab: they're never sent), and give a household income on `/finance`, or the household check is skipped. Switch language on a *result* page rather than a form page if you can — the generated advice and the scheme text change too, not just the labels, and that's the moment that lands.

## Where things are

| Path | |
|---|---|
| `backend/app/main.py` | the FastAPI app, CORS, and the routers: all 8 in development, 2 in production. The helper adds a 9th, the two `/api/intake/*` routes, and a 10th, `/api/advisor/plan`, in either mode |
| `backend/app/api/routes/` | 10 routers, one file per domain (`intake.py` and `advisor.py` are the helper's) |
| `backend/app/schemas/` | Pydantic request and response models |
| `backend/app/services/` | all the business logic. Pure functions, no classes, no I/O. `intake_service.py` builds the helper's prompts and decides which of the model's answers to keep; `plan_service.py` builds the plan's prompt, refuses a reply that breaks its rules and puts the rules' figures into the blanks; `options_service.py` works out the loan options |
| `backend/app/core/settings.py` | the `ARTHNITI_*` deployment settings, checked at startup |
| `backend/app/core/processing_log.py` | one JSON log line per request, with no answer in it |
| `backend/app/core/data_loader.py` | cached JSON loading. What it hands back is shared, so treat it as read-only |
| `backend/app/core/meta_client.py` | the only code that talks to Meta (standard-library `urllib`, no SDK). Charges the spend cap before every call |
| `backend/app/core/spend.py` | the spend cap and its ledger file |
| `backend/app/smoke_meta.py` | `python -m app.smoke_meta`: three real calls to check the integration against the live service; `--plan` makes two instead, to check the written plan |
| `backend/app/data/` | `schemes.json` (30 schemes), `market_data.json` (125 rows from data.gov.in, 13 districts), `market_data.provenance.json` (how the last fetch ran) |
| `backend/tests/` | 52 test files, 1922 tests |
| `frontend/src/App.jsx` | the shell, all the chrome, 11 routes, a 12th (`/talk`) when the helper is on, and a catch-all |
| `frontend/src/pages/` | 11 page components (`TalkPage` is the helper's) |
| `frontend/src/components/` | `Button`, `BrandMark`, `BrandWordmark`, `Figure`, `HelperFilledBanner`, `InstructionManual`, `ShortNotice`, `Charts`, `chartData` |
| `frontend/src/audio/` | `record.js` (the microphone, released on stop, on error and on leaving the page) and `wav.js` (turns what it recorded into the WAV the speech model takes) |
| `frontend/src/config/` | `deployment.js` (the `VITE_*` settings) and `notice.js` (the notice version and the keys it covers) |
| `frontend/src/context/AppContext.jsx` | the entire client state, mirrored into `sessionStorage` |
| `frontend/src/i18n/` | 8 languages, 4 dictionary files, the `t()` and `tBackend()` provider |
| `frontend/src/data/indiaLocations.js` | 36 states and UTs, 768 districts |
| `frontend/src/data/limits.js` | the input caps, mirroring `backend/app/schemas/limits.py`. A test fails if the two disagree |
| `frontend/src/data/planShape.js` | what a written plan must look like. A stored or received plan that does not match is thrown away, not shown |
| `frontend/src/data/reviewDates.js` | the dates the footer prints for when the scheme rules were checked. A test fails if they drift from `schemes.json` |
| `frontend/src/services/api.js` | the only file that makes network calls: the analysis, and the helper's three when it is on |
| `frontend/.env.example` | the `VITE_*` build settings, documented |
| `frontend/src/index.css` | design tokens, the `.ui-*` system, and the print stylesheet |
| `tools/` | 31 `.mjs` files, nearly all of them verifiers, plus the market data fetch and its maps, and one Python stand-in for the backend (`verify/talk_fake_backend.py`) — [tools/README.md](tools/README.md) explains them |
| `.github/workflows/ci.yml` | the CI workflow, written without being run (see [CI](#ci)) |
| `presentation/` | empty, and git does not keep empty folders. Left over from the team build; nothing reads it |

## How it fits together

The backend is FastAPI with 8 routers, and the frontend calls exactly one of them. A production backend mounts only that one and `/health` (plus the helper's routes, below, when they are on). Every result goes through `POST /api/analysis/run`, which answers with 8 top-level sections: `financial_analysis`, `risk_analysis`, `business_analysis`, `market_context`, `scheme_matches`, `financing_options`, `advisory` and `mvp_summary`.

The other seven (`/health`, `/api/entrepreneur/profile`, `/api/business/analyze`, `/api/financial/analyze`, `/api/schemes/match`, `/api/advisory/recommend`, `/api/market/context`) are thin wrappers over the same services, and they're covered by tests. All but `/health` exist in development only. Don't delete them, but don't assume a change in one shows up in the UI either.

A ninth router, `/api/intake/*`, exists only with the helper switched on, in production as well as development. The frontend calls its two routes from `/talk` and nowhere else: `transcribe` takes a recording and returns the words, and `extract` takes words and returns the form answers it found in them, each with the stretch of the person's own words that it rests on. An answer is kept only if that quoted stretch is really in what the person said. `POST /api/analysis/run` behaves the same with or without the helper, and nothing the helper returns reaches it except as values the person has been shown in the form. [docs/frontend_integration.md](docs/frontend_integration.md) has the measured contract.

A tenth router, `POST /api/advisor/plan`, exists under the same two switches. The frontend calls it from `/advisory` and nowhere else, with the answers a result was made from and the reader's tick. The route runs the analysis again with the same rules, shows the model a description with no figure, name or place in it, and takes back words with blanks in them. `plan_service.py` refuses the reply unless it has no digit of its own, no link, the right script for the language, only known blanks and enough of them, and the right number of steps and cautions. It asks once more with the reasons, and two refusals end in a 502 and no plan. Then the rules' own figures replace the blanks. **The checks prove that every figure is the rules' own. They do not prove that a plan is wise.** In a plan that is not in English, a scheme's name is still the English one. [docs/frontend_integration.md](docs/frontend_integration.md) has the measured contract here as well.

CORS in development allows any `localhost` or `127.0.0.1` port. In production it allows only the exact `https://` origins in `ARTHNITI_CORS_ORIGINS`, and the backend won't start without them. Neither mode allows credentials.

The frontend is React 19, Vite 8, Tailwind 4 and react-router 7. No TypeScript, no charting library, no i18n library, no state library, no frontend test framework. Those were choices for a fast prototype build and not all of them have been revisited since. Treat the missing frontend tests as open, not decided: apart from lint, the build, the dictionary scripts and two `node --test` files (`talk-lib-test.mjs` for the helper's recording and answer logic, `app-state-test.mjs` for the stored state, both loading the real source through Vite), the frontend is checked only by the Windows-only browser scripts in `tools/verify/`. The charts are hand-rolled on CSS in `components/Charts.jsx` so they survive dark mode and `window.print()`, and every one of them prints its number as text next to the bar.

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

`market_data.json` has 125 rows, all government open data from data.gov.in. Lucknow and Varanasi were fetched on 24 September 2026 and eleven more districts on 27 October 2026. It's worth being blunt about how thin the coverage is: 13 districts in 12 states (the list is in `DATA_SOURCES.md`). Agriculture gets up to three mandi wholesale prices per district, from Agmarknet. The other seven kinds of work get a count of businesses registered on Udyam, the Ministry of MSME's list. Poultry has nothing yet. Every other district lands on the market section's empty state. There's no state-level row to fall back to, because a Lucknow figure says nothing about Kanpur. That's a data coverage limit rather than a bug, and it is one reason UP/Lucknow is the safe demo location.

Both datasets are used under the Government Open Data Licence – India. Below the market cards the page prints each dataset's attribution once, in English, then two lines in the reader's language: that the publishers don't endorse the app, and that open data can have errors and gaps. Leave all three there. The licence requires the attribution, and being honest about where the numbers come from is part of the product, not clutter to tidy away. [DATA_SOURCES.md](DATA_SOURCES.md) has the method, the provenance and what's still unresolved.

## Languages

Eight: `en`, `hi`, `ta`, `te`, `ml`, `kn`, `mr`, `bn`. The default is **Hindi**, not English, because that's who this is for. English is the fallback.

812 distinct keys across 4 dictionary files, 6,496 strings in all, and all 8 languages are at full parity. That's checked by a script rather than by anyone's word. The backend prose is translated too — every sentence a Python service composes carries a translation code that the frontend resolves through `tBackend()`.

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

Aryan Verma builds and owns this alone from 26 October 2026. The September 2026 SIH build was a team effort: Netra and Anmol on the frontend, Aryan and Manjeet on the backend, Saad and Tripti on presentation, product story and research. Their earlier work is in the git history. Whether reusing it needs their written permission is an open legal question, and the owner's position is that it does not ([DATA_SOURCES.md](DATA_SOURCES.md), "People").

**Which branch to read.** `feature/voice-assistant` is the tip and the one this file describes. The other two pushed branches are earlier points on the same line of commits: `feature/dpdp-compliance` is the September work (the privacy and deployment work, the verifier work and the owner's brand-asset files), and `feature/security-hardening` adds the helper's backend, its spend cap and the network guard. [docs/HACKATHON.md](docs/HACKATHON.md) §2 names the commit that is the hackathon start and gives the `git diff` that shows exactly what was added after it. `main` on GitHub is the old scaffold from the team build, and `before-main` is a fast-forward of it. Neither holds anything this file describes until someone merges `feature/voice-assistant` into `main` or makes it the default branch.

Compare the `origin/` refs, not your local branch names. A local `main` left over from early backend work can be sitting several commits ahead of `origin/main` and never have been pushed, and then `main...before-main` looks like a genuine divergence. It isn't. Those commits exist on one laptop.

Never commit to `main`. The commits made on 27 October 2026 are all dated that day, including the ones that hold older work (September, and the morning of 26 October before the hackathon started), so git's dates alone don't separate old work from new. [docs/HACKATHON.md](docs/HACKATHON.md) §2 does.

Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots/`. That last one is where the verifiers dump their PNGs and reports, and it's ignored because it reaches several gigabytes of browser profile data. The scripts themselves are in `tools/` and are tracked.

## What this doesn't do

These are the current limits, written down so nobody overclaims:

- No database and no authentication, both deliberate for the prototype. Whether they stay that way depends on what the project gets used for next. No model produces any figure or decides any advice. The only model use in the repo is the optional helper: it fills in the form from speech or text, and it words a plan around blanks that the rules fill.
- **The helper has been run live twice, and everything else about it uses a stand-in.** On 27 October 2026 the owner ran `python -m app.smoke_meta` and `--plan` with a real key. The key worked, and the reply-size limit (8,000 tokens), the reasoning setting, the JSON-schema output and the prompt-cache key were accepted. A plan in English and one in Hindi passed the checks on the first try, in 10.6 and 11.9 seconds. Not yet seen live: the speech `keywords`, a real person speaking, and Meta's Billing page after the second run. The tests and the 259 browser checks of `/talk` use a fake model and a fake key. **The plan card on `/advisory` has not been driven in a browser at all**: the plan route, the checks and the stored state are tested, and the card's wording in the 7 other languages is machine-written.
- The helper's limits. Malayalam has no speech recognition in Meta's model, so it can only be typed. A spoken amount ("50 thousand", "1.5 lakh") is converted to rupees by the model and no code checks it, so the page shows the person the words it came from. The three routes have no sign-in and no per-person limit; the spend cap and the hourly limit bound the cost, and nothing bounds who calls them. The app sends no `safety_identifier` to Meta, because it has no per-person identity by design, and it does not ask Meta for zero data retention. The consent tick on `/talk` and the one on the plan card are page state only: the server keeps no record of either, and `/privacy` does not mention the helper yet ([docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) §10.5). The tick is checked when Record or Find my answers is pressed, and from Record until the recording has been sent it cannot be unticked.
- The non-English wording hasn't been checked by a native speaker, and that now covers 812 keys, the household-check wording, the privacy notice, the 40 `talk.*` keys of the helper and the 20 `plan.*` and 20 `fo.*` keys of the plan and the loan options included. The non-English notice shouldn't be shown to real users until someone has reviewed it ([docs/PROCESSOR_SCHEDULE.md](docs/PROCESSOR_SCHEDULE.md) §9.1). Parity, placeholders, identical-to-English and the figures are all script-verified; *naturalness* isn't. We've already caught two real mistakes by eye, which suggests there are more.
- The household income is whatever the reader types, and nothing checks it. Who counts as the household for an unmarried adult (their parents and their parents' unmarried children, themselves included) is our reading of RBI's definition, and nobody has verified it. A reader who types 0 instead of leaving the field blank has to confirm it with a tick, and is then treated as having no income.
- Nothing here settles whether a deployment meets the DPDP Act. The deploying organisation is the Data Fiduciary and we are its processor. The build gives it a notice, a consent record, a processing log with no answer in it, and production defaults. The organisation still has its own obligations (schedule §7 and §8), and some points need its lawyer (§9.3). The DPDP Rules apply from May 2027.
- CI was written without being run, on a machine with no Linux and no Python 3.10. The Actions tab is the evidence, this file is not. The browser gates are not in it, because they only run on Windows with Edge installed.
- Dialect coverage is 9 of 30 varieties, each a handful of phrases.
- The market data covers 13 districts (listed in `DATA_SOURCES.md`). Everywhere else gets an empty market section. The business counts can't be fetched again as they were, because the Udyam list is live. And a price is marked stale when the data is fetched, not when the page loads, so the file needs refreshing at least weekly.
- Nothing enforces the order of the journey, and the result pages can't be deep-linked from a cold tab.
- Untested on phones: landscape, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.
- A typed-in "Other" business category matches no schemes. That's correct, and there's an empty state for it.

# अर्थNiti — MVP
## What we actually built

> **Purpose:** the product and project view of अर्थNiti, for its owner, for anyone reviewing it, and for any AI assistant working on it.
> **Rule:** this file describes the MVP **as it exists in the repository**. When you change the build, change this file in the same commit. Anything not yet built is labelled **PLANNED** — never write a planned thing as though it works.
> **Engineering detail lives in [CLAUDE.md](CLAUDE.md)** — exact file paths, response keys, thresholds, known traps. This file is the product view; CLAUDE.md is the code view. If they disagree, CLAUDE.md is newer.

**Status as of 26 October 2026.** अर्थNiti is a solo project. Its owner, Aryan Verma, builds it alone and has entered it in the **Meta Global AI Developer Hackathon, Indie Track**. Submissions are due 4 November 2026, 9:00 PM ET, which is 5 November 07:30 IST; [docs/HACKATHON.md](docs/HACKATHON.md) has the dates, the checklist and the demo path. It began as a six-person college team build for the SIH 2026 internal round on 14 September 2026, where it was **not selected**, and the team's earlier work is credited in `README.md` and `DATA_SOURCES.md`. The owner decided its direction on 23 September 2026: it is a portfolio piece, and mainly a product to sell to businesses that serve real users. The project and the scheme data belong to the owner and the code is proprietary (see `LICENSE`). The hyperlocal claim stays, and since 24 September 2026 it is backed by 20 sourced rows for Lucknow and Varanasi from data.gov.in under GODL-India (see `DATA_SOURCES.md`). The DPDP Act is in scope: in a deployment the client organisation is the Data Fiduciary and we are its Data Processor. CLAUDE.md, "Decided by the owner", has the details and the questions still open. **The hackathon's model layer is built and off by default (§15).** With it off, the repo makes zero model calls. With it on, a model turns speech or typed words into draft form answers that the reader checks, and it never writes a number or a line of advice. The table below describes the tip, branch `feature/voice-assistant`; §11 says how the branches relate. The team-era sections (the SIH round's presentation, its Q&A, its ritual and its status snapshots) were cut or rewritten on 26 October 2026; `docs/ENGINEERING_HISTORY.md` records what went.

| | |
|---|---|
| Project name | **अर्थNiti** (frozen) |
| Phase | Working prototype, solo. Entered in the Meta Global AI Developer Hackathon (Indie Track, due 4 Nov 2026), and meant to continue as a product afterwards |
| Backend | Runs. 8 routers in development, 2 in production, and the optional intake helper adds a 9th in either; 1,558 passing tests |
| Frontend | Runs. 11 routes, a 12th (`/talk`) when the helper is on, and a catch-all; the full journey works end to end |
| Integration | Done — one API call carries the whole journey |
| Datasets | 30 government schemes across 7 tiers, 20 sourced market rows (Lucknow + Varanasi, data.gov.in, GODL-India) |
| Languages | 8 UI languages + a dialect phrase layer. **Backend prose is translated too** — see §2.6 |
| LLM / AI model | **None in the advice.** An optional intake helper, off by default, uses Meta's Muse Voice Transcribe and Muse Spark to turn speech or typed words into form answers that the reader checks — see §15 |
| Database | **None.** Answers are kept in the browser tab (`sessionStorage`), sent once to work out the result, and stored nowhere — see §6 and §8 |
| Entry | Meta Global AI Developer Hackathon, Indie Track — [docs/HACKATHON.md](docs/HACKATHON.md) |

---

# 1. Project Identity

## Project Name
**अर्थNiti** — *अर्थ* (money / economy) + *नीति* (policy, plan, prudent course). "A money plan."

Written exactly like that: Devanagari **अर्थ** and Latin **Niti**, one word, no space. The mixed script is the wordmark and is what appears in the logo. It was written `ArthNiti` until 8 September 2026 — that spelling is retired.

**The name does not translate.** Switching the interface to Tamil or Bengali changes every other word on the page and leaves the name alone, because a brand is a proper noun. It lives in one place in the code (`frontend/src/i18n/brand.js`) so it cannot drift between the masthead, the footer, the report sheet and the browser tab. If you are writing a slide, a script or a caption, spell it `अर्थNiti` there too.

**The logo** is an eight-petal lotus rosette around a ₹ coin with three coins falling below it, drawn as SVG so it recolours itself for dark mode and still prints in full colour on the `/report` PDF. It appears in the masthead, on `/login`, in the footer, on the printed report and as the browser tab icon.

## The problem statement it started from
The SIH 2026 problem statement, quoted as issued, and the brief this project was built against:

**AI-Driven Hyper-Local Business Advisory and Financial Structuring Assistant for Rural Micro-Entrepreneurs**

Note the wording: the statement says "AI-driven", and the advice is not. It is hand-written rules. The model layer, built for the hackathon and off by default, is an intake aid, not an adviser (§15).

## One-Line Pitch
> अर्थNiti asks a rural micro-entrepreneur eight plain-language questions and returns a structured, explainable business and financing assessment — local market prices, monthly profit, repayment risk, matched government schemes, and a printable action plan.

## Core Idea
We are NOT building a generic AI chatbot. We built a guided four-step form that feeds a deterministic advisory engine and returns five kinds of answer on one screen.

Of the ten questions the blueprint set out to answer, here is where the MVP actually stands:

| # | Question | Status |
|---|---|---|
| 1 | What business should I pursue? | **Not built** — the user tells us their category, we don't recommend one |
| 2 | Is my business idea financially viable? | **Built** — `feasibility_status`, operating surplus, margin, ROI |
| 3 | What does my local market look like? | **Built** — mandi prices and registered-business counts for two districts (Lucknow, Varanasi), sourced and attributed |
| 4 | How much money do I need? | **Built** — `funding_gap` |
| 5 | How much from my own capital? | **Built** — available capital is an input and shown against the gap |
| 6 | How much external financing is appropriate? | **Partial** — we show the gap and the repayment risk, but no suggested loan amount or EMI scenarios |
| 7 | Which support schemes are relevant? | **Built** — 30 schemes across 7 tiers of government, matched with reasons |
| 8 | Can I safely afford the repayment? | **Built** — repayment-pressure ratio → low / moderate / high, plus, when the reader gives their household income, a check of all loan payments against half of it (the RBI microfinance line). A check, not a lending decision |
| 9 | What documents do I need? | **Built** — per-scheme document list |
| 10 | What should I do next? | **Built** — ranked recommendations + printable report |

**Eight of ten fully, one partially, one not at all** — count the rows. This line read "seven … two not at all" until 8 September 2026, which did not match its own table and understated the build; if you are quoting it on a slide, quote 8 / 1 / 1. Say the gaps honestly if a judge asks; they are §22 Future Scope, not hidden.

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

1. **Hyperlocal — DELIVERED, for two districts.** State + district + business category select rows from `market_data.json`: 20 sourced rows for Lucknow and Varanasi, mandi prices and registered-business counts from data.gov.in. Every row is stamped `match_level`: `district` when it is the entrepreneur's own district, `state` when it is a state-level figure standing in for one. Both cases print a *different sentence*. No state-level rows exist yet, so every other district shows the empty state rather than someone else's figures. This is the honesty marker on our central claim — never render a state-level row as though it were local, and never show one district's figures for another.
2. **Personalized — DELIVERED.** Every number derives from the eight figures the user entered, plus their household income when they give it (the question is optional). Two different users get genuinely different results.
3. **Financially structured — PARTIALLY DELIVERED.** We convert investment and capital into a funding gap and test the EMI against surplus. We do not yet produce financing scenarios or an EMI schedule (§22).
4. **Explainable — DELIVERED.** Scheme matches carry `match_reasons`; risk carries a `reason` sentence; business analysis carries `observations`. Advanced numbers sit behind a "Show detailed calculations" disclosure so the first screen stays readable.
5. **Actionable — DELIVERED.** Every result page ends in next steps; `/report` prints.
6. **Regional-language — DELIVERED.** This entry said "NOT DELIVERED — all output is English. Do not claim Hindi output" until 8 September 2026. **That is now wrong in the direction that undersells the build**, so read the replacement carefully before presenting:
   - **8 languages** — English, Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali — each listed in its own script with a sample line, so a reader who cannot read English can find their own language. **Hindi is the default**, not English.
   - **The generated advice and the scheme text change with it.** Every sentence a Python service composes carries a translation code beside it, and the frontend resolves the code to the reader's language. So do not say "the labels are translated" — the *output* is. On stage this is the single strongest moment in the walkthrough, and a **result** page is a better place to show it than a form page.
   - **A dialect phrase layer** on top: 30 varieties listed, of which **9 carry curated phrase overrides** for the highest-visibility strings (the greeting, the call to action, the words for money). Anything not overridden falls through to the language, so every dialect is a fully usable UI. Say **"dialect-aware phrasing"** — not "translated into Bhojpuri".
   - **What is still English, say this if asked:** an enum value the label maps do not recognise falls back to a title-cased English word; a scheme added to `schemes.json` without codes falls back to its English prose; digits stay Latin and money stays `en-IN`-grouped on purpose, because that is what is printed on Indian currency and on government forms; and **the non-English wording has not been reviewed by a native speaker** (772 keys × 8 languages — parity, placeholders and the figures in each sentence are script-verified, naturalness is not).
7. **Responsible — DELIVERED.** A non-positive surplus short-circuits to `high` risk. When the reader gives their household income, all household loan payments are checked against half of it, and a household over that line is told not to take the new loan, or to take a smaller one. The check never says a lender will lend. Nothing in the app recommends borrowing a specific amount. Scheme cards carry a verify-with-the-authority disclaimer, and the market section names each dataset it draws on, prints its GODL-India attribution, and says the publishers do not endorse the app and give no warranty.

---

# 3. What the MVP Does

## The journey as built

Eleven frontend routes, a twelfth (`/talk`) when the optional helper is built in, plus a catch-all for typo'd URLs:

```text
/               Landing page — hero, what we offer, how it works, and the
                instruction manual (a walkthrough of all eight screens)
    ↓
/login          OPTIONAL — a name, nothing else. Nothing is authenticated
                and there is no password; it only carries the name into
                step 1. Do not present it as auth (§4.1)
    ↓
/talk           OPTIONAL, only when the helper is on (§15, Feature 17):
                speak or type a few sentences; each answer found is shown
                beside the words it came from, filled into the form for the
                reader to check, and the reader lands on the first step
                that still needs an answer. Not one of the four steps
    ↓
/profile        Step 1 of 4 — name, language, dialect
    ↓
/business       Step 2 of 4 — category (9 buttons), business name, investment,
                monthly sales, monthly operating expenses, existing debt
    ↓
/location       Step 3 of 4 — village, state → district (cascading dropdowns,
                36 states/UTs × 768 districts), location type, market type, customers
    ↓
/finance        Step 4 of 4 — available capital, monthly expenses (incl. household), monthly EMI,
                household monthly income (optional), and an unticked box agreeing
                to the privacy notice: nothing is sent until it is ticked
    ↓
        ── ONE API CALL: POST /api/analysis/run ──
    ↓
/analysis       Money, business health, risk, LOCAL MARKET, observations, next steps,
                schemes — with charts (coins, bars) beside every figure
/schemes        Scheme cards grouped by the office that runs them, outward from
                Delhi to the reader's own panchayat: why it is listed, reasons,
                eligibility (marked as not checked against you), documents
/advisory       The recommendations, expanded
/report         Print/PDF-ready one-page summary of everything
    ↓
*               NotFoundPage

/privacy        The full privacy notice, outside the journey, linked from
                the footer of every page
```

The whole assessment is one HTTP request. That is deliberate: fewer moving parts to fail on a projector.

## The demo persona — use this one

**Tailoring (or Handicrafts) · Uttar Pradesh · Lucknow.**

Measured against the live backend on 8 September 2026, this fills *every* section on screen and shows the widest spread of government tiers: **14 scheme matches across 6 of the 7 tiers**, both of the fit labels Uttar Pradesh can show ("Made for your state" for a scheme that names only Uttar Pradesh, "For all of India" for one open nationwide) so the scheme-fit chart renders, plus a **district-level** market row. Food Processing is equally safe (16 matches). **Agriculture is now safe too** — 11 matches across 5 tiers, and it is arguably the better story since it was a dead end until 7 September — and in Lucknow it now shows three mandi prices (wheat ₹26.59, paddy ₹31, potato ₹8 a kg).

The one tier no Uttar Pradesh pick reaches is `regional`: UNNATI is North-East-only and Vibrant Villages is border-block-only.

**Say "six of the seven tiers", not seven — no single input reaches all seven.** This paragraph used to say "if a judge asks to see all seven, use Assam", and that was wrong: Assam reaches six, swapping `regional` in for `state`. Measured over every named state × 8 categories × 3 settlement types, **six is the maximum**, because the six states with their own state scheme (Uttar Pradesh, Maharashtra, Tamil Nadu, Kerala, West Bengal, Karnataka) and the twelve reached by a regional scheme (the North-East plus Himachal Pradesh, Uttarakhand, J&K and Ladakh) **do not overlap**. The dataset does span all seven tiers — that claim is about the 30 schemes in the file and is safe to make. Reaching all seven *on one screen* would need a state scheme for a North-Eastern or border state, which is a dataset gap, not a bug. If a judge asks specifically to see a **regional** scheme, use **Assam** and expect no state tier and no market row.

Also give the location step a **village name, a market type and a customer description**. `/report` prints all three back, and each market card on `/analysis` prints the market type. Since 27 September 2026 they are read from the tab and never sent: the backend never used them, so they no longer leave the browser. The hyperlocal claim rests on the district market rows, not on this read-back.

## The exact demo payload, and what it returns

Enter these figures and you get the result below. **Re-measured against the live engine on 8 September 2026** — every number here was read off a real `200` response, not copied forward.

| Step | Field | Value |
|---|---|---|
| `/business` | Category · investment · monthly sales · operating expenses | Tailoring · ₹1,00,000 · ₹30,000 · ₹18,000 |
| `/location` | State · district · village · location type · market · customers | Uttar Pradesh · Lucknow · Khera · Rural · Weekly haat · Local families |
| `/finance` | Available capital · monthly expenses · EMI · household income | ₹50,000 · ₹15,000 · ₹2,000 · left blank |

Result — HTTP 200, all 7 sections populated:

```text
Money needed (funding gap)     ₹50,000
Money left each month          ₹15,000        profit margin 50%     → profitable
Risk                           LOW            loan payments are 20.75% of surplus
                                              (₹2,000 EMI + ₹1,112 estimated for a
                                              loan covering the ₹50,000 gap)
Household check                not checked    no household income was entered
Business health                FEASIBLE       operating surplus ₹12,000/mo,
                                              operating margin 40%, ROI 144%
Government support             14 schemes across 6 of the 7 tiers
                                 3 state    MYUVA (UP), VSSY (UP), ODOP (UP)
                                11 national PM Vishwakarma, PMMY, PMEGP, Stand-Up
                                            India, DIC, RSETI, Tehsil counter, BDO,
                                            BLBC, CSC, Gram Panchayat
Local market                   1 row, match_level "district" — 5,826 registered
                                 tailoring units in Lucknow, 2.3% of 249,493
Action plan                    1 recommendation — cover the funding gap first
Overall status                 attention_needed  → "Decide how you will cover the
                                             funding gap before you start, and keep
                                             any loan small enough to repay."
```

Those are the numbers to have in your head when you demo it. If a figure on screen disagrees with this table, something regressed — check before recording or presenting.

**Re-checked on 25 September 2026** by calling the analysis service directly, not over HTTP: every figure above is unchanged, the household check reads `not_checked` because the income was left blank, and `risk_analysis` now carries 19 keys. To show the household check, fill in the household income on `/finance`. With the same payload, ₹20,000 gives 15.56% of household income, within the limit, and changes nothing else. ₹5,000 gives 62.24%, over the limit: the status line becomes "Loan payments are too high for your household income", the next step becomes "start smaller, or find more of the money yourself first", and the advice adds "take a smaller loan, or none". The entered ₹2,000 EMI alone is within half of ₹5,000; the estimated loan for the gap is what takes it over.

**Note the fit split, and do not call it a percentage.** Each card says "Made for your state" (the scheme names only Uttar Pradesh) or "For all of India". A third label, "For a few states, including yours", is for a scheme that names the reader's state among several (UNNATI in the North East, Vibrant Villages in the border states); it scores 100 like a one-state scheme and cannot appear for Uttar Pradesh. Behind them the score is 100 or 90, the only two values reachable, and it checks no eligibility rule, so the page no longer prints it as "90% match" (changed 23 September 2026), which reads as a 90% chance of qualifying. The demo block above shows the `fit_basis` value behind each label. Say "listed for your kind of work, then for your state, and the rules still have to be checked at the office", never "scored by a model" and never "you qualify".

**Avoid in the demo:** a typed-in *Other* that resembles nothing in the dataset — that is the only input left that matches zero schemes, and §21 explains why that is correct rather than broken. Every category except Other now has a market row in Lucknow and Varanasi; any other district shows the market section's empty state.

## What used to break the demo — and no longer does

This section read **"State lives only in React memory … a page refresh wipes everything … do not refresh, and do not deep-link"** until 8 September 2026. **That is fixed.** Every answer and the API result now mirror into `sessionStorage['sih-application']`, so:

- **A refresh no longer loses anything** within the tab. This was our single largest demo risk and it is closed.
- **`sessionStorage`, not `localStorage`, and that is deliberate** — someone's revenue, debt and EMI must not sit on a shared laptop or a CSC counter computer after they walk away, and a closed tab being a clean slate is exactly what we want between two visitors (or two judges trying the demo).
- **Language, dialect, theme and text size are in `localStorage` instead**, because a display preference is not personal financial data and *should* outlive the tab.
- **"Start over" in the utility bar is the only way back to a blank form** without closing the tab. It appears only once there is something to lose. **Since 25 September 2026 it asks first**: a dialog says everything entered in this tab will be removed and cannot be got back, and "No" is the first button and takes the focus. `/report` also carries a line, hidden on paper, saying the figures were worked out from the answers the reader sent, that this tab keeps the answers and the report until Start over, and to print or save it as a PDF to keep it. Since 27 September 2026 the dialog also says Start over does not affect anything already sent.
- **Changing an answer after seeing a result removes the result**, because the old result no longer matches the answers. Since 25 September 2026 each result page then says so ("You changed your answers") and offers a button back to the answers, instead of showing the ordinary empty state. And if the answers change while the check is still running, the late reply is not shown: `/finance` asks the reader to press the button again.

**What is still true:** a result page cannot be *deep-linked from a cold tab*, because there is no URL state — open `/report` in a brand-new tab and you get its empty state. Since 25 September 2026 that empty state sends the reader to the first step whose answers are missing, not to a page that would refuse to continue. Walking the journey once, then refreshing or moving between result pages freely, is the supported rehearsal loop.

---

# 4. Feature-by-Feature Status

## Feature 1 — Entrepreneur Profile · **BUILT (reduced)**
Collects: name, preferred language (8, from a dropdown listing each in its own script), dialect (**a dropdown that cascades from the language**, 30 varieties — it was free text in the plan). No page ever asked for a literacy level. Until 27 September 2026 the request carried a fixed "low" for it; the UI no longer sends one.
Cut from the original plan: age range, gender, experience years, existing-vs-new. **State and district were deliberately removed from this page** — they were being asked twice, here and on `/location`, and now live only on `/location`.

## Feature 1b — Login · **BUILT, AND IT IS NOT AUTHENTICATION**
`/login` asks for a name and nothing else. Until 27 September 2026 it also asked for a phone number, an address and an email, and threw them away. **There is no password, no account, no session and no server call** — it carries the name into step 1 and nothing else. It is skippable and the journey works without it. If a judge asks, say exactly that: it is a name-capture screen shaped like a login, and real authentication is §22 work.

## Feature 2 — Business Profile · **BUILT**
Category (9 buttons: retail, food processing, handicrafts, tailoring, agriculture, dairy, services, manufacturing, other), business name, initial investment, expected monthly sales, monthly operating expenses, existing debt. The employees question was removed on 27 September 2026, because nothing used the answer.
Note the hint text: this page's expense question means **business-only costs**. `/finance` asks a *different* expense question. See §9.
Choosing "Other" needs at least two typed characters, counted after trimming spaces, and the page says so itself. Before 25 September 2026 a box of spaces passed here and came back from `/finance` as an error about a page the reader had already left. The number boxes on this page and on `/finance` stop at the same caps the backend enforces (§7).

## Feature 3 — Hyperlocal Context · **BUILT**
Village, **state → district as cascading dropdowns** (36 states/UTs × 768 districts — free-text boxes in the plan, so "Lucknow" could be submitted with "Kerala"), location type (rural / semi-urban / urban), market type (multi-select: village / weekly haat / town / online / mixed), customer description.
Matching is tiered: the entrepreneur's own district + state + category first; else a state-level row for the same state + category, flagged `match_level: "state"` (none exist yet); else an empty section. Another district's row is never shown. Rendered on `/analysis` and inside `/report`.
**Location type is now load-bearing, not just collected.** Every scheme declares which settlement types it serves, so a rural entrepreneur is not shown PM SVANidhi (urban street vendors) and an urban one is not shown the Gram Panchayat counter or the Block Development Office. That is a *gate*, not a score penalty — see §9.

## Feature 4 — Business Feasibility Engine · **BUILT (reduced)**
Returns operating surplus, operating margin %, annual surplus, estimated ROI %, `feasibility_status` (feasible / break_even / not_feasible) and plain-language observations.
**Break-even units and cash-flow projection were not built** — we have no unit-economics inputs (selling price, variable cost per unit) to compute them from. See §22.

## Feature 5 — Financial Structuring Engine · **PARTIAL**
Built: monthly profit, profit margin, `funding_gap = max(initial_investment − available_capital, 0)`, repayment-pressure risk, and, when the reader gives their household income, a check of all household loan payments against half of it (Feature 8).
**Not built:** suggested financing range, indicative EMI scenarios, cash-flow coverage schedule. The user supplies their own EMI; we assess it rather than propose one.
Framing that must stay: अर्थNiti is a **decision-support prototype, not a lender and not a financial guarantee**.

## Feature 6 — Scheme Matching · **BUILT**
`backend/app/data/schemes.json` holds **30 schemes spanning all seven tiers of Indian government**, each with a description, target segment, business categories, states, settlement types, eligibility rules, support type, documents and a `last_verified` date. It held 3 until 7 September 2026.

| Tier | Count | Examples |
|---|---|---|
| **Central** | 9 | PMEGP, PMMY (MUDRA), PMFME, PM Vishwakarma, Stand-Up India, National Livestock Mission, AHIDF, Agriculture Infrastructure Fund, Kisan Credit Card |
| **State / UT** | 7 | UP MYUVA, UP Vishwakarma Shram Samman, Maharashtra CMEGP, Tamil Nadu NEEDS, Kerala Entrepreneur Support, Bengal Bhabishyat Credit Card, Karnataka Udyogini |
| **Regional** | 2 | UNNATI (North East), Vibrant Villages (border blocks) |
| **District** | 4 | District Industries Centre, RSETI, Krishi Vigyan Kendra, ODOP (UP) |
| **Sub-district** | 2 | Tehsil/Taluka certificate counter, Sub-Divisional agriculture office |
| **Block / Taluka** | 3 | Block Development Office (NRLM SHG desk), Block Level Bankers' Committee, ATMA block unit |
| **Village / urban local body** | 3 | Gram Panchayat trade licence, Common Service Centre, PM SVANidhi |

**This tier axis is the product point, not a data-volume boast.** `/schemes` groups the cards by the office that runs each one, outward from Delhi to the reader's own panchayat, and each heading carries a line naming the building they would physically walk into — *"The block office near you. Its staff come to villages."* A tier label alone teaches a rural reader nothing; the pairing is what makes 30 schemes usable instead of overwhelming.

**Scoring is transparent and only two values are reachable:** **+60 if the kind of work matches**, then **+40 if the scheme names the entrepreneur's own state (→ 100)** or **+30 if it is open nationwide (→ 90)**. No category match returns 0 and the scheme is dropped entirely. The 40/30 split exists because a flat +40 for both put almost every one of 30 matches on exactly 100, and a score that is always 100 tells the reader nothing. **The score is never shown as a percentage** (as of 23 September 2026): it checks no eligibility rule, so the card prints `fit_basis` instead, as "Made for your state", "For a few states, including yours" or "For all of India", and the eligibility list says the rules have not been checked against the reader's answers.

**Availability is decided before scoring, on two independent gates.** A scheme naming a specific list of states is dropped outright for anyone outside it, and a scheme serving only rural (or only urban) settlements is dropped for the other. Showing a Uttar Pradesh–only subsidy to a Kerala entrepreneur as a partial match is *worse* than not showing it — they would spend a trip to the block office on it. 20 of the 30 are `states: ["ALL"]`; the rest name their state.

**No scheme card links out to a government website, and that is a deliberate removal — 10 September 2026.** Every scheme used to carry its own portal URL and the cards rendered it as a button; the owner's instruction was to take them out, because an unaffiliated student prototype deep-linking a reader into a government service is not ours to do. It was removed end to end rather than hidden: the field is gone from the dataset, the Pydantic model, the API response and both pages, and the four tests that used to assert its presence now assert its **absence**, so a future re-add fails a gate instead of shipping quietly. What the card gives the reader instead is the office that runs the scheme, by name and by tier — which is where an application is actually made. `last_verified` stays, because it says when we transcribed the *rules*.

**Since 25 September 2026 the footer prints when the scheme rules were checked**: "Scheme rules were checked between 01/09/2026 and 07/09/2026." The two dates live in `frontend/src/data/reviewDates.js`, and `test_review_dates.py` fails if they stop matching the earliest and latest `last_verified` in `schemes.json`. The dates say how old the rules are. They do not make the rules current: nobody owns re-checking them and there is no schedule for it.

**The text of nine schemes was corrected on 25 September 2026**: 19 English sentences, and the same sentences in the other 7 languages. The plain-language rewrite had turned loans and government money towards the cost into a cost "paid for", a "discount" or money "given" (PMEGP, PMFME, ODOP, UP CM-YUVA, Bengal Bhabishyat and Karnataka Udyogini among them). That could tell a reader that money they would have to borrow and repay was theirs to keep. Each sentence now says which part is a loan and which part is money not paid back. `node tools/parity4.mjs` now also checks that every translation carries the same figures as its English sentence, and that every English scheme sentence carries the same figures as the `schemes.json` text it stands for (§13). And `gen_schemes.py`, which regenerates `schemes.json`, had fallen behind two eligibility fixes, so a regeneration would have undone them. It is fixed, and `test_gen_schemes.py` holds its output to the shipped file.

## Feature 7 — Explainability · **BUILT**
`match_reasons[]` per scheme ("Your kind of work is supported by this scheme (listed as …)", "This scheme is for every state, including yours.", "This scheme is only for your state." or "This scheme is only for some states, and yours is one of them."), a `reason` sentence on risk, `observations[]` on business analysis, `match_level` provenance on every market row, and a source label on every price. **Every one of those sentences also carries a translation code**, so the explanation appears in the reader's own language rather than only the labels around it (§2.6).

## Feature 8 — Risk Indicator · **BUILT**
`pressure_ratio = (monthly_emi + estimated_new_emi) / monthly_surplus × 100` → **below 30% low, 30–50% moderate, above 50% high**. `estimated_new_emi` is the funding gap priced as a new loan at an assumed 12% a year over 60 months, and the page prints that assumption beside the figure; it is 0 when the entrepreneur already has the money. `existing_debt` is not added, because its repayment is the EMI they entered. Non-positive surplus short-circuits to `high` with a null ratio and the sentence "There is no positive monthly surplus available for repayment."
**These thresholds are our prototype assumptions and must be presented as such** — not as universal financial rules. That framing is a judge-facing requirement, not a footnote.

**The household check, 25 September 2026.** The pressure figure divides by the *business* surplus, on *expected* revenue. RBI's microfinance directions (Master Direction, Regulatory Framework for Microfinance Loans, 2022: paras 5.1–5.3 for the 50% limit, para 3.1 for the ₹3,00,000 income line and the meaning of household, and Annex I for how income is assessed) test something else: a lender RBI regulates may not give a new microfinance loan if the payments on all the household's loans, the new one included, would be more than 50% of its monthly household income. So `/finance` now asks one optional question, how much the household earns in a month. The hint says who counts as the household, not to count what the new plan is expected to earn, and that the box can be left blank. When it is answered, all loan payments (the entered EMI plus the estimated loan for the gap) are divided by that income, and above 50% the check is over the limit. `/analysis`, `/advisory` and `/report` print the percentage, with a bar marked at 50% and the line "This is our estimate from your answers. It is not a decision by any lender."
- **Left blank, nothing is checked**, and the page says so. A blank is never treated as ₹0.
- **₹0 is an answer.** Any loan payment against it is over the limit, so a reader who types 0 by mistake is told not to take a new loan (when they already pay an EMI) or to take a smaller loan or none (when only the loan for the gap is counted).
- **It is a check, not a lending decision, and it is not a compliance claim.** The rule binds lenders RBI regulates, for households earning up to ₹3,00,000 a year. Above that the page shows the 50% line as a warning sign, not as a rule for that household. No page says the result is RBI-compliant or that a lender will lend.
- **The income is what the reader types.** Nothing checks it.
- **"Household" for an unmarried adult is our reading.** RBI defines a household as husband, wife and their unmarried children. For someone not married, the hint counts their parents and those parents' unmarried children. Nobody has verified that reading.
- `existing_debt` is still not added, for the same reason as above.

## Feature 9 — Action Plan · **BUILT**
`advisory.recommendations[]` selected by financial status, profit-margin band (10% / 30%), cash reserve, the funding gap and, since 25 September 2026, the household check. A household the new loan takes over half its income is told to take a smaller loan, or none. One whose existing loans are already over half is told not to take a new loan until they are back to half or less. The next step on the result pages splits the same way. `/report` renders up to five as numbered steps and falls back to four sensible defaults if the engine returns none. `/report` prints to PDF with `break-inside: avoid` on every card and a forced-light colour set, so a dark-mode laptop still prints on white.

## Feature 10 — AI Chat Assistant · **NOT BUILT**
There is no chat endpoint and no chat UI. `POST /api/chat` does not exist, and the model layer (§15) is an intake layer, not a chat. Nobody should demo or promise a conversational assistant; §22 lists it as not planned.

## Feature 11 — Multilingual output · **BUILT**
8 languages, Hindi by default, plus a dialect phrase layer — and the *generated advice and scheme text* change with the language, not only the labels. Full detail and the exact honest caveats are in §2.6. **This is the strongest single moment in the walkthrough**; switch language while standing on a **result** page.

## Feature 12 — Charts · **BUILT (hand-rolled, no library)**
Three chart types in `frontend/src/components/Charts.jsx`, drawn in CSS rather than with Recharts, for three reasons that all matter here: the colours come from the theme tokens so dark mode and the print palette work with no extra code; the bars survive `window.print()`, where a JS library has already measured a screen-width container before the paper layout re-measures; and **the number is always printed as text beside the bar**, so a chart is decoration over a readable figure rather than the only place a value exists.

- **`UnitChart`** — ten coins, the first *N* filled. The one chart that needs no numeracy at all, which is why the result pages lead with it: *"4 of every 10 rupees stay with you."*
- **`BarRow` / `BarGroup`** — money in / money out / money left, and the scheme-fit split. **A group always shares one maximum**, and **a negative value gets no bar at all** — it used to scale on absolute value, so a ₹10,000 shortfall drew exactly the bar a ₹10,000 profit drew, and a long bar reads as "plenty" to anyone not also parsing the minus sign.

## Feature 13 — Accessibility and reading affordances · **BUILT**
Two independent switches on `<html>`, both persisted: **dark mode** and a **three-step text scale** that *multiplies* the reader's own browser font size rather than replacing it. (A high-contrast mode was a third until 8 September 2026, when it was removed at the owner's instruction. Both remaining themes are AA-checked and the text scale is untouched, but a dedicated high-contrast mode is not offered.) Plus a skip link, `<html lang>` tracking the chosen language, `aria-hidden` on every decorative glyph, and a 44px minimum touch target on every control. These are part of the government-service register we are borrowing, not extras bolted on top.

## Feature 14 — Instruction manual · **BUILT**
A strip on the landing page opens a modal walkthrough of all eight screens — what each one asks for and why. **It carries its own language dropdown inside the panel**, so a reader who cannot read the current language can switch from where they are instead of hunting the utility bar first. Worth 20 seconds in the demo: it is the answer to "how would a first-time rural user know what to do?"

## Feature 15 — Government-style interface · **BUILT (a deliberate design choice)**
The chrome is modelled on Indian e-governance portals — a masthead with the lotus mark, a tricolour rule, a persistent utility bar, a horizontal nav band, breadcrumbs, plain bordered cards, a dense multi-column footer. **The reason is usability, not imitation:** a rural user has met that visual language before on a real government service and already knows how to read it.

"Government-like" means those structural conventions. It does **not** mean 2000s-era visual quality — the brief was explicit that the interface must be understandable by low-literacy readers *without being basic*.

**The on-screen "student prototype / not a Government of India service" notice was removed on 8 September 2026 at the owner's instruction.** So if a judge asks whether this could be mistaken for an official portal, **the answer is verbal now and someone has to give it** — say plainly that it is a prototype built by one person and not a government service. What remains on screen is different and must not be tidied away: the footer's *verify eligibility at a government office* line, the footer's dates for when the scheme rules were checked, and, under the market section, the GODL-India attribution for each dataset it draws on, followed by a line saying the publishers do not endorse अर्थNiti and a no-warranty line. Those are data-provenance honesty, not an is-this-official disclaimer. (Corrected on 25 September 2026: this sentence named the *"Demo estimate — sample figures, not a real survey"* label on every market row, which was deleted on 24 September with the illustrative rows it labelled.)

**The footer no longer prints a helpline number** (removed 25 September 2026). "Udyami Helpline 1800-11-6666" had never been checked against a source we could open, could not be tapped to call, and was in English on every page. The column now reads "Where to get help" and names the District Industries Centre and the block office. A number comes back only once it is verified.

## Feature 16 — Privacy notice, consent and the processing log · **BUILT (for a deploying organisation)**
Added 27 September 2026, for a deployment in which the client organisation is the Data Fiduciary and we are its Data Processor. `docs/PROCESSOR_SCHEDULE.md` is the full reference, written for that organisation.

- **A short notice** sits on `/login`, `/profile` and `/finance`. The full notice is `/privacy`, linked from the footer of every page: who is responsible, what is sent, what is kept, and how to withdraw.
- **Demo mode.** A build with no organisation configured (`VITE_FIDUCIARY_NAME` unset) says it is only a demonstration and asks for made-up figures.
- **Consent.** `/finance` has an unticked box, and nothing is sent until it is ticked. The request then carries a consent record: the notice version, the language it was read in, the time on the reader's device, and the age answer when the age box is shown. A production backend refuses a request without one. The record is written to the log and never returned.
- **The processing log** writes one line per request, with no answer in it. For the analysis call the line holds the consent record and a code computed from the answers: a SHA-256, or an HMAC when a key is set. The code is pseudonymous personal data. Anyone who holds the log (and, for the HMAC, the key) can test guesses against it.
- **Less is sent.** The UI sends 12 fields plus the consent record, down from 19. The business name, village, market type and customer description stay in the tab.
- **Production settings.** `ARTHNITI_ENV=production` mounts only `GET /health` and `POST /api/analysis/run`, serves no API docs, and will not start without a list of exact `https://` origins for CORS. `npm run build` needs an `https://` API address.

Still open: no native speaker has reviewed the non-English notice, and it should not reach real users until someone has (schedule §9.1). Several points need the organisation's lawyer (§9.3). The DPDP Rules apply from May 2027. This gives the organisation the means to meet its own obligations; it does not settle whether a deployment meets them.

## Feature 17 — Speak or type your answers (the Meta intake helper) · **BUILT, NOT YET RUN AGAINST META'S LIVE API**
Added 26–27 October 2026 for the Meta Global AI Developer Hackathon. **Off by default**: it needs `ARTHNITI_AI_ENABLED=true` and `MODEL_API_KEY` on the backend and `VITE_AI_HELPER=true` in the frontend build. `/talk` takes up to 60 seconds of speech (Hindi, Tamil, Telugu, Kannada, Marathi, Bengali or English) or typed words in any of the 8 languages, finds the form answers in them and shows each one beside the words it came from. The reader then checks them in the ordinary form, where each helper-filled field stays marked until it is edited. §15 has the boundary and [docs/HACKATHON.md](docs/HACKATHON.md) has the account.

- **Its own consent tick** (and an age tick when configured), held in page state only. The box is locked from the moment recording starts until the recording has been sent.
- **A spend cap.** A ledger counts every call at its worst-case price and refuses a call that would pass the cap, so this app cannot spend past the owner's free credits.
- **Verified against a fake Meta:** 1,558 backend tests in 48 files, the Node tests for the client-side code (`talk-lib-test` 45, `app-state-test` 22) and `talk-ui`, a browser gate of 17 scenarios and 259 checks. **Not yet run against the live API.**
- **Not in it:** advice, scheme eligibility, any number the engine uses without the reader seeing it, Malayalam speech (typing works), read-aloud output, and reading out a name or a business name.

---

# 5. What We Deliberately Did Not Build

Still-correct exclusions, and they are defensible answers to "why not?":

- Nationwide real-time market intelligence — we use a small curated, source-labelled dataset instead
- Banking integration, real loan applications, credit scoring
- Aadhaar/PAN verification
- ML models trained on data we do not have
- A mobile app alongside the web app
- A large multilingual voice system. (The hackathon layer, §15, is narrower and is built: speak or type your answers once, a model fills the existing form fields, and you check them. It gives no advice and speaks nothing back.)
- Web scraping
- Autonomous financial decisions
- Production authentication, blockchain, microservices

Added to that list during the build:

- **A database.** The demo has no multi-session requirement, so a server-side store would have been cost without payoff. The browser tab holds the journey instead (§8).
- **A charting library.** The charts are hand-rolled in CSS on purpose — see Feature 12 for the three reasons, all of which are specific to this demo.
- **An i18n library.** Eight plain dictionary objects and a 12-line lookup function, verified by our own parity script. A library would add a build dependency to solve a problem we do not have.
- **A frontend test framework.** Instead there are **zero-dependency browser drivers** that drive Edge over CDP and assert on rendered output (§13). They were written because lint, build and pytest cannot see a leaked translation key, a `null%`, a page that scrolls sideways on a phone, or a logo that prints invisible. (This line said "eleven" until 25 September 2026; §13 has the count.)
- **Route guards.** Any step is reachable from the nav bar. Submitting an incomplete form returns a readable error rather than being prevented — which is the honest behaviour for a prototype and one fewer thing to fail in the demo.

**Not every item on that second list is still a decision** (reviewed 25 September 2026, after the SIH round whose build wrote that list). Leaving out a charting library and an i18n library still stands, for reasons that do not depend on a demo. The database and the route guards were demo-era choices and are open questions now that the product is meant to be sold. Whatever replaces the tab, a reader's financial answers still do not go into `localStorage`, where they would outlive the tab on a shared device. The browser drivers standing in for a frontend test framework was never about the demo, but they run only on one Windows laptop and are not in CI. CI itself was on no list and now exists (§6).

The goal was a **convincing, functional MVP**, and that is what exists.

---

# 6. Technical Architecture (as built)

## Frontend
React **19.2.8** · Vite **8.2.2** · Tailwind CSS **4.3.3** · react-router-dom **7.18.3** · ESLint **10.9.0**. No TypeScript. **No charting library and no i18n library** — both were in the plan; both are hand-rolled instead, for the reasons in Feature 12 and §5. There *are* charts, which this section denied until 8 September 2026.

```text
frontend/src/
  App.jsx                 shell (utility bar / masthead / nav / main / footer)
                          + JourneyBar + LandingPage + NotFoundPage + 11 routes, a 12th
                          (/talk) when the helper is on, + catch-all
  context/AppContext.jsx  the entire client state, mirrored into sessionStorage
  i18n/                   languages.js (8 languages + 30 dialects), LanguageContext.jsx
                          (the t() / tBackend() provider), backendText.js (resolves the
                          backend's translation codes), brand.js (the product name —
                          deliberately NOT translatable), and four dictionary files:
                          strings.js, resultStrings.js, backendStrings.js, schemeStrings.js
  data/indiaLocations.js  36 states/UTs × 768 districts, for the cascading dropdown
  data/limits.js          the input caps, mirroring backend/app/schemas/limits.py
  data/reviewDates.js     the dates the scheme rules were checked, for the footer
  pages/                  11 page components (TalkPage is the helper's)
  components/             Button, BrandMark, BrandWordmark, Figure, InstructionManual,
                          ShortNotice, HelperFilledBanner, Charts (BarRow / BarGroup /
                          UnitChart), chartData
  audio/                  record.js (the microphone) and wav.js (the WAV the speech model takes)
  config/                 deployment.js (the VITE_* settings), notice.js (the notice version)
  services/api.js         the only network call in the app
  index.css               design tokens + the .ui-* design system + @media print
```

Presentation state on `<html>`, all persisted in `localStorage`: `data-theme="dark"` (`sih-theme`), `--ui-scale` (`sih-textsize`), plus `sih-language` and `sih-dialect`. (`sih-contrast` was one of them until high contrast was removed; nothing reads it now, so a returning visitor's copy is inert.) **The user's financial answers deliberately go somewhere else — `sessionStorage`** — because a display preference should outlive the tab and someone's revenue and debt should not (§8).

## Backend
Python **3.14.6** · FastAPI **0.141.1** · Pydantic **2.13.5** · uvicorn **0.52.4** · pytest **9.1.1**.

```text
backend/app/
  main.py                 FastAPI app + CORS + the routers (8 in development, 2 in production)
  api/routes/             8 routers, one file per domain
  schemas/                Pydantic request/response models, + limits.py (the input caps)
  services/               ALL business logic — plain functions, no classes, no I/O
  core/data_loader.py     loads JSON from app/data by absolute path (cwd-independent)
  core/settings.py        the ARTHNITI_* deployment settings, checked at startup
  core/processing_log.py  one JSON log line per request, with no answer in it
  core/meta_client.py     the only code that talks to Meta (urllib, no SDK); charges the spend cap first
  core/spend.py           the spend cap and its ledger file
  services/intake_service.py  the helper's prompts, and which of the model's answers are kept
  api/routes/intake.py    the helper's two routes, mounted only when the helper is on
  smoke_meta.py           the owner's capped three-call check against the live API
  data/                   schemes.json (30 schemes, 7 tiers), market_data.json (20 sourced rows) + market_data.provenance.json
  gen_schemes.py          the generator schemes.json is built from — its source, not runtime
backend/tests/            48 test files + conftest.py, market_fixtures.py, deployment_fixtures.py, privacy_fixtures.py, intake_fixtures.py; 1,558 tests
backend/requirements.txt  every runtime dependency pinned, transitive ones included
backend/requirements-dev.txt  the runtime pins plus pytest and httpx2, for the tests
```

`requirements.txt` has pinned every package the backend imports, directly or through another package, since 25 September 2026. It had listed only the top-level packages, so two installs a week apart could resolve to different versions. The pins carry no hashes. Every pin allows Python 3.10, which reaches end of life in October 2026; the team runs 3.14.6.

The planned `models/`, `calculations/` and `ai/` directories **do not exist**. Calculations live in `services/`; there are no ORM models because there is no database; there is no `ai/` because the only model calls go through one file, `core/meta_client.py`, and only when the helper is on.

Style rules, if you are adding code: services are pure functions returning plain dicts, rounded to 2 decimals; services never import FastAPI; routers never do arithmetic.

## Database
**None.** No SQLite, no PostgreSQL, no ORM, no migrations. JSON files in `backend/app/data/` are the only data store, read once per process and cached read-only. **Nothing the user enters is stored on any server.** The answers live in the browser tab and are usually gone when it closes (§8). They are sent once, when step 4 is submitted, so the backend can work the result out. The backend keeps none of them, and its log line holds no answer (`docs/PROCESSOR_SCHEDULE.md` §4).

## AI Layer
**An optional intake helper, off by default.** `ARTHNITI_AI_ENABLED=true` turns it on and needs `MODEL_API_KEY`. It calls Meta's Model API for two things, speech to text and picking form answers out of text, and nothing else (§15). §15 gets a whole section, because what the model does and does not do is the single most likely thing to be misstated.

## CORS
In development, any `localhost` or `127.0.0.1` port, so a Vite server that falls back from 5173 to 5174 still works. In production (`ARTHNITI_ENV=production`), only the exact `https://` origins listed in `ARTHNITI_CORS_ORIGINS`. The backend refuses to start without that list, and refuses `*` in it. Neither mode allows credentials.

## Running it

Two processes, backend first.

```bash
# Backend — run from ./backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend — run from ./frontend
npm run dev          # Vite dev server, port 5173
npm run build        # production build into frontend/dist; needs an https VITE_API_BASE_URL
npm run build:local  # the same build, against the backend on 127.0.0.1:8000
npm run lint         # ESLint 10

# Tests — run from ./backend
../.venv/Scripts/python.exe -m pytest tests -q      # 1558 passed in about 13 seconds

# Translation-key parity — from the repo root, no server needed
node tools/parity4.mjs                        # 4 files × 8 languages, 9 checks
```

A fresh environment installs the test dependencies with `python -m pip install -r backend/requirements-dev.txt`.

**CI exists and was written without being run.** `.github/workflows/ci.yml` (added 25 September 2026) runs on every push and pull request. The backend job runs pytest on Ubuntu under Python 3.10 and 3.14. The frontend job runs `npm ci`, lint, the build (against a placeholder `https://api.example.invalid`, because a production build needs an https API address), `parity4`, `keycheck` and the market-lib tests, plus `glyph-audit` for information only. The browser gates are not in it. It was written on a Windows machine with no Linux and no Python 3.10, so nothing in it had been tried on either before the push of 27 October 2026. The repository's Actions tab shows how it did, and a first run may fail for reasons nobody has seen yet.

In development, API docs are auto-served at `http://127.0.0.1:8000/docs` and `/redoc`. A production backend serves neither.

**Always kill servers you start.** A stray listener on 8000 gives `[Errno 10048] only one usage of each socket address`; a stray Vite server causes confusing CORS failures against a backend that looks fine.

```bash
netstat -ano | grep -E ':8000|:5173'
taskkill //F //T //PID <pid>          # doubled slashes under Git Bash
```

---

# 7. API (as built)

Eight routers exist. **The frontend calls exactly one of them.** A production backend (`ARTHNITI_ENV=production`) mounts only that one and `GET /health`, and serves no API docs.

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

The seven unused routers are thin wrappers over the same service functions and are covered by tests. They are useful in Swagger when demonstrating the architecture to a judge — but a change there does not affect the UI. All of them except `/health` exist in development only.

`POST /api/chat` and `GET /api/report/{id}` were in the plan and **do not exist**. `/report` is a client-side print view, not a server-generated document.

## The one request

`UnifiedAnalysisRequest`. **Required:** `business_category` (≥2 chars), `state` (≥2), and `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `monthly_emi`, `initial_investment`, `monthly_operating_expenses` (all ≥ 0).
**Optional with defaults:** `existing_debt` 0, `household_monthly_income` null, `district` `""`, `location_type` "rural", and `consent` null (a production backend requires it).
**Accepted and ignored:** `employees`, `village`, `market_type`, `customers`, `user_language`, `preferred_dialect`, `literacy_level` and `entrepreneur_type` are still accepted and capped, then dropped before any engine runs. The UI has sent none of them since 27 September 2026.

**`household_monthly_income` is null when the question was left blank, never 0.** A 0 is a real answer, "the household earns nothing", and it puts any loan over the limit (§9).

**Every figure has a ceiling, since 25 September 2026.** Every rupee field on every request model is capped at ₹100 crore (`MAX_RUPEES` in `backend/app/schemas/limits.py`) and refuses Infinity and NaN; `employees` is capped at 10,000. Before the caps, a typed `1e308` went through the whole pipeline and came back "profitable", "low" risk and status "good". The ceilings are far above any micro enterprise, so a real answer never reaches them. `frontend/src/data/limits.js` holds the same numbers so the form stops the reader first, and `test_input_bounds.py` fails if the two files disagree. Since 27 September 2026 every text field has a `max_length` too, and `limits.js` also holds `MAX_CATEGORY_LENGTH` (100) for a typed-in category.

Validation failures return **422**. Nothing guards the journey order — the topbar links to any step — so `/finance` can be submitted with an empty category and state. That 422 is now rendered as a readable sentence rather than `[object Object]`. **The 422 body carries only `type`, `loc` and `msg` for each error** (a handler in `main.py`, 25 September 2026). FastAPI's default body also echoed the rejected `input`, which sent the reader's own figures back in an error body that may be logged, and an Infinity or NaN there could not be written as JSON, so a bad number returned a 500 instead of a 422. `loc` stays, because the frontend names the field to fix from its last element.

`entrepreneur_type` is still accepted but **no page collects it**. Since 27 September 2026 the response no longer echoes it, nor `language`, `preferred_dialect` or `literacy_level`.

**Consent.** A request can carry a `consent` record: `notice_version`, `language`, `given_at` and `age_confirmed`. With `ARTHNITI_REQUIRE_CONSENT` on, which is the default in production, a request without one gets a 422. The record is written to the processing log and never returned. `docs/frontend_integration.md` is the full request and response contract.

## The one response — seven top-level sections

Measured against a live response on 27 September 2026. **Every `*_code` field is a translation code** — the sentence beside it is English, the code is how the frontend shows it in the reader's language (§2.6).

| Section | Contents |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` |
| `risk_analysis` | `pressure_ratio_percent`, `risk_level`, `risk_level_without_new_loan`, `reason`, **`reason_code`**, `monthly_emi`, `estimated_new_emi`, `total_monthly_emi`, `assumed_interest_rate_percent`, `assumed_tenure_months`, and since 25 September 2026 the household check: `household_monthly_income`, `household_repayment_percent`, `household_check`, `household_check_without_new_loan`, `household_limit_percent`, `household_microfinance_income_limit`, `household_in_microfinance_range`, `household_reason`, **`household_reason_code`** — 19 keys |
| `business_analysis` | `business_type`, `initial_investment`, `expected_monthly_revenue`, `monthly_operating_expenses`, `monthly_operating_surplus`, `operating_margin_percent`, `annual_operating_surplus`, `estimated_roi_percent`, `feasibility_status`, `observations[]`, **`observation_codes[]`** |
| `market_context` | list of rows in two shapes, told apart by `metric`. **Every row:** `{state, district, business_category, scope, metric, source, source_code, last_verified, provenance:{20 keys}, match_level}`. **A `wholesale_price_per_kg` row adds** `commodity, commodity_id, unit, indicative_price, price_low, price_high, n_days, n_markets, last_reported`, and `stale` when set. **A `registered_units` row adds** `count, count_suppressed, share_percent, district_total, nic_classes`, and `note_code`/`note` when set |
| `scheme_matches` | list of `{name, `**`level`**`, `**`scheme_id`**`, description, support_type, match_score, **`fit_basis`**, match_reasons[], eligibility_rules[], documents[], last_verified, `**`description_code`**`, `**`support_type_code`**`, `**`match_reason_codes[]`**`, `**`eligibility_codes[]`**`, `**`document_codes[]`**`}` |
| `advisory` | `recommendations[]`, **`recommendation_codes[]`** |
| `mvp_summary` | `status`, `simple_message`, **`message_code`**, `next_step`, **`next_step_code`**, `priority`, `location_type` |

Enumerated values: `financial_status` ∈ profitable / break_even / loss · `risk_level` ∈ low / moderate / high · `household_check` and `household_check_without_new_loan` ∈ within_limit / over_limit / not_checked · `feasibility_status` ∈ feasible / break_even / not_feasible · `mvp_summary.status` ∈ good / attention_needed / review · `match_level` ∈ district / state · market `metric` ∈ wholesale_price_per_kg / registered_units · market `scope` ∈ district / state · scheme `level` ∈ central / state / regional / district / sub_district / block / local_body.

**Those enums stay English inside the API on purpose** — they are load-bearing keys, not display text. They become plain language only at render, through label maps the frontend carries. An enum value a map does not recognise still prints, title-cased, rather than vanishing.

**Contract discipline, and the exact hole in it.** Two test files subscript every one of those keys, so removing or renaming a key fails the suite immediately — that is intentional, and it is the fastest way to check whether a contract change is safe. **The corollary is that *adding* a key passes silently**, and this table proves the cost: six of its seven rows were stale for a day, missing every translation code plus `level` and `scheme_id`, and nothing in the suite could say so. Two consequences worth carrying:

- **A response field the docs do not mention is invisible to reviewers, and a field a Pydantic `response_model` does not declare is invisible to the *client*.** A `response_model` silently filters the returned dict to its own declared fields — the 8 September audit found three fields being computed and then dropped on the way out for exactly that reason.
- **After any change to a service, a schema or `schemes.json`, re-measure this table rather than editing it from memory.**

---

# 8. Data (there is no data model)

No entities, no tables, no `id` fields, no `created_at`. The planned `Entrepreneur` / `BusinessProfile` / `MarketData` / `Scheme` / `FinancialProjection` / `AdvisoryReport` entities were never created. What actually holds data:

## `backend/app/data/schemes.json` — 30 records across 7 tiers
Fields: `id`, `name`, `level`, `description`, `target_segment`, `business_categories[]`, `states[]`, `location_types[]`, `eligibility_rules[]`, `support_type`, `documents[]`, `last_verified`, plus a translation code for every sentence. **There is no `official_url` and there must not be one** — see Feature 6 in §4. Every entry is still transcribed from an official government source with a verification date; the source URL lives in `gen_schemes.py` as an internal citation, never in the data or on the page. **Never edit eligibility text without an official source** — this is the one dataset a judge can fact-check against the internet in real time.

**One structural rule matters more than it looks:** `eligibility_rules` / `eligibility_codes` and `documents` / `document_codes` are **index-aligned arrays**. Insert an English rule without inserting its code at the same position and every later rule silently gets the wrong translation — which reads perfectly fluently and is completely wrong. A test enforces the alignment; do not weaken it.

## `backend/app/data/market_data.json` — 20 records
Written by `tools/fetch-market-data.mjs` on 24 September 2026, never by hand. All 20 rows are in Uttar Pradesh and all are `scope: "district"`: Lucknow ×10 and Varanasi ×10. **6 `wholesale_price_per_kg` rows** for agriculture, three crops per district, from Agmarknet's "Variety-wise Daily Market Prices Data of Commodity" (Ministry of Agriculture and Farmers Welfare): the median mandi price per kg over the last 30 reporting days, with a P10–P90 range. **14 `registered_units` rows**, one per category button except Agriculture and Other in each district, counted from the Ministry of MSME's "List of MSME Registered Units under UDYAM" by NIC 2008 code, with the share of the district's total; a count under 10 is suppressed. Only counts leave the fetch — no name, address, PIN or registration date is stored. Each row carries a 20-key `provenance` object, and `market_data.provenance.json` records the run.
Both datasets are used under GODL-India. The page prints each dataset's attribution once, in English, outside any collapsed section and never as a link, followed by a not-endorsed line and a no-warranty line. `DATA_SOURCES.md` is the full record, including what is still unresolved. To add a district, extend `tools/market-crosswalk.json` and re-run the fetch.

## Client state — `frontend/src/context/AppContext.jsx`
Four form sections plus the API result, **mirrored into `sessionStorage['sih-application']` as `{v: 4, data}` on every change**:

```text
profile   { name, language, dialect }
business  { category, categoryOther, businessName, initialInvestment, monthlyRevenue,
            monthlyOperatingExpenses, existingDebt }
location  { village, district, state, locationType, marketType[], customers }
finance   { availableCapital, monthlyExpenses, monthlyEmi, householdIncome }
result    the full 7-section API response
resultCleared  true when an edit threw a result away; the result pages say so
```

State and district live **only** on `location` — they used to be duplicated on `profile` and asked for twice. `location.marketType` is an **array** (multi-select), not a string.

**Four answers never leave the tab** (`LOCAL_ONLY`, since 27 September 2026): the business name, the village, the market type and the customer description. The backend never used them. Editing one of them does not clear a result.

Three things about the persistence are load-bearing:

- **The stored payload carries a version, and a version the app cannot read is discarded rather than half-restored.** Bump it whenever the shape changes. It is 3 since 25 September 2026: 2 added `resultCleared` and 3 added `finance.householdIncome`. Neither moved or renamed a field, so versions 1, 2 and 3 are all read, and the missing fields are filled in from the blank shape. A bump that moves or renames a field must stop reading the older versions.
- **Restoring merges section by section over the blank shape**, never trusting the stored object wholesale — a field added after a payload was written would otherwise arrive `undefined`, and React silently turns a controlled input with an `undefined` value into an uncontrolled one. The field stops updating and nothing in the console says why.
- **Editing an answer clears the previous result.** Change a figure on `/business` after running the analysis and the result pages stop showing figures computed from the old answers — a stale result that *looks* current is worse than no result. Since 25 September 2026 they say why ("You changed your answers") rather than showing the plain not-ready state, because the edit sets `resultCleared`. With no result, each result page links to the first step whose answers are missing (`firstUnansweredStep`), or to `/finance` when all four could be submitted. Three of them used to send the reader straight to `/finance`, which would then fail with a 422 when the earlier steps were empty; `/analysis` sent them to `/profile`.

---

# 9. Financial Calculations (as implemented)

All deterministic, all unit-tested. **Keep them that way — never move arithmetic into a model.**

```text
monthly_profit            = expected_monthly_revenue − monthly_expenses
profit_margin_percent     = monthly_profit / expected_monthly_revenue × 100   (null when revenue is 0)
financial_status          = profitable | break_even | loss

funding_gap               = max(initial_investment − available_capital, 0)
                            clamped, so surplus capital reads as no gap, not a negative one

monthly_operating_surplus = expected_monthly_revenue − monthly_operating_expenses
operating_margin_percent  = monthly_operating_surplus / expected_monthly_revenue × 100
                                                                              (null when revenue is 0)
annual_operating_surplus  = monthly_operating_surplus × 12
estimated_roi_percent     = annual_operating_surplus / initial_investment × 100 (null when investment is 0)
feasibility_status        = feasible (>0) | break_even (=0) | not_feasible (<0)

estimated_new_emi         = funding_gap priced as a new loan, 12% a year over 60 months
                            (standard annuity, whole rupees; 0 when there is no gap)
pressure_ratio_percent    = (monthly_emi + estimated_new_emi) / monthly_profit × 100
                            <30 low · 30–50 moderate · >50 high
                            surplus ≤ 0 → high, ratio null

household_repayment_percent = (monthly_emi + estimated_new_emi) / household_monthly_income × 100
                            rounded to 2 places, and the verdict is taken on the rounded figure
                            ≤ 50 within_limit · > 50 over_limit
                            income left blank → not_checked, percent null
                            income 0 → over_limit if any repayment, else within_limit, percent null
household_in_microfinance_range = household_monthly_income × 12 ≤ ₹3,00,000
                            existing_debt is not counted (its EMI is already monthly_emi)

scheme match_score        = 60 (kind of work matches)
                            + 40 (scheme names your state)   → 100
                            + 30 (scheme is open nationwide)  → 90
                            no category match → 0, scheme dropped entirely
                            wrong state or wrong settlement type → dropped BEFORE scoring
                            shown as fit_basis ("state" / "region" / "national"), never as a %
```

**Five fields come back `null`, and that is a feature, not a gap** — it means *"we could not compute this"*, which is a different statement from zero. `profit_margin_percent` and `operating_margin_percent` when revenue is 0 (a margin needs revenue to be a share *of*, and printing `0%` there would read as break-even when it is actually a loss), `estimated_roi_percent` when investment is 0, `pressure_ratio_percent` when there is no positive surplus, and, since 25 September 2026, `household_repayment_percent` when the household income was left blank or is 0. **The UI prints "Not available" for the first four.** For the fifth it prints no percentage and no bar: a blank income shows a line saying the check was not done and naming the step where the income can be given, and a zero income shows the check's own sentence. This matters because `Number(null)` is `0` in JavaScript, so a careless formatter turns "could not compute" into a confident, reassuring `0%` — that has been a live bug twice.

## Two different expense questions — do not mix them up

This trips people up, including in the demo:

- **`monthly_expenses`** (asked on `/finance`) means *everything the household spends*. It drives `monthly_profit`, and therefore the risk assessment.
- **`monthly_operating_expenses`** (asked on `/business`) means *business costs only*. It drives `monthly_operating_surplus`, and therefore feasibility and ROI.

They are separate inputs and are allowed to disagree. Both fields carry hint text in the UI for exactly this reason. When a judge asks "why two expense numbers?", the answer is: a business can be viable while the family is still short of money, and conflating the two hides that.

## Not implemented
**Break-even units** and **cash-flow projection** need selling price and variable cost per unit, which we do not collect. `Gross Profit = Revenue − Variable Costs` is likewise uncomputed. Do not put these formulas on a slide as though they run.

## Category synonyms — a wording bridge, not an eligibility widening
Scheme documents say "trading", "manufacturing", "services"; the UI asks the entrepreneur to tap a plain-language button. A map bridges the two (`retail`/`shop`/`kirana` → trading, `handicraft`/`handicrafts` → manufacturing, `tailoring` → manufacturing + services, `livestock` → dairy, `dairy` → poultry).

**This translates wording only. It must never widen a scheme's real eligibility.** The rule to apply when adding an entry: bridge two words for *the same activity*; never bridge two different activities to make output look fuller. Telling an entrepreneur they qualify for money they cannot get costs them a trip to the block office.

**`agriculture` is no longer a dead end, and that is not a violation of the rule above.** It matched nothing until 7 September because the only three schemes in the file covered *allied* activities — dairy, poultry, beekeeping — and not crop farming. The 30-scheme expansion added schemes that genuinely serve crop farmers (Kisan Credit Card, the Agriculture Infrastructure Fund, the district Krishi Vigyan Kendra, the block ATMA unit, the Sub-Divisional agriculture office), so it now matches **11 across 5 tiers**. No synonym was loosened to get there. The 8 September audit also went the other way and *removed* `agriculture` from Stand-Up India, because that scheme's own eligibility text excludes crop cultivation — agriculture went 12 → 11 as a **fix**.

**A typed-in *Other* that resembles nothing in the dataset still matches zero**, and that is the honest empty state working as intended. The empty state names every kind of work the 30 schemes between them cover, so a reader whose trade is close to one of them knows which button to go back and press.

---

# 10. Who built it

**Aryan Verma owns and builds अर्थNiti, alone, from 26 October 2026.** It is entered in the Meta Global AI Developer Hackathon as an individual project (Indie Track).

Until then it was a six-person college team build for the SIH 2026 internal round: Netra and Anmol on the frontend, Aryan and Manjeet on the backend, Saad and Tripti on the presentation and research. Their work is in the git history and the README credits them. **Whether their earlier work may be submitted to the hackathon, reused, or sold is not settled in writing.** `DATA_SOURCES.md` ("People") keeps that item open, and the hackathon's own rules decide what counts as built during the event ([docs/HACKATHON.md](docs/HACKATHON.md)).

---

# 11. Git

**Repo:** `https://github.com/BU1lDR/ArthNiti` (private until the owner makes it public; renamed from `SIH_2026` on 26 Oct 2026). One person works in it now, but the earlier contributors' clones may still exist and still point at the old URL, which GitHub redirects.

**The remote has five branches** (`git ls-remote --heads origin` is the authority, not a list in a document; pushed 27 October 2026):

```text
main            before-main
feature/dpdp-compliance   feature/security-hardening   feature/voice-assistant
```

**`feature/voice-assistant` is the newest build and the one this document describes.** The three `feature/*` branches are points on one line of commits, oldest first. `feature/dpdp-compliance` is the September work: the privacy and deployment work of Feature 16, the verifier work and the owner's brand-asset files, all of which sat uncommitted until 27 October. `feature/security-hardening` adds the Meta helper's backend and the spend cap that bounds its cost. `feature/voice-assistant` adds the `/talk` page, its tests and the docs. The commit titled "chore: the project as it stood at the hackathon start" marks 12:00 PM ET on 26 October 2026, and [docs/HACKATHON.md](docs/HACKATHON.md) §2.3 has the `git diff` that shows everything added after it.

**`main`, the GitHub default branch, is still the old scaffold, and `before-main` is a fast-forward of it** (`git rev-list --left-right --count origin/main...origin/before-main` reported `0 / 185` on 26 October 2026). The new line starts on `before-main`, so `main` can reach it by a fast-forward: a pull request from `feature/voice-assistant` into `main`, or changing the default branch. Either is the owner's step. Compare the `origin/` refs and not the local branch names: local `main` carries 6 unpushed scaffolding commits from early backend work, which makes `main...before-main` look like a divergence that exists on one laptop only.

**Every commit made on 27 October 2026 is dated that day,** including the ones that hold older work, because the work sat in one working tree and was committed afterwards. Nothing is backdated. Git's dates therefore do not separate old work from new; the hackathon-start commit and [docs/HACKATHON.md](docs/HACKATHON.md) §2 do.

Rules, still in force:
1. **Never push directly to `main`.**
2. Small commits with messages that say what changed. No `Co-Authored-By` line and no tool attribution in a commit message or a PR description.
3. Pull/rebase before a merge.
4. Keep `.env` and API keys out of Git. `.env.example` is tracked and names every key the build uses: the data.gov.in key for the market fetch, and the Meta Model API key (`MODEL_API_KEY`, §15). Keep it in step if another key is added.
5. **Any action that changes the GitHub repo needs the owner's explicit confirmation each time**: a push, a PR, a branch or tag, a release, a settings change. Approval for one does not carry to the next. Making the repo public is the biggest of these: it publishes the whole history, including the earlier contributors' commits and their commit emails. The hackathon needs it public, and the owner makes that change, not this build.

Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots`.

`screenshots/{light,dark,light-expanded}/` holds 27 full-page PNGs (9 routes × 3 passes, 2880px). **They predate both the 7 September fixes and the redesign** — old *Sahyog* branding, no market section, ₹0 on `/analysis`, no translation layer, no charts. **Do not circulate them.** Current captures live in `screenshots/verify/out/` and `screenshots/verify/mobile/`, written by the drivers in §13. All of `screenshots/` is gitignored, so hand any of it over as a zip rather than a repo link.

---

# 12. How the build landed

The SIH build was planned as ten days: scope and contract, forms, a financial engine that works without AI, scheme matching, **AI integration**, hyperlocal data, explainability, testing, polish and rehearsal. Every step landed except the AI step, which never connected during the SIH round; the hackathon layer (§15, built 26–27 October 2026) is that step done differently, as an intake helper. Two defects from the way are worth remembering because they were silent: scheme matching had a category-direction bug that zeroed five of nine categories until 7 September, and `market_context` was computed and then discarded by the UI until 7 September. `docs/ENGINEERING_HISTORY.md` ("Known defects") has the dated record.

The honest lesson, and a good answer to "what did you learn?": **the deterministic engine that was supposed to be scaffolding for the AI turned out to be the product.** That is why the hackathon layer (§15) is built around it and not in place of it: a model takes the answers in, and the rules still do all the arithmetic and write all the advice.

---

# 13. Definition of Done — current state

- [x] Frontend runs reliably
- [x] Backend runs reliably
- [x] Profile input works
- [x] Business input works
- [x] Financial calculations work
- [x] Funding gap works
- [x] Risk indicator works
- [x] Scheme matching works — **8 of the 9 category buttons match** (11–16 schemes each, across 5–6 tiers); only a typed-in *Other* correctly matches none
- [x] Hyperlocal market context works, with honest district/state provenance — 20 sourced rows for Lucknow and Varanasi
- [ ] ~~AI advisory works~~ → **deterministic advisory works. There is no AI advisory.** Reworded rather than ticked
- [x] Explainability works
- [x] Action plan works
- [x] Printable report works
- [x] Error and empty states exist on every result page, and each empty state links to the first step with missing answers
- [x] At least 2–3 business categories work — 8 do
- [x] One polished demo persona works (§3)
- [x] Sources recorded with verification dates
- [x] 1,558 backend tests pass; lint and production build are clean; translation-key parity clean across 772 keys × 8 languages
- [ ] CI passes on GitHub — `.github/workflows/ci.yml` exists (§6) and was written without being run; read the Actions tab
- [x] No API keys in the running app. The one key, for the market-data fetch, is read from `.env`, which is gitignored; `.env.example` names it (§11)
- [x] **State survives a page refresh** — closed 8 Sept via `sessionStorage` (§8)
- [x] **Output is in the reader's own language**, including the generated advice (§2.6)
- [x] **Phone widths verified** — all 11 routes measured clean at 360 / 390 / 412 px, plus a 360 px pass in the dark theme at the large text size in Hindi
- [x] **Print output verified** — the `/report` PDF, from a light laptop and from a dark one
- [ ] Three demo scenarios — there is one
- [x] Meta intake helper built (§15), with 1,558 backend tests and a 259-check browser gate for `/talk`, both against a fake Meta
- [ ] The helper run once against Meta's live API: the owner's `python -m app.smoke_meta`, three calls
- [ ] Hackathon submission complete — the checklist is in [docs/HACKATHON.md](docs/HACKATHON.md)
- [ ] Demo recorded or rehearsed at least 3 times, on the machine and browser it will be shown from

## How the frontend is verified — there are no unit tests, and that is not the same as unverified

`npm run lint`, `npm run build` and `pytest` cannot see a leaked translation key, a `null%`, a page that scrolls sideways under a thumb, a `₹30,000` that wrapped as `₹30,00 / 0`, or a logo that prints invisible. **Seventeen zero-dependency scripts** in `tools/verify/` drive Edge over the DevTools protocol, and fifteen of them are gates that assert on what actually rendered; `hero-vibrance.mjs` (a tuning instrument) and `hero-geom.mjs` (it reports measurements, and exits 0 when it measured and 2 when it could not) are not. (Recounted on 29 September 2026, after `figure-audit.mjs` was added, with `grep -l remote-debugging-port tools/verify/*.mjs`.) Each owns a *different* failure class — that is the point, and it is why there are many rather than one big one. The main ones:

| Driver | The one question it asks |
|---|---|
| `drive.mjs` | Did the right text render, and does every scheme card show its fit label and never its score as a percentage? 41 page loads across 8 passes, including a `cleared` pass that checks each result page says the answers changed; exits 1 on a finding |
| `mobile-audit.mjs` | Can a thumb use it? 11 routes plus a blocked `/finance`, at 4 phone widths (360, 390 and 412 px, and 360 px dark, large-text, in Hindi): 48 loads, overflow / tap size / clipping |
| `print-audit.mjs` | Does the PDF read correctly whichever theme the laptop was in? |
| `lang-layout.mjs` | Does switching language change the *layout*, not just the words? 8 languages × 7 routes × 2 widths |
| `field-align.mjs` | Do two form controls sharing a row start on the same line? |
| `hero-art.mjs` | Is the landing backdrop visible *and* the text on it still legible? |
| `hero-geom.mjs` | Where does the backdrop's edge sit relative to the content on it? |
| `brand-mark.mjs` | Is the logo still a recognisable flower in both themes? |
| `manual-audit.mjs` | Do the wordmark, the manual strip and the dialog work in 3 modes? |
| `error-banner.mjs` | Does the `/finance` error read as a sentence in all 8 languages? |
| `glyph-audit.mjs` | Is any decorative emoji going to be read aloud by a screen reader? |
| `scroll-audit.mjs` | Does every page open at the top after an in-app navigation? 38 hops, the back button and a same-page anchor. Its Start-over hop goes through the confirmation dialog |
| `motion-audit.mjs` | Do the transitions actually run, and does reduced motion switch them off? |
| `text-align.mjs` | Do sibling cells, such as the footer's three columns, start their text on the same line? |
| `market-ui.mjs` | Does every market-row branch render, with each dataset's attribution printed exactly once, outside any collapsed section and never as a link? Starts its own Vite on 5179 |
| `figure-audit.mjs` | At the ₹100 crore cap, does every amount and percentage on `/analysis` and `/report` stay on one line, inside its box and at 12px or more? 4 cases from the real backend × 4 looks × 11 widths on both pages: 352 measurements. Needs the backend |
| `hero-vibrance.mjs` | Not a gate — which backdrop filter is *more colourful* without costing legibility? |

Plus `parity4.mjs` (no browser needed) for translation-key parity and, since 25 September 2026, for the figures in each sentence: every translation must carry the same numbers as its English, in Latin digits, and every English scheme sentence the same numbers as `schemes.json`. And `refresh-cases.mjs` to regenerate the captured API responses the drivers seed — **run that one after any backend change**, because stale fixtures make the drivers pass while telling you nothing.

The scripts are tracked in `tools/`; `screenshots/` stays gitignored and holds only the PNGs and JSON they write. **The browser drivers run only on the owner's Windows laptop**: the Edge path is hardcoded, and none of them is in CI. CI runs the server-free checks only (§6). A gate exits 1 on a finding and 2 when it could not measure (a server down, the wrong directory, a crash), so a 2 is never a pass; [tools/README.md](tools/README.md#exit-codes) lists every cause. **They are not a substitute for clicking through once on the machine and in the browser the demo will be shown from.**

## Still not verified
- **Phone landscape orientation, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.** Emulation cannot answer these; borrow a phone.
- **The `api.js` 20-second timeout path** — stop the backend mid-request and confirm the message reads as a sentence.
- **CI on Linux and on GitHub.** The workflow was written without being run (§6); the Actions tab has the result.
- **Non-English wording quality.** Parity, placeholders, the figures in each sentence and "no string left identical to English" are all script-verified across 772 keys × 8 languages. **Naturalness is not** — no native speaker has reviewed it, and two real errors have already been found by eye, which is evidence there are more. Say this if asked; do not claim professional translation. The privacy notice is in that set, and its non-English versions should not reach real users until someone has reviewed them (`docs/PROCESSOR_SCHEDULE.md` §9.1).

---

# 14. Repository Structure (actual)

```text
ArthNiti/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/routes/       8 routers
│   │   ├── schemas/          Pydantic models, + limits.py (the input caps)
│   │   ├── services/         all business logic
│   │   ├── core/             data_loader.py, settings.py, processing_log.py,
│   │   │                     meta_client.py, spend.py
│   │   └── data/             schemes.json (30), market_data.json (20), market_data.provenance.json
│   ├── tests/                48 files + conftest.py and 4 fixture modules, 1,558 tests
│   ├── gen_schemes.py        the source schemes.json is generated from, not runtime
│   ├── requirements.txt      every runtime dependency pinned
│   └── requirements-dev.txt  + pytest and httpx2, for the tests
│
├── frontend/
│   ├── public/               favicon.svg, hero-backdrop.jpeg
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/            11 pages (TalkPage is the helper's)
│   │   ├── components/       Button, BrandMark, BrandWordmark, Figure,
│   │   │                     InstructionManual, ShortNotice, HelperFilledBanner,
│   │   │                     Charts, chartData
│   │   ├── audio/            record.js, wav.js
│   │   ├── config/           deployment.js (the VITE_* settings), notice.js
│   │   ├── i18n/             8 languages, 4 dictionary files, brand.js
│   │   ├── data/             indiaLocations.js (36 states × 768 districts),
│   │   │                     limits.js (the input caps), reviewDates.js
│   │   ├── context/          AppContext.jsx
│   │   ├── services/         api.js
│   │   └── index.css
│   ├── index.html
│   ├── .env.example          the VITE_* build settings, documented
│   └── package.json
│
├── docs/                     frontend_integration.md (the API contract),
│                             PROCESSOR_SCHEDULE.md (for a deploying organisation),
│                             HACKATHON.md (the Meta hackathon entry), requirements.txt
├── presentation/             empty, left over from the team build; nothing reads it
├── tools/                    tracked — 31 scripts, nearly all verifiers, 24 of them in verify/
│                             (plus talk_fake_backend.py, the fake Meta for the /talk gate)
├── screenshots/              gitignored, 8.1 GB — their output only: PNGs, report.json,
│                             Edge profiles, plus 27 stale PNGs (do not circulate)
├── .github/workflows/ci.yml  CI — written without being run (§6)
├── .venv/                    Python 3.14.6, gitignored
├── .env.example              names the one key, for the market fetch; .env is gitignored
├── LICENSE                   proprietary
├── DATA_SOURCES.md           where the market figures come from
├── CLAUDE.md                 engineering context, current rules only
├── docs/ENGINEERING_HISTORY.md  the archive: the full dated reasoning, read by section
├── OUR_MVP.md                this file
└── README.md
```

Differences from the plan worth knowing: no `docs/architecture.md` / `api.md` / `sources.md` / `demo-script.md`, no `hooks/` or `utils/` on the frontend. `docs/frontend_integration.md` was stale until 27 September 2026, when it was rewritten as the measured API contract. `docs/PROCESSOR_SCHEDULE.md` is the schedule for a deploying organisation. `docs/requirements.txt` is unrelated to `backend/requirements.txt`.

---

# 15. The AI Question — read this before you describe the build

**The advice has no model in it.** Every number and every sentence of advice the reader sees is produced by hand-written Python `if`/`else` in `backend/app/services/`, and it is unit-tested. That has not changed.

**The hackathon's Meta Model API layer is built, and it is an intake helper (26–27 October 2026).** It is off unless `ARTHNITI_AI_ENABLED=true` and `MODEL_API_KEY` are set, and with it off the repo makes zero model calls. With it on, the page `/talk` lets the reader speak or type a few sentences in their own language. The backend sends a recording to Muse Voice Transcribe and the text to Muse Spark with a fixed JSON schema, and gets back a draft of the form fields the app already has: business kind, state, district and the amounts the reader mentioned. The page fills those in and marks each one *filled from what you said, please check*. The reader corrects anything, ticks consent and submits, and from there the existing engine does everything, unchanged. [docs/HACKATHON.md](docs/HACKATHON.md) has the account in full, including what existed before the hackathon began and what was added after.

**Nothing has run against Meta's live API yet.** The helper is tested against a fake. The owner's first `python -m app.smoke_meta` (three calls, at most about $0.045 at list price) is the first real contact, and may show that the token limit or the reasoning effort needs adjusting. Until it has run, do not say the helper "works with Meta"; say it is built to Meta's documented API and tested against a fake.

If someone asks to "improve the AI", find out first whether they mean the intake helper or the rules.

## What to say

> "The advisory logic is a deterministic rules engine. That is a design decision, not a shortfall: for financial guidance to a first-time borrower, a wrong number that sounds confident is worse than no number. Every figure we show is traceable to a formula you can read, and it is unit-tested. The output already reaches the entrepreneur in eight languages, including the generated advice, and that is done by translation rather than by generation, so it cannot drift. The model is at the front door: a first-time borrower can say what they do in their own language instead of filling in a form, and the model's job ends at a draft that the person checks. The arithmetic stays in code."

This is a strong position, honestly held. Do not weaken it by overclaiming. Say "AI-assisted intake". Never say "AI-driven advice" or "AI-generated advice".

**One clarification that keeps being needed:** *"no model in the advice"* does not mean *"English only"*. The multilingual output is built and is deterministic (a translation code per sentence, resolved against dictionaries we wrote), which is precisely *why* it is trustworthy enough to demo. Do not answer "is it multilingual?" with "no, there is no AI".

## The Meta Model API layer

**What it is: an intake layer, not an adviser.** The people this is for find a four-step form with money fields the hardest part, and speech is the interface they already use. A model is the right tool for turning loose speech into structured fields. It is the wrong tool for working out a repayment, so it never gets to.

Boundary, non-negotiable:

| The model may | The model must never |
|---|---|
| Turn speech into text | Compute any number the reader sees |
| Turn a free-text description into draft values for the existing form fields | Decide scheme eligibility |
| Say it did not understand, so the reader types instead | Invent a scheme, a rule, an amount or a document |

The rules the build had to meet, and where each stands:

- **The app works fully without it.** Met. The routes are not mounted when the helper is off, `/talk` is a "page not found" when `VITE_AI_HELPER` is not `true`, and a model failure leaves the form as it was, for the reader to type.
- **The model's output is a draft.** Met. The backend keeps an answer only if the field is one we asked for, the value is in range and the quoted words appear in what the person said. The page puts every kept answer into the form for the reader to check, under the same limits as typed answers. One weak point stays: a spoken amount is converted to digits by the model ("two lakh" to 200000) and no code checks the conversion, so the review screen is the control.
- **Its own consent.** Partly met. `/talk` has its own consent tick (and an age tick when configured), its own sentence saying the recording goes to Meta, and its own entry in `docs/PROCESSOR_SCHEDULE.md` §10. That sentence is not part of the versioned notice, and `/privacy` does not mention the helper yet.
- **Nothing it receives is kept or logged by this app.** Met, by tests (`test_log_privacy.py`, `test_intake_log_privacy.py`). The spend ledger holds the cost of each call and no content. What Meta keeps is Meta's: the page tells the person that content sent on free credits may be used to improve Meta's products.
- **Keys stay on the server.** Met. The key is read from the environment only, the backend reads no `.env` file, and `settings.py` refuses a bad value at startup.
- **Said honestly on screen and in the docs.** No sentence anywhere says the advice is AI-generated.

**The spend cap.** The owner will not pay for any of it. Every call is counted in a ledger before it is sent, at its worst-case price, and refused once the total would pass the cap (default $10, at most $100). The ledger cannot see the account, so the owner also sets Meta's email spend limit and checks the balance. [docs/HACKATHON.md](docs/HACKATHON.md) §5 has the details.

**Facts from Meta's public docs, not yet confirmed with a live call:** the endpoints and model names (`muse-spark-1.3` for text, `muse-voice-transcribe-1.0` for speech), the structured-output format, and the limits (a mono WAV at 16 or 24 kHz, up to 10 minutes; the page stops at 60 seconds). Speech is documented for 25 languages, including Hindi, Tamil, Telugu, Kannada, Marathi, Bengali and English, and **not for Malayalam**, so the voice option is hidden for Malayalam and the text option stays. Meta has no text-to-speech.

**Not built:** a plain-words "why is it this way?" for the result, written by a model from the engine's output. It would put a model's wording next to the advice, which is only acceptable with a check that every number in its answer appears in the engine's own result.

---

# 16. Demo Sequence

> **Rewritten 26 October 2026.** This section was the slide list and demo script for the SIH 2026 internal round. The slide list is gone. The demo sequence below is the same walk through the real routes, and it is the base for the hackathon demo; [docs/HACKATHON.md](docs/HACKATHON.md) has the hackathon's own plan. The Meta intake layer (§15) now exists, so in the hackathon video it comes first, shown as the new work, and the rest of this walk is shown as the engine it feeds (earlier work, said so on screen).

## Key message
Do not spend the demo explaining technology. Spend it on **problem → insight → solution → demo → impact.**

## Live demo sequence (matches the real routes)

```text
1.  Frame the rural entrepreneur's problem
2.  /           — open the instruction manual for 15 seconds. "This is how a
                  first-time user learns the journey" — then close it
3.  /profile    — name, language, dialect
4.  /business   — Tailoring, investment ₹1,00,000, sales ₹30,000, operating expenses ₹18,000
5.  /location   — Uttar Pradesh → Lucknow (cascading, so an impossible pair cannot
                  be entered), a village name, weekly market, "local families"
6.  /finance    — capital ₹50,000, monthly expenses ₹15,000, EMI ₹2,000  → submit
7.  /analysis   — money needed ₹50,000 · profit margin 50% · risk LOW · FEASIBLE.
                  Point at the coin chart: "4 of every 10 rupees stay with you" —
                  no numeracy required to read it
8.  /analysis   — scroll to "Your local market": read the district provenance line
                  aloud. This is the hyperlocal claim, on screen, labelled
9.  /analysis   — ** SWITCH LANGUAGE TO HINDI OR TAMIL HERE. ** Do it standing on
                  this page, not on a form: the generated advice and the scheme
                  text change too, which is the part viewers do not expect
10. /analysis   — open "Show detailed calculations" — every figure is traceable
11. /schemes    — 14 matches grouped by the office that runs them, Delhi down to
                  the reader's own Gram Panchayat. Read one office note aloud
12. /advisory   — the recommendations
13. /report     — print preview → this is what the entrepreneur takes to the bank
14. Impact + what comes next (§22)
```

**Refreshing is now safe** — the journey survives it (§8). What is still not safe is opening a result page in a *fresh* tab, so keep the walkthrough in one tab.

Optional 10-second additions if the audience looks interested: dark mode and the largest text scale, both from the utility bar; or a dialect on the landing page, where the greeting and the button text change.

Have a fallback: a saved PDF of `/report` and a current set of screenshots, in case a laptop or port misbehaves. **Recapture them first — the ones in `screenshots/` at the top level are stale (§11).**

---

# 17. Questions a Reviewer Will Ask

> **Updated 27 October 2026 for the hackathon.** The questions are the ones the SIH round prepared for, still the right ones. The Meta model layer is built, so answers that depend on it say what it does and that it has not yet run against the live API.

## "Why AI? Where is the AI?"
Answer honestly, and lead with the design decision — see §15. **The advice has no model in it, and nobody should claim it does.** The model does the intake: it turns a spoken or typed description into the form fields the reader then checks, and the rules still do all the arithmetic and write all the advice. The helper is off by default, and until the owner's first live run it has been tested against a fake Meta only. **And do not let this question also answer "is it multilingual?"** — the eight-language output is built and is deliberately *not* model-generated.

## "Did you build this during the hackathon?"
No, and say so before anyone asks. The first commit is dated 30 August 2026. The rules engine, the scheme and market data, the eight-language interface, the privacy work and the browser checks all existed before 26 October 2026, first as a six-person college team build and, since 26 October, as one person's project. What was built during the event is the model layer (§15) and the work around it. The backend intake code (the Meta client, the prompts and the two routes) was written on the morning of 26 October, before the 12:00 PM ET start, and counts as earlier work; the spend cap, the whole `/talk` page with its state, speech and tests, and the browser gate for it came after. [docs/HACKATHON.md](docs/HACKATHON.md) keeps the dated list, and the event's own rules decide whether earlier work is allowed.

## "Is it actually in Hindi, or just the buttons?"
**All of it** — the labels, the generated advice, the risk explanation and the scheme text, in 8 languages, with Hindi as the default rather than English. Show it rather than saying it: switch language while standing on `/analysis`. The mechanism is a translation code emitted beside every sentence the engine composes, resolved against dictionaries we wrote — so it cannot drift the way a paraphrasing model would.

Then volunteer the limits, because they are the credible part: 30 dialects are listed and **9 carry curated phrase overrides**, which is dialect-aware phrasing rather than dialect translation; digits and money stay in Latin script on purpose, matching Indian currency and government forms; and **no native speaker has reviewed the wording** — parity, placeholders and the figures in each sentence are script-verified across 772 keys, naturalness is not.

## "How do you prevent hallucinations?"
There is nothing to hallucinate in the advice. Every number comes from a unit-tested formula; every scheme fact comes from a structured dataset transcribed from an official source with a verification date. The source is kept on record internally; the app deliberately does not link out to government portals (the links were removed on 10 September 2026). The model layer (§15) only drafts form fields from what the reader said: it is never asked for a number, a scheme or an eligibility rule, its draft is shown to the reader to check before anything is computed, and its values pass the same limits as typed ones.

## "How is this different from ChatGPT?"
ChatGPT does not know how many tailoring businesses are registered in Lucknow or what its mandis have been paying for wheat, cannot tell you whether *your* EMI fits *your* surplus, and will not tell you when it has no data for your district. अर्थNiti combines structured entrepreneur input, a district-level dataset, deterministic financial calculation, rule-based scheme matching with visible reasons, and a printable next-step plan — and it says out loud when a number is a state-level fallback rather than local.

## "Show me the hyperlocal part."
`/analysis` → "Your local market". Then point at the provenance line. `district` means it is their own district; `state` would mean a state-level figure, and none exist yet, so any other district gets an honest empty state rather than Lucknow's numbers. **This is the differentiator**, because most prototypes silently present national averages as local.

## "Is your market data real?"
**Yes, since 24 September 2026, for two districts.** `/analysis` and `/report` show 20 rows for Lucknow and Varanasi from data.gov.in: mandi wholesale prices from Agmarknet (Ministry of Agriculture and Farmers Welfare) for agriculture, and counts of Udyam-registered businesses (Ministry of MSME) for the other seven kinds of work. Each row carries its source, the dataset's own update date and the fetch time, and the page prints each dataset's GODL-India attribution and says the publishers do not endorse the app. Every other district shows the empty state, because a Lucknow figure is not evidence about Kanpur. The scheme data **is** real too, transcribed from official portals with a `last_verified` date on every entry. (We keep the source URLs in our own generator as citations, but the app deliberately does not link a reader out to a government site — §6.) `DATA_SOURCES.md` has the details and what is still unresolved.

## "Can this replace banks or financial advisors?"
No. It is decision-support and financial-literacy assistance — not a lender, not an approval authority. Scheme eligibility, interest rates and approval are decided by the relevant institution, and the app says so.

## "What if the user should not borrow?"
The engine flags it. A non-positive monthly surplus returns `high` risk with an explicit reason, and an EMI above half the surplus is `high` too. If the plan needs more money than they have, the loan that gap would need is counted in the repayment figure, and when that loan alone is what tips it into `high` the next step says to start smaller or raise more first. Nothing in the app recommends a loan amount; the recommendations point at reducing expenses, improving margin and keeping a cash reserve before new investment.

## "Why two different expense figures?"
Because a business can be viable while the family is still short of money — see §9. Conflating the two hides exactly the situation the app exists to surface.

## "How do you scale?"
The engine does not change. What changes is data: more districts added to `tools/market-crosswalk.json` and fetched by `tools/fetch-market-data.mjs`, more schemes in `schemes.json` — the seven-tier structure is already there, so a new block-level scheme is a row, not a code change — and more languages, which is a ninth dictionary rather than a rewrite. Add a database when there is a reason to remember a user across devices.

## "Could this be mistaken for an official government portal?"
**Somebody has to be ready for this one, because the on-screen notice was removed on 8 September 2026.** Answer it directly and without defensiveness: it is a prototype built by one person and not a Government of India service. Then give the reason for the resemblance, which is the good part — a rural user has met this visual language on a real government service and already knows how to read a masthead, a nav band and a bordered card, so borrowing the *structure* lowers the learning cost. What is still on screen is data honesty rather than authority: the footer tells the reader to verify eligibility at a government office, and the market section names its sources and says their publishers do not endorse the app.

## "Why does the login page not log anyone in?"
Because it does not pretend to — it collects a name and carries it into step 1, and the journey works if you skip it. There is no password, no account and no server call. Real authentication is future work (§22); shipping a fake one would have been the dishonest option.

## "What is not finished?"
Answer it straight: no chat, no EMI scenarios or break-even units, no suggested loan amount, market data for two districts only, no server-side persistence (the journey lives in the browser tab), 9 of the 30 dialects carry phrase overrides, the translations have not been reviewed by a native speaker, and a typed-in *Other* trade legitimately matches no schemes. Knowing your own gaps reads as competence.

**Do not list "English-only output" or "a refresh wipes the journey" here** — both were true until 7–8 September and are the two things most likely to be said out of habit. They are built.

---

# 18. Product Success Metrics

For the prototype: time to generate an advisory plan (currently one request, sub-second) · journey completion · correctness of financial calculations (1,558 tests) · correctness of scheme matching (8 of the 9 category buttons match, 11–16 schemes each; only a typed-in *Other* is correctly empty) · translation coverage (772 keys × 8 languages at full parity, script-verified) · explanation quality · number of actionable recommendations · demo reliability.

For future production: entrepreneurs assisted · plans generated · financial-literacy improvement · successful formal-finance connections · business survival and growth · **reduction in inappropriate borrowing** — the metric that matters most and the reason the risk indicator exists.

---

# 19. Risk Register (current)

## Demo risks

| Risk | Mitigation |
|---|---|
| ~~A page refresh wipes the journey~~ | **Closed 8 Sept** — `sessionStorage` (§8) |
| Opening a result page in a **fresh tab** still shows an empty state | Keep the whole walkthrough in one tab |
| Picking a typed-in **Other** trade in the demo shows zero schemes | Use Tailoring, Handicrafts or Food Processing (§3). Agriculture is safe now too |
| Picking any district other than Lucknow or Varanasi shows no market data | Use Lucknow (or Varanasi) |
| Port conflict — a stray uvicorn or Vite process | `netstat` + `taskkill` before starting (§6) |
| `localhost` vs `127.0.0.1` mismatch (uvicorn binds IPv4; `vite preview` may bind `[::1]`) | Try both; pass `--host 127.0.0.1` |
| A reviewer asks whether this is an official portal — **the on-screen notice is gone** | Answer verbally, and know the answer in advance (§17) |
| Screenshots at the top of `screenshots/` are stale — old *Sahyog* branding | Recapture before circulating (§11) |
| **The model API fails, is slow or rate-limited during the demo or while a reviewer tries it** | The layer is optional by design (§15): the form and the engine work without it, and the demo recording is made from a run that worked |

## Project risks

| Risk | Mitigation |
|---|---|
| **Someone claims a model is running before the layer exists, or claims the advice is AI-generated** | §15. Read it before writing any description of the build |
| **Presenting earlier work as built during the hackathon, or presenting the project as one person's from the start** | `docs/HACKATHON.md` keeps the dated list of what was built before 26 October and what was built during the event. The first commit is 30 August 2026 and the history shows several authors |
| **Eligibility under the hackathon's rules** (earlier work, team size, government ties, a public repo) | The Official Rules decide, and the owner reads them. Open until then ([docs/HACKATHON.md](docs/HACKATHON.md)) |
| **Earlier contributors' work submitted or sold without written permission** | `DATA_SOURCES.md` ("People") keeps it open |
| **Sending a recording or a transcript to Meta without the reader's own consent** | A separate tick, a notice line and a `docs/PROCESSOR_SCHEDULE.md` entry before the layer is switched on (§15) |
| **UNDERclaiming the language support** — saying "English only" or "we collect the preference but don't translate" out of habit | §2.6. It has been built since 7 Sept. This risk replaced its own opposite, which is why it is easy to get wrong |
| Describing the dialect layer as translation | Say "dialect-aware phrasing". 9 of 30 varieties, a handful of phrases each (§2.6) |
| Claiming the translations are professionally reviewed | They are not. Parity is script-verified; wording is not (§13) |
| Presenting `/login` as authentication | It is a name-capture screen. §4 Feature 1b |
| Presenting prototype risk thresholds as financial rules | Label them as prototype assumptions every time (§4 Feature 8) |
| Presenting the household check as a lending decision or as RBI compliance | It compares the reader's own, unchecked income figure against one RBI rule for microfinance loans. It never says a lender will lend (§4 Feature 8) |
| Presenting two districts of market data as India-wide coverage | Say "two districts, sourced"; every other district shows the empty state |
| A GitHub change (push, PR, branch, release, a public repo) made without the owner's confirmation | Get the owner's explicit confirmation every time (§11) |
| Feature creep before the 4 November deadline | The build order and the cut list are in [docs/HACKATHON.md](docs/HACKATHON.md); the optional "why?" explainer goes first |
| A contract change silently breaking the UI | Contract tests subscript every key — run `pytest` after any service edit. **Note they only catch a *removed* key, never an added one** (§7) |

---

# 20. (Removed)

The daily stand-up and end-of-day template that stood here belonged to the six-person SIH team. It was removed on 26 October 2026 when the project became a solo build. The plan and the dates for the hackathon are in [docs/HACKATHON.md](docs/HACKATHON.md). The one idea in it that still holds: **since all the UI sections come from one response, a single renamed key breaks several pages at once, and the contract tests are the fastest way to find out.**

---

# 21. Prototype Data Strategy

A small, high-quality, source-labelled dataset beats a large unverifiable one. That principle is why we ship 20 sourced market rows for two districts and say so.

## Actual coverage

**Measured against the live engine on 8 September 2026**, for a rural entrepreneur in Uttar Pradesh / Lucknow. The previous version of this table was pre-expansion — every scheme count in it read 0, 1 or 2. The market column was re-counted on 24 September 2026, when the sourced rows replaced the illustrative ones; Varanasi has the same counts.

| Category button | Scheme matches | Tiers | Market rows (UP / Lucknow) |
|---|---|---|---|
| **Food / Food Processing** | **16** | 6 | **1** |
| Livestock / Dairy | 15 | 5 | 1 |
| **Handicrafts** | **14** | 6 | **1** |
| **Tailoring / Garments** | **14** | 6 | **1** |
| Manufacturing | 14 | 6 | 1 |
| Services | 13 | 6 | 1 |
| Retail / Shop | 11 | 6 | 1 |
| Agriculture | 11 | 5 | 3 |
| Other, typed (e.g. "Photography") | **0** | — | 0 |

Eight of the nine rows are filled in both columns; only a typed-in *Other* is empty in both. **Scheme counts differ for a semi-urban or urban entrepreneur** (roughly 2–3 fewer per category), because settlement type is a gate: the Gram Panchayat counter, the Block Development Office and RSETI drop out, and PM SVANidhi appears.

`/schemes` handles the zero case with an empty state that names every kind of work the 30 schemes between them cover, and links back to `/business`. It is a redirect, not a dead end — and it is now reachable **only** through a typed-in *Other*, which is the one input that should reach it.

## Rules for anyone extending the data

1. **Scheme facts need an official source and a `last_verified` date.** No exceptions — this is the fact-checkable dataset.
2. **Never widen eligibility to make a demo look better.** Telling an entrepreneur they qualify for money they cannot get is the worst failure this product can have (§9).
3. **Market rows come only from the fetch** (`tools/fetch-market-data.mjs`), each carrying its own provenance, and the page prints each dataset's attribution.
4. **Adding a district means adding it to `tools/market-crosswalk.json` and re-running the fetch.** Never hand-write a row: the guard tests in `backend/tests/test_market_data_guards.py` reject one without its provenance.
5. **A new scheme needs a `level`, a `location_types` list, and a translation code for every sentence.** The eligibility and document codes are **index-aligned** with their English arrays — insert a rule without inserting its code at the same position and every later rule silently gets the wrong translation, which reads fluently and is completely wrong (§8).
6. **Run `pytest` and `node tools/parity4.mjs` after touching either dataset**, then `node tools/verify/refresh-cases.mjs` so the browser drivers are not testing last week's response.

---

# 22. Future Scope

**Three items have moved off this list since it was written** — persistence, regional-language output and charts are all built (§8, §2.6, Feature 12). They are recorded as `DONE` below rather than deleted, because they still appear in older notes and drafts.

In rough order of value per unit of effort:

1. ~~**Persistence**~~ — **DONE** for the demo (`sessionStorage`). A real database is still future work, and only worth it once a user should be remembered across days or devices
2. ~~**Regional-language output**~~ — **DONE**, 8 languages including the generated prose. What remains: a native-speaker review, more dialect phrase coverage (9 of 30 today), and more languages
3. **Read-aloud output** (`speechSynthesis`) — high impact for low-literacy users, small implementation, and it composes with the translation layer already in place. **Strongest remaining item for this audience**
4. **The model layer under the §15 boundary** — the speech-and-text intake for the hackathon is the first part, built and not yet run against the live API; a "why?" explainer is optional after it and not built; a conversational assistant is not planned
5. **Loan and EMI structuring** — suggested financing range, EMI scenarios, cash-flow coverage
6. **Break-even and runway** — needs selling price and variable cost per unit added to the business form
7. **More data** — more districts and states in the market dataset (it is two districts today), more schemes per tier, real authentication behind `/login`
8. ~~Charts~~ — **DONE** (hand-rolled, Feature 12). GIS / location intelligence is still open; government open data is in for two districts (data.gov.in)
9. Document OCR, server-side PDF generation, a WhatsApp-style interface
10. Offline / low-connectivity mode, financial-literacy modules, longitudinal tracking, human-advisor escalation

---

# 23. Product Vision — and what is live today

`[LIVE]` runs in the repository today. `[BUILT]` runs in the repository but has not yet met its real service. `[PLANNED]` does not exist.

```text
                 RURAL ENTREPRENEUR
                         ↓
        Text input, 8-language UI         [LIVE — Hindi by default]
        Dialect-aware phrasing            [LIVE — 9 of 30 varieties]
        Voice in (speech to form fields)  [BUILT — off by default, against a fake Meta; §15]
        Read-aloud out                    [PLANNED]
                         ↓
                 Entrepreneur Profile     [LIVE]
                         ↓
                 Business Understanding   [LIVE — structured form, not free text]
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
       Hyperlocal Data        Financial Data
       [LIVE — 20 rows,       [LIVE — user input]
        2 districts]
              ↓                     ↓
              └──────────┬──────────┘
                         ↓
                  ADVISORY ENGINE         [LIVE — deterministic Python]
                         ↓
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
      Business       Financial       Scheme
      Feasibility    Structuring     Matching
      [LIVE]         [PARTIAL —      [LIVE — 30 schemes,
                      gap + risk,     7 tiers of government,
                      no EMI plan]    grouped by office]
          ↓              ↓              ↓
          └──────────────┼──────────────┘
                         ↓
                Explainable Advice        [LIVE — rule-based reasons, in 8 languages]
                         ↓
                    Risk Check            [LIVE — plus the RBI 50% household check,
                                           when a household income is given]
                         ↓
                  Action Plan             [LIVE — printable report, with charts]
                         ↓
             RURAL BUSINESS GROWTH
```

---

# 24. Decision Rules

1. Prefer features that directly solve the entrepreneur's problem.
2. **Prefer deterministic calculation over generated numbers.** This is now the product's identity, not just a rule.
3. **Prefer verified data over impressive-looking fake data**, and label anything indicative.
4. Prefer one polished workflow over many unfinished features.
5. Keep the frontend–backend contract in one place (`docs/frontend_integration.md`), and change it in the same commit as the code.
6. ~~No new features before the SIH round.~~ Retired. The hackathon deadline brings its own cut list: [docs/HACKATHON.md](docs/HACKATHON.md).
7. If a feature cannot be demonstrated clearly in under 60 seconds, question whether it belongs.
8. **Never make the demo look more capable than the build.** An honest gap is defensible; a discovered overclaim is not.

---

# 25. Remaining Work

The checklist that stood here was the SIH round's (rehearsals, who answers which question, the freeze). It was removed on 26 October 2026. The live plan, the build order and the submission checklist are in [docs/HACKATHON.md](docs/HACKATHON.md). What it left open, and is still open:

- [ ] A second and third demo scenario — a moderate-risk and a high-repayment-pressure persona, to show the risk engine actually moving
- [ ] **Walk every path you plan to show**, plus the one nobody has: the `api.js` timeout (stop the backend mid-request and confirm the message reads as a sentence). There are no outbound links left to click — the scheme cards deliberately do not link to government portals (§6)
- [ ] **Recapture the screenshots** — the top-level set still shows *Sahyog* branding (§11)
- [ ] A native speaker's eye over one language's wording, even just the landing page and `/analysis` (§13)
- [ ] Phone landscape and a real device — emulation cannot answer either (§13)

Not planned for the hackathon: a database · real authentication · read-aloud output · EMI scenarios · break-even units · frontend unit tests · more languages.

---

# 26. AI Continuity Instructions

Any AI assistant reading this file should:

- Treat **[CLAUDE.md](CLAUDE.md)** as the authoritative engineering context and this file as the product context. CLAUDE.md is more likely to be current on code detail.
- **Describe the model layer as what it is (§15):** an optional intake helper, off by default, that drafts form fields from speech and text for the reader to check, and that has so far run against a fake Meta only. Never call the advice AI-generated. If asked to "improve the AI", ask whether that means building or extending the model layer or improving the rules.
- **Equally: never describe the output as English only.** It is translated into 8 languages, including every sentence the engine composes (§2.6). "No model" and "English only" were the same limitation until 7 September 2026 and are now separate facts.
- Remember there is **no database and no server-side persistence**. The journey lives in the browser tab (`sessionStorage`). Do not suggest a migration, an ORM model, or a query — and do not move financial answers into `localStorage`, which would leave them on a shared laptop after the user walks away.
- **Any user-visible sentence needs a translation key, and a sentence must never be assembled from parts in JSX.** Concatenating a translated label with a value and a Latin full stop puts English word order into a Devanagari sentence. Give the whole phrase its own key with a placeholder.
- Keep financial calculations deterministic and unit-tested. Never move arithmetic into a model.
- **Never widen scheme eligibility** to make output look more complete (§9, §21).
- Guard on the raw value before printing a number. The backend sends `null` for anything it could not compute, and `Number(null)` is `0` — a naive guard turns "could not compute" into a confident, favourable `0%`. This has been a live bug twice.
- The order of work is: correct advice first, then honest claims, then a build a fresh clone can reproduce and verify, then polish. Until the hackathon submission (the working deadline is the evening of 3 November 2026 IST), "prefer the demo path over refactors" applies again to new work. CLAUDE.md carries the full status line.
- **Ask for explicit confirmation before any action that changes the GitHub repository** — push, PR, branch or tag creation or deletion, releases, settings, visibility. Local commits when requested are fine. Approval for one push does not carry to the next. The repo may still have collaborators from the team build.
- Run `pytest` after any service or schema edit; run `npm run lint` and `npm run build` after any frontend edit; run `node tools/parity4.mjs` after touching any dictionary; run `node tools/verify/refresh-cases.mjs` after any backend change, or the browser drivers will keep passing against last week's response.
- Clean up any server you start (§6).
- When suggesting code, name the exact file path. When changing architecture, explain why and update this file in the same commit.

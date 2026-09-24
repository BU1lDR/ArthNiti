# अर्थNiti — MVP
## Shared team context: what we actually built

> **Purpose:** the single shared context document for all six team members and their AI assistants.
> **Rule:** this file describes the MVP **as it exists in the repository**. When you change the build, change this file in the same commit. Anything not yet built is labelled **PLANNED** — never write a planned thing as though it works.
> **Engineering detail lives in [CLAUDE.md](CLAUDE.md)** — exact file paths, response keys, thresholds, known traps. This file is the product/team view; CLAUDE.md is the code view. If they disagree, CLAUDE.md is newer.

**Status as of 24 September 2026.** We built this for the SIH 2026 internal college round, held on 14 September 2026 after being moved from 11 September, and we were **not selected**. The project continues on its own. The owner, Aryan Verma, decided its direction on 23 September 2026: it is a portfolio piece, and mainly a product to sell to businesses that serve real users. The project and the scheme data belong to the owner and the code is proprietary (see `LICENSE`). The hyperlocal claim stays, and since 24 September 2026 it is backed by 20 sourced rows for Lucknow and Varanasi from data.gov.in under GODL-India (see `DATA_SOURCES.md`). DPDP compliance is in scope. CLAUDE.md, "Decided by the owner", has the details and the two questions still open. The table below still describes the build accurately. Sections 16, 17, 19 (demo risks), 20 and 25 were written for the round and are kept as history.

| | |
|---|---|
| Project name | **अर्थNiti** (frozen) |
| Phase | Working prototype. The hackathon ended, so the feature freeze no longer applies. It continues as a standalone project |
| Backend | Runs. 8 routers, 323 passing tests |
| Frontend | Runs. 10 routes plus a catch-all, full journey works end to end |
| Integration | Done — one API call carries the whole journey |
| Datasets | 30 government schemes across 7 tiers, 20 sourced market rows (Lucknow + Varanasi, data.gov.in, GODL-India) |
| Languages | 8 UI languages + a dialect phrase layer. **Backend prose is translated too** — see §2.6 |
| LLM / AI model | **None. Zero model calls.** See §15 |
| Database | **None.** Answers persist in the browser tab (`sessionStorage`) only — see §8 |
| Presentation | Delivered at the 14 September round (Saad + Tripti) |

---

# 1. Project Identity

## Project Name
**अर्थNiti** — *अर्थ* (money / economy) + *नीति* (policy, plan, prudent course). "A money plan."

Written exactly like that: Devanagari **अर्थ** and Latin **Niti**, one word, no space. The mixed script is the wordmark and is what appears in the logo. It was written `ArthNiti` until 8 September 2026 — that spelling is retired.

**The name does not translate.** Switching the interface to Tamil or Bengali changes every other word on the page and leaves the name alone, because a brand is a proper noun. It lives in one place in the code (`frontend/src/i18n/brand.js`) so it cannot drift between the masthead, the footer, the report sheet and the browser tab. If you are writing a slide, a script or a caption, spell it `अर्थNiti` there too.

**The logo** is an eight-petal lotus rosette around a ₹ coin with three coins falling below it, drawn as SVG so it recolours itself for dark mode and still prints in full colour on the `/report` PDF. It appears in the masthead, on `/login`, in the footer, on the printed report and as the browser tab icon.

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
| 3 | What does my local market look like? | **Built** — mandi prices and registered-business counts for two districts (Lucknow, Varanasi), sourced and attributed |
| 4 | How much money do I need? | **Built** — `funding_gap` |
| 5 | How much from my own capital? | **Built** — available capital is an input and shown against the gap |
| 6 | How much external financing is appropriate? | **Partial** — we show the gap and the repayment risk, but no suggested loan amount or EMI scenarios |
| 7 | Which support schemes are relevant? | **Built** — 30 schemes across 7 tiers of government, matched with reasons |
| 8 | Can I safely afford the repayment? | **Built** — repayment-pressure ratio → low / moderate / high |
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
2. **Personalized — DELIVERED.** Every number derives from the eight figures the user entered. Two different users get genuinely different results.
3. **Financially structured — PARTIALLY DELIVERED.** We convert investment and capital into a funding gap and test the EMI against surplus. We do not yet produce financing scenarios or an EMI schedule (§22).
4. **Explainable — DELIVERED.** Scheme matches carry `match_reasons`; risk carries a `reason` sentence; business analysis carries `observations`. Advanced numbers sit behind a "Show detailed calculations" disclosure so the first screen stays readable.
5. **Actionable — DELIVERED.** Every result page ends in next steps; `/report` prints.
6. **Regional-language — DELIVERED.** This entry said "NOT DELIVERED — all output is English. Do not claim Hindi output" until 8 September 2026. **That is now wrong in the direction that costs us marks**, so read the replacement carefully before presenting:
   - **8 languages** — English, Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali — each listed in its own script with a sample line, so a reader who cannot read English can find their own language. **Hindi is the default**, not English.
   - **The generated advice and the scheme text change with it.** Every sentence a Python service composes carries a translation code beside it, and the frontend resolves the code to the reader's language. So do not say "the labels are translated" — the *output* is. On stage this is the single strongest moment in the walkthrough, and a **result** page is a better place to show it than a form page.
   - **A dialect phrase layer** on top: 30 varieties listed, of which **9 carry curated phrase overrides** for the highest-visibility strings (the greeting, the call to action, the words for money). Anything not overridden falls through to the language, so every dialect is a fully usable UI. Say **"dialect-aware phrasing"** — not "translated into Bhojpuri".
   - **What is still English, say this if asked:** an enum value the label maps do not recognise falls back to a title-cased English word; a scheme added to `schemes.json` without codes falls back to its English prose; digits stay Latin and money stays `en-IN`-grouped on purpose, because that is what is printed on Indian currency and on government forms; and **the non-English wording has not been reviewed by a native speaker** (648 keys × 8 languages — parity and placeholders are script-verified, naturalness is not).
7. **Responsible — DELIVERED.** A non-positive surplus short-circuits to `high` risk. Nothing in the app recommends borrowing a specific amount. Scheme cards carry a verify-with-the-authority disclaimer, and the market section names each dataset it draws on, prints its GODL-India attribution, and says the publishers do not endorse the app and give no warranty.

---

# 3. What the MVP Does

## The journey as built

Ten frontend routes, plus a catch-all for typo'd URLs:

```text
/               Landing page — hero, what we offer, how it works, and the
                instruction manual (a walkthrough of all eight screens)
    ↓
/login          OPTIONAL — name, phone, address, email. Nothing is
                authenticated and there is no password; it only carries the
                name into step 1. Do not present it as auth (§4.1)
    ↓
/profile        Step 1 of 4 — name, language, dialect, literacy level
    ↓
/business       Step 2 of 4 — category (9 buttons), business name, investment,
                monthly sales, monthly operating expenses, employees, existing debt
    ↓
/location       Step 3 of 4 — village, state → district (cascading dropdowns,
                36 states/UTs × 768 districts), location type, market type, customers
    ↓
/finance        Step 4 of 4 — available capital, monthly expenses (incl. household), monthly EMI
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
```

The whole assessment is one HTTP request. That is deliberate: fewer moving parts to fail on a projector.

## The demo persona — use this one

**Tailoring (or Handicrafts) · Uttar Pradesh · Lucknow.**

Measured against the live backend on 8 September 2026, this fills *every* section on screen and shows the widest spread of government tiers: **14 scheme matches across 6 of the 7 tiers**, both of the fit labels Uttar Pradesh can show ("Made for your state" for a scheme that names only Uttar Pradesh, "For all of India" for one open nationwide) so the scheme-fit chart renders, plus a **district-level** market row. Food Processing is equally safe (16 matches). **Agriculture is now safe too** — 11 matches across 5 tiers, and it is arguably the better story since it was a dead end until 7 September — and in Lucknow it now shows three mandi prices (wheat ₹26.59, paddy ₹31, potato ₹8 a kg).

The one tier no Uttar Pradesh pick reaches is `regional`: UNNATI is North-East-only and Vibrant Villages is border-block-only.

**Say "six of the seven tiers", not seven — no single input reaches all seven.** This paragraph used to say "if a judge asks to see all seven, use Assam", and that was wrong: Assam reaches six, swapping `regional` in for `state`. Measured over every named state × 8 categories × 3 settlement types, **six is the maximum**, because the six states with their own state scheme (Uttar Pradesh, Maharashtra, Tamil Nadu, Kerala, West Bengal, Karnataka) and the twelve reached by a regional scheme (the North-East plus Himachal Pradesh, Uttarakhand, J&K and Ladakh) **do not overlap**. The dataset does span all seven tiers — that claim is about the 30 schemes in the file and is safe to make. Reaching all seven *on one screen* would need a state scheme for a North-Eastern or border state, which is a dataset gap, not a bug. If a judge asks specifically to see a **regional** scheme, use **Assam** and expect no state tier and no market row.

Also give the location step a **village name, a market type and a customer description**. All three flow into `market_context[].local_context` and are printed back to the entrepreneur — that read-back is what makes the hyperlocal claim land.

## The exact demo payload, and what it returns

Enter these figures and you get the result below. **Re-measured against the live engine on 8 September 2026** — every number here was read off a real `200` response, not copied forward.

| Step | Field | Value |
|---|---|---|
| `/business` | Category · investment · monthly sales · operating expenses | Tailoring · ₹1,00,000 · ₹30,000 · ₹18,000 |
| `/location` | State · district · village · location type · market · customers | Uttar Pradesh · Lucknow · Khera · Rural · Weekly haat · Local families |
| `/finance` | Available capital · monthly expenses · EMI | ₹50,000 · ₹15,000 · ₹2,000 |

Result — HTTP 200, all 7 sections populated:

```text
Money needed (funding gap)     ₹50,000
Money left each month          ₹15,000        profit margin 50%     → profitable
Risk                           LOW            loan payments are 20.75% of surplus
                                              (₹2,000 EMI + ₹1,112 estimated for a
                                              loan covering the ₹50,000 gap)
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

Those are the numbers to have in your head on stage. If a figure on screen disagrees with this table, something regressed — check before presenting.

**Note the fit split, and do not call it a percentage.** Each card says "Made for your state" (the scheme names only Uttar Pradesh) or "For all of India". A third label, "For a few states, including yours", is for a scheme that names the reader's state among several (UNNATI in the North East, Vibrant Villages in the border states); it scores 100 like a one-state scheme and cannot appear for Uttar Pradesh. Behind them the score is 100 or 90, the only two values reachable, and it checks no eligibility rule, so the page no longer prints it as "90% match" (changed 23 September 2026), which reads as a 90% chance of qualifying. The demo block above shows the `fit_basis` value behind each label. Say "listed for your kind of work, then for your state, and the rules still have to be checked at the office", never "scored by a model" and never "you qualify".

**Avoid on stage:** a typed-in *Other* that resembles nothing in the dataset — that is the only input left that matches zero schemes, and §21 explains why that is correct rather than broken. Every category except Other now has a market row in Lucknow and Varanasi; any other district shows the market section's empty state.

## What used to break the demo — and no longer does

This section read **"State lives only in React memory … a page refresh wipes everything … do not refresh, and do not deep-link"** until 8 September 2026. **That is fixed.** Every answer and the API result now mirror into `sessionStorage['sih-application']`, so:

- **A refresh no longer loses anything** within the tab. This was our single largest demo risk and it is closed.
- **`sessionStorage`, not `localStorage`, and that is deliberate** — someone's revenue, debt and EMI must not sit on a shared demo laptop after they walk away, and a closed tab being a clean slate is exactly what we want between two judges.
- **Language, dialect, theme and text size are in `localStorage` instead**, because a display preference is not personal financial data and *should* outlive the tab.
- **"Start over" in the utility bar is the only way back to a blank form** without closing the tab. It appears only once there is something to lose.

**What is still true:** a result page cannot be *deep-linked from a cold tab*, because there is no URL state — open `/report` in a brand-new tab and you get its empty state. Walking the journey once, then refreshing or moving between result pages freely, is the supported rehearsal loop.

---

# 4. Feature-by-Feature Status

## Feature 1 — Entrepreneur Profile · **BUILT (reduced)**
Collects: name, preferred language (8, from a dropdown listing each in its own script), dialect (**a dropdown that cascades from the language**, 30 varieties — it was free text in the plan), literacy level.
Cut from the original plan: age range, gender, experience years, existing-vs-new. **State and district were deliberately removed from this page** — they were being asked twice, here and on `/location`, and now live only on `/location`.

## Feature 1b — Login · **BUILT, AND IT IS NOT AUTHENTICATION**
`/login` collects name, phone, address and email. **There is no password, no account, no session and no server call** — it carries the name into step 1 and nothing else. It is skippable and the journey works without it. If a judge asks, say exactly that: it is a name-capture screen shaped like a login, and real authentication is §22 work.

## Feature 2 — Business Profile · **BUILT**
Category (9 buttons: retail, food processing, handicrafts, tailoring, agriculture, dairy, services, manufacturing, other), business name, initial investment, expected monthly sales, monthly operating expenses, employees, existing debt.
Note the hint text: this page's expense question means **business-only costs**. `/finance` asks a *different* expense question. See §9.

## Feature 3 — Hyperlocal Context · **BUILT**
Village, **state → district as cascading dropdowns** (36 states/UTs × 768 districts — free-text boxes in the plan, so "Lucknow" could be submitted with "Kerala"), location type (rural / semi-urban / urban), market type (multi-select: village / weekly haat / town / online / mixed), customer description.
Matching is tiered: the entrepreneur's own district + state + category first; else a state-level row for the same state + category, flagged `match_level: "state"` (none exist yet); else an empty section. Another district's row is never shown. Rendered on `/analysis` and inside `/report`.
**Location type is now load-bearing, not just collected.** Every scheme declares which settlement types it serves, so a rural entrepreneur is not shown PM SVANidhi (urban street vendors) and an urban one is not shown the Gram Panchayat counter or the Block Development Office. That is a *gate*, not a score penalty — see §9.

## Feature 4 — Business Feasibility Engine · **BUILT (reduced)**
Returns operating surplus, operating margin %, annual surplus, estimated ROI %, `feasibility_status` (feasible / break_even / not_feasible) and plain-language observations.
**Break-even units and cash-flow projection were not built** — we have no unit-economics inputs (selling price, variable cost per unit) to compute them from. See §25.

## Feature 5 — Financial Structuring Engine · **PARTIAL**
Built: monthly profit, profit margin, `funding_gap = max(initial_investment − available_capital, 0)`, and repayment-pressure risk.
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

## Feature 7 — Explainability · **BUILT**
`match_reasons[]` per scheme ("Your kind of work is supported by this scheme (listed as …)", "This scheme is for every state, including yours.", "This scheme is only for your state." or "This scheme is only for some states, and yours is one of them."), a `reason` sentence on risk, `observations[]` on business analysis, `match_level` provenance on every market row, and a source label on every price. **Every one of those sentences also carries a translation code**, so the explanation appears in the reader's own language rather than only the labels around it (§2.6).

## Feature 8 — Risk Indicator · **BUILT**
`pressure_ratio = (monthly_emi + estimated_new_emi) / monthly_surplus × 100` → **below 30% low, 30–50% moderate, above 50% high**. `estimated_new_emi` is the funding gap priced as a new loan at an assumed 12% a year over 60 months, and the page prints that assumption beside the figure; it is 0 when the entrepreneur already has the money. `existing_debt` is not added, because its repayment is the EMI they entered. Non-positive surplus short-circuits to `high` with a null ratio and the sentence "There is no positive monthly surplus available for repayment."
**These thresholds are our prototype assumptions and must be presented as such** — not as universal financial rules. That framing is a judge-facing requirement, not a footnote.

## Feature 9 — Action Plan · **BUILT**
`advisory.recommendations[]` selected by financial status, profit-margin band (10% / 30%) and cash reserve. `/report` renders up to five as numbered steps and falls back to four sensible defaults if the engine returns none. `/report` prints to PDF with `break-inside: avoid` on every card and a forced-light colour set, so a dark-mode laptop still prints on white.

## Feature 10 — AI Chat Assistant · **NOT BUILT**
There is no chat endpoint and no chat UI. `POST /api/chat` does not exist. Nobody should demo or promise it. It is the first item in §22.

## Feature 11 — Multilingual output · **BUILT**
8 languages, Hindi by default, plus a dialect phrase layer — and the *generated advice and scheme text* change with the language, not only the labels. Full detail and the exact honest caveats are in §2.6. **This is the strongest single moment in the walkthrough**; switch language while standing on a **result** page.

## Feature 12 — Charts · **BUILT (hand-rolled, no library)**
Three chart types in `frontend/src/components/Charts.jsx`, drawn in CSS rather than with Recharts, for three reasons that all matter here: the colours come from the theme tokens so dark mode and the print palette work with no extra code; the bars survive `window.print()`, where a JS library has already measured a screen-width container before the paper layout re-measures; and **the number is always printed as text beside the bar**, so a chart is decoration over a readable figure rather than the only place a value exists.

- **`UnitChart`** — ten coins, the first *N* filled. The one chart that needs no numeracy at all, which is why the result pages lead with it: *"4 of every 10 rupees stay with you."*
- **`BarRow` / `BarGroup`** — money in / money out / money left, and the scheme-fit split. **A group always shares one maximum**, and **a negative value gets no bar at all** — it used to scale on absolute value, so a ₹10,000 shortfall drew exactly the bar a ₹10,000 profit drew, and a long bar reads as "plenty" to anyone not also parsing the minus sign.

## Feature 13 — Accessibility and reading affordances · **BUILT**
Two independent switches on `<html>`, both persisted: **dark mode** and a **three-step text scale** that *multiplies* the reader's own browser font size rather than replacing it. (A high-contrast mode was a third until 8 September 2026, when it was removed at the owner's instruction. Both remaining themes are AA-checked and the text scale is untouched, but a dedicated high-contrast mode is not offered.) Plus a skip link, `<html lang>` tracking the chosen language, `aria-hidden` on every decorative glyph, and a 44px minimum touch target on every control. These are part of the government-service register we are borrowing, not extras bolted on top.

## Feature 14 — Instruction manual · **BUILT**
A strip on the landing page opens a modal walkthrough of all eight screens — what each one asks for and why. **It carries its own language dropdown inside the panel**, so a reader who cannot read the current language can switch from where they are instead of hunting the utility bar first. Worth 20 seconds on stage: it is the answer to "how would a first-time rural user know what to do?"

## Feature 15 — Government-style interface · **BUILT (a deliberate design choice)**
The chrome is modelled on Indian e-governance portals — a masthead with the lotus mark, a tricolour rule, a persistent utility bar, a horizontal nav band, breadcrumbs, plain bordered cards, a dense multi-column footer. **The reason is usability, not imitation:** a rural user has met that visual language before on a real government service and already knows how to read it.

"Government-like" means those structural conventions. It does **not** mean 2000s-era visual quality — the brief was explicit that the interface must be understandable by low-literacy readers *without being basic*.

**The on-screen "student prototype / not a Government of India service" notice was removed on 8 September 2026 at the owner's instruction.** So if a judge asks whether this could be mistaken for an official portal, **the answer is verbal now and someone has to give it** — say plainly that it is a student prototype and not a government service. What remains on screen is different and must not be tidied away: the footer's *verify eligibility at a government office* line, and the *"Demo estimate — sample figures, not a real survey"* label on every market row. Those are data-provenance honesty, not an is-this-official disclaimer.

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

- **A database.** The demo has no multi-session requirement, so a server-side store would have been cost without payoff. The browser tab holds the journey instead (§8).
- **A charting library.** The charts are hand-rolled in CSS on purpose — see Feature 12 for the three reasons, all of which are specific to this demo.
- **An i18n library.** Eight plain dictionary objects and a 12-line lookup function, verified by our own parity script. A library would add a build dependency to solve a problem we do not have.
- **A frontend test framework.** Instead there are **eleven zero-dependency browser drivers** that drive Edge over CDP and assert on rendered output (§13). They were written because lint, build and pytest cannot see a leaked translation key, a `null%`, a page that scrolls sideways on a phone, or a logo that prints invisible.
- **Route guards.** Any step is reachable from the nav bar. Submitting an incomplete form returns a readable error rather than being prevented — which is the honest behaviour for a prototype and one fewer thing to fail on stage.

The goal was a **convincing, functional MVP**, and that is what exists.

---

# 6. Technical Architecture (as built)

## Frontend
React **19.2.8** · Vite **8.2.2** · Tailwind CSS **4.3.3** · react-router-dom **7.18.3** · ESLint **10.9.0**. No TypeScript. **No charting library and no i18n library** — both were in the plan; both are hand-rolled instead, for the reasons in Feature 12 and §5. There *are* charts, which this section denied until 8 September 2026.

```text
frontend/src/
  App.jsx                 shell (utility bar / masthead / nav / main / footer)
                          + JourneyBar + LandingPage + NotFoundPage + 10 routes + catch-all
  context/AppContext.jsx  the entire client state, mirrored into sessionStorage
  i18n/                   languages.js (8 languages + 30 dialects), LanguageContext.jsx
                          (the t() / tBackend() provider), backendText.js (resolves the
                          backend's translation codes), brand.js (the product name —
                          deliberately NOT translatable), and four dictionary files:
                          strings.js, resultStrings.js, backendStrings.js, schemeStrings.js
  data/indiaLocations.js  36 states/UTs × 768 districts, for the cascading dropdown
  pages/                  9 page components
  components/             Button, BrandMark, BrandWordmark, InstructionManual,
                          Charts (BarRow / BarGroup / UnitChart), chartData
  services/api.js         the only network call in the app
  index.css               design tokens + the .ui-* design system + @media print
```

Presentation state on `<html>`, all persisted in `localStorage`: `data-theme="dark"` (`sih-theme`), `--ui-scale` (`sih-textsize`), plus `sih-language` and `sih-dialect`. (`sih-contrast` was one of them until high contrast was removed; nothing reads it now, so a returning visitor's copy is inert.) **The user's financial answers deliberately go somewhere else — `sessionStorage`** — because a display preference should outlive the tab and someone's revenue and debt should not (§8).

## Backend
Python **3.14.6** · FastAPI **0.141.1** · Pydantic **2.13.5** · uvicorn **0.52.4** · pytest **9.1.1**.

```text
backend/app/
  main.py                 FastAPI app + CORS + 8 include_router calls
  api/routes/             8 routers, one file per domain
  schemas/                Pydantic request/response models
  services/               ALL business logic — plain functions, no classes, no I/O
  core/data_loader.py     loads JSON from app/data by absolute path (cwd-independent)
  data/                   schemes.json (30 schemes, 7 tiers), market_data.json (20 sourced rows) + market_data.provenance.json
  gen_schemes.py          the generator that produced schemes.json — provenance, not runtime
backend/tests/            26 test files + market_fixtures.py, 323 tests
```

The planned `models/`, `calculations/` and `ai/` directories **do not exist**. Calculations live in `services/`; there are no ORM models because there is no database; there is no `ai/` because there is no model call.

Style rules, if you are adding code: services are pure functions returning plain dicts, rounded to 2 decimals; services never import FastAPI; routers never do arithmetic.

## Database
**None.** No SQLite, no PostgreSQL, no ORM, no migrations. JSON files in `backend/app/data/` are the only data store, read once per process and cached read-only. **Nothing the user enters is written to any server** — the answers live in the browser tab and are gone when it closes (§8).

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
../.venv/Scripts/python.exe -m pytest tests -q      # 323 passed in about two seconds

# Translation-key parity — from the repo root, no server needed
node tools/parity4.mjs                        # 4 files × 8 languages, 5 checks
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

Measured against a live response on 8 September 2026. **Every `*_code` field is a translation code** — the sentence beside it is English, the code is how the frontend shows it in the reader's language (§2.6).

| Section | Contents |
|---|---|
| `financial_analysis` | `monthly_profit`, `profit_margin_percent`, `financial_status`, `available_capital`, `monthly_expenses`, `expected_monthly_revenue`, `initial_investment`, `funding_gap` |
| `risk_analysis` | `pressure_ratio_percent`, `risk_level`, `risk_level_without_new_loan`, `reason`, **`reason_code`**, `monthly_emi`, `estimated_new_emi`, `total_monthly_emi`, `assumed_interest_rate_percent`, `assumed_tenure_months` |
| `business_analysis` | `business_type`, `initial_investment`, `expected_monthly_revenue`, `monthly_operating_expenses`, `monthly_operating_surplus`, `operating_margin_percent`, `annual_operating_surplus`, `estimated_roi_percent`, `feasibility_status`, `observations[]`, **`observation_codes[]`** |
| `market_context` | list of rows in two shapes, told apart by `metric`. **Every row:** `{state, district, business_category, scope, metric, source, source_code, last_verified, provenance:{20 keys}, match_level, local_context:{village, market_type, customers}}`. **A `wholesale_price_per_kg` row adds** `commodity, commodity_id, unit, indicative_price, price_low, price_high, n_days, n_markets, last_reported`, and `stale` when set. **A `registered_units` row adds** `count, count_suppressed, share_percent, district_total, nic_classes`, and `note_code`/`note` when set |
| `scheme_matches` | list of `{name, `**`level`**`, `**`scheme_id`**`, description, support_type, match_score, **`fit_basis`**, match_reasons[], eligibility_rules[], documents[], last_verified, `**`description_code`**`, `**`support_type_code`**`, `**`match_reason_codes[]`**`, `**`eligibility_codes[]`**`, `**`document_codes[]`**`}` |
| `advisory` | `recommendations[]`, **`recommendation_codes[]`** |
| `mvp_summary` | `status`, `simple_message`, **`message_code`**, `next_step`, **`next_step_code`**, `priority`, `language`, `preferred_dialect`, `literacy_level`, `entrepreneur_type`, `location_type` |

Enumerated values: `financial_status` ∈ profitable / break_even / loss · `risk_level` ∈ low / moderate / high · `feasibility_status` ∈ feasible / break_even / not_feasible · `mvp_summary.status` ∈ good / attention_needed / review · `match_level` ∈ district / state · market `metric` ∈ wholesale_price_per_kg / registered_units · market `scope` ∈ district / state · scheme `level` ∈ central / state / regional / district / sub_district / block / local_body.

**Those enums stay English inside the API on purpose** — they are load-bearing keys, not display text. They become plain language only at render, through label maps the frontend carries. An enum value a map does not recognise still prints, title-cased, rather than vanishing.

**Contract discipline, and the exact hole in it.** Two test files subscript every one of those keys, so removing or renaming a key fails the suite immediately — that is intentional, and it is the fastest way to check whether a contract change is safe. **The corollary is that *adding* a key passes silently**, and this table proves the cost: six of its seven rows were stale for a day, missing every translation code plus `level` and `scheme_id`, and nothing in the suite could say so. Two consequences worth carrying:

- **A response field the docs do not mention is invisible to reviewers, and a field a Pydantic `response_model` does not declare is invisible to the *client*.** A `response_model` silently filters the returned dict to its own declared fields — the 8 September audit found three fields being computed and then dropped on the way out for exactly that reason.
- **After any change to a service, a schema or `schemes.json`, re-measure this table rather than editing it from memory.**

---

# 8. Data (there is no data model)

No entities, no tables, no `id` fields, no `created_at`. The planned `Entrepreneur` / `BusinessProfile` / `MarketData` / `Scheme` / `FinancialProjection` / `AdvisoryReport` entities were never created. What actually holds data:

## `backend/app/data/schemes.json` — 30 records across 7 tiers
Fields: `id`, `name`, `level`, `description`, `target_segment`, `business_categories[]`, `states[]`, `location_types[]`, `eligibility_rules[]`, `support_type`, `documents[]`, `last_verified`, plus a translation code for every sentence. **There is no `official_url` and there must not be one** — see §6. Every entry is still transcribed from an official government source with a verification date; the source URL lives in `gen_schemes.py` as an internal citation, never in the data or on the page. **Never edit eligibility text without an official source** — this is the one dataset a judge can fact-check against the internet in real time.

**One structural rule matters more than it looks:** `eligibility_rules` / `eligibility_codes` and `documents` / `document_codes` are **index-aligned arrays**. Insert an English rule without inserting its code at the same position and every later rule silently gets the wrong translation — which reads perfectly fluently and is completely wrong. A test enforces the alignment; do not weaken it.

## `backend/app/data/market_data.json` — 20 records
Written by `tools/fetch-market-data.mjs` on 24 September 2026, never by hand. All 20 rows are in Uttar Pradesh and all are `scope: "district"`: Lucknow ×10 and Varanasi ×10. **6 `wholesale_price_per_kg` rows** for agriculture, three crops per district, from Agmarknet's "Variety-wise Daily Market Prices Data of Commodity" (Ministry of Agriculture and Farmers Welfare): the median mandi price per kg over the last 30 reporting days, with a P10–P90 range. **14 `registered_units` rows**, one per category button except Agriculture and Other in each district, counted from the Ministry of MSME's "List of MSME Registered Units under UDYAM" by NIC 2008 code, with the share of the district's total; a count under 10 is suppressed. Only counts leave the fetch — no name, address, PIN or registration date is stored. Each row carries a 20-key `provenance` object, and `market_data.provenance.json` records the run.
Both datasets are used under GODL-India. The page prints each dataset's attribution once, in English, outside any collapsed section and never as a link, followed by a not-endorsed line and a no-warranty line. `DATA_SOURCES.md` is the full record, including what is still unresolved. To add a district, extend `tools/market-crosswalk.json` and re-run the fetch.

## Client state — `frontend/src/context/AppContext.jsx`
Four form sections plus the API result, **mirrored into `sessionStorage['sih-application']` on every change**:

```text
profile   { name, language, dialect, literacyLevel }
business  { category, businessName, initialInvestment, monthlyRevenue,
            monthlyOperatingExpenses, employees, existingDebt }
location  { village, district, state, locationType, marketType[], customers }
finance   { availableCapital, monthlyExpenses, monthlyEmi }
result    the full 7-section API response
```

State and district live **only** on `location` — they used to be duplicated on `profile` and asked for twice. `location.marketType` is an **array** (multi-select), not a string.

Three things about the persistence are load-bearing:

- **The stored payload carries a version, and a mismatched version is discarded rather than half-restored.** Bump it whenever the shape changes.
- **Restoring merges section by section over the blank shape**, never trusting the stored object wholesale — a field added after a payload was written would otherwise arrive `undefined`, and React silently turns a controlled input with an `undefined` value into an uncontrolled one. The field stops updating and nothing in the console says why.
- **Editing an answer clears the previous result.** Change a figure on `/business` after running the analysis and the result pages return to their empty state rather than showing figures computed from the old answers — a stale result that *looks* current is worse than no result.

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

scheme match_score        = 60 (kind of work matches)
                            + 40 (scheme names your state)   → 100
                            + 30 (scheme is open nationwide)  → 90
                            no category match → 0, scheme dropped entirely
                            wrong state or wrong settlement type → dropped BEFORE scoring
                            shown as fit_basis ("state" / "region" / "national"), never as a %
```

**Four fields come back `null`, and that is a feature, not a gap** — it means *"we could not compute this"*, which is a different statement from zero. `profit_margin_percent` and `operating_margin_percent` when revenue is 0 (a margin needs revenue to be a share *of*, and printing `0%` there would read as break-even when it is actually a loss), `estimated_roi_percent` when investment is 0, and `pressure_ratio_percent` when there is no positive surplus. **The UI prints "Not available" for all four.** This matters on stage because `Number(null)` is `0` in JavaScript, so a careless formatter turns "could not compute" into a confident, reassuring `0%` — that has been a live bug twice.

## Two different expense questions — do not mix them up

This trips people up, including on stage:

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

The planned `develop` + `frontend/<name>` scheme was not adopted. Neither, any more, is the flat per-person scheme that replaced it. **As of 9 September 2026 the remote has exactly two branches:**

```text
main            before-main
```

**`before-main` is where the current build lives** — everything in this document is on it, including the government-style chrome, the 8-language layer, the charts, the cascading location data, `sessionStorage` and the accessibility switches. It is what to check out.

This section used to list eleven branches — `backend`, `frontend`, `aryan`, `aryan-frontend`, `aryan-ui-redesign`, `aryan-gov-ui`, `netra`, `saad`, `tripti`, `Manjeet` — and named `aryan-gov-ui` as the live one. Those are gone; the work merged. `git ls-remote --heads origin` is the authority here, not a list in a document.

**On the remote, `before-main` is simply ahead of `main`**: `git rev-list --left-right --count origin/main...origin/before-main` reports `0 / 172`, so merging is a fast-forward. Compare the `origin/` refs and not the local branch names — a leftover local `main` from early backend work can sit unpushed commits ahead of `origin/main` and make the same command report a divergence that exists on one laptop only.

Rules, still in force:
1. **Never push directly to `main`.**
2. Small commits with messages that say what changed.
3. Pull/rebase before a merge.
4. Keep `.env` and API keys out of Git; maintain `.env.example` if a key is ever introduced.
5. **A push lands in five other people's working copies — confirm before you push near the presentation.**

Gitignored: `.venv`, `node_modules/`, `dist/`, `__pycache__/`, `.env`, `.claude`, `screenshots`.

`screenshots/{light,dark,light-expanded}/` holds 27 full-page PNGs (9 routes × 3 passes, 2880px). **They predate both the 7 September fixes and the redesign** — old *Sahyog* branding, no market section, ₹0 on `/analysis`, no translation layer, no charts. **Do not circulate them.** Current captures live in `screenshots/verify/out/` and `screenshots/verify/mobile/`, written by the drivers in §13. All of `screenshots/` is gitignored, so hand any of it over as a zip rather than a repo link.

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
| Day 8 — testing + demo scenarios | **Partial.** 323 backend tests; no frontend *unit* tests, but 17 browser drivers that assert on rendered output; one polished scenario rather than three |
| Day 9 — polish + presentation | **In progress.** 7 Sept: a full defect sweep — 10 numbered defects plus 7 more, all fixed. 8 Sept: the government-style redesign, the translation layer, and a second audit closing 46 findings |
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
- [x] Scheme matching works — **8 of the 9 category buttons match** (11–16 schemes each, across 5–6 tiers); only a typed-in *Other* correctly matches none
- [x] Hyperlocal market context works, with honest district/state provenance — 20 sourced rows for Lucknow and Varanasi
- [ ] ~~AI advisory works~~ → **deterministic advisory works. There is no AI advisory.** Reworded rather than ticked
- [x] Explainability works
- [x] Action plan works
- [x] Printable report works
- [x] Error and empty states exist on every result page
- [x] At least 2–3 business categories work — 8 do
- [x] One polished demo persona works (§3)
- [x] Sources recorded with verification dates
- [x] 323 backend tests pass; lint and production build are clean; translation-key parity clean across 648 keys × 8 languages
- [x] No API keys to protect (there are none)
- [x] **State survives a page refresh** — closed 8 Sept via `sessionStorage` (§8)
- [x] **Output is in the reader's own language**, including the generated advice (§2.6)
- [x] **Phone widths verified** — all 10 routes measured clean at 360 / 390 / 412 px
- [x] **Print output verified** — the `/report` PDF, from a light laptop and from a dark one
- [ ] Three demo scenarios — we have one
- [ ] Presentation complete
- [ ] Demo rehearsed at least 3 times

## How the frontend is verified — there are no unit tests, and that is not the same as unverified

`npm run lint`, `npm run build` and `pytest` cannot see a leaked translation key, a `null%`, a page that scrolls sideways under a thumb, a `₹30,000` that wrapped as `₹30,00 / 0`, or a logo that prints invisible. **Seventeen zero-dependency drivers** in `tools/verify/` drive Edge over the DevTools protocol and assert on what actually rendered. Each owns a *different* failure class — that is the point, and it is why there are seventeen rather than one big one:

| Driver | The one question it asks |
|---|---|
| `drive.mjs` | Did the right text render, and does every scheme card show its fit label and never its score as a percentage? 36 page loads across 7 passes; exits 1 on a finding |
| `mobile-audit.mjs` | Can a thumb use it? 10 routes × 3 phone widths, overflow / tap size / clipping |
| `print-audit.mjs` | Does the PDF read correctly whichever theme the laptop was in? |
| `lang-layout.mjs` | Does switching language change the *layout*, not just the words? 8 languages × 6 routes × 2 widths |
| `field-align.mjs` | Do two form controls sharing a row start on the same line? |
| `hero-art.mjs` | Is the landing backdrop visible *and* the text on it still legible? |
| `hero-geom.mjs` | Where does the backdrop's edge sit relative to the content on it? |
| `brand-mark.mjs` | Is the logo still a recognisable flower in both themes? |
| `manual-audit.mjs` | Do the wordmark, the manual strip and the dialog work in 3 modes? |
| `error-banner.mjs` | Does the `/finance` error read as a sentence in all 8 languages? |
| `glyph-audit.mjs` | Is any decorative emoji going to be read aloud by a screen reader? |
| `market-ui.mjs` | Does every market-row branch render, with each dataset's attribution printed exactly once, outside any collapsed section and never as a link? Starts its own Vite on 5179 |
| `hero-vibrance.mjs` | Not a gate — which backdrop filter is *more colourful* without costing legibility? |

Plus `parity4.mjs` (no browser needed) for translation-key parity, and `refresh-cases.mjs` to regenerate the captured API responses the drivers seed — **run that one after any backend change**, because stale fixtures make the drivers pass while telling you nothing.

The scripts are tracked in `tools/`; `screenshots/` stays gitignored and holds only the PNGs and JSON they write. **They are not a substitute for clicking through once on the presentation laptop, in the presentation browser.**

## Still not verified
- **Phone landscape orientation, real touch scrolling on physical hardware, and the on-screen keyboard covering a focused input.** Emulation cannot answer these; borrow a phone.
- **The `api.js` 20-second timeout path** — stop the backend mid-request and confirm the message reads as a sentence.
- **Non-English wording quality.** Parity, placeholders and "no string left identical to English" are all script-verified across 648 keys × 8 languages. **Naturalness is not** — no native speaker has reviewed it, and two real errors have already been found by eye, which is evidence there are more. Say this if asked; do not claim professional translation.

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
│   │   └── data/             schemes.json (30), market_data.json (20), market_data.provenance.json
│   ├── tests/                26 files + market_fixtures.py, 323 tests
│   ├── gen_schemes.py        provenance for schemes.json, not runtime
│   └── requirements.txt
│
├── frontend/
│   ├── public/               favicon.svg, hero-backdrop.jpeg
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/            9 pages
│   │   ├── components/       Button, BrandMark, BrandWordmark,
│   │   │                     InstructionManual, Charts, chartData
│   │   ├── i18n/             8 languages, 4 dictionary files, brand.js
│   │   ├── data/             indiaLocations.js (36 states × 768 districts)
│   │   ├── context/          AppContext.jsx
│   │   ├── services/         api.js
│   │   └── index.css
│   ├── index.html
│   └── package.json
│
├── docs/                     frontend_integration.md, requirements.txt
├── presentation/             empty — Saad + Tripti
├── tools/                     tracked — 28 scripts, nearly all verifiers, 20 of them in verify/
├── screenshots/              gitignored, 8.1 GB — their output only: PNGs, report.json,
│                             Edge profiles, plus 27 stale PNGs (do not circulate)
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

> "The advisory logic is a deterministic rules engine. That is a design decision, not a shortfall: for financial guidance to a first-time borrower, a wrong number that sounds confident is worse than no number. Every figure we show is traceable to a formula you can read, and it is unit-tested — 323 tests. The output already reaches the entrepreneur in eight languages, including the generated advice, and that is done by translation rather than by generation, so it cannot drift. The AI-driven part of the problem statement is where this goes next: natural-language input, dialect-level paraphrasing, and a conversational 'why?' layer on top of the same engine — with the arithmetic staying in code."

This is a strong position, honestly held. Do not weaken it by overclaiming.

**One clarification the team keeps needing:** *"no LLM"* does not mean *"English only"*. Those were the same limitation until 7 September and are now separate — the multilingual output is built and is deterministic (a translation code per sentence, resolved against dictionaries we wrote), which is precisely *why* it is trustworthy enough to demo. Do not answer "is it multilingual?" with "no, there is no AI".

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

> **History (round-era).** This section was written for the SIH 2026 internal round, held on 14 September 2026, which we were not selected from. It is kept because it records the thinking behind the build. It is not a current plan.

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
2.  /           — open the instruction manual for 15 seconds. "This is how a
                  first-time user learns the journey" — then close it
3.  /profile    — name, language, dialect, literacy level
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
                  text change too, which is the part judges do not expect
10. /analysis   — open "Show detailed calculations" — every figure is traceable
11. /schemes    — 14 matches grouped by the office that runs them, Delhi down to
                  the reader's own Gram Panchayat. Read one office note aloud
12. /advisory   — the recommendations
13. /report     — print preview → this is what the entrepreneur takes to the bank
14. Impact + what comes next (§22)
```

**Refreshing is now safe** — the journey survives it (§8). What is still not safe is opening a result page in a *fresh* tab, so keep the walkthrough in one tab.

Optional 10-second additions if the panel looks interested: dark mode and the largest text scale, both from the utility bar; or a dialect on the landing page, where the greeting and the button text change.

Have a fallback: a saved PDF of `/report` and a current set of screenshots, in case a laptop or port misbehaves. **Recapture them first — the ones in `screenshots/` at the top level are stale (§11).**

---

# 17. Judge Questions to Prepare For

> **History (round-era).** This section was written for the SIH 2026 internal round, held on 14 September 2026, which we were not selected from. It is kept because it records the thinking behind the build. It is not a current plan.

## "Why AI? Where is the AI?"
Answer honestly, and lead with the design decision — see §15. Then: the *AI-driven* framing of the problem statement is the roadmap — natural-language input, dialect-level paraphrasing, conversational explanation — layered on an engine whose arithmetic stays deterministic. Do not claim a model is running. **And do not let this question also answer "is it multilingual?"** — the eight-language output is built and is deliberately *not* model-generated.

## "Is it actually in Hindi, or just the buttons?"
**All of it** — the labels, the generated advice, the risk explanation and the scheme text, in 8 languages, with Hindi as the default rather than English. Show it rather than saying it: switch language while standing on `/analysis`. The mechanism is a translation code emitted beside every sentence the engine composes, resolved against dictionaries we wrote — so it cannot drift the way a paraphrasing model would.

Then volunteer the limits, because they are the credible part: 30 dialects are listed and **9 carry curated phrase overrides**, which is dialect-aware phrasing rather than dialect translation; digits and money stay in Latin script on purpose, matching Indian currency and government forms; and **no native speaker has reviewed the wording** — parity and placeholders are script-verified across 648 keys, naturalness is not.

## "How do you prevent hallucinations?"
There is nothing to hallucinate. Every number comes from a unit-tested formula; every scheme fact comes from a structured dataset transcribed from an official source with a verification date. The source is kept on record internally; the app deliberately does not link out to government portals (the links were removed on 10 September 2026). When we do add a model, it will be allowed to rephrase and explain, never to calculate or to decide eligibility (§15).

## "How is this different from ChatGPT?"
ChatGPT does not know how many tailoring businesses are registered in Lucknow or what its mandis have been paying for wheat, cannot tell you whether *your* EMI fits *your* surplus, and will not tell you when it has no data for your district. अर्थNiti combines structured entrepreneur input, a district-level dataset, deterministic financial calculation, rule-based scheme matching with visible reasons, and a printable next-step plan — and it says out loud when a number is a state-level fallback rather than local.

## "Show me the hyperlocal part."
`/analysis` → "Your local market". Then point at the provenance line. `district` means it is their own district; `state` would mean a state-level figure, and none exist yet, so any other district gets an honest empty state rather than Lucknow's numbers. **This is the differentiator judges remember**, because most prototypes silently present national averages as local.

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
**Somebody has to be ready for this one, because the on-screen notice was removed on 8 September 2026.** Answer it directly and without defensiveness: it is a student prototype and not a Government of India service. Then give the reason for the resemblance, which is the good part — a rural user has met this visual language on a real government service and already knows how to read a masthead, a nav band and a bordered card, so borrowing the *structure* lowers the learning cost. What is still on screen is data honesty rather than authority: the footer tells the reader to verify eligibility at a government office, and the market section names its sources and says their publishers do not endorse the app.

## "Why does the login page not log anyone in?"
Because it does not pretend to — it collects a name and carries it into step 1, and the journey works if you skip it. There is no password, no account and no server call. Real authentication is future work (§22); shipping a fake one would have been the dishonest option.

## "What is not finished?"
Answer it straight: no chat, no EMI scenarios or break-even units, no suggested loan amount, market data for two districts only, no server-side persistence (the journey lives in the browser tab), 9 of the 30 dialects carry phrase overrides, the translations have not been reviewed by a native speaker, and a typed-in *Other* trade legitimately matches no schemes. Knowing your own gaps reads as competence.

**Do not list "English-only output" or "a refresh wipes the journey" here** — both were true until 7–8 September and are the two things a teammate is most likely to say out of habit. They are built.

---

# 18. Product Success Metrics

For the prototype: time to generate an advisory plan (currently one request, sub-second) · journey completion · correctness of financial calculations (323 tests) · correctness of scheme matching (8 of the 9 category buttons match, 11–16 schemes each; only a typed-in *Other* is correctly empty) · translation coverage (648 keys × 8 languages at full parity, script-verified) · explanation quality · number of actionable recommendations · demo reliability.

For future production: entrepreneurs assisted · plans generated · financial-literacy improvement · successful formal-finance connections · business survival and growth · **reduction in inappropriate borrowing** — the metric that matters most and the reason the risk indicator exists.

---

# 19. Risk Register (current)

## Demo risks — the ones that could bite at the round (history)

| Risk | Mitigation |
|---|---|
| ~~A page refresh wipes the journey~~ | **Closed 8 Sept** — `sessionStorage` (§8) |
| Opening a result page in a **fresh tab** still shows an empty state | Keep the whole walkthrough in one tab |
| Picking a typed-in **Other** trade on stage shows zero schemes | Use Tailoring, Handicrafts or Food Processing (§3). Agriculture is safe now too |
| Picking any district other than Lucknow or Varanasi shows no market data | Use Lucknow (or Varanasi) |
| Port conflict — a stray uvicorn or Vite process | `netstat` + `taskkill` before starting (§6) |
| `localhost` vs `127.0.0.1` mismatch (uvicorn binds IPv4; `vite preview` may bind `[::1]`) | Try both; pass `--host 127.0.0.1` |
| A judge asks whether this is an official portal — **the on-screen notice is gone** | Answer verbally, and know the answer in advance (§17) |
| Screenshots at the top of `screenshots/` are stale — old *Sahyog* branding | Recapture before circulating (§11) |

## Project risks

| Risk | Mitigation |
|---|---|
| **Someone claims an LLM is running** | §15. Whole team reads it |
| **UNDERclaiming the language support** — saying "English only" or "we collect the preference but don't translate" out of habit | §2.6. It has been built since 7 Sept. This risk replaced its own opposite, which is why it is easy to get wrong |
| Describing the dialect layer as translation | Say "dialect-aware phrasing". 9 of 30 varieties, a handful of phrases each (§2.6) |
| Claiming the translations are professionally reviewed | They are not. Parity is script-verified; wording is not (§13) |
| Presenting `/login` as authentication | It is a name-capture screen. §4 Feature 1b |
| Presenting prototype risk thresholds as financial rules | Label them as prototype assumptions every time (§4 Feature 8) |
| Presenting two districts of market data as India-wide coverage | Say "two districts, sourced"; every other district shows the empty state |
| Late push breaking a teammate's copy | Confirm before pushing near the presentation (§11) |
| Feature creep in the last three days | Feature freeze. §25 is a fix list, not a feature list |
| A contract change silently breaking the UI | Contract tests subscript every key — run `pytest` after any service edit. **Note they only catch a *removed* key, never an added one** (§7) |

---

# 20. Daily Team Ritual

> **History (round-era).** This section was written for the SIH 2026 internal round, held on 14 September 2026, which we were not selected from. It is kept because it records the thinking behind the build. It is not a current plan.

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

**Three items have moved off this list since it was written** — persistence, regional-language output and charts are all built (§8, §2.6, Feature 12). They are recorded as `DONE` below rather than deleted, because they still appear in older slide drafts and stand-up notes.

In rough order of value per unit of effort:

1. ~~**Persistence**~~ — **DONE** for the demo (`sessionStorage`). A real database is still future work, and only worth it once a user should be remembered across days or devices
2. ~~**Regional-language output**~~ — **DONE**, 8 languages including the generated prose. What remains: a native-speaker review, more dialect phrase coverage (9 of 30 today), and more languages
3. **Read-aloud output** (`speechSynthesis`) — high impact for low-literacy users, small implementation, and it composes with the translation layer already in place. **Strongest remaining item for this audience**
4. **The LLM layer under the §15 boundary** — natural-language input, a "why?" explainer, a conversational assistant
5. **Loan and EMI structuring** — suggested financing range, EMI scenarios, cash-flow coverage
6. **Break-even and runway** — needs selling price and variable cost per unit added to the business form
7. **More data** — more districts and states in the market dataset (it is two districts today), more schemes per tier, real authentication behind `/login`
8. ~~Charts~~ — **DONE** (hand-rolled, Feature 12). GIS / location intelligence is still open; government open data is in for two districts (data.gov.in)
9. Document OCR, server-side PDF generation, a WhatsApp-style interface
10. Offline / low-connectivity mode, financial-literacy modules, longitudinal tracking, human-advisor escalation

---

# 23. Product Vision — and what is live today

`[LIVE]` runs in the repository today. `[PLANNED]` does not.

```text
                 RURAL ENTREPRENEUR
                         ↓
        Text input, 8-language UI         [LIVE — Hindi by default]
        Dialect-aware phrasing            [LIVE — 9 of 30 varieties]
        Voice in / read-aloud out         [PLANNED]
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
                    Risk Check            [LIVE]
                         ↓
                  Action Plan             [LIVE — printable report, with charts]
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
6. ~~**No new features before the 11th.** Fixes and rehearsal only.~~ The round is over, so this rule no longer applies.
7. If a feature cannot be demonstrated clearly in under 60 seconds, question whether it belongs.
8. **Never make the demo look more capable than the build.** An honest gap is defensible; a discovered overclaim is not.

---

# 25. Remaining Work Before the Round (history)

> **History (round-era).** This section was written for the SIH 2026 internal round, held on 14 September 2026, which we were not selected from. It is kept because it records the thinking behind the build. It is not a current plan.

Ordered by demo impact. **Fixes and rehearsal only — no new features.** Three days left.

### Done since this list was written
- [x] **`sessionStorage` persistence** — the single largest demo risk, closed (§8)
- [x] **8-language output including the generated prose** (§2.6)
- [x] **Charts** — hand-rolled, print-safe (Feature 12)
- [x] **A mobile-width pass** — 10 routes × 3 phone widths, measured clean
- [x] **The print PDF path** — verified, from a light laptop and from a dark one
- [x] **The government-style redesign**, the brand mark and the instruction manual
- [x] **Two full audits** — 17 defects on 7 Sept, 46 findings on 8 Sept

### Should happen
- [ ] **Three full rehearsals** on the presentation laptop, in the presentation browser, following the §16 sequence — including the language switch at step 9
- [ ] **Whole team reads §15 and §2.6.** The first so nobody claims an LLM is running; the second so nobody claims the output is English only. **Both errors are equally costly and the second is now the likelier one**
- [ ] **Agree who answers the "could this be mistaken for an official portal?" question, and how** (§17). The on-screen notice is gone, so this answer has to exist in someone's head
- [ ] **Walk every path you plan to show**, plus the one nobody has: the `api.js` timeout (stop the backend mid-request). There are no outbound links left to click — the scheme cards deliberately do not link to government portals (§6)
- [ ] **Recapture the screenshots** — the top-level set still shows *Sahyog* branding (§11)

### Nice to have
- [ ] A second and third demo scenario — a moderate-risk and a high-repayment-pressure persona, to show the risk engine actually moving
- [x] ~~Two or three more market rows so Retail, Services and Manufacturing are not empty in the market section~~ — done 24 September 2026 for Lucknow and Varanasi, through the fetch rather than by hand
- [ ] A native speaker's eye over one language's wording, even just the landing page and `/analysis` (§13)
- [ ] Phone landscape and a real device — emulation cannot answer either (§13)
- [ ] Refresh `docs/frontend_integration.md` (stale on CORS and on the number of response sections) or delete it

### Explicitly not doing before the 11th
LLM integration · a database · real authentication · read-aloud output · EMI scenarios · break-even units · frontend unit tests · more languages.

---

# 26. AI Continuity Instructions

Any AI assistant reading this file should:

- Treat **[CLAUDE.md](CLAUDE.md)** as the authoritative engineering context and this file as the product/team context. CLAUDE.md is more likely to be current on code detail.
- **Never describe अर्थNiti as using an LLM.** It does not (§15). If asked to "improve the AI", ask whether that means wiring up a model or improving the rules.
- **Equally: never describe the output as English only.** It is translated into 8 languages, including every sentence the engine composes (§2.6). "No LLM" and "English only" were the same limitation until 7 September 2026 and are now separate facts.
- Remember there is **no database and no server-side persistence**. The journey lives in the browser tab (`sessionStorage`). Do not suggest a migration, an ORM model, or a query — and do not move financial answers into `localStorage`, which would leave them on a shared laptop after the user walks away.
- **Any user-visible sentence needs a translation key, and a sentence must never be assembled from parts in JSX.** Concatenating a translated label with a value and a Latin full stop puts English word order into a Devanagari sentence. Give the whole phrase its own key with a placeholder.
- Keep financial calculations deterministic and unit-tested. Never move arithmetic into a model.
- **Never widen scheme eligibility** to make output look more complete (§9, §21).
- Guard on the raw value before printing a number. The backend sends `null` for anything it could not compute, and `Number(null)` is `0` — a naive guard turns "could not compute" into a confident, favourable `0%`. This has been a live bug twice.
- The hackathon is over, so the old rule — "prefer the demo path over refactors and infrastructure" — is retired. Work in this order: correct advice first, then honest claims, then a build a fresh clone can reproduce and verify, then polish. CLAUDE.md carries the full status line.
- **Ask for explicit confirmation before any action that changes the GitHub repository** — push, PR, branch or tag creation or deletion, releases, settings. Local commits when requested are fine. Approval for one push does not carry to the next. Six people share this repo.
- Run `pytest` after any service or schema edit; run `npm run lint` and `npm run build` after any frontend edit; run `node tools/parity4.mjs` after touching any dictionary; run `node tools/verify/refresh-cases.mjs` after any backend change, or the browser drivers will keep passing against last week's response.
- Clean up any server you start (§6).
- When suggesting code, name the exact file path. When changing architecture, explain why and update this file in the same commit.

---

# 27. Status Snapshot — 9 September 2026 (before the round)

> Kept as a dated snapshot. The build figures in it are still accurate (figures updated 24 September 2026). The phase and countdown lines are history, and the outbound scheme URLs it mentions were removed on 10 September.

**Phase (then):** working prototype, feature-frozen except polish
**Time to presentation (then):** the round was then scheduled for 11 September 2026; it was later moved to the 14th
**Branch:** `before-main`

| | |
|---|---|
| **MVP status** | **Working end to end.** 10 routes plus a catch-all, one API call, 7 populated result sections |
| **Backend** | 8 routers · 323 tests passing in about 2s |
| **Frontend** | Lint clean · production build clean · translation parity clean (648 keys × 8 languages) |
| **Data** | 30 schemes across 7 tiers (official sources, 29 of 30 URLs verified 7 Sept) · 20 sourced market rows (Lucknow + Varanasi, GODL-India) |
| **AI integration** | **None, by decision.** Deterministic rules engine (§15) |
| **Database** | **None.** The journey persists in the browser tab (`sessionStorage`) and nowhere else |
| **Language output** | **8 languages, Hindi by default, including the generated advice** (§2.6) |
| **Interface** | Government-style chrome, 2 accessibility switches (dark theme, 3-step text scale), hand-rolled charts, an instruction manual, a light motion layer that honours `prefers-reduced-motion` |
| **Verification** | 323 backend tests · 28 zero-dependency scripts in `tools/`, 18 of them driving a browser over CDP · phone widths, print output, motion and scroll-on-navigation all measured clean |
| **Known defects** | 17 found and fixed 7 Sept (10 numbered + 7 more); **46 findings closed in the 8 Sept audit**. See CLAUDE.md |
| **Still open** | Translations unreviewed by a native speaker · dialect phrases on 9 of 30 varieties · 1 scheme URL unverified from our network · phone landscape and physical touch untested |
| **Presentation** | In progress — Saad + Tripti. `presentation/` is still empty |

**Next milestone:** rehearse three times on the presentation laptop, and make sure the whole team has read both §15 and §2.6 (§25).

**The team:** Saad — presentation · Tripti — presentation/research · Netra — frontend · Anmol — frontend · Aryan — backend · Manjeet — backend.

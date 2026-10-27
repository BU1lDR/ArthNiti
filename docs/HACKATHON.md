# Meta Global AI Developer Hackathon: what was built when, what Meta's models do, and how the cost is held down

Event: [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon), run by Meta and Cerebral Valley ([event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)). Virtual. **Track: Indie. Entrant: Aryan Verma, alone.** Theme: *Build for Your World*.

The product, **अर्थNiti** (repository `ArthNiti`), tells a rural micro-entrepreneur whether a business plan is affordable, which government schemes may apply, and what to do next. The Meta models do two optional jobs in it: they turn what a person says or types into form answers (the person checks every answer before it is used), and they write the wording of a short plan around blanks that the rules fill with their own figures. They compute nothing. Section 3 says exactly where that line is.

Sources for the event facts below: the two public event pages and the kickoff session of 26 Oct 2026. The Official Rules are behind a login and are not quoted here; section 9 is the submission checklist.

## 1. Dates

| What | ET | UTC | IST |
|---|---|---|---|
| Hackathon starts (kickoff) | Mon 26 Oct 2026, 12:00 PM EDT | 16:00 | Mon 26 Oct, 21:30 |
| Submission due | Wed 4 Nov 2026, 9:00 PM EST | Thu 5 Nov, 02:00 | **Thu 5 Nov, 07:30** |
| Judging | 5 to 8 Nov | | |
| Closing ceremony: top five per track judged live from the 3-minute video | Mon 9 Nov | | |
| Community-vote winner announced | Mon 16 Nov | | |
| Working deadline: everything submitted | | | **Tue 3 Nov, evening** |

US daylight time ends on Sun 1 Nov, so the due time is UTC−5, not UTC−4. The working deadline leaves more than a day for a failed upload, a lost key or a broken video.

## 2. Prior work and new work

The kickoff rules: build new work during the event, call out prior work, and let a reviewer tell the two apart. This is the call-out. **The line is Mon 26 Oct 2026, 12:00 PM ET (16:00 UTC).**

| Layer | When | What | Hackathon work? |
|---|---|---|---|
| 1. The product | 30 Aug 2026 to 8:03 AM ET on 26 Oct | Everything described under this table. 867 tests in 38 test files at 8:03 AM ET on 26 Oct | **No** |
| 2. The morning of the start | 26 Oct, 8:12 to 11:58 AM ET | (a) The identity edits: solo project, new name, hackathon framing in the docs. (b) **The backend of the Meta helper**: the Meta client, the intake service and routes, their settings, the smoke script and about 540 tests. 1,411 tests in 45 files at 12:00 PM ET | **No.** It was written in the two hours before the start, so it is prior work |
| 3. The hackathon | 26 Oct 12:00 PM ET onward | Section 2.2 | **Yes** |

**Layer 1** is the advice engine and everything around it: financial, risk and business analysis, the 30-scheme dataset in 7 tiers, 20 sourced market rows for Lucknow and Varanasi, the advisory text, the eight routers, the eight-language interface, the form and result pages and charts, the consent and notice work for India's DPDP Act, the processing log, `docs/PROCESSOR_SCHEDULE.md`, production mode, and the browser verifier suite. The first commit is from 30 Aug 2026. It began as a six-person team entry for a college round of the Smart India Hackathon (the team was not selected); `git shortlog -sn --all` shows the contributors. The last commit made before the event is from 25 Sept (`4a2307e`). The September data-protection work (consent, notice, processing log, `docs/PROCESSOR_SCHEDULE.md`), the verifier changes and the owner's brand-asset files were still uncommitted in the working tree on 26 Oct. Most of those files were last edited by 1 Oct and a handful of verifier and stylesheet files on the morning of 26 Oct, before 8:03 AM ET. They are committed now, as the first commits of the chain in 2.3.

### 2.1 Layer 2, in detail

Written 10:22 to 11:58 AM ET: `backend/app/core/meta_client.py`, `backend/app/services/intake_service.py`, `backend/app/api/routes/intake.py`, `backend/app/schemas/intake.py`, `backend/app/core/settings.py` (the `ARTHNITI_AI_*` and `MODEL_API_KEY` settings), the wiring in `backend/app/main.py`, `backend/app/smoke_meta.py`, and their tests. At that point nothing had been run against Meta's live API.

### 2.2 Layer 3, in detail: what was added after 12:00 PM ET

| Area | What was added | Where |
|---|---|---|
| Cost control | A spend ledger that refuses a call before it is sent once the running total would pass a cap; pessimistic pricing; fail-closed on any file error; settings for the cap and the file (section 5) | `backend/app/core/spend.py`, `meta_client.py`, `settings.py`, `main.py`, `smoke_meta.py`, `tests/test_spend_cap.py` |
| Test safety | A guard in `conftest.py` so no test can reach `api.meta.ai` or write the real ledger | `backend/tests/conftest.py`, `tests/test_network_guard.py` |
| Efficient use of the API | `prompt_cache_key`, speech `keywords`, token-usage reporting (section 4) | `meta_client.py`, `intake_service.py`, `routes/intake.py`, `smoke_meta.py` |
| The voice-and-text page | `/talk`: consent, record or type, edit the transcript, find the answers, review each answer beside the words it came from, use the answers | `frontend/src/pages/TalkPage.jsx` |
| The recorder | Microphone to a 16 kHz mono WAV in the browser; the microphone is released on every exit path | `frontend/src/audio/record.js`, `wav.js` |
| Answer mapping | Turns the service's answers into form fields, with labels and evidence; refuses what the form cannot hold | `frontend/src/data/talkAnswers.js` |
| App state | Versions 5 and 6 of the stored state. Version 5: `aiFilled` records which fields the helper filled and drops a field once the person edits it, and a banner shows on every form page that received an answer. Version 6: the result keeps the request it was computed from, and a written plan is kept only while that request is still the current one | `frontend/src/context/AppContext.jsx`, `components/HelperFilledBanner.jsx`, the form pages |
| Gating | `VITE_AI_HELPER=true` switches the route, the landing button and the profile card on; off, `/talk` is a 404 and the app is the app it was | `frontend/src/config/deployment.js`, `App.jsx` |
| Languages | 40 `talk.*` keys in all 8 languages (320 strings), including the sentence that tells the person their words go to Meta; later, 20 `plan.*` keys for the plan card and 20 `fo.*` keys for the loan options (another 320). **No native speaker has reviewed the 7 non-English sets** | `frontend/src/i18n/resultStrings.js` |
| Loan options | When there is a funding gap: for 12, 24, 36 and 60 months, the largest loan (in steps of ₹1,000, at most the gap) whose repayment keeps the pressure band low and the household check inside its limit, at an assumed 12% a year. The rules recommend the shortest term that covers the whole gap. A new `financing_options` section of the analysis response, shown on `/advisory`. **Python only, no model** | `backend/app/services/options_service.py`, `analysis_service.py`, `schemas/analysis.py`, `AdvisoryPage.jsx`, `tests/test_options_service.py` |
| The written plan | `POST /api/advisor/plan`. The model is given the rules' verdicts and advice as words, and no figure, name or place. It writes a summary, 3 to 5 steps and 1 to 3 cautions in the person's language, with a `{{name}}` blank wherever a figure belongs. Python refuses a reply that has a digit or a number word, a link, a symbol, a letter of the wrong script, an unknown or missing blank, or the wrong shape (the number-word lists are not complete), asks once more with the reasons, and otherwise puts the rules' own figures into the blanks. `/advisory` prints them in bold, behind a tick of its own | `backend/app/services/plan_service.py`, `routes/advisor.py`, `schemas/plan.py`, `AdvisoryPage.jsx`, `frontend/src/data/planShape.js`, `tests/test_plan_service.py`, `test_advisor_route.py`, `test_advisor_log_privacy.py` |
| Plan smoke test | `python -m app.smoke_meta --plan`: two real plan calls (English, Hindi) under the same cap | `backend/app/smoke_meta.py`, `tests/test_smoke_meta.py` |
| Market data | Mandi prices and Udyam counts for 11 more districts in 11 more states (105 rows), fetched from data.gov.in on 27 Oct 2026 by the unchanged fetch scripts with a longer district list. The table is now 125 rows for 13 districts in 12 states. Lucknow and Varanasi are still the 24 Sept fetch | `backend/app/data/market_data.json`, `market_data.provenance.json`, `tools/market-crosswalk.json` |
| Verification | A fake Meta behind the real app (it serves the plan route too); a browser gate for `/talk` (17 scenarios, 259 checks; **none yet for the plan card**); 45 and 41 Node unit tests for the answer mapping and the stored state; the existing gates re-run | `tools/verify/talk_fake_backend.py`, `talk-ui.mjs`, `talk-lib-test.mjs`, `app-state-test.mjs` |
| Docs | This file, `docs/PROCESSOR_SCHEDULE.md` section 10, the README, `CLAUDE.md`, `docs/frontend_integration.md`, CI steps | |

Backend tests went from 1,411 to 1,558 (+147): `test_meta_client` +53, `test_spend_cap` +32 (new file), `test_intake_settings` +31, `test_smoke_meta` +13, `test_intake_routes` +7, `test_network_guard` +7 (new), `test_intake_service` +2, `test_talk_fake_backend` +2 (new). Of the layer-2 files, layer 3 touched `meta_client.py`, `settings.py`, `main.py`, `routes/intake.py`, `intake_service.py`, `smoke_meta.py`, `conftest.py` and `intake_fixtures.py`, in the ways the table names; `schemas/intake.py` was not touched.

The loan options and the written plan then took the suite from 1,558 to 1,922 tests in 52 files (+364): four new files hold 349 of them (`test_plan_service` 187, `test_advisor_route` 92, `test_advisor_log_privacy` 54, `test_options_service` 16), and the existing files gained a net 15.

### 2.3 How a reviewer can check this

Every commit in the chain is dated 27 or 28 Oct 2026, because the work was done in one working tree and committed afterwards. **Nothing is backdated.** Git history therefore separates the layers by order, not by date. The chain, oldest first:

| Commit title | Layer | Branch that ends here |
|---|---|---|
| feat(dpdp): data-protection work, input caps and verifier changes from September | 1 | |
| chore(brand): the owner's brand-asset files from 13 Sept | 1 | `feature/dpdp-compliance` |
| docs: the project becomes a solo entry for the Meta hackathon, named ArthNiti | 2 | |
| chore: the project as it stood at the hackathon start (`e4708306cab1`) | 2 | |
| feat(meta): spend cap, network guard and API-efficiency settings for the Meta helper | 3 | `feature/security-hardening` |
| feat(talk): speak or type your answers, off unless VITE_AI_HELPER is set | 3 | |
| docs: the hackathon account, the cost controls and what is still unverified | 3 | |
| data: market rows for 11 more districts, 125 rows in all | 3 | |
| feat(advisor): loan options and an AI-written, rule-verified plan | 3 | |
| feat(meta): smoke_meta --plan, two real plan calls under the cap | 3 | |
| docs: the plan route, the live-run facts and the new counts | 3 | |
| chore: remove OUR_MVP.md | 3 | `feature/voice-assistant` |

```
git log --oneline 4a2307e..feature/voice-assistant       # the chain, newest first
git diff e4708306cab1..feature/voice-assistant --stat    # everything the hackathon added or changed
```

`e4708306cab1` is the commit titled *"chore: the project as it stood at the hackathon start"*: a snapshot of the tree at 12:00 PM ET on 26 Oct. The commits up to and including it are layers 1 and 2; the eight after it are layer 3.

That snapshot was reconstructed, not saved. A full copy of the working tree was taken at 8:03 AM ET; every edit made through the editor tools between then and 12:00 PM ET was replayed from the session transcript; a file last written before 12:00 PM ET is taken as it is on disk; the few shell-script edits are accounted for by hand. Replaying the 205 editor calls made after the start on top of the snapshot reproduces 26 of the 28 files they touched byte for byte. The other two (`test_network_guard.py`, `talk-lib-test.mjs`) are new in layer 3 and were changed afterwards by shell commands. The snapshot passes its own backend suite: 1,411 tests, 45 files.

## 3. What the models do, and what they never do

Every number and every sentence of advice still comes from hand-written Python rules (`backend/app/services/`). **There is no model call in the analysis** (`POST /api/analysis/run`). Meta's models do two optional jobs, both off unless the server has `ARTHNITI_AI_ENABLED=true`: the intake, and the wording of a written plan.

| Step | Who does it |
|---|---|
| Speech to text (Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, English) | Meta's speech model |
| Pulling form answers out of what the person said | Meta's language model, constrained to a JSON schema |
| Checking each answer against the person's own words | Python: an answer whose quoted words are not in the transcript is dropped |
| **The person confirming every answer** | The person, on a review screen, the quote beside the answer |
| Profit, repayment pressure, household check, loan options, scheme matching, market context, advice | Python rules |
| Writing a summary, steps and cautions in the person's language, with a `{{name}}` blank wherever a figure belongs | Meta's language model, constrained to a JSON schema |
| Refusing a plan that carries a figure of its own, then putting the rules' figures into the blanks | Python (`plan_service`) |
| **The person asking for the plan** | The person, with a tick on `/advisory` that says what is sent |

What may be claimed from that:

- Say "AI-assisted intake" and "AI-written, rule-verified plan". Never "AI-driven advice", "AI-generated advice", or that a model "analyses finances" or "chooses schemes". It does not.
- **The intake model** sees no scheme, market or advice data. It never produces or changes a number the engine uses without the person seeing it first. It does convert spoken numbers to digits ("pachaas hazaar" to 50000); the code can check that only when the person's words contain the digits, so **the review screen is the control** and cannot be skipped.
- **The plan model** is sent no figure, name or place. It is sent: the kind of business, as one word from our own fixed list; whether the business is in a village, a small town or a city; the rules' verdicts as sentences; the rules' own advice sentences, leaving out any that contains a digit (none names a place or a scheme); and for each of up to three schemes only its kind of help and its level of government, never its name. The figures, the state and district, and the scheme names are put into the blanks by Python afterwards. So the model never sees a scheme, market or advice *figure*, but it does read the rules' advice in words, and the plan has to agree with it.
- What no code can check, and `plan_service.py` says so: that a plan is wise or promises nothing; that an amount is not spelled out in a word the per-language lists lack; that a name is not written in the language's own script; that a Marathi plan is Marathi and not Hindi.
- Why not let a model give the advice or do the arithmetic: a wrong number here is a loan someone cannot repay. Arithmetic stays in code that has tests.

## 4. How the Meta API is used

| Meta product | Used for | Where |
|---|---|---|
| Muse Voice Transcribe 1.0, `POST /v1/asr/transcribe` | The recording to text. 15 `keywords` (lakh, crore, EMI, rupees, the demo places and the business categories) bias it toward the words this form needs | `meta_client.transcribe`, `intake_service.SPEECH_KEYWORDS` |
| Muse Spark 1.3, `POST /v1/chat/completions` with `response_format: json_schema` | Text to form answers, each with the words it came from. `reasoning_effort` is `low` | `meta_client.complete_json` |
| Muse Spark 1.3, the same call with a second schema | The written plan: a summary, steps and cautions with `{{name}}` blanks, in the person's language. `max_completion_tokens` is 8,000 because a plan in an Indian script spends thousands of reasoning tokens; a refused reply is retried once with the reasons, so a plan costs at most two calls, each charged to the ledger first | `plan_service.py`, `routes/advisor.py` |
| Automatic prompt caching | The fixed instructions and schema come first and the person's text last, so the repeated prefix is billed at the cached rate; `prompt_cache_key` is set | message order in `intake_service`, `meta_client` |
| The `usage` block | Read after every chat call and printed by the smoke script (input, cached, output and reasoning tokens) | `MetaClient.last_usage`, `smoke_meta.py` |
| `GET /v1/models` | A free check that a key works (no tokens are used) | README |

Not used, and why: Muse Image and Muse Code (nothing in this product needs them); Muse Glimmer and Spark Open, the open-weight models (the smallest build is about 17 GB and does not fit the 13.7 GB laptop this was built on; renting a partner's hosting needs another account and credits, which the no-spend rule rules out); live partial transcripts over a socket (the form does not need them). Meta has no text-to-speech, so nothing is read aloud.

Facts that shaped the code (from Meta's public docs, read on 26 Oct 2026): reasoning tokens share **one** output cap with the visible answer and are billed as output, so `max_completion_tokens` is 4,000 for the intake and 8,000 for the plan; `reasoning_effort: "none"` returns HTTP 400 on Muse Spark; `stop`, `logprobs`, `n` above 1 and a few more fields are rejected; audio is mono 16-bit PCM WAV, 16 or 24 kHz, up to 10 minutes; Malayalam is not a supported speech language.

**What the live API has shown** (the owner ran `python -m app.smoke_meta`, then `--plan`, on 27 Oct 2026): the key is valid; `json_schema` output, `reasoning_effort: "low"`, `prompt_cache_key` and the plan's 8,000-token cap were accepted. Both plans (English, Hindi) passed every check on the first try: 10.6 s and 11.9 s, 1,001 input tokens each (0 and 113 of them cached), 2,357 and 2,514 output tokens, of which 2,179 and 2,348 were reasoning. At the listed prices that is about 1.1 and 1.2 cents a plan. The ledger booked $0.0797 for the pair because it prices the worst case, about 3.5 times the cost, on purpose. The ten seconds a plan takes is why it is written on request and is not part of the analysis. **Not observed:** what the speech `keywords` do to real speech (the speech check sent one second of silence), any real person's speech, and the Billing balance.

## 5. Keeping the spend inside the free credits

The owner's rule: use only the $150 free credits, never pay, keep the account balance at zero. A payment method has to stay on the account (Meta rejects calls without one), so the protection is in the app and in the owner's own checks.

In the app, all enforced by tests:

- **A spend ledger** (`backend/app/core/spend.py`): a file with one line per call, in whole micro-dollars; the running total is their sum. Before every call the client adds the call's *worst-case* cost and refuses the call, without sending it, if the total would pass the cap. A call that fails is still charged. A missing, unreadable or corrupt file stops the helper rather than letting it run uncounted.
- **Worst-case pricing** (`meta_client._chat_cost`, `_speech_cost`): a chat call is priced as one input token per byte sent plus the entire output allowance of that call (4,000 tokens for the intake, 8,000 for the plan); audio is priced at no less than 10 seconds; a model that is not in the price table is priced as the dearest one. An intake call therefore counts as about $0.02 to $0.03 and one try at a plan as about $0.04, so the default cap of **$10** allows roughly 300 to 500 intake calls, or about 250 plan tries. It can be set from above 0 up to $100 (`ARTHNITI_AI_SPEND_CAP_USD`) and never to the whole $150.
- **Other brakes**: an hourly call limit (default 100, in-process, shared by the three model routes; a plan takes one for each try); text up to 2,000 characters; a recording of up to 60 seconds in the page (the server accepts up to 3,000,000 bytes); models named `-contributor` are refused at startup because they let Meta train on the content.
- **A guard in the test suite** stops any test from making a real network call to Meta or writing the real ledger, so running the tests cannot cost anything.
- The smoke script makes three calls (two chat, one speech). Run with the network blocked, it records $0.0451 at the real price table: that is the worst-case estimate for the run, and what Meta bills will be lower, because a real answer uses a few hundred of the 4,000 output tokens the estimate assumes. `--plan` makes two plan calls instead (English and Hindi); the owner's run recorded $0.0797 in the ledger, against about 2 cents at the listed prices for the tokens Meta reported.

What the app cannot do: the ledger counts only this app's calls, on this machine. It does not see the account. Another program using the same key, a second copy of the server with its own ledger file, or a price change on Meta's side is invisible to it. So the owner also sets Meta's email spend limit, looks at the Usage page after the smoke run, and checks that the balance is still ₹0.00. Meta's billing page notes that content sent on free credits may be used to improve Meta's products; the `/talk` page says so to the person before they use it.

## 6. Design decisions

- **Off by default.** `ARTHNITI_AI_ENABLED=true` mounts the three routes, `POST /api/intake/transcribe` (a raw WAV body and `?language=`), `POST /api/intake/extract` (`{text, language}`) and `POST /api/advisor/plan` (`{answers, language, send_to_meta}`), in production too, and refuses to start without `MODEL_API_KEY`. The key is read from the environment only; the backend reads no `.env` file.
- **The model's answer is validated, not trusted.** The field must be one we asked for; a category or area type must be one of the fixed choices; a rupee amount must be a whole number from 0 to ₹100 crore; the quoted words must appear in the transcript; an amount quoted as digits must equal the amount returned; a household income of 0 is dropped (a zero income is confirmed with its own tick on the finance page); the first answer for a field wins. The frontend checks a state or district against the 36 states and 768 districts it holds.
- **The model's plan is checked, not trusted, and the page does not depend on it.** A plan is kept only if every check in `plan_service.verify_plan` passes; otherwise the route asks once more, telling the model the reasons as short codes, and then gives up with "A plan could not be written. The advice above still applies." The rules' advice is on the same page and does not change either way. A plan is never repaired: spacing is the only thing the code alters.
- **Nothing the person says is stored or logged by this app.** The processing log keeps eight fields (event, request id, time, tenant, method, route template, status, duration). `tests/test_log_privacy.py`, `test_intake_log_privacy.py` and `test_advisor_log_privacy.py` check that a transcript, a recording, the answers sent for a plan, the plan or the key cannot reach it, on success or on error. A refused plan is logged as the codes of the checks it failed, never as its words. Run uvicorn with `--no-access-log`: its access log would record the `?language=` query string.
- **Its own consent.** `/talk` has its own notice, a consent tick and (when `VITE_REQUIRE_AGE_CHECK` is on) an age tick, held in page state only. The plan card on `/advisory` has its own tick, held in component state and cleared after each plan, and the route refuses a body where `send_to_meta` is not a real `true`. The wording lives in `talk.*` and `plan.*` keys and is not part of the versioned notice, so `NOTICE_VERSION` did not change. Meta is a new processor and a cross-border transfer; `docs/PROCESSOR_SCHEDULE.md` section 10 records it.
- **Typing always works.** The recorder is hidden where the browser cannot record and for Malayalam; typing works in all eight languages. If the live API fails, the page says so and the plain form is unchanged.

## 7. How it was verified

Measured on 27 and 28 Oct 2026 on the tree that was committed (re-measure with the commands in the README): backend `pytest` 1,922 passed in 52 test files (15.6 s); `node tools/parity4.mjs` 9 of 9 checks over 812 dictionary keys (6,496 values) in 8 languages; `node tools/keycheck.mjs`; ESLint; `node --test` on `talk-lib-test.mjs` (45), `app-state-test.mjs` (41) and `market-lib-test.mjs` (185); `npm run build:local` with the helper on and off, and the https build. All 15 browser gates exited 0, in two batches on the same code (only comments, docstrings and docs changed between them): `talk-ui` (the `/talk` page in a real Edge against a fake Meta: 17 scenarios, 259 checks), `drive` (41 page loads), `error-banner` (32 cases in 8 languages), `scroll-audit` (38 hops), `market-ui` (40 loads), `mobile-audit` (48), `figure-audit` (352 measurements), `lang-layout` (112 loads), `print-audit` (6 renders), `text-align` (33 loads), `field-align` (96), `motion-audit`, `hero-art`, `brand-mark` and `manual-audit`. `refresh-cases` ran too. **No gate drives the plan card** (section 8).

New modules were also mutation-tested by hand (change a comparison, delete a check, run the tests, expect a failure). The table of results, with the survivors that were fixed by a new test or explained as equivalent, is in `docs/ENGINEERING_HISTORY.md`, section "The Meta hackathon intake helper". The browser gate has thirteen refuters (a deliberately broken page that the gate must fail), listed in the header of `tools/verify/talk-ui.mjs`. One of them survived at first, because the check read the fake backend's call log; the check now watches the page's own requests.

A defect found late, by reading: the consent box was unlocked when Stop was pressed, not when the recording had been sent, so a person could untick it with their voice already on its way. No test had caught it. Scenario S15 was written first and failed on 2 of its 12 checks; after the fix it passes with 13, and six breakages of the fixed code each fail it. In 40 pairs of S15 runs, a recording stopped at once was reported unusable 3 times, and 0 times with a 1.2 s pause before Stop (a one-sided Fisher test gives p of about 0.12, so this is not significant). The pause stays as a precaution, and the cause, an empty or very short recording that cannot be decoded, is inferred from `record.js`, not observed.

Departures from test-first, stated plainly: the original `smoke_meta.py` (layer 2) and the version-5 state code were written before their tests; the microphone-release fix in `record.js` was found by reading and is covered afterwards by the browser gate; the `api.js` helper calls, `record.js`, `TalkPage.jsx` and `HelperFilledBanner.jsx` have no Node unit tests, only the browser gate.

## 8. Known gaps

- **The live API has been used by the smoke script only**, twice, on 27 Oct 2026 (section 4 has the numbers). No page has talked to it: `/talk` and the plan card have not been used with the real API in a browser, and no real person's speech has been transcribed. The Billing balance has not been looked at.
- **The plan card has no browser gate.** `talk-ui` drives `/talk` (S0 to S15); nothing drives the card on `/advisory`. The route is covered by the fake-model tests, the stored state and the plan's shape check by `app-state-test`, and the page code by ESLint and a production build, not by a real browser.
- **The checks on a written plan are narrow.** Code refuses a plan that has a digit, a number word, a letter of the wrong script, a link, a stray brace, a blank that was not offered, a required blank that is missing, the wrong number of steps or cautions, or (in English) an acronym or a capitalised word. It cannot tell whether the plan is wise, whether a Marathi plan is Marathi and not Hindi, or whether a place or scheme name written in the native script is real, and the lists of number words are not complete for every language. In a plan in another language the bold scheme name is the English one.
- No native speaker has reviewed any non-English wording, in the interface, in the 40 `talk.*` keys, the 20 `plan.*` keys or the 20 `fo.*` keys (the last three sets are machine-written).
- The three model routes (`/api/intake/*` and `/api/advisor/plan`) have no authentication, no per-user limit and no server-side consent record. The hourly limit is per process, and the ledger bounds this app on one machine, not the account. A copy hosted on the open internet would let anyone who finds it spend the owner's credits up to the cap, so the plan is a recorded demo and a run-it-yourself README, not a hosted copy. A production frontend build needs an https `VITE_API_BASE_URL`, and a browser allows the microphone only on https or on localhost.
- A spoken rupee amount is converted by the model and relies on the person's review.
- No `safety_identifier` is sent with a request, and zero data retention has not been requested. Ask Meta before recordings of real people go through the helper.
- `/privacy` does not mention the helper or the plan card yet. `docs/PROCESSOR_SCHEDULE.md` section 10 records what a deployer has to add.
- The market rows for Lucknow and Varanasi are from the fetch of 24 Sept 2026; the other 11 districts were fetched on 27 Oct. A mandi price is the median of the 30 reporting days before its fetch, so refetch before recording the video.
- A recording that is too short to decode is reported with `talk.errRecording`, whose wording ("speak for less than a minute") fits a recording that is too long, not one that is too short.
- `Retry-After` is not exposed to the browser through CORS, so the page shows a generic "busy" message.
- The helper does not extract a name or a business name: they are not sent.
- Not built: eligibility-rule evaluation for schemes (the page says eligibility is unchecked), a ledger-photo reader, text-to-speech, Malayalam speech.

## 9. Submission checklist

The Official Rules and the submission form are behind a login. Each box is ticked only when it has been checked.

- [ ] The Official Rules are read: whether work that existed before the start is allowed when it is called out (this file is the call-out), team and IP terms, eligibility, what a submission must contain, and whether AI-assisted coding has to be declared.
- [ ] A licence is chosen and `LICENSE` says so. The kickoff rules say entries are open source and the repository is public.
- [ ] `python -m app.smoke_meta` has run against the live API with the capped key, and Meta's Usage page shows a cost at or below the ledger's estimate. It has run once in each mode (the default run and `--plan`, both on 27 Oct 2026; the ledger holds $0.0451 and $0.0797 for them), and the Usage page showed ₹0.00 after the first. Not yet looked at: the Usage page after `--plan` (it should show 5 requests in all) and the Billing balance.
- [ ] `/talk` works end to end against the real API, typed and spoken, and so does the plan card on `/advisory` (server with `ARTHNITI_AI_ENABLED=true`, build with `VITE_AI_HELPER=true`).
- [ ] The test commands in the README pass on a fresh clone.
- [ ] The repository is public, the link works, and the default branch shows this work.
- [ ] The 3-minute video is recorded and uploaded. It shows only what was built during the event, and says that the advice engine is layer 1. A safe input for the engine: tailoring, Uttar Pradesh, Lucknow (14 to 16 schemes across 6 tiers and a district market row). If the live API fails while recording, the typed path and the plain form still work.
- [ ] Submitted by Tue 3 Nov, evening IST.

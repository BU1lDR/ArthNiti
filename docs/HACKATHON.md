# Meta Global AI Developer Hackathon: what was built when, what Meta's models do, and how the cost is held down

Event: [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon), run by Meta and Cerebral Valley ([event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)). Virtual. **Track: Indie. Entrant: Aryan Verma, alone.** Theme: *Build for Your World*.

The product, **अर्थNiti** (repository `ArthNiti`), tells a rural micro-entrepreneur whether a business plan is affordable, which government schemes may apply, and what to do next. The Meta models do one job in it: they turn what a person says or types into form answers, and the person checks every answer before it is used. Section 3 says exactly where that line is.

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
| App state | Version 5 of the stored state; `aiFilled` records which fields the helper filled and drops a field once the person edits it; a banner on every form page that received an answer | `frontend/src/context/AppContext.jsx`, `components/HelperFilledBanner.jsx`, the form pages |
| Gating | `VITE_AI_HELPER=true` switches the route, the landing button and the profile card on; off, `/talk` is a 404 and the app is the app it was | `frontend/src/config/deployment.js`, `App.jsx` |
| Languages | 40 `talk.*` keys in all 8 languages (320 strings), including the sentence that tells the person their words go to Meta. **No native speaker has reviewed the 7 non-English sets** | `frontend/src/i18n/resultStrings.js` |
| Verification | A fake Meta behind the real app; a browser gate for `/talk` (17 scenarios, 259 checks); 45 and 22 Node unit tests for the answer mapping and the stored state; the existing gates re-run | `tools/verify/talk_fake_backend.py`, `talk-ui.mjs`, `talk-lib-test.mjs`, `app-state-test.mjs` |
| Docs | This file, `docs/PROCESSOR_SCHEDULE.md` section 10, the README, `CLAUDE.md`, `docs/frontend_integration.md`, CI steps | |

Backend tests went from 1,411 to 1,558 (+147): `test_meta_client` +53, `test_spend_cap` +32 (new file), `test_intake_settings` +31, `test_smoke_meta` +13, `test_intake_routes` +7, `test_network_guard` +7 (new), `test_intake_service` +2, `test_talk_fake_backend` +2 (new). Of the layer-2 files, layer 3 touched `meta_client.py`, `settings.py`, `main.py`, `routes/intake.py`, `intake_service.py`, `smoke_meta.py`, `conftest.py` and `intake_fixtures.py`, in the ways the table names; `schemas/intake.py` was not touched.

### 2.3 How a reviewer can check this

Every commit in the chain is dated 27 Oct 2026, because the work was done in one working tree and committed afterwards. **Nothing is backdated.** Git history therefore separates the layers by order, not by date. The chain, oldest first:

| Commit title | Layer | Branch that ends here |
|---|---|---|
| feat(dpdp): data-protection work, input caps and verifier changes from September | 1 | |
| chore(brand): the owner's brand-asset files from 13 Sept | 1 | `feature/dpdp-compliance` |
| docs: the project becomes a solo entry for the Meta hackathon, named ArthNiti | 2 | |
| chore: the project as it stood at the hackathon start (`e4708306cab1`) | 2 | |
| feat(meta): spend cap, network guard and API-efficiency settings for the Meta helper | 3 | `feature/security-hardening` |
| feat(talk): speak or type your answers, off unless VITE_AI_HELPER is set | 3 | |
| docs: the hackathon account, the cost controls and what is still unverified | 3 | `feature/voice-assistant` |

```
git log --oneline 4a2307e..feature/voice-assistant       # the chain, newest first
git diff e4708306cab1..feature/voice-assistant --stat    # everything the hackathon added or changed
```

`e4708306cab1` is the commit titled *"chore: the project as it stood at the hackathon start"*: a snapshot of the tree at 12:00 PM ET on 26 Oct. The commits up to and including it are layers 1 and 2; the three after it are layer 3.

That snapshot was reconstructed, not saved. A full copy of the working tree was taken at 8:03 AM ET; every edit made through the editor tools between then and 12:00 PM ET was replayed from the session transcript; a file last written before 12:00 PM ET is taken as it is on disk; the few shell-script edits are accounted for by hand. Replaying the 205 editor calls made after the start on top of the snapshot reproduces 26 of the 28 files they touched byte for byte. The other two (`test_network_guard.py`, `talk-lib-test.mjs`) are new in layer 3 and were changed afterwards by shell commands. The snapshot passes its own backend suite: 1,411 tests, 45 files.

## 3. What the models do, and what they never do

Every number and every sentence of advice still comes from hand-written Python rules (`backend/app/services/`). **There is no model call in the analysis.** Meta's models do the intake:

| Step | Who does it |
|---|---|
| Speech to text (Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, English) | Meta's speech model |
| Pulling form answers out of what the person said | Meta's language model, constrained to a JSON schema |
| Checking each answer against the person's own words | Python: an answer whose quoted words are not in the transcript is dropped |
| **The person confirming every answer** | The person, on a review screen, the quote beside the answer |
| Profit, repayment pressure, household check, scheme matching, market context, advice | Python rules |

What may be claimed from that:

- Say "AI-assisted intake". Never "AI-driven advice", "AI-generated advice", or that the model "analyses finances". It does not.
- The model sees no scheme, market or advice data. It never produces or changes a number the engine uses without the person seeing it first. It does convert spoken numbers to digits ("pachaas hazaar" to 50000); the code can check that only when the person's words contain the digits, so **the review screen is the control** and cannot be skipped.
- Why not let the model give the advice: a wrong number here is a loan someone cannot repay. Arithmetic stays in code that has tests.

## 4. How the Meta API is used

| Meta product | Used for | Where |
|---|---|---|
| Muse Voice Transcribe 1.0, `POST /v1/asr/transcribe` | The recording to text. 15 `keywords` (lakh, crore, EMI, rupees, the demo places and the business categories) bias it toward the words this form needs | `meta_client.transcribe`, `intake_service.SPEECH_KEYWORDS` |
| Muse Spark 1.3, `POST /v1/chat/completions` with `response_format: json_schema` | Text to form answers, each with the words it came from. `reasoning_effort` is `low` | `meta_client.complete_json` |
| Automatic prompt caching | The fixed instructions and schema come first and the person's text last, so the repeated prefix is billed at the cached rate; `prompt_cache_key` is set | message order in `intake_service`, `meta_client` |
| The `usage` block | Read after every chat call and printed by the smoke script (input, cached, output and reasoning tokens) | `MetaClient.last_usage`, `smoke_meta.py` |
| `GET /v1/models` | A free check that a key works (no tokens are used) | README |

Not used, and why: Muse Image and Muse Code (nothing in this product needs them); Muse Glimmer and Spark Open, the open-weight models (the smallest build is about 17 GB and does not fit the 13.7 GB laptop this was built on; renting a partner's hosting needs another account and credits, which the no-spend rule rules out); live partial transcripts over a socket (the form does not need them). Meta has no text-to-speech, so nothing is read aloud.

Facts that shaped the code (from Meta's public docs, read on 26 Oct 2026): reasoning tokens share **one** output cap with the visible answer and are billed as output, so `max_completion_tokens` is 4,000; `reasoning_effort: "none"` returns HTTP 400 on Muse Spark; `stop`, `logprobs`, `n` above 1 and a few more fields are rejected; audio is mono 16-bit PCM WAV, 16 or 24 kHz, up to 10 minutes; Malayalam is not a supported speech language. **`prompt_cache_key`, `keywords` and the usage field names come from the docs and have not yet been run against the live API**; the owner's first run of `python -m app.smoke_meta` is what confirms them.

## 5. Keeping the spend inside the free credits

The owner's rule: use only the $150 free credits, never pay, keep the account balance at zero. A payment method has to stay on the account (Meta rejects calls without one), so the protection is in the app and in the owner's own checks.

In the app, all enforced by tests:

- **A spend ledger** (`backend/app/core/spend.py`): a file with one line per call, in whole micro-dollars; the running total is their sum. Before every call the client adds the call's *worst-case* cost and refuses the call, without sending it, if the total would pass the cap. A call that fails is still charged. A missing, unreadable or corrupt file stops the helper rather than letting it run uncounted.
- **Worst-case pricing** (`meta_client._chat_cost`, `_speech_cost`): a chat call is priced as one input token per byte sent plus the entire output allowance of 4,000 tokens; audio is priced at no less than 10 seconds; a model that is not in the price table is priced as the dearest one. A chat call therefore counts as about $0.02 to $0.03, so the default cap of **$10** allows roughly 300 to 500 of them. It can be set from above 0 up to $100 (`ARTHNITI_AI_SPEND_CAP_USD`) and never to the whole $150.
- **Other brakes**: an hourly call limit (default 100, in-process); text up to 2,000 characters; a recording of up to 60 seconds in the page (the server accepts up to 3,000,000 bytes); models named `-contributor` are refused at startup because they let Meta train on the content.
- **A guard in the test suite** stops any test from making a real network call to Meta or writing the real ledger, so running the tests cannot cost anything.
- The smoke script makes three calls (two chat, one speech). Run with the network blocked, it records $0.0451 at the real price table: that is the worst-case estimate for the run, and what Meta bills will be lower, because a real answer uses a few hundred of the 4,000 output tokens the estimate assumes.

What the app cannot do: the ledger counts only this app's calls, on this machine. It does not see the account. Another program using the same key, a second copy of the server with its own ledger file, or a price change on Meta's side is invisible to it. So the owner also sets Meta's email spend limit, looks at the Usage page after the smoke run, and checks that the balance is still ₹0.00. Meta's billing page notes that content sent on free credits may be used to improve Meta's products; the `/talk` page says so to the person before they use it.

## 6. Design decisions

- **Off by default.** `ARTHNITI_AI_ENABLED=true` mounts the two routes, `POST /api/intake/transcribe` (a raw WAV body and `?language=`) and `POST /api/intake/extract` (`{text, language}`), in production too, and refuses to start without `MODEL_API_KEY`. The key is read from the environment only; the backend reads no `.env` file.
- **The model's answer is validated, not trusted.** The field must be one we asked for; a category or area type must be one of the fixed choices; a rupee amount must be a whole number from 0 to ₹100 crore; the quoted words must appear in the transcript; an amount quoted as digits must equal the amount returned; a household income of 0 is dropped (a zero income is confirmed with its own tick on the finance page); the first answer for a field wins. The frontend checks a state or district against the 36 states and 768 districts it holds.
- **Nothing the person says is stored or logged by this app.** The processing log keeps eight fields (event, request id, time, tenant, method, route template, status, duration). `tests/test_log_privacy.py` and `test_intake_log_privacy.py` check that a transcript, a recording or the key cannot reach it, on success or on error. Run uvicorn with `--no-access-log`: its access log would record the `?language=` query string.
- **Its own consent.** `/talk` has its own notice, a consent tick and (when `VITE_REQUIRE_AGE_CHECK` is on) an age tick, held in page state only. The wording lives in `talk.*` keys and is not part of the versioned notice, so `NOTICE_VERSION` did not change. Meta is a new processor and a cross-border transfer; `docs/PROCESSOR_SCHEDULE.md` section 10 records it.
- **Typing always works.** The recorder is hidden where the browser cannot record and for Malayalam; typing works in all eight languages. If the live API fails, the page says so and the plain form is unchanged.

## 7. How it was verified

Measured on 27 Oct 2026 at the tip (re-measure with the commands in the README): backend `pytest` 1,558 passed in 48 test files (12.5 s); `node tools/parity4.mjs` 9 of 9 checks over 772 dictionary keys in 8 languages; `node tools/keycheck.mjs`; ESLint; `node --test` on `talk-lib-test.mjs` (45), `app-state-test.mjs` (22) and `market-lib-test.mjs` (185); `npm run build:local` with the helper on and off, and the https build; and the browser gates. `talk-ui` drives the `/talk` page in a real Edge against a fake Meta: 17 scenarios, 259 checks. The other 14 browser gates and `refresh-cases` all exited 0 in the same run (897 s for the whole chain of 16 steps; `lang-layout` is the slowest at 278 s and `talk-ui` took 33 s).

New modules were also mutation-tested by hand (change a comparison, delete a check, run the tests, expect a failure). The table of results, with the survivors that were fixed by a new test or explained as equivalent, is in `docs/ENGINEERING_HISTORY.md`, section "The Meta hackathon intake helper". The browser gate has thirteen refuters (a deliberately broken page that the gate must fail), listed in the header of `tools/verify/talk-ui.mjs`. One of them survived at first, because the check read the fake backend's call log; the check now watches the page's own requests.

A defect found late, by reading: the consent box was unlocked when Stop was pressed, not when the recording had been sent, so a person could untick it with their voice already on its way. No test had caught it. Scenario S15 was written first and failed on 2 of its 12 checks; after the fix it passes with 13, and six breakages of the fixed code each fail it. In 40 pairs of S15 runs, a recording stopped at once was reported unusable 3 times, and 0 times with a 1.2 s pause before Stop (a one-sided Fisher test gives p of about 0.12, so this is not significant). The pause stays as a precaution, and the cause, an empty or very short recording that cannot be decoded, is inferred from `record.js`, not observed.

Departures from test-first, stated plainly: the original `smoke_meta.py` (layer 2) and the version-5 state code were written before their tests; the microphone-release fix in `record.js` was found by reading and is covered afterwards by the browser gate; the `api.js` helper calls, `record.js`, `TalkPage.jsx` and `HelperFilledBanner.jsx` have no Node unit tests, only the browser gate.

## 8. Known gaps

- **Nothing has run against Meta's live API.** The request and response shapes come from the public docs. The first `python -m app.smoke_meta` run confirms them, and may show that the token limit or the reasoning effort needs adjusting.
- No native speaker has reviewed any non-English wording, in the interface or in the 40 `talk.*` keys.
- The helper routes have no authentication, no per-user limit and no server-side consent record. The hourly limit is per process, and the ledger bounds this app on one machine, not the account. A copy hosted on the open internet would let anyone who finds it spend the owner's credits up to the cap, so the plan is a recorded demo and a run-it-yourself README, not a hosted copy. A production frontend build needs an https `VITE_API_BASE_URL`, and a browser allows the microphone only on https or on localhost.
- A spoken rupee amount is converted by the model and relies on the person's review.
- No `safety_identifier` is sent with a request, and zero data retention has not been requested. Ask Meta before recordings of real people go through the helper.
- `/privacy` does not mention the helper yet. `docs/PROCESSOR_SCHEDULE.md` section 10 records what a deployer has to add.
- A recording that is too short to decode is reported with `talk.errRecording`, whose wording ("speak for less than a minute") fits a recording that is too long, not one that is too short.
- `Retry-After` is not exposed to the browser through CORS, so the page shows a generic "busy" message.
- The helper does not extract a name or a business name: they are not sent.
- Not built: eligibility-rule evaluation for schemes (the page says eligibility is unchecked), a ledger-photo reader, text-to-speech, Malayalam speech.

## 9. Submission checklist

The Official Rules and the submission form are behind a login. Each box is ticked only when it has been checked.

- [ ] The Official Rules are read: whether work that existed before the start is allowed when it is called out (this file is the call-out), team and IP terms, eligibility, what a submission must contain, and whether AI-assisted coding has to be declared.
- [ ] A licence is chosen and `LICENSE` says so. The kickoff rules say entries are open source and the repository is public.
- [ ] `python -m app.smoke_meta` has run once against the live API with the capped key, and Meta's Usage page shows a cost at or below the ledger's estimate ($0.0451).
- [ ] `/talk` works end to end against the real API, typed and spoken.
- [ ] The test commands in the README pass on a fresh clone.
- [ ] The repository is public, the link works, and the default branch shows this work.
- [ ] The 3-minute video is recorded and uploaded. It shows only what was built during the event, and says that the advice engine is layer 1. A safe input for the engine: tailoring, Uttar Pradesh, Lucknow (14 to 16 schemes across 6 tiers and a district market row). If the live API fails while recording, the typed path and the plain form still work.
- [ ] Submitted by Tue 3 Nov, evening IST.

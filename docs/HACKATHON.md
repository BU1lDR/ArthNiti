# Meta Global AI Developer Hackathon: plan, design and submission notes

Event: [Meta Global AI Developer Hackathon](https://dev.meta.ai/events/global-hackathon), run by Meta and Cerebral Valley ([event page](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)). Virtual. Track: **Indie** (individual builders). Entered by Aryan Verma on 26 Oct 2026.

**The Official Rules have not been read by whoever wrote this file.** Everything below about the event comes from the two public pages; the pre-existing-work policy, team and IP terms, and the submission contents are unknown. Section 8 lists what the owner has to check.

## 1. Dates

| What | ET | IST |
|---|---|---|
| Hackathon starts | Mon 26 Oct 2026 | Mon 26 Oct 2026 |
| Submission due | Wed 4 Nov 2026, 9:00 PM EST (UTC−5) | **Thu 5 Nov 2026, 07:30** |
| Our working deadline: everything submitted | | **Tue 3 Nov 2026, evening** |

The working deadline leaves about 34 hours for a failed upload, a lost key or a broken video. Judging runs 4–8 Nov and finals are on 9 Nov (from the event page).

## 2. Built before the hackathon, and built during it

This must be said plainly in the submission, and the Official Rules decide whether it is allowed.

- **Before 26 Oct:** the whole advice engine, the 30-scheme dataset, the 20 sourced market rows, eight-language interface, the data-protection work and the test and verifier suite. First commit 30 Aug 2026. It began as a six-person team entry for a college round of the Smart India Hackathon (the team was not selected). `git shortlog -sn --all` shows Aryan Verma 201 commits (two spellings of the name), Manjeet 12 and Netra 6.
- **During the hackathon (26 Oct to 3 Nov):** the Meta-powered "tell us in your own words" helper (sections 3 to 5), the change from a team project to a solo one across the docs, and the hardening of the verifier scripts' exit codes.

Update this list when work lands. `git log --since=2026-10-26` is the record.

## 3. What the model does, and what it never does

The product helps a micro-entrepreneur understand whether a business plan is affordable, which schemes may apply, and what to do next. **Every number and every advice sentence still comes from hand-written Python rules** (`backend/app/services/`). The model is used for one job: getting a person's answers into the form.

| Step | Who does it |
|---|---|
| Speech to text (Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, English) | Meta's speech model |
| Pulling form answers out of what the person said | Meta's language model, constrained to a JSON schema |
| Checking each answer against the person's own words | Python: an answer whose quote is not in the transcript is dropped |
| **The person confirming every answer** | The person, on a review screen, quote beside number |
| Profit, repayment pressure, household check, scheme matching, market context, advice | Python rules, unchanged |

What this means for what may be claimed:

- Say "AI-assisted intake". Never say "AI-driven advice", "AI-generated advice" or that the model "analyses finances". It does not.
- The model never produces or changes a number the engine uses without the person seeing it first. It converts spoken numbers to digits ("pachaas hazaar" to 50000); the code can check that only when the person's words contain the digits themselves (section 4), so the **review screen is the control** and is not skippable.
- The model sees no scheme, market or advice data.

## 4. Design, with the calls I made (to check)

Decided by the owner on 26 Oct: build on Meta's own models for the Indie track; keep it one person's project; keep the deterministic engine. **Everything below marked "my call" was decided by the assistant, not the owner.**

**Backend** (`backend/app/`)

- `core/meta_client.py`: the only code that talks to Meta. Standard-library HTTP only (no new dependency). Two calls: speech to text, and a chat call that must answer in a JSON schema. Never logs a request or response body or the key.
- `services/intake_service.py`: pure functions. Builds the schema and the messages, and validates the model's answer.
- `api/routes/intake.py`: `POST /api/intake/transcribe` (raw WAV body, `?language=`) and `POST /api/intake/extract` (`{text, language}`).
- Off by default. `ARTHNITI_AI_ENABLED=true` mounts the routes and refuses to start without `MODEL_API_KEY`. The key comes from the environment only; the backend reads no `.env` file. **My call:** a model id ending `-contributor` is refused at startup, because on Meta's pricing page those let Meta train on prompts and responses, and this app handles financial answers.
- Limits: typed text up to 2,000 characters; audio up to 60 seconds of mono 16-bit WAV at 16 or 24 kHz (a header check with the standard `wave` module), body capped while it streams; a process-wide hourly call cap to bound cost. **My call:** the cap is in-process (one worker), so it is a cost brake and not a security control.
- Model settings: `reasoning_effort: "low"`, a generous output-token limit (reasoning tokens count against it), no temperature set. **My call**, from Meta's docs.

**What the validation keeps** (all unit-tested): the field name must be one we asked for; a category or area type must be one of our fixed choices; a rupee amount must be a whole number from 0 to ₹100 crore; the quoted words must appear in the transcript; an amount quoted as bare digits must equal the amount the model returned; a household income of 0 is dropped (a zero income has to be confirmed with its own tick on the finance page); the first answer for a field wins. A state or district the model names is checked by the frontend against the 36 states and 768 districts it already holds.

**Frontend**

- A new optional page, `/talk`, linked from the landing page. Own notice and own consent and age ticks (the helper sends data the main flow does not). Record button, or type; edit the transcript; "Find my answers"; review screen (quote beside the answer, each editable or removable); "Use these answers" writes the answers into the same form pages the person would otherwise type into, and every page that received one says so.
- Recording happens in the browser (MediaRecorder, then resampled to 16 kHz mono WAV). Nothing is uploaded until the person presses a button. Hidden where the browser cannot record, and for Malayalam (Meta's speech model does not list it); typing still works in all eight languages.
- Switched on by a build flag, `VITE_AI_HELPER=true`. Without it the app is exactly the app it was.

**Data protection (DPDP)**

- The helper sends the recording, or the typed text, to Meta. That is a new processor and a **cross-border transfer**. `docs/PROCESSOR_SCHEDULE.md` and the `/privacy` page get a section for it, and the lawyer items list gets the transfer and Meta's retention terms (unknown to us; do not promise on Meta's behalf).
- The transcript and recording are never stored or logged by this app. `tests/test_log_privacy.py` is extended so they cannot reach a log, on success or on error.
- The notice text is versioned, so adding the helper's notice bumps `NOTICE_VERSION`. No native speaker has reviewed any non-English notice wording (open item S16); that applies to the new text too.

## 5. Build order, and what gets cut first

1. Backend with a fake model client: settings, validation, routes, tests. Everything except the live call is verified offline.
2. A smoke script, `python -m app.smoke_meta`, that the owner runs with their key. Its output is the only proof of the live API shapes (they come from Meta's documentation as summarised, and are **unconfirmed** until it runs).
3. The `/talk` page, recorder, strings in all 8 languages, notice and privacy text.
4. Docs and counts; browser verification with a fake backend client.
5. Demo video and submission.

Cut in this order if time runs short: the "why this?" explainer, per-field markers on the form pages (a note at the top of the page stays), the hourly cap, spoken-language switching on `/talk`. Not cut: the review screen, the evidence check, the notice.

## 6. Demo path

Reuse the script in `OUR_MVP.md` §16, with the new first minute: open `/talk`, speak or type the situation in Hindi, show the quote beside each answer, correct one, press "Use these answers", walk the form pages to `/finance`, and run the analysis. Safe input for the rest: tailoring in Uttar Pradesh, Lucknow (14 to 16 schemes across 6 tiers, a district market row). A fallback is part of the plan: if the live API fails during the recording, the typed path and the plain form still work and the app says so.

## 7. Hosting

A production frontend build refuses to build without an https `VITE_API_BASE_URL`, and the browser only allows the microphone on https or localhost, so any hosted demo needs https on both sides. The reliable artifact is a demo video plus a run-it-yourself README. A hosted demo is optional and spends the owner's API quota: set `ARTHNITI_AI_HOURLY_LIMIT` low.

## 8. For the owner to check or supply

1. **Official Rules** (Cerebral Valley page): is work that existed before 26 Oct allowed? Team size and IP terms? Is a person "tied to a government" excluded? (The project began as an entry for an Indian government-run hackathon.) What must the submission contain: repo link, video, text, a live demo?
2. A Meta API key (create at <https://dev.meta.ai/platform>, API keys tab). If billing is not set up, a call fails with HTTP 402; look for hackathon credits on the Discord.
3. Written agreement from Manjeet, Netra and Anmol about their contributions, before submission if the Rules ask who owns the code. Three other names (Saad, Tripti) appear in the old team list but have no commits under those names.
4. Whether the repository is made public for judging. Making a private repo public, adding collaborators and renaming it are changes to the GitHub repo: they need the owner's explicit go-ahead each time.

## 9. Submission checklist

Filled in once the Official Rules are read. Do not tick an item that was not checked.

- [ ] Rules read; pre-existing-work policy satisfied
- [ ] `MODEL_API_KEY` works: `python -m app.smoke_meta` passes, output kept
- [ ] The helper works end to end in the browser against the real API (typed and spoken)
- [ ] `pytest`, `node tools/parity4.mjs`, `node tools/keycheck.mjs`, `node tools/verify/glyph-audit.mjs` pass
- [ ] README says what the model does and does not do, and what was built before the hackathon
- [ ] Demo video recorded (under the length the Rules allow) and uploaded
- [ ] Repository link works for a judge (visibility decided by the owner)
- [ ] Submitted by Tue 3 Nov 2026, evening IST

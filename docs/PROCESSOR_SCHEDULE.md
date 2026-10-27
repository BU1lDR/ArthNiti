# अर्थNiti: technical schedule for a deploying organisation

This is the technical schedule for an organisation that runs अर्थNiti for its own clients: an NBFC, an MFI, an SHG federation, a CSC operator or similar. It says what the software collects and sends, what it keeps, where it keeps it and for how long, and what it leaves to the organisation and its host. It is written to sit alongside a contract. It is not the contract and it is not legal advice. Items that need a lawyer are marked **Lawyer**.

It describes the code as measured on 27 Sept 2026 (branch `feature/dpdp-compliance`, notice version `2026-09-27.1`), plus the optional AI helper added on 26 and 27 Oct 2026 for the Meta hackathon (`docs/HACKATHON.md`). **The helper is off by default.** Sections 1 to 9 describe the software with the helper off, and say so where the helper changes a statement. Section 10 describes the helper. A statement of the form "the software does X" is backed by the test or live probe named next to it. If the code changes, this file has to change with it.

Nothing here says that the software, or any deployment of it, complies with the DPDP Act, the DPDP Rules or any other law. That is for the organisation and its lawyer to decide, using the facts below.

---

## 1. Roles and timing

- **The deploying organisation is the Data Fiduciary.** It decides why and how the answers are processed, and it is the organisation named in the privacy notice (`VITE_FIDUCIARY_NAME`).
- **Whoever runs the software for it is its Data Processor**, under a contract (C1). When the organisation hosts the software itself, the processor role covers the software's supplier only as far as the contract says. **Lawyer.**
- **On the owner's own public demo, the owner is the Data Fiduciary** (D10). The demo runs in demo mode, which asks for made-up figures (§5.2).
- **Timing.** G.S.R. 843(E) and the DPDP Rules, G.S.R. 846(E), were published on 13 Nov 2025. The corrigendum G.S.R. 892(E) of 10 Dec 2025 changed "of this Gazette" to "in the Official Gazette".
  - The Act's operative sections (3–5, 6(1)–(8) and (10), 7–17, 27 except 27(1)(d), 28–34, 36, 37 and 44(2)) and Rules 3, 5–16, 22 and 23 apply eighteen months from publication. That gives 13 May 2027. **Lawyer:** whether the date is 13 or 14 May. The on-screen notice says 13 May 2027 (`privacy.board`), so a different answer means changing that text and the notice version (§5.4).
  - s. 6(9), s. 27(1)(d) and Rule 4 (Consent Managers) apply after one year. Rules 1, 2 and 17–21 applied on publication.
  - Until the Rules apply, IT Act s. 43A and the SPDI Rules 2011 may apply. Their text was not checked for this schedule. **Lawyer:** whether revenue, EMI and household-income figures are "financial information" under the SPDI Rules.
- **By default the software uses no AI model.** Every figure and every sentence of advice comes from fixed, hand-written rules in `backend/app/services/`, and with the helper off no request is sent to any model, API or third party. The optional helper (§10), off unless the deployer switches it on, sends what a person says or types on one page to Meta's Model API, so that the form can be filled in for the person to check. It never produces a figure or a sentence of advice.

---

## 2. What is collected, what is sent and what is kept

### 2.1 What is asked

The journey asks 19 questions over four steps, or 20 when the reader picks "Other" as their kind of work. There is also an optional name-only page. `/login` asks only for a name. It checks nothing and has no password or account, so it is not authentication.

| Page | Asks |
|---|---|
| `/login` (optional) | name |
| `/profile` | name, language, dialect |
| `/business` | business name, kind of work, kind of work (when "Other"), money needed to start, expected monthly revenue, monthly running cost of the business, existing business debt |
| `/location` | state, district, village or town, village or city, where they sell, who their customers are |
| `/finance` | money already held, monthly spending, monthly EMI, household monthly income (optional); then the consent box, the age box when enabled (§5.3), and a confirmation box when the household income is exactly 0 |

### 2.2 What is sent

The answers are sent once, when the reader presses **Check my business** on `/finance` with the consent box ticked. They go as one `POST /api/analysis/run` JSON request to `VITE_API_BASE_URL`. With the helper off, the frontend makes no other network request. With it on, the `/talk` page also calls the backend's two intake routes (§10), still at `VITE_API_BASE_URL`: the browser contacts no other address. The frontend loads no third-party font, script, stylesheet or CDN asset in either case. Exactly 12 answers are sent:

| Request field | Question | What it changes in the result |
|---|---|---|
| `business_category` | kind of work (or the typed "Other") | which schemes match; which market figures apply |
| `initial_investment` | money needed to start | funding gap, return on investment, the estimated repayment on the gap |
| `expected_monthly_revenue` | expected monthly revenue | profit and margin |
| `monthly_operating_expenses` | monthly running cost of the business | operating surplus |
| `existing_debt` | existing business debt | one advisory observation only; it is not part of any figure |
| `state` | state | which schemes are available and how they fit; market lookup |
| `district` | district | market lookup |
| `location_type` | village or city | which schemes are available |
| `available_capital` | money already held | funding gap |
| `monthly_expenses` | monthly spending | monthly profit and financial status |
| `monthly_emi` | monthly EMI | repayment pressure and the household check |
| `household_monthly_income` | household monthly income | the household check. Left blank, it is sent as `null` ("not asked"), never as 0 |

The consent record goes with them (§5.3).

`backend/tests/test_notice_sent_fields.py` fails if this list, as `/privacy` prints it (`SENT_FIELDS` in `frontend/src/config/notice.js`), differs from any of three others:

- the payload `FinancePage` builds;
- the fields the backend reads;
- the field labels the error banner uses.

### 2.3 What is never sent

The following stay in the browser tab and are printed on the reader's report:

- the name;
- the business name;
- the village or town;
- where they sell;
- who their customers are;
- the dialect.

The language chosen on `/profile` is not sent as an answer. The interface language code (for example `hi`) is sent inside the consent record, because it records which translation of the notice the reader agreed to.

The backend still accepts eight more fields for other API callers: `employees`, `village`, `market_type`, `customers`, `user_language`, `preferred_dialect`, `literacy_level` and `entrepreneur_type` (`IGNORED_FIELDS` in `backend/app/schemas/analysis.py`).

- They are validated and length-capped, and they are marked "Accepted and ignored" in the API schema.
- They affect no figure, and none of them is echoed in the response.
- The frontend sends none of them.

### 2.4 Where each thing is held, and for how long

| Where | What | How long | Who can reach it |
|---|---|---|---|
| Browser `sessionStorage`, key `sih-application` | every answer, the ones never sent included, and the last result, as `{v: 5, data}`. When the helper filled a field, `data` also names that field (`aiFilled`: field names, not words) | until **Start over** is pressed, or the tab is closed. It survives a page refresh. A browser that restores tabs after a restart may restore it too. | anyone using that tab on that device |
| Browser `localStorage` | `sih-language`, `sih-dialect`, `sih-theme`, `sih-textsize` (and an inert `sih-contrast` left by older builds). Interface preferences only; no answers | no expiry. Start over does not clear them, and the notice says so (`common.startOverText`) | the next person on the same browser profile |
| `FinancePage` memory | the consent tick, the age tick, the zero-income confirmation | until the reader leaves `/finance`. Never written to storage | that page |
| `/talk` page memory (helper on) | the consent and age ticks, the recording until it is sent, the transcript, the answers found and which of them are ticked | until the reader leaves `/talk`. Never written to storage. The answers the reader chooses to use go into the `sessionStorage` copy above, as any other answer | that page |
| In transit | the 12 fields and the consent record | one request | the network path. HTTPS is required (D1) |
| Server process memory | the request and the computed response | the length of the request. With the helper off, the app writes nothing to disk and has no database. Its only cache holds the bundled scheme and market files | the server process |
| Spend file (helper on) | one whole number per model call, in millionths of a dollar. No words, no key, no identity (§10.3) | until someone deletes it. The app deletes nothing | whoever can read the server's disk |
| **Processing log** (stdout) | one JSON line per request (§4). No answer; a code computed from the answers | **the app deletes nothing.** The organisation sets and enforces the retention | whoever can read the server's stdout |
| uvicorn access log (stdout by default) | per request: the client IP address and port, the method, the path **with its query string**, and the status | as above | as above. Turn it off with `--no-access-log` (§3.3) |
| stderr | startup notes; response-validation failures (error types and field locations only); uvicorn's traceback for an unhandled error | as above | as above |
| Reverse proxy, load balancer, host, CDN | their own logs, usually the IP address, path, user agent and timing | set by the host | the host |
| The printed or saved report | every answer, the ones never sent included, and every figure | wherever the reader keeps it | whoever holds it |

The browser's own form history is a separate store. `autoComplete="off"` is set on the six free-text personal inputs: the two name fields, the business name, the "Other" kind of work, the village and the customers. The number inputs and dropdowns carry no autocomplete hint. Whether a given browser offers earlier entries for them was not tested.

---

## 3. Configuration reference

### 3.1 Backend (environment variables, read at startup)

`backend/app/core/settings.py` reads these once. A bad value stops the server with a message naming the variable. The backend never reads a `.env` file.

| Variable | Values | Default |
|---|---|---|
| `ARTHNITI_ENV` | `development` or `production`; anything else refuses to start | `development` |
| `ARTHNITI_CORS_ORIGINS` | comma-separated exact origins (§6). Required in production, where every entry must be `https://` | development only: when unset, any `http://localhost` or `http://127.0.0.1` port |
| `ARTHNITI_TENANT` | a label copied into every log line: `^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$` | `default` |
| `ARTHNITI_REQUIRE_CONSENT` | exactly `true` or `false`. When true, a request with no consent record gets a 422 | true in production, false in development |
| `ARTHNITI_LOG_HASH_KEY` | optional; at least 32 characters. When set, the log keys its payload code with HMAC-SHA256 (§4.3). It is a secret: keep it out of the repo and out of any `VITE_*` value | unset (plain SHA-256) |
| `ARTHNITI_AI_ENABLED` | exactly `true` or `false`. When true, the two `/api/intake` routes are mounted, in production too, and the server refuses to start without `MODEL_API_KEY` (§10) | `false` |
| `MODEL_API_KEY` | the Meta Model API key: 1 to 512 visible ASCII characters, environment only (the backend reads no file for it). It is a secret: keep it out of the repo and out of any `VITE_*` value. It is dropped at startup while the helper is off | unset |
| `ARTHNITI_AI_MODEL` | the chat model. A name ending in `-contributor` is refused (§10.3) | `muse-spark-1.3` |
| `ARTHNITI_AI_ASR_MODEL` | the speech-to-text model. The same refusal | `muse-voice-transcribe-1.0` |
| `ARTHNITI_AI_HOURLY_LIMIT` | a whole number from 1 to 100000: the model calls the whole process makes in an hour (§10.7) | `100` |
| `ARTHNITI_AI_SPEND_CAP_USD` | dollars, written like `10` or `2.50`, above 0 and at most 100 (§10.7) | `10` |
| `ARTHNITI_AI_SPEND_FILE` | the full path of the file that keeps the running total (§10.7). A relative path is refused | `backend/.ai_spend` |

**Production** serves only `GET /health` and `POST /api/analysis/run`. `/docs`, `/redoc` and `/openapi.json` are switched off, and the other six routers are not mounted, so their routes return 404. With `ARTHNITI_AI_ENABLED=true` it also serves `POST /api/intake/transcribe` and `POST /api/intake/extract` (§10).

**Development** serves all 8 routers (10 with the helper on) and the API docs, and logs a startup warning that lists what is open. Development `/docs` loads Swagger UI's JavaScript from a public CDN.

With consent switched off in production, the server logs one INFO line at startup saying so.

### 3.2 Frontend (build-time variables)

`frontend/src/config/deployment.js` reads these when `npm run build` runs. `frontend/.env.example` documents them. **Every `VITE_*` value is compiled into the JavaScript that any visitor downloads, so none may be a secret.** Vite reads `.env` files from `frontend/` only.

| Variable | Use | Unset or invalid |
|---|---|---|
| `VITE_API_BASE_URL` | where the backend is. `npm run build` refuses to build unless it starts with `https://` | `npm run dev` and `npm run build:local` fall back to `http://127.0.0.1:8000`. A production build has no fallback |
| `VITE_FIDUCIARY_NAME` | the organisation named in every notice | **demo mode** (§5.2) |
| `VITE_FIDUCIARY_URL` | the organisation's website, shown as a link on `/privacy` | not shown. An address that is not `https://` counts as unset |
| `VITE_PRIVACY_CONTACT` | how to reach the organisation about the answers; printed as plain text | the notice says this copy gives no contact |
| `VITE_GRIEVANCE_URL` | the organisation's complaints page, shown as a link | not shown. An address that is not `https://` counts as unset |
| `VITE_RECORD_RETENTION_DAYS` | a whole number from 1 to 99999, shown as "kept for N days" | the notice tells the reader to ask the contact, or says the period is not stated |
| `VITE_REQUIRE_AGE_CHECK` | exactly `true` adds the age box and the age paragraph. On `/talk` it adds its own age box (§10.5) | no age question |
| `VITE_AI_HELPER` | exactly `true` shows the `/talk` page, its landing button and its profile card. Set it only when the backend runs with `ARTHNITI_AI_ENABLED=true` (§10) | the page does not exist: `/talk` shows the not-found page |

Set `VITE_RECORD_RETENTION_DAYS` only to the period after which the organisation actually deletes the records (§4.5). A figure under 365 conflicts with the one-year minimum in Rule 8(3). **Lawyer.**

### 3.3 uvicorn

| Flag | Why |
|---|---|
| `--no-access-log` | uvicorn's access log goes to stdout by default, between the processing-log lines, and carries the client IP address and the query string. In production the app logs a startup warning while it is on. Leave it on only if the organisation wants that record, and send it elsewhere with `--log-config`. With the helper on, the query string holds `?language=` (the language a person said they would speak) on every call to `/api/intake/transcribe` |
| `--no-server-header` | uvicorn sends `server: uvicorn` by default. Measured: the flag removes it |
| `--proxy-headers`, `--forwarded-allow-ips` | only behind a proxy you control. They make uvicorn's own access log record the forwarded client address. The processing log never records an address in any case |
| `--limit-concurrency` | an upper bound on concurrent requests. The app itself sets no rate or body-size limit (D4) |

A production start, from `backend/`:

```bash
ARTHNITI_ENV=production \
ARTHNITI_CORS_ORIGINS=https://app.example.org \
ARTHNITI_TENANT=example-client \
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log --no-server-header
```

### 3.4 Before the first real answer

- [ ] `ARTHNITI_ENV=production`, with `ARTHNITI_CORS_ORIGINS` set to the exact frontend origin.
- [ ] `ARTHNITI_LOG_HASH_KEY` set, and stored with the organisation's other secrets (recommended; §4.3).
- [ ] uvicorn started with `--no-access-log --no-server-header`, behind an HTTPS proxy that sets HSTS, checks the `Host` header, and limits body size and request rate (D1, D2, D4).
- [ ] The frontend built with an `https://` `VITE_API_BASE_URL` and every `VITE_*` notice value set.
- [ ] Open `/privacy` on the built site and read it through. It must name the organisation, the contact, the complaints page and the retention period, and it must not show the demo warning.
- [ ] stdout collected, protected and kept for the agreed period, then deleted (§4.5).
- [ ] S16, the native-speaker review, done for every language that will be offered (§9.1).
- [ ] The contract (C1) signed, and the breach route (C5) agreed.
- [ ] The AI helper is off (`ARTHNITI_AI_ENABLED` unset, `VITE_AI_HELPER` unset), or every item in §10.8 is done.

---

## 4. The processing log

### 4.1 Format

The logger `arthniti.processing` writes one JSON object per line to stdout, one line per request, including 404s, 422s, 500s and CORS preflights. The keys appear in this order:

| Key | Value |
|---|---|
| `event` | always `"request"` |
| `request_id` | a fresh uuid4, as 32 hex characters, also sent back as the `X-Request-ID` response header. An incoming `X-Request-ID` is ignored |
| `ts` | when the request arrived: UTC, ISO 8601, milliseconds, `Z` |
| `tenant` | `ARTHNITI_TENANT` |
| `method` | the HTTP method, or `OTHER` for one the app never serves |
| `path` | the matched route template, or `"unmatched"`. Never the path as the client sent it, and never the query string |
| `status` | the response status. 500 when no response was started |
| `duration_ms` | time taken, to 0.1 ms |

`POST /api/analysis/run` adds two keys:

| Key | Value |
|---|---|
| `consent` | the consent record exactly as validated (§5.3), or `null` when there was none or the request got a 422 |
| `payload_sha256`, or `payload_hmac_sha256` when a key is set | the payload code (§4.3), or `null` on a 422 |

**It never contains:**

- the request body, or any answer in it (the consent record excepted);
- the IP address, the user agent or any other header;
- the query string;
- a 422's detail.

`backend/tests/test_log_privacy.py` sends a marker string in every text field and a distinctive figure in every rupee field, and fails if any of them reaches stdout or stderr.

Startup notes and error summaries go to **stderr**, through the `arthniti` logger. Both loggers have `propagate=False`, so a host's root logging configuration does not copy them elsewhere.

### 4.2 Example lines

These were measured against a live production server (tenant `example-client`, `--no-access-log`). The first is a check that worked; the second is the same request with the consent record missing.

```json
{"event":"request","request_id":"0e6e7928722c48b59912a8fb82099c66","ts":"2026-09-27T10:39:02.027Z","tenant":"example-client","method":"POST","path":"/api/analysis/run","status":200,"duration_ms":4.9,"consent":{"notice_version":"2026-09-27.1","language":"hi","given_at":"2026-09-27T10:00:00.000Z","age_confirmed":null},"payload_sha256":"211a89a1d1fdb7232ee7213016efc77f6bb78b2f6a9f37b5a857136c8b8059bb"}
{"event":"request","request_id":"5987e13101174387b159765291b62aa2","ts":"2026-09-27T10:39:02.043Z","tenant":"example-client","method":"POST","path":"/api/analysis/run","status":422,"duration_ms":0.6,"consent":null,"payload_sha256":null}
{"event":"request","request_id":"fdea8f46a6f14cc8ace157fa56454059","ts":"2026-09-27T10:39:02.044Z","tenant":"example-client","method":"OPTIONS","path":"/api/analysis/run","status":200,"duration_ms":0.3}
{"event":"request","request_id":"d25831de97af41f68cb637369166aef6","ts":"2026-09-27T10:39:02.059Z","tenant":"example-client","method":"GET","path":"unmatched","status":404,"duration_ms":0.4}
{"event":"request","request_id":"84257fd5fb334384b7a6059bc7c39e98","ts":"2026-09-27T10:39:02.074Z","tenant":"example-client","method":"GET","path":"/health","status":200,"duration_ms":0.6}
```

The fourth line was a request for `/docs`. The fifth was `GET /health?name=secret`: the query string is not written.

An unhandled error in the app produces:

- a response with status 500, the body `Internal Server Error` and an `X-Request-ID` header;
- a log line with `"status":500`;
- uvicorn's traceback on stderr.

The services were not audited for answer values in exception messages. Treat stderr as possibly holding personal data.

### 4.3 The payload code

The code lets the organisation show that a particular set of answers was checked, and at what time, without the log holding the answers. It is computed like this:

1. Validate the request against `UnifiedAnalysisRequest`, so that every field of the model is present, defaults included. The ignored fields appear with their defaults, and the rupee figures are floats: `50000` becomes `50000.0`.
2. Remove `consent`.
3. Serialise with `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)` and encode as UTF-8. Text outside ASCII is written as UTF-8 bytes, not as `\u` escapes.
4. Take the SHA-256 of those bytes. When `ARTHNITI_LOG_HASH_KEY` is set, take `HMAC-SHA256(key.encode("utf-8"), bytes)` instead.

In Python: `payload = body.model_dump(mode="json", exclude={"consent"})`. The code is `payload_digest()` in `backend/app/core/processing_log.py`.

The floats are written in Python's shortest round-trip form. No figure within the caps (₹100 crore) reaches exponent notation. A fraction below 0.0001 of a rupee would (`1e-05`). An implementation in another language has to match this.

**Test vector.** The request:

```json
{"business_category":"tailoring","state":"Uttar Pradesh","district":"Lucknow","location_type":"rural",
 "available_capital":50000,"monthly_expenses":12000,"expected_monthly_revenue":30000,"monthly_emi":0,
 "initial_investment":80000,"monthly_operating_expenses":12000,"existing_debt":0,
 "household_monthly_income":40000,
 "consent":{"notice_version":"2026-09-27.1","language":"hi","given_at":"2026-09-27T10:00:00.000Z","age_confirmed":null}}
```

The canonical bytes (one line, 487 bytes):

```
{"available_capital":50000.0,"business_category":"tailoring","customers":"","district":"Lucknow","employees":0,"entrepreneur_type":null,"existing_debt":0.0,"expected_monthly_revenue":30000.0,"household_monthly_income":40000.0,"initial_investment":80000.0,"literacy_level":"low","location_type":"rural","market_type":"","monthly_emi":0.0,"monthly_expenses":12000.0,"monthly_operating_expenses":12000.0,"preferred_dialect":null,"state":"Uttar Pradesh","user_language":"Hindi","village":""}
```

| | Result |
|---|---|
| SHA-256 | `211a89a1d1fdb7232ee7213016efc77f6bb78b2f6a9f37b5a857136c8b8059bb` |
| HMAC-SHA256, key `test-vector-key-not-for-production-use-0001` | `1c5bc2528c433c668bcf9836ff950095e26eeaf81c3cf2c9ef29d633969516e0` |

The recipe above was reimplemented separately from the app's code, and it gives the same bytes and both codes.

**What the code is and is not:**

- **It is pseudonymous personal data. Do not describe it as anything stronger.** The same answers always give the same code, and the answers come from a small space: a category, a state and district, and round rupee figures. So anyone who holds the log can test guesses against a plain SHA-256 code.
- HMAC with a secret key stops anyone who does not hold the key from doing that. It does nothing against anyone who does.
- **Adding a field to the request model changes every code**, including the codes of requests that never used the field. Codes are comparable only between lines written by the same version of the model. Record the software version next to the log retention.

### 4.4 Using the log for evidence and for rights requests

- **Consent evidence.** Each successful check carries the notice version, the interface language, the time the box was ticked, and the age answer when asked. `tools/notice-version.json` and the git history show the exact text for each version (§5.4).
- **Finding one person's lines.** The log holds nothing that identifies a person directly. The frontend does not show the reader the `X-Request-ID`. To find a person's line, recompute the code from answers the person gives again, all 12 of them exactly (with the key, when one is set). Then search for it, narrowed by time.
- **Correction and erasure.** The only server-side copy is the log. There is nothing to correct. Erasing one line means finding it as above. **The software holds no contact detail for anyone**, so it cannot reach a person (C5, C10).

### 4.5 Retention

**The app deletes nothing.** The log is a stream on stdout. Retention, protection and deletion belong to whatever collects stdout: journald, the container runtime, a log shipper or a SIEM.

- Rule 6(1)(e) and Rule 8(3) set a minimum of one year for logs of processing done on a Fiduciary's behalf (Rule 8(3), Illustration Case 2, covers a processor). **Lawyer:** whether that applies to this log, to the access log and to the host's logs, and whether the processor must keep its own copy.
- Protect the log store with access control (Rule 6(1)(b)). Decide whether it is backed up (D6).
- Delete at the end of the period, and put the same period in `VITE_RECORD_RETENTION_DAYS`, so the notice says it.

---

## 5. Consent and the notice

### 5.1 Where the notice appears

- **The short notice.** A few sentences with a link to `/privacy`. It appears at the top of `/login` and `/profile`, before the first field, and again in the consent block on `/finance`, just before the submit button.
- **The full notice at `/privacy`.** It covers who is responsible, what is sent (the 12 fields, listed), what stays on the device, why, what is kept, what the host may log, and the reader's choices. The footer links to it on every page.

Where each item that Rule 3 names appears:

| Rule 3 item | Where |
|---|---|
| an itemised description of the data | `privacy.sentLead` and the 12-item list; `privacy.sentConsent` |
| the purpose | `privacy.whyText` |
| a link to the Fiduciary's website | `VITE_FIDUCIARY_URL` (`privacy.fiduciarySite`) |
| how to withdraw consent | `privacy.choiceStartOver` (this tab), `privacy.choiceRights` (what was sent, through `{contact}`) |
| how to exercise rights | `privacy.choiceRights`, `VITE_GRIEVANCE_URL` |
| how to complain to the Board | `privacy.board` |

**Lawyer:** whether this text, with the organisation's values filled in, is enough. The notice does not state a grievance response period. Rule 14(3) requires one, of no more than 90 days, so publish it on the page `VITE_GRIEVANCE_URL` points to.

### 5.2 Demo mode

With no `VITE_FIDUCIARY_NAME` set, the build runs in **demo mode**:

- Every short notice carries "This is only a demonstration. Use made-up figures, not your real ones."
- `/privacy` says that no organisation has agreed to be responsible for real answers.
- The notices name "the team running this demonstration" in place of an organisation.

Consent is still asked for, and the server still logs as in §4.

Demo mode is the right state for the owner's public demo (D10). It is the wrong state for any real deployment.

### 5.3 The consent record

`/finance` shows an unticked consent box. When `VITE_REQUIRE_AGE_CHECK=true`, an age box is shown as well. Pressing the button with a box unticked sends nothing, shows a message under the box and moves focus to it. The ticks are held only in the page's memory (§2.4). The request then carries:

```json
"consent": {"notice_version": "2026-09-27.1", "language": "hi", "given_at": "2026-09-27T10:00:00.000Z", "age_confirmed": null}
```

| Field | Rule (`Consent` in `backend/app/schemas/analysis.py`, no other keys allowed) |
|---|---|
| `notice_version` | 1–40 characters, `^[0-9A-Za-z.\-]+$` |
| `language` | 2–8 characters, `^[a-z]{2,3}(-[A-Za-z0-9]{2,4})?$`: the interface language the notice was read in |
| `given_at` | ISO 8601 with a date, a time and an offset (`Z` or `+05:30`). It is checked as a real moment and logged as sent. It is the reader's device clock, so it is not a trusted time. The log line's `ts` is the server's time |
| `age_confirmed` | `true`/`false` when the age box is shown, otherwise `null` |

- **The age answer is recorded, not enforced.** The server accepts `false` and `null`. The frontend does block submission until the age box is ticked, when the box is shown. Verifying a parent's consent (Rule 10) is the organisation's job (C7).
- With `ARTHNITI_REQUIRE_CONSENT` on, a request with no record gets a 422 with `loc ["body","consent"]`; a bad field gets `["body","consent",<field>]`. The response never echoes the consent record.
- **The software offers no endpoint for withdrawing consent.**
  - **Start over** removes the answers from this tab, and the notice names it as the control for that.
  - Withdrawing what was already sent goes to `{contact}`.
  - Past log lines are evidence of a check that was done, and withdrawal does not change them. What the organisation does with them on withdrawal is its decision. **Lawyer.**

### 5.4 The notice version

`NOTICE_VERSION` in `frontend/src/config/notice.js` names the text the reader saw, and `NOTICE_KEYS` lists every dictionary key the notices render (60 keys). Check 9 of `node tools/parity4.mjs` hashes two things: those keys' text in all 8 languages, and the order of the "what is sent" list. It fails unless the result equals `tools/notice-version.json`:

```json
{"version": "2026-09-27.1", "sha256": "a2f50d71e7c175be4109768d112e20542ccf86218bdd380e203b9368225f204b"}
```

Changing any notice text without a new version therefore fails the check, and the failure message prints the new hash. Commit `notice.js`, `notice-version.json` and the dictionaries together. Then any `notice_version` in a log line can be traced to the exact wording in git history.

The organisation's own values (`VITE_*`) are not in the hash. Keep a record of the values each build was made with.

---

## 6. CORS

`ARTHNITI_CORS_ORIGINS` is a list of exact origins, the way a browser writes them in the `Origin` header: a scheme, a lowercase host and an optional port.

- **Refused** in both modes, so the server does not start with any of these:
  - `*`;
  - an empty entry;
  - a path or a trailing slash;
  - uppercase;
  - a port with a leading zero, a port of 0 or above 65535;
  - a default port written out (`:443`, `:80`).

  Each of these would either admit every site or never match a real browser.
- Duplicates are removed.
- Production requires `https://` on every entry.
- Credentials are off and the methods are GET and POST. `Content-Type` is the only header allowed beyond the ones browsers always allow. Preflights are cached for 600 s.

CORS stops other websites from calling the API from a reader's browser. It does not stop a script or a server from calling the API directly. The app does not check the `Host` header and sets no HSTS header: the proxy has to (D1, D2).

---

## 7. What the organisation has to do (C1–C11)

| # | Item | What the software provides | What the organisation does |
|---|---|---|---|
| C1 | **Contract** (s. 8(2); Rule 6(1)(f) requires a security term) | this schedule, as the technical annex | **Lawyer** drafts it. **No sale without it.** |
| C2 | **Notice content** (s. 5, Rule 3; contact under s. 8(9) and Rule 9; grievance under s. 8(10) and Rule 14(3)) | the notice text and the `VITE_*` values (§3.2) | supplies the name, website, contact, complaints page and retention period; publishes a grievance response period of no more than 90 days on its complaints page |
| C3 | **Legal basis** (consent, or legitimate use under s. 7(a)) | a consent step and a consent record (§5.3) | **Lawyer.** If the basis is not consent, the notice text changes, with a new notice version |
| C4 | **Naming processors** (s. 11(1)(b)) | with the helper off, the software calls no third party at runtime, and the only other parties are the host, the proxy and any CDN the organisation adds. With the helper on, Meta also receives what a person says or types on `/talk` (§10.6) | names the processor and every host and service in its rights responses, and Meta if the helper is on |
| C5 | **Breach** (s. 8(6); Rule 7) | the software holds no contact detail for anyone. The log's `request_id` and `ts` help date an incident | tells affected people through its own records, and tells the Board within 72 hours. The contract should fix how many hours the processor has to tell the organisation, and what facts it must report |
| C6 | **What is held, and for how long** (s. 8(7); Rule 8(3)) | §2.4 and §4.5 | sets and enforces the retention; checks RBI and other sector retention rules (not checked here). **Lawyer** |
| C7 | **Children** (s. 9; Rule 10) | an optional age box, recorded in the log (§5.3) | decides whether minors may use the tool; runs any verification of a parent's consent |
| C8 | **Shared devices and assisted use** (CSC operators, SHG staff) | Start over clears the tab; the answers never go to `localStorage` | trains staff to press Start over between people. Tells them that the language, dialect, text size and theme carry over to the next person, and that the printed report carries every answer. **Lawyer:** whether a CSC operator is a separate Fiduciary or a processor |
| C9 | **Using the output in a decision** (s. 8(3)) | guidance, not a credit decision. The household income is self-reported (`ch.householdEstimate`). No scheme eligibility rule is checked | does not treat the output as verified data, or as a lending decision |
| C10 | **Rights requests and nomination** (ss. 11–14; Rule 14) | nothing held except the logs (§4.4) | answers requests from its own records, and searches the logs as in §4.4 |
| C11 | **Significant Data Fiduciaries** (Rule 13) | this schedule, as input to a DPIA | runs the DPIA and the audits if it is in that class |

---

## 8. Deployment and hosting (D1–D10)

| # | Item | State in the code | What the deployer does |
|---|---|---|---|
| D1 | **TLS** (Rule 6(1)(a)) | a production build refuses a non-`https://` API address; production CORS accepts `https://` origins only | serves the frontend and the API over HTTPS, and sets HSTS at the proxy. The app sets no HSTS header |
| D2 | **Origins and hosts** | an exact origin list, credentials off (§6) | checks the `Host` header at the proxy. The app has no TrustedHost check |
| D3 | **Access logs** (Rule 6(1)(c), (e); Rule 8(3)) | the app's log has no IP address; uvicorn's access log is off with `--no-access-log` | decides whether the proxy keeps IP addresses and for how long, and protects those logs. **Lawyer:** whether an IP address is personal data here, and the retention |
| D4 | **Abuse limits** | none on the analysis route. The 20-second timeout in the browser protects nothing on the server. With the helper on, its two routes have an hourly call limit per process and a spend cap (§10.7). Those bound the cost and not the traffic: the routes have no sign-in and no limit per person | sets body-size, rate and concurrency limits at the proxy (and `--limit-concurrency`). With the helper on, limits the intake routes harder, because each call can cost money |
| D5 | **Hosting location** (s. 16) | no requirement in the code | chooses the region. **Lawyer**, with the sector's rules: whether any country is notified, and whether hosting must be in India |
| D6 | **Access and backups** (Rule 6(1)(b), (d)) | the only state is the logs | limits who can read the servers and the logs; decides whether logs are backed up, and for how long |
| D7 | **One instance per organisation, or shared** | `ARTHNITI_TENANT` labels each line; it does not separate storage | runs one instance per organisation (recommended), or separates the logs downstream by `tenant` |
| D8 | **Hardening** | production mounts 2 routes and no API docs (§3.1), or 4 routes with the helper on (measured with a stand-in model client: `/health`, `/api/analysis/run` and the two `/api/intake` routes answer, and the other routers and `/docs` return 404) | starts uvicorn with `--no-server-header` and `--no-access-log` |
| D9 | **The data.gov.in key** | used only by `tools/fetch-market-data.mjs` on the owner's machine. The backend never reads it | never deploys it. It is not needed at runtime |
| D10 | **The owner's public demo** | demo mode (§5.2); no answer is logged; `/login` asks only for a name | the owner, as Fiduciary, keeps the demo in demo mode and keeps its logs to the minimum |

---

## 9. Open items

### 9.1 S16: the translations need review (blocks shipping the non-English notice)

**No native speaker has reviewed the non-English text.** The notice is shown in 8 languages: English, Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi and Bengali. Consent has to be informed, so a notice in a language the organisation offers has to say what the English says.

- Before an organisation offers a language, a native speaker has to review all 60 `NOTICE_KEYS` in it. That is 420 strings across the 7 non-English languages.
- A corrected text needs a new notice version (§5.4).
- Until a language is reviewed, offer only the languages that have been.
- Two real errors have already been found by eye elsewhere in the translations.

### 9.2 S17: the market-data fetch (deferred to the next refetch)

The shipped market data is aggregated: mandi price medians and Udyam registration counts per district, with counts under 10 suppressed. It holds no record about any person.

The Udyam fetch (`tools/market-lib.mjs`) does three things:

- it refuses personal fields;
- it asks data.gov.in for only the fields it needs;
- it reads only two of them (`LG_DT_Code`, `Activities`).

**Nobody has checked that the server returns only the fields requested.** The fix is small: throw if a returned record carries any other key.

It is deferred because `market-lib.mjs` and `fetch-market-data.mjs` are frozen. Their SHA-256 is recorded as `provenance.script_sha256` in every market row, and editing either one without refetching would make that record false. The fix goes in with the next refetch.

The fetch runs offline on the owner's machine and never in a deployment. **Lawyer:** whether the exemption for publicly available data in s. 3(c)(ii) covers it.

### 9.3 Lawyer items

- the contract (C1);
- the legal basis (C3);
- whether the processor must keep data or logs itself, and for how long (Rule 8(3), S7, D3);
- whether an IP address in a host or proxy log is personal data here (D3);
- a retention period under 365 days against Rule 8(3) (§3.2);
- the s. 3(c)(ii) exemption for the market fetch (S17);
- whether a CSC operator is a Fiduciary or a processor (C8);
- whether the SPDI Rules 2011 apply before May 2027;
- the commencement date, 13 or 14 May 2027 (§1);
- who counts as the household for an unmarried adult. The household check follows the RBI Master Direction on microfinance loans (2022), and this definition is our own reading of it;
- whether age should be enforced rather than recorded (C7);
- the hosting location (D5);
- whether the processor has direct duties, or only duties through the contract. s. 8(1) puts responsibility on the Fiduciary, but Rule 6(1) and Rule 8(3) Case 2 reach the processor;
- if the AI helper is switched on (§10): Meta as a further processor of what a person says or types, sent outside India; the term in Meta's free-credit programme that lets Meta use that content to improve its products; and whether the helper needs its own consent text, since the versioned notice does not mention it (§10.5, §10.6).

### 9.4 Other known limits

- **No rate, body-size or concurrency limit** in the app, **no `Host` check** and **no HSTS**. These belong at the proxy (D1, D2, D4).
- **The app deletes no log** (§4.5).
- **stderr tracebacks** may carry values from an exception message (§4.2).
- `server: uvicorn` is sent unless `--no-server-header` is passed.
- A browser that restores tabs may restore the `sessionStorage` copy after a restart (§2.4).
- The household income and every other figure are self-reported, and nothing is verified (C9).
- The runtime check of the error banner does not inspect the POST body. The static test in §2.2 covers what is sent.
- **The helper's wording is outside the versioned notice, and `/privacy` does not mention the helper** (§10.5).
- **The helper's two routes have no sign-in, no server-side consent record and no limit per person** (§10.5, §10.7).

---

## 10. The optional AI helper (Meta Model API)

Added on 26 and 27 October 2026 for the Meta Global AI Developer Hackathon (`docs/HACKATHON.md`). **It is off by default, and sections 1 to 9 describe the software with it off.** Everything in this section applies only when both switches in §10.1 are on.

### 10.1 What it is

The `/talk` page lets a person say or type a few sentences about their business instead of answering the form's questions one at a time. It makes two calls, both through this backend:

1. **Speech to words:** `POST /api/intake/transcribe?language=<code>`. The backend sends the recording to Meta's speech model (`muse-voice-transcribe-1.0` by default) and returns the words.
2. **Words to candidate answers:** `POST /api/intake/extract`. The backend sends the words to Meta's language model (`muse-spark-1.3` by default) and asks for the form answers it can find in them.

A third call comes from the plan card on `/advisory`, and only after the person ticks the card's own box:

3. **Wording for a plan:** `POST /api/advisor/plan`. The backend runs the analysis again from the answers, sends Meta's language model a description of the result with no figure, state, district or name in it (§10.2), and gets back wording with `{{blanks}}` where the figures belong. The server puts the rules' own figures and scheme names into the blanks. It refuses a reply with a digit in any script, a number written as a word, a link, an abbreviation, a symbol, the wrong script or a blank it was not given, tries once more with the reasons, and otherwise answers 502 and shows no plan. The card labels the plan as AI-written. **No code checks that a plan is wise, or that a non-English plan is good Marathi or good Tamil.** A scheme's name inside it is the English name from the scheme file.

The helper computes no figure and writes no advice. The result, the schemes and the advice come from the same fixed rules as when the answers are typed; the plan only words what the rules already decided. It does not look for the name or the business name, which stay in the tab (§2.3).

The server keeps an answer from the model only if all of these hold:

- its field is one the helper may fill;
- its value is the right kind and in range (a kind of work from the fixed list; money a whole number from 0 up to the cap; a household income of 0 is dropped);
- its quote is really in the person's words;
- when the quote is only a number, the number equals the value.

Everything else is dropped and counted. The page shows each answer with the person's own words beside it, and only the answers the person ticks go into the form. **A spoken amount that the model converted ("1.5 lakh" to 150000) is checked only by the person reading it.** No code checks the conversion.

There are two switches, and both are off by default:

| Switch | Set in | With it off |
|---|---|---|
| `ARTHNITI_AI_ENABLED=true` | the backend environment (§3.1) | the intake routes and the plan route are not mounted and answer 404. The page shows `talk.errUnavailable` ("The helper is not available right now…") |
| `VITE_AI_HELPER=true` | the frontend build (§3.2) | `/talk`, its landing button and its profile card do not exist, `/talk` shows the not-found page, and `/advisory` has no plan card |

### 10.2 What is sent to Meta

The browser never contacts Meta. The backend calls `https://api.meta.ai/v1` with the key in an `Authorization` header, so Meta sees the server's address and not the person's.

| Call | What goes to Meta |
|---|---|
| Speech | the recording as a WAV (mono, 16-bit, 16 or 24 kHz, at most 3,000,000 bytes; the page stops recording at 60 seconds). The spoken language's name, for example "Hindi", as a hint. 15 fixed words that help it hear numbers and places (`lakh`, `crore`, `EMI`, `rupees`, `Lucknow`, `Varanasi`, `Uttar Pradesh` and the eight kinds of work). The model name |
| Words | one message of our fixed instructions, which names the spoken language. One message holding the person's words (1 to 2,000 characters). A fixed JSON schema for the reply. The model name, `reasoning_effort` set to `low`, a cap of 4,000 output tokens and a `prompt_cache_key` of `form_answers` |
| Plan | one message of our fixed instructions, which names the language to write in and lists the blanks the plan may use, each with a fixed meaning (a scheme blank says who runs the scheme and what kind of help it gives, never its name). One message holding: the kind of business, as one word from our own list and never what the person typed; whether it is in a village, a small town or a city; the rules' verdicts, as fixed sentences; and the rules' own advice sentences, with any sentence that holds a digit left out. On a second try, a fixed hint for each check the last reply failed. A fixed JSON schema for the reply. The model name, `reasoning_effort` set to `low`, a cap of 8,000 output tokens (the model's reasoning counts against it) and a `prompt_cache_key` of `business_plan` |

Nothing else is sent: not the other answers, not the name, not the consent record and not the person's IP address. The plan call sends no figure, no state or district, no scheme name and nothing the person typed. **For the speech and words calls, the person can say or type anything.** The page asks them not to say a name, phone number or bank details (`talk.sendsText`), and nothing checks that they do not.

### 10.3 What is held

| Where | What | How long |
|---|---|---|
| Backend memory | the recording and the words; for a plan, the answers, the description sent to Meta and the reply | one request. None of it is written to disk or to a log |
| Spend file, `ARTHNITI_AI_SPEND_FILE` (default `backend/.ai_spend`, git-ignored) | one line per model call: a whole number of millionths of a dollar, the call's worst-case price. No words, no key, no identity | until someone deletes it. The app deletes nothing |
| `/talk` page memory | the recording until it is sent, the words (editable), the answers found | until the person leaves the page |
| Browser `sessionStorage` | the answers the person ticked, as any other answer, and the names of the fields the helper filled (`aiFilled`); beside the result, the answers it was made from (`request`) and the plan, if one was written | as in §2.4. Editing an answer on the business, location or finance page clears the result, the request and the plan |
| Meta | Meta decides | Meta decides |

What Meta's public pages and the account's billing page said when read on 26 October 2026. **The deployer must check it against the terms that apply to the deployer's own account:**

- In Standard mode, content is not used to train models. The helper refuses a model whose name ends in `-contributor`, because those allow training (`backend/app/core/settings.py`).
- The billing page for the free-credit programme said that content sent while free credits are in use "may be used for product improvement". `talk.sendsText` tells the person this. It no longer applies once the credits are not in use.
- Meta's pricing and speech pages mention zero data retention. They do not say how to ask for it, and **the app does not ask for it.**
- Prompt caching is automatic. The app sends a cache key and does not set a retention period. Meta says the actual retention is managed on its side.

### 10.4 What is logged

- **The processing log** (§4) writes its same eight keys for the three routes. `path` is the route template, never the query string. It holds no recording, no words, no answer and no consent record, and these routes compute no payload code. `backend/tests/test_intake_log_privacy.py` and `test_advisor_log_privacy.py` send a marker through every route and every error path (for the plan route, in every answer, with a consent record among them) and fail if the marker, or the model's own words, reach the log, an error body or the description sent to Meta.
- **stderr:** one WARNING from the logger `arthniti.errors` for a failed model call, holding the kind of failure and the HTTP status. Meta's error message is not kept. A plan that failed the checks adds one WARNING per try, holding only the codes of the checks it failed (`digit`, `missing`), never a word of the reply.
- **The uvicorn access log** (§3.3) holds the client IP address and the query string, so it holds `?language=` for every call to `/api/intake/transcribe`. `--no-access-log` turns it off.
- **Startup:** one INFO line when the helper is on, with the model names, the hourly limit, the cap and the spend-file path. Never the key.

### 10.5 Consent, notice and who may use it

- `/talk` has its own consent box, kept in page memory only, and an age box when `VITE_REQUIRE_AGE_CHECK` is set. Pressing **Record** or **Find my answers** with a box unticked sends nothing, says why and moves focus to the box. The buttons are not disabled, so the reason can be seen.
- The `/talk` wording (`talk.*` in `resultStrings.js`) is **outside the versioned notice** (`NOTICE_KEYS`). Editing it does not change `NOTICE_VERSION`.
- **`/privacy` does not mention the helper.** A deployer who switches the helper on has to add that and bump `NOTICE_VERSION` (§5.4).
- The plan card on `/advisory` has its own box, kept in page memory only and unticked again after every plan. The plan route refuses (422) a request whose `send_to_meta` is not a real `true`; it cannot tell whether a person ticked a box or a script set the field.
- The three routes take and keep **no consent record**, so the server cannot tell whether a box was ticked. They do not see the age box either.
- The seven non-English `talk.*` sets, including the sentence about Meta, have not been reviewed by a native speaker (§9.1). The same holds for the `plan.*` sets, which include the sentence that says what the plan card sends.
- The `plan.*` wording is also outside the versioned notice.

**Lawyer:** whether the helper needs consent text of its own, in what words and in which languages.

### 10.6 Meta as a further processor, and the transfer abroad

With the helper on, Meta receives a person's voice and words. For the deployer, Meta is a further processor, and the data leaves India. This schedule does not say whether either is allowed.

**Lawyer:** the contract with Meta; the term in the free-credit programme that lets Meta use that content to improve its products; the transfer outside India.

### 10.7 Cost and abuse controls

The key pays for every call. These controls bound the cost. None of them identifies or limits a person.

| Control | What it does | What it does not do |
|---|---|---|
| Spend cap, `ARTHNITI_AI_SPEND_CAP_USD` (default 10, at most 100) | Before each call it adds the call's worst-case price to the spend file, and it refuses the call (503) if the total would pass the cap. A failed call is still charged. A model missing from the price table is priced at the dearest known rate. A spend file that cannot be read stops the start, and one that cannot be read or written later refuses every call | It bounds this app only. It does not read Meta's real bill. Several worker processes can each overshoot by one call. Deleting or editing the file resets the total |
| Hourly limit, `ARTHNITI_AI_HOURLY_LIMIT` (default 100, 1 to 100,000) | Counts calls over a sliding hour and answers 429 with `Retry-After` beyond it | It lives in process memory, so a restart resets it and each worker has its own. CORS does not expose `Retry-After` to the browser |
| Size limits | A recording over 3,000,000 bytes gets 413. Words over 2,000 characters get 422 | |
| Meta's own spend limit | An email alert | It does not block anything |

- There is no sign-in and no limit per person.
- No `safety_identifier` is sent. Meta recommends one so that it can act against a single end user. Without it, misuse by one visitor can be acted on against the whole key. The app has no per-person identity by design.
- `python -m app.smoke_meta` makes two language-model calls and one speech call (one second of silence) and records **$0.0451** against the cap. That is a worst-case figure. One language-model call is priced at about 2 to 3 cents against the cap, so the default $10 allows a few hundred.
- `python -m app.smoke_meta --plan` makes two plan calls (English and Hindi). Measured on 27 Oct 2026 it recorded **$0.0797** against the cap, took 10.6 s and 11.9 s, and used 1,001 tokens in and 2,357 and 2,514 out, most of the output being reasoning. At the prices in the app's table that is about 1.1 to 1.2 cents of real cost a plan, so the cap books roughly three and a half times the cost. A plan call is the longest and dearest the app makes, and a plan that fails the checks is tried once more, so one request can book two calls against the cap.

### 10.8 Before switching it on

- [ ] The lawyer has answered §10.5 and §10.6.
- [ ] `MODEL_API_KEY` is in the server's environment only: never in a `VITE_*` variable, a file in the repository or a command line. Type it with `read -rs MODEL_API_KEY` and not `export MODEL_API_KEY=…`, so it does not land in the shell history.
- [ ] `ARTHNITI_AI_SPEND_CAP_USD` is an amount the deployer can afford to lose, and `ARTHNITI_AI_SPEND_FILE` is an absolute path on a disk that survives a restart.
- [ ] uvicorn runs with `--no-access-log` (§3.3).
- [ ] `/privacy` mentions the helper and `NOTICE_VERSION` is bumped (§5.4).
- [ ] Every `talk.*` language that is offered has been reviewed by a native speaker (§9.1).
- [ ] The proxy limits the two intake routes and the plan route harder than the rest (D4), because the app has no sign-in.
- [ ] `python -m app.smoke_meta` and `python -m app.smoke_meta --plan` have each run once with the production key, and the spend file holds the total that was printed.
- [ ] Meta-side alerts are set, and Meta has been asked whether zero data retention can be switched on for the account.
- [ ] `VITE_AI_HELPER=true` is set at build time, last.

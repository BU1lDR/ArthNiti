# `tools/` — the verification suite

31 zero-dependency `.mjs` files (`ls tools/*.mjs tools/verify/*.mjs | wc -l`), and
one Python helper, `verify/talk_fake_backend.py`.
The verifiers check things `npm run lint`, `npm run build` and `pytest`
structurally cannot see: a leaked translation key, a `null%`, a page that
scrolls sideways under a thumb, a `₹30,000` that wrapped as `₹30,00 / 0`, a logo
that prints invisible, a transition that silently does nothing, a route that opens
halfway down the page, a footer column whose heading starts 50px below its
neighbours'.

Not all 31 are gates. Counted by class:

| Class | Count | Scripts |
|---|---|---|
| **Gates**: exit 1 on a finding, 2 when they could not measure | 21 | `parity4`, `keycheck`, `market-lib-test`, `talk-lib-test` and `app-state-test` (the three via `node --test`), `drive`, `mobile-audit`, `lang-layout`, `field-align`, `print-audit`, `motion-audit`, `scroll-audit`, `text-align`, `hero-art`, `brand-mark`, `manual-audit`, `error-banner`, `market-ui`, `figure-audit`, `load-perf`, `talk-ui` |
| **Report-only verifiers**: exit 0 whenever they measured and 2 when they could not; a person reads the output | 3 | `glyph-audit` (expect exactly 3 hits), `hero-geom` (measurements, no findings), `hero-vibrance` (a tuning instrument: its verdict column rates candidate filters and is not a finding) |
| **Helpers**: not gates | 6 | `refresh-cases` (fixture generator), `art-contrast` (retired, exits 2), `assetgen` and `svgcheck` (asset tools), `fetch-market-data` (data fetch), `third-party-notices` (writes `THIRD_PARTY_NOTICES.md`) |
| **Library**: not run directly | 1 | `market-lib` |

`svgcheck` does exit 1 on an SVG the browser refuses, and 2 when it could not
check. It is listed as a helper because it checks image files, not the app. It
asks git which files to check instead of carrying a list (see "Helpers" below).

They lived in `screenshots/` until 9 September 2026 and so were **absent from every
fresh clone** — `screenshots/` is gitignored, because it is 8.1 GB of Edge profile
directories and PNGs. The scripts were 317 KB of that. They now live here, tracked;
`screenshots/` stays ignored and holds only what they write.

## Exit codes

The gates and the three report-only scripts share three exit codes, and each
means one thing:

| Exit | Means |
|---|---|
| 0 | it measured and found nothing. A report-only script exits 0 whenever it measured |
| 1 | a finding. Under `--broken` a 1 is the pass, and 0 cannot happen |
| 2 | it could not measure. The message on stderr, or `faults` in `report.json`, says why. A 2 is never a finding and never a pass |

Each script's header comment lists its own causes of a 2. Across the suite they
fall into four groups.

**Before anything is measured.** All of these are checked before Edge starts:

- the wrong working directory (see "Before you run anything");
- an argument that does not parse: `field-align`'s `--sweep=` or `--case=`,
  `figure-audit`'s `--broken=` naming a refuter it does not have, `mobile-audit`'s
  `--out=` naming a folder that does not start with `mobile`;
- a server that is down or answers anything but a 2xx, with a 5 s limit: Vite, or
  the copy `--url=` names; the backend as well for `error-banner` and
  `scroll-audit`, which also exit 2 if the backend refuses the CORS preflight a
  browser would send from the app's origin; the preview on 4173 for `load-perf`.
  `figure-audit` asks the backend for its four cases, 20 s each;
- a port already held: 9333 for `mobile-audit`; 5179 or 9373 for `market-ui`, or
  its own Vite never coming up; 8012, 5182 to 5184 or 9379 for `talk-ui`, or its
  own backend or Vite never coming up;
- a seed version `AppContext.jsx` no longer reads, in the nine gates that seed
  `sessionStorage` (see "Seed versions" below);
- an input that is not there: a `case_*.json`, `market-lib.mjs` for `market-ui`,
  a dictionary `load-perf` cannot read in all 8 languages.

**During the run:**

- a crash: anything thrown or rejected that nothing catches. Node's own exit for
  that is 1, which reads as a finding, and under `--broken` as the pass;
- a server lost mid-run: a navigation that fails outright, or a page that is
  Edge's own error page or answered outside 2xx. The backend is the other
  server: `scroll-audit` reports `NO-BACKEND` when its `/finance` submit goes
  unanswered or gets a 5xx, and `error-banner` faults when a case's request is
  still waiting at the 6 s mark, when `validation`'s request gets no answer or an
  answer other than a 422, or when `offline`'s request is answered although the
  route is blocked;
- Edge lost: its DevTools port never opening, or its socket closing under the run;
- a run that ends before its verdict. Each script sets `process.exitCode = 2`
  first thing, and only the verdict changes it.

**A page that measured nothing:**

- `UNSEEDED`, a page that does not hold its seed: a result route showing its
  empty state, in the seven gates that seed a result (`figure-audit`,
  `lang-layout`, `mobile-audit`, `motion-audit`, `print-audit`, `scroll-audit`,
  `text-align`) and in `market-ui`; a `/finance` box without its seeded value in
  `error-banner`; a page whose language or text size is not the case's in
  `field-align`, and whose theme or language is not the case's in `print-audit`
  (with both `localStorage` keys renamed it used to print every dark case light
  and every English case in Hindi, and exit 0);
- `NOT-RENDERED` (`field-align`, `lang-layout`, `market-ui`, `mobile-audit`,
  `motion-audit`, `print-audit`) and `NOT-MOUNTED` (`figure-audit`, `text-align`):
  `#main` never filled;
- a target that is not on the page: `ABSENT` (`motion-audit`), `BLOCK`
  (`print-audit`), `NO-CONTROL` (`scroll-audit`), `MISSING` (`figure-audit`,
  `error-banner`, `mobile-audit`), `BLOCK-FAILED` (`mobile-audit`), `NO-BASELINE`
  (`lang-layout`), and the elements `hero-art`, `hero-geom`, `hero-vibrance`,
  `brand-mark` and `manual-audit` measure;
- a probe that compared nothing: `INERT` in `scroll-audit` and `text-align`,
  `PROBE` in `print-audit` (a colour it cannot read, a hide list it cannot find
  or that disagrees with the markup, a class no case renders; see "`print-audit`,
  `motion-audit`, `hero-art` and `brand-mark`" below).

**A refuter that missed:** a `--broken` run whose planted defect went unreported,
in `figure-audit`, `field-align`, `market-ui`, `motion-audit`, `scroll-audit` and
`text-align` (see "When a new check reports zero").

Some gates draw the line elsewhere, on purpose:

- `drive`: a page whose `#main` never filled is `BLANK`, a finding, unless it is
  Edge's error page or answered outside 2xx, which is a 2;
- `load-perf`: an app that does not mount is a 1. Its timings are a report, never
  a finding;
- a page that threw but rendered is a finding, `PAGE-ERROR`, in `lang-layout`,
  `mobile-audit` and `figure-audit`. One that never rendered is a 2 whether or not
  it threw;
- `print-audit`: a block in the DOM that has no box under print is `HIDDEN`, a
  finding. A block that is not in the DOM at all is `BLOCK`, a 2;
- `manual-audit`: a click that does not open the dialog, and a focus trap that
  does not let go, are findings: they are the behaviour under test;
- `motion-audit`: `INERT`, a transition that is declared and never runs, is a
  finding. In `scroll-audit` and `text-align`, `INERT` is a probe that compared
  nothing, a 2;
- `field-align`: the `WARNING` that no row had questions of unequal height, so
  `MISALIGN` had nothing to find, leaves the exit alone: the run did measure;
- `market-ui`: 130 when stopped by a signal, after its cleanup.

Three are narrower:

- `parity4` only reads files. An input only a comparison needs (`schemes.json`,
  `notice.js`, `languages.js`, `tools/notice-version.json`) that is missing or
  unreadable fails the check that needs it, a 1. A dictionary it cannot read, a
  `--root=` holding no dictionaries, or the wrong directory is a 2.
- `keycheck` exits 2 on any input it cannot read or parse, and when
  `backendText.js` no longer declares a map it checks against (`CATEGORY_KEYS`,
  `LEVEL_KEYS`, `COMMODITY_KEYS`).
- `market-lib-test` runs under `node --test`, which exits 1 for a failing test and
  for a crash alike. Read its output to tell the two apart.

**`report.json`.** Once a script has checked its working directory (and
`mobile-audit` its `--out=`), it deletes the last run's `report.json` before
anything else can fail. It writes the new one only at its verdict, with `"exit"`
as the first key, equal to the exit code. So a report on disk is always from a
run that reached its verdict, and it never reads as a pass for a run that could
not measure. A fault the run recorded and carried on from (`UNSEEDED`,
`MISSING`, a refuter that missed) is written as `"exit": 2`. Where it puts the
reason differs by script:

- a `faults` list: `error-banner`, `field-align`, `manual-audit`, `market-ui`,
  `print-audit`;
- entries of a fault kind in `findings`, where the kind is the reason and a `note`
  or `why` adds detail: `motion-audit`, `scroll-audit`, `text-align`, and
  `lang-layout` (in each row's `findings`);
- fields on each row of `report`: `figure-audit` (`rendered`, `seeded`,
  `missing`) and `mobile-audit` (the same, and `blockError`);
- stderr only: `load-perf` prints `FAULT <label> run <i>: …` and counts it.

A run stopped by a thrown fault (a crash, a failed navigation, a closed socket, a
closed pipe) leaves no report. Five scripts differ: `drive` writes no report when
it exits 2; `hero-geom` and `hero-vibrance` write one only when they measured, so
theirs always reads `"exit": 0`; `hero-art` and `brand-mark` write none, and
their exit code is the whole verdict.

**Why a crash waits a second before it exits.** On Node 24.18.1 on Windows,
`process.exit()` within about 100 ms of a `fetch()` reading its response can kill
node with `0xC0000409`, which Git Bash shows as 127: neither 0, 1 nor 2. V8's
dynamic tiering recompiles undici's WASM HTTP parser (llhttp) on a worker thread,
and the finished job signals a libuv handle that the exit is closing. Measured on
30 Sept 2026 with a probe in the shape of a pre-flight check: one request
answered 200, one answered 503, then the exit. 20 runs per row unless stated:

| How the probe exits | Result |
|---|---|
| `process.exit(2)` at once | 127 in 20 of 20 |
| a blocking wait (`Atomics.wait`) of 0, 1, 5 or 20 ms, then `process.exit(2)` | 127 in 20 of 20, for each |
| a blocking wait of 50 ms | 2 in 19, 127 in 1 |
| the same 50 ms, from the crash handler | 2 in 14, 127 in 6 |
| a blocking wait of 100 or 250 ms, and 250 ms from the crash handler | 2 in 20 of 20, for each |
| `process.exitCode = 2`, and `main()` returns | 2 in 30 of 30 |
| `process.exit(2)` at once, after only the 503 request | 2 in 20 of 20 |
| `process.exit(2)` at once, after the 200 and a refused connection | 2 in 10 of 10 |

`--no-wasm-dynamic-tiering` and `--liftoff-only` stop it; `--no-wasm-tier-up` and
`--no-concurrent-recompilation` do not. The first version of the pre-flight
checks, on 30 Sept, called `process.exit(2)`: with a backend answering 503,
`error-banner`, `scroll-audit` and `figure-audit` each exited 127. So a pre-flight
check now sets `process.exitCode = 2` and returns, and `main()` returns before
Edge starts. The crash handlers call `crashExit()`, which blocks the thread for
1 s with `Atomics.wait` and then exits 2. **Never add a bare `process.exit()` just
after a `fetch()`.**

**Why every script starts by setting a 2.** A CDP call waits on a promise that
its reply settles. When Edge went away mid-run, the socket closed, no reply came,
and the promise never settled. Nothing else held the event loop open: the timers
the scripts use are unref'd, and so are idle sockets. So node drained the loop and
exited 0, leaving no report, as though the run had finished. A `send()` on the
closed socket did not throw either. `svgcheck` exited 13, node's code for an
unsettled top-level await, or hung. Now each script's CDP client rejects every
pending call when the socket closes and refuses to send on a socket that is not
open. A catch that forgives a failed evaluate (a poll between two documents)
rethrows once the socket is closed. Behind that, `process.exitCode = 2` covers
anything that still drains the loop. Measured on 30 Sept 2026 with Edge killed by
PID mid-run: all 15 browser gates and `hero-geom` exited 2 and left no report.

**A revalidated page reads 200.** The fault checks read `responseStatus` from the
page's navigation timing entry. Measured on 30 Sept 2026: for a page Vite
answered with a 304 (a 300-byte transfer), Edge reports 200, so no exemption for
304 is needed. A `responseStatus` of 0 means the browser does not know, and is
not a fault.

Until 30 Sept 2026 only eleven gates exited 2, and only for the seed, `UNSEEDED`,
`--broken` and `figure-audit` faults. Anything else a run could not measure exited
1. From the wrong directory, every gate but `market-lib-test` exited 1, and five
scripts wrote Edge profiles there. With no server up, ten of fourteen browser
gates exited 1. `load-perf` took 58 s to do it, and `scroll-audit` and
`text-align` over 40 s to exit 2. `motion-audit`, `text-align` and `load-perf`
each wrote a `report.json` for that run. `market-ui` hung for 300 s, printing
nothing, on a port 5179 held by a listener that never answered.

**Re-measured on 26 Oct 2026**, after a review of the 30 Sept changes and the
fixes it led to. Each row is a number of runs of the gates and what they exited
with. The situation was made on purpose, and a server or Edge was stopped by its
PID, never by image name:

| Situation | Runs | Result |
|---|---|---|
| plain run, servers up | 21 | all exit 0 |
| `--broken` | 9 | all exit 1 |
| a bad argument | 9 | all exit 2, in 0 s |
| `mobile-audit` with its port 9333 held | 1 | 2 in 2 s |
| a 503 on `drive`'s port 9222 | 1 | 2 in 24 s |
| Edge killed by PID mid-run | 18 | 15 exit 2 in 7 to 20 s; `hero-art`, `brand-mark` and `svgcheck` had finished and exited 0 |
| Vite killed mid-run | 16 | 13 exit 2 in 9 to 20 s; `hero-art`, `brand-mark` and `hero-vibrance` had finished and exited 0 |
| Vite holding its port and never answering | 15 | all exit 2, in 5 to 6 s |
| Vite answering 503 | 15 | all exit 2, in 0 to 1 s |
| backend down / silent / 503 | 4 / 3 / 3 | exit 2 in 0 to 1 s / 5 s (`figure-audit` 21 s) / 0 to 1 s |
| backend with a CORS list that leaves the app out, or in production | 6 | `error-banner` and `scroll-audit` exit 2 in 1 s or less; `figure-audit` exits 0 in 63 to 64 s, because it posts from node |
| no server at all | 21 | all exit 2, in 0 to 1 s |
| wrong working directory | 23 | 22 exit 2 in 0 to 1 s with the old report untouched; `glyph-audit` exits 0 |
| `load-perf`: plain / Edge killed / preview killed | 3 | 0 in 55 s / 2 in 16 s / 2 in 17 s |

The exit-0 runs under a kill are not defects. `hero-art`, `brand-mark` and
`svgcheck` last 2 to 3 s and had finished when the harness killed Edge, and the
kill that landed on `hero-art` and `brand-mark` in the Vite row came as they
ended. `hero-vibrance` loads the landing page twice and then measures in that
page, so a Vite lost after the second load changes nothing for it. A kill that
lands while they run does give 2: Edge killed as soon as it
appeared, `hero-art` and `brand-mark` exit 2 in 3 s; `svgcheck`, slowed to hold
Edge for 6 s, exits 2 in 5 to 8 s whether the socket dies idle or inside a
`Runtime.evaluate`. `load-perf` with a silent listener on 4173 exits 2 in 5 s, and
`market-ui` with 5179 held exits 2 in 0 s.

**What is still slow or unbounded.** None of these gives a wrong code, but each is
a wait you can hit:

- **A listener on a gate's DevTools port that accepts and never answers.** The 18
  browser scripts other than `assetgen` poll `/json/version` up to 80 times, each
  try bounded at 2 s with 250 ms between, so a silent port holds them for about 3
  minutes before exit 2. Measured on 26 Oct 2026 with a silent listener on each of
  9363, 9378 and 9337: `load-perf` 184 s, `svgcheck` 183 s, `hero-art` 183 s, all
  exit 2, `load-perf` leaving no report. With nothing listening, the same loop run
  on its own gave up after 21.0 s. Only `mobile-audit` checks first whether its
  port already answers (2 s, in the table above). `assetgen`'s tries have no bound
  of their own.
- **No call to the browser has a timeout of its own.** A `Runtime.evaluate` on a page
  that stops answering waits for the script's own loop or your `timeout` to end it.
  A socket that closes rejects every call still pending, so a killed Edge is not
  this case.
- **A page that renders blank** makes the gates that load many pages wait out the
  render timeout on each one. Measured on 30 Sept 2026, before the fixes above and
  not repeated since: `field-align` 1,152 s, `market-ui` 956 s, `mobile-audit`
  511 s, `figure-audit` 356 s and `error-banner` 239 s to exit 2.
- **`assetgen` has no working-directory check.** It resolves its output paths
  against wherever it is started.

## Before you run anything

| | |
|---|---|
| **Node** | 24 or newer. The browser drivers use a **global `WebSocket`**, which is what makes them dependency-free. On Node 22 they fail with `WebSocket is not defined`. |
| **Edge** | All 20 browser scripts hardcode `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` and speak Chrome DevTools Protocol to it. Nothing is installed for you. `drive`, `figure-audit`, `mobile-audit`, `market-ui` and `talk-ui` also find their own Edge with PowerShell's `Get-CimInstance Win32_Process`. So **the browser scripts run on Windows only**, and none of them is in CI. |
| **Working directory** | **Always the repo root.** Every path in every script resolves against `process.cwd()`, not against the script's own location. `cd tools && node verify/drive.mjs` will not work: from anywhere else every browser script but `assetgen` stops at once with exit 2 and says so, touching nothing, and so do `parity4` and `keycheck`. `assetgen` has no such check. Three exceptions resolve their paths from their own location and so run from any directory: `fetch-market-data.mjs`, `verify/glyph-audit.mjs` and `verify/market-lib-test.mjs`. |
| **Servers** | Most need one up. See the table below — starting the wrong one silently measures the wrong thing. |

```bash
# from the repo root, in two terminals
cd backend  && ../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
cd frontend && npm run dev      # Vite, port 5173
```

## On a fresh clone, run these in order

The fixtures the browser drivers seed `sessionStorage` from are **deliberately not
tracked** — they are backend-derived and go stale silently, so they are generated
rather than committed. That means a fresh clone has none, and eight of the drivers
(`drive`, `lang-layout`, `market-ui`, `mobile-audit`, `motion-audit`, `print-audit`,
`scroll-audit`, `text-align`) cannot run until you make them.

```bash
cd frontend && npm install && cd ..        # 1. deps
node tools/parity4.mjs                     # 2. no server, ~1s — fastest real signal
# start the backend (see above), then:
node tools/verify/refresh-cases.mjs        # 3. generates screenshots/verify/case_*.json
# start Vite, then:
node tools/verify/drive.mjs                # 4. the main gate, 41 page loads
```

Step 3 creates `screenshots/` itself if it is absent, so you do not need to
`mkdir` anything. It sends the twelve answers `FinancePage.jsx` sends, plus the
consent record the page attaches once its box is ticked, with `notice_version`
read from `frontend/src/config/notice.js`, so it also works against a backend
started with `ARTHNITI_REQUIRE_CONSENT=true`. It exits 1 without writing a
fixture if the backend still echoes a field the page no longer sends (a
`local_context` on a market row, or an `mvp_summary` key such as
`literacy_level`): that is a backend running older code, so restart it first.
Expect `good` to report **14 schemes, scores [100,90], 6 tiers,
fit {state 3, national 11}, 1 market row, a `registered_units` count, and
`household_check=within_limit household_repayment_percent=20.56%`** — if it
does not, the backend changed and the figures in CLAUDE.md
need re-measuring, not the script.

The three cases give three different answers to the optional household income
question, so a verifier seeding from any one of them sees a different
`household_check`. Repayments are the entered EMI plus a new EMI for the funding
gap, priced at 12% a year over 60 months:

| Case | Household income sent | Repayment pressure | New EMI | Household check | Next step | Advice codes |
|---|---|---|---|---|---|---|
| `good` (tailoring, Lucknow) | 20000 | 27.41%, low | 1112 | 20.56%, `within_limit` | `nxt.arrangeGap` | `adv.fundingGap` |
| `nulls` (tailoring, Lucknow) | blank, sent as `null` | `null`, high | 0 | `not_checked`, percent `null` | `nxt.reviewExpenses` | `adv.reduceExpenses`, `adv.improveMargin`, `adv.cashReserve` |
| `empty` (typed "Photography", Delhi) | 5000 | 17.78%, low | 667 | 53.34%, `over_limit`; `within_limit` without the new loan | `nxt.householdNewLoanOver` | `adv.fundingGap`, `adv.householdOverLimit` |

All three are `attention_needed`, and every `risk_analysis` has 19 keys. `empty` is
the case where the loan for the gap, not the existing loan, takes the household
over half its income. The 50% line comes from RBI's Master Direction on
microfinance loans, 2022 (paras 3.1 and 5.1–5.3, and Annex I). How the code reads
"household" for an unmarried adult is our interpretation and is unverified. Nothing on the page says a plan is
RBI-compliant or that a lender will lend.

## The scripts

No server needed — run these first, they are fast and catch the most:

```bash
node tools/parity4.mjs        # i18n parity + figures, 4 files x 8 languages, 9 checks
node tools/keycheck.mjs       # key USE vs key definition (the other half of parity4)
node tools/verify/glyph-audit.mjs   # decorative glyphs missing aria-hidden; report only
node --test tools/verify/market-lib-test.mjs   # the market fetch's logic, 185 tests, no network or key
```

`parity4`'s nine checks, as its summary line names them: missing or extra keys,
duplicate keys, cross-file collisions, identical to English, placeholder drift,
figures vs English, Latin digits only, figures vs schemes.json, notice text vs
recorded version. Checks 6 to 8 compare numbers:

- **figures vs English**: every translation carries the same ASCII digit runs as
  the English (`10,000`, `35`, `1.5`).
- **Latin digits only**: no non-ASCII digit (Devanagari `४`, Bengali `৫`) in any
  value, English included.
- **figures vs schemes.json**: each `schemeStrings.js` English sentence carries the
  same figures as the `schemes.json` sentence its code stands for.

Check 9, **notice text vs recorded version**, ties the privacy notice's wording
to the version the app sends with each consent. `frontend/src/config/notice.js`
exports `NOTICE_VERSION` and `NOTICE_KEYS`, every dictionary key the notice blocks
and `/privacy` render. parity4 hashes those keys' values in all 8 languages and
compares the hash and the version with `tools/notice-version.json`,
`{"version": "...", "sha256": "..."}`. The hash is sha256 over one
`lang<TAB>key<TAB>value<LF>` line per key and language, keys sorted and, within a
key, languages in parity4's `LANGS` order, then one `sent<TAB>k1,k2,...<LF>` line
listing `SENT_FIELD_KEYS` in their order, because `/privacy` renders that list and
a field added to it, dropped from it or moved in it changes no value. The value is
the text between the quotes as written in the dictionary file. It covers the text
only, not the version, and a CRLF checkout gives the same hash as an LF one.
`backend/tests/test_notice_sent_fields.py` holds the list's fields equal to what
`FinancePage` sends and the backend reads. It fails when:

- the text changed and the version did not: the consent records would name a
  version whose wording is no longer what the reader saw;
- the version changed and the text did not;
- the version changed and the record was not updated;
- the record still holds the placeholder hash (64 zeros);
- a key in `NOTICE_KEYS` is missing, duplicated or absent in any language; an
  English key starting `notice.`, `consent.` or `privacy.` is not listed; a key
  in `SENT_FIELD_KEYS` is not listed; or `DIALECT_PHRASES` in `languages.js`
  overrides a listed key, because then the page would render text the hash never
  covered;
- `NOTICE_VERSION` is not 1 to 40 characters of `0-9 A-Z a-z . -`, the backend's
  own rule for `consent.notice_version`.

`notice.js` must stay a plain module with no imports: parity4 imports it
directly, and so does `refresh-cases`. **To change the notice:** edit the
wording, bump `NOTICE_VERSION` in `notice.js`, run parity4, and copy the version
and the sha256 it prints into `tools/notice-version.json`. Once the keys
themselves are sound, the failure message prints the hash to record.

Measured on 25 Sept 2026 (`node tools/parity4.mjs`), after the notice, consent
and privacy keys were added and the `/login` contact keys removed, over **732
keys, 5,856 strings** (222 + 263 + 59 + 188 keys in `strings`, `resultStrings`,
`backendStrings` and `schemeStrings`):

| Check | Compared | Failing | Allowlisted |
|---|---|---|---|
| 6. figures vs English | 5,124 translated values | 0 | 4: `elig.common.class8` in hi, ml, mr, bn |
| 7. Latin digits only | 5,856 values | 0 | none |
| 8. figures vs schemes.json | 312 sentences across 30 schemes | 0 | 1: `sdata.pmvishwakarma.description` |
| 9. notice text vs recorded version | the 60 `NOTICE_KEYS` values in 8 languages, `NOTICE_VERSION` `2026-09-27.1`, sha256 `a2f50d71…` | 0 | none: there is no allowlist |

Check 9 was refuted the same day in copies under `--root=`. Each of these fails
it: one character changed in one English notice value, one character changed in
one Bengali notice value, a `DIALECT_PHRASES` override added for
`consent.agree`, and `NOTICE_VERSION` bumped with the text unchanged. What it
cannot catch is a version bumped together with a new record whose sha256 is the
old one: that edit to `tools/notice-version.json` is the deliberate way to
record a new version, so it has to be caught in review.

The figures in a value are its ASCII digit runs, taken after the `{placeholders}`
are removed and compared as a sorted list, so order does not matter but count does.
Check 8 pairs `description_code` with `description`, `support_type_code` with
`support_type`, and each `eligibility_codes[i]` and `document_codes[i]` with the
sentence at the same index. A code with no English entry in `schemeStrings.js`, or
a codes list and a sentences list of different lengths, fails check 8.

Nothing is normalised. A deliberate difference goes in `DIGIT_ALLOW` or
`SOURCE_ALLOW` at the top of the script, with the figures on both sides and a
one-line reason. There is one entry in each. `elig.common.class8` is allowed
because four languages write "Class 8" as an ordinal word with no digit.
`sdata.pmvishwakarma.description` is allowed because the dictionary sentence names
the ₹15,000 toolkit amount, which `schemes.json` carries in a different sentence,
`elig.pmvishwakarma.toolkit`. Both sides of an entry are pinned, so a change on
either side fails the run, and an entry that stops being needed fails it too.
`--root=<dir>` points the script at a copy of the tree, which is how to prove a
check fires without editing the real files. The copy must hold the four
dictionaries, `backend/app/data/schemes.json`, and, for check 9,
`frontend/src/config/notice.js`, `frontend/src/i18n/languages.js` and
`tools/notice-version.json`. The summary line names each failing check with its
count.

`keycheck` measured the same day, after the DPDP change: 488 keys referenced in
`frontend/src` (449 before it; no key the change added is unreferenced), 263
translation codes emitted by the backend, 0 leaked, 0 untranslated, 0 unmapped, and
6 keys defined but referenced by neither side (`an.afterEmi`,
`business.categoryHint`, `ch.coinTitle`, `common.back`, `common.continue`,
`common.required`), the same six as before. It was 7. The six are dead weight, not
defects. `keycheck` counts a key as referenced when its name appears in
`frontend/src`, and `config/notice.js` lists every `NOTICE_KEYS` key, so it
cannot tell whether a notice key is actually rendered.

**CI** (`.github/workflows/ci.yml`) is set up to run on `ubuntu-latest` on every
push and pull request. The backend job runs `pytest` on Python 3.10 and 3.14. The
frontend job runs `npm ci`, `npm run lint`, `npm run build`, `parity4`, `keycheck`
and `market-lib-test`, then `glyph-audit`, which exits 0 whenever it ran and is there to be
read. The build step sets `VITE_API_BASE_URL=https://api.example.invalid`:
`vite.config.js` refuses a production build whose API URL is not `https://`, and
this build is never deployed, so it gets a placeholder that cannot resolve
(`.invalid` is reserved by RFC 2606). parity4 passes in CI only once
`tools/notice-version.json` is committed with the hash of the committed notice
text. **None of the browser scripts is in CI.** **CI was written without being run**,
on a Windows machine with no Linux and no Python 3.10; the Actions tab has the
result. Two scripts were changed for
Linux, by reading the code, not by running it there. `keycheck` turns every `\`
into `/` on both sides before it compares paths. Before that, its filter that
skips the four dictionary files matched only Windows paths, so on Linux every key
a dictionary defines would have counted as used. `glyph-audit` finds `frontend/src`
with `fileURLToPath`, not `URL.pathname`. Stripping the pathname's leading slash
left a relative `home/...` path on Linux, and a `%20` in the path was never
decoded.

Need the **Vite dev server** on 5173:

```bash
node tools/verify/drive.mjs          # hydrate check + 8 passes, 41 page loads + scheme cards — the main gate; exits 1 on a finding
node tools/verify/mobile-audit.mjs   # 360/390/412 px, 48 page loads
node tools/verify/lang-layout.mjs    # 8 languages x 7 routes x 2 widths = 112 loads
node tools/verify/field-align.mjs    # form controls sharing a grid row, 96 loads
node tools/verify/print-audit.mjs    # the @media print stylesheet, 6 renders
node tools/verify/motion-audit.mjs   # transitions actually run + reduced-motion
node tools/verify/scroll-audit.mjs   # every route opens at the TOP of the page
node tools/verify/text-align.mjs     # sibling cells start their text on one line, 33 loads
node tools/verify/hero-art.mjs       # landing backdrop visibility + hero copy AA
node tools/verify/hero-geom.mjs      # backdrop edge vs the content sitting on it; report only
node tools/verify/hero-vibrance.mjs  # which backdrop filter is more colourful without losing legibility; report only
node tools/verify/brand-mark.mjs     # the lotus mark in both themes
node tools/verify/manual-audit.mjs   # wordmark + book icon + manual dialog
node tools/verify/error-banner.mjs   # /finance submitted 4 ways x 8 languages = 32 cases
```

`error-banner` and `scroll-audit` need the **backend** on 8000 as well: a real
`/finance` submit has to reach it. Each checks both servers before Edge starts and
exits 2 if either is down, or if the backend refuses the CORS preflight a browser
would send from the app's origin. A backend in production mode, or started with
an `ARTHNITI_CORS_ORIGINS` that leaves the app's origin out, still answers
`/health`, but every submit from the page would meet the offline banner and read
as a finding. The preflight goes to the backend on 8000 only, not to a
`VITE_API_BASE_URL` the page was started with.

`error-banner` submits `/finance` four ways in each language. `validation` and
`offline` tick every consent box with real clicks first and check the API error
banner, found by `[role=alert].ui-notice-danger:not([id$="-error"])` so an inline
message cannot pass for it. `consent` leaves the box unticked: no request to
`/api/analysis/run` may go out, `#consent-error` must show, and focus must be on
the box, which must carry `aria-invalid="true"` and an `aria-describedby` naming
the message. If an age box is rendered, it then ticks only the notice box and
expects the same of the age box and `#consent-age-error`. `zero-income` seeds a
household income of exactly 0, ticks consent and expects the same block on
`#household-zero-confirm` and `#household-zero-error`, then ticks that box and
expects the request to go out.

A case that cannot measure is a 2, not a finding. A wrapper around `fetch` on the
page counts the requests to `/api/analysis/run`, how many were answered, how many
failed, and the status of the last answer. `validation` needs the backend's 422,
so a request that got no answer (the backend went away mid-run, or refuses this
origin), or an answer other than a 422, is a fault: the banner on screen is not
the one the case is named for. `offline` blocks the request, so one that was
answered means the block never applied. A request still waiting when the 6 s banner
window ends is a fault in `validation` and in `zero-income`: the backend stopped
answering mid-run, and `api.js` gives up on it only after 20 s. The validation
banner must name both empty fields, `business_category` and `state`, each in the
dictionary's words for its language; the check used to look for a comma. The script
also faults when `FIELD_LABELS` has no key for either field, when the `en`
dictionary lacks that key, or when a label is empty or already inside
`err.checkFields` or the other label.

Measured on 26 Oct 2026 against a stand-in backend (not kept in the repo) that
answers `/health` and the CORS preflight and fails only `POST /api/analysis/run`,
with the script as it was before these changes and as it is now:

| The analysis request | Before | Now |
|---|---|---|
| is accepted and never answered | 1, no fault, 182 s | 2, 16 faults ("still waiting for an answer", in `validation` and `zero-income` for each language), 182 s |
| has its socket destroyed | 2, 8 faults, 79 s | 2, 8 faults, 79 s: this arm already existed |
| is answered with 503 | 1, no fault, 79 s | 2, 8 faults ("answered HTTP 503, not the 422 an empty form gets from the backend"), 79 s |
| goes to the real backend | 0, no fault, 82 s | 0, no fault, 80 s |

The 503 line is the one that changed last: the earlier run of the new script still
exited 1, with notes on a validation banner that read `stub`, the stand-in's body,
until the 422 check was added.

`drive`'s eighth pass, `cleared`, loads the four result pages in Hindi with the
`good` answers, no result and `resultCleared: true`: the state after someone edits
an answer once a result exists. It fails on `CLEARED STATE MISSING` (the
`res.changedTitle` or `res.changedButton` text is not on the page),
`WRONG EMPTY STATE` (the page shows its never-submitted text instead) and
`OLD RESULT SHOWN` (a bar, a coin chart, a rupee figure or one of the discarded
result's scheme names is still on the page). Every pass seeds `sessionStorage` at
version 2, and the script exits 2 at start-up if `AppContext.jsx`'s
`READABLE_VERSIONS` no longer includes 2. Its raw-enum check also fails on the
household fields printed raw: `household_check`, `within_limit`, `over_limit`,
`not_checked`, `household_repayment_percent`, `household_in_microfinance_range`.

Before the passes, `drive` runs a **hydrate check**: it seeds a version 2 payload
that still carries `profile.literacyLevel` and `business.employees`, the two
fields version 4 removed, reloads, and reads back what the app wrote to
`sessionStorage`. It fails with `HYDRATE` unless the app wrote the current
`STORAGE_VERSION` (read from `AppContext.jsx`), dropped both fields, and kept the
result byte for byte. `/privacy` is one of the 41 loads, in every pass that loads
all routes. After its dump and screenshot every `<details>` on it is opened and the
text is checked again, because `innerText` skips a closed disclosure; a `/privacy`
with nothing to open is itself a finding, `NO DISCLOSURE`. On every English page,
`FORBIDDEN CLAIM` fails on the words "compliant", "secure", "anonymous" and
"untraceable", negated or not. The leaked-key check also knows the `privacy.`,
`notice.`, `consent.`, `errf.` and `form.` prefixes.

The deployer's own words are left out of those text checks. A deployment prints its
Fiduciary's name and privacy contact, from `VITE_FIDUCIARY_NAME` and
`VITE_PRIVACY_CONTACT`. That is the client's text, and the checks misread it: a
contact of `privacy.officer@nbfc.in` is a leaked key, and a name of "Secure Credit
Finance Ltd" a forbidden claim. `drive` reads both from `deployment.js` in the page
and replaces each one that is set with a neutral token before the checks; the dumps
keep the page as it is. `report.json` carries `demoMode`, which says which notice
the run read, and `neutralised`, which values were left out. Measured on 26 Oct
2026 against a Vite started with those two variables: the pre-fix `drive` exited 1
with 6 findings (`FORBIDDEN CLAIM`, `UNTRANSLATED KEY LEAKED`), and the fixed one
exited 0 with `neutralised` naming both.

The scheme-card walk goes up from each scheme's heading to the first
`CARD_SELECTOR` box. A heading in no such box, or in one that holds other schemes'
headings (the section around all the cards), is not a card to measure, so it exits
2 and names the heading and the selector. Measured on 26 Oct 2026 with a selector
that matched nothing, the pre-fix `drive` exited 1 with 13 false `SCHEME CARD NOT
FOUND`; with one that matched the whole section, 13 false `WRONG FIT LABEL`. The
fixed one exits 2 in 10 s for either. A heading that is not on the page at all is
still a finding. A `FIT_KEYS` line in `backendText.js` that `drive` cannot read
also exits 2, naming the file and line; it used to read as `FIT LABEL MISSING` on a
correct app.

**Seed versions.** `AppContext.jsx` writes version 5 and reads 1 to 5. Version 5 added
`aiFilled`, the answers the voice-and-text helper filled in; a seed without it reads
with an empty list. Any other version, or a payload with no `{v, data}` wrapper, is
thrown away: the form
comes up blank and a result page shows its empty state, and both measure clean.
`hydrate()` keeps only the keys `EMPTY` has, fills a missing one from `EMPTY`, and
passes `result` through unchanged, so an old seed that carries a removed field, or
a result with the old `local_context` rows, still reads. No seed carries
`literacyLevel` or `employees` any more, and none carries a consent tick: consent
is `FinancePage` local state, never stored.

- `drive` seeds 2 on purpose: its hydrate check needs an old payload.
- `error-banner`, `figure-audit`, `lang-layout`, `mobile-audit`, `motion-audit`,
  `print-audit`, `scroll-audit` and `text-align` seed 4. Every field their seeds
  carry is a version 4 field.
- Each of those nine declares `SEED_VERSION`, reads `READABLE_VERSIONS` out of
  `AppContext.jsx` at start-up, and exits 2 if the set no longer holds it, or if
  the parse finds no set. The message names the seed to rewrite.
- The seven that seed a result read the stored state back on each result route
  they load. The app writes its state back once it hydrates, so a seed it
  discarded reads back with no `result`. That load is reported `UNSEEDED` and
  fails the run with exit 2.
- `market-ui` reads `STORAGE_VERSION` out of `AppContext.jsx` and seeds that, so
  it is always read. A change to `EMPTY`'s shape reaches it as blank fields, not
  as a refusal.

Until 29 Sept 2026 six of the seven seeded version 1, and `text-align` seeded the
raw text of `case_good.json` with no wrapper, so in each of its three cases the
four result routes measured their empty states: 12 of its 33 loads. Seeded
properly, it compares 267 row groups and 459 column groups, against 195 and 54
before.

`scroll-audit`'s start-over hop takes two clicks. The utility bar's ↺ button opens
a dialog and no longer navigates on its own, so the hop's `pre` expression finds
and clicks ↺ after the page is scrolled, and its `find` expression picks the second
of exactly two buttons in the open dialog, the confirm button. "No" is the first
button and takes focus. If the dialog has any other number of buttons, the hop
reports `NO-CONTROL`. `NO-CONTROL` is a fault, exit 2: a hop that found nothing to
click measured nothing.

The submit hop's `pre` ticks the consent box. It clicks every unticked
`input[type=checkbox][data-consent]` but the first, and returns the first for the
harness to click, so a page with no consent box reports `NO-CONTROL` instead of
passing on a blocked submit. Five hops were added for the privacy notice:
`/advisory → /privacy` from the footer's bottom line, `/login → /privacy` and
`/profile → /privacy` from the short notices, `/finance → /privacy` from the
consent block, and `/privacy → /` by its back link (a direct open carries no
`state`, so the back link goes to `/`). The two short-notice hops, and the
existing `/login → /` back link, run at a 1280x380 viewport like the 404 hops:
`/login` lost its phone, address and email fields and `/profile` is short, so at
full height they may not scroll the 200px a hop needs. That viewport was set by
reading the code. The run on 28 Sept 2026 confirmed it: at 1280x380 the three
hops scrolled 956, 956 and 1,090 px and each landed at the top, so none went
`INERT`. The hop count is 38.

A hop's `pre` is now an expression that returns an element, and the harness
clicks it. If it returns nothing, the hop reports `NO-CONTROL` "opening control not
found". The instruction-manual hop's `pre` was a statement that did its own click,
`document.querySelector('button.ui-manual-open').click()`, and is now the element
expression `document.querySelector('button.ui-manual-open')`. `--broken`
still refutes the start-over hop, because the dialog sets no scroll lock.

The `/finance` submit hop sends a real request, so it can fail for a reason the
page did not cause. A fetch wrapper installed before the page's own scripts
records that request in `window.__scrollAuditPost` (empty, then `pending`, then
the status, or `failed:` with the error), and the report carries it as `post` on
each hop that sent one. A hop that stays on its page is read from it:

- the request failed, was still pending when the hop's wait ended (4 s for this
  hop, 0.7 s for the others), or was answered 5xx: `NO-BACKEND`, a 2, because the
  backend went away, hung or failed;
- it was answered below 500, or none was sent: `NO-NAV`, a finding, with the
  status in its note. A 4xx is a finding on purpose: the page let the seeded
  answers through and the backend refused them, which a reader typing the same
  answers would meet too.

Before this a 503, a hang and a reset all read as `NO-NAV`, a 1, and under
`--broken` as the pass. Measured on 26 Oct 2026 against a throwaway node server
on 8000 that answers `/health` and the CORS preflight and fails only the
`POST /api/analysis/run` (it is not kept in the repo); each run took 73 to 74 s:

| The POST gets | Now | Before |
|---|---|---|
| 503 | 2, `NO-BACKEND` | 1, `NO-NAV` |
| 500 | 2, `NO-BACKEND` | not run |
| no answer | 2, `NO-BACKEND` (still pending after 4 s) | 1, `NO-NAV` |
| a destroyed socket | 2, `NO-BACKEND` (`Failed to fetch`) | 1, `NO-NAV` |
| 422 | 1, `NO-NAV` (answered HTTP 422) | not run |

The `/profile`, `/login` and `/privacy` back-link hops used to find their link
with `.ui-main a[href="/"]`. The breadcrumb is the first thing inside `<main>` on
every page but the landing one, and it links to `/` too, so those hops clicked the
breadcrumb's Home link and passed whatever the page's own back link did. They now
find the back link by structure (`OWN_BACK_LINK`): inside `.ui-main`, outside
`.ui-breadcrumb`, and starting with the `aria-hidden` arrow `←`. When that does
not match exactly one link the hop reports `NO-CONTROL`, and a link that goes
anywhere but the hop's target is `NO-NAV`. Two hops with the same label exit 2,
because the report is keyed by it.

**`print-audit`, `motion-audit`, `hero-art` and `brand-mark`** each used to read a
probe that measured nothing as a clean run. Each was run with a fault planted in
the page or in the file it reads, against this tree and against the tree before
the fixes (26 Oct 2026). `print-audit` takes 20 to 22 s a run and exits 0 when
nothing is planted:

| Planted in `print-audit` | Before | Now |
|---|---|---|
| the theme key the app reads, renamed in the gate's seed | 0 | 2, `UNSEEDED` |
| the language key, renamed in the same way | 0 | 2, `UNSEEDED` and `PROBE` |
| pale `oklch()` ink and `--color-danger` under print | 0 | 2, `PROBE` |
| every card transparent under print, on a sheet that prints white | 1, 12 false findings (`PAPER` and `TOKENS`, in each of the 6 renders) | 0 |
| every `.ui-breadcrumb` renamed, so a `CHROME` class matches nothing | 0 | 2, `PROBE` |
| a `.ui-manual` on every route, which `CHROME_OFF_ROUTE` says is off-route | 0 | 2, `PROBE` |
| a print hide rule naming a class `CHROME` does not list | 0 | 2, `PROBE` |
| the same, in a second hide rule after the first | 0 | 2, `PROBE` |
| no hide rule in the print block | 0 | 2, `PROBE` |
| no `break-inside: avoid` rule | 2 | 2 |
| a black card surface, which `relLum` can read | 1 | 1 |

The last two are controls: the old gate already caught them, and a real contrast
finding must still be a 1. The hide list is every `display: none !important`
rule in the print block, not the first (the first fix read only one, and a second
rule slipped past it). The `oklch()` card surface was a `PROBE` fault before as
well, but blamed on the brand mark.

`motion-audit` polls up to 15 s for `#main` to fill and for `--color-text` to
resolve (`NOT-RENDERED`, a 2, otherwise), because Vite injects `index.css` late on
a cold start. Under `--broken` its refuter takes the reduced-motion guard out of
`@layer base`; with the guard already outside that layer there is nothing to take
out, so the run exits 2 saying the `REDUCED` arms were not refuted, instead of
passing. Measured with the guard moved out on every load: plain run 0, `--broken`
2 with all 10 planted kinds still reported.

`hero-art` reads `--color-bg` through a 1x1 canvas, so the same colour written as
`rgb()` or `oklch()` measures like the hex it replaces. Sliced as `#RRGGBB`, it
used to come out as `NaN`, paint black, and report every mode as "0% of the
artwork is perceptible". A colour the canvas refuses, or one that is not opaque,
exits 2. Planted in `--color-bg` just before the probe:

| `--color-bg` becomes | Before | Now |
|---|---|---|
| the same colour as `rgb()` | 1, a false finding | 0 |
| the same colour as `oklch()` | 1, a false finding | 0 |
| white, as `#fff` or `#ffffff` | 1 | 1, a real dark-mode contrast finding |
| `notacolor`, `transparent` or empty | 1, a false finding | 2 |

Fixed sleeps in `hero-art` and `brand-mark` became `waitForSettled`: up to 15 s for
the hero or the brand mark, the mode's `data-theme`, `lang` and `--ui-scale`, a
complete `readyState`, fonts and two frames. A `hero-art` run now takes 2 to 3 s
instead of 8 to 9 s. `brand-mark` reads the `--*` names to inline off the mark's
own markup instead of from a list, and exits 2 if the mark uses no `var()`.

Starts **its own Vite** on 5179, so it does not need yours (pass
`--url=http://localhost:5173` to use yours instead). Needs `case_good.json`:

```bash
node tools/verify/market-ui.mjs      # market cards + the sources block, 40 loads, 8 languages
```

`market-ui`'s rows carry no `local_context` any more: the backend stopped echoing
the village, market type and customers, and `MarketCard` reads the market type
from the reader's own answers. `WHERE-SELL` fails on `/analysis` unless each card
shows `mk.whereSell` and the translated labels of the seeded market types
(`market.village`, `market.weekly`, joined with ", "). A third case, `nomarket`
(same rows, no market type ticked, `en` and `hi`, both routes), fails if
`mk.whereSell` is on any card. `--broken` plants a `WHERE-SELL` defect in both.

Needs the **backend** on 8000 **and** Vite on 5173, and no `case_*.json`:

```bash
node tools/verify/figure-audit.mjs   # amounts and percentages at the ₹100 crore cap, 4 cases x 4 looks x 2 routes x 11 widths = 352 measurements
```

`figure-audit` sends the live backend four sets of answers at the extremes the
form accepts: `big`, `loss`, `zero` and `ratio`. They produce the longest
amounts, the longest negative ones, and a 19-character yearly return on a ₹1
investment. It seeds each response together with its answers. Then it measures
every standalone amount and percentage on `/analysis` and `/report`, with every
`<details>` open, in four looks (English at all three text sizes, Hindi at the
largest) and at eleven widths from 360 to 1440px. It fails on:

- `SPLIT`, a figure over two lines;
- `OVER`, a figure past its box, its card or the screen;
- `TINY`, a figure under 12px;
- `SIDEWAYS`, a page that scrolls sideways;
- `PAGE-ERROR`, an uncaught exception on a page that mounted. Each one counts once,
  in the first row probed after it arrived, and its first line is printed with the
  width of that row.

`report.json` lists every figure `<Figure>` shrank, with the size of the line
around it. On 29 Sept 2026 the smallest was 17.74px. The gate exists because at
₹100 crore the figures on both pages broke mid-number that day. mobile-audit, the
only other figure check, runs only at phone widths and on ordinary answers.

A page error used to be copied into every row after the one it arrived in, so one
error thrown while a page loaded counted once for each width left. Measured on
26 Oct 2026 with copies of the script that throw one uncaught error 700 ms into
every document, so each of the 32 loads holds one (32 loads × 11 widths = 352
rows):

| Script | Page errors counted | Where | Exit, time |
|---|---|---|---|
| before | 291, in 291 rows | 1 at 360px, 2 at 412px, then 32 at each of the 9 widths from 640 to 1440 | 1, 68 s |
| now, with a second error pushed after the last probe of each load | 64, in 64 rows | the 32 thrown by the page: 1 at 360px, 2 at 412px, 29 at 640px; the 32 pushed: all at 1440px, the last row of the load | 1, 69 s |

The earlier script counts 291 and not 352 because the error is not there yet when
the first probes run. Which row an error lands in depends on when it arrived
relative to the probes, so the spread over widths differs between the two runs. The
page threw 32 errors in each.

Need a built bundle served by `vite preview` on **4173**, not dev. From
`frontend`, run `npm run build:local && npm run preview`. A plain
`npm run build` now fails on purpose, because `vite.config.js` refuses a
production build whose `VITE_API_BASE_URL` is not `https://`. `build:local` is
`vite build --mode loopback`: the same minified bundle, with the loopback API
fallback kept. The other way is
`VITE_API_BASE_URL=https://api.example.invalid npm run build && npm run preview`,
which works because load-perf never calls the API.

```bash
node tools/verify/load-perf.mjs      # startup cost, medians of 5 cold loads
```

It also times the i18n merge on its own, by re-running `strings.js` `merge()`
on this tree's four dictionaries after every load is measured. It evaluates
their per-language literals in the layout parity4 reads, and it exits 2 before
Edge starts if a file lacks a language. The figure describes the bundle only
when the bundle was built from the same tree.

Before it starts Edge, `load-perf` asks `http://localhost:4173/` once, with a 5 s
limit; no answer, or one outside 2xx, is a 2. A load that lands on Edge's own error
page or on a non-2xx answer during the run is counted as a fault, not as an app
that failed to mount: the run carries on and `report.json` says `"exit": 2`. Every
other 2 leaves no report, since the last one is deleted at startup, and Edge is
killed in a `finally` whichever way the run ends. A silent listener on its own
DevTools port, 9363, is one of those 2s, reached after 184 s (measured; see "What
is still slow or unbounded" above).

**The voice-and-text helper (`/talk`)** has two Node test files, one browser gate and
a fake backend. None of them reaches Meta, reads a key or costs anything:

```bash
node --test tools/verify/talk-lib-test.mjs    # wav.js and talkAnswers.js: 45 tests, no server
node --test tools/verify/app-state-test.mjs   # AppContext's applyEdit, applyHelperFill, applyResult, applyPlan and storage: 41 tests, no server
node tools/verify/talk-ui.mjs                 # the page in a real Edge: 17 scenarios, 259 checks, about 30 s (--only=S3,S5 runs some)
```

- `talk-lib-test` also hands a real encoded recording to the backend's own
  `usable_wav()` through the venv, because "the header looks right" is not "the
  backend takes it". That one test is skipped, and says so, when the venv is absent.
- `app-state-test` loads `AppContext.jsx` through Vite's own module loader
  (`ssrLoadModule`) and renders it once on the server with a stand-in for
  `sessionStorage`. It brings no dependency of its own. Run from the repo root.
- `talk-ui` starts its own backend (8012), three Vites (5182 helper on, 5183 helper
  off, 5184 on with the age box) and its own Edge (9379, with a synthetic microphone),
  and kills all of them by PID on every exit path. It needs `.venv`, Edge and
  `frontend/node_modules`, and no `case_*.json`. Its scenarios are S0 to S15 plus S2b.
  A wait for something the page owes the reader (the consent error) is a finding when
  it never comes; a wait for something the instrument needs is a fault, exit 2.
- `verify/talk_fake_backend.py <port>` is the shipped app with the helper switched on
  and a fake in Meta's place. It must keep the real client's signatures. The first
  browser run caught a drift the unit tests could not: the route had started passing
  `keywords` to `transcribe` and the fake did not accept it, so S4 and S6 failed.
  `backend/tests/test_talk_fake_backend.py` now compares the signatures with
  `MetaClient` and serves both routes through the fake.

`talk-ui` has no `--broken` flag. Its refuters were run by hand on 27 Oct 2026: change
one line, run with `--only=`, restore it, compare the bytes. The thirteen are listed in
the script's header. Each made the scenario fail:

| Change | Scenario | Checks that failed |
|---|---|---|
| delete the first `onActiveChange(true)` in `VoiceRecorder.start()` | S5 | 4 |
| delete `if (!agreed()) return` in `find()` | S2 | 6 |
| the same line as a bare `agreed()` | S2 | 2 |
| `mayRecord()` returns `true` | S2 | 2, and exit 2 |
| `agreed()` ignores the age box | S2b | 2 |
| delete `release()` in the catch of `startRecording()` | S13 | 1 |
| delete `handle.cancel()` in the unmounted branch | S14 | 1 |
| `onActiveChange(false)` put back before `setStarting(true)` in `finish()` (the order before the lock was held to the end) | S15 | 1 |
| delete `setStarting(true)` in `finish()` | S15 | 1 |
| delete `onActiveChange(false)` before the `mountedRef` check in `finish()` | S15 | 2 |
| delete `setStarting(false)` before `onWav(wav)` | S15 | 2 |
| delete `else onError('talk.errRecording')` | S15 | 1 |
| call `onWav(wav)` whatever `wav` is | S15 | 1 |

The `mayRecord()` refuter exits 2, not 1: Record then starts and locks the consent box
that S2 ticks next, so the run ends in a fault after its two findings. The findings
are in `report.json`; the scenario order was left as it is. The first S2 refuter also
exited 2, because the gate called a missing consent error a fault in the instrument;
`settleSnap` made it a finding.

The last S15 refuter survived at first. "Nothing was sent" read the fake backend's call
log, and the real route turns an unusable WAV away with a 422 before the model client,
which is where the fake keeps that log. The check now hooks `fetch` in the page
(`window.__stop.fetchAt`). S15 also waits 1.2 s before it presses Stop: a recording
stopped at once was reported as unusable in 3 of 40 runs without the wait and in 0 of 40
with it (40 interleaved pairs; too few for significance). The page's report of such a
recording is correct, and S15's second part tests it on purpose.

Helpers, the 6 that are not gates:

```bash
node tools/verify/refresh-cases.mjs  # fixture generator: rewrites the case_*.json the drivers seed from (needs the backend on 8000 and frontend/src/config/notice.js)
node tools/verify/art-contrast.mjs   # RETIRED — exits 2 by design
node tools/assetgen.mjs              # asset tool: regenerates the brand PNGs (needs Vite); see below
node tools/svgcheck.mjs              # asset tool: every SVG loads and paints; exits 1 on a refused one, 2 when it could not check
node tools/third-party-notices.mjs   # regenerates THIRD_PARTY_NOTICES.md (needs .venv + node_modules)
node tools/fetch-market-data.mjs     # data fetch: refreshes market_data.json from data.gov.in (see below)
```

`assetgen`'s wordmark step is broken. It writes one `arthniti-wordmark-on-navy.png`,
clipped to the utility strip, and the strip has not held the wordmark since it moved
to the masthead on 11 Sept 2026, so the clip comes out with a negative height. Don't
rely on that step until it is fixed.

`svgcheck` asks git which SVGs to check
(`git ls-files -z --cached --others --exclude-standard -- ':(icase)*.svg'`, sorted,
duplicates removed) instead of carrying a list, so a new SVG is checked without
anyone adding it and an ignored one is not. A file git does not track yet is
checked with the rest and named twice: once before the run and again on its own
result line, as `(untracked)`. It exits 2, before Edge starts, if git fails, lists
no SVG, or lists a file that is missing from the disk. Each file is loaded through
`pathToFileURL`, so a `#` or a `%41` in a path is part of the name. The hand-written
list it replaced read `art/a#b.svg` and `art/c%41d.svg` as other paths and reported
both refused. Measured on 26 Oct 2026 in throwaway repositories, 0 to 2 s a run:

| Repository | Exit | Output |
|---|---|---|
| 5 tracked SVGs (one broken), 1 untracked, 1 ignored | 1 | `6 checked, 1 refused`; `art/new.svg` named as untracked; the ignored file not checked |
| the same, with the broken file removed from the index and the disk and the untracked one deleted | 0 | `4 checked, 0 refused`, a `#`, a `%41` and a space among them |
| the pre-fix script on those four files | 1 | `4 checked, 2 refused`: `a#b` and `c%41d` |
| a tracked file deleted from the disk | 2 | `is in git but not on disk` |
| a repository with no SVG | 2 | `git lists no SVG in this repo` |
| a directory that is not a repository | 2 | `git exited 128` |
| no `git` on `PATH` | 2 | `ENOENT` |
| the clean repository again | 0 | `4 checked, 0 refused` |

`fetch-market-data.mjs` is a dry run unless you pass `--write`: it fetches, checks
every row and prints what would change. It needs your own data.gov.in key in
`.env` (copy `.env.example`); it never prints the key. `--sample` uses the public
sample key, never reads `.env` and never writes. The usual refresh is
`node tools/fetch-market-data.mjs --write --resume`, then `refresh-cases.mjs` and
the gates. It is the only script here that goes to the internet, and
`market-lib.mjs` beside it is the library it and `market-lib-test.mjs` share, not
a script to run.

## Five traps that will cost you an hour each

**Run `refresh-cases.mjs` after any backend change.** Eight scripts, `drive.mjs`
among them, seed `sessionStorage` from the three captured `case_*.json` responses. Those go stale **silently** —
they once sat at 2 schemes with no `level` field long after the dataset grew to 30,
so the driver kept passing while telling you nothing about the scheme UI.

**Redirect output to a file. Never pipe to `head`.**

```bash
node tools/verify/drive.mjs > /tmp/drive.txt 2>&1; echo "exit=$?"; tail -40 /tmp/drive.txt
```

`node x.mjs | head -100` closes the pipe once `head` has its lines, and the script's
next `console.log` throws `EPIPE` (on Windows a closed pipe is an error, not a
signal). The script stops there with exit 2, **before its final `writeFileSync`**,
and since the last `report.json` went at startup it leaves none. Measured on 30 Sept
2026: `drive.mjs 2> err.txt | head -n 2` stopped after 7 s, exit 2, no report. Until
then the stale report stayed on disk while the console showed the current run.

**Use `localhost`, not `127.0.0.1`, for Vite.** `vite dev` may bind `[::1]` only, so
`127.0.0.1:5173` refuses while the server is plainly up. The backend is the reverse:
`uvicorn --host 127.0.0.1` is IPv4-only.

**Clean up every process you start.** A stray listener on 8000 gives
`[Errno 10048] only one usage of each socket address`; a stray Vite gives confusing
CORS failures against a backend that looks fine.

```bash
netstat -ano | grep -E ':8000|:5173|:4173'
taskkill //F //T //PID <pid>     # doubled slashes under Git Bash
```

**Fifteen browser scripts can leave a headless Edge running.** `drive`,
`figure-audit`, `mobile-audit`, `market-ui` and `talk-ui` find their own Edge by its
profile path and kill it by PID. The other fifteen (`assetgen`, `svgcheck`, `brand-mark`, `error-banner`,
`field-align`, `hero-art`, `hero-geom`, `hero-vibrance`, `lang-layout`, `load-perf`,
`manual-audit`, `motion-audit`, `print-audit`, `scroll-audit`, `text-align`) call only
`edge.kill()`, which misses the process Edge relaunches itself as. Treat `report.json`
as the authority, find a leftover by its debug port (`netstat -ano | grep :9355`),
and kill it by PID. Never kill by image name: `taskkill /IM msedge.exe` also closes
your own browser and any gate running beside this one. This is not rare: on
25 Sept 2026, repeated `motion-audit` runs left 8 headless Edges behind.

## Two things worth knowing about the design

**Each browser script uses its own CDP port and its own profile directory**, so two
can run at once: `drive` 9222, `mobile-audit` 9333, `hero-art` 9337, `brand-mark`
9339, `manual-audit` 9341, `lang-layout` 9343, `error-banner` 9347, `field-align`
9351, `hero-geom` 9355, `print-audit` 9359, `hero-vibrance` 9361, `load-perf` 9363,
`motion-audit` 9365, `scroll-audit` 9367, `text-align` 9371, `market-ui` 9373, `figure-audit` 9375, `talk-ui` 9379 — plus `assetgen` 9377
and `svgcheck` 9378, two helpers outside tools/verify that also drive a browser. 9369 is left free on
purpose: it was a throwaway probe's port, and the next one-off should reuse it rather
than take a number a gate might want.

**`--user-data-dir` must be absolute.** A relative path silently attaches to your
already-running Edge profile and exits with no debug port. Every script builds it
with `resolve()` for this reason — do not "simplify" one to a relative path.

## When a new check reports zero

Break the thing it watches on purpose and confirm it fires. This is written down
because it has cost real time three separate times: a `SPLIT-FIGURE` check reported
0 problems twice on visibly broken output, an `ORPHAN` check reported 0 of 56 loads
because every test width produced identical line breaking, and all ten CSS
transitions were inert for a full day while every script in this directory passed.
A clean result from an inert check is indistinguishable from a clean result from a
working one.

Six scripts have that refuter built in as a flag, and each **must exit 1** with it:

```bash
node tools/verify/motion-audit.mjs --broken   # 32 findings across all 10 planted kinds; exit 2 means one went unreported
node tools/verify/field-align.mjs  --broken   # 10 findings (6 MISALIGN, 4 ORPHAN) across 96 loads; exit 2 names what it missed
node tools/verify/field-align.mjs  --broken --sweep   # 119 findings (101 MISALIGN, 18 ORPHAN) across 132 loads; exit 2 also if ORPHAN went unreported
node tools/verify/scroll-audit.mjs --broken   # 38 findings: TOP on 37 of the 38 hops + BACK; the manual-dialog hop passes (see below); exit 2 if any other hop does not report TOP (`unrefuted` in report.json) or BACK is missing
node tools/verify/text-align.mjs   --broken   # the stacked footer reported on all 33 loads; exit 2 names each load that missed it
node tools/verify/market-ui.mjs    --broken   # 532 planted defects across 40 loads, all caught (676 findings); exit 2 means one defect went uncaught, or a real `DICT-EN` finding (nothing is planted in the dictionary check, so a 1 would hide it)
node tools/verify/figure-audit.mjs --broken        # the fix undone: SPLIT in each of big, loss and zero, 34 of 352 measurements
node tools/verify/figure-audit.mjs --broken=over   # one line, no shrinking: OVER in each of big, loss and zero
node tools/verify/figure-audit.mjs --broken=tiny   # forced to 9px: TINY on all 32 loads; exit 2 names a case or load that missed
```

Those figures were measured on 29 Sept 2026, and again, unchanged, on 30 Sept and
on 26 Oct 2026, after the exit-code fixes.

`text-align --broken` used to pass on any finding at all. Once its result pages
were seeded properly they had findings of their own, and a copy with the planted
CSS switched off still exited 1. It now counts only the defect it plants, a
footer that stacks its columns, and since every load renders the footer, it has
to report it on all 33.

`scroll-audit` also carries the check in-band: a hop whose source page could not
be scrolled at least 200px is reported as `INERT`, a fault (exit 2), rather than
counted as a pass, because a navigation with no offset to carry over proves nothing
either way.

**Exit 1 does not prove a refuter works.** From 9 to 25 Sept 2026,
`motion-audit --broken` exited 1 with 28 findings across 7 kinds, and three of its
ten planted kinds, `REDUCED`, `REDUCED-ZERO` and `REDUCED-DELAY`, were never
reported. CLAUDE.md recorded that run as "29 findings across 10 kinds", which was
wrong; corrected here on 25 Sept 2026. The cause was the cascade. The
reduced-motion guard sits in `@layer base` with `!important`, and the refuter's
three reduced-motion rules sit in `@layer utilities` with `!important`. For
`!important` the layer order reverses, so the guard in `base` beat them and the
planted defect never applied. `inject()` now moves the guard out of `@layer base`
and appends it unlayered after the refuter's CSS, where any layered `!important`
beats it: the regression the arm exists to catch. At exit, `--broken`
checks that all ten planted kinds (`TOKENS`, `PROPS`, `INERT`, `NORUN`, `DELAY`,
`FORBIDDEN`, `ONLOAD`, `REDUCED`, `REDUCED-ZERO`, `REDUCED-DELAY`) were reported,
and exits 2 if one was not or if no guard was moved. Measured after the fix: 32
findings, `TOKENS` 1, `PROPS` 9, `INERT` 8, `NORUN` 6, `DELAY` 2, `FORBIDDEN` 1,
`ONLOAD` 1, `REDUCED` 1, `REDUCED-ZERO` 1, `REDUCED-DELAY` 2. Four arms still have
no refuter: `REDUCED-ITER` (the app declares no keyframe animation, so nothing can
reach it), `REDUCED-SCROLL` (nothing sets smooth scrolling, so it cannot fire with
the guard gone either), `ALWAYS-REDUCED` and `UNREACHABLE`; the script's header lists
all four. `ABSENT` is not planted either; it fired for real on the script's first
run.

**And the corollary, which cost real time on the flip side: when a check *passes*
under the refuter, find out why.** One of `scroll-audit`'s 38 hops — the one that
leaves the instruction-manual dialog — is over-determined and passes with the fix
removed. Measured with a dedicated probe rather than assumed: the refuter is working
(`scrollTo` is swallowed exactly once, and a plain landing link from the same offset
does land at the destination's 706px maximum), but the dialog's scroll lock is
restored in a **passive effect cleanup that runs after paint**, so the destination's
first paint happens with a non-scrollable viewport and Chromium resets the offset to
0 instead of clamping it. An unexplained pass is indistinguishable from an inert
case, so do not read that run as 38-of-38 refuted.

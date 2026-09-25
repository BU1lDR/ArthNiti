# `tools/` — the verification suite

27 zero-dependency `.mjs` files (`ls tools/*.mjs tools/verify/*.mjs | wc -l`).
The verifiers check things `npm run lint`, `npm run build` and `pytest`
structurally cannot see: a leaked translation key, a `null%`, a page that
scrolls sideways under a thumb, a `₹30,000` that wrapped as `₹30,00 / 0`, a logo
that prints invisible, a transition that silently does nothing, a route that opens
halfway down the page, a footer column whose heading starts 50px below its
neighbours'.

Not all 27 are gates. Counted by class:

| Class | Count | Scripts |
|---|---|---|
| **Gates**: exit 1 on a finding | 17 | `parity4`, `keycheck`, `market-lib-test` (via `node --test`), `drive`, `mobile-audit`, `lang-layout`, `field-align`, `print-audit`, `motion-audit`, `scroll-audit`, `text-align`, `hero-art`, `brand-mark`, `manual-audit`, `error-banner`, `market-ui`, `load-perf` |
| **Report-only verifiers**: exit 0 either way, a person reads the output | 2 | `glyph-audit` (expect exactly 3 hits), `hero-geom` (measurements, no findings) |
| **Helpers**: not gates | 7 | `refresh-cases` (fixture generator), `hero-vibrance` (tuning instrument), `art-contrast` (retired, exits 2), `assetgen` and `svgcheck` (asset tools), `fetch-market-data` (data fetch), `third-party-notices` (writes `THIRD_PARTY_NOTICES.md`) |
| **Library**: not run directly | 1 | `market-lib` |

`svgcheck` does exit 1 on an SVG the browser refuses. It is listed as a helper
because it checks image files, not the app.

They lived in `screenshots/` until 9 September 2026 and so were **absent from every
fresh clone** — `screenshots/` is gitignored, because it is 8.1 GB of Edge profile
directories and PNGs. The scripts were 317 KB of that. They now live here, tracked;
`screenshots/` stays ignored and holds only what they write.

## Before you run anything

| | |
|---|---|
| **Node** | 24 or newer. The browser drivers use a **global `WebSocket`**, which is what makes them dependency-free. On Node 22 they fail with `WebSocket is not defined`. |
| **Edge** | All 18 browser scripts hardcode `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` and speak Chrome DevTools Protocol to it. Nothing is installed for you. `drive`, `mobile-audit` and `market-ui` also find their own Edge with PowerShell's `Get-CimInstance Win32_Process`. So **the browser scripts run on Windows only**, and none of them is in CI. |
| **Working directory** | **Always the repo root.** Every path in every script resolves against `process.cwd()`, not against the script's own location. `cd tools && node verify/drive.mjs` will not work. Three exceptions resolve their paths from their own location and so run from any directory: `fetch-market-data.mjs`, `verify/glyph-audit.mjs` and `verify/market-lib-test.mjs`. |
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
node tools/verify/drive.mjs                # 4. the main gate, 40 page loads
```

Step 3 creates `screenshots/` itself if it is absent, so you do not need to
`mkdir` anything. Expect `good` to report **14 schemes, scores [100,90], 6 tiers,
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
node tools/parity4.mjs        # i18n parity + figures, 4 files x 8 languages, 8 checks
node tools/keycheck.mjs       # key USE vs key definition (the other half of parity4)
node tools/verify/glyph-audit.mjs   # decorative glyphs missing aria-hidden; report only
node --test tools/verify/market-lib-test.mjs   # the market fetch's logic, 185 tests, no network or key
```

`parity4`'s eight checks, as its summary line names them: missing or extra keys,
duplicate keys, cross-file collisions, identical to English, placeholder drift,
figures vs English, Latin digits only, figures vs schemes.json. The last three
compare numbers:

- **figures vs English**: every translation carries the same ASCII digit runs as
  the English (`10,000`, `35`, `1.5`).
- **Latin digits only**: no non-ASCII digit (Devanagari `४`, Bengali `৫`) in any
  value, English included.
- **figures vs schemes.json**: each `schemeStrings.js` English sentence carries the
  same figures as the `schemes.json` sentence its code stands for.

Measured on 25 Sept 2026 (`node tools/parity4.mjs`), over **693 keys, 5,544
strings**:

| Check | Compared | Failing | Allowlisted |
|---|---|---|---|
| 6. figures vs English | 4,851 translated values | 0 | 4: `elig.common.class8` in hi, ml, mr, bn |
| 7. Latin digits only | 5,544 values | 0 | none |
| 8. figures vs schemes.json | 312 sentences across 30 schemes | 0 | 1: `sdata.pmvishwakarma.description` |

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
check fires without editing the real files. The summary line names each failing
check with its count.

`keycheck` measured the same day: 449 keys referenced in `frontend/src`, 263
translation codes emitted by the backend, 0 leaked, 0 untranslated, 0 unmapped, and
6 keys defined but referenced by neither side (`an.afterEmi`,
`business.categoryHint`, `ch.coinTitle`, `common.back`, `common.continue`,
`common.required`). It was 7. The six are dead weight, not defects.

**CI** (`.github/workflows/ci.yml`) is set up to run on `ubuntu-latest` on every
push and pull request. The backend job runs `pytest` on Python 3.10 and 3.14. The
frontend job runs `npm ci`, `npm run lint`, `npm run build`, `parity4`, `keycheck`
and `market-lib-test`, then `glyph-audit`, which always exits 0 and is there to be
read. **None of the browser scripts is in CI.** **CI has never run, on GitHub or
on Linux**, because the branch has not been pushed. Two scripts were changed for
Linux, by reading the code, not by running it there. `keycheck` turns every `\`
into `/` on both sides before it compares paths. Before that, its filter that
skips the four dictionary files matched only Windows paths, so on Linux every key
a dictionary defines would have counted as used. `glyph-audit` finds `frontend/src`
with `fileURLToPath`, not `URL.pathname`. Stripping the pathname's leading slash
left a relative `home/...` path on Linux, and a `%20` in the path was never
decoded.

Need the **Vite dev server** on 5173:

```bash
node tools/verify/drive.mjs          # 8 passes, 40 page loads + scheme cards — the main gate; exits 1 on a finding
node tools/verify/mobile-audit.mjs   # 360/390/412 px, 40 page loads
node tools/verify/lang-layout.mjs    # 8 languages x 6 routes x 2 widths = 96 loads
node tools/verify/field-align.mjs    # form controls sharing a grid row, 96 loads
node tools/verify/print-audit.mjs    # the @media print stylesheet, 3 renders
node tools/verify/motion-audit.mjs   # transitions actually run + reduced-motion
node tools/verify/scroll-audit.mjs   # every route opens at the TOP of the page
node tools/verify/text-align.mjs     # sibling cells start their text on one line
node tools/verify/hero-art.mjs       # landing backdrop visibility + hero copy AA
node tools/verify/hero-geom.mjs      # backdrop edge vs the content sitting on it; report only
node tools/verify/brand-mark.mjs     # the lotus mark in both themes
node tools/verify/manual-audit.mjs   # wordmark + book icon + manual dialog
node tools/verify/error-banner.mjs   # the /finance error banner in 8 languages
```

`drive`'s eighth pass, `cleared`, loads the four result pages in Hindi with the
`good` answers, no result and `resultCleared: true`: the state after someone edits
an answer once a result exists. It fails on `CLEARED STATE MISSING` (the
`res.changedTitle` or `res.changedButton` text is not on the page),
`WRONG EMPTY STATE` (the page shows its never-submitted text instead) and
`OLD RESULT SHOWN` (a bar, a coin chart, a rupee figure or one of the discarded
result's scheme names is still on the page). Every pass seeds `sessionStorage` at
version 2, and the script stops at start-up if `AppContext.jsx`'s
`READABLE_VERSIONS` no longer includes 2. Its raw-enum check also fails on the
household fields printed raw: `household_check`, `within_limit`, `over_limit`,
`not_checked`, `household_repayment_percent`, `household_in_microfinance_range`.

**Seed versions differ between scripts.** `AppContext.jsx` writes version 3 and
reads 1, 2 and 3; any other version is thrown away and the page shows the blank
form. `drive` seeds 2. `market-ui` reads `STORAGE_VERSION` out of `AppContext.jsx`
and seeds that. Six scripts still seed 1, which is still read: `error-banner`,
`lang-layout`, `mobile-audit`, `motion-audit`, `print-audit` and `scroll-audit`.
They should move to 3. `text-align` seeds the raw text of `case_good.json`, which
has no `{v, data}` wrapper, so by the code in `readStored()` the app discards it
and every route loads with no answers and no result. That was found by reading
the code on 25 Sept 2026, not measured in a browser, and it predates this branch.

`scroll-audit`'s start-over hop takes two clicks. The utility bar's ↺ button opens
a dialog and no longer navigates on its own, so the hop's `pre` expression finds
and clicks ↺ after the page is scrolled, and its `find` expression picks the second
of exactly two buttons in the open dialog, the confirm button. "No" is the first
button and takes focus. If the dialog has any other number of buttons, the hop
reports `NO-CONTROL`. The hop count stays at 33.

A hop's `pre` is now an expression that returns an element, and the harness
clicks it. If it returns nothing, the hop reports `NO-CONTROL` "opening control not
found". The instruction-manual hop's `pre` was a statement that did its own click,
`document.querySelector('button.ui-manual-open').click()`, and is now the element
expression `document.querySelector('button.ui-manual-open')`. `--broken`
still refutes the start-over hop, because the dialog sets no scroll lock.

Starts **its own Vite** on 5179, so it does not need yours (pass
`--url=http://localhost:5173` to use yours instead). Needs `case_good.json`:

```bash
node tools/verify/market-ui.mjs      # market cards + the sources block, 36 loads, 8 languages
```

Need `npm run preview` on **4173**, not dev:

```bash
node tools/verify/load-perf.mjs      # startup cost, medians of 5 cold loads
```

Helpers, the 7 that are not gates:

```bash
node tools/verify/refresh-cases.mjs  # fixture generator: rewrites the case_*.json the drivers seed from (needs the backend on 8000)
node tools/verify/hero-vibrance.mjs  # tuning instrument; exits 0 either way (needs Vite)
node tools/verify/art-contrast.mjs   # RETIRED — exits 2 by design
node tools/assetgen.mjs              # asset tool: regenerates the brand PNGs (needs Vite); see below
node tools/svgcheck.mjs              # asset tool: every SVG loads and paints; exits 1 on a refused one
node tools/third-party-notices.mjs   # regenerates THIRD_PARTY_NOTICES.md (needs .venv + node_modules)
node tools/fetch-market-data.mjs     # data fetch: refreshes market_data.json from data.gov.in (see below)
```

`assetgen`'s wordmark step is broken. It writes one `arthniti-wordmark-on-navy.png`,
clipped to the utility strip, and the strip has not held the wordmark since it moved
to the masthead on 11 Sept 2026, so the clip comes out with a negative height. Don't
rely on that step until it is fixed.

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

`node x.mjs | head -100` closes the pipe, Node takes `SIGPIPE` and dies **before its
final `writeFileSync`** — so `report.json` keeps the *previous* run's data while the
console shows the current one.

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
`mobile-audit` and `market-ui` find their own Edge by its profile path and kill it
by PID. The other fifteen (`assetgen`, `svgcheck`, `brand-mark`, `error-banner`,
`field-align`, `hero-art`, `hero-geom`, `hero-vibrance`, `lang-layout`, `load-perf`,
`manual-audit`, `motion-audit`, `print-audit`, `scroll-audit`, `text-align`) call only
`edge.kill()`, which misses the process Edge relaunches itself as. `hero-geom` and
`text-align` have also hung after writing a clean `report.json`. Treat `report.json`
as the authority, find a leftover by its debug port (`netstat -ano | grep :9355`),
and kill it by PID. Never kill by image name: `taskkill /IM msedge.exe` also closes
your own browser and any gate running beside this one. This is not rare: on
25 Sept 2026, repeated `motion-audit` runs left 8 headless Edges behind.

## Two things worth knowing about the design

**Each browser script uses its own CDP port and its own profile directory**, so two
can run at once: `drive` 9222, `mobile-audit` 9333, `hero-art` 9337, `brand-mark`
9339, `manual-audit` 9341, `lang-layout` 9343, `error-banner` 9347, `field-align`
9351, `hero-geom` 9355, `print-audit` 9359, `hero-vibrance` 9361, `load-perf` 9363,
`motion-audit` 9365, `scroll-audit` 9367, `text-align` 9371, `market-ui` 9373 — plus `assetgen` 9377
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

Five scripts have that refuter built in as a flag, and each **must exit 1** with it:

```bash
node tools/verify/motion-audit.mjs --broken   # 32 findings across all 10 planted kinds; exit 2 means one went unreported
node tools/verify/field-align.mjs  --broken
node tools/verify/scroll-audit.mjs --broken   # 33 findings: 32 hops + the back button
node tools/verify/text-align.mjs   --broken   # 30 findings, one per load
node tools/verify/market-ui.mjs    --broken   # 456 caught; exit 2 means one defect went uncaught
```

`scroll-audit` also carries the check in-band: a hop whose source page could not
be scrolled at least 200px is reported as `INERT` rather than counted as a pass,
because a navigation with no offset to carry over proves nothing either way.

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
the guard gone either), `ALWAYS-REDUCED` and `UNREACHABLE`. The script's own header
lists only three and misses `REDUCED-SCROLL`. `ABSENT` is not planted either; it
fired for real on the script's first run.

**And the corollary, which cost real time on the flip side: when a check *passes*
under the refuter, find out why.** One of `scroll-audit`'s 33 hops — the one that
leaves the instruction-manual dialog — is over-determined and passes with the fix
removed. Measured with a dedicated probe rather than assumed: the refuter is working
(`scrollTo` is swallowed exactly once, and a plain landing link from the same offset
does land at the destination's 706px maximum), but the dialog's scroll lock is
restored in a **passive effect cleanup that runs after paint**, so the destination's
first paint happens with a non-scrollable viewport and Chromium resets the offset to
0 instead of clamping it. An unexplained pass is indistinguishable from an inert
case, so do not read that run as 33-of-33 refuted.

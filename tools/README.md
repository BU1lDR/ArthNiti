# `tools/` — the verification suite

28 zero-dependency `.mjs` files. Most of them check things `npm run lint`,
`npm run build` and `pytest` structurally cannot see: a leaked translation key, a `null%`, a page that
scrolls sideways under a thumb, a `₹30,000` that wrapped as `₹30,00 / 0`, a logo
that prints invisible, a transition that silently does nothing, a route that opens
halfway down the page, a footer column whose heading starts 50px below its
neighbours'.

They lived in `screenshots/` until 9 September 2026 and so were **absent from every
fresh clone** — `screenshots/` is gitignored, because it is 8.1 GB of Edge profile
directories and PNGs. The scripts were 317 KB of that. They now live here, tracked;
`screenshots/` stays ignored and holds only what they write.

## Before you run anything

| | |
|---|---|
| **Node** | 24 or newer. The browser drivers use a **global `WebSocket`**, which is what makes them dependency-free. On Node 22 they fail with `WebSocket is not defined`. |
| **Edge** | Must be installed at the default Windows location. The drivers speak Chrome DevTools Protocol to it. Nothing is installed for you. |
| **Working directory** | **Always the repo root.** Every path in every script resolves against `process.cwd()`, not against the script's own location. `cd tools && node verify/drive.mjs` will not work. The one exception is `fetch-market-data.mjs`, which resolves its paths from its own location. |
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
node tools/verify/drive.mjs                # 4. the main gate, 36 page loads
```

Step 3 creates `screenshots/` itself if it is absent, so you do not need to
`mkdir` anything. Expect `good` to report **14 schemes, scores [100,90], 6 tiers,
fit {state 3, national 11}, and 1 market row, a `registered_units` count** — if it
does not, the backend changed and the figures in CLAUDE.md
need re-measuring, not the script.

## The scripts

No server needed — run these first, they are fast and catch the most:

```bash
node tools/parity4.mjs        # i18n key parity, 4 files x 8 languages, 5 checks
node tools/keycheck.mjs       # key USE vs key definition (the other half of parity4)
node tools/svgcheck.mjs       # every SVG loads and paints
node tools/verify/glyph-audit.mjs   # decorative glyphs missing aria-hidden
node --test tools/verify/market-lib-test.mjs   # the market fetch's logic, 185 tests, no network or key
```

Need the **Vite dev server** on 5173:

```bash
node tools/verify/drive.mjs          # 7 passes, 36 page loads + scheme cards — the main gate; exits 1 on a finding
node tools/verify/mobile-audit.mjs   # 360/390/412 px, 40 page loads
node tools/verify/lang-layout.mjs    # 8 languages x 6 routes x 2 widths = 96 loads
node tools/verify/field-align.mjs    # form controls sharing a grid row, 96 loads
node tools/verify/print-audit.mjs    # the @media print stylesheet, 3 renders
node tools/verify/motion-audit.mjs   # transitions actually run + reduced-motion
node tools/verify/scroll-audit.mjs   # every route opens at the TOP of the page
node tools/verify/text-align.mjs     # sibling cells start their text on one line
node tools/verify/hero-art.mjs       # landing backdrop visibility + hero copy AA
node tools/verify/hero-geom.mjs      # backdrop edge vs the content sitting on it
node tools/verify/brand-mark.mjs     # the lotus mark in both themes
node tools/verify/manual-audit.mjs   # wordmark + book icon + manual dialog
node tools/verify/error-banner.mjs   # the /finance error banner in 8 languages
```

Starts **its own Vite** on 5179, so it does not need yours (pass
`--url=http://localhost:5173` to use yours instead). Needs `case_good.json`:

```bash
node tools/verify/market-ui.mjs      # market cards + the sources block, 36 loads, 8 languages
```

Need the **backend** on 8000:

```bash
node tools/verify/refresh-cases.mjs  # regenerate drive.mjs's fixtures
```

Need `npm run preview` on **4173**, not dev:

```bash
node tools/verify/load-perf.mjs      # startup cost, medians of 5 cold loads
```

Not gates:

```bash
node tools/verify/hero-vibrance.mjs  # a tuning instrument; exits 0 either way
node tools/verify/art-contrast.mjs   # RETIRED — exits 2 by design
node tools/assetgen.mjs              # regenerates the brand PNGs (needs Vite)
node tools/merge-err-keys.mjs        # one-shot dictionary helper
node tools/third-party-notices.mjs   # regenerates THIRD_PARTY_NOTICES.md (needs .venv + node_modules)
node tools/fetch-market-data.mjs     # refreshes market_data.json from data.gov.in (see below)
```

`fetch-market-data.mjs` is a dry run unless you pass `--write`: it fetches, checks
every row and prints what would change. It needs your own data.gov.in key in
`.env` (copy `.env.example`); it never prints the key. `--sample` uses the public
sample key, never reads `.env` and never writes. The usual refresh is
`node tools/fetch-market-data.mjs --write --resume`, then `refresh-cases.mjs` and
the gates. It is the only script here that goes to the internet, and
`market-lib.mjs` beside it is the library it and `market-lib-test.mjs` share, not
a script to run.

## Five traps that will cost you an hour each

**Run `refresh-cases.mjs` after any backend change.** `drive.mjs` seeds
`sessionStorage` from three captured JSON responses. Those go stale **silently** —
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
your own browser and any gate running beside this one.

## Two things worth knowing about the design

**Each browser script uses its own CDP port and its own profile directory**, so two
can run at once: `drive` 9222, `mobile-audit` 9333, `hero-art` 9337, `brand-mark`
9339, `manual-audit` 9341, `lang-layout` 9343, `error-banner` 9347, `field-align`
9351, `hero-geom` 9355, `print-audit` 9359, `hero-vibrance` 9361, `load-perf` 9363,
`motion-audit` 9365, `scroll-audit` 9367, `text-align` 9371, `market-ui` 9373 — plus `assetgen` 9377
and `svgcheck` 9378, which drive a browser without being gates. 9369 is left free on
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
node tools/verify/motion-audit.mjs --broken   # 29 findings across 10 kinds
node tools/verify/field-align.mjs  --broken
node tools/verify/scroll-audit.mjs --broken   # 33 findings, one per hop
node tools/verify/text-align.mjs   --broken   # 30 findings, one per load
node tools/verify/market-ui.mjs    --broken   # 456 caught; exit 2 means one defect went uncaught
```

`scroll-audit` also carries the check in-band: a hop whose source page could not
be scrolled at least 200px is reported as `INERT` rather than counted as a pass,
because a navigation with no offset to carry over proves nothing either way.

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

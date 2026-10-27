// load-perf.mjs — where the frontend's startup time actually goes.
//
// Every other verifier here asks whether the page is CORRECT. This one asks how
// long it takes to become correct, which none of them measure and which no amount
// of reading the build output tells you: `vite build` reports transfer size, and
// transfer size is not the cost that matters on a phone. A 1MB bundle over LAN
// arrives in milliseconds and then costs 200-400ms of PARSE + EXECUTE on a low-end
// device -- time the reader spends looking at a blank page.
//
// So it separates the two, because they have opposite fixes:
//   - transfer  -> fixed by shipping fewer bytes (chunk splitting, lazy loading)
//   - execute   -> fixed by RUNNING less at module load, which splitting does not
//                  change at all: the same modules still evaluate in the same order.
//
// It also times the i18n merge specifically. strings.js builds 8 language tables at
// module scope -- one property copy per key per language before React mounts, and
// the key count is whatever parity4 measures today -- and that is the one piece of
// real computation on the startup path, so it is the one worth having a number for
// rather than an opinion.
//
// Needs a built bundle served by `vite preview` on 4173, not `npm run dev` -- dev
// serves unbundled modules and unminified source, so every figure would describe a
// pipeline that never ships. From ./frontend:
//
//   npm run build:local && npm run preview
//
// A plain `npm run build` now fails on purpose: vite.config.js refuses a mode
// production build unless VITE_API_BASE_URL starts with https://. build:local is
// `vite build --mode loopback`, the same minified bundle with the loopback API
// fallback kept (only the inlined MODE string and the API URL differ), so the
// load figures stay comparable with earlier runs. The other way is a production
// build with a placeholder URL, since this script never calls the API:
//
//   VITE_API_BASE_URL=https://api.example.invalid npm run build && npm run preview
//
// Zero dependencies, own CDP port and profile.
//
// Exit 0: every load mounted. 1: a load did not mount. 2: the run could not
// measure: the preview server is down at the start or lost mid-run (a navigation
// to it that fails, or a load that lands on Edge's own error page or a non-2xx
// answer), the working directory is wrong, a dictionary table this cannot read,
// Edge never opens its DevTools endpoint (the poll takes about 20 s when nothing
// listens on the port, and about 3 minutes, measured at 184 s, when a listener
// accepts and never answers), Edge's CDP socket fails to open or closes mid-run,
// the script crashed, or the run stopped short of its verdict. The timings are a
// report and never fail the run.
// report.json carries the same code as `exit`. A load that the probe finds on
// the error page or a non-2xx is written as "exit": 2; every other 2 leaves no
// report.

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const ORIGIN = "http://localhost:4173"; // vite preview
const PORT = 9363; // its own port -- see CLAUDE.md on why these must not collide
const PROFILE = resolve("screenshots/verify/perf-profile"); // MUST be absolute
const OUT = resolve("screenshots/verify/perf");

// 0 means the run measured and found nothing, 1 a finding, and 2 that the run
// could not measure. Node's own exit on an uncaught error is 1, which reads as a
// finding, so anything thrown or rejected that nothing catches exits 2 instead.
// The dictionary read below is one: it throws at startup when it cannot read a
// table.
process.on("uncaughtException", (err) => {
  console.error(err);
  crashExit();
});
// A crash exits 2 through this rather than process.exit(2) at once. For up to
// about 100 ms after fetch() reads a response, V8 can still be recompiling
// undici's WASM HTTP parser on a worker thread, and exiting in that window kills
// node with 0xC0000409 (Git Bash shows 127): neither 0, 1 nor 2. The wait
// blocks this thread, so nothing else of the run happens meanwhile.
// tools/README.md, Exit codes, has the measurements.
function crashExit() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  process.exit(2);
}
// A run that ends without reaching its verdict exits 2. Before this, a CDP
// socket that closed under a pending rpc left it unsettled, the event loop
// drained, and node exited 0 with no report. The verdict overrides it.
process.exitCode = 2;
// Every path in this file resolves against the working directory.
if (!existsSync(resolve("tools/verify/load-perf.mjs"))) {
  console.error(`load-perf: ${process.cwd()} is not the repo root. Run this from the repo root: node tools/verify/load-perf.mjs`);
  process.exit(2);
}
// A report.json on disk is always from a run that finished. The last run's
// goes once the working directory has been checked, so a run that stops early
// leaves none.
rmSync(resolve(OUT, "report.json"), { force: true });

// A server that is down used to be measured: Edge's own error page loaded fast,
// did not mount, and every load failed as a finding about the app.
// It returns false with exitCode 2 set, and main() returns before Edge starts,
// so node exits on its own: process.exit() this soon after a fetch can abort
// it (see crashExit).
async function requireServer(url, start) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    await res.body?.cancel();
    if (res.ok) return true;
    console.error(`load-perf: ${url} answered HTTP ${res.status}. ${start}`);
  } catch (err) {
    console.error(`load-perf: nothing answered at ${url} (${err.cause?.code || err.name}). ${start}`);
  }
  process.exitCode = 2;
  return false;
}

const EDGE =
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

// CPU multipliers. 1 is this laptop; the others are what the audience actually
// holds. A mid-range Android is roughly 4x slower than a dev machine single-core,
// and the cheapest phones a rural micro-entrepreneur is likely to own are worse
// than that -- which is the whole reason execute time is worth measuring.
const THROTTLES = [
  { label: "desktop", rate: 1 },
  { label: "mid-phone-4x", rate: 4 },
  { label: "low-phone-8x", rate: 8 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A call on a socket that has closed, or that closes before its reply, rejects,
// so a dead Edge ends the run as a crash. undici's send() on a closed socket
// drops the frame without throwing, and the call used to wait on a reply that
// never came (see process.exitCode above).
async function rpc(ws, method, params, sessionId) {
  if (ws.readyState !== WebSocket.OPEN) throw new Error(method + ": CDP socket closed");
  const id = rpc.n = (rpc.n || 0) + 1;
  const msg = { id, method, params: params || {} };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    const on = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id !== id) return;
      off();
      d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result);
    };
    const closed = () => {
      off();
      rej(new Error(method + ": CDP socket closed"));
    };
    const off = () => {
      ws.removeEventListener("message", on);
      ws.removeEventListener("close", closed);
    };
    ws.addEventListener("message", on);
    ws.addEventListener("close", closed);
  });
}

// Polled, as in the other gates. This used to be one fetch after a fixed 2.5 s
// wait, so an Edge slower to start than that (a fresh profile, a loaded machine)
// made a healthy run exit 2. Each try is bounded: a listener that accepts and
// never answers would otherwise hold it for undici's five-minute header timeout.
async function browserWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) })).json();
      if (info.webSocketDebuggerUrl) return info.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    await sleep(250);
  }
  throw new Error(`load-perf: Edge never opened the DevTools endpoint on port ${PORT}`);
}

// The probe. Runs in the page after load and reads the real Performance entries
// rather than wall-clock around the navigation, because wall-clock cannot tell
// transfer apart from execute -- which is the entire point of this script.
const PROBE = `(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paints = {};
  for (const p of performance.getEntriesByType('paint')) paints[p.name] = p.startTime;

  // EVERY resource the document pulled. This deliberately does not filter by
  // initiatorType: the first version of this probe kept only script/link/css and
  // silently dropped six of nine chunks, because a chunk pulled by
  // <link rel="modulepreload"> does not report the initiatorType you would guess.
  // The totals then described 3 assets in both builds while one of those 3 was the
  // entire pre-split bundle -- a comparison that looked like a 3x improvement and
  // was an artefact of the filter. Sum everything, then break it down.
  const assets = performance.getEntriesByType('resource')
    .map(r => ({
      name: r.name.split('/').pop(),
      kind: r.initiatorType || 'other',
      ms: Math.round(r.duration * 10) / 10,
      transferKB: Math.round(r.transferSize / 102.4) / 10,
      decodedKB: Math.round(r.decodedBodySize / 102.4) / 10,
    }));

  return {
    // Time to the first pixel of content. This is what the reader experiences.
    firstPaint: Math.round((paints['first-paint'] || 0) * 10) / 10,
    firstContentfulPaint: Math.round((paints['first-contentful-paint'] || 0) * 10) / 10,
    domContentLoaded: Math.round((nav.domContentLoadedEventEnd || 0) * 10) / 10,
    loadEvent: Math.round((nav.loadEventEnd || 0) * 10) / 10,
    // Bytes over the wire vs bytes the engine had to parse.
    transferKB: Math.round(assets.reduce((s, a) => s + a.transferKB, 0) * 10) / 10,
    decodedKB: Math.round(assets.reduce((s, a) => s + a.decodedKB, 0) * 10) / 10,
    assets,
    // Did the app actually mount? A fast blank page is not a fast page, and
    // without this every figure above could be describing a crash.
    mounted: !!document.querySelector('.ui-shell'),
    rendered: (document.querySelector('#root')?.innerText || '').trim().length,
    // And was it the app at all? Edge's own error page is chrome-error:, and an
    // answer that is not a 2xx is not the app either. 0 means Edge did not say.
    protocol: location.protocol,
    status: nav.responseStatus || 0,
  };
})()`;

// The i18n merge, timed on its own. The bundle's own tables cannot be reached from
// here -- it is minified and exports nothing -- so this re-runs strings.js merge()
// on the same data: this tree's four dictionaries, one table per file per language,
// embedded as object literals as the bundle holds them and spread in the same
// order. The figure describes the bundle only if it was built from this tree.
//
// The first version of this probe did not do that. It sampled the landing page's
// rendered text (76 strings, under a cap of 619 left over from an older key count)
// and spread that one table four times into each language's table: 2,432 copies,
// three in four of them overwriting a key the first spread had just added, where
// the real merge makes 5,856 and every one adds a key. Nothing failed; the figure
// was just small.
//
// Each dictionary file holds one `const xx = {...}` literal per language, closed by
// a `}` at the start of a line, which is the layout parity4 reads. They are
// evaluated rather than imported: strings.js imports its siblings without an
// extension, which Vite resolves and Node does not, and it keeps its own part of
// each table private. A literal that uses another module's constant throws here.
// The name is any identifier, not two letters, so a language with only a
// three-letter code (mai, sat, kok) is not silently left out.
const I18N_DIR = resolve("frontend/src/i18n");
const DICTIONARIES = ["strings.js", "resultStrings.js", "backendStrings.js", "schemeStrings.js"];

function dictionaryTables() {
  const perFile = DICTIONARIES.map((file) => {
    const text = readFileSync(resolve(I18N_DIR, file), "utf8");
    const byLanguage = {};
    for (const [, code, body] of text.matchAll(/^const (\w+) = (\{[\s\S]*?^\})/gm)) {
      byLanguage[code] = runInNewContext(`(${body})`);
    }
    return byLanguage;
  });
  const codes = Object.keys(perFile[0]);
  if (!codes.length) throw new Error(`load-perf: no language tables found in ${DICTIONARIES[0]}`);
  // merge() fills a missing table with {}. Here a gap more likely means this script
  // no longer reads the layout, and timing the smaller merge would bring back the
  // small figure described above, so it throws instead.
  const tables = {};
  for (const code of codes) {
    tables[code] = perFile.map((byLanguage, i) => {
      if (!byLanguage[code]) throw new Error(`load-perf: no ${code} table found in ${DICTIONARIES[i]}`);
      return byLanguage[code];
    });
  }
  return tables;
}

const mergeProbe = (tables) => `(() => {
  const tables = ${JSON.stringify(tables)};
  const t0 = performance.now();
  const out = {};
  for (const code in tables) {
    const [base, result, backend, scheme] = tables[code];
    out[code] = { ...base, ...result, ...backend, ...scheme };
  }
  const t1 = performance.now();

  const codes = Object.keys(tables);
  return {
    languages: codes.length,
    keysPerLanguage: Object.keys(out[codes[0]]).length,
    propertyCopies: codes.reduce((n, c) => n + tables[c].reduce((m, t) => m + Object.keys(t).length, 0), 0),
    mergeMs: Math.round((t1 - t0) * 1000) / 1000,
  };
})()`;

// Built at startup, before Edge exists, so a dictionary this cannot read leaves no
// browser behind.
const MERGE_PROBE = mergeProbe(dictionaryTables());

async function main() {
  if (!(await requireServer(ORIGIN + "/", "Start the preview server first: npm run build:local && npm run preview in ./frontend."))) return;
  // A stray headless Edge from a previous run keeps a lock on the profile, and on
  // Windows that surfaces as EPERM rather than as anything about the browser. Not
  // fatal: a reused profile does not affect these measurements, since the cache is
  // cleared per case below. Failing here instead would make a leaked process look
  // like a filesystem problem.
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch (e) {
    console.log(`note: reusing profile dir (${e.code}) -- cache is cleared per case anyway`);
  }
  mkdirSync(OUT, { recursive: true });

  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { stdio: "ignore", detached: false });

  const results = [];
  let failures = 0;
  let faults = 0;
  let ws = null;
  // Everything that can fail after the spawn is inside this try, so Edge is
  // killed on every way out, a crash included: main().catch cannot reach it.
  try {
    ws = new WebSocket(await browserWsUrl());
    // A handshake that fails fires error and close, never open.
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", () => rej(new Error("load-perf: the CDP socket failed to open")));
      ws.addEventListener("close", () => rej(new Error("load-perf: the CDP socket closed before it opened")));
    });

    const { targetId } = await rpc(ws, "Target.createTarget", { url: "about:blank" });
    const { sessionId } = await rpc(ws, "Target.attachToTarget", { targetId, flatten: true });

    // Five loads per case, reported as a median. One sample is not a measurement
    // here: the first version of this script read FCP as 456 / 272 / 480 ms going
    // 1x -> 4x -> 8x, i.e. FASTER on a slower CPU, which cannot be true and is the
    // giveaway that scheduling noise was larger than the effect being measured. A
    // median over repeats is what makes a 20ms difference between two builds mean
    // anything at all.
    const REPEATS = 5;
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
    };

    const read = async (expr) => {
      const r = await rpc(ws, "Runtime.evaluate",
        { expression: expr, returnByValue: true, awaitPromise: false }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };

    for (const { label, rate } of THROTTLES) {
      await rpc(ws, "Page.enable", {}, sessionId);
      await rpc(ws, "Runtime.enable", {}, sessionId);
      // A cold cache every time. A warm one measures the second visit, and the
      // first visit is the one that decides whether the demo looks slow.
      await rpc(ws, "Network.enable", {}, sessionId);
      await rpc(ws, "Emulation.setCPUThrottlingRate", { rate }, sessionId);

      const samples = [];
      let perf;

      for (let i = 0; i < REPEATS; i++) {
        await rpc(ws, "Network.clearBrowserCache", {}, sessionId);
        await rpc(ws, "Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
        // about:blank between loads, so each navigation is a fresh document and the
        // Performance entries are this load's rather than accumulated across five.
        await rpc(ws, "Page.navigate", { url: "about:blank" }, sessionId);
        await sleep(200);
        // The pre-flight checks the server once. One that goes mid-run fails the
        // navigation, and Edge's error page in its place never mounts, so every
        // load left would have counted against the app.
        const nav = await rpc(ws, "Page.navigate", { url: ORIGIN + "/" }, sessionId);
        if (nav.errorText) throw new Error(`load-perf: ${ORIGIN}/ did not load on ${label} run ${i + 1} (${nav.errorText}). Is the preview server still up?`);
        await sleep(1200 + rate * 400);

        perf = await read(PROBE);
        samples.push(perf);

        // A load that did not reach the app says nothing about the app: a fault,
        // written as "exit": 2, not a load that failed to mount.
        if (perf.protocol === "chrome-error:" || (perf.status && (perf.status < 200 || perf.status > 299))) {
          faults++;
          console.error(`FAULT ${label} run ${i + 1}: not the app (${perf.protocol === "chrome-error:" ? "Edge's own error page" : "HTTP " + perf.status})`);
        } else if (!perf.mounted || perf.rendered < 200) {
          failures++;
          console.log(`FAIL ${label} run ${i + 1}: app did not mount (rendered ${perf.rendered} chars)`);
        }
      }

      const agg = {
        label,
        cpuRate: rate,
        runs: REPEATS,
        firstContentfulPaint: median(samples.map((s) => s.firstContentfulPaint)),
        domContentLoaded: median(samples.map((s) => s.domContentLoaded)),
        loadEvent: median(samples.map((s) => s.loadEvent)),
        // Byte counts are deterministic, so the last run's are the run's.
        transferKB: perf.transferKB,
        decodedKB: perf.decodedKB,
        requests: perf.assets.length,
        assets: perf.assets,
        mounted: perf.mounted,
        rendered: perf.rendered,
        spread: {
          dclMin: Math.min(...samples.map((s) => s.domContentLoaded)),
          dclMax: Math.max(...samples.map((s) => s.domContentLoaded)),
        },
      };
      results.push(agg);

      console.log(`\n--- ${label} (CPU ${rate}x, median of ${REPEATS}) ---`);
      console.log(`  first contentful paint  ${agg.firstContentfulPaint} ms`);
      console.log(`  DOMContentLoaded        ${agg.domContentLoaded} ms   (range ${agg.spread.dclMin}-${agg.spread.dclMax})`);
      console.log(`  load event              ${agg.loadEvent} ms`);
      console.log(`  transfer / decoded      ${agg.transferKB} KB / ${agg.decodedKB} KB over ${agg.requests} requests`);
      console.log(`  mounted                 ${agg.mounted} (${agg.rendered} chars rendered)`);
      for (const a of agg.assets) {
        console.log(`    ${a.kind.padEnd(8)} ${a.name.padEnd(30)} ${String(a.ms).padStart(7)} ms  ${String(a.transferKB).padStart(7)} KB wire  ${String(a.decodedKB).padStart(8)} KB decoded`);
      }
    }

    // The merge runs only after every load is measured: its tables are nearly 1 MB of
    // literals, and their garbage would otherwise land in the next load's figures.
    // A fresh document per run, as the real merge runs once in a fresh one, and a
    // median over five like the load figures.
    console.log(`\n--- i18n merge model (median of ${REPEATS}) ---`);
    for (const agg of results) {
      await rpc(ws, "Emulation.setCPUThrottlingRate", { rate: agg.cpuRate }, sessionId);
      const runs = [];
      for (let i = 0; i < REPEATS; i++) {
        await rpc(ws, "Page.navigate", { url: "about:blank" }, sessionId);
        await sleep(200);
        runs.push(await read(MERGE_PROBE));
      }
      // The counts are the same every run, so the first run's stand for all five.
      agg.merge = { ...runs[0], runs: REPEATS, mergeMs: median(runs.map((r) => r.mergeMs)) };
      console.log(`  ${agg.label.padEnd(14)} ${agg.merge.mergeMs} ms for ${agg.merge.propertyCopies} property copies (${agg.merge.keysPerLanguage} keys x ${agg.merge.languages} languages)`);
    }
  } finally {
    try { ws?.close(); } catch {}
    try { edge.kill(); } catch {}
  }

  // Whole-run write LAST and in one go -- never pipe this script through `head`,
  // see CLAUDE.md: the closed pipe throws EPIPE and stops node before this line.
  // The file used to keep the previous run while the console showed the current
  // one; the last report now goes at startup, so a stopped run leaves none.
  const exit = faults ? 2 : failures ? 1 : 0;
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ exit, origin: ORIGIN, results }, null, 2));

  await sleep(300);
  try { process.kill(edge.pid); } catch {}

  console.log(`\nwrote ${resolve(OUT, "report.json")}`);
  process.exit(exit);
}

// A crash is not a finding.
main().catch((e) => { console.error(e); crashExit(); });

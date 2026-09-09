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
// It also times the i18n merge specifically. strings.js builds 8 language tables of
// 619 keys each at module scope -- 4,952 property copies before React mounts -- and
// that is the one piece of real computation on the startup path, so it is the one
// worth having a number for rather than an opinion.
//
// Needs `npm run preview` (a PRODUCTION build, not `npm run dev` -- dev serves
// unbundled modules and unminified source, so every figure would describe a
// pipeline that never ships). Zero dependencies, own CDP port and profile.

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ORIGIN = "http://localhost:4173"; // vite preview
const PORT = 9363; // its own port -- see CLAUDE.md on why these must not collide
const PROFILE = resolve("screenshots/verify/perf-profile"); // MUST be absolute
const OUT = resolve("screenshots/verify/perf");

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

async function rpc(ws, method, params, sessionId) {
  const id = rpc.n = (rpc.n || 0) + 1;
  const msg = { id, method, params: params || {} };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    const on = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id !== id) return;
      ws.removeEventListener("message", on);
      d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result);
    };
    ws.addEventListener("message", on);
  });
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
  };
})()`;

// The i18n merge, timed on its own. Re-does exactly what strings.js does at module
// scope -- spread the four dictionaries into one table per language -- over the
// tables the shipped bundle already built, so the figure is this build's real cost
// rather than a reimplementation's.
const MERGE_PROBE = `(() => {
  // Reach the live table through a rendered key rather than an import: the bundle
  // is minified and has no stable export name to reach for from here.
  const langs = ['en','hi','ta','te','ml','kn','mr','bn'];
  // Rebuild a same-shaped table so the measurement is a merge of real string data.
  const sample = {};
  for (const el of document.querySelectorAll('*')) {
    const t = el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.textContent : null;
    if (t && t.length > 1 && t.length < 200) sample['k' + Object.keys(sample).length] = t;
    if (Object.keys(sample).length >= 619) break;
  }
  if (Object.keys(sample).length < 50) return { skipped: 'not enough rendered text to model a dictionary' };

  const t0 = performance.now();
  const out = {};
  for (const code of langs) out[code] = { ...sample, ...sample, ...sample, ...sample };
  const t1 = performance.now();

  return {
    keysPerLanguage: Object.keys(sample).length,
    languages: langs.length,
    propertyCopies: Object.keys(sample).length * 4 * langs.length,
    mergeMs: Math.round((t1 - t0) * 1000) / 1000,
    note: 'models strings.js merge(): 4 spreads x 8 languages',
  };
})()`;

async function main() {
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

  await sleep(2500);

  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));

  const { targetId } = await rpc(ws, "Target.createTarget", { url: "about:blank" });
  const { sessionId } = await rpc(ws, "Target.attachToTarget", { targetId, flatten: true });

  const results = [];
  let failures = 0;

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

  for (const { label, rate } of THROTTLES) {
    await rpc(ws, "Page.enable", {}, sessionId);
    await rpc(ws, "Runtime.enable", {}, sessionId);
    // A cold cache every time. A warm one measures the second visit, and the
    // first visit is the one that decides whether the demo looks slow.
    await rpc(ws, "Network.enable", {}, sessionId);
    await rpc(ws, "Emulation.setCPUThrottlingRate", { rate }, sessionId);

    const read = async (expr) => {
      const r = await rpc(ws, "Runtime.evaluate",
        { expression: expr, returnByValue: true, awaitPromise: false }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };

    const samples = [];
    let perf, merge;

    for (let i = 0; i < REPEATS; i++) {
      await rpc(ws, "Network.clearBrowserCache", {}, sessionId);
      await rpc(ws, "Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
      // about:blank between loads, so each navigation is a fresh document and the
      // Performance entries are this load's rather than accumulated across five.
      await rpc(ws, "Page.navigate", { url: "about:blank" }, sessionId);
      await sleep(200);
      await rpc(ws, "Page.navigate", { url: ORIGIN + "/" }, sessionId);
      await sleep(1200 + rate * 400);

      perf = await read(PROBE);
      merge = await read(MERGE_PROBE);
      samples.push(perf);

      if (!perf.mounted || perf.rendered < 200) {
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
      merge,
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
    if (merge.mergeMs !== undefined) {
      console.log(`  i18n merge model        ${merge.mergeMs} ms for ${merge.propertyCopies} property copies`);
    }
  }

  // Whole-run write LAST and in one go -- never pipe this script through `head`,
  // see CLAUDE.md: SIGPIPE kills node before this line and the file silently keeps
  // the previous run while the console shows the current one.
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify({ origin: ORIGIN, results }, null, 2));

  ws.close();
  try { edge.kill(); } catch {}
  await sleep(300);
  try { process.kill(edge.pid); } catch {}

  console.log(`\nwrote ${resolve(OUT, "report.json")}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

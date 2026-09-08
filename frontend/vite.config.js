import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        // Split one 1,018 kB chunk into seven. Measured, not assumed -- see
        // screenshots/verify/load-perf.mjs, medians of 5 cold loads per case:
        //
        //   DOMContentLoaded   1 chunk            7 chunks
        //   desktop             66.2ms (65-80)     48.0ms (44-55)    -27%
        //   mid-phone  (4x)    202.7ms (186-218)  139.1ms (130-146)  -31%
        //   low-phone  (8x)    487.4ms (453-507)  393.6ms (368-412)  -19%
        //
        // The ranges do not overlap at any tier, so this is an effect rather than
        // noise. The browser downloads and parses seven chunks concurrently where it
        // had to walk one, and the win grows with how slow the device is -- which is
        // the direction that matters for a rural micro-entrepreneur's phone.
        //
        // It costs +1.3 kB over the wire. Total gzip actually went DOWN slightly
        // (233.61 -> 233.12 kB), which is worth recording because the obvious
        // objection to splitting these particular files is that gzip compresses each
        // stream separately and should lose the cross-file redundancy between eight
        // Indic dictionaries. Measured, it does not: each chunk is more internally
        // homogeneous than the concatenation was, and that pays for the boilerplate.
        //
        // NOTHING IS LAZY HERE. Every group is still a static import, so the module
        // graph, the execution order and the behaviour are exactly what they were --
        // this changes only how the same modules are packaged. That is what made it
        // safe to do two days before the round, and it is the line to hold: making a
        // dictionary load on demand is a different change with a different risk (a
        // flash of English on the language switch, which is the strongest single
        // moment in the demo).
        //
        // Splitting by FILE rather than by LANGUAGE is also deliberate. Per-language
        // chunks would cut the initial payload by ~52%, but the dictionaries are
        // eight objects inside four files and a bundler cannot split an object
        // literal's properties -- that needs the source restructured, which breaks
        // parity4.mjs and keycheck.mjs, both of which parse those files statically.
        //
        // Each test names its file exactly, terminated by `\.js`. That is worth the
        // few extra characters: `strings` as a loose pattern happens not to match
        // `resultStrings.js` or `schemeStrings.js`, but only because those spell it
        // with a capital S -- so three groups that look like they overlap are kept
        // apart by nothing but the casing of a filename. Anchoring removes the
        // question, and a rename that breaks a group now produces an obviously
        // unsplit chunk rather than two dictionaries silently sharing one.
        //
        // Both slash classes are there because the test runs against whatever path
        // separator the platform produced; this repo is developed on Windows.
        codeSplitting: {
          groups: [
            { name: 'i18n-schemes', test: /i18n[\\/]schemeStrings\.js/ },
            { name: 'i18n-results', test: /i18n[\\/]resultStrings\.js/ },
            { name: 'i18n-ui', test: /i18n[\\/](strings|backendStrings)\.js/ },
            { name: 'locations', test: /data[\\/]indiaLocations\.js/ },
            { name: 'vendor', test: /node_modules/ },
          ],
        },
      },
    },
  },
})

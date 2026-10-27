// Tests for AppContext's answer state: the one place an answer changes
// (applyEdit), what the voice-and-text helper writes (applyHelperFill) and what is
// read back from sessionStorage. No browser and no listening server.
//
// AppContext.jsx has JSX in it, so it is loaded the way the app loads it, through
// Vite's own module loader, and rendered once on the server with a stand-in for
// sessionStorage. Vite is the frontend's own dependency; this file brings none.
// Run from the repo root:
//
//   node --test tools/verify/app-state-test.mjs

import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { matchAnswers, patchesFor } from '../../frontend/src/data/talkAnswers.js'

const FRONTEND = fileURLToPath(new URL('../../frontend', import.meta.url))
const frontendRequire = createRequire(join(FRONTEND, 'package.json'))

let server
let app

before(async () => {
  const vite = await import(
    pathToFileURL(join(dirname(frontendRequire.resolve('vite/package.json')), 'dist/node/index.js')).href
  )
  server = await vite.createServer({
    root: FRONTEND,
    configFile: join(FRONTEND, 'vite.config.js'),
    envDir: false, // no .env file is read for a test
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
  })
  app = await server.ssrLoadModule('/src/context/AppContext.jsx')
})

after(async () => {
  delete globalThis.window
  await server?.close()
})

// What the app would hold on first render if sessionStorage held `stored`
// (undefined: nothing stored). This is hydrate() and readStored(), the real ones.
function read(stored) {
  const React = frontendRequire('react')
  const { renderToString } = frontendRequire('react-dom/server')
  globalThis.window = {
    sessionStorage: {
      getItem: () => (stored === undefined ? null : JSON.stringify(stored)),
      setItem() {},
      removeItem() {},
    },
  }
  let seen
  const Probe = () => {
    seen = app.useApp().applicationData
    return null
  }
  renderToString(React.createElement(app.AppProvider, null, React.createElement(Probe)))
  return seen
}

const blank = () => read(undefined)
const withResult = () => ({ ...blank(), result: { financial_analysis: {} } })
const said = (field, value) => ({ field, value, evidence: 'I said it' })

// The helper's fill for some spoken answers, the way /talk computes it.
const fill = (state, ...answers) =>
  app.applyHelperFill(state, patchesFor(matchAnswers(answers, state.location.state), state.location))

describe('what is read back from sessionStorage', () => {
  test('nothing stored is the blank form, with nothing marked as filled by the helper', () => {
    const start = blank()
    assert.deepEqual(start.aiFilled, [])
    assert.equal(start.result, null)
    assert.equal(start.business.category, '')
  })

  test('a version 5 payload keeps the list of what the helper filled', () => {
    const state = read({
      v: 5,
      data: { business: { category: 'dairy' }, aiFilled: ['business.category', 'finance.householdIncome'] },
    })
    assert.equal(state.business.category, 'dairy')
    assert.deepEqual(state.aiFilled, ['business.category', 'finance.householdIncome'])
  })

  test('the list keeps only the paths of answers the helper can fill', () => {
    const state = read({
      v: 5,
      data: {
        aiFilled: [
          'business.category',
          'nope',
          'profile.name',
          'business.businessName',
          '__proto__',
          'constructor',
          'result',
          7,
          null,
          {},
          ['business.category'],
        ],
      },
    })
    assert.deepEqual(state.aiFilled, ['business.category'])
  })

  test('something that is not a list reads as an empty one, and costs the reader no other answer', () => {
    // readStored() falls back to a blank form on any error, so an empty list alone
    // would not tell a guarded read from one that threw: the answers do.
    for (const aiFilled of ['business.category', { 0: 'business.category', length: 1 }, 5, null, true]) {
      const state = read({ v: 5, data: { business: { category: 'dairy' }, aiFilled } })
      assert.deepEqual(state.aiFilled, [], JSON.stringify(aiFilled))
      assert.equal(state.business.category, 'dairy', JSON.stringify(aiFilled))
    }
  })

  test('older payloads are still read, with an empty list', () => {
    for (const v of [1, 2, 3, 4]) {
      const state = read({ v, data: { business: { category: 'dairy' } } })
      assert.equal(state.business.category, 'dairy', `version ${v}`)
      assert.deepEqual(state.aiFilled, [], `version ${v}`)
    }
  })

  test('a version nobody wrote is refused, not half-restored', () => {
    for (const v of [0, 6, '5', null]) {
      const state = read({ v, data: { business: { category: 'dairy' }, aiFilled: ['business.category'] } })
      assert.equal(state.business.category, '', JSON.stringify(v))
      assert.deepEqual(state.aiFilled, [], JSON.stringify(v))
    }
  })
})

describe('the version', () => {
  // The app writes STORAGE_VERSION and reads READABLE_VERSIONS. A bump that is not
  // added to the set would make every reload throw the reader's answers away, and
  // the verifiers parse both lines, so they have to keep this exact shape.
  test('the version written is the newest one that is read', () => {
    const source = readFileSync(join(FRONTEND, 'src/context/AppContext.jsx'), 'utf8').replaceAll('\r\n', '\n')
    const written = Number(source.match(/^const STORAGE_VERSION = (\d+)$/m)[1])
    const readable = source
      .match(/^const READABLE_VERSIONS = new Set\(\[([\d,\s]*)\]\)$/m)[1]
      .split(',')
      .map(Number)
    assert.equal(written, Math.max(...readable))
  })
})

describe('applyEdit', () => {
  test('an answer that does not change returns the very same state', () => {
    const start = withResult()
    assert.equal(app.applyEdit(start, 'business', { category: '' }), start)
    assert.equal(app.applyEdit(start, 'finance', { monthlyEmi: '' }), start)
  })

  test('an answer that goes into the check clears the result, and says so', () => {
    const next = app.applyEdit(withResult(), 'finance', { monthlyEmi: '500' })
    assert.equal(next.finance.monthlyEmi, '500')
    assert.equal(next.result, null)
    assert.equal(next.resultCleared, true)
  })

  test('an answer that never leaves the tab leaves the result alone', () => {
    const start = withResult()
    for (const [section, data] of [
      ['business', { businessName: 'Sita Tailors' }],
      ['location', { village: 'Kakori', customers: 'neighbours' }],
    ]) {
      const next = app.applyEdit(start, section, data)
      assert.equal(next.result, start.result, section)
      assert.equal(next.resultCleared, false, section)
    }
  })

  test('the profile never clears the result, so the language can be switched at any point', () => {
    const start = withResult()
    const next = app.applyEdit(start, 'profile', { language: 'Tamil' })
    assert.equal(next.result, start.result)
    assert.equal(next.resultCleared, false)
  })

  test('with no result on screen there is nothing to say was cleared', () => {
    assert.equal(app.applyEdit(blank(), 'finance', { monthlyEmi: '500' }).resultCleared, false)
  })

  test('an answer the reader changes is theirs: it leaves the helper-filled list, the others stay', () => {
    const start = { ...blank(), aiFilled: ['business.category', 'finance.monthlyEmi'] }
    const next = app.applyEdit(start, 'business', { category: 'retail' })
    assert.deepEqual(next.aiFilled, ['finance.monthlyEmi'])
  })

  test('retyping what is already there leaves the list alone', () => {
    const start = {
      ...blank(),
      business: { ...blank().business, category: 'dairy' },
      aiFilled: ['business.category'],
    }
    assert.equal(app.applyEdit(start, 'business', { category: 'dairy' }), start)
  })

  test('picking a new state clears the district, and both leave the list', () => {
    const start = {
      ...blank(),
      location: { ...blank().location, state: 'Uttar Pradesh', district: 'Lucknow' },
      aiFilled: ['location.state', 'location.district', 'finance.monthlyEmi'],
    }
    const next = app.applyEdit(start, 'location', { state: 'Kerala', district: '' })
    assert.deepEqual(next.aiFilled, ['finance.monthlyEmi'])
  })
})

describe('applyHelperFill', () => {
  test('writes the answers and lists each one it put there', () => {
    const start = blank()
    const next = fill(
      start,
      said('business_category', 'dairy'),
      said('monthly_emi', 1200),
      said('state', 'Uttar Pradesh'),
      said('district', 'Lucknow'),
    )
    assert.equal(next.business.category, 'dairy')
    assert.equal(next.finance.monthlyEmi, '1200')
    assert.equal(next.location.state, 'Uttar Pradesh')
    assert.equal(next.location.district, 'Lucknow')
    assert.deepEqual(
      [...next.aiFilled].sort(),
      ['business.category', 'finance.monthlyEmi', 'location.district', 'location.state'],
    )
    assert.deepEqual(blank().aiFilled, [], 'the blank form is not changed by a fill')
    assert.deepEqual(start.aiFilled, [], 'the state it was given is not changed either')
  })

  test('an answer the form already holds is not marked, and a fill of only those changes nothing', () => {
    const start = blank()
    assert.equal(fill(start, said('location_type', 'rural')), start, 'rural is the default')
    assert.equal(fill(start, said('existing_debt', 0)), start, '0 and "0" are one answer')
    assert.equal(app.applyHelperFill(start, {}), start)
  })

  test('answers outside the form are left as they were', () => {
    const start = blank()
    const next = fill(start, said('monthly_emi', 900))
    assert.deepEqual(next.profile, start.profile)
    assert.deepEqual(next.business, start.business)
    assert.deepEqual(next.location, start.location)
  })

  test('clears a result on screen, as typing the same answers would', () => {
    const next = fill(withResult(), said('business_category', 'dairy'))
    assert.equal(next.result, null)
    assert.equal(next.resultCleared, true)
  })

  test('keeps what was already listed, and lists a path once', () => {
    const start = { ...blank(), aiFilled: ['finance.monthlyEmi'] }
    const once = fill(start, said('business_category', 'dairy'))
    assert.deepEqual([...once.aiFilled].sort(), ['business.category', 'finance.monthlyEmi'])
    const again = fill(once, said('business_category', 'retail'))
    assert.deepEqual([...again.aiFilled].sort(), ['business.category', 'finance.monthlyEmi'])
  })

  test('a new state clears the district, and the cleared district is not listed as filled', () => {
    const placed = fill(blank(), said('state', 'Uttar Pradesh'), said('district', 'Lucknow'))
    const moved = fill(placed, said('state', 'Kerala'))
    assert.equal(moved.location.state, 'Kerala')
    assert.equal(moved.location.district, '')
    assert.ok(moved.aiFilled.includes('location.state'))
    assert.ok(!moved.aiFilled.includes('location.district'))
  })

  test('the reader editing a filled answer takes it off the list', () => {
    const filled = fill(blank(), said('business_category', 'dairy'), said('monthly_emi', 1200))
    const edited = app.applyEdit(filled, 'finance', { monthlyEmi: '1500' })
    assert.deepEqual(edited.aiFilled, ['business.category'])
  })
})

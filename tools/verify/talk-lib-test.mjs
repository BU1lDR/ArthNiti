// Unit tests for the two pure modules behind the voice-and-text helper (/talk):
// frontend/src/audio/wav.js and frontend/src/data/talkAnswers.js.
//
// The recorder itself needs a microphone and a browser, so it is checked in Edge
// (see tools/README.md). What can be checked without one is checked here: the
// WAV bytes the backend will accept, and what is done with the answers it sends
// back. No network, no key, no server. Run from the repo root:
//
//   node --test tools/verify/talk-lib-test.mjs
//
// The WAV block ends by handing a real encoded recording to the backend's own
// usable_wav() check, through the repo's venv, because "the header looks right"
// is not the same as "the backend takes it". That test is skipped, and says so,
// when the venv is not there.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { encodeWav, SAMPLE_RATE } from '../../frontend/src/audio/wav.js'
import {
  matchAnswers,
  patchesFor,
  CATEGORY_LABELS,
  AREA_LABELS,
  FIELD_TARGETS,
  FIELD_LABEL_KEYS,
  LABEL_KEY_BY_PATH,
  planFill,
  NO_SPEECH_LANGUAGES,
} from '../../frontend/src/data/talkAnswers.js'
import { LANGUAGES } from '../../frontend/src/i18n/languages.js'
import { MAX_RUPEES, MAX_AUDIO_BYTES } from '../../frontend/src/data/limits.js'
import { SENT_FIELDS } from '../../frontend/src/config/notice.js'
import { districtsForState } from '../../frontend/src/data/indiaLocations.js'

const ROOT = new URL('../../', import.meta.url)
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replaceAll('\r\n', '\n')

// ---------------------------------------------------------------- the WAV bytes

const ascii = (view, at, length) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(at + i)))

describe('encodeWav', () => {
  test('writes a 44-byte PCM header for mono 16-bit audio', () => {
    const view = new DataView(encodeWav(new Float32Array(10), 16000))
    assert.equal(ascii(view, 0, 4), 'RIFF')
    assert.equal(view.getUint32(4, true), 36 + 20)
    assert.equal(ascii(view, 8, 4), 'WAVE')
    assert.equal(ascii(view, 12, 4), 'fmt ')
    assert.equal(view.getUint32(16, true), 16)
    assert.equal(view.getUint16(20, true), 1, 'PCM')
    assert.equal(view.getUint16(22, true), 1, 'mono')
    assert.equal(view.getUint32(24, true), 16000)
    assert.equal(view.getUint32(28, true), 32000, 'bytes per second')
    assert.equal(view.getUint16(32, true), 2, 'block align')
    assert.equal(view.getUint16(34, true), 16, 'bits per sample')
    assert.equal(ascii(view, 36, 4), 'data')
    assert.equal(view.getUint32(40, true), 20)
    assert.equal(view.byteLength, 44 + 20)
  })

  test('the sample rate defaults to the one the recorder resamples to', () => {
    assert.equal(SAMPLE_RATE, 16000)
    assert.equal(new DataView(encodeWav(new Float32Array(1))).getUint32(24, true), SAMPLE_RATE)
  })

  test('scales floats to 16-bit and clamps what is out of range', () => {
    const view = new DataView(encodeWav(Float32Array.of(0, 0.5, -0.5, 1, -1, 3, -3)))
    const at = (i) => view.getInt16(44 + i * 2, true)
    assert.equal(at(0), 0)
    assert.equal(at(1), 16383)
    assert.equal(at(2), -16384)
    assert.equal(at(3), 32767)
    assert.equal(at(4), -32768)
    assert.equal(at(5), 32767, 'above 1 is clamped, not wrapped')
    assert.equal(at(6), -32768, 'below -1 is clamped, not wrapped')
  })

  test('a minute of audio fits the size the backend takes', () => {
    const bytes = encodeWav(new Float32Array(SAMPLE_RATE * 60)).byteLength
    assert.equal(bytes, 44 + SAMPLE_RATE * 60 * 2)
    assert.ok(bytes <= MAX_AUDIO_BYTES, `${bytes} bytes is over the ${MAX_AUDIO_BYTES} the backend takes`)
  })

  const python = new URL('.venv/Scripts/python.exe', ROOT)
  const venvTest = existsSync(python) ? test : test.skip
  venvTest('the backend itself calls the encoded recording usable', () => {
    const run = (samples, rate) => {
      const bytes = Buffer.from(encodeWav(samples, rate)).toString('base64')
      const code =
        'import base64,sys;from app.services.intake_service import usable_wav;' +
        'print(usable_wav(base64.b64decode(sys.argv[1])))'
      // From backend/, so `app` imports: this is our own code, not a downloaded file.
      const result = spawnSync(fileURLToPath(python), ['-c', code, bytes], {
        cwd: fileURLToPath(new URL('backend/', ROOT)),
        encoding: 'utf8',
      })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }
    assert.equal(run(Float32Array.of(0, 0.25, -0.25, 0.5), 16000), 'True')
    assert.equal(run(Float32Array.of(0, 0.25, -0.25, 0.5), 24000), 'True')
    // The refuter: the same bytes at a rate the backend refuses must be refused,
    // or this test would pass for any file.
    assert.equal(run(Float32Array.of(0, 0.25, -0.25, 0.5), 44100), 'False')
    assert.equal(run(new Float32Array(0), 16000), 'False', 'no frames')
  })
})

// ------------------------------------------------------ the answers, matched

const said = (field, value, evidence = 'I said it') => ({ field, value, evidence })
const FIELD_ORDER = SENT_FIELDS.map(([field]) => field)

describe('the labels', () => {
  test('there is one for each button on the business and location steps', () => {
    assert.deepEqual(Object.keys(CATEGORY_LABELS), [
      'retail',
      'food processing',
      'handicrafts',
      'tailoring',
      'agriculture',
      'dairy',
      'poultry',
      'services',
      'manufacturing',
    ])
    assert.deepEqual(Object.keys(AREA_LABELS), ['rural', 'semi-urban', 'urban'])
  })

  // The pages are the authority on what a button is called, so this reads them as
  // text: a button added to a page and not here fails now, not in front of a reader.
  const buttons = (file, list) => {
    const body = readText(file).match(new RegExp(String.raw`const ${list} = \[(.*?)\n\]`, 's'))[1]
    return [...body.matchAll(/\['([^']+)',\s*'[^']*',\s*'([^']+)'\]/g)].map(([, value, key]) => [value, key])
  }

  test('they are the buttons the pages show, with the keys the pages use', () => {
    const categories = buttons('frontend/src/pages/BusinessPage.jsx', 'categories').filter(([value]) => value !== 'other')
    assert.equal(categories.length, 9)
    assert.deepEqual(Object.entries(CATEGORY_LABELS), categories)
    const areas = buttons('frontend/src/pages/LocationPage.jsx', 'locationTypes')
    assert.equal(areas.length, 3)
    assert.deepEqual(Object.entries(AREA_LABELS), areas)
  })
})

describe('the spoken languages', () => {
  // The backend is the authority on what it can transcribe. Read as text, so a
  // language it stops or starts taking fails here and not in front of a reader.
  const backend = readText('backend/app/services/intake_service.py')

  test('the page offers the interface languages the backend knows', () => {
    const table = backend.match(/^LANGUAGES = \{\n(.*?)\n\}$/ms)?.[1]
    assert.ok(table, 'LANGUAGES changed shape in intake_service.py: update this test')
    const known = [...table.matchAll(/^\s+"([a-z]{2})": "[A-Za-z]+",$/gm)].map(([, code]) => code)
    assert.deepEqual(LANGUAGES.map((language) => language.code), known)
  })

  test('the ones with no speech model are the ones the backend refuses to transcribe', () => {
    const refused = backend.match(
      /^ASR_LANGUAGES = \{code: name for code, name in LANGUAGES\.items\(\) if code != "([a-z]{2})"\}$/m,
    )
    assert.ok(refused, 'ASR_LANGUAGES changed shape in intake_service.py: update this test')
    assert.deepEqual(NO_SPEECH_LANGUAGES, [refused[1]])
  })
})

describe('FIELD_TARGETS', () => {
  test('covers exactly the fields the form sends, and labels each with the question it asks', () => {
    assert.deepEqual(Object.keys(FIELD_TARGETS), FIELD_ORDER)
    assert.deepEqual(Object.entries(FIELD_LABEL_KEYS), SENT_FIELDS)
  })

  test('every target is a field AppContext keeps', () => {
    const empty = readText('frontend/src/context/AppContext.jsx').match(/const EMPTY = \{(.*?)\n\}\n/s)[1]
    for (const [field, [section, key]] of Object.entries(FIELD_TARGETS)) {
      const body = empty.match(new RegExp(String.raw`\n  ${section}: \{(.*?)\n  \},`, 's'))?.[1]
      assert.ok(body, `${field}: no ${section} section in EMPTY`)
      assert.match(body, new RegExp(String.raw`\n    ${key}:`), `${field}: no ${section}.${key} in EMPTY`)
    }
  })
})

describe('LABEL_KEY_BY_PATH', () => {
  test('names the question of every field the helper can fill, by the path the pages list', () => {
    assert.equal(LABEL_KEY_BY_PATH['business.initialInvestment'], 'errf.investment')
    assert.equal(LABEL_KEY_BY_PATH['location.locationType'], 'errf.areaType')
    assert.equal(LABEL_KEY_BY_PATH['finance.householdIncome'], 'errf.householdIncome')
    assert.equal(Object.keys(LABEL_KEY_BY_PATH).length, FIELD_ORDER.length)
    for (const [field, [section, key]] of Object.entries(FIELD_TARGETS)) {
      assert.equal(LABEL_KEY_BY_PATH[`${section}.${key}`], FIELD_LABEL_KEYS[field], field)
    }
  })
})

describe('planFill', () => {
  const answers = {
    business: { category: '', initialInvestment: '', existingDebt: 0 },
    location: { state: 'Uttar Pradesh', district: 'Lucknow', locationType: 'rural' },
    finance: { monthlyEmi: '300' },
  }

  test('keeps only what would change, and lists the non-empty values it writes', () => {
    const { changed, filled } = planFill(answers, {
      business: { category: 'dairy', initialInvestment: '60000' },
      finance: { monthlyEmi: '1200' },
    })
    assert.deepEqual(changed, {
      business: { category: 'dairy', initialInvestment: '60000' },
      finance: { monthlyEmi: '1200' },
    })
    assert.deepEqual(filled, ['business.category', 'business.initialInvestment', 'finance.monthlyEmi'])
  })

  test('an answer the form already holds changes nothing and marks nothing', () => {
    const { changed, filled } = planFill(answers, {
      location: { state: 'Uttar Pradesh', locationType: 'rural' },
      finance: { monthlyEmi: '300' },
    })
    assert.deepEqual(changed, {})
    assert.deepEqual(filled, [])
  })

  test('0 and "0" are one answer, because an input holds text', () => {
    assert.deepEqual(planFill(answers, { business: { existingDebt: '0' } }), { changed: {}, filled: [] })
    assert.deepEqual(planFill(answers, { business: { existingDebt: '5' } }).filled, ['business.existingDebt'])
  })

  test('clearing a field is a change, but it is not something for the reader to check', () => {
    const { changed, filled } = planFill(answers, { location: { state: 'Kerala', district: '' } })
    assert.deepEqual(changed, { location: { state: 'Kerala', district: '' } })
    assert.deepEqual(filled, ['location.state'])
  })

  test('no patches, no change', () => {
    assert.deepEqual(planFill(answers, {}), { changed: {}, filled: [] })
  })
})

describe('matchAnswers', () => {
  test('keeps the order the form asks in, whatever order it was given', () => {
    const rows = matchAnswers([
      said('monthly_emi', 800),
      said('business_category', 'tailoring'),
      said('initial_investment', 50000),
    ])
    assert.deepEqual(
      rows.map((row) => row.field),
      ['business_category', 'initial_investment', 'monthly_emi'],
    )
    assert.ok(FIELD_ORDER.indexOf('monthly_emi') > FIELD_ORDER.indexOf('initial_investment'))
  })

  test('a category and an area type that are on a button match', () => {
    const [cat, area] = matchAnswers([
      said('business_category', 'tailoring', 'I stitch clothes'),
      said('location_type', 'semi-urban', 'a small town'),
    ])
    assert.equal(cat.ok, true)
    assert.equal(cat.value, 'tailoring')
    assert.equal(cat.evidence, 'I stitch clothes')
    assert.equal(area.ok, true)
    assert.equal(area.value, 'semi-urban')
  })

  test('a category that is not on a button does not match, and says what was heard', () => {
    const [row] = matchAnswers([said('business_category', 'jewellery', 'I make jewellery')])
    assert.equal(row.ok, false)
    assert.equal(row.heard, 'jewellery')
    assert.equal(row.evidence, 'I make jewellery')
  })

  test('an area type that is not on a button does not match', () => {
    const [row] = matchAnswers([said('location_type', 'village', 'I live in a village')])
    assert.equal(row.ok, false)
    assert.equal(row.heard, 'village')
  })

  test('names that every object has are not categories', () => {
    for (const value of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal(matchAnswers([said('business_category', value)])[0].ok, false, value)
      assert.equal(matchAnswers([said('location_type', value)])[0].ok, false, value)
    }
  })

  test('the match is exact: no case folding, no trimming for the fixed choices', () => {
    for (const value of ['Tailoring', ' tailoring', 'tailoring ']) {
      assert.equal(matchAnswers([said('business_category', value)])[0].ok, false, JSON.stringify(value))
    }
  })

  test('money must be a whole number from 0 to the cap, and is kept as the text the form holds', () => {
    const ok = matchAnswers([said('initial_investment', 50000)])[0]
    assert.equal(ok.ok, true)
    assert.equal(ok.value, '50000')
    assert.equal(matchAnswers([said('existing_debt', 0)])[0].value, '0')
    assert.equal(matchAnswers([said('monthly_emi', MAX_RUPEES)])[0].ok, true)
    for (const bad of [-1, 12.5, MAX_RUPEES + 1, '5000', null, NaN, Infinity, true]) {
      const row = matchAnswers([said('available_capital', bad)])[0]
      assert.equal(row.ok, false, String(bad))
    }
  })

  test('a household income of 0 is not an answer, because 0 is a real answer to the form', () => {
    assert.equal(matchAnswers([said('household_monthly_income', 0)]).length, 0)
    assert.equal(matchAnswers([said('household_monthly_income', 9000)])[0].ok, true)
  })

  test('a state is matched to the list the form uses, and written as the form writes it', () => {
    const [row] = matchAnswers([said('state', '  uttar   PRADESH ')])
    assert.equal(row.ok, true)
    assert.equal(row.value, 'Uttar Pradesh')
    assert.equal(matchAnswers([said('state', 'Narnia')])[0].ok, false)
  })

  test('"&" and "and" are the same word in a state name', () => {
    const [row] = matchAnswers([said('state', 'jammu & kashmir')])
    assert.equal(row.ok, true)
    assert.match(row.value, /^Jammu/)
  })

  test('a district is checked against the state that was heard in the same answers', () => {
    const rows = matchAnswers([said('state', 'Uttar Pradesh'), said('district', 'lucknow')])
    assert.equal(rows[1].ok, true)
    assert.equal(rows[1].value, 'Lucknow')
    const wrong = matchAnswers([said('state', 'Kerala'), said('district', 'Lucknow')])
    assert.equal(wrong[1].ok, false)
    assert.equal(wrong[1].heard, 'Lucknow')
  })

  test('with no state heard, the district is checked against the state already on the form', () => {
    assert.equal(matchAnswers([said('district', 'Varanasi')], 'Uttar Pradesh')[0].ok, true)
    assert.equal(matchAnswers([said('district', 'Varanasi')], 'Kerala')[0].ok, false)
  })

  test('with no state anywhere, a district cannot be placed and does not match', () => {
    assert.equal(matchAnswers([said('district', 'Lucknow')], '')[0].ok, false)
  })

  test('a state that did not match leaves its district checked against the form state', () => {
    const rows = matchAnswers([said('state', 'Narnia'), said('district', 'Lucknow')], 'Uttar Pradesh')
    assert.equal(rows[0].ok, false)
    assert.equal(rows[1].ok, true)
  })

  test('a field the form does not ask is dropped, not shown', () => {
    assert.deepEqual(matchAnswers([said('employees', 4), said('village', 'Kakori')]), [])
  })

  test('the same field twice keeps the first', () => {
    const rows = matchAnswers([said('monthly_emi', 100), said('monthly_emi', 200)])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].value, '100')
  })

  test('nothing in, nothing out', () => {
    assert.deepEqual(matchAnswers([]), [])
    assert.deepEqual(matchAnswers(undefined), [])
  })
})

describe('patchesFor', () => {
  const rows = (...answers) => matchAnswers(answers, '')
  const locationNow = { state: '', district: '' }

  test('puts each answer in the section and field the form keeps it in', () => {
    const patches = patchesFor(
      rows(
        said('business_category', 'dairy'),
        said('initial_investment', 60000),
        said('expected_monthly_revenue', 15000),
        said('monthly_operating_expenses', 6000),
        said('existing_debt', 20000),
        said('available_capital', 10000),
        said('monthly_expenses', 9000),
        said('monthly_emi', 1200),
        said('household_monthly_income', 14000),
        said('location_type', 'urban'),
      ),
      locationNow,
    )
    assert.deepEqual(patches, {
      business: {
        category: 'dairy',
        initialInvestment: '60000',
        monthlyRevenue: '15000',
        monthlyOperatingExpenses: '6000',
        existingDebt: '20000',
      },
      location: { locationType: 'urban' },
      finance: {
        availableCapital: '10000',
        monthlyExpenses: '9000',
        monthlyEmi: '1200',
        householdIncome: '14000',
      },
    })
  })

  test('leaves out a section nothing was heard for', () => {
    assert.deepEqual(patchesFor(rows(said('monthly_emi', 1200)), locationNow), {
      finance: { monthlyEmi: '1200' },
    })
    assert.deepEqual(patchesFor([], locationNow), {})
  })

  test('rows that did not match are never written', () => {
    const unmatched = rows(said('business_category', 'jewellery'), said('state', 'Narnia'))
    assert.deepEqual(patchesFor(unmatched, locationNow), {})
  })

  test('a row that is not ok is not written, whatever value it carries', () => {
    const doubtful = { field: 'state', ok: false, value: 'Kerala', heard: 'Kerala', evidence: '' }
    assert.deepEqual(patchesFor([doubtful], { state: 'Uttar Pradesh', district: 'Lucknow' }), {})
  })

  test('a state and a district that belong together are written together', () => {
    const patches = patchesFor(rows(said('state', 'Uttar Pradesh'), said('district', 'Lucknow')), locationNow)
    assert.deepEqual(patches.location, { state: 'Uttar Pradesh', district: 'Lucknow' })
  })

  test('a new state clears the old district, because the old one belongs to the old state', () => {
    const now = { state: 'Uttar Pradesh', district: 'Lucknow' }
    const patches = patchesFor(rows(said('state', 'Kerala')), now)
    assert.deepEqual(patches.location, { state: 'Kerala', district: '' })
  })

  test('the same state again keeps the district', () => {
    const now = { state: 'Uttar Pradesh', district: 'Lucknow' }
    const patches = patchesFor(rows(said('state', 'Uttar Pradesh')), now)
    assert.deepEqual(patches.location, { state: 'Uttar Pradesh' })
  })

  test('a district alone goes in when it belongs to the state on the form', () => {
    const now = { state: 'Uttar Pradesh', district: '' }
    const patches = patchesFor(matchAnswers([said('district', 'Varanasi')], 'Uttar Pradesh'), now)
    assert.deepEqual(patches.location, { district: 'Varanasi' })
  })

  test('removing the state a district was heard with leaves the district out', () => {
    // The reader unticks the state row and keeps the district row. The district
    // was checked against the state that was heard, so it is only safe with it.
    const heard = matchAnswers([said('state', 'Kerala'), said('district', districtsForState('Kerala')[0])])
    const keptDistrictOnly = heard.filter((row) => row.field === 'district')
    const now = { state: 'Uttar Pradesh', district: '' }
    const patches = patchesFor(keptDistrictOnly, now)
    assert.equal(patches.location?.district ?? '', '', 'a Kerala district must not land under Uttar Pradesh')
  })

  test('whatever is kept, the written state and district always belong together', () => {
    const answers = [
      said('state', 'Kerala'),
      said('district', districtsForState('Kerala')[0]),
      said('location_type', 'rural'),
    ]
    const all = matchAnswers(answers, 'Uttar Pradesh')
    const now = { state: 'Uttar Pradesh', district: 'Lucknow' }
    for (let mask = 0; mask < 1 << all.length; mask++) {
      const kept = all.filter((_, i) => mask & (1 << i))
      const place = patchesFor(kept, now).location ?? {}
      const state = place.state ?? now.state
      const district = place.district ?? now.district
      assert.ok(
        district === '' || districtsForState(state).includes(district),
        `kept ${kept.map((r) => r.field)} gives ${state} / ${district}`,
      )
    }
  })

  test('the patch has only string values for typed fields, so a controlled input stays controlled', () => {
    const patches = patchesFor(rows(said('initial_investment', 100), said('existing_debt', 0)), locationNow)
    assert.equal(typeof patches.business.initialInvestment, 'string')
    assert.equal(typeof patches.business.existingDebt, 'string')
  })
})

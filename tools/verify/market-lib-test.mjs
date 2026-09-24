// Unit tests for tools/market-lib.mjs, on synthetic data only.
//
// Everything that decides what a market row says lives in market-lib.mjs, so
// this suite is the gate on the figures themselves: the statistic, the drop
// reasons, the NIC classification, suppression, and the invariants every row
// must hold before the fetch will write it. No network, no key, and no .env:
// parseEnvKey is only ever handed text or bytes built here, plus the committed
// .env.example. Run from the repo root:
//
//   node --test tools/verify/market-lib-test.mjs
//
// The last block reads backendStrings.js as TEXT, by regex, and fails if the
// English on a row could differ from the translation's English fallback. It does
// not import the file, so a syntax error there cannot pass here by accident.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as lib from '../market-lib.mjs'
import { STATES, districtsForState } from '../../frontend/src/data/indiaLocations.js'

const ROOT = new URL('../../', import.meta.url)
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n')
const readJson = (rel) => JSON.parse(readText(rel))

const COMMODITIES = readJson('tools/market-commodities.json').commodities
const NIC = readJson('tools/market-nic-map.json')
const CROSSWALK_TEXT = readText('tools/market-crosswalk.json')
const CROSSWALK = JSON.parse(CROSSWALK_TEXT)
const LIB_TEXT = readText('tools/market-lib.mjs')
const ONION = COMMODITIES.find((c) => c.id === 'onion')

const { RESOURCES, SOURCE_EN, NOTE_EN, METRIC_PRICE, METRIC_COUNT } = lib

// Synthetic stand-ins. Neither is a real key: one is plainly a word, the other is
// shaped like one (56 hex characters) so the key-shaped-string check has
// something to find.
const FAKE_KEY = 'fake0key0for0tests0only'
const KEY_SHAPED = 'deadbeef'.repeat(7)

const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `${actual} is not ${expected}`)
const sorted = (set) => [...set].sort()

// ---------------------------------------------------------------- the key

describe('parseEnvKey', () => {
  const line = (v) => `${lib.KEY_VAR}=${v}`

  test('reads the key from a plain line, a CRLF file and an export line', () => {
    assert.deepEqual(lib.parseEnvKey(line(FAKE_KEY)), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(`OTHER=1\r\n${line(FAKE_KEY)}\r\n`), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(`export ${line(FAKE_KEY)}`), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(`  ${lib.KEY_VAR} = ${FAKE_KEY}  `), { key: FAKE_KEY })
  })

  test('the last line wins, and a commented-out line is not a line', () => {
    assert.deepEqual(lib.parseEnvKey(`${line('first')}\n${line(FAKE_KEY)}`), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(`# ${line('old')}\n${line(FAKE_KEY)}`), { key: FAKE_KEY })
    assert.match(lib.parseEnvKey(`# ${line(FAKE_KEY)}`).error, /No DATA_GOV_IN_API_KEY= line/)
  })

  test('strips matching quotes and an unquoted inline comment', () => {
    assert.deepEqual(lib.parseEnvKey(line(`"${FAKE_KEY}"`)), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(line(`'${FAKE_KEY}'`)), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(line(`" ${FAKE_KEY} "`)), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(line(`${FAKE_KEY}   # my key`)), { key: FAKE_KEY })
  })

  test('strips a UTF-8 byte-order mark, as text and as bytes', () => {
    // As text this cannot tell a strip from no strip: JS \s matches U+FEFF, so the
    // line regex would read past it either way. It pins the outcome, not the step.
    assert.deepEqual(lib.parseEnvKey(`\uFEFF${line(FAKE_KEY)}\n`), { key: FAKE_KEY })
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`${line(FAKE_KEY)}\n`, 'utf8')])
    assert.deepEqual(lib.parseEnvKey(bytes), { key: FAKE_KEY })
    assert.deepEqual(lib.parseEnvKey(Buffer.from(line(FAKE_KEY), 'utf8')), { key: FAKE_KEY })
  })

  test('refuses UTF-16 in every form it arrives in', () => {
    const le = Buffer.from(`\uFEFF${line(FAKE_KEY)}`, 'utf16le')
    assert.deepEqual([le[0], le[1]], [0xff, 0xfe])
    const be = Buffer.from(le)
    for (let i = 0; i + 1 < be.length; i += 2) [be[i], be[i + 1]] = [be[i + 1], be[i]]
    assert.deepEqual([be[0], be[1]], [0xfe, 0xff])
    const noBom = Buffer.from(line(FAKE_KEY), 'utf16le')
    const inputs = [
      le,
      be,
      noBom,
      [...line(FAKE_KEY)].join('\u0000'),
      `\uFFFD\uFFFD${line(FAKE_KEY)}`,
      `\uFFFE${line(FAKE_KEY)}`,
    ]
    for (const input of inputs) {
      const out = lib.parseEnvKey(input)
      assert.equal(out.key, undefined)
      assert.match(out.error, /UTF-16/)
      assert.match(out.error, /UTF-8/)
    }
  })

  test('refuses the placeholder, the sample key, an empty value and a space', () => {
    assert.match(lib.parseEnvKey(line(lib.PLACEHOLDER_KEY)).error, /placeholder/)
    assert.match(lib.parseEnvKey(line(`"${lib.PLACEHOLDER_KEY}"`)).error, /placeholder/)
    assert.match(lib.parseEnvKey(line(lib.SAMPLE_KEY)).error, /public sample key/)
    assert.match(lib.parseEnvKey(line('')).error, /is empty/)
    assert.match(lib.parseEnvKey(line('""')).error, /is empty/)
    assert.match(lib.parseEnvKey(line('   ')).error, /is empty/)
    assert.match(lib.parseEnvKey(line(`fake0 ${FAKE_KEY}`)).error, /contains a space/)
  })

  test('the committed .env.example is refused as the placeholder', () => {
    const text = readText('.env.example')
    assert.ok(!/(?<![0-9a-f])[0-9a-f]{56}(?![0-9a-f])/i.test(text), '.env.example must not carry anything shaped like a key')
    assert.match(lib.parseEnvKey(text).error, /placeholder/)
  })

  test('refuses a missing line and input that is not text', () => {
    assert.match(lib.parseEnvKey('OTHER=1\n').error, /No DATA_GOV_IN_API_KEY= line in \.env/)
    assert.match(lib.parseEnvKey('').error, /No DATA_GOV_IN_API_KEY= line/)
    assert.match(lib.parseEnvKey(null).error, /could not be read as text/)
    assert.match(lib.parseEnvKey(42).error, /could not be read as text/)
  })

  test('no error message ever quotes the value', () => {
    const values = [lib.SAMPLE_KEY, `${FAKE_KEY} extra`, lib.PLACEHOLDER_KEY]
    for (const v of values) {
      const out = lib.parseEnvKey(line(v))
      assert.ok(out.error, `expected an error for ${JSON.stringify(v)}`)
      assert.ok(!out.error.includes(v), 'the error quotes the value')
      assert.ok(!out.error.includes(FAKE_KEY), 'the error quotes part of the value')
    }
  })

  test('checkKeyValue is the same gate for the environment variable', () => {
    assert.deepEqual(lib.checkKeyValue(`  ${FAKE_KEY}  `), { key: FAKE_KEY })
    assert.match(lib.checkKeyValue(undefined).error, /is empty/)
    assert.match(lib.checkKeyValue(lib.SAMPLE_KEY).error, /public sample key/)
  })
})

describe('redact', () => {
  test('masks the key and its URL-encoded form', () => {
    assert.equal(redact(`key is ${FAKE_KEY}.`, FAKE_KEY), 'key is [key].')
    const odd = 'fake+key/with=signs'
    const enc = encodeURIComponent(odd)
    assert.notEqual(enc, odd)
    assert.equal(redact(`a ${odd} b ${enc} c`, odd), 'a [key] b [key] c')
  })

  test('masks any api-key= parameter, whatever the key', () => {
    assert.equal(redact('format=json&api-key=zzz999&limit=10'), 'format=json&api-key=[key]&limit=10')
    assert.equal(redact('API-KEY=zzz999'), 'api-key=[key]')
  })

  test('masks a whole api.data.gov.in URL, and leaves the licence URL alone', () => {
    const url = ['https://api.data.gov.in', '/resource/', RESOURCES.agmarknet.id, '?format=json&api-key=', FAKE_KEY].join('')
    assert.equal(redact(`GET ${url} failed`), 'GET [api url] failed')
    assert.equal(redact(`GET ${url} failed`, FAKE_KEY), 'GET [api url] failed')
    assert.equal(redact('see https://www.data.gov.in/Godl'), 'see https://www.data.gov.in/Godl')
  })

  test('takes an Error, and nothing at all', () => {
    const err = new Error(`request failed for ${FAKE_KEY}`)
    const out = redact(err, FAKE_KEY)
    assert.equal(out, 'Error: request failed for [key]')
    assert.ok(!out.includes(FAKE_KEY))
    assert.equal(redact(null), '')
    assert.equal(redact(undefined, FAKE_KEY), '')
    assert.equal(redact('plain text', ''), 'plain text')
  })

  function redact(text, key) { return lib.redact(text, key) }
})

// ---------------------------------------------------------------- queries

describe('buildQuery', () => {
  const agm = RESOURCES.agmarknet.id
  const list = RESOURCES.udyamList.id

  test('builds a readable and an encoded query, and never adds a key', () => {
    const params = [['format', 'json'], ['filters[State]', 'Uttar Pradesh'], ['limit', 10]]
    assert.equal(lib.buildQuery(agm, params), 'format=json&filters[State]=Uttar Pradesh&limit=10')
    assert.equal(lib.buildQuery(agm, params, { encoded: true }), 'format=json&filters[State]=Uttar%20Pradesh&limit=10')
    assert.equal(lib.buildQuery(agm, { a: 1, b: null, c: undefined, d: 0 }), 'a=1&d=0')
    assert.ok(!/api-key/i.test(lib.buildQuery(agm, params, { encoded: true })))
  })

  test('refuses the key as a parameter', () => {
    for (const k of ['api-key', 'api_key', 'API KEY', 'apikey']) {
      assert.throws(() => lib.buildQuery(agm, [[k, FAKE_KEY]]), /request helper/)
    }
  })

  test('refuses personal fields on any resource', () => {
    for (const f of ['EnterpriseName', 'CommunicationAddress', 'Pincode', 'LG_DT_Code,EnterpriseName']) {
      assert.throws(() => lib.buildQuery(list, [['fields', f]]), /personal data/)
    }
    // Not only the list: the Ministry's district list calls its column state_name.
    assert.throws(() => lib.buildQuery(RESOURCES.udyamTotal.id, [['fields', 'state_name']]), /personal data/)
  })

  test('refuses a Udyam list query without fields', () => {
    assert.throws(() => lib.buildQuery(list, [['filters[LG_DT_Code]', 162]]), /must send fields=/)
    assert.throws(() => lib.buildQuery(list, [['fields', '   ']]), /must send fields=/)
    assert.equal(lib.buildQuery(list, [['filters[LG_DT_Code]', 162], ['fields', 'LG_DT_Code,Activities']]),
      'filters[LG_DT_Code]=162&fields=LG_DT_Code,Activities')
    // The other resources do not need it.
    assert.equal(lib.buildQuery(RESOURCES.udyamServices.id, [['filters[lg_dt_code]', 162]]), 'filters[lg_dt_code]=162')
  })

  test('refuses RegistrationDate and a server-side price sort or range', () => {
    assert.throws(() => lib.buildQuery(list, [['fields', 'Activities'], ['filters[RegistrationDate]', '2026']]), /RegistrationDate/)
    assert.throws(() => lib.buildQuery(list, [['fields', 'Activities'], ['sort[RegistrationDate]', 'desc']]), /RegistrationDate/)
    assert.throws(() => lib.buildQuery(agm, [['sort[Modal_Price]', 'asc']]), /sort or range on price/)
    assert.throws(() => lib.buildQuery(agm, [['range[Modal_Price][gte]', '100']]), /sort or range on price/)
    assert.equal(lib.buildQuery(agm, [['sort[Arrival_Date]', 'desc']]), 'sort[Arrival_Date]=desc')
  })
})

// ---------------------------------------------------------------- dates

describe('dates', () => {
  test('toIstDate carries India\'s date across midnight UTC', () => {
    assert.equal(lib.toIstDate('2026-09-20T18:29:59Z'), '2026-09-20')
    assert.equal(lib.toIstDate('2026-09-20T18:30:00Z'), '2026-09-21')
    assert.equal(lib.toIstDate('2026-09-20T23:40:00.000Z'), '2026-09-21')
    assert.equal(lib.toIstDate('2026-12-31T20:00:00Z'), '2027-01-01')
    assert.equal(lib.toIstDate('2026-09-20T23:40:00+05:30'), '2026-09-20')
  })

  test('a timestamp with no zone is read as UTC, not as local time', () => {
    assert.equal(lib.toIstDate('2026-09-20T23:40:00'), '2026-09-21')
    assert.equal(lib.toIstDate('2026-09-20T12:00'), '2026-09-20')
  })

  test('an unreadable timestamp is null', () => {
    assert.equal(lib.toIstDate('not a date'), null)
    assert.equal(lib.toIstDate(''), null)
    assert.equal(lib.toIstDate(null), null)
  })

  test('istTimestamp writes +05:30', () => {
    assert.equal(lib.istTimestamp(Date.UTC(2026, 8, 20, 18, 30, 5)), '2026-09-21T00:00:05+05:30')
    assert.equal(lib.istTimestamp(Date.UTC(2026, 8, 24, 4, 30, 0)), '2026-09-24T10:00:00+05:30')
  })

  test('ymd, dmy, isYmd, minusDays and daysBetween', () => {
    assert.equal(lib.ymd('05/09/2026'), '2026-09-05')
    assert.equal(lib.ymd('5/9/2026'), '2026-09-05')
    assert.equal(lib.ymd(' 2026-09-05 '), '2026-09-05')
    assert.equal(lib.ymd('31/02/2026'), null)
    assert.equal(lib.ymd('2026/09/05'), null)
    assert.equal(lib.ymd(''), null)
    assert.equal(lib.dmy('2026-09-05'), '05/09/2026')
    assert.equal(lib.dmy('2026-02-30'), null)
    assert.equal(lib.isYmd('2026-13-01'), false)
    assert.equal(lib.isYmd('2028-02-29'), true)
    assert.equal(lib.minusDays('2026-03-01', 1), '2026-02-28')
    assert.equal(lib.minusDays('2028-03-01', 1), '2028-02-29')
    assert.equal(lib.minusDays('2026-09-24', 30), '2026-08-25')
    assert.equal(lib.minusDays('x', 1), null)
    assert.equal(lib.daysBetween('2026-09-20', '2026-09-24'), 4)
    assert.equal(lib.daysBetween('2026-10-24', '2026-10-26'), 2)
    assert.ok(Number.isNaN(lib.daysBetween('x', '2026-09-24')))
  })
})

// ---------------------------------------------------------------- numbers

describe('numbers', () => {
  test('round is half-up on the decimal, not on the binary float', () => {
    assert.equal(lib.round(1.005, 2), 1.01)
    assert.equal(lib.round(2.675, 2), 2.68)
    assert.equal(lib.round(12.25, 1), 12.3)
    assert.equal(lib.round(1.45, 1), 1.5)
    assert.equal(lib.round(17, 2), 17)
    assert.ok(Number.isNaN(lib.round(NaN, 2)))
    assert.ok(Number.isNaN(lib.round('x', 2)))
  })

  test('quantile interpolates at h = (n - 1) p', () => {
    const xs = [10, 12, 14, 15, 16, 18, 20, 22, 25, 30]
    near(lib.quantile(xs, 0.5), 17)
    near(lib.quantile(xs, 0.1), 11.8)
    near(lib.quantile(xs, 0.9), 25.5)
    near(lib.quantile([1, 2, 3, 4], 0.1), 1.3)
    assert.equal(lib.quantile([5], 0.9), 5)
    assert.ok(Number.isNaN(lib.quantile([], 0.5)))
  })

  test('median sorts a copy', () => {
    const xs = [3, 1, 2]
    assert.equal(lib.median(xs), 2)
    assert.deepEqual(xs, [3, 1, 2])
    assert.equal(lib.median([4, 1, 3, 2]), 2.5)
  })
})

// ---------------------------------------------------------------- prices

describe('normaliseMarket and marketKey', () => {
  test('one mandi under every spelling of APMC and whitespace', () => {
    for (const m of ['Lucknow', '  Lucknow   APMC ', 'APMC Lucknow', 'apmc  Lucknow', 'Lucknow apmc']) {
      assert.equal(lib.normaliseMarket(m), 'Lucknow')
    }
    assert.equal(lib.normaliseMarket('Naveen   Mandi  Sthal'), 'Naveen Mandi Sthal')
    assert.equal(lib.normaliseMarket('APMCity'), 'APMCity')
    assert.equal(lib.marketKey('Lucknow APMC'), 'lucknow')
    assert.equal(lib.marketKey('LUCKNOW'), 'lucknow')
    assert.equal(lib.normaliseMarket(null), '')
  })
})

// A mandi row as data.gov.in sends it: every value a string.
function mandi(over = {}) {
  return {
    State: 'Uttar Pradesh',
    District: 'Lucknow',
    Market: 'Lucknow',
    Commodity: 'Onion',
    Commodity_Code: '23',
    Variety: 'Red',
    Grade: 'FAQ',
    Arrival_Date: '20/09/2026',
    Min_Price: '2000',
    Max_Price: '3000',
    Modal_Price: '2500',
    ...over,
  }
}

const LUCKNOW = { state: 'Uttar Pradesh', districts: ['Lucknow'], commodities: COMMODITIES }
const clean = (rows, opts = LUCKNOW) => lib.cleanPriceRows(rows, opts)
const noDrops = () => lib.emptyPriceDrops()

describe('cleanPriceRows', () => {
  test('a good row comes out in rupees per kg, with nothing of the raw row kept', () => {
    const out = clean([mandi()])
    assert.deepEqual(out.rows, [{ date: '2026-09-20', market: 'Lucknow', market_key: 'lucknow', commodity_id: 'onion', modal_kg: 25 }])
    assert.deepEqual(out.dropped, noDrops())
    assert.deepEqual(out.droppedBy, {})
    assert.deepEqual(out.skipped, { not_listed: 0, variety: 0 })
    assert.deepEqual(out.warnings, [])
  })

  test('coerces string prices, with Indian digit grouping, and numbers', () => {
    assert.equal(clean([mandi({ Min_Price: '2,000', Max_Price: '3,000', Modal_Price: '2,500' })]).rows[0].modal_kg, 25)
    assert.equal(clean([mandi({ Min_Price: 2000, Max_Price: 3000, Modal_Price: 2500 })]).rows[0].modal_kg, 25)
  })

  test('zero: a modal price of zero or less', () => {
    const out = clean([mandi({ Modal_Price: '0', Min_Price: '0' }), mandi({ Modal_Price: '-5', Min_Price: '' })])
    assert.equal(out.rows.length, 0)
    assert.equal(out.dropped.zero, 2)
    assert.equal(out.droppedBy.onion.zero, 2)
  })

  test('nonnumeric: an unreadable price or date', () => {
    const out = clean([
      mandi({ Modal_Price: 'NR' }),
      mandi({ Modal_Price: '' }),
      mandi({ Arrival_Date: 'yesterday' }),
      mandi({ Arrival_Date: '31/02/2026' }),
    ])
    assert.equal(out.rows.length, 0)
    assert.equal(out.dropped.nonnumeric, 4)
    assert.equal(out.droppedBy.onion.nonnumeric, 4)
  })

  test('out_of_range: a modal outside [min, max], only when both are above zero', () => {
    const out = clean([
      mandi({ Modal_Price: '3500' }),
      mandi({ Modal_Price: '1500', Arrival_Date: '19/09/2026' }),
      mandi({ Modal_Price: '3500', Min_Price: '0', Arrival_Date: '18/09/2026' }),
      mandi({ Modal_Price: '3500', Max_Price: '', Arrival_Date: '17/09/2026' }),
    ])
    assert.equal(out.dropped.out_of_range, 2)
    assert.deepEqual(out.rows.map((r) => r.date), ['2026-09-18', '2026-09-17'])
  })

  test('out_of_band: outside the commodity\'s kg band, both ends inclusive', () => {
    assert.deepEqual(ONION.kg_band, [5, 120])
    const out = clean([
      mandi({ Min_Price: '300', Max_Price: '500', Modal_Price: '400' }),
      mandi({ Min_Price: '12000', Max_Price: '13000', Modal_Price: '12500', Arrival_Date: '19/09/2026' }),
      mandi({ Min_Price: '400', Max_Price: '600', Modal_Price: '500', Arrival_Date: '18/09/2026' }),
      mandi({ Min_Price: '11000', Max_Price: '13000', Modal_Price: '12000', Arrival_Date: '17/09/2026' }),
    ])
    assert.equal(out.dropped.out_of_band, 2)
    assert.deepEqual(out.rows.map((r) => r.modal_kg), [5, 120])
  })

  test('wrong_place: Pratapgarh, Uttar Pradesh is not Pratapgarh, Rajasthan', () => {
    // Both states really have a Pratapgarh; the fixture is only meaningful while they do.
    assert.ok(districtsForState('Uttar Pradesh').includes('Pratapgarh'))
    assert.ok(districtsForState('Rajasthan').includes('Pratapgarh'))
    const opts = { state: 'Uttar Pradesh', districts: ['Pratapgarh'], commodities: COMMODITIES }
    const out = clean([
      mandi({ District: 'Pratapgarh', Market: 'Pratapgarh' }),
      mandi({ State: 'Rajasthan', District: 'Pratapgarh', Market: 'Pratapgarh' }),
      mandi({ District: 'Lucknow' }),
      mandi({ State: ' uttar  pradesh ', District: 'PRATAPGARH', Market: 'Pratapgarh', Arrival_Date: '19/09/2026' }),
      mandi({ State: 'Rajasthan', District: 'Pratapgarh', Commodity_Code: '999' }),
    ], opts)
    assert.equal(out.rows.length, 2)
    assert.equal(out.dropped.wrong_place, 3)
    assert.equal(out.droppedBy.onion.wrong_place, 2)
    assert.equal(out.skipped.not_listed, 0, 'a row for another place is wrong_place even when its commodity is unlisted')
  })

  test('a district with several Agmarknet names takes all of them', () => {
    const opts = { state: 'Uttar Pradesh', districts: ['Kheri', 'Lakhimpur'], commodities: COMMODITIES }
    const out = clean([mandi({ District: 'Kheri' }), mandi({ District: 'Lakhimpur' }), mandi({ District: 'Lucknow' })], opts)
    assert.equal(out.rows.length, 2)
    assert.equal(out.dropped.wrong_place, 1)
  })

  test('the commodity list and the variety allow-list skip rather than drop', () => {
    const paddy = { Commodity: 'Paddy(Common)', Commodity_Code: '2', Min_Price: '2200', Max_Price: '2400', Modal_Price: '2300' }
    const out = clean([
      mandi({ Commodity: 'Rice', Commodity_Code: '999' }),
      mandi({ Commodity_Code: '' }),
      mandi({ ...paddy, Variety: 'Common' }),
      mandi({ ...paddy, Variety: ' common ', Arrival_Date: '19/09/2026' }),
      mandi({ ...paddy, Variety: 'Basmati', Arrival_Date: '18/09/2026' }),
      mandi({ Variety: 'Anything', Arrival_Date: '18/09/2026' }),
    ])
    assert.deepEqual(out.skipped, { not_listed: 2, variety: 1 })
    assert.deepEqual(out.dropped, noDrops())
    assert.deepEqual(out.rows.map((r) => r.commodity_id), ['paddy_common', 'paddy_common', 'onion'])
    assert.equal(out.rows[0].modal_kg, 23)
  })

  test('a different name on a listed code is a warning, once, and the row is kept', () => {
    const out = clean([
      mandi({ Commodity: 'Onion Big' }),
      mandi({ Commodity: 'Onion Big', Arrival_Date: '19/09/2026' }),
    ])
    assert.equal(out.rows.length, 2)
    assert.equal(out.warnings.length, 1)
    assert.match(out.warnings[0], /Commodity_Code 23 is named "Onion Big"/)
  })

  test('dupes: the key is place, normalised market, code, variety, grade and date', () => {
    const out = clean([
      mandi(),
      mandi({ Modal_Price: '2600' }),
      mandi({ Market: 'Lucknow APMC' }),
      mandi({ Market: 'LUCKNOW' }),
      mandi({ Variety: 'White' }),
      mandi({ Grade: 'Local' }),
      mandi({ Arrival_Date: '19/09/2026' }),
      mandi({ Market: 'Dubagga' }),
      // Differs from the first row in the commodity code alone. Agmarknet reuses
      // Variety and Grade values across crops, so a key without the code would
      // silently drop a second crop's price.
      mandi({ Commodity: 'Potato', Commodity_Code: '24', Min_Price: '1000', Max_Price: '2000', Modal_Price: '1500' }),
    ])
    assert.equal(out.dropped.dupes, 3)
    assert.equal(out.droppedBy.onion.dupes, 3)
    assert.equal(out.rows.length, 6)
    assert.equal(out.rows[0].modal_kg, 25, 'the first of a set of duplicates is the one kept')
    assert.deepEqual(new Set(out.rows.map((r) => r.market_key)), new Set(['lucknow', 'dubagga']))
    assert.deepEqual(out.rows.filter((r) => r.commodity_id === 'potato').map((r) => r.modal_kg), [15])
  })

  test('wrong_place is decided before anything else about a row', () => {
    const out = clean([mandi({ State: 'Rajasthan', Modal_Price: '0' })])
    assert.equal(out.dropped.wrong_place, 1)
    assert.equal(out.dropped.zero, 0)
  })

  test('droppedBy carries all six reasons for each commodity it names', () => {
    const out = clean([mandi({ Modal_Price: '0' })])
    assert.deepEqual(Object.keys(out.dropped).sort(), ['dupes', 'nonnumeric', 'out_of_band', 'out_of_range', 'wrong_place', 'zero'])
    assert.deepEqual(out.droppedBy, { onion: { ...noDrops(), zero: 1 } })
  })
})

// A cleaned row, as cleanPriceRows returns it.
const pr = (date, market, kg, id = 'onion') => ({ date, market, market_key: market.toLowerCase(), commodity_id: id, modal_kg: kg })

// n consecutive reporting days ending at `last`, one row a day.
function days(last, n, { kg = 20, id = 'onion', market = 'A' } = {}) {
  return Array.from({ length: n }, (_, i) => pr(lib.minusDays(last, n - 1 - i), market, kg, id))
}

const FETCH = '2026-09-24'
const stat = (rows, fetchDateYmd = FETCH) => lib.priceStatistic(rows, { fetchDateYmd })

describe('priceStatistic', () => {
  test('the median and P10/P90 of the daily medians, by hand', () => {
    // Daily medians, sorted: 10 12 14 15 16 18 20 22 25 30 → median 17,
    // P10 at h = 0.9 → 10 + 0.9 × 2 = 11.8, P90 at h = 8.1 → 25 + 0.1 × 5 = 25.5.
    // 17-09 has five rows at 10 from one mandi; pooling all 19 rows instead of
    // taking a daily median first would give a median of 15, not 17.
    const rows = [
      pr('2026-09-11', 'A', 20),
      pr('2026-09-12', 'A', 11), pr('2026-09-12', 'B', 13),
      pr('2026-09-13', 'A', 14), pr('2026-09-13', 'B', 15), pr('2026-09-13', 'C', 40),
      pr('2026-09-14', 'A', 30),
      pr('2026-09-15', 'A', 17), pr('2026-09-15', 'B', 18), pr('2026-09-15', 'C', 19),
      pr('2026-09-16', 'A', 25),
      ...Array.from({ length: 5 }, () => pr('2026-09-17', 'A', 10)),
      pr('2026-09-18', 'A', 22),
      pr('2026-09-19', 'A', 16),
      pr('2026-09-20', 'A', 14),
    ]
    const { stats, rejected } = stat(rows)
    assert.deepEqual(rejected, [])
    assert.deepEqual(stats, [{
      commodity_id: 'onion',
      indicative_price: 17,
      price_low: 11.8,
      price_high: 25.5,
      n_days: 10,
      n_markets: 3,
      first_reported: '2026-09-11',
      last_reported: '2026-09-20',
      rows_used: 19,
      future_dates: 0,
    }])
    assert.equal(lib.median(rows.map((r) => r.modal_kg)), 15, 'the fixture must tell a pooled median from a daily one')
  })

  test('n_days: 7 reporting days is no row, 8 is a row', () => {
    const seven = stat(days('2026-09-20', 7))
    assert.deepEqual(seven.stats, [])
    assert.match(seven.rejected[0].reason, /only 7 reporting day\(s\); at least 8/)
    assert.equal(stat(days('2026-09-20', 8)).stats[0].n_days, 8)
  })

  test('stale from 8 days old, still shown at 30, dropped at 31', () => {
    const at = (age) => stat(days(lib.minusDays(FETCH, age), 8))
    assert.equal('stale' in at(7).stats[0], false)
    assert.equal(at(8).stats[0].stale, true)
    assert.equal(at(30).stats[0].stale, true)
    assert.equal(at(30).stats[0].last_reported, '2026-08-25')
    const old = at(31)
    assert.deepEqual(old.stats, [])
    assert.match(old.rejected[0].reason, /last reported 31 day\(s\)/)
    assert.equal(old.rejected[0].age_days, 31)
  })

  test('only the last 30 reporting dates are used', () => {
    const rows = [
      ...days('2026-08-21', 5, { kg: 100, market: 'Old' }),
      ...days('2026-09-20', 30, { kg: 10, market: 'New' }),
    ]
    const s = stat(rows).stats[0]
    assert.equal(s.n_days, 30)
    assert.equal(s.price_high, 10)
    assert.equal(s.indicative_price, 10)
    assert.equal(s.n_markets, 1)
    assert.equal(s.rows_used, 30)
    assert.equal(s.first_reported, '2026-08-22')
  })

  test('a date after the fetch date is counted and left out, and cannot push a real day out', () => {
    const rows = [...days('2026-09-20', 30), pr('2026-09-30', 'A', 999)]
    const s = stat(rows).stats[0]
    assert.equal(s.future_dates, 1)
    assert.equal(s.n_days, 30)
    assert.equal(s.first_reported, '2026-08-22')
    assert.equal(s.last_reported, '2026-09-20')
    assert.equal(s.price_high, 20)
  })

  test('one result per commodity, sorted by id, and a bad fetch date throws', () => {
    const { stats } = stat([...days('2026-09-20', 8, { id: 'tomato' }), ...days('2026-09-20', 8, { id: 'garlic' })])
    assert.deepEqual(stats.map((s) => s.commodity_id), ['garlic', 'tomato'])
    assert.throws(() => stat([], '24/09/2026'), /not yyyy-mm-dd/)
    assert.deepEqual(stat([]), { stats: [], rejected: [] })
  })
})

describe('pickAgricultureRows', () => {
  const ORDER = COMMODITIES.map((c) => c.id)
  const pick = (stats, order = ORDER) => lib.pickAgricultureRows(stats, { order }).map((s) => s.commodity_id)

  test('the commodity file lists the staples first, since its order is the display order', () => {
    assert.deepEqual(ORDER.slice(0, 5), ['wheat', 'paddy_common', 'potato', 'onion', 'tomato'])
    assert.equal(new Set(ORDER).size, ORDER.length)
  })

  test('the first Varanasi dry run: six crops tied on days and rows show the staples, not the alphabet', () => {
    // 24 September 2026: one mandi, one row a day, 30 days each. The old sort
    // fell through to the id and showed garlic, ginger and green chilli.
    const tied = ['garlic', 'ginger_green', 'green_chilli', 'onion', 'potato', 'tomato']
      .map((commodity_id) => ({ commodity_id, n_days: 30, n_markets: 1, rows_used: 30 }))
    assert.deepEqual(pick(tied), ['potato', 'onion', 'tomato'])
  })

  test('the order outranks days and rows; a stale figure goes last; three at most; input untouched', () => {
    const stats = [
      { commodity_id: 'coriander_leaves', n_days: 30, rows_used: 90 },
      { commodity_id: 'garlic', n_days: 30, rows_used: 60 },
      { commodity_id: 'wheat', n_days: 9, rows_used: 9, stale: true },
      { commodity_id: 'potato', n_days: 12, rows_used: 12 },
      { commodity_id: 'paddy_common', n_days: 8, rows_used: 8 },
    ]
    const before = stats.map((s) => s.commodity_id)
    assert.deepEqual(pick(stats), ['paddy_common', 'potato', 'garlic'])
    assert.deepEqual(stats.map((s) => s.commodity_id), before)
    // With nothing fresher left, a stale figure is still shown, just last.
    assert.deepEqual(pick(stats.filter((s) => s.commodity_id === 'wheat' || s.commodity_id === 'garlic')), ['garlic', 'wheat'])
    assert.equal(pick(stats.slice(0, 2)).length, 2)
    assert.deepEqual(pick([]), [])
  })

  test('a crop missing from the order goes after every listed one, then by days, then by id', () => {
    const stats = [
      { commodity_id: 'zzz', n_days: 30 },
      { commodity_id: 'aaa', n_days: 30 },
      { commodity_id: 'mmm', n_days: 40 },
      { commodity_id: 'coriander_leaves', n_days: 8 },
    ]
    assert.deepEqual(pick(stats), ['coriander_leaves', 'mmm', 'aaa'])
  })

  test('refuses to rank without an order, rather than falling back to the alphabet', () => {
    assert.throws(() => lib.pickAgricultureRows([{ commodity_id: 'wheat', n_days: 30 }]), /order must be/)
  })
})

// ---------------------------------------------------------------- Udyam

const acts = (...codes) => JSON.stringify(codes.map((c) => ({ NIC5DigitId: c, Description: 'synthetic' })))
const classify = (activities) => {
  const set = lib.classifyUnit(activities, NIC)
  return set === null ? null : sorted(set)
}

describe('expandPrefixes and compileNicMap', () => {
  test('a range is every prefix of the same width, low to high', () => {
    const r = lib.expandPrefixes(['49-96'])
    assert.equal(r.length, 48)
    assert.equal(r[0], '49')
    assert.equal(r.at(-1), '96')
    assert.deepEqual(lib.expandPrefixes(['01-03', '1050']), ['01', '02', '03', '1050'])
    for (const bad of ['9-10', '96-49', '4x', '49 - 96']) assert.throws(() => lib.expandPrefixes([bad]), /NIC map/)
  })

  test('the shipped map compiles, alphabetically, once', () => {
    const c = lib.compileNicMap(NIC)
    assert.deepEqual(c.categories.map((x) => x.name), ['dairy', 'food processing', 'handicrafts', 'manufacturing', 'retail', 'services', 'tailoring'])
    assert.equal(c.version, 1)
    assert.equal(lib.compileNicMap(NIC), c)
  })
})

describe('classifyUnit', () => {
  test('a 10500 unit is dairy, not food processing', () => {
    assert.deepEqual(classify(acts('10500')), ['dairy', 'manufacturing'])
    assert.deepEqual(classify(acts('10710')), ['food processing', 'manufacturing'])
  })

  test('the exclude is strict: a dairy code beside a bakery code drops food processing', () => {
    assert.deepEqual(classify(acts('10710', '10500')), ['dairy', 'manufacturing'])
  })

  test('the 49-96 range, both ends and just outside', () => {
    assert.deepEqual(classify(acts('49231')), ['services'])
    assert.deepEqual(classify(acts('96020')), ['services'])
    assert.deepEqual(classify(acts('45200')), ['services'])
    assert.deepEqual(classify(acts('48000')), [])
    assert.deepEqual(classify(acts('97000')), [])
    assert.deepEqual(classify(acts('45100')), [])
  })

  test('10-33 is manufacturing, and nothing either side of it', () => {
    assert.deepEqual(classify(acts('33120')), ['manufacturing'])
    assert.deepEqual(classify(acts('34000')), [])
    assert.deepEqual(classify(acts('09100')), [])
    assert.deepEqual(classify(acts('13920')), ['handicrafts', 'manufacturing'])
  })

  test('several activities count under every heading they reach', () => {
    assert.deepEqual(classify(acts('14101', '47711')), ['manufacturing', 'retail', 'tailoring'])
    assert.deepEqual(classify(acts('47211', '47190')), ['retail'])
  })

  test('unparseable input is null; an empty list is no category', () => {
    for (const bad of ['not json', '{"a":1}', '[{"NIC5DigitId":"abc"}]', '[{"Description":"x"}]', null, undefined, 42]) {
      assert.equal(lib.classifyUnit(bad, NIC), null, `for ${JSON.stringify(bad)}`)
    }
    assert.deepEqual(classify('[]'), [])
    assert.deepEqual(classify([{ NIC5DigitId: '47211' }]), ['retail'])
  })

  test('a numeric code is zero-padded to five digits before it is matched', () => {
    // 01110 is growing cereals. Unpadded, "1110" would start with 11 and read as a
    // beverage maker.
    assert.deepEqual(lib.nicCodes([{ NIC5DigitId: 1110 }]), ['01110'])
    assert.deepEqual(lib.nicCodes('[{"NIC5DigitId":"1110"}]'), ['01110'])
    assert.deepEqual(classify([{ NIC5DigitId: 1110 }]), [])
    assert.deepEqual(lib.nicCodes([{ NIC5DigitId: '10500' }, { NIC5DigitId: 10500 }]), ['10500'])
    assert.deepEqual(lib.nicCodes([{ NIC5DigitId: 'x' }, { NIC5DigitId: ' 47211 ' }]), ['47211'])
    assert.equal(lib.nicCodes([{ NIC5DigitId: 1.5 }]), null)
  })
})

describe('tallies', () => {
  test('addToTally keeps counts only, never a name, an address or a PIN code', () => {
    const records = [
      { LG_DT_Code: '162', Activities: acts('14101'), EnterpriseName: 'Synthetic Test Traders', CommunicationAddress: '1 Synthetic Lane', Pincode: '999999' },
      { LG_DT_Code: 162, Activities: 'garbage' },
      { LG_DT_Code: '187', Activities: acts('47211') },
    ]
    const t0 = lib.emptyTally(NIC)
    const t1 = lib.addToTally(t0, records, { lgd: 162, nicMap: NIC })
    assert.deepEqual({ ...t1, counts: undefined }, { rows: 3, used: 1, unparseable: 1, wrong_place: 1, counts: undefined })
    assert.equal(t1.counts.tailoring, 1)
    assert.equal(t1.counts.manufacturing, 1)
    assert.equal(t1.counts.retail, 0)
    assert.deepEqual(Object.keys(t1).sort(), ['counts', 'rows', 'unparseable', 'used', 'wrong_place'])
    const json = JSON.stringify(t1)
    for (const pii of ['Synthetic Test Traders', 'Synthetic Lane', '999999']) assert.ok(!json.includes(pii), `the tally carries "${pii}"`)
    assert.equal(t0.rows, 0, 'addToTally must return a new tally')
    assert.equal(t0.counts.tailoring, 0)
  })

  test('more than 1% unreadable is too many', () => {
    assert.equal(lib.tooManyUnparseable({ rows: 100, unparseable: 1 }), false)
    assert.equal(lib.tooManyUnparseable({ rows: 100, unparseable: 2 }), true)
    assert.equal(lib.tooManyUnparseable({ rows: 0, unparseable: 0 }), false)
  })

  test('sumTallies adds field by field', () => {
    const a = { rows: 3, used: 2, unparseable: 1, wrong_place: 0, counts: { retail: 2 } }
    const b = { rows: 5, used: 4, unparseable: 0, wrong_place: 1, counts: { retail: 1, tailoring: 3 } }
    assert.deepEqual(lib.sumTallies([a, b]), { rows: 8, used: 6, unparseable: 1, wrong_place: 1, counts: { retail: 3, tailoring: 3 } })
  })
})

const tallyOf = (counts) => ({ rows: 0, used: 0, unparseable: 0, wrong_place: 0, counts })
const BASE_COUNTS = { 'food processing': 9, dairy: 9, handicrafts: 10, manufacturing: 400, retail: 49, services: 0, tailoring: 12 }

describe('tallyToRows', () => {
  const rows = lib.tallyToRows(tallyOf(BASE_COUNTS), { nicMap: NIC, districtTotal: 400 })
  const by = (name) => rows.find((r) => r.business_category === name)

  test('alphabetical, and dairy is not emitted below its own floor', () => {
    assert.deepEqual(rows.map((r) => r.business_category), ['food processing', 'handicrafts', 'manufacturing', 'retail', 'services', 'tailoring'])
    const withDairy = lib.tallyToRows(tallyOf({ ...BASE_COUNTS, dairy: 10 }), { nicMap: NIC, districtTotal: 400 })
    assert.equal(withDairy.find((r) => r.business_category === 'dairy').count, 10)
    // NIC 1050 is makers of dairy products, so the row says it does not count cattle keepers.
    assert.equal(withDairy.find((r) => r.business_category === 'dairy').note_code, 'mknote.dairyProducts')
  })

  test('9 is suppressed and 10 is printed', () => {
    assert.deepEqual(by('food processing'), {
      business_category: 'food processing',
      count: null,
      count_suppressed: true,
      share_percent: null,
      district_total: 400,
      nic_classes: ['10', '11'],
    })
    assert.equal(by('handicrafts').count, 10)
    assert.equal(by('handicrafts').count_suppressed, false)
    assert.equal(by('services').count, null, 'zero is under 10 too')
  })

  test('share is count over district total, to 1 decimal', () => {
    assert.equal(by('retail').share_percent, 12.3)
    assert.equal(by('handicrafts').share_percent, 2.5)
    assert.equal(by('manufacturing').share_percent, 100)
    assert.equal(by('tailoring').share_percent, 3)
    const thirds = lib.tallyToRows(tallyOf({ retail: 10, tailoring: 20 }), { nicMap: NIC, districtTotal: 30 })
    assert.equal(thirds.find((r) => r.business_category === 'retail').share_percent, 33.3)
    assert.equal(thirds.find((r) => r.business_category === 'tailoring').share_percent, 66.7)
  })

  test('no usable district total means no share', () => {
    for (const districtTotal of [null, 0, 12.5, '400']) {
      const out = lib.tallyToRows(tallyOf(BASE_COUNTS), { nicMap: NIC, districtTotal })
      assert.ok(out.every((r) => r.share_percent === null && r.district_total === null), `for ${JSON.stringify(districtTotal)}`)
    }
  })

  test('nic_classes are the map\'s own strings, and the note follows the map', () => {
    assert.deepEqual(by('services').nic_classes, ['4520', '4540', '49-96'])
    assert.equal(by('services').note_code, 'mknote.ourGrouping')
    assert.equal(by('services').note, NOTE_EN['mknote.ourGrouping'])
    assert.equal(by('handicrafts').note_code, 'mknote.ourGrouping')
    assert.equal('note_code' in by('retail'), false)
  })
})

describe('aggregateToRow', () => {
  test('the Ministry\'s own total, with its note and no share', () => {
    assert.deepEqual(lib.aggregateToRow('services', { total: '1234' }), {
      business_category: 'services',
      count: 1234,
      count_suppressed: false,
      share_percent: null,
      district_total: null,
      nic_classes: [],
      note_code: 'mknote.ministryServices',
      note: NOTE_EN['mknote.ministryServices'],
    })
    assert.equal(lib.aggregateToRow('manufacturing', { total: ' 15 ' }).note_code, 'mknote.ministryManufacturing')
    assert.equal(lib.aggregateToRow('manufacturing', { total: ' 15 ' }).count, 15)
  })

  test('suppressed below 10, refused when not a whole number, and only two kinds exist', () => {
    const nine = lib.aggregateToRow('services', { total: '9' })
    assert.equal(nine.count, null)
    assert.equal(nine.count_suppressed, true)
    const ten = lib.aggregateToRow('services', { total: '10' })
    assert.equal(ten.count, 10)
    assert.equal(ten.count_suppressed, false)
    for (const total of ['NA', '12.5', '', undefined, '-3']) assert.equal(lib.aggregateToRow('services', { total }), null)
    assert.throws(() => lib.aggregateToRow('retail', { total: '100' }), /No Ministry aggregate exists for "retail"/)
  })
})

describe('stateRowEligibility', () => {
  test('complete coverage is eligible', () => {
    assert.deepEqual(lib.stateRowEligibility({ stateDistricts: ['A', 'B'], coveredDistricts: ['A', 'B'], succeededDistricts: ['A', 'B'] }),
      { eligible: true, missing: [], failed: [] })
  })

  test('one failed or one missing district is not', () => {
    assert.deepEqual(lib.stateRowEligibility({ stateDistricts: ['A', 'B'], coveredDistricts: ['A', 'B'], succeededDistricts: ['A'] }),
      { eligible: false, missing: [], failed: ['B'] })
    assert.deepEqual(lib.stateRowEligibility({ stateDistricts: ['A', 'B'], coveredDistricts: ['A'], succeededDistricts: ['A'] }),
      { eligible: false, missing: ['B'], failed: [] })
    assert.equal(lib.stateRowEligibility({ stateDistricts: [], coveredDistricts: [], succeededDistricts: [] }).eligible, false)
  })

  test('Uttar Pradesh with only the shipped crosswalk is not eligible', () => {
    const up = districtsForState('Uttar Pradesh')
    const covered = CROSSWALK.entries.filter((e) => e.state === 'Uttar Pradesh').map((e) => e.district)
    const out = lib.stateRowEligibility({ stateDistricts: up, coveredDistricts: covered, succeededDistricts: covered })
    assert.equal(out.eligible, false)
    assert.equal(out.missing.length, up.length - covered.length)
    assert.deepEqual(out.failed, [])
  })
})

// ---------------------------------------------------------------- provenance

describe('titles, attribution and methods', () => {
  test('resolveTitle prefers what the API says, and says when it differs', () => {
    assert.deepEqual(lib.resolveTitle('agmarknet', RESOURCES.agmarknet.title), { title: RESOURCES.agmarknet.title, warning: null })
    const other = lib.resolveTitle('agmarknet', ' A renamed dataset ')
    assert.equal(other.title, 'A renamed dataset')
    assert.match(other.warning, /not the expected/)
    const none = lib.resolveTitle('udyamList', undefined)
    assert.equal(none.title, RESOURCES.udyamList.title)
    assert.match(none.warning, /sent no title/)
  })

  test('the GODL attribution carries India\'s date of the update', () => {
    assert.equal(
      lib.attribution('agmarknet', { updatedIso: '2026-09-20T20:00:00Z', title: RESOURCES.agmarknet.title }),
      'Ministry of Agriculture and Farmers Welfare (Directorate of Marketing and Inspection), 2026, '
        + 'Variety-wise Daily Market Prices Data of Commodity, Open Government Data Platform India, 21/09, '
        + 'https://www.data.gov.in/resource/variety-wise-daily-market-prices-data-commodity. '
        + 'Published under Government Open Data License - India: https://www.data.gov.in/Godl.',
    )
    const newYear = lib.attribution('udyamList', { updatedIso: '2026-12-31T19:00:00Z' })
    assert.ok(newYear.startsWith('Ministry of Micro, Small and Medium Enterprises, 2027, List of MSME Registered Units under UDYAM, '))
    assert.ok(newYear.includes(', 01/01, https://www.data.gov.in/resource/list-msme-registered-units-under-udyam.'))
  })

  test('no attribution without a page URL or a timestamp', () => {
    assert.throws(() => lib.attribution('agmarknetToday', { updatedIso: '2026-09-20T00:00:00Z' }), /No attribution template/)
    assert.throws(() => lib.attribution('bogus', { updatedIso: '2026-09-20T00:00:00Z' }), /No attribution template/)
    assert.throws(() => lib.attribution('agmarknet', { updatedIso: 'soon' }), /is not a timestamp/)
  })

  test('each method sentence names its scope', () => {
    assert.match(lib.priceMethod('district'), /mandi in the district,/)
    assert.match(lib.priceMethod('state'), /every district of the state/)
    assert.match(lib.priceMethod('district'), /last 30 reporting days/)
    assert.match(lib.listMethod('district'), /for the district/)
    assert.match(lib.listMethod('state'), /summed over every district/)
    assert.match(lib.aggregateMethod('services'), /registered service enterprises/)
    assert.match(lib.aggregateMethod('manufacturing'), /registered manufacturing enterprises/)
  })
})

// ---------------------------------------------------------------- rows

const SHA = 'a'.repeat(64)
const RUN = { fetched_at: lib.istTimestamp(Date.UTC(2026, 8, 24, 4, 30, 0)), crosswalk_version: CROSSWALK.version, script_sha256: SHA }
const UPDATED = '2026-09-22T19:00:00Z' // 23 September in India
const LKO = { state: 'Uttar Pradesh', district: 'Lucknow', scope: 'district' }
const STAT = { commodity_id: 'onion', indicative_price: 17, price_low: 11.8, price_high: 25.5, n_days: 10, n_markets: 3, first_reported: '2026-09-11', last_reported: '2026-09-20', rows_used: 19, future_dates: 0 }

function priceFixture({ place = LKO, stat: s = STAT } = {}) {
  return lib.priceRow({
    place,
    stat: s,
    commodity: COMMODITIES.find((c) => c.id === s.commodity_id),
    lastVerified: FETCH,
    provenance: lib.makeProvenance('agmarknet', {
      ...RUN,
      title: RESOURCES.agmarknet.title,
      updatedBefore: UPDATED,
      updatedAfter: UPDATED,
      query: lib.buildQuery(RESOURCES.agmarknet.id, [['format', 'json'], ['filters[State]', 'Uttar Pradesh'], ['filters[District]', 'Lucknow']]),
      total_reported: 40,
      rows_fetched: 40,
      rows_used: s.rows_used,
      rows_dropped: lib.emptyPriceDrops(),
      period_start: s.first_reported,
      period_end: s.last_reported,
      method: lib.priceMethod(place.scope),
      nic_map_version: null,
    }),
  })
}

function listFixtures() {
  const provenance = lib.makeProvenance('udyamList', {
    ...RUN,
    title: RESOURCES.udyamList.title,
    updatedBefore: UPDATED,
    updatedAfter: UPDATED,
    query: lib.buildQuery(RESOURCES.udyamList.id, [['filters[LG_DT_Code]', 162], ['fields', 'LG_DT_Code,Activities']]),
    total_reported: 400,
    rows_fetched: 400,
    rows_used: 398,
    rows_dropped: { unparseable: 2, wrong_place: 0 },
    period_start: null,
    period_end: lib.toIstDate(UPDATED),
    method: lib.listMethod('district'),
    nic_map_version: NIC.version,
  })
  return lib.tallyToRows(tallyOf({ ...BASE_COUNTS, dairy: 11 }), { nicMap: NIC, districtTotal: 400 })
    .map((part) => lib.countRow({ place: LKO, part, sourceCode: 'src.udyamList', lastVerified: FETCH, provenance }))
}

function aggregateFixture(category = 'services') {
  const kind = lib.AGGREGATE_KINDS[category].kind
  return lib.countRow({
    place: LKO,
    part: lib.aggregateToRow(category, { total: '1234' }),
    sourceCode: 'src.udyamAggregate',
    lastVerified: FETCH,
    provenance: lib.makeProvenance(kind, {
      ...RUN,
      title: RESOURCES[kind].title,
      updatedBefore: UPDATED,
      updatedAfter: UPDATED,
      query: lib.buildQuery(RESOURCES[kind].id, [['filters[lg_dt_code]', 162]]),
      total_reported: 700,
      rows_fetched: 1,
      rows_used: 1,
      rows_dropped: { unparseable: 0, wrong_place: 0 },
      period_start: null,
      period_end: lib.toIstDate(UPDATED),
      method: lib.aggregateMethod(category),
      nic_map_version: null,
    }),
  })
}

const listRow = (name) => listFixtures().find((r) => r.business_category === name)
const CHECK = { commodities: COMMODITIES, nicMap: NIC }
const validate = (row) => lib.validateRow(row, CHECK)

function everyGoodRow() {
  return [
    priceFixture(),
    priceFixture({ place: { state: 'Uttar Pradesh', district: 'Lucknow', scope: 'state' } }),
    priceFixture({ stat: { ...STAT, stale: true } }),
    ...listFixtures(),
    aggregateFixture('services'),
    aggregateFixture('manufacturing'),
  ]
}

describe('row builders', () => {
  test('makeProvenance fills the licence, page URL and attribution itself', () => {
    const p = priceFixture().provenance
    assert.equal(p.resource_id, RESOURCES.agmarknet.id)
    assert.equal(p.publisher, RESOURCES.agmarknet.publisher)
    assert.equal(p.page_url, RESOURCES.agmarknet.page_url)
    assert.equal(p.licence, lib.LICENCE.name)
    assert.equal(p.licence_url, lib.LICENCE.url)
    assert.equal(p.attribution, lib.attribution('agmarknet', { updatedIso: UPDATED, title: RESOURCES.agmarknet.title }))
    assert.deepEqual(p.resource_updated_date, { before: UPDATED, after: UPDATED })
    assert.equal(p.nic_map_version, null)
  })

  test('priceRow: a state row has no district, and stale appears only as true', () => {
    const row = priceFixture()
    assert.equal(row.commodity, 'Onion')
    assert.equal(row.unit, 'kg')
    assert.equal(row.source, SOURCE_EN['src.agmarknetMandi'])
    assert.equal('stale' in row, false)
    assert.equal(priceFixture({ place: { ...LKO, scope: 'state' } }).district, '')
    assert.equal(priceFixture({ stat: { ...STAT, stale: true } }).stale, true)
    assert.equal('stale' in priceFixture({ stat: { ...STAT, stale: false } }), false)
  })

  test('countRow carries the note only when the part has one', () => {
    assert.equal(listRow('services').note_code, 'mknote.ourGrouping')
    assert.equal('note' in listRow('retail'), false)
    assert.equal(aggregateFixture().source, SOURCE_EN['src.udyamAggregate'])
  })
})

describe('validateRow', () => {
  test('every row the builders produce passes', () => {
    for (const row of everyGoodRow()) assert.deepEqual(validate(row), [], lib.rowIdentity(row))
  })

  test('no emitted row has a _code key other than source_code and note_code', () => {
    for (const row of everyGoodRow()) {
      const codes = Object.keys(row).filter((k) => /_codes?$/.test(k))
      assert.ok(codes.every((k) => k === 'source_code' || k === 'note_code'), `${lib.rowIdentity(row)}: ${codes}`)
    }
  })

  test('no emitted row carries a key-shaped string or api-key', () => {
    for (const row of everyGoodRow()) {
      const json = JSON.stringify(row)
      assert.ok(!json.includes(lib.SAMPLE_KEY))
      assert.ok(!/api-key/i.test(json))
      assert.ok(!/(?<![0-9a-f])[0-9a-f]{56}(?![0-9a-f])/i.test(json))
    }
  })

  test('something that is not an object', () => {
    assert.deepEqual(lib.validateRow(null), ['row is not an object'])
    assert.deepEqual(lib.validateRow([]), ['row is not an object'])
    assert.deepEqual(lib.validateRow('row'), ['row is not an object'])
  })

  // [what breaks, the good row to start from, how to break it, what must be reported]
  const cases = [
    ['a missing key', priceFixture, (r) => { delete r.n_days }, /missing key "n_days"/],
    ['an unknown key', priceFixture, (r) => { r.extra = 1 }, /unexpected key "extra"/],
    ['an illustrative-era key', priceFixture, (r) => { r.demand_indicator = 'high' }, /unexpected key "demand_indicator"/],
    ['a translation code keycheck would chase', priceFixture, (r) => { r.seasonality_code = 'seas.x' }, /"seasonality_code" ends in _code/],
    ['a plural _codes key', priceFixture, (r) => { r.reason_codes = [] }, /"reason_codes" ends in _code/],
    ['a personal-data key', priceFixture, (r) => { r.provenance.EnterpriseName = 'x' }, /looks like personal data/],
    ['a PIN code key', priceFixture, (r) => { r.provenance.pincode = 'x' }, /looks like personal data/],
    ['a key key', priceFixture, (r) => { r.provenance.api_key = 'x' }, /looks like personal data or a secret/],
    ['a key-shaped string', priceFixture, (r) => { r.provenance.method = `x ${KEY_SHAPED}` }, /looks like an API key/],
    ['the sample key in a string', priceFixture, (r) => { r.provenance.method = `x ${lib.SAMPLE_KEY} y` }, /looks like an API key/],
    ['api-key in the query', priceFixture, (r) => { r.provenance.query = 'format=json&api-key=zzz' }, /provenance.query must be a string without api-key/],
    ['an empty state', priceFixture, (r) => { r.state = '' }, /state must be a non-empty string/],
    ['an unknown scope', priceFixture, (r) => { r.scope = 'block' }, /scope "block"/],
    ['a state row naming a district', priceFixture, (r) => { r.scope = 'state' }, /a state row must have district ""/],
    ['a district row with no district', priceFixture, (r) => { r.district = '' }, /a district row must name its district/],
    ['an unknown category', () => listRow('retail'), (r) => { r.business_category = 'other' }, /business_category "other" is not a category value/],
    ['the illustrative source', priceFixture, (r) => { r.source_code = 'src.prototypeEstimate' }, /source_code "src.prototypeEstimate" is not one of/],
    ['source drifting from its code', priceFixture, (r) => { r.source = 'Agmarknet' }, /source is not the English of source_code/],
    ['last_verified in the wrong format', priceFixture, (r) => { r.last_verified = '24/09/2026' }, /last_verified is not yyyy-mm-dd/],
    ['a note_code with no note', priceFixture, (r) => { r.note_code = 'mknote.ourGrouping' }, /note_code and note must be both present/],
    ['an unknown note_code', priceFixture, (r) => { r.note_code = 'mknote.bogus'; r.note = 'x' }, /note_code "mknote.bogus" is unknown/],
    ['a note drifting from its code', () => listRow('services'), (r) => { r.note = 'Different words.' }, /note is not the English of note_code/],
    ['no provenance', priceFixture, (r) => { r.provenance = null }, /provenance must be an object/],
    ['a provenance field missing', priceFixture, (r) => { delete r.provenance.script_sha256 }, /provenance is missing "script_sha256"/],
    ['another licence', priceFixture, (r) => { r.provenance.licence = 'CC-BY-4.0' }, /licence is not GODL-India/],
    ['another licence URL', priceFixture, (r) => { r.provenance.licence_url = 'https://example.org' }, /licence_url is not the GODL-India URL/],
    ['an attribution with no URLs', priceFixture, (r) => { r.provenance.attribution = 'Some ministry, 2026.' }, /attribution must contain the page URL and the licence URL/],
    ['fetched_at in UTC', priceFixture, (r) => { r.provenance.fetched_at = '2026-09-24T04:30:00Z' }, /fetched_at must be ISO with \+05:30/],
    ['a flat updated date', priceFixture, (r) => { r.provenance.resource_updated_date = UPDATED }, /resource_updated_date must be \{before, after\}/],
    ['an unreadable period_end', priceFixture, (r) => { r.provenance.period_end = 'x' }, /period_end is not yyyy-mm-dd/],
    ['a short hash', priceFixture, (r) => { r.provenance.script_sha256 = 'abc' }, /script_sha256 is not a sha256/],
    ['no method', priceFixture, (r) => { r.provenance.method = '' }, /method must be a sentence/],
    ['a negative row count', priceFixture, (r) => { r.provenance.rows_used = -1 }, /provenance.rows_used must be a whole number/],
    ['a fractional row count', priceFixture, (r) => { r.provenance.total_reported = 1.5 }, /provenance.total_reported must be a whole number/],
    ['count drops on a price row', priceFixture, (r) => { r.provenance.rows_dropped = { unparseable: 0, wrong_place: 0 } }, /rows_dropped must be \{zero, nonnumeric/],
    ['a negative drop', priceFixture, (r) => { r.provenance.rows_dropped.zero = -1 }, /rows_dropped must be/],
    ['a price row that is not agriculture', priceFixture, (r) => { r.business_category = 'dairy' }, /a price row must be agriculture/],
    ['a price row from Udyam', priceFixture, (r) => { r.source_code = 'src.udyamList'; r.source = SOURCE_EN['src.udyamList'] }, /a price row must come from Agmarknet/],
    ['an unlisted commodity', priceFixture, (r) => { r.commodity_id = 'rice' }, /commodity_id "rice" is not in tools\/market-commodities.json/],
    ['a commodity name drifting from its id', priceFixture, (r) => { r.commodity = 'Onions' }, /commodity is not the English of its commodity_id/],
    ['a price per quintal', priceFixture, (r) => { r.unit = 'quintal' }, /unit must be "kg"/],
    ['three decimals', priceFixture, (r) => { r.indicative_price = 17.123 }, /indicative_price must be a number with at most 2 decimals/],
    ['a price as a string', priceFixture, (r) => { r.price_high = '25.5' }, /price_high must be a number/],
    ['a range that does not contain the figure', priceFixture, (r) => { r.price_low = 20 }, /price_low <= indicative_price <= price_high does not hold/],
    ['too few days', priceFixture, (r) => { r.n_days = 7 }, /n_days must be a whole number of at least 8/],
    ['no mandi', priceFixture, (r) => { r.n_markets = 0 }, /n_markets must be a whole number of at least 1/],
    ['an unreadable last_reported', priceFixture, (r) => { r.last_reported = '20/09/2026' }, /last_reported is not yyyy-mm-dd/],
    ['stale: false', priceFixture, (r) => { r.stale = false }, /stale may only be present as true/],
    ['the today resource cited on a price row', priceFixture, (r) => { r.provenance.resource_id = RESOURCES.agmarknetToday.id }, /Agmarknet history resource/],
    ['a NIC version on a price row', priceFixture, (r) => { r.provenance.nic_map_version = 1 }, /nic_map_version must be null on a price row/],
    ['no period_start on a price row', priceFixture, (r) => { r.provenance.period_start = null }, /period_start is not yyyy-mm-dd/],
    ['a period_end that is not the last date', priceFixture, (r) => { r.provenance.period_end = '2026-09-19' }, /period_end must be the last date used/],
    ['an unknown metric', priceFixture, (r) => { r.metric = 'price' }, /metric "price" is not/],

    ['a count under 10', () => listRow('retail'), (r) => { r.count = 9; r.share_percent = 2.3 }, /count must be null or a whole number of at least 10/],
    ['a fractional count', () => listRow('retail'), (r) => { r.count = 49.5 }, /count must be null or a whole number/],
    ['a null count not marked suppressed', () => listRow('retail'), (r) => { r.count = null; r.share_percent = null }, /count_suppressed must be true exactly when count is null/],
    ['a count marked suppressed', () => listRow('retail'), (r) => { r.count_suppressed = true }, /count_suppressed must be true exactly when count is null/],
    ['two decimals on a share', () => listRow('retail'), (r) => { r.share_percent = 12.25 }, /share_percent must be null or a number with 1 decimal/],
    ['a share over 100', () => listRow('retail'), (r) => { r.share_percent = 101 }, /share_percent must be null or a number with 1 decimal/],
    ['a share that does not follow from the count', () => listRow('retail'), (r) => { r.share_percent = 12.4 }, /share_percent does not equal count \/ district_total/],
    ['a zero district total', () => listRow('retail'), (r) => { r.district_total = 0 }, /district_total must be null or a whole number/],
    ['numeric NIC classes', () => listRow('retail'), (r) => { r.nic_classes = [47] }, /nic_classes must be an array of strings/],
    ['a share on a suppressed count', () => listRow('food processing'), (r) => { r.share_percent = 2.3 }, /a suppressed count must have a null share/],
    ['a count for agriculture', () => listRow('retail'), (r) => { r.business_category = 'agriculture' }, /agriculture gets prices only, never a count/],
    ['a category the NIC map does not have', () => listRow('retail'), (r) => { r.business_category = 'agriculture' }, /"agriculture" is not in the NIC map/],
    ['a note the map does not give', () => listRow('retail'), (r) => { r.note_code = 'mknote.ourGrouping'; r.note = NOTE_EN['mknote.ourGrouping'] }, /the note does not match the NIC map/],
    ['a note the map gives, missing', () => listRow('services'), (r) => { delete r.note_code; delete r.note }, /the note does not match the NIC map/],
    ['a district list row with no total', () => listRow('retail'), (r) => { r.district_total = null; r.share_percent = null }, /a district list row must carry the district total/],
    ['a list row citing the Ministry total', () => listRow('retail'), (r) => { r.provenance.resource_id = RESOURCES.udyamTotal.id }, /a list row must cite the Udyam list resource/],
    ['a list row with no NIC version', () => listRow('retail'), (r) => { r.provenance.nic_map_version = null }, /must be the NIC map version on a list row/],
    ['a period_start on a count row', () => listRow('retail'), (r) => { r.provenance.period_start = '2026-09-01' }, /period_start must be null on a count row/],
    ['a period_end in UTC rather than India', () => listRow('retail'), (r) => { r.provenance.period_end = '2026-09-22' }, /IST date of resource_updated_date.after/],
    ['price drops on a count row', () => listRow('retail'), (r) => { r.provenance.rows_dropped = lib.emptyPriceDrops() }, /rows_dropped must be \{unparseable, wrong_place\}/],
    ['a count from Agmarknet', () => listRow('retail'), (r) => { r.source_code = 'src.agmarknetMandi'; r.source = SOURCE_EN['src.agmarknetMandi'] }, /a count row cannot come from Agmarknet/],

    ['an aggregate for another kind of work', aggregateFixture, (r) => { r.business_category = 'retail' }, /an aggregate row must be services or manufacturing/],
    ['a share on an aggregate', aggregateFixture, (r) => { r.district_total = 5000; r.share_percent = 24.7 }, /an aggregate row must have a null share and a null district_total/],
    ['NIC classes on an aggregate', aggregateFixture, (r) => { r.nic_classes = ['4520'] }, /an aggregate row must have nic_classes \[\]/],
    ['the other aggregate\'s note', aggregateFixture, (r) => { r.note_code = 'mknote.ministryManufacturing'; r.note = NOTE_EN['mknote.ministryManufacturing'] }, /must carry mknote.ministryServices/],
    ['the other aggregate\'s resource', aggregateFixture, (r) => { r.provenance.resource_id = RESOURCES.udyamManufacturing.id }, /the aggregate row cites the wrong resource/],
    ['a NIC version on an aggregate', aggregateFixture, (r) => { r.provenance.nic_map_version = 1 }, /nic_map_version must be null on an aggregate row/],
  ]

  for (const [what, make, breakIt, expected] of cases) {
    test(`rejects ${what}`, () => {
      const row = structuredClone(make())
      assert.deepEqual(validate(row), [], 'the fixture must pass before it is broken')
      breakIt(row)
      const errs = validate(row)
      assert.ok(errs.some((e) => expected.test(e)), `expected ${expected}, got ${JSON.stringify(errs)}`)
    })
  }
})

// ---------------------------------------------------------------- output

const r = (over) => ({ state: 'Uttar Pradesh', district: 'Lucknow', scope: 'district', metric: METRIC_PRICE, business_category: 'agriculture', ...over })

describe('output', () => {
  test('placeKey and rowIdentity', () => {
    assert.equal(lib.placeKey(r()), 'Uttar Pradesh/Lucknow')
    assert.equal(lib.placeKey(r({ scope: 'state', district: '' })), 'Uttar Pradesh/')
    assert.equal(lib.rowIdentity(r({ commodity_id: 'onion' })), 'Uttar Pradesh / Lucknow / wholesale_price_per_kg / onion')
    assert.equal(lib.rowIdentity(r({ metric: METRIC_COUNT, business_category: 'retail' })), 'Uttar Pradesh / Lucknow / registered_units / retail')
    assert.equal(lib.rowIdentity({ state: 'Uttar Pradesh', district: 'Lucknow', business_category: 'dairy' }), 'Uttar Pradesh / Lucknow / unsourced / dairy')
  })

  test('sortRows: state, the state row first, district, prices in emission order, counts alphabetically', () => {
    const rows = [
      r({ district: 'Varanasi', metric: METRIC_COUNT, business_category: 'retail' }),
      r({ metric: METRIC_COUNT, business_category: 'tailoring' }),
      r({ commodity_id: 'potato' }),
      r({ scope: 'state', district: '', commodity_id: 'onion' }),
      r({ commodity_id: 'onion' }),
      r({ state: 'Assam', district: 'Kamrup', commodity_id: 'garlic' }),
      r({ metric: METRIC_COUNT, business_category: 'handicrafts' }),
    ]
    const ids = lib.sortRows(rows).map((x) => `${x.state}/${x.district}/${x.commodity_id ?? x.business_category}`)
    assert.deepEqual(ids, [
      'Assam/Kamrup/garlic',
      'Uttar Pradesh//onion',
      'Uttar Pradesh/Lucknow/potato',
      'Uttar Pradesh/Lucknow/onion',
      'Uttar Pradesh/Lucknow/handicrafts',
      'Uttar Pradesh/Lucknow/tailoring',
      'Uttar Pradesh/Varanasi/retail',
    ])
  })

  test('buildOutput is sorted, two-space JSON with a trailing newline', () => {
    const rows = everyGoodRow()
    const text = lib.buildOutput(rows)
    assert.equal(text, `${JSON.stringify(lib.sortRows(rows), null, 2)}\n`)
    assert.ok(text.startsWith('[\n  {\n    "state": '))
    assert.ok(text.endsWith('}\n]\n'))
    assert.ok(!text.includes('\r'))
    assert.deepEqual(JSON.parse(text).length, rows.length)
    assert.equal(lib.buildOutput([]), '[]\n')
  })

  test('mergeKeepOthers replaces only what the run looked at', () => {
    const P = { provenance: {} }
    const old = [
      r({ ...P, commodity_id: 'onion', tag: 'A' }),
      r({ ...P, metric: METRIC_COUNT, business_category: 'retail', tag: 'B' }),
      r({ ...P, district: 'Varanasi', commodity_id: 'onion', tag: 'C' }),
      r({ ...P, scope: 'state', district: '', commodity_id: 'onion', tag: 'D' }),
      { state: 'Uttar Pradesh', district: 'Lucknow', business_category: 'dairy', tag: 'E' },
      r({ ...P, state: 'Kerala', district: 'Ernakulam', commodity_id: 'onion', tag: 'F' }),
      r({ ...P, scope: 'state', district: '', metric: METRIC_COUNT, business_category: 'retail', tag: 'G' }),
    ]
    const fresh = [r({ ...P, commodity_id: 'potato', tag: 'N' })]
    const out = lib.mergeKeepOthers(old, fresh, { places: ['Uttar Pradesh/Lucknow'], metrics: [METRIC_PRICE] })
    // A: this place and metric. D: the state row pooled Lucknow. E: a legacy row at this place.
    assert.deepEqual(out.map((x) => x.tag), ['B', 'C', 'F', 'G', 'N'])
  })

  test('diffSummary compares figures and ignores provenance', () => {
    const old = [
      r({ commodity_id: 'onion', indicative_price: 17, provenance: { fetched_at: 'one' } }),
      r({ metric: METRIC_COUNT, business_category: 'retail', count: 49 }),
      r({ metric: METRIC_COUNT, business_category: 'tailoring', count: 12 }),
      r({ commodity_id: 'garlic', indicative_price: 90 }),
    ]
    const fresh = [
      r({ commodity_id: 'onion', indicative_price: 17, provenance: { fetched_at: 'two' } }),
      r({ metric: METRIC_COUNT, business_category: 'retail', count: 50 }),
      r({ commodity_id: 'potato', indicative_price: 12 }),
      r({ commodity_id: 'garlic', indicative_price: 90, stale: true }),
    ]
    const d = lib.diffSummary(old, fresh)
    const id = (x) => lib.rowIdentity(r(x))
    assert.deepEqual(d.added, [id({ commodity_id: 'potato' })])
    assert.deepEqual(d.removed, [id({ metric: METRIC_COUNT, business_category: 'tailoring' })])
    // Each list is sorted by identity, so registered_units sorts before wholesale_price_per_kg.
    assert.deepEqual(d.changed, [id({ metric: METRIC_COUNT, business_category: 'retail' }), id({ commodity_id: 'garlic' })])
    assert.equal(d.unchanged, 1)
    assert.equal(d.lines[0], 'diff: 1 added, 1 removed, 2 changed, 1 unchanged')
    assert.ok(d.lines.includes(`  + ${id({ commodity_id: 'potato' })}`))
    assert.ok(d.lines.includes(`  - ${id({ metric: METRIC_COUNT, business_category: 'tailoring' })}`))
    assert.ok(d.lines.includes(`  ~ ${id({ commodity_id: 'garlic' })}`))
  })

  test('vanishCheck refuses to lose more than half the sourced rows', () => {
    const src = (id) => r({ commodity_id: id, provenance: {} })
    const legacy = (c) => ({ state: 'Uttar Pradesh', district: 'Lucknow', business_category: c })
    const old = [src('a'), src('b'), src('c'), src('d'), legacy('dairy'), legacy('retail')]
    assert.deepEqual(lib.vanishCheck(old, [src('a'), src('b')]), { sourced: 4, vanished: 2, fraction: 0.5, refuse: false })
    assert.equal(lib.vanishCheck(old, [src('a')]).refuse, true)
    assert.deepEqual(lib.vanishCheck([legacy('dairy')], []), { sourced: 0, vanished: 0, fraction: 0, refuse: false })
  })
})

// ---------------------------------------------------------------- crosswalk

describe('crosswalk', () => {
  test('normaliseName keeps letters only', () => {
    assert.equal(lib.normaliseName('Lakhimpur Kheri'), 'lakhimpurkheri')
    assert.equal(lib.normaliseName('Dr. B.R. Ambedkar Konaseema'), 'drbrambedkarkonaseema')
    assert.equal(lib.normaliseName(null), '')
  })

  const states = [
    { name: 'Uttar Pradesh', districts: ['Lucknow', 'Kheri', 'Ayodhya', 'Pratapgarh', 'Kanpur Nagar', 'Bahraich', 'Amethi', 'Nowhere'] },
    { name: 'Rajasthan', districts: ['Pratapgarh'] },
    { name: 'Kerala', districts: ['Ernakulam'] },
  ]
  const agg = (state_name, district_name, lg_dt_code, state_id) => ({ state_name, district_name, lg_dt_code, state_id })
  const aggregateRows = [
    agg('UTTAR PRADESH', 'LAKHIMPUR KHERI', '150', '9'),
    agg('UTTAR PRADESH', 'FAIZABAD', '140', '9'),
    agg('UTTAR PRADESH', 'AYODHYA', '140', '9'),
    agg('UTTAR PRADESH', 'PRATAPGARH', '170', '9'),
    agg('RAJASTHAN', 'PRATAPGARH', '120', '8'),
    agg('UTTAR PRADESH', 'KANPUR NAGAR', '164', '9'),
    agg('UTTAR PRADESH', 'KANPUR NAGAR', '999', '9'),
    agg('UTTAR PRADESH', 'BAHRAICH', 'NA', '9'),
    agg('UTTAR PRADESH', 'AMETHI', '180', '9'),
    agg('KERALAM', 'ERNAKULAM', '300', '32'),
  ]
  const todayPairs = [
    { State: 'Uttar Pradesh', District: 'Kheri' },
    { State: 'Uttar Pradesh', District: 'Faizabad' },
    { State: 'Uttar Pradesh', District: 'Faizabad' },
    { State: 'Uttar Pradesh', District: 'Pratapgarh' },
    { State: 'Rajasthan', District: 'Pratapgarh' },
    { State: 'Kerala', District: 'Ernakulam' },
    { State: 'Keralam', District: 'Ernakulam' },
  ]
  const out = lib.proposeCrosswalk({ states, aggregateRows, todayPairs, crosswalk: CROSSWALK })
  const proposal = (state, district) => out.proposals.find((p) => p.state === state && p.district === district)

  test('an alias matches on either side, and a district already in the file is left alone', () => {
    assert.deepEqual(proposal('Uttar Pradesh', 'Kheri'), {
      state: 'Uttar Pradesh',
      district: 'Kheri',
      lgd_state: 9,
      lgd_district: 150,
      udyam_district: 'LAKHIMPUR KHERI',
      agmarknet_state: 'Uttar Pradesh',
      agmarknet_district: ['Kheri'],
      origin: 'auto',
    })
    const ayodhya = proposal('Uttar Pradesh', 'Ayodhya')
    assert.equal(ayodhya.lgd_district, 140, 'two names for one LGD code are one match')
    assert.ok(['FAIZABAD', 'AYODHYA'].includes(ayodhya.udyam_district))
    assert.deepEqual(ayodhya.agmarknet_district, ['Faizabad'])
    const all = [...out.proposals, ...out.ambiguous, ...out.unmatched]
    assert.equal(all.some((x) => x.district === 'Lucknow'), false)
  })

  test('the two Pratapgarhs are matched within their own states', () => {
    assert.equal(proposal('Uttar Pradesh', 'Pratapgarh').lgd_district, 170)
    assert.equal(proposal('Uttar Pradesh', 'Pratapgarh').agmarknet_state, 'Uttar Pradesh')
    assert.equal(proposal('Rajasthan', 'Pratapgarh').lgd_district, 120)
    assert.equal(proposal('Rajasthan', 'Pratapgarh').lgd_state, 8)
    assert.equal(proposal('Rajasthan', 'Pratapgarh').agmarknet_state, 'Rajasthan')
  })

  test('two codes, a non-numeric code and two Agmarknet spellings of a state are ambiguous', () => {
    const amb = Object.fromEntries(out.ambiguous.map((a) => [a.district, a.candidates]))
    assert.deepEqual(Object.keys(amb).sort(), ['Bahraich', 'Ernakulam', 'Kanpur Nagar'])
    assert.deepEqual(amb['Kanpur Nagar'], ['KANPUR NAGAR (164)', 'KANPUR NAGAR (999)'])
    assert.deepEqual(amb.Bahraich, ['BAHRAICH: no numeric LGD code'])
    assert.deepEqual(amb.Ernakulam, ['Agmarknet state "Kerala"', 'Agmarknet state "Keralam"'])
  })

  test('no match is unmatched, and no mandi is still proposed', () => {
    assert.deepEqual(out.unmatched, [{ state: 'Uttar Pradesh', district: 'Nowhere' }])
    assert.deepEqual(out.noMandi, [{ state: 'Uttar Pradesh', district: 'Amethi' }])
    assert.equal(proposal('Uttar Pradesh', 'Amethi').agmarknet_state, 'Uttar Pradesh')
    assert.deepEqual(proposal('Uttar Pradesh', 'Amethi').agmarknet_district, [])
  })

  test('serialiseCrosswalk round-trips the shipped file byte for byte', () => {
    assert.equal(lib.serialiseCrosswalk(CROSSWALK), CROSSWALK_TEXT)
    const grown = { ...CROSSWALK, entries: [...CROSSWALK.entries, proposal('Uttar Pradesh', 'Kheri')] }
    const text = lib.serialiseCrosswalk(grown)
    assert.deepEqual(JSON.parse(text), grown)
    assert.ok(text.startsWith(CROSSWALK_TEXT.slice(0, CROSSWALK_TEXT.lastIndexOf('\n  ] }'))), 'the existing lines must not be reformatted')
  })
})

// ---------------------------------------------------------------- data files

describe('the shipped configuration', () => {
  const names = new Set(STATES.map((s) => s.name))
  const dropdownNames = new Set(STATES.flatMap((s) => s.districts.map(lib.normaliseName)))

  test('every crosswalk entry is a dropdown state and district', () => {
    for (const e of CROSSWALK.entries) {
      assert.ok(names.has(e.state), e.state)
      assert.ok(districtsForState(e.state).includes(e.district), `${e.state}/${e.district}`)
      assert.ok(Number.isInteger(e.lgd_state) && Number.isInteger(e.lgd_district))
    }
  })

  test('every alias key is already normalised, and one side of it is a dropdown name', () => {
    for (const [from, to] of Object.entries(CROSSWALK.aliases.district)) {
      assert.equal(from, lib.normaliseName(from))
      assert.ok(dropdownNames.has(from) || dropdownNames.has(lib.normaliseName(to)), `${from} → ${to}`)
    }
    for (const [from, to] of Object.entries(CROSSWALK.aliases.state)) {
      assert.equal(from, lib.normaliseName(from))
      assert.ok(names.has(to), `${from} → ${to}`)
    }
  })

  test('commodity ids and codes are unique, and every band is low to high', () => {
    assert.equal(new Set(COMMODITIES.map((c) => c.id)).size, COMMODITIES.length)
    assert.equal(new Set(COMMODITIES.map((c) => c.code)).size, COMMODITIES.length)
    for (const c of COMMODITIES) assert.ok(c.kg_band[0] > 0 && c.kg_band[0] < c.kg_band[1], c.id)
  })

  test('the NIC map only names category values the backend keys off', () => {
    for (const name of Object.keys(NIC.categories)) assert.ok(lib.CATEGORIES.includes(name), name)
    assert.equal('agriculture' in NIC.categories, false, 'agriculture gets prices, never a count')
  })
})

// ---------------------------------------------------------------- the translations

// The `en` dict of backendStrings.js, read as text. Every entry there is one
// line, `  'key': 'value',`, with \' for an apostrophe.
function backendEnglish() {
  const text = readText('frontend/src/i18n/backendStrings.js')
  const start = text.search(/^const en = \{$/m)
  assert.ok(start >= 0, 'backendStrings.js has no `const en = {` line')
  const end = text.indexOf('\n}', start)
  const block = text.slice(start, end)
  const en = new Map()
  for (const m of block.matchAll(/^\s*'([\w.]+)':\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) en.set(m[1], m[2].replace(/\\(.)/g, '$1'))
  assert.ok(en.size >= 38, `only ${en.size} en entries parsed; the regex no longer fits the file`)
  return en
}

describe('the English on a row is the translation\'s English', () => {
  const EN = backendEnglish()

  test('every SOURCE_EN value', () => {
    for (const [code, text] of Object.entries(SOURCE_EN)) assert.equal(EN.get(code), text, code)
  })

  test('every NOTE_EN value', () => {
    for (const [code, text] of Object.entries(NOTE_EN)) assert.equal(EN.get(code), text, code)
  })

  test('every commodity name', () => {
    for (const c of COMMODITIES) {
      assert.match(c.cmd, /^cmd\.[A-Za-z]+$/)
      assert.equal(EN.get(c.cmd), c.en, c.cmd)
    }
  })

  test('every code the map, the commodity list and the lib can emit is defined', () => {
    const codes = new Set([
      ...Object.keys(SOURCE_EN),
      ...Object.keys(NOTE_EN),
      ...Object.values(lib.AGGREGATE_KINDS).map((k) => k.note_code),
      ...Object.values(NIC.categories).map((c) => c.note_code).filter(Boolean),
      ...COMMODITIES.map((c) => c.cmd),
      ...[...LIB_TEXT.matchAll(/['"]((?:src|mknote|cmd)\.[A-Za-z]+)['"]/g)].map((m) => m[1]),
    ])
    assert.ok(codes.size >= 16)
    const missing = [...codes].filter((c) => !EN.has(c))
    assert.deepEqual(missing, [])
  })
})

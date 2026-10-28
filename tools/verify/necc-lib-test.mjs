// Unit tests for tools/necc-lib.mjs and the fetch-necc-prices.mjs command line,
// on synthetic pages only.
//
// necc-lib.mjs decides what an egg-price row says: how the NECC page is read,
// which centre belongs to which district, how the printed number becomes rupees
// and when a price counts as stale. This suite is the gate on all of that. No
// network: the pages are built here in the markup NECC serves (the selected
// month and year in two <select>s, one header row of 31 day columns, a section
// row, then one row per centre with " - " on the days nothing was published).
// Run from the repo root:
//
//   node --test tools/verify/necc-lib-test.mjs
//
// Two blocks read other files as TEXT and not as modules: backendStrings.js (the
// English of src.necc must be the English on every row) and the crosswalk (every
// state and district in it must exist in the app's own lists).

import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as lib from '../necc-lib.mjs'
import { STATES, districtsForState } from '../../frontend/src/data/indiaLocations.js'

const ROOT = new URL('../../', import.meta.url)
const readText = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n')
const CROSSWALK_FILE = readText('tools/necc-crosswalk.json')
const REAL_CROSSWALK = JSON.parse(CROSSWALK_FILE)

// ---------------------------------------------------------------- a page like NECC's

const pad = (n) => String(n).padStart(2, '0')
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))

// `selected` null leaves every option unselected, which is how a changed page
// would look to the reader.
function monthSelect(selected) {
  const options = Array.from({ length: 12 }, (_, i) => {
    const v = pad(i + 1)
    return `<option ${v === selected ? 'selected="selected"' : '  '} value="${v}">${v}</option>`
  })
  return `<select name="ddlMonth" id="ddlMonth" style="width:135px;">\n${options.join('\n')}\n</select>`
}

function yearSelect(selected) {
  const options = ['2026', '2025', '2024'].map((v) => `<option ${v === selected ? 'selected="selected"' : '  '} value='${v}'>${v}</option>`)
  return `<select name="ddlYear" id="ddlYear" style="width:135px;">\n${options.join('\n')}\n</select>`
}

const headerRow = (labels) => `<tr align="center">\n<th>Name Of Zone / Day</th>\n${labels.map((l) => `<th>${l}</th>`).join('')} <th>Average</th>\n</tr>`

// NECC's own section rows carry a colspan with a trailing space, "302 ".
const sectionRow = (text) => `<tr>\n<td align="left" colspan="302 " style="font-weight: bold; ">${text}</td>\n</tr>`

// `values` is the run of prices from day 1; every later day is " - ", which is how
// NECC marks "nothing published". `cells` replaces the whole run of 31 day cells.
function centreRow(label, values, { cells, average = '600.00' } = {}) {
  const days = cells ?? Array.from({ length: 31 }, (_, i) => (i < values.length ? String(values[i]) : ' - '))
  return `<tr align="center">\n<td align='left'>${label}</td>${days.map((c) => `<td>${c}</td>`).join('')}<td>${average}</td> </tr>`
}

function page({ month = '10', year = '2026', days = DAYS, body }) {
  return [
    '<html><body>',
    monthSelect(month),
    yearSelect(year),
    '<table border="1px" width="95%" style="font-size: 10pt; font-family: Arial; "><tbody>',
    headerRow(days),
    ...body,
    '</tr>', // the real page closes its last row twice
    '</tbody></table></body></html>',
  ].join('\n')
}

const run = (n, value) => Array(n).fill(value)

const GOOD_BODY = [
  sectionRow('NECC SUGGESTED EGG PRICES'),
  centreRow('Barwala', run(28, 522)),
  centreRow('Delhi (CC)', [...run(27, 630), 640]),
  centreRow('Namakkal', [...run(27, 565), 575]),
  sectionRow('Prevailing Prices'),
  centreRow('Luknow (CC)', [...run(27, 600), 640]),
]
const GOOD_PAGE = page({ body: GOOD_BODY })

// ---------------------------------------------------------------- the run

const CROSSWALK = {
  version: 1,
  entries: [
    { necc: 'Luknow (CC)', state: 'Uttar Pradesh', district: 'Lucknow', centre: 'Lucknow' },
    { necc: 'Delhi (CC)', state: 'Delhi', district: '', centre: 'Delhi' },
    { necc: 'Namakkal', state: 'Tamil Nadu', district: 'Namakkal', centre: 'Namakkal' },
  ],
  skipped: [{ necc: 'Barwala', reason: 'two towns share the name' }],
}
const RUN = { crosswalk: CROSSWALK, today: '2026-10-28', fetchedAt: '2026-10-28T18:30:00+05:30', scriptSha: 'a'.repeat(64) }
const build = (html = GOOD_PAGE, over = {}) => lib.buildRows(lib.parseEggSheet(html), { ...RUN, ...over })
const byDistrict = (rows, district) => rows.find((r) => r.district === district)

// ---------------------------------------------------------------- parseEggSheet

describe('parseEggSheet', () => {
  test('reads the month from the two selected options', () => {
    assert.equal(lib.parseEggSheet(GOOD_PAGE).month, '2026-10')
    assert.equal(lib.parseEggSheet(page({ month: '03', year: '2025', body: GOOD_BODY })).month, '2025-03')
  })

  test('reads each centre with its section, its label as printed and 31 day cells', () => {
    const { rows } = lib.parseEggSheet(GOOD_PAGE)
    assert.deepEqual(
      rows.map((r) => [r.section, r.label]),
      [
        ['suggested', 'Barwala'],
        ['suggested', 'Delhi (CC)'],
        ['suggested', 'Namakkal'],
        ['prevailing', 'Luknow (CC)'],
      ],
    )
    const delhi = rows[1]
    assert.equal(delhi.days.length, 31)
    assert.equal(delhi.days[0], 630)
    assert.equal(delhi.days[27], 640)
  })

  test('a dash is no price at all, never a zero', () => {
    const delhi = lib.parseEggSheet(GOOD_PAGE).rows[1]
    assert.deepEqual(delhi.days.slice(28), [null, null, null])
  })

  test('a centre with no price on any day is read, with all-null days', () => {
    const html = page({ body: [sectionRow('Prevailing Prices'), centreRow('Pune', []), centreRow('Nagpur', [610])] })
    const { rows } = lib.parseEggSheet(html)
    assert.deepEqual(rows[0].days, Array(31).fill(null))
    assert.equal(rows[1].days[0], 610)
  })

  const refuses = [
    ['no selected month', page({ month: null, body: GOOD_BODY }), /month/i],
    ['no selected year', page({ year: null, body: GOOD_BODY }), /year/i],
    ['a header of 30 days', page({ days: DAYS.slice(0, 30), body: GOOD_BODY }), /31 day/i],
    ['an unknown section', page({ body: [sectionRow('Something New'), centreRow('Pune', run(5, 600))] }), /section/i],
    ['a centre before any section', page({ body: [centreRow('Pune', run(5, 600))] }), /before/i],
    [
      'a centre with a day cell missing',
      page({ body: [sectionRow('Prevailing Prices'), centreRow('Pune', [], { cells: run(30, '600') })] }),
      /33 cells/i,
    ],
    [
      'text where a price should be',
      page({ body: [sectionRow('Prevailing Prices'), centreRow('Pune', [], { cells: ['abc', ...run(30, '600')] })] }),
      /abc/,
    ],
    [
      'a price with decimals',
      page({ body: [sectionRow('Prevailing Prices'), centreRow('Pune', [], { cells: ['580.5', ...run(30, '600')] })] }),
      /580\.5/,
    ],
    [
      'the same centre twice in one section',
      page({ body: [sectionRow('Prevailing Prices'), centreRow('Pune', run(5, 600)), centreRow('Pune', run(5, 601))] }),
      /twice/i,
    ],
    ['no centres at all', page({ body: [sectionRow('Prevailing Prices')] }), /no centres/i],
    ['a page that is not the sheet', '<html><body>Service Unavailable</body></html>', /month/i],
    ['an empty reply', '', /month/i],
  ]
  for (const [name, html, expected] of refuses) {
    test(`refuses ${name}`, () => {
      assert.throws(() => lib.parseEggSheet(html), expected)
    })
  }
})

// ---------------------------------------------------------------- lastPrice

describe('lastPrice', () => {
  test('is the last number printed, with its day of the month', () => {
    assert.deepEqual(lib.lastPrice([600, 610, null, null]), { day: 2, value: 610 })
    assert.deepEqual(lib.lastPrice([600, null, 620, null]), { day: 3, value: 620 })
    assert.deepEqual(lib.lastPrice([...Array(30).fill(null), 640]), { day: 31, value: 640 })
  })

  test('is null when nothing was printed', () => {
    assert.equal(lib.lastPrice([null, null, null]), null)
    assert.equal(lib.lastPrice([]), null)
  })
})

// ---------------------------------------------------------------- buildRows

describe('buildRows', () => {
  test('builds the Lucknow row from the "Luknow (CC)" line, field for field', () => {
    const { rows } = build()
    assert.deepEqual(byDistrict(rows, 'Lucknow'), {
      state: 'Uttar Pradesh',
      district: 'Lucknow',
      business_category: 'poultry',
      scope: 'district',
      metric: 'egg_price',
      price_kind: 'prevailing',
      centre: 'Lucknow',
      unit: 'egg',
      indicative_price: 6.4,
      last_reported: '2026-10-28',
      stale: false,
      source: lib.SOURCE_EN,
      source_code: 'src.necc',
      last_verified: '2026-10-28',
      provenance: {
        publisher: 'National Egg Co-ordination Committee (NECC)',
        page_url: 'https://www.e2necc.com/home/eggprice',
        sheet: 'Daily Rate Sheet',
        month: '2026-10',
        centre_label: 'Luknow (CC)',
        published_value: 640,
        unit_reading: lib.UNIT_READING,
        permission: lib.PERMISSION,
        fetched_at: '2026-10-28T18:30:00+05:30',
        method: lib.METHOD,
        crosswalk_version: 1,
        script_sha256: 'a'.repeat(64),
        clarification: lib.CLARIFICATION,
        attribution:
          'National Egg Co-ordination Committee (NECC), Daily Rate Sheet for 2026-10, ' +
          'https://www.e2necc.com/home/eggprice, read on 28/10/2026.',
      },
    })
  })

  test('the keys of a row and of its provenance come in the declared order', () => {
    const [row] = build().rows
    assert.deepEqual(Object.keys(row), lib.ROW_KEYS)
    assert.deepEqual(Object.keys(row.provenance), lib.PROVENANCE_KEYS)
  })

  test('a suggested centre is a suggested row, whatever its name', () => {
    const { rows } = build()
    assert.equal(byDistrict(rows, 'Namakkal').price_kind, 'suggested')
    assert.equal(byDistrict(rows, 'Lucknow').price_kind, 'prevailing')
  })

  test('the printed number is paise per egg: 575 is 5.75 rupees, 640 is 6.4', () => {
    const { rows } = build()
    assert.equal(byDistrict(rows, 'Namakkal').indicative_price, 5.75)
    assert.equal(byDistrict(rows, 'Namakkal').provenance.published_value, 575)
    assert.equal(byDistrict(rows, 'Lucknow').indicative_price, 6.4)
  })

  test('Delhi, a union territory read as one centre, is a state row with no district', () => {
    const delhi = build().rows.find((r) => r.state === 'Delhi')
    assert.equal(delhi.scope, 'state')
    assert.equal(delhi.district, '')
    assert.equal(delhi.centre, 'Delhi')
  })

  test('the date of a price is the day of the month it was printed under', () => {
    const html = page({ body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(17, 600))] })
    assert.equal(byDistrict(build(html).rows, 'Lucknow').last_reported, '2026-10-17')
  })

  test('a price printed 7 days ago is current and 8 days ago is stale', () => {
    const at = (days) => build(page({ body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(days, 600))] }))
    assert.equal(byDistrict(at(21).rows, 'Lucknow').stale, false) // day 21, today 28
    assert.equal(byDistrict(at(20).rows, 'Lucknow').stale, true) // day 20, today 28
  })

  test('a price more than 30 days old is not shown, and is reported', () => {
    const old = page({ month: '09', body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(20, 600))] })
    const out = build(old)
    assert.equal(out.rows.length, 0)
    assert.deepEqual(out.tooOld.map((x) => x.necc), ['Luknow (CC)'])
  })

  test('a centre with no price this month is left out and reported as unpriced', () => {
    const html = page({ body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', [])] })
    const out = build(html)
    assert.equal(out.rows.length, 0)
    assert.deepEqual(out.unpriced, ['Luknow (CC)'])
  })

  test('a mapped centre that is not on the page is reported as missing', () => {
    const html = page({ body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(28, 600))] })
    assert.deepEqual(build(html).missing.sort(), ['Delhi (CC)', 'Namakkal'])
  })

  test('a centre in no list is unmapped, and one skipped on purpose is only skipped', () => {
    const out = build(page({ body: [sectionRow('Prevailing Prices'), centreRow('Barwala', run(5, 500)), centreRow('Brand New', run(5, 500))] }))
    assert.deepEqual(out.skipped, ['Barwala'])
    assert.deepEqual(out.unmapped, ['Brand New'])
  })

  test('a price outside 1 to 20 rupees an egg is refused, not clamped', () => {
    for (const bad of [6, 99, 2001, 640000]) {
      const html = page({ body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(5, bad))] })
      const out = build(html)
      assert.equal(out.rows.length, 0, String(bad))
      assert.equal(out.bad.length, 1, String(bad))
      assert.match(out.bad[0].reason, /outside/i)
    }
  })

  test('a price dated after the day of the run is refused', () => {
    const out = build(GOOD_PAGE, { today: '2026-10-20' })
    assert.equal(out.rows.length, 0)
    assert.ok(out.bad.length >= 1)
    assert.match(out.bad[0].reason, /after/i)
  })

  test('the 31st of a 30-day month is not a date', () => {
    const html = page({ month: '09', body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(31, 600))] })
    assert.throws(() => build(html, { today: '2026-10-02' }), /date/i)
  })
})

// ---------------------------------------------------------------- validateRow, checkRows

describe('validateRow and checkRows', () => {
  // A district row. rows[0] is Delhi's, which is a state row, so the two district
  // checks below would have nothing to break.
  const GOOD = byDistrict(build().rows, 'Lucknow')
  const mutate = (fn) => {
    const row = structuredClone(GOOD)
    fn(row)
    return row
  }

  test('a built row has no problem', () => {
    for (const row of build().rows) assert.deepEqual(lib.validateRow(row), [])
  })

  const BROKEN = [
    ['an extra key', (r) => { r.extra = 1 }, /keys/],
    ['a missing key', (r) => { delete r.centre }, /keys/],
    ['the wrong category', (r) => { r.business_category = 'dairy' }, /business_category/],
    ['the wrong metric', (r) => { r.metric = 'wholesale_price_per_kg' }, /metric/],
    ['a district row with no district', (r) => { r.district = '' }, /district/],
    ['a state row that names a district', (r) => { r.scope = 'state' }, /district/],
    ['an unknown price kind', (r) => { r.price_kind = 'wholesale' }, /price_kind/],
    ['a price of zero', (r) => { r.indicative_price = 0 }, /indicative_price/],
    ['a price of 640 rupees', (r) => { r.indicative_price = 640 }, /indicative_price/],
    ['a price with three decimals', (r) => { r.indicative_price = 6.405 }, /indicative_price/],
    ['a price that is not the published number over 100', (r) => { r.indicative_price = 6.5 }, /published_value/],
    ['a date that is not a date', (r) => { r.last_reported = '2026-13-01' }, /last_reported/],
    ['a stale flag the dates do not support', (r) => { r.stale = true }, /stale/],
    ['a changed clarification', (r) => { r.provenance.clarification = r.provenance.clarification.replace('merely', 'not') }, /clarification/],
    ['a changed unit reading', (r) => { r.provenance.unit_reading = 'rupees' }, /unit_reading/],
    ['a changed source line', (r) => { r.source = 'NECC' }, /source/],
    ['a provenance key added', (r) => { r.provenance.note = 'x' }, /provenance keys/],
    ['an e-mail address anywhere', (r) => { r.provenance.permission += ' write to someone@example.in' }, /contact/],
    ['a phone number anywhere', (r) => { r.provenance.attribution += ' 9876543210' }, /contact/],
  ]
  for (const [name, fn, expected] of BROKEN) {
    test(`reports ${name}`, () => {
      const problems = lib.validateRow(mutate(fn))
      assert.ok(problems.some((p) => expected.test(p)), `${expected} not in: ${problems.join(' | ')}`)
    })
  }

  test('two rows for one place are refused, whatever their kind', () => {
    for (const other of [structuredClone(GOOD), mutate((r) => { r.price_kind = 'suggested' })]) {
      const problems = lib.checkRows([GOOD, other])
      assert.ok(problems.some((p) => /twice/i.test(p)), problems.join(' | '))
    }
  })

  test('rows for different places are fine', () => {
    assert.deepEqual(lib.checkRows(build().rows), [])
  })

  test('an empty list is a problem, not a pass', () => {
    assert.ok(lib.checkRows([]).length >= 1)
  })
})

// ---------------------------------------------------------------- serialise

describe('serialise', () => {
  test('sorts by state and district, and ends with one newline', () => {
    const { rows } = build()
    const text = lib.serialise([...rows].reverse())
    assert.ok(text.endsWith('}\n]\n'))
    const back = JSON.parse(text)
    assert.deepEqual(back.map((r) => [r.state, r.district]), [['Delhi', ''], ['Tamil Nadu', 'Namakkal'], ['Uttar Pradesh', 'Lucknow']])
    assert.deepEqual(back, JSON.parse(lib.serialise(rows)))
  })

  test('writes two-space JSON, the way market_data.json is written', () => {
    assert.match(lib.serialise(build().rows), /^\[\n {2}\{\n {4}"state": /)
  })
})

// ---------------------------------------------------------------- what is reproduced from NECC

describe('what is reproduced from NECC', () => {
  test('the clarification is the first three sentences of its page, word for word', () => {
    assert.equal(
      lib.CLARIFICATION,
      'The daily egg prices suggested by NECC, on its official website or through any other medium ' +
        '(including verbal, print and digital media) are merely suggestive and not mandatory. ' +
        'The suggested prices are published solely for the reference and information of the trade and industry. ' +
        'NECC does not by itself or through any person enforce compliance or adherence with such suggested egg prices ' +
        'in any manner whatsoever.',
    )
  })

  test('the unit reading says NECC prints no unit and that the number is read as paise per egg', () => {
    assert.match(lib.UNIT_READING, /no unit/)
    assert.match(lib.UNIT_READING, /paise per egg/)
    assert.match(lib.UNIT_READING, /6\.40/)
  })

  test('the English on a row is the English of src.necc in backendStrings.js', () => {
    const text = readText('frontend/src/i18n/backendStrings.js')
    const en = text.split('const en = {')[1].split('\n}')[0]
    const found = /'src\.necc': '((?:[^'\\]|\\.)*)'/.exec(en)
    assert.ok(found, "backendStrings.js has no 'src.necc' in its English block")
    assert.equal(found[1].replace(/\\(.)/g, '$1'), lib.SOURCE_EN)
  })

  test('nothing here names the owner: no e-mail address and no phone number in the lib', () => {
    const source = readText('tools/necc-lib.mjs')
    assert.doesNotMatch(source, /[\w.+-]+@[\w-]+\.[\w.]+/)
    assert.doesNotMatch(source, /\b\d{10}\b/)
  })
})

// ---------------------------------------------------------------- the crosswalk

describe('the crosswalk', () => {
  const { entries, skipped } = REAL_CROSSWALK
  const stateNames = new Set(STATES.map((s) => s.name))

  test('has a version, and the entries and the skipped list are not empty', () => {
    assert.ok(Number.isInteger(REAL_CROSSWALK.version) && REAL_CROSSWALK.version >= 1)
    assert.ok(entries.length >= 25, `only ${entries.length} entries`)
    assert.ok(skipped.length >= 1)
  })

  test('every entry names a state and a district that exist in the app, or a state alone', () => {
    for (const e of entries) {
      assert.ok(stateNames.has(e.state), `${e.necc}: no state "${e.state}"`)
      if (e.district !== '') assert.ok(districtsForState(e.state).includes(e.district), `${e.necc}: no district "${e.district}" in ${e.state}`)
      assert.ok(e.centre && e.centre.trim() === e.centre, `${e.necc}: centre`)
    }
  })

  test('a NECC name appears once, and a place appears once per kind of its own', () => {
    const names = entries.map((e) => e.necc)
    assert.equal(new Set(names).size, names.length)
    const places = entries.map((e) => `${e.state}/${e.district}`)
    assert.equal(new Set(places).size, places.length, 'two NECC lines point at one place')
  })

  test('every skipped centre has a reason, and none is also mapped', () => {
    const names = new Set(entries.map((e) => e.necc))
    for (const s of skipped) {
      assert.ok(typeof s.reason === 'string' && s.reason.length >= 10, `${s.necc}: reason`)
      assert.ok(!names.has(s.necc), `${s.necc} is mapped and skipped`)
    }
  })

  test('only a union territory with one centre is a state row, and that is Delhi', () => {
    const stateRows = entries.filter((e) => e.district === '')
    assert.deepEqual(stateRows.map((e) => e.state), ['Delhi'])
  })

  test('every entry says why its centre belongs to its place, and "whole state" is exactly the Delhi row', () => {
    const BASES = ['name', 'in district', 'renamed', 'whole state']
    for (const e of entries) {
      assert.ok(BASES.includes(e.basis), `${e.necc}: basis "${e.basis}"`)
      assert.equal(e.basis === 'whole state', e.district === '', `${e.necc}: basis against district`)
    }
  })

  test('the file is plain JSON with no contact details in it', () => {
    assert.doesNotMatch(CROSSWALK_FILE, /[\w.+-]+@[\w-]+\.[\w.]+/)
    assert.doesNotMatch(CROSSWALK_FILE, /\b\d{10}\b/)
  })
})

// ---------------------------------------------------------------- the command line

describe('fetch-necc-prices.mjs', () => {
  const script = fileURLToPath(new URL('../fetch-necc-prices.mjs', import.meta.url))
  const dataFile = fileURLToPath(new URL('backend/app/data/necc_egg_prices.json', ROOT))
  const dir = mkdtempSync(join(tmpdir(), 'necc-test-'))
  after(() => rmSync(dir, { recursive: true, force: true }))

  // Every centre in the real crosswalk, and every one skipped on purpose, on one page.
  function fullPage(priceFor = () => 600) {
    const mapped = REAL_CROSSWALK.entries.map((e) => e.necc)
    const names = [...mapped, ...REAL_CROSSWALK.skipped.map((s) => s.necc)]
    const half = Math.ceil(names.length / 2)
    const rows = (list) => list.map((n) => centreRow(n, run(28, priceFor(n))))
    return page({ body: [sectionRow('NECC SUGGESTED EGG PRICES'), ...rows(names.slice(0, half)), sectionRow('Prevailing Prices'), ...rows(names.slice(half))] })
  }

  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  const before = () => (existsSync(dataFile) ? readFileSync(dataFile) : null)

  test('a dry run on a saved page reports the rows and writes nothing', () => {
    const file = join(dir, 'full.html')
    writeFileSync(file, fullPage())
    const was = before()
    const out = cli('--from', file, '--today', '2026-10-28')
    assert.equal(out.status, 0, out.stdout + out.stderr)
    assert.match(out.stdout, new RegExp(`${REAL_CROSSWALK.entries.length} row`))
    assert.match(out.stdout, /Dry run/)
    assert.deepEqual(before(), was)
  })

  test('refuses --write with --from: a saved page is never the source of the shipped file', () => {
    const file = join(dir, 'full2.html')
    writeFileSync(file, fullPage())
    const was = before()
    const out = cli('--from', file, '--today', '2026-10-28', '--write')
    assert.equal(out.status, 1)
    assert.match(out.stdout + out.stderr, /--from/)
    assert.deepEqual(before(), was)
  })

  test('exits 1 when a mapped centre is missing from the page', () => {
    const file = join(dir, 'short.html')
    writeFileSync(file, page({ body: [sectionRow('Prevailing Prices'), centreRow('Luknow (CC)', run(28, 600))] }))
    const out = cli('--from', file, '--today', '2026-10-28')
    assert.equal(out.status, 1)
    assert.match(out.stdout, /missing/i)
  })

  test('exits 1 when a price is outside 1 to 20 rupees an egg', () => {
    const file = join(dir, 'unit.html')
    writeFileSync(file, fullPage((n) => (n === 'Namakkal' ? 6 : 600)))
    const out = cli('--from', file, '--today', '2026-10-28')
    assert.equal(out.status, 1)
    assert.match(out.stdout, /outside/i)
  })

  test('exits 2 on a file that cannot be read: an instrument fault, not a finding', () => {
    const out = cli('--from', join(dir, 'no-such-file.html'), '--today', '2026-10-28')
    assert.equal(out.status, 2)
  })

  test('--today without --from is refused', () => {
    const out = cli('--today', '2026-10-28')
    assert.equal(out.status, 1)
  })
})

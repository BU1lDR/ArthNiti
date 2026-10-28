// Which market rows /analysis and /report may draw, and what the sources block under them
// is built from. Both pages read this file, so the two cannot disagree about a row.

export const isEggRow = (row) => row?.metric === 'egg_price'

const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null)

const unique = (values) => [...new Set(values)]

// NECC lets its prices be passed on only with its own clarification beside them, and an
// egg price is the price of one egg. A row that arrives without the clarification, or in
// any other unit, is dropped here rather than drawn: shown, it would pass the price on
// against NECC's condition, or read a price for one egg as one for a kilo.
export function drawableMarketRows(rows) {
  return rows.filter((row) => !isEggRow(row) || (row.unit === 'egg' && text(row.provenance?.clarification) !== null))
}

// The sentence that says whose price an egg price is. Null for a kind it does not know,
// so a price is never given a sentence that says the wrong thing.
export function eggKindKey(row) {
  if (row.price_kind === 'suggested') return 'mk.eggSuggested'
  if (row.price_kind === 'prevailing') return 'mk.eggPrevailing'
  return null
}

// What the sources block prints, from the rows that are drawn. The government-data
// warranty belongs to the rows that come from government data (hasOther) and the egg
// sentences to the egg rows (hasEgg), so a page prints only the ones it needs.
export function marketSourceFacts(rows) {
  const eggs = rows.filter(isEggRow)
  return {
    attributions: unique(rows.map((row) => text(row.provenance?.attribution)).filter(Boolean)),
    clarifications: unique(eggs.map((row) => text(row.provenance?.clarification)).filter(Boolean)),
    hasEgg: eggs.length > 0,
    hasOther: eggs.length < rows.length,
  }
}

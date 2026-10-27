// The shape of the plan the plan route returns: a summary, some steps and some cautions,
// each one a line of segments. A segment is either words the model wrote ("text") or a
// figure the rules put in ("fill"). Checked where a plan comes in, off the wire and out
// of sessionStorage, so that the page never renders a shape it was not written for.

const isSegment = (part) =>
  part !== null && typeof part === 'object' && (part.t === 'text' || part.t === 'fill') && typeof part.v === 'string'

const isLine = (line) => Array.isArray(line) && line.length > 0 && line.every(isSegment)

const areLines = (lines) => Array.isArray(lines) && lines.every(isLine)

export function isPlan(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.language === 'string' &&
    isLine(value.summary) &&
    areLines(value.steps) &&
    value.steps.length > 0 &&
    areLines(value.cautions)
  )
}

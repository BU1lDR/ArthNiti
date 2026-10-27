// A money or percent figure that must stay on one line: it shrinks to fit its
// box instead of breaking mid-number (see .ui-figure in index.css). The box is
// the nearest size container, so the element around this one has to be one;
// without it the figure sizes itself against the whole screen. Only for text a
// formatter made from a number: a label, or the text for a missing figure, has
// to wrap like any other words.
export default function Figure({ text }) {
  return <span className="ui-figure" style={{ '--figure-chars': String(text).length }}>{text}</span>
}

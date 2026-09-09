import { Link } from 'react-router-dom'

// Colours go through the theme tokens so the button follows the dark theme.
// Call sites pick a variant instead of passing their own bg-*/text-* classes:
// two competing utilities land in the same cascade layer, where the generated
// stylesheet order decides the winner, not the order of the class attribute.
// --color-btn is the fill and --color-on-btn the text on it. They are separate
// from --color-primary-strong, which is a text colour and so has to contrast
// with the page instead — one token cannot satisfy both in dark mode.
const variants = {
  primary: 'bg-[var(--color-btn)] text-[var(--color-on-btn)] hover:opacity-90',
  secondary:
    'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]',
}

// Size is a prop for exactly the reason colour is. Padding used to live in the
// base string and nearly every call site then passed its own `px-*`/`py-*` on
// top — two utilities for one property in the same layer, resolved by generated
// stylesheet order rather than by anything visible in the JSX. It happened to
// land right; it was never guaranteed to. Width, and anything responsive, is
// still a call-site concern: `w-full sm:w-auto` does not fight the base.
//
// Both sizes clear the 44px minimum touch target. This audience is largely on a
// shared phone, and a control they cannot reliably hit is a control they cannot
// use, so no size smaller than `md` is offered.
const sizes = {
  md: 'min-h-11 px-6 py-3',
  lg: 'min-h-12 px-7 py-4 text-base',
}

// `transition` is the bare utility on purpose rather than an arbitrary variant
// naming its own property list: the bare one is already in the generated
// stylesheet, so it costs nothing, while a narrowed one would emit a new class
// for no behavioural gain. It covers opacity, background-color, scale and
// transform, which is every property the variants and the press below animate.
//
// Naming that narrowed utility in prose here is what NOT to do, and it cost a
// build to find out. Tailwind extracts class candidates from prose, not just
// from markup, so the first version of this comment spelled the arbitrary
// variant out and Tailwind generated it as a real rule in the stylesheet — a
// utility for an element that does not exist. index.css already carries
// `source(none)` plus explicit @source rules, which is what stops eslint.config
// and vite.config being scanned, but src/**/*.jsx is scanned on purpose and this
// file's comments are inside it. Do not write a class-shaped literal in a
// comment in src/; describe it instead.
//
// `active:scale-[0.98]` is the press, and it is here for TOUCH rather than for
// looks. Both variants already ease their hover, but a phone has no hover at
// all — :active is the only feedback a thumb ever gets, and a primary CTA that
// looks identical the instant it is tapped reads as not having registered, which
// on this journey means the reader taps it again. 0.98 is deliberately small
// enough not to look like the button moved.
//
// Safe against the verifiers because :active only holds while the pointer is
// down and none of the 15 CDP scripts press anything. Worth knowing that it
// WOULD be visible to a script that did: getBoundingClientRect returns the
// transformed box, so a pressed button momentarily measures under mobile-audit's
// 44px TAP floor. The target is already acquired by then, but do not add a
// transform to a resting state for that reason.
const base =
  'inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.98]'

// Pass `to` for navigation and the same skin renders on the router's <Link>.
// Most call sites used to write <Link to="…"><Button/></Link>, which puts a
// <button> inside an <a>: invalid HTML, and assistive technologies disagree over
// which of the two nested controls to announce and activate. One element with
// the right role instead — a thing that goes somewhere is a link, a thing that
// does something is a button.
//
// A disabled `to` falls back to <button disabled>, because there is no
// accessible way to disable an anchor: `aria-disabled` still leaves it in the
// tab order and still follows the href on Enter.
function Button({
  children,
  type = 'button',
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
  className = '',
  to,
}) {
  const skin = `${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`

  if (to && !disabled) {
    return (
      <Link to={to} onClick={onClick} className={skin}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`disabled:cursor-not-allowed disabled:opacity-60 ${skin}`}
    >
      {children}
    </button>
  )
}

export default Button

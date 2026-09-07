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

const base = 'inline-flex items-center justify-center rounded-xl font-semibold transition'

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

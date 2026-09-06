// Colours go through the theme tokens so the button follows the dark theme.
// Call sites pick a variant instead of passing their own bg-*/text-* classes:
// two competing utilities land in the same cascade layer, where the generated
// stylesheet order decides the winner, not the order of the class attribute.
const variants = {
  primary: 'bg-[var(--color-primary-strong)] text-white hover:opacity-90',
  secondary:
    'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-soft)]',
}

function Button({
  children,
  type = 'button',
  onClick,
  disabled = false,
  variant = 'primary',
  className = '',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-6 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant] || variants.primary} ${className}`}
    >
      {children}
    </button>
  )
}

export default Button

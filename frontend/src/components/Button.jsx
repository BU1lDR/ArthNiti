function Button({ children, type = 'button', onClick, className = '' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={`rounded-xl bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-700 ${className}`}
    >
      {children}
    </button>
  )
}

export default Button
export default function PhoneInput({ value, onChange, id, required = false }) {
  function handleInput(e) {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0/, '').slice(0, 10)
    onChange(digits)
  }
  return (
    <div className="phone-wrap">
      <span className="phone-prefix">+44</span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        value={value}
        onChange={handleInput}
        placeholder="7700 000000"
        maxLength={10}
        required={required}
      />
    </div>
  )
}

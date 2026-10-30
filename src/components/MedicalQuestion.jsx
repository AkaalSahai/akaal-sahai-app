// Required Yes/No question; the details box only appears on Yes.
// value: { has_medical_condition: true|false|null, medical_notes: string }
export default function MedicalQuestion({ value, onChange, error, required = true }) {
  const has = value.has_medical_condition
  const pick = v => onChange({ ...value, has_medical_condition: v })
  const option = (v, label) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, cursor: 'pointer', marginBottom: 0 }}>
      <input type="radio" checked={has === v} onChange={() => pick(v)} style={{ width: 'auto' }} />
      {label}
    </label>
  )
  return (
    <div className="form-group">
      <label>Does the child have any medical conditions or allergies?{required ? ' *' : ''}</label>
      <div style={{ display: 'flex', gap: 22, margin: '4px 0 8px' }}>
        {option(false, 'No')}
        {option(true, 'Yes')}
      </div>
      {has === true && (
        <textarea value={value.medical_notes} rows={3}
          onChange={e => onChange({ ...value, medical_notes: e.target.value })}
          placeholder="Please give details, e.g. asthma – uses an inhaler; nut allergy" />
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  )
}

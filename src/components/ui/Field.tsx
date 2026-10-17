interface FieldProps {
  label: string;
  token: string;
  hint: string;
  hintId?: string;
  /** id of the label text, so an input can name itself without reading the whole box */
  labelId?: string;
  /** the value area: an <input> for an editable field, or a read-only value */
  children: React.ReactNode;
  /** a <label> associates its input; a read-only field is a plain group */
  htmlFor?: string;
}

/** A swap amount field: mono label, a 30px value, a token chip and a hint. */
export function Field({ label, token, hint, hintId, labelId, children, htmlFor }: FieldProps) {
  const body = (
    <>
      <span className="fl" id={labelId}>
        {label}
      </span>
      <span className="fr">
        {children}
        <span className="tok">{token}</span>
      </span>
      <small id={hintId}>{hint}</small>
    </>
  );
  return htmlFor ? (
    <label className="fld" htmlFor={htmlFor}>
      {body}
    </label>
  ) : (
    <div className="fld">{body}</div>
  );
}

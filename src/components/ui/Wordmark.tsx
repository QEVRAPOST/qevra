/** The QEVRA glyph: a dashed amber ellipse above two silver ellipses and a beam-coloured line. */
export function WordmarkMark() {
  return (
    <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <ellipse cx="13" cy="6.5" rx="8" ry="3.2" strokeDasharray="2.2 1.6" style={{ color: "var(--exp)" }} />
      <ellipse cx="13" cy="12" rx="9" ry="3.6" />
      <ellipse cx="13" cy="17" rx="10" ry="4" />
      <path d="M13 12.3v9.4" stroke="var(--focus)" />
    </svg>
  );
}

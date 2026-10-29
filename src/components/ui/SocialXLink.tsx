/** A compact external link to VEYRA's public X account. */
export function SocialXLink({ onClick }: { onClick?: () => void } = {}) {
  return (
    <a
      className="social-x-link"
      href="https://x.com/veyraappp"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Follow VEYRA on X"
      title="Follow VEYRA on X"
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.83L0 1.153h7.594l5.243 6.932zm-1.292 19.62h2.039L6.482 3.087H4.294z" />
      </svg>
    </a>
  );
}

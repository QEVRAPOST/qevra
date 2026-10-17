interface PanelProps {
  title?: string;
  /** chip or status shown at the right of the heading */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Raised surface with a Display M heading row. Panels are container-query containers. */
export function Panel({ title, aside, className, children }: PanelProps) {
  return (
    <div className={className ? `panel ${className}` : "panel"}>
      {title ? (
        <div className="ph">
          <h2>{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </div>
  );
}

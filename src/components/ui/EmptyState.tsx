/** A dashed box that says what the emptiness does not mean. */
export function EmptyState({ title, children, as: Tag = "div" }: { title: string; children: React.ReactNode; as?: "div" | "li" }) {
  return (
    <Tag className="empty">
      <b>{title}</b>
      <p>{children}</p>
    </Tag>
  );
}

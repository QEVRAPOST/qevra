"use client";

/**
 * The head of every /app route: what kind of page it is, its name and one plain sentence. Whether the data is simulated or live
 * is said once, in the header indicator, not on every page.
 */
export function PageHead({ id, kicker, title, lede, extra }: { id: string; kicker: string; title: string; lede: React.ReactNode; extra?: React.ReactNode }) {
  const words = title.split(" ");
  return (
    <header className="rhead pghead">
      <p className="pg-kick">{kicker}</p>
      <h1 id={id}>
        {words.length > 1 ? (
          <>
            {words.slice(0, -1).join(" ")} <em>{words[words.length - 1]}</em>
          </>
        ) : (
          title
        )}
      </h1>
      <p className="pg-lede">{lede}</p>
      {extra}
    </header>
  );
}

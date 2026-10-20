/**
 * A small identity for an address: concentric rings whose dashes, turns and markers are drawn from the address itself, so the same
 * address always looks the same and two addresses rarely look alike. It is a picture, not a check: it proves nothing about the address.
 */
function seedOf(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function AddressGlyph({ address, size = 200, live = true }: { address?: string; size?: number; live?: boolean }) {
  const rnd = seedOf((address ?? "none").toLowerCase());
  const rings = [0, 1, 2, 3, 4].map((i) => {
    const r = 22 + i * 14.5;
    const circ = 2 * Math.PI * r;
    const dashes = 3 + Math.floor(rnd() * 9);
    const fill = 0.35 + rnd() * 0.5;
    const seg = circ / dashes;
    return { r, dash: `${(seg * fill).toFixed(1)} ${(seg * (1 - fill)).toFixed(1)}`, turn: Math.floor(rnd() * 360), w: i === 2 ? 2.2 : 1.2, dur: 24 + Math.floor(rnd() * 30), dir: rnd() > 0.5 ? 1 : -1 };
  });
  const marks = [0, 1, 2].map(() => ({ ring: Math.floor(rnd() * 5), a: rnd() * Math.PI * 2 }));
  return (
    <svg className={`ag${live ? " on" : ""}`} width={size} height={size} viewBox="-100 -100 200 200" role="img" aria-label={address ? "A ring pattern drawn from this address" : "No address yet"}>
      {rings.map((g, i) => (
        <g key={i} style={{ ["--t" as string]: `${g.dir * g.dur}s`, transform: `rotate(${g.turn}deg)` }}>
          <circle className="ag-r" r={g.r} strokeDasharray={address ? g.dash : "1 6"} strokeWidth={g.w} style={{ animationDuration: `${g.dur}s`, animationDirection: g.dir > 0 ? "normal" : "reverse" }} />
        </g>
      ))}
      {address
        ? marks.map((m, i) => (
            <circle key={i} className="ag-m" cx={Math.cos(m.a) * (22 + m.ring * 14.5)} cy={Math.sin(m.a) * (22 + m.ring * 14.5)} r="3.2" />
          ))
        : null}
      <circle className="ag-c" r="7" />
    </svg>
  );
}

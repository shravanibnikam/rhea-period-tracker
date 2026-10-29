/** Five segments, `level` of them filled in `color` (a phase mark). Decorative: put the level in words beside it. */
export function EnergyBar({ level, color }: { level: number; color: string }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-2 flex-1 rounded-full bg-muted"
          style={i <= level ? { backgroundColor: color } : undefined}
        />
      ))}
    </div>
  );
}

export function EnergyBar({ level, color }: { level: number; color: string }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-2 flex-1 rounded-full transition-all"
          style={{ backgroundColor: i <= level ? color : "#E5DDD8" }}
        />
      ))}
    </div>
  );
}

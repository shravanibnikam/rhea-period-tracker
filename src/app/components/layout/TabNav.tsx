export type TabName = "overview" | "calendar" | "history" | "predictions";

interface TabNavProps {
  tab: TabName;
  setTab: (t: TabName) => void;
}

export function TabNav({ tab, setTab }: TabNavProps) {
  return (
    <nav aria-label="Tracker sections" role="tablist" className="flex gap-1 bg-muted rounded-xl p-1 mb-6">
      {(["overview", "calendar", "history", "predictions"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          role="tab"
          aria-selected={tab === t}
          className={`flex-1 py-2 px-1 rounded-lg text-xs sm:text-sm font-medium capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
            tab === t
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}

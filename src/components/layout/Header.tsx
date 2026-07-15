import { Heart, User, Settings } from "lucide-react";

interface HeaderProps {
  view: "personal" | "partner";
  setView: (v: "personal" | "partner") => void;
  onSettingsClick: () => void;
}

export function Header({ view, setView, onSettingsClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to content
      </a>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/rhea-mark.svg" alt="" className="w-6 h-6" aria-hidden="true" />
          <span className="font-serif text-base font-semibold text-foreground tracking-tight">
            Rhea
          </span>
          <span className="text-muted-foreground text-xs hidden sm:inline" aria-hidden="true">
            &middot; Cycle Tracker
          </span>
        </div>

        <div className="flex items-center gap-2">
          <nav aria-label="View toggle" role="tablist" className="flex bg-muted rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setView("personal")}
              role="tab"
              aria-selected={view === "personal"}
              aria-controls="main-content"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                view === "personal"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User size={11} aria-hidden="true" />
              My View
            </button>
            <button
              onClick={() => setView("partner")}
              role="tab"
              aria-selected={view === "partner"}
              aria-controls="main-content"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                view === "partner"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Heart size={11} aria-hidden="true" />
              Partner
            </button>
          </nav>

          <button
            onClick={onSettingsClick}
            aria-label="Settings"
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Settings size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

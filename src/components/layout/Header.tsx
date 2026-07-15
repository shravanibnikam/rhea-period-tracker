import { Heart, User, Settings } from "lucide-react";

interface HeaderProps {
  view: "personal" | "partner";
  setView: (v: "personal" | "partner") => void;
  onSettingsClick: () => void;
}

export function Header({ view, setView, onSettingsClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/rhea-mark.svg" alt="Rhea" className="w-6 h-6" />
          <span className="font-serif text-base font-semibold text-foreground tracking-tight">
            Rhea
          </span>
          <span className="text-muted-foreground text-xs hidden sm:inline">
            &middot; Cycle Tracker
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-full p-0.5 gap-0.5">
            <button
              onClick={() => setView("personal")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                view === "personal"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User size={11} />
              My View
            </button>
            <button
              onClick={() => setView("partner")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                view === "partner"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Heart size={11} />
              Partner
            </button>
          </div>

          <button
            onClick={onSettingsClick}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

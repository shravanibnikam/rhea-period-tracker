import { Shield, Heart, Moon } from "lucide-react";

interface OnboardingProps {
  onStartLogging: () => void;
  onImport: () => void;
  onQuickAdd: () => void;
}

export function Onboarding({ onStartLogging, onImport, onQuickAdd }: OnboardingProps) {
  return (
    <div className="space-y-6">
      {/* Welcome hero */}
      <div className="rounded-3xl p-8 sm:p-10 border text-center bg-card border-border">
        <img
          src={`${import.meta.env.BASE_URL}rhea-mark.svg`}
          alt="Rhea"
          className="w-16 h-16 mx-auto mb-4"
        />
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-foreground mb-2">
          Welcome to Rhea
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          A local-first cycle tracker built for two people.
        </p>
      </div>

      {/* Principles */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-2xl border border-border p-5 text-center">
          <Shield size={24} className="mx-auto mb-3 text-primary" />
          <p className="text-sm font-semibold text-foreground mb-1">Where your data lives</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your logs are stored on this device. When you&apos;re signed in they
            also sync to our server, where they are not yet end-to-end
            encrypted. No ads, no analytics.
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5 text-center">
          <Moon size={24} className="mx-auto mb-3 text-primary" />
          <p className="text-sm font-semibold text-foreground mb-1">Honest predictions</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Estimates are labelled as estimates. The more you log, the better they get.
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5 text-center">
          <Heart size={24} className="mx-auto mb-3 text-primary" />
          <p className="text-sm font-semibold text-foreground mb-1">Built for two</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Choose what your partner&apos;s view shows, and unlink them anytime.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold text-foreground mb-1">
          Get started
        </h2>
        <p className="text-xs text-muted-foreground mb-5">
          Log your first period to see predictions, or import history from another app.
        </p>

        <div className="space-y-3">
          <button
            onClick={onQuickAdd}
            className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-primary/30 hover:border-primary/60 bg-primary/5 transition-all text-left"
          >
            <span className="text-2xl">&#x1F4C5;</span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Add your last period
              </p>
              <p className="text-xs text-muted-foreground">
                Pick the start date and how many days it lasted
              </p>
            </div>
          </button>

          <button
            onClick={onStartLogging}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-all text-left"
          >
            <span className="text-2xl">&#x270D;&#xFE0F;</span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Log today
              </p>
              <p className="text-xs text-muted-foreground">
                Start tracking from right now
              </p>
            </div>
          </button>

          <button
            onClick={onImport}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-all text-left"
          >
            <span className="text-2xl">&#x1F4E5;</span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Import from another app
              </p>
              <p className="text-xs text-muted-foreground">
                Clue, Flo, Apple Health, or any CSV
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

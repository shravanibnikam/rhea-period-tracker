import { useState } from "react";
import { Moon, Heart } from "lucide-react";
import { redeemInviteCode } from "@/app/lib/pairing";

interface RoleSelectProps {
  onChooseOwner: () => void;
  onPaired: () => void;
}

export function RoleSelect({ onChooseOwner, onPaired }: RoleSelectProps) {
  const [mode, setMode] = useState<"choose" | "invite">("choose");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setError(null);
    setSubmitting(true);

    const err = await redeemInviteCode(code);
    setSubmitting(false);

    if (err) {
      setError(err);
    } else {
      onPaired();
    }
  };

  if (mode === "invite") {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Heart size={28} className="text-primary" />
            </div>
            <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
              Join as partner
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter the invite code your partner shared with you
            </p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={8}
              autoFocus
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-4 text-lg text-foreground font-mono tracking-[0.3em] uppercase text-center placeholder:text-muted-foreground/40 placeholder:tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-xl px-4 py-2.5 text-center">
                {error}
              </p>
            )}

            <button
              onClick={handleRedeem}
              disabled={submitting || !code.trim()}
              className="w-full py-3 rounded-xl font-medium text-sm text-white bg-primary hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Pairing..." : "Connect"}
            </button>

            <button
              onClick={() => {
                setMode("choose");
                setError(null);
                setCode("");
              }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/rhea-mark.svg" alt="Rhea" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            Welcome to Rhea
          </h1>
          <p className="text-sm text-muted-foreground">
            How will you use the app?
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onChooseOwner}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-border hover:border-primary/40 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Moon size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                I&apos;m tracking my cycle
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Log periods, symptoms, mood, and energy
              </p>
            </div>
          </button>

          <button
            onClick={() => setMode("invite")}
            className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-border hover:border-primary/40 transition-all text-left"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Heart size={24} className="text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">
                I&apos;m joining as a partner
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                I have an invite code from my partner
              </p>
            </div>
          </button>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-8">
          Your data is private and secure.
          <br />
          You can change this later in Settings.
        </p>
      </div>
    </div>
  );
}

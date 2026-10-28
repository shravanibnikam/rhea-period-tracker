import { useState, type FormEvent } from "react";
import { CalendarHeart, ChevronLeft, ChevronRight, HeartHandshake } from "lucide-react";
import { redeemInviteCode, isValidInviteCode } from "@/app/lib/pairing";
import { Button } from "@/app/components/ui/Button";
import { cn } from "@/app/lib/cn";
import { AUTH_INPUT, AUTH_SCREEN, AuthCard, PrivacyNote } from "@/app/views/auth/AuthScreen";

interface RoleSelectProps {
  onChooseOwner: () => void;
  onPaired: () => void;
}

// One tile per person, each in its own hue: the tracker's the brand (menstrual) tint, the partner's blue.
const CHOICE =
  "flex min-h-[5.5rem] w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-[box-shadow,transform] duration-150 hover:ring-2 hover:ring-current/25 active:scale-[0.99]";
const CHOICE_ICON = "flex size-11 shrink-0 items-center justify-center rounded-full bg-card/80";

export function RoleSelect({ onChooseOwner, onPaired }: RoleSelectProps) {
  const [mode, setMode] = useState<"choose" | "invite">("choose");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameBack, setCameBack] = useState(false);

  const handleRedeem = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    // The secret is a case-sensitive base64url string — validate against the
    // real format, but never mutate it (case/internal chars preserved).
    if (!isValidInviteCode(trimmed)) {
      setError("That doesn't look like a valid invite code. Paste the whole code your partner sent.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const err = await redeemInviteCode(trimmed);
    setSubmitting(false);

    if (err) {
      setError(err);
    } else {
      onPaired();
    }
  };

  return (
    <main className={AUTH_SCREEN}>
      {mode === "invite" ? (
        <div className="w-full max-w-sm">
          <Button
            variant="ghost"
            className="-ml-4 mb-4"
            onClick={() => {
              setMode("choose");
              setError(null);
              setCode("");
              setCameBack(true);
            }}
          >
            <ChevronLeft size={18} aria-hidden="true" />
            Back
          </Button>
          <AuthCard
            title="Join as a partner"
            intro="Paste the invite code your partner sent you. A code works once, within 30 minutes of being made."
          >
            <form onSubmit={handleRedeem} className="space-y-4">
              <div>
                <label htmlFor="invite-code" className="text-sm text-foreground">
                  Invite code
                </label>
                {/* Focus moves here with the step: the button that opened it is gone. */}
                <input
                  id="invite-code"
                  name="invite-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste invite code"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className={`mt-2 font-mono ${AUTH_INPUT}`} /* taste-skill-ignore: invite codes are code (docs/DESIGN.md) */
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={submitting || !code.trim()}>
                {submitting ? "Connecting…" : "Connect"}
              </Button>
            </form>
          </AuthCard>
          <PrivacyNote />
        </div>
      ) : (
        <div className="w-full max-w-md">
          <AuthCard
            title="How will you use the app?"
            intro="Welcome to Rhea. Track your own cycle, or join a partner who has invited you."
          >
            <div className="grid gap-3">
              <button type="button" onClick={onChooseOwner} className={cn(CHOICE, "bg-accent text-accent-foreground")}>
                <span className={CHOICE_ICON}>
                  <CalendarHeart size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">I&apos;m tracking my cycle</span>
                  <span className="mt-1 block text-sm">Log periods, symptoms, mood and energy</span>
                </span>
                <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
              </button>

              {/* After Back, focus returns to the tile that opened the invite step. */}
              <button
                type="button"
                onClick={() => setMode("invite")}
                autoFocus={cameBack}
                className={cn(CHOICE, "bg-partner-tint text-partner-ink")}
              >
                <span className={CHOICE_ICON}>
                  <HeartHandshake size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold">I&apos;m joining as a partner</span>
                  <span className="mt-1 block text-sm">I have an invite code from my partner</span>
                </span>
                <ChevronRight size={20} aria-hidden="true" className="shrink-0" />
              </button>
            </div>
          </AuthCard>
          <PrivacyNote />
        </div>
      )}
    </main>
  );
}

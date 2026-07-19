import { useState, useEffect } from "react";
import { Link, Unlink, Copy, Check } from "lucide-react";
import type { UserRole } from "@/app/hooks/useAuth";
import { createInviteCode, redeemInviteCode, getPartnerLink, unpair, isValidInviteCode } from "@/app/lib/pairing";

interface PairingSectionProps {
  userId: string;
  role: UserRole;
  onRoleChanged: () => void;
}

/**
 * Redeem input. The invite secret is a case-sensitive base64url string
 * (see isValidInviteCode) — so this NEVER upper-cases, letter-spaces, or caps
 * length; it also disables mobile auto-capitalize/-correct which would corrupt
 * the code. Only surrounding whitespace is trimmed (at submit); internal
 * characters and case are preserved verbatim.
 */
function RedeemForm({
  code,
  onChange,
  onRedeem,
  prompt,
}: {
  code: string;
  onChange: (v: string) => void;
  onRedeem: () => void;
  prompt: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{prompt}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste invite code"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Invite code"
          className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          onClick={onRedeem}
          disabled={!code.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Pair
        </button>
      </div>
    </div>
  );
}

export function PairingSection({ userId, role, onRoleChanged }: PairingSectionProps) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [partnerLinked, setPartnerLinked] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPartnerLink(userId).then((link) => {
      setPartnerLinked(link !== null);
      setLoading(false);
    });
  }, [userId]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 4000);
  };

  const handleCreateInvite = async () => {
    const code = await createInviteCode(userId);
    if (code) {
      setInviteCode(code);
    } else {
      showStatus("Failed to create invite");
    }
  };

  const handleCopy = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRedeem = async () => {
    const code = redeemCode.trim();
    if (!code) return;
    // Validate against the real server format before hitting the network — but
    // NEVER mutate the code (case and internal characters preserved). A
    // wrong-looking code gets a clear message instead of a confusing rejection.
    if (!isValidInviteCode(code)) {
      showStatus("That doesn't look like a valid invite code — paste the full code your partner shared.");
      return;
    }
    const err = await redeemInviteCode(code);
    if (err) {
      showStatus(err);
    } else {
      showStatus("Paired successfully!");
      setPartnerLinked(true);
      onRoleChanged();
    }
  };

  const handleUnpair = async () => {
    const err = await unpair(userId);
    if (err) {
      showStatus(err);
    } else {
      setPartnerLinked(false);
      showStatus("Unlinked from partner");
      onRoleChanged();
    }
  };

  if (loading) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Partner
      </p>

      {status && (
        <div className="px-4 py-2.5 rounded-xl bg-muted text-sm text-foreground text-center mb-3">
          {status}
        </div>
      )}

      {role === "owner" && !partnerLinked && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Generate an invite code and share it with your partner. They'll use
            it to link their account to yours.
          </p>

          {inviteCode ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl border-2 border-primary/30 bg-primary/5 px-4 py-3 text-center">
                <p className="font-mono text-lg font-bold text-foreground tracking-widest">
                  {inviteCode}
                </p>
              </div>
              <button
                onClick={handleCopy}
                className="p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                {copied ? (
                  <Check size={18} className="text-primary" />
                ) : (
                  <Copy size={18} className="text-muted-foreground" />
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={handleCreateInvite}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
            >
              <Link size={18} className="text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Generate invite code
                </p>
                <p className="text-xs text-muted-foreground">
                  Create a one-time code for your partner
                </p>
              </div>
            </button>
          )}
        </div>
      )}

      {role === "owner" && partnerLinked && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <Link size={18} className="text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Partner linked
              </p>
              <p className="text-xs text-muted-foreground">
                Your partner can see the shared view
              </p>
            </div>
          </div>
          <button
            onClick={handleUnpair}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-destructive/30 hover:bg-destructive/5 transition-colors text-left"
          >
            <Unlink size={18} className="text-destructive flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">
                Unlink partner
              </p>
              <p className="text-xs text-muted-foreground">
                Immediately revokes their access
              </p>
            </div>
          </button>
        </div>
      )}

      {role === "partner" && !partnerLinked && (
        <RedeemForm
          code={redeemCode}
          onChange={setRedeemCode}
          onRedeem={handleRedeem}
          prompt="Enter the invite code your partner shared with you."
        />
      )}

      {role === "partner" && partnerLinked && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
          <Link size={18} className="text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Connected to partner
            </p>
            <p className="text-xs text-muted-foreground">
              You're seeing their shared cycle view
            </p>
          </div>
        </div>
      )}

      {role === null && (
        <RedeemForm
          code={redeemCode}
          onChange={setRedeemCode}
          onRedeem={handleRedeem}
          prompt="Enter an invite code from your partner to link accounts."
        />
      )}
    </div>
  );
}

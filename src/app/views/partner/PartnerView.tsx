import { useState, useEffect } from "react";
import { Heart, Moon } from "lucide-react";
import type { PhaseData, PhaseName, CycleState } from "@/domain/types";
import {
  PHASES,
  PHASE_ORDER,
  ENERGY_LABELS,
  getPhaseLengths,
  getPhaseRangeLabel,
  anchorsFrom,
} from "@/domain/phases";
import { fmt } from "@/app/lib/format";
import { diffDays } from "@/domain/dates";
import { EnergyBar } from "@/app/components/shared/EnergyBar";
import {
  getShareSettings,
  getQuietWindows,
  getSharedNotes,
  sendSharedNote,
  isInQuietWindow,
  type ShareSettings,
  type QuietWindow,
  type SharedNote,
} from "@/app/lib/sharing";
import { supabase } from "@/app/lib/supabase";
import { flags } from "@/app/lib/flags";

interface PartnerViewProps {
  phaseData: PhaseData;
  phase: PhaseName;
  state: CycleState;
  today: Date;
  ownerId?: string | null;
  currentUserId?: string | null;
}

export function PartnerView({
  phaseData,
  phase,
  state,
  today,
  ownerId,
  currentUserId,
}: PartnerViewProps) {
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [quietWindows, setQuietWindows] = useState<QuietWindow[]>([]);
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [loading, setLoading] = useState(true);
  // Same oracle as the owner's hero bar (M1.3) — the segment widths can no
  // longer disagree between the two views.
  const anchors = anchorsFrom(state.avgCycleLength, state.avgPeriodLength);
  const phaseLengths = getPhaseLengths(anchors);

  // Load share settings + quiet windows
  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    Promise.all([
      getShareSettings(ownerId),
      getQuietWindows(ownerId),
      getSharedNotes(ownerId),
    ]).then(([s, qw, n]) => {
      setSettings(s);
      setQuietWindows(qw);
      setNotes(n);
      setLoading(false);
    });
  }, [ownerId]);

  // Realtime subscription for shared notes
  useEffect(() => {
    if (!flags.notesSync || !supabase || !ownerId) return;
    const client = supabase;
    const channel = client
      .channel("shared-notes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shared_notes", filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          setNotes((prev) => [...prev, payload.new as SharedNote]);
        }
      )
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [ownerId]);

  const handleSendNote = async () => {
    if (!noteInput.trim() || !ownerId || !currentUserId) return;
    await sendSharedNote(ownerId, currentUserId, noteInput.trim());
    setNoteInput("");
  };

  const isQuiet = isInQuietWindow(quietWindows);

  // When no Supabase / no owner, show everything (local demo mode)
  const isGated = ownerId != null && settings != null;

  const show = {
    phase: !isGated || (!isQuiet && settings!.todays_phase),
    headsup: !isGated || (!isQuiet && settings!.cycle_headsup),
    mood: !isGated || (!isQuiet && settings!.mood_signal),
    tips: !isGated || (!isQuiet && settings!.care_nudges),
    notes: !isGated || (!isQuiet && settings!.shared_notes),
  };

  const nothingShared = isGated && !show.phase && !show.headsup && !show.mood && !show.tips && !show.notes;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading partner view...</p>
      </div>
    );
  }

  // Quiet window active
  if (isGated && isQuiet) {
    return (
      <div className="space-y-5">
        <div className="rounded-3xl p-8 sm:p-10 border text-center bg-card border-border">
          <Moon size={40} className="mx-auto mb-4 text-muted-foreground" />
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            Sharing paused
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            She&apos;s taken a quiet moment. Sharing will resume when she&apos;s ready.
          </p>
        </div>
      </div>
    );
  }

  // Nothing shared
  if (nothingShared) {
    return (
      <div className="space-y-5">
        <div className="rounded-3xl p-8 sm:p-10 border text-center bg-card border-border">
          <Heart size={40} className="mx-auto mb-4 text-muted-foreground" />
          <h1 className="font-serif text-2xl font-bold text-foreground mb-2">
            Nothing shared yet
          </h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            She hasn&apos;t enabled any sharing yet. When she does, you&apos;ll
            see cycle updates here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Partner Hero — gated by todays_phase */}
      {show.phase && (
        <div
          className="rounded-3xl p-6 sm:p-8 border text-center"
          style={{ backgroundColor: phaseData.bg, borderColor: phaseData.border }}
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Heart size={14} style={{ color: phaseData.color }} fill={phaseData.color} />
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: phaseData.color }}
            >
              Partner&apos;s Guide
            </p>
            <Heart size={14} style={{ color: phaseData.color }} fill={phaseData.color} />
          </div>

          <p
            className="text-4xl sm:text-5xl mb-3 select-none"
            style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))" }}
          >
            {phaseData.emoji}
          </p>

          <h1
            className="font-serif text-3xl sm:text-4xl font-bold mb-1"
            style={{ color: phaseData.text }}
          >
            She&apos;s in her
          </h1>
          <h1
            className="font-serif text-3xl sm:text-4xl font-bold italic mb-3"
            style={{ color: phaseData.text }}
          >
            {phaseData.name} Phase
          </h1>

          <p className="text-sm mb-2" style={{ color: phaseData.text, opacity: 0.75 }}>
            &ldquo;{phaseData.tagline}&rdquo;
          </p>

          <div className="max-w-xs mx-auto mt-5">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
              {PHASE_ORDER.map((p) => {
                const len = phaseLengths[p];
                const pct = (len / state.avgCycleLength) * 100;
                return (
                  <div
                    key={p}
                    className="h-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: PHASES[p].color,
                      opacity: p === phase ? 1 : 0.25,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* What's Happening — gated by todays_phase */}
      {show.phase && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-serif text-xl font-semibold mb-3 text-foreground">
            What&apos;s Happening in Her Body
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            {phaseData.partnerDesc}
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl" style={{ backgroundColor: phaseData.bg }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: phaseData.color }}>
                Energy Level
              </p>
              <EnergyBar level={phaseData.energy} color={phaseData.color} />
              <p className="text-xs mt-2" style={{ color: phaseData.text, opacity: 0.85 }}>
                {ENERGY_LABELS[phaseData.energy]}
              </p>
            </div>

            {show.mood && (
              <div className="p-4 rounded-xl" style={{ backgroundColor: phaseData.bg }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: phaseData.color }}>
                  Mood Tendencies
                </p>
                <p className="text-sm" style={{ color: phaseData.text }}>
                  {phaseData.mood}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* How You Can Help — gated by care_nudges */}
      {show.tips && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
            How You Can Help
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Four things that matter most right now
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {phaseData.partnerTips.map((tip, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-border">
                <div
                  className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: phaseData.color }}
                >
                  {i + 1}
                </div>
                <p className="text-sm text-foreground leading-snug">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* What's Coming Next — gated by cycle_headsup */}
      {show.headsup && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-serif text-xl font-semibold mb-4 text-foreground">
            What&apos;s Coming Next
          </h2>
          <div className="space-y-2.5">
            {state.predictions.slice(0, 3).map((pred, i) => {
              const isNext = i === 0;
              const daysAway = diffDays(pred.start, today);
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3.5 rounded-xl ${isNext ? "" : "bg-muted"}`}
                  style={isNext ? { backgroundColor: PHASES.menstrual.bg } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl ${isNext ? "" : "opacity-50"}`}>{PHASES.menstrual.emoji}</span>
                    <div>
                      <p
                        className={`text-sm ${isNext ? "font-semibold" : "font-medium text-foreground"}`}
                        style={isNext ? { color: PHASES.menstrual.text } : undefined}
                      >
                        {isNext ? "Next Period" : fmt(pred.start, { month: "long", day: "numeric" })}
                      </p>
                      <p className="text-xs" style={isNext ? { color: PHASES.menstrual.text, opacity: 0.7 } : undefined}>
                        <span className={isNext ? "" : "text-muted-foreground"}>
                          {isNext
                            ? `${fmt(pred.start, { month: "long", day: "numeric" })} \u00b7 in ${daysAway} days`
                            : `in ${daysAway} days`}
                        </span>
                      </p>
                    </div>
                  </div>
                  {isNext && (
                    <div className="text-right text-sm font-serif font-bold" style={{ color: PHASES.menstrual.text }}>
                      {daysAway}d
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Shared Notes — gated by shared_notes */}
      {show.notes && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
            Notes
          </h2>
          {flags.notesSync ? (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                A small space for you both
              </p>

              {notes.length > 0 && (
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                  {notes.map((note) => {
                    const isMe = note.author_id === currentUserId;
                    return (
                      <div
                        key={note.id}
                        className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                            isMe
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted text-foreground rounded-bl-md"
                          }`}
                        >
                          {note.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {currentUserId && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendNote()}
                    placeholder="Send a note..."
                    className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={handleSendNote}
                    disabled={!noteInput.trim()}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Shared notes are being upgraded to end-to-end encryption and are
              temporarily unavailable.
            </p>
          )}
        </div>
      )}

      {/* Understanding the Full Cycle — always shown if anything is visible */}
      {show.phase && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
            Understanding the Full Cycle
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Each cycle has four distinct phases with different needs.
          </p>

          <div className="space-y-2.5">
            {PHASE_ORDER.map((p) => (
              <div
                key={p}
                className="p-4 rounded-xl border-2 transition-all"
                style={{
                  backgroundColor: PHASES[p].bg,
                  borderColor: p === phase ? PHASES[p].color : "transparent",
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{PHASES[p].emoji}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: PHASES[p].text }}>
                        {PHASES[p].name}{" "}
                        {p === phase && (
                          <span
                            className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: PHASES[p].color, color: "white" }}
                          >
                            Now
                          </span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: PHASES[p].text, opacity: 0.6 }}>
                        {getPhaseRangeLabel(p, anchors)}
                      </p>
                    </div>
                  </div>
                  <div className="w-24">
                    <EnergyBar level={PHASES[p].energy} color={PHASES[p].color} />
                  </div>
                </div>
                <p className="text-xs leading-relaxed pl-9" style={{ color: PHASES[p].text, opacity: 0.8 }}>
                  {PHASES[p].partnerTips[0]}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-center text-muted-foreground leading-relaxed">
              Every cycle is different. These are tendencies, not certainties &mdash;
              <br />
              listening is always the best guide.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

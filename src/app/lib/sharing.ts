import { supabase } from "@/app/lib/supabase";
import { toDateKey } from "@/domain/dates";

export type ShareKey =
  | "cycle_headsup"
  | "todays_phase"
  | "calendar_view"
  | "mood_signal"
  | "symptom_details"
  | "care_nudges";

export const SHARE_KEYS: { key: ShareKey; label: string; description: string }[] = [
  {
    key: "cycle_headsup",
    label: "Cycle heads-up",
    description: "When your next periods are likely to start",
  },
  {
    key: "todays_phase",
    label: "Today's phase",
    description: "Which phase you're in, with its usual energy and mood",
  },
  {
    key: "calendar_view",
    label: "Cycle calendar",
    description: "The month view: phases, period days and the fertile window",
  },
  {
    key: "mood_signal",
    label: "Today's mood",
    description: "The mood you've logged today, like “Calm” or “Irritable”",
  },
  {
    key: "symptom_details",
    label: "Symptoms",
    description: "The symptoms you've logged today and over the past week",
  },
  {
    key: "care_nudges",
    label: "Care nudges",
    description: "Ideas for how your partner can help in this phase",
  },
];

export type ShareSettings = Record<ShareKey, boolean>;

const DEFAULT_SETTINGS: ShareSettings = {
  cycle_headsup: false,
  todays_phase: false,
  calendar_view: false,
  mood_signal: false,
  symptom_details: false,
  care_nudges: false,
};

// ─── Load share settings ─────────────────────────────────────────────────────

export async function getShareSettings(ownerId: string): Promise<ShareSettings> {
  if (!supabase) return { ...DEFAULT_SETTINGS };

  // Ensure defaults exist
  await supabase.rpc("ensure_share_settings", { uid: ownerId });

  const { data, error } = await supabase
    .from("share_settings")
    .select("share_key, enabled")
    .eq("owner_id", ownerId);
  // Returned errors reject (as in pairing.ts): all-off defaults in place of a
  // failed read would misreport what is shared, and a failed write must not
  // read as saved.
  if (error) throw error;

  const settings = { ...DEFAULT_SETTINGS };
  if (data) {
    for (const row of data) {
      if (row.share_key in settings) {
        settings[row.share_key as ShareKey] = row.enabled;
      }
    }
  }
  return settings;
}

// ─── Update a single toggle ─────────────────────────────────────────────────

export async function setShareSetting(
  ownerId: string,
  key: ShareKey,
  enabled: boolean
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from("share_settings")
    .upsert(
      { owner_id: ownerId, share_key: key, enabled },
      { onConflict: "owner_id,share_key" }
    );
  if (error) throw error;
}

// ─── Quiet windows ──────────────────────────────────────────────────────────

export interface QuietWindow {
  id: string;
  owner_id: string;
  start_date: string;
  end_date: string;
}

export async function getQuietWindows(ownerId: string): Promise<QuietWindow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("quiet_windows")
    .select("*")
    .eq("owner_id", ownerId)
    .order("start_date", { ascending: false });
  if (error) throw error;

  return (data as QuietWindow[]) ?? [];
}

export async function addQuietWindow(
  ownerId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase.from("quiet_windows").insert({
    owner_id: ownerId,
    start_date: startDate,
    end_date: endDate,
  });
  if (error) throw error;
}

export async function removeQuietWindow(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("quiet_windows").delete().eq("id", id);
  if (error) throw error;
}

export function isInQuietWindow(
  quietWindows: QuietWindow[],
  date: Date = new Date()
): boolean {
  // Local date key (M1.3): quiet windows are calendar days in the user's life.
  // The old UTC key (toISOString) shifted the window by a day near midnight.
  const d = toDateKey(date);
  return quietWindows.some((qw) => d >= qw.start_date && d <= qw.end_date);
}

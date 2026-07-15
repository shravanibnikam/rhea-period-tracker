import { supabase } from "@/lib/supabase";

export type ShareKey =
  | "cycle_headsup"
  | "todays_phase"
  | "mood_signal"
  | "care_nudges"
  | "shared_notes";

export const SHARE_KEYS: { key: ShareKey; label: string; description: string }[] = [
  {
    key: "cycle_headsup",
    label: "Cycle heads-up",
    description: "Partner sees \"Period likely in ~N days\"",
  },
  {
    key: "todays_phase",
    label: "Today's phase",
    description: "A soft label like \"luteal — may be lower energy\"",
  },
  {
    key: "mood_signal",
    label: "Mood signal",
    description: "An optional flag: \"rough day\" or \"good day\"",
  },
  {
    key: "care_nudges",
    label: "Care nudges",
    description: "Gentle suggestions like \"she may want space\"",
  },
  {
    key: "shared_notes",
    label: "Shared notes",
    description: "A small two-way space for messages",
  },
];

export type ShareSettings = Record<ShareKey, boolean>;

const DEFAULT_SETTINGS: ShareSettings = {
  cycle_headsup: false,
  todays_phase: false,
  mood_signal: false,
  care_nudges: false,
  shared_notes: false,
};

// ─── Load share settings ─────────────────────────────────────────────────────

export async function getShareSettings(ownerId: string): Promise<ShareSettings> {
  if (!supabase) return { ...DEFAULT_SETTINGS };

  // Ensure defaults exist
  await supabase.rpc("ensure_share_settings", { uid: ownerId });

  const { data } = await supabase
    .from("share_settings")
    .select("share_key, enabled")
    .eq("owner_id", ownerId);

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

  await supabase
    .from("share_settings")
    .upsert(
      { owner_id: ownerId, share_key: key, enabled },
      { onConflict: "owner_id,share_key" }
    );
}

// ─── Shared notes ────────────────────────────────────────────────────────────

export interface SharedNote {
  id: string;
  owner_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export async function getSharedNotes(ownerId: string): Promise<SharedNote[]> {
  if (!supabase) return [];

  const { data } = await supabase
    .from("shared_notes")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  return (data as SharedNote[]) ?? [];
}

export async function sendSharedNote(
  ownerId: string,
  authorId: string,
  content: string
): Promise<void> {
  if (!supabase) return;

  await supabase.from("shared_notes").insert({
    owner_id: ownerId,
    author_id: authorId,
    content,
  });
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

  const { data } = await supabase
    .from("quiet_windows")
    .select("*")
    .eq("owner_id", ownerId)
    .order("start_date", { ascending: false });

  return (data as QuietWindow[]) ?? [];
}

export async function addQuietWindow(
  ownerId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  if (!supabase) return;

  await supabase.from("quiet_windows").insert({
    owner_id: ownerId,
    start_date: startDate,
    end_date: endDate,
  });
}

export async function removeQuietWindow(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("quiet_windows").delete().eq("id", id);
}

export function isInQuietWindow(
  quietWindows: QuietWindow[],
  date: Date = new Date()
): boolean {
  const d = date.toISOString().slice(0, 10);
  return quietWindows.some((qw) => d >= qw.start_date && d <= qw.end_date);
}

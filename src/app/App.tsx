import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Toaster } from "sonner";
import type { DailyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";
import { toDateKey } from "@/domain/dates";
import { useCycleData } from "@/app/hooks/useCycleData";
import { useAuth } from "@/app/hooks/useAuth";
import { useLogger, LOAD_FAILED_MESSAGE } from "@/app/hooks/useLogger";
import { initialSync, pushLog, subscribeToLogs, unsubscribe } from "@/app/lib/sync";
import { supabase } from "@/app/lib/supabase";
import { isOwnerEngineSync, ownerOutboxMode } from "@/app/lib/flags";
import { useContainer } from "@/app/di";
import { AppNav, readRoute, type Route } from "@/app/components/layout/AppNav";
import { RheaMark } from "@/app/components/shared/RheaMark";
import { Button } from "@/app/components/ui/Button";
import { OverviewTab } from "@/app/views/tracker/OverviewTab";
import { CalendarTab } from "@/app/views/tracker/CalendarTab";
import { InsightsTab } from "@/app/views/tracker/InsightsTab";
import { PartnerView } from "@/app/views/partner/PartnerView";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { QuickAddPeriod } from "@/app/views/tracker/QuickAddPeriod";
import { Onboarding } from "@/app/views/tracker/Onboarding";
import { SettingsView } from "@/app/views/settings/SettingsView";
import { SourcesView } from "@/app/views/settings/SourcesView";
import { PrivacyPolicy } from "@/app/views/settings/PrivacyPolicy";
import { AuthScreen } from "@/app/views/auth/AuthScreen";
import { RoleSelect } from "@/app/views/auth/RoleSelect";
import { Landing } from "@/app/views/landing/Landing";
import { hasWelcomed, markWelcomed, isStandalone } from "@/app/lib/welcome";

// Toasts float over the screen, so they carry the soft elevation.
const TOAST =
  "flex w-full items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 font-sans text-sm text-popover-foreground shadow-soft";

/** Landing: a first visit (no deep link, not installed), or #welcome on purpose. */
const wantsLanding = () =>
  window.location.hash === "#welcome" ||
  (window.location.hash === "" && !hasWelcomed() && !isStandalone());

/** The app, plus the one toast region every screen shares (`toast()` from sonner). */
export default function App() {
  return (
    <>
      <AppScreens />
      <Toaster position="top-center" toastOptions={{ unstyled: true, classNames: { toast: TOAST } }} />
    </>
  );
}

function AppScreens() {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [cycleLengthOverride, setCycleLengthOverride] = useState<number | null>(null);
  const [logSheetDate, setLogSheetDate] = useState<Date | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  // The account that answered the role question: the next account is asked again.
  const [roleChosenFor, setRoleChosenFor] = useState<string | null>(null);
  const [symptomError, setSymptomError] = useState<string | null>(null);
  const [showLanding, setShowLanding] = useState(wantsLanding);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  // Local midnight: diffDays floors, so a time-of-day "today" read every "in N days" one short.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ── Auth / DI ──
  const container = useContainer();
  const auth = useAuth();
  const channelRef = useRef<ReturnType<typeof subscribeToLogs>>(null);

  const isPartner = auth.role === "partner";
  const isOwner = auth.role === "owner";

  // ── Data ──
  const { logs, state, loading: dataLoading, excludedStarts, refresh } = useCycleData();
  const hasData = logs.length > 0;

  // Data follows the account (P0-06): re-read the local store whenever the
  // signed-in account changes, whatever its role — the sync paths below refresh
  // only once a role is resolved, so a new account whose lookup fails or hangs
  // would keep showing the previous account's rows. Also re-read when the
  // store's partner marker is read or changes: an ex-partner confirmed as owner
  // has the previous owner's cache purged first (useAuth), and a screen must
  // never show rows read before that.
  // The main UI waits until the read for this key has landed (loading gate).
  const accountId = auth.user?.id ?? null;
  const dataKey = `${accountId}|${auth.storeMarkedPartner}`;
  const [dataFor, setDataFor] = useState<string | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void refresh().then(() => {
      if (current) setDataFor(dataKey);
    });
    return () => {
      current = false;
    };
  }, [dataKey, refresh]);

  const activeLogDate = logSheetDate ?? today;
  const {
    log: activeLog,
    setLog: setActiveLog,
    save: saveActiveLog,
    saveMany: saveActiveLogs,
    setSymptom: setActiveSymptom,
    reload: reloadActiveLog,
    revert: revertActiveLog,
    remove: removeActiveLog,
    exists: activeLogExists,
    loadError: activeLogLoadError,
  } = useLogger(
    activeLogDate,
    // Single write path (M1.3): every save flows through here. The saved logs
    // are pushed by their own local date keys — the old UTC-based re-fetch
    // dropped or mis-keyed saves near midnight (see writePath.guard.spec).
    useCallback(
      async (saved: DailyLog[]) => {
        // In owner-engine mode saveLog already enqueued the write to the durable
        // outbox; the engine delivers it (possibly after it finishes starting).
        // Only a resolved OWNER on the legacy path pushes explicitly. Decide on
        // the CONFIGURED mode, NOT on whether the engine instance exists yet —
        // otherwise a save during the startup gap would BOTH enqueue and
        // legacy-push (double send). A partner or an unresolved role (P0-06:
        // fail closed) never pushes directly; an unresolved role's saves only
        // queue, and are delivered once the engine starts for a confirmed owner.
        if (auth.user && auth.role === "owner" && !isOwnerEngineSync(true, auth.role)) {
          for (const l of saved) await pushLog(auth.user.id, l);
        }
        refresh();
      },
      [auth.user, auth.role, refresh, container]
    ),
    // Re-read the active day whenever the account (or its store, see dataKey)
    // changes (P0-N1): this hook mounts before auth resolves, so its first read
    // is the local-only store. useAuth scopes the container before exposing the
    // user, so accountId always names the store the container reads at this render.
    dataKey
  );

  // Keep the active log in step with the store (P0-N2). After a sync (or an
  // import / erase) re-read cycle data AND the active day, so the Overview never
  // shows a stale record — but not while the Log sheet is open: it holds the
  // user's unsaved edits (the sheet re-reads when it opens and when it closes).
  // Stable identity: the sync effect below depends on it, and must not restart.
  const liveLog = useRef({ sheetOpen: false, reload: reloadActiveLog });
  liveLog.current = { sheetOpen: logSheetDate !== null, reload: reloadActiveLog };
  const refreshAfterSync = useCallback(() => {
    void refresh();
    if (!liveLog.current.sheetOpen) liveLog.current.reload();
  }, [refresh]);

  // The sheet and the Overview share the active log. When the sheet opens,
  // re-read the day so it never renders a stale record; when it closes, drop
  // whatever was not saved (Escape, X, a failed Save), so an abandoned draft
  // can never reach the Overview or a later save.
  const sheetEffectRan = useRef(false);
  useEffect(() => {
    if (!sheetEffectRan.current) {
      sheetEffectRan.current = true; // mount: useLogger is already reading
      return;
    }
    if (logSheetDate === null) revertActiveLog();
    reloadActiveLog();
    // Runs only on open/close; reload/revert are this render's (the new date's).
  }, [logSheetDate]);

  // Delete the active log through the sync-engine tombstone path. Rejects on
  // failure so DailyLogSheet keeps the modal open + shows the error; only on
  // success do we refresh and close the sheet.
  const handleDeleteActiveLog = useCallback(async () => {
    await removeActiveLog();
    refresh();
    setLogSheetDate(null);
  }, [removeActiveLog, refresh]);

  // ── Sync ──
  useEffect(() => {
    // Two separate decisions (P0-06):
    // (i) QUEUE writes in the durable outbox — purely local. On for a signed-in
    //     owner OR a still-unresolved role (with the engine flag on), so an
    //     offline start doesn't lose the owner's logging — though never, while
    //     unresolved, in a store that has served a partner session (Container).
    //     Off for a partner, no user, or legacy mode. Set first, independent of
    //     engine start state.
    container.setOwnerSyncMode(ownerOutboxMode(!!auth.user, auth.role));

    // (ii) Anything that leaves the device — owner engine, legacy pull/
    //     subscribe/push — waits until the role is POSITIVELY resolved. Until
    //     then the local store may hold someone else's rows (a partner's cache).
    const roleResolved = !auth.loading && auth.role !== null;
    const ownerEngine = roleResolved && isOwnerEngineSync(!!auth.user, auth.role);

    if (!auth.user || !roleResolved) return;

    // Owner path (M1.9): the SyncEngine owns push/pull/realtime — outbox,
    // HLC merge, tombstones. Partners stay on the legacy read-only pull until
    // the E2EE projection path replaces it (M2.9).
    if (ownerEngine) {
      let cancelled = false;
      let unsubStatus: (() => void) | null = null;
      const uid = auth.user.id;
      void (async () => {
        const started = await container.startOwnerSync(uid, supabase);
        if (cancelled) {
          // Cleanup already stopped/invalidated this startup. Stopping the
          // container here could stop a newer effect's engine after role/auth
          // resolution changed while startOwnerSync was awaiting its pull.
          return;
        }
        unsubStatus = started.onStatus(() => refreshAfterSync());
        refreshAfterSync();
      })();
      return () => {
        cancelled = true;
        unsubStatus?.();
        void container.stopOwnerSync();
      };
    }

    // A confirmed partner never pushes. Anything queued before the role resolved
    // is an edit to the owner's cached rows: drop it, so nothing can upload it
    // later (e.g. after an unlink). Queueing is already off (see (i)).
    if (auth.role === "partner") void container.clearOutbox().catch(console.error);

    // Legacy path (partner, or engine flag off). A partner reads ONLY its linked
    // owner — never its own id; a multi-link partner (no owner selected) syncs
    // nothing.
    const ownerId = auth.role === "owner" ? auth.user.id : auth.linkedOwnerId;
    if (!ownerId) return;
    initialSync(ownerId).then(() => refreshAfterSync()).catch(console.error);

    const channel = subscribeToLogs(ownerId, refreshAfterSync);
    channelRef.current = channel;

    return () => {
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [auth.user, auth.loading, auth.role, auth.linkedOwnerId, refresh, refreshAfterSync, container]);

  // ── Navigation ── The URL hash is the source of truth: nav links set it,
  // Back and Forward change it, and the view follows (#today is the default).
  // The landing gate follows it too: #welcome reopens the landing page, and an
  // app route leaves it (a same-route change, #welcome → #today, re-renders
  // only through this state).
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const follow = () => {
      setShowLanding(wantsLanding());
      setRoute(readRoute());
      document.documentElement.scrollTop = 0;
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  const navigate = (r: Route) => {
    window.location.hash = r;
  };

  // ── Derived state ──
  const phase = state.phase;
  const phaseData = PHASES[phase];

  // Overview symptom toggles persist to today's DailyLog via the single write
  // path (M1.3). Each tap is ONE atomic change of that symptom on the STORED
  // row (P0-N2): never the whole record rebuilt from the view, which may lag a
  // sync or hold an abandoned sheet draft. The toggle shows at once; the view
  // then follows the stored record — also on failure, with the reason shown
  // (P0-04).
  const toggleSymptom = async (s: string) => {
    const present = !activeLog.symptoms.includes(s);
    setSymptomError(null);
    setActiveLog((cur) => ({
      ...cur,
      symptoms: present
        ? cur.symptoms.includes(s) ? cur.symptoms : [...cur.symptoms, s]
        : cur.symptoms.filter((x) => x !== s),
    }));
    try {
      await setActiveSymptom(s, present);
    } catch (err) {
      console.error("Failed to save the symptom:", err);
      // The toggle has been undone on screen (useLogger went back to the
      // stored record), so say exactly that.
      setSymptomError("Couldn't save that symptom. It's back to what was saved — please try again.");
    }
  };
  const activeLogLoadMessage = activeLogLoadError ? LOAD_FAILED_MESSAGE : null;

  const handleCycleLengthOverrideChange = useCallback(
    async (value: number | null) => {
      setCycleLengthOverride(value);
      await container.setMeta("cycleLengthOverride", value);
      refresh();
    },
    [refresh]
  );

  const handleDayClick = useCallback((date: Date) => {
    setLogSheetDate(date);
  }, []);

  const handleToggleExcluded = useCallback(
    async (periodStart: string) => {
      const newSet = new Set(excludedStarts);
      if (newSet.has(periodStart)) {
        newSet.delete(periodStart);
      } else {
        newSet.add(periodStart);
      }
      await container.setMeta("excludedCycles", Array.from(newSet));
      refresh();
    },
    [excludedStarts, refresh]
  );

  // Today's "My period started today": the same merge-defined flow patch
  // QuickAddPeriod writes, through the single write path (M1.3). It rejects on
  // failure, and the Today screen says so.
  const todayKey = toDateKey(today);
  const todayFlow = logs.find((l) => l.date === todayKey)?.flow ?? "none";
  const handlePeriodStarted = useCallback(
    () => saveActiveLogs([{ date: todayKey, flow: "medium" }], { mode: "merge-defined" }),
    [saveActiveLogs, todayKey]
  );

  // ── Loading ──
  if (auth.loading || dataLoading || dataFor !== dataKey) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background font-sans">
        <div role="status" className="flex flex-col items-center gap-4">
          <RheaMark size={48} label="Rhea" className="size-12 motion-safe:animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // ── Landing ── never over an existing account's data or session, unless asked for (#welcome).
  if (showLanding && (window.location.hash === "#welcome" || (!auth.user && !hasData))) {
    const enter = (mode: "signin" | "signup") => {
      markWelcomed();
      setAuthMode(mode);
      setShowLanding(false);
      if (window.location.hash === "#welcome") {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    return (
      <Landing
        hosted={auth.isConfigured && !auth.user}
        onStart={() => enter("signup")}
        onSignIn={() => enter("signin")}
      />
    );
  }

  // ── Auth gate ──
  if (auth.isConfigured && !auth.user) {
    return <AuthScreen onSignUp={auth.signUp} onSignIn={auth.signIn} initialMode={authMode} />;
  }

  // ── Fail closed (P0-06) ── this store has served a partner session, so its
  // rows may be the owner's cache. Until the account is confirmed (as partner,
  // or as owner, which purges them first), show none of it — e.g. offline.
  if (auth.storeMarkedPartner && auth.role === null) {
    return <AccountUnconfirmed onRetry={auth.refreshRole} onSignOut={auth.signOut} />;
  }

  // ── Role selection (new user, no data, no partner link, hasn't chosen yet) ──
  if (
    auth.isConfigured &&
    auth.user &&
    !hasData &&
    !isPartner &&
    !auth.hasPartnerLinked &&
    roleChosenFor !== accountId
  ) {
    return (
      <RoleSelect
        onChooseOwner={() => setRoleChosenFor(accountId)}
        onPaired={() => {
          auth.refreshRole();
        }}
      />
    );
  }

  // ── Main app ──
  // A partner sees only the partner view (and Settings); the partner preview
  // is an owner's. Unknown routes fall back to Today.
  const view: Route = isPartner
    ? route === "settings"
      ? "settings"
      : "partner"
    : route === "partner" && !isOwner
      ? "today"
      : route;
  const navRoutes: Route[] = isPartner
    ? ["partner", "settings"]
    : isOwner
      ? ["today", "calendar", "insights", "partner", "settings"]
      : ["today", "calendar", "insights", "settings"];

  let screen: ReactNode;
  if (view === "settings") {
    screen = (
      <SettingsView
        onClose={() => navigate(isPartner ? "partner" : "today")}
        onDataChanged={refreshAfterSync}
        cycleLengthOverride={cycleLengthOverride}
        onCycleLengthOverrideChange={handleCycleLengthOverrideChange}
        onSourcesClick={() => setShowSources(true)}
        onPrivacyClick={() => setShowPrivacy(true)}
        userId={auth.user?.id}
        userEmail={auth.user?.email}
        role={auth.role}
        onSignOut={auth.user ? auth.signOut : undefined}
        onRoleChanged={auth.refreshRole}
      />
    );
  } else if (isPartner && auth.linkedOwnerId === null) {
    /* Partner linked to several owners: no owner is chosen, and PartnerView
       treats a null owner as local demo mode (the cache, ungated by share
       settings) — so show a notice instead. */
    screen = (
      <div role="status" className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl">Partner view</h1>
        <p className="mt-2 text-base text-muted-foreground">
          This account is linked to more than one person, so the partner view is unavailable. Ask
          them to unlink the extra link.
        </p>
      </div>
    );
  } else if (view === "partner") {
    /* A partner's own view of the linked owner, or an owner's preview of it. */
    screen = (
      <>
        {!isPartner && (
          <p className="mb-6 text-sm text-muted-foreground">
            A preview of the partner view, with your current sharing choices.
          </p>
        )}
        <PartnerView
          phaseData={phaseData}
          phase={phase}
          state={state}
          today={today}
          logs={logs}
          ownerId={isPartner ? auth.linkedOwnerId : auth.user?.id}
          currentUserId={auth.user?.id}
        />
      </>
    );
  } else if (!hasData) {
    screen = (
      <Onboarding
        onStartLogging={() => setLogSheetDate(today)}
        onImport={() => navigate("settings")}
        onQuickAdd={() => setShowQuickAdd(true)}
        hosted={auth.isConfigured}
      />
    );
  } else if (view === "calendar") {
    screen = (
      <>
        <h1 className="text-3xl">Calendar</h1>
        <div className="mt-6">
          <CalendarTab
            cycles={state.cycles}
            avgLength={state.avgCycleLength}
            avgPeriodLength={state.avgPeriodLength}
            today={today}
            logs={logs}
            onDayClick={handleDayClick}
            fertileWindow={state.fertileWindow}
          />
        </div>
      </>
    );
  } else if (view === "insights") {
    screen = (
      <InsightsTab
        phaseData={phaseData}
        cycles={state.cycles}
        avgLength={state.avgCycleLength}
        avgPeriodLength={state.avgPeriodLength}
        cycleDay={state.cycleDay}
        stdDev={state.stdDev}
        logs={logs}
        predictions={state.predictions}
        excludedStarts={excludedStarts}
        onToggleExcluded={handleToggleExcluded}
      />
    );
  } else {
    screen = (
      <OverviewTab
        phaseData={phaseData}
        state={state}
        symptoms={new Set(activeLog.symptoms)}
        toggleSymptom={toggleSymptom}
        symptomError={symptomError ?? activeLogLoadMessage}
        today={today}
        onLogToday={() => setLogSheetDate(today)}
        onAddPeriod={() => setShowQuickAdd(true)}
        onPeriodStarted={handlePeriodStarted}
        todayFlow={todayFlow}
      />
    );
  }

  return (
    // The shell carries the current phase: chips, tints and marks inside follow
    // it. Never for a partner: the cached cycle is the owner's, shown only as shared.
    <div
      data-phase={!isPartner && state.cycles.length > 0 ? phase : undefined}
      className="min-h-dvh bg-background font-sans text-foreground lg:pl-14"
    >
      <a
        href="#main-content"
        onClick={(e) => {
          // Focus without touching the hash, which is the route.
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <AppNav
        routes={navRoutes}
        current={view}
        account={
          auth.user?.email ? { email: auth.user.email, role: auth.role, onSignOut: auth.signOut } : undefined
        }
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16"
      >
        {screen}
      </main>

      {/* Modals — only log sheet and quick add for owners */}
      {logSheetDate && !isPartner && (
        <DailyLogSheet
          log={activeLog}
          setLog={setActiveLog}
          onSave={saveActiveLog}
          onClose={() => setLogSheetDate(null)}
          phaseData={phaseData}
          date={activeLogDate}
          onDelete={handleDeleteActiveLog}
          canDelete={activeLogExists}
          loadError={activeLogLoadMessage}
        />
      )}

      {showQuickAdd && !isPartner && (
        <QuickAddPeriod
          onClose={() => setShowQuickAdd(false)}
          saveLogs={saveActiveLogs}
          phaseData={phaseData}
        />
      )}

      {showSources && <SourcesView onClose={() => setShowSources(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

/**
 * P0-06: this device's store has served a partner session and the account's
 * role can't be checked (e.g. offline), so nothing from the store is shown.
 */
function AccountUnconfirmed({
  onRetry,
  onSignOut,
}: {
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const retry = async () => {
    setChecking(true);
    await onRetry();
    setChecking(false);
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 font-sans">
      <div role="status" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8">
        <h1 className="text-2xl">Can&apos;t confirm your account</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Rhea couldn&apos;t check this account with the server, so it isn&apos;t showing any cycle
          data yet. Check your connection and try again.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={retry} disabled={checking}>
            {checking ? "Checking…" : "Try again"}
          </Button>
          <Button variant="outline" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}

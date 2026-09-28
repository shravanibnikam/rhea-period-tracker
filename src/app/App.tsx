import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { DailyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";
import { useCycleData } from "@/app/hooks/useCycleData";
import { useAuth } from "@/app/hooks/useAuth";
import { useLogger, saveErrorMessage } from "@/app/hooks/useLogger";
import { initialSync, pushLog, subscribeToLogs, unsubscribe } from "@/app/lib/sync";
import { supabase } from "@/app/lib/supabase";
import { isOwnerEngineSync, ownerOutboxMode } from "@/app/lib/flags";
import { useContainer } from "@/app/di";
import { Header } from "@/app/components/layout/Header";
import { TabNav, type TabName } from "@/app/components/layout/TabNav";
import { PhaseHero } from "@/app/components/shared/PhaseHero";
import { OverviewTab } from "@/app/views/tracker/OverviewTab";
import { CalendarTab } from "@/app/views/tracker/CalendarTab";
import { HistoryTab } from "@/app/views/tracker/HistoryTab";
import { PredictionsTab } from "@/app/views/tracker/PredictionsTab";
import { PartnerView } from "@/app/views/partner/PartnerView";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { QuickAddPeriod } from "@/app/views/tracker/QuickAddPeriod";
import { Onboarding } from "@/app/views/tracker/Onboarding";
import { SettingsView } from "@/app/views/settings/SettingsView";
import { SourcesView } from "@/app/views/settings/SourcesView";
import { PrivacyPolicy } from "@/app/views/settings/PrivacyPolicy";
import { AuthScreen } from "@/app/views/auth/AuthScreen";
import { RoleSelect } from "@/app/views/auth/RoleSelect";

export default function App() {
  const [view, setView] = useState<"personal" | "partner">("personal");
  const [tab, setTab] = useState<TabName>("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [cycleLengthOverride, setCycleLengthOverride] = useState<number | null>(null);
  const [logSheetDate, setLogSheetDate] = useState<Date | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [roleChosen, setRoleChosen] = useState(false);
  const [symptomError, setSymptomError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

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
  // would keep showing the previous account's rows. The main UI waits until
  // that account's read has landed (see the loading gate).
  const accountId = auth.user?.id ?? null;
  const [dataAccount, setDataAccount] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void refresh().then(() => {
      if (current) setDataAccount(accountId);
    });
    return () => {
      current = false;
    };
  }, [accountId, refresh]);

  const activeLogDate = logSheetDate ?? today;
  const {
    log: activeLog,
    setLog: setActiveLog,
    save: saveActiveLog,
    saveMany: saveActiveLogs,
    remove: removeActiveLog,
    exists: activeLogExists,
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
    // Re-read the active day whenever the account changes (P0-N1): this hook
    // mounts before auth resolves, so its first read is the local-only store.
    // useAuth scopes the container before exposing the user, so accountId
    // always names the store the container reads at this render.
    accountId
  );

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
        unsubStatus = started.onStatus(() => refresh());
        refresh();
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
    initialSync(ownerId).then(() => refresh()).catch(console.error);

    const channel = subscribeToLogs(ownerId, refresh);
    channelRef.current = channel;

    return () => {
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [auth.user, auth.loading, auth.role, auth.linkedOwnerId, refresh, container]);

  // Partner should always see partner view
  useEffect(() => {
    if (isPartner) setView("partner");
  }, [isPartner]);

  // ── Derived state ──
  const phase = state.phase;
  const phaseData = PHASES[phase];

  // Overview symptom toggles persist to today's DailyLog via the single write
  // path (M1.3) — they were previously ephemeral React state that vanished on
  // reload and never synced. The toggle shows at once; if the save fails it is
  // reverted and the reason shown, never left on screen unsaved (P0-04).
  const toggleSymptom = async (s: string) => {
    const has = activeLog.symptoms.includes(s);
    const next = {
      ...activeLog,
      symptoms: has
        ? activeLog.symptoms.filter((x) => x !== s)
        : [...activeLog.symptoms, s],
    };
    setSymptomError(null);
    setActiveLog(next);
    try {
      await saveActiveLogs([next]);
    } catch (err) {
      console.error("Failed to save the symptom:", err);
      // Undo only this toggle (a concurrent one keeps its own outcome), and
      // only on the same day's log.
      setActiveLog((cur) =>
        cur.date !== next.date
          ? cur
          : {
              ...cur,
              symptoms: has
                ? cur.symptoms.includes(s) ? cur.symptoms : [...cur.symptoms, s]
                : cur.symptoms.filter((x) => x !== s),
            }
      );
      setSymptomError(saveErrorMessage(err));
    }
  };

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

  // ── Loading ──
  if (auth.loading || dataLoading || dataAccount !== accountId) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-center">
          <img src={`${import.meta.env.BASE_URL}rhea-mark.svg`} alt="Rhea" className="w-12 h-12 mx-auto mb-3" />
          <p className="font-serif text-2xl font-semibold text-foreground mb-2">Rhea</p>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Auth gate ──
  if (auth.isConfigured && !auth.user) {
    return <AuthScreen onSignUp={auth.signUp} onSignIn={auth.signIn} />;
  }

  // ── Role selection (new user, no data, no partner link, hasn't chosen yet) ──
  if (auth.isConfigured && auth.user && !hasData && !isPartner && !roleChosen) {
    return (
      <RoleSelect
        onChooseOwner={() => setRoleChosen(true)}
        onPaired={() => {
          auth.refreshRole();
        }}
      />
    );
  }

  // ── Should we show the My View / Partner toggle? ──
  // Partners: never (they only see partner view)
  // Owners: only when they have a partner linked
  const showViewToggle = isOwner;

  // ── Main app ──
  return (
    <div className="min-h-screen bg-background font-sans">
      <Header
        view={view}
        setView={setView}
        onSettingsClick={() => setShowSettings(true)}
        showToggle={showViewToggle}
        isPartner={isPartner}
        userEmail={auth.user?.email}
        userRole={auth.role}
        onSignOut={auth.user ? auth.signOut : undefined}
      />

      <main id="main-content" role="main" className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24">
        {isPartner && auth.linkedOwnerId === null ? (
          /* ── Partner linked to several owners: no owner is chosen, and
                PartnerView treats a null owner as local demo mode (the cache,
                ungated by share settings) — so show a notice instead. ── */
          <div
            role="status"
            className="rounded-3xl p-8 sm:p-10 border text-center bg-card border-border"
          >
            <p className="text-sm text-foreground">
              This account is linked to more than one person, so the partner
              view is unavailable. Ask them to unlink the extra link.
            </p>
          </div>
        ) : isPartner ? (
          /* ── Partner: only sees partner view ── */
          <PartnerView
            phaseData={phaseData}
            phase={phase}
            state={state}
            today={today}
            logs={logs}
            ownerId={auth.linkedOwnerId}
            currentUserId={auth.user?.id}
          />
        ) : view === "partner" ? (
          /* ── Owner previewing partner view ── */
          <PartnerView
            phaseData={phaseData}
            phase={phase}
            state={state}
            today={today}
            logs={logs}
            ownerId={auth.user?.id}
            currentUserId={auth.user?.id}
          />
        ) : !hasData ? (
          /* ── Owner: onboarding ── */
          <Onboarding
            onStartLogging={() => setLogSheetDate(today)}
            onImport={() => setShowSettings(true)}
            onQuickAdd={() => setShowQuickAdd(true)}
          />
        ) : (
          /* ── Owner: tracker ── */
          <>
            <PhaseHero
              phaseData={phaseData}
              phase={phase}
              cycleDay={state.cycleDay}
              avgLength={state.avgCycleLength}
              avgPeriodLength={state.avgPeriodLength}
              daysLeft={state.daysUntilPeriod}
              nextPeriod={state.nextPeriodDate ?? new Date()}
              isLate={state.isLate}
              confidence={state.confidence}
            />

            <TabNav tab={tab} setTab={setTab} />

            {tab === "overview" && (
              <OverviewTab
                phaseData={phaseData}
                state={state}
                symptoms={new Set(activeLog.symptoms)}
                toggleSymptom={toggleSymptom}
                symptomError={symptomError}
                today={today}
              />
            )}
            {tab === "calendar" && (
              <CalendarTab
                cycles={state.cycles}
                avgLength={state.avgCycleLength}
                avgPeriodLength={state.avgPeriodLength}
                today={today}
                logs={logs}
                onDayClick={handleDayClick}
                fertileWindow={state.fertileWindow}
              />
            )}
            {tab === "history" && (
              <HistoryTab
                phaseData={phaseData}
                avgLength={state.avgCycleLength}
                cycleDay={state.cycleDay}
                excludedStarts={excludedStarts}
                onToggleExcluded={handleToggleExcluded}
                stdDev={state.stdDev}
                logs={logs}
                cycles={state.cycles}
                avgPeriodLength={state.avgPeriodLength}
              />
            )}
            {tab === "predictions" && (
              <PredictionsTab
                predictions={state.predictions}
                avgLength={state.avgCycleLength}
                avgPeriodLength={state.avgPeriodLength}
              />
            )}

            {/* Floating action buttons (owner only) */}
            <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 flex flex-col gap-3 items-end">
              <button
                onClick={() => setShowQuickAdd(true)}
                aria-label="Add a past period"
                className="w-11 h-11 rounded-full shadow-md flex items-center justify-center text-sm transition-all hover:scale-105 active:scale-95 bg-card border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span className="text-base" aria-hidden="true">&#x1F4C5;</span>
              </button>
              <button
                onClick={() => setLogSheetDate(today)}
                aria-label="Log today"
                className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xl transition-all hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                style={{ backgroundColor: phaseData.color }}
              >
                <span aria-hidden="true">+</span>
              </button>
            </div>
          </>
        )}
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
        />
      )}

      {showQuickAdd && !isPartner && (
        <QuickAddPeriod
          onClose={() => setShowQuickAdd(false)}
          saveLogs={saveActiveLogs}
          phaseData={phaseData}
        />
      )}

      {showSettings && (
        <SettingsView
          onClose={() => setShowSettings(false)}
          onDataChanged={refresh}
          cycleLengthOverride={cycleLengthOverride}
          onCycleLengthOverrideChange={handleCycleLengthOverrideChange}
          onSourcesClick={() => {
            setShowSettings(false);
            setShowSources(true);
          }}
          onPrivacyClick={() => {
            setShowSettings(false);
            setShowPrivacy(true);
          }}
          userId={auth.user?.id}
          userEmail={auth.user?.email}
          role={auth.role}
          onSignOut={auth.user ? auth.signOut : undefined}
          onRoleChanged={auth.refreshRole}
        />
      )}

      {showSources && <SourcesView onClose={() => setShowSources(false)} />}
      {showPrivacy && <PrivacyPolicy onClose={() => setShowPrivacy(false)} />}
    </div>
  );
}

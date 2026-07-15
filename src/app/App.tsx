import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { DailyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";
import { useCycleData } from "@/app/hooks/useCycleData";
import { useAuth } from "@/app/hooks/useAuth";
import { useLogger } from "@/app/hooks/useLogger";
import { initialSync, pushLog, subscribeToLogs, unsubscribe } from "@/app/lib/sync";
import { supabase } from "@/app/lib/supabase";
import { flags } from "@/app/lib/flags";
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

  const activeLogDate = logSheetDate ?? today;
  const {
    log: activeLog,
    setLog: setActiveLog,
    save: saveActiveLog,
    saveMany: saveActiveLogs,
  } = useLogger(
    activeLogDate,
    // Single write path (M1.3): every save flows through here. The saved logs
    // are pushed by their own local date keys — the old UTC-based re-fetch
    // dropped or mis-keyed saves near midnight (see writePath.guard.spec).
    useCallback(
      async (saved: DailyLog[]) => {
        // With the sync engine active (M1.9), saveLog already enqueued +
        // flushed atomically; only the legacy path needs an explicit push.
        if (auth.user && !container.isSyncEngineActive()) {
          for (const l of saved) await pushLog(auth.user.id, l);
        }
        refresh();
      },
      [auth.user, refresh, container]
    )
  );

  // ── Sync ──
  useEffect(() => {
    if (!auth.user) return;

    // Owner path (M1.9): the SyncEngine owns push/pull/realtime — outbox,
    // HLC merge, tombstones. Partners stay on the legacy read-only pull until
    // the E2EE projection path replaces it (M2.9).
    if (flags.syncEngine && auth.role !== "partner") {
      let cancelled = false;
      let unsubStatus: (() => void) | null = null;
      const uid = auth.user.id;
      void (async () => {
        const started = await container.startOwnerSync(uid, supabase);
        if (cancelled) {
          await container.stopOwnerSync();
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

    // Legacy path (partner, or engine flag off).
    const ownerId = auth.linkedOwnerId ?? auth.user.id;
    initialSync(ownerId).then(() => refresh()).catch(console.error);

    const channel = subscribeToLogs(ownerId, refresh);
    channelRef.current = channel;

    return () => {
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [auth.user, auth.role, auth.linkedOwnerId, refresh, container]);

  // Partner should always see partner view
  useEffect(() => {
    if (isPartner) setView("partner");
  }, [isPartner]);

  // ── Derived state ──
  const phase = state.phase;
  const phaseData = PHASES[phase];

  // Overview symptom toggles persist to today's DailyLog via the single write
  // path (M1.3) — they were previously ephemeral React state that vanished on
  // reload and never synced.
  const toggleSymptom = (s: string) => {
    const has = activeLog.symptoms.includes(s);
    const next = {
      ...activeLog,
      symptoms: has
        ? activeLog.symptoms.filter((x) => x !== s)
        : [...activeLog.symptoms, s],
    };
    setActiveLog(next);
    void saveActiveLogs([next]);
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
  if (auth.loading || dataLoading) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-center">
          <img src="/rhea-mark.svg" alt="Rhea" className="w-12 h-12 mx-auto mb-3" />
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
        {isPartner ? (
          /* ── Partner: only sees partner view ── */
          <PartnerView
            phaseData={phaseData}
            phase={phase}
            state={state}
            today={today}
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

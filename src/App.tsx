import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { PHASES } from "@/lib/phases";
import { setMeta } from "@/lib/db";
import { useCycleData } from "@/hooks/useCycleData";
import { useAuth } from "@/hooks/useAuth";
import { useLogger } from "@/hooks/useLogger";
import { initialSync, pushLog, subscribeToLogs, unsubscribe } from "@/lib/sync";
import { Header } from "@/components/layout/Header";
import { TabNav, type TabName } from "@/components/layout/TabNav";
import { PhaseHero } from "@/components/shared/PhaseHero";
import { OverviewTab } from "@/views/tracker/OverviewTab";
import { CalendarTab } from "@/views/tracker/CalendarTab";
import { HistoryTab } from "@/views/tracker/HistoryTab";
import { PredictionsTab } from "@/views/tracker/PredictionsTab";
import { PartnerView } from "@/views/partner/PartnerView";
import { DailyLogSheet } from "@/views/tracker/DailyLogSheet";
import { QuickAddPeriod } from "@/views/tracker/QuickAddPeriod";
import { Onboarding } from "@/views/tracker/Onboarding";
import { SettingsView } from "@/views/settings/SettingsView";
import { SourcesView } from "@/views/settings/SourcesView";
import { AuthScreen } from "@/views/auth/AuthScreen";

export default function App() {
  const [view, setView] = useState<"personal" | "partner">("personal");
  const [tab, setTab] = useState<TabName>("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [cycleLengthOverride, setCycleLengthOverride] = useState<number | null>(null);
  const [logSheetDate, setLogSheetDate] = useState<Date | null>(null);
  const [showSources, setShowSources] = useState(false);

  const today = useMemo(() => new Date(), []);

  // ── Auth ──
  const auth = useAuth();
  const channelRef = useRef<ReturnType<typeof subscribeToLogs>>(null);

  // ── Data ──
  const { logs, state, loading: dataLoading, excludedStarts, refresh } = useCycleData();
  const hasData = logs.length > 0;

  const activeLogDate = logSheetDate ?? today;
  const {
    log: activeLog,
    setLog: setActiveLog,
    save: saveActiveLog,
  } = useLogger(activeLogDate, async () => {
    // After saving locally, push to Supabase if logged in
    if (auth.user) {
      const { getLog } = await import("@/lib/db");
      const saved = await getLog(activeLogDate.toISOString().slice(0, 10));
      if (saved) await pushLog(auth.user.id, saved);
    }
    refresh();
  });

  const [localSymptoms, setLocalSymptoms] = useState<Set<string>>(new Set());

  // ── Sync: run on login, subscribe to realtime ──
  useEffect(() => {
    if (!auth.user) return;

    const ownerId = auth.linkedOwnerId ?? auth.user.id;

    // Initial sync
    initialSync(ownerId).then(() => refresh());

    // Subscribe to realtime updates
    const channel = subscribeToLogs(ownerId, refresh);
    channelRef.current = channel;

    return () => {
      unsubscribe(channelRef.current);
      channelRef.current = null;
    };
  }, [auth.user, auth.linkedOwnerId, refresh]);

  // ── Derived state ──
  const phase = state.phase;
  const phaseData = PHASES[phase];

  const calendarData = useMemo(
    () =>
      state.cycles.map((c) => ({
        start: c.periodStart,
        length: c.cycleLength,
        flow: "medium" as const,
      })),
    [state.cycles]
  );

  const toggleSymptom = (s: string) => {
    setLocalSymptoms((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  };

  const handleCycleLengthOverrideChange = useCallback(
    async (value: number | null) => {
      setCycleLengthOverride(value);
      await setMeta("cycleLengthOverride", value);
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
      await setMeta("excludedCycles", Array.from(newSet));
      refresh();
    },
    [excludedStarts, refresh]
  );

  // ── Loading state ──
  if (auth.loading || dataLoading) {
    return (
      <div className="min-h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-center">
          <img src="/rhea-mark.svg" alt="Rhea" className="w-12 h-12 mx-auto mb-3" />
          <p className="font-serif text-2xl font-semibold text-foreground mb-2">
            Rhea
          </p>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Auth gate: show auth screen when Supabase is configured but user isn't logged in ──
  if (auth.isConfigured && !auth.user) {
    return <AuthScreen onSignUp={auth.signUp} onSignIn={auth.signIn} />;
  }

  // ── Main app ──
  return (
    <div className="min-h-screen bg-background font-sans">
      <Header
        view={view}
        setView={setView}
        onSettingsClick={() => setShowSettings(true)}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-24">
        {view === "personal" ? (
          !hasData ? (
            <Onboarding
              onStartLogging={() => setLogSheetDate(today)}
              onImport={() => setShowSettings(true)}
              onQuickAdd={() => setShowQuickAdd(true)}
            />
          ) : (
            <>
              <PhaseHero
                phaseData={phaseData}
                phase={phase}
                cycleDay={state.cycleDay}
                avgLength={state.avgCycleLength}
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
                  symptoms={localSymptoms}
                  toggleSymptom={toggleSymptom}
                  today={today}
                />
              )}
              {tab === "calendar" && (
                <CalendarTab
                  cycleData={calendarData}
                  avgLength={state.avgCycleLength}
                  today={today}
                  logs={logs}
                  onDayClick={handleDayClick}
                  fertileWindow={state.fertileWindow}
                />
              )}
              {tab === "history" && (
                <HistoryTab
                  phaseData={phaseData}
                  cycleData={calendarData}
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
                  phaseData={phaseData}
                  predictions={state.predictions}
                  avgLength={state.avgCycleLength}
                />
              )}

              <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 flex flex-col gap-3 items-end">
                <button
                  onClick={() => setShowQuickAdd(true)}
                  className="w-11 h-11 rounded-full shadow-md flex items-center justify-center text-sm transition-all hover:scale-105 active:scale-95 bg-card border border-border"
                  title="Add a past period"
                >
                  <span className="text-base">&#x1F4C5;</span>
                </button>
                <button
                  onClick={() => setLogSheetDate(today)}
                  className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-xl transition-all hover:scale-105 active:scale-95"
                  style={{ backgroundColor: phaseData.color }}
                  title="Log today"
                >
                  +
                </button>
              </div>
            </>
          )
        ) : (
          <PartnerView
            phaseData={phaseData}
            phase={phase}
            state={state}
            today={today}
          />
        )}
      </main>

      {logSheetDate && (
        <DailyLogSheet
          log={activeLog}
          setLog={setActiveLog}
          onSave={saveActiveLog}
          onClose={() => setLogSheetDate(null)}
          phaseData={phaseData}
          date={activeLogDate}
        />
      )}

      {showQuickAdd && (
        <QuickAddPeriod
          onClose={() => setShowQuickAdd(false)}
          onSaved={refresh}
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
          userId={auth.user?.id}
          userEmail={auth.user?.email}
          role={auth.role}
          onSignOut={auth.user ? auth.signOut : undefined}
          onRoleChanged={() => {
            // Re-detect role after pairing/unpairing
            window.location.reload();
          }}
        />
      )}

      {showSources && (
        <SourcesView onClose={() => setShowSources(false)} />
      )}
    </div>
  );
}

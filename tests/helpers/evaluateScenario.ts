import { deriveCycleState, analyzeSymptomPatterns, getVariabilityLabel } from "@/domain/cycle";
import { parseDate } from "@/domain/dates";
import { anchorsFrom, getPhaseBoundaries, getPhaseLengths } from "@/domain/phases";
import type { DomainScenario } from "../fixtures/scenarios";

/**
 * Everything the domain derives for one scenario, through the same entry
 * points the characterization spec exercises, wired the way the app wires
 * them: useCycleData (deriveCycleState), HistoryTab (analyzeSymptomPatterns,
 * getVariabilityLabel) and the phase bar / predictions tab (anchorsFrom with
 * the state's averages). `today` is local midnight of the scenario's day, in
 * the zone this runs in.
 */
export function evaluateScenario(s: DomainScenario) {
  const state = deriveCycleState(s.logs, s.cycleLengthOverride, parseDate(s.today));
  const anchors = anchorsFrom(state.avgCycleLength, state.avgPeriodLength);
  return {
    state,
    phaseBoundaries: getPhaseBoundaries(anchors),
    phaseLengths: getPhaseLengths(anchors),
    variabilityLabel: getVariabilityLabel(state.stdDev),
    symptomPatterns: analyzeSymptomPatterns(
      s.logs,
      state.cycles,
      state.avgCycleLength,
      state.avgPeriodLength,
    ),
  };
}

export type ScenarioEvaluation = ReturnType<typeof evaluateScenario>;

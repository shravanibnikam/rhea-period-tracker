// Entry point of one zone-sweep child process (see ./zoneSweep.ts). It is
// bundled and run by plain Node with TZ set in its environment before the
// process starts, so every Date here (fixtures included) is built in that
// zone. It writes one payload line to stdout. Not a spec: never import it.
import { DOMAIN_SCENARIOS } from "../fixtures/scenarios";
import {
  TRANSLATION_SHIFTS,
  ZONE_SWEEP_MARKER,
  measureOffsets,
  projectScenario,
  shiftScenario,
  type ScenarioSweep,
  type ZoneSweepPayload,
} from "./invariance";

const before = measureOffsets();
const scenarios: Record<string, ScenarioSweep> = {};
for (const s of DOMAIN_SCENARIOS) {
  const shifted: Record<string, ReturnType<typeof projectScenario>> = {};
  for (const k of TRANSLATION_SHIFTS) shifted[String(k)] = projectScenario(shiftScenario(s, k));
  scenarios[s.id] = { base: projectScenario(s), shifted };
}
const payload: ZoneSweepPayload = {
  tz: process.env.TZ ?? null,
  offsets: { before, after: measureOffsets() },
  scenarios,
};
process.stdout.write(`${ZONE_SWEEP_MARKER}${JSON.stringify(payload)}\n`);

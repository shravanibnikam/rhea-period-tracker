/**
 * Import fixtures (M1.7 / RHEA-045). Each fixture reproduces one of the
 * review-documented parser bugs — failing before the data/importer rewrite,
 * passing after.
 */

/** RFC-4180: escaped quotes ("") and a newline INSIDE a quoted field. */
export const CSV_ESCAPED_QUOTES = [
  "date,flow,notes",
  '2026-01-01,medium,"she said ""ouch"", then rested"',
  '2026-01-02,light,"line one\nline two"',
].join("\n");

/** EU day-first slash dates: 25/03/2026 must parse as March 25th, not fail. */
export const CSV_EU_DATES = [
  "date,flow",
  "25/03/2026,medium",
  "26/03/2026,light",
  "01/04/2026,spotting",
].join("\n");

/** Ambiguous slash dates (all components ≤ 12) default to US month-first. */
export const CSV_US_DATES = ["date,flow", "03/04/2026,medium"].join("\n");

/** No flow column: rows must import WITHOUT fabricated flow data. */
export const CSV_NO_FLOW = [
  "date,mood,notes",
  "2026-02-01,Happy,slept well",
  "2026-02-02,Calm,",
].join("\n");

/** Real Apple Health exports nest children — Record tags are NOT self-closing. */
export const APPLE_HEALTH_NESTED = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
 <Record type="HKCategoryTypeIdentifierMenstrualFlow" sourceName="Cycle" value="HKCategoryValueMenstrualFlowHeavy" startDate="2026-01-05 08:00:00 -0500" endDate="2026-01-05 08:00:00 -0500">
  <MetadataEntry key="HKMenstrualCycleStart" value="1"/>
 </Record>
 <Record type="HKCategoryTypeIdentifierMenstrualFlow" sourceName="Cycle" value="HKCategoryValueMenstrualFlowLight" startDate="2026-01-06 08:00:00 -0500" endDate="2026-01-06 08:00:00 -0500">
  <MetadataEntry key="HKMenstrualCycleStart" value="0"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" value="8000" startDate="2026-01-06 08:00:00 -0500" endDate="2026-01-06 08:00:00 -0500"/>
</HealthData>`;

/** A legacy version-1 Rhea backup (pre-M1.7 format). */
export const RHEA_BACKUP_V1 = JSON.stringify({
  version: 1,
  exportedAt: "2026-01-15T10:00:00.000Z",
  logs: [
    {
      date: "2026-01-01",
      flow: "medium",
      symptoms: ["Cramps"],
      mood: "Calm",
      energy: "low",
      notes: "v1 note",
    },
  ],
  meta: { cycleLengthOverride: 29 },
});

/** A backup from a hypothetical future version — must be rejected clearly. */
export const RHEA_BACKUP_V3 = JSON.stringify({
  version: 3,
  exportedAt: "2027-01-01T00:00:00.000Z",
  logs: [],
  meta: {},
});

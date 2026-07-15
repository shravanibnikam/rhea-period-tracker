# ADR-0001: Record architecture decisions

**Status:** Accepted · **Date:** 2026-07-15 (session S3, start of Phase 2)

## Context
Rhea v2 is a long-running, multi-session rewrite guided by living documents
(`RHEA_V2_TECHNICAL_SPEC.md`, `V2_IMPLEMENTATION_PLAN.md`, `V2_TASKS.md`,
`ARCHITECTURE_CRITIQUE.md`, `RISK_REGISTER.md`). Decision *narrative* lives in
`IMPLEMENTATION_JOURNAL.md`, but that file is chronological and grows without
bound — it is poor at answering "why is X the way it is?" months later.

## Problem
Significant, long-lived architectural decisions (especially cryptographic ones,
where the project rule is *no custom crypto, audited libraries only, document
trade-offs before implementation*) need a durable, discoverable record separate
from the day-by-day journal.

## Decision
Maintain Architecture Decision Records under `docs/adr/`, numbered
sequentially (`NNNN-slug.md`). Each ADR records: Context, Problem, Decision,
Alternatives considered, Trade-offs, Consequences, Future considerations.
ADRs are written **before** implementing the decision they cover (mandatory for
cryptographic choices). Superseded ADRs are never deleted; their status changes
to `Superseded by ADR-NNNN`.

## Alternatives considered
- **Journal only** — rejected: chronological, unbounded, hard to search for
  "current truth".
- **Decisions inline in the spec** — rejected: the spec states *what is*, not
  *why alternatives lost*; mixing both bloats an already-large document.

## Trade-offs
Slight duplication with the journal (the journal entry links to the ADR; the
ADR holds the reasoning depth).

## Consequences
ADR-0002…0004 backfill the three foundational Phase-1 decisions so the log is
complete; from Phase 2 onward every significant decision gets an ADR at
decision time.

## Future considerations
If the ADR count grows large, add an index table here.

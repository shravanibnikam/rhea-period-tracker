# ADR-0003: Hybrid Logical Clocks + per-key LWW with tombstones as the sync model

**Status:** Accepted (backfill of Phase 1, M1.5–M1.8) · **Date:** 2026-07-15

## Context
Rhea is local-first: every device holds the full plaintext store and the server
is (after Phase 2) a zero-knowledge mailbox. Multi-device owners and an
eventually-consistent relay require deterministic conflict resolution without
a trusted server clock.

## Problem
v1 "sync" pulled server rows and overwrote local state (data loss under
concurrent edits, no deletes propagation, wall-clock skew decided winners).

## Decision
- **HLC** `"<pt 12-hex>:<c 4-hex>:<deviceId>"` — lexicographic order equals
  causal order; skew clamped to 24 h; epoch-0 sentinel
  `000000000000:0000:<deviceId>` backfills pre-v2 rows so they never win.
- **LWW per `SyncRecord.key`** with deviceId tiebreak, echo suppression,
  tombstone competition/rebirth rules, and idempotent replay
  (`src/domain/merge.ts`, pure).
- **Deletes are tombstones**, GC'd only after a safety horizon (M2.13 server
  cleanup).
- Durable **outbox** with coalescing + leases + backoff pushes; cursor-driven
  keyset pulls; realtime is only a wake-up hint.

## Alternatives considered
- **Full CRDT (e.g. Automerge/Yjs) per log** — rejected: DailyLog is a small
  record updated whole; field-level CRDTs add large deps and merge semantics
  users can't predict. LWW-per-record matches the mental model.
- **Server-authoritative timestamps** — rejected: server must stay untrusted;
  also breaks offline-first writes.
- **Operational transform / event sourcing** — rejected: massive complexity
  for a single-user-editable dataset.

## Trade-offs
Concurrent same-key edits lose one side (acceptable: the owner edits their own
day; true concurrency is rare and bounded to one day's record). 24 h drift
clamp means a device with a wildly wrong clock defers to observed HLCs.

## Consequences
Merge is a pure function with property tests (seeded PRNG, convergence,
commutativity on distinct keys). The same merge path serves initial seed,
realtime pulls, and full resync. E2EE (Phase 2) wraps payloads without
touching merge logic because `updatedAt`/`deviceId`/`deleted` stay plaintext
envelope metadata bound by AAD.

## Future considerations
Field-level merge for `notes` vs symptoms could be added later behind the same
`decideMerge` seam if concurrent-edit loss shows up in practice.

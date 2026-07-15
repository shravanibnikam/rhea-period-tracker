# ADR-0004: StorageDriver seam + eight-store IndexedDB v2 schema

**Status:** Accepted (backfill of Phase 1, M1.4–M1.5) · **Date:** 2026-07-15

## Context
v1 talked to IndexedDB directly through `idb` calls scattered in `src/lib/db.ts`.
Phase 3 requires SQLCipher on Capacitor; tests need an in-memory store; Phase 2
needs new stores (keyring, outbox, tombstones, projections, audit).

## Problem
Persistence had no contract: no atomic multi-store transactions, no
versioned migration story, no way to swap engines.

## Decision
`StorageDriver` interface (spec Ch6 §1 / §0.10 A): primitive
`get/getAll/put/delete/clear/count`, `getByIndexSince` keyset paging,
multi-store atomic `transaction`, `close/destroy`, blocked/blocking/
versionchange observers. Implementations: `IndexedDbDriver` (web, `idb`),
`MemoryDriver` (tests), `SqliteDriver` (Phase 3). Schema v2 = eight logical
stores (`logs, meta, outbox, keyring, projections, tombstones, sync_cursors,
audit`) created by an additive, idempotent v1→v2 migration that backfills
epoch-0 HLC stamps.

## Alternatives considered
- **Keep raw `idb` + helper functions** — rejected: cannot swap to SQLite,
  untestable without fake-indexeddb everywhere.
- **An ORM/abstraction dependency (Dexie, RxDB)** — rejected: heavy, opinions
  about sync conflict with our HLC/LWW model; RxDB licensing.

## Trade-offs
A second seam to maintain; `idb` generic-mode transactions needed non-null
assertions on `put/delete` (typing limitation, documented in code).

## Consequences
Repositories (`LogRepository`, `MetaRepository`) run identically on
IndexedDB and Memory; migration tests run against fake-indexeddb; outbox
enqueue is atomic with the log write (same transaction), eliminating the
Phase-0 "saved but never synced" class of bugs.

## Future considerations
`SqliteDriver` (Phase 3) implements the same contract over
@capacitor-community/sqlite with SQLCipher; the driver contract test suite
(`tests/unit/data/driver.contract.spec.ts`) runs against every new driver.

# ADR-0002: Layered architecture with lint-enforced import boundaries

**Status:** Accepted (backfill of Phase 1, M1.1–M1.10) · **Date:** 2026-07-15

## Context
v1 concentrated all logic in `src/lib/` — a grab-bag where UI, IndexedDB,
Supabase, cycle math, and sharing logic imported each other freely. The v2
proposal, critique, and spec (Ch. 2–3) all demanded strict layering so the
domain stays pure, storage/transport are swappable seams, and E2EE can be
added without touching UI code.

## Problem
Layering that exists only by convention decays. The codebase needed a
structure a linter can defend.

## Decision
Five (growing to eight) top-level layers with `import/no-restricted-paths`
zones in `eslint.config.js`:
`kernel/` (zero-dep leaf) ← `domain/` (pure) ← `data/` (StorageDriver seam)
← `sync/` (Transport seam) ← `app/` (React; reaches inward only via
`app/di/Container` + hooks). Phase 2 adds `crypto/` (kernel + libsodium only),
`privacy/`, and `platform/` per spec Ch3 §3.1. The composition root
(`app/di/Container.ts`) is the only place concrete adapters are named.

## Alternatives considered
- **Package-per-layer (pnpm workspaces)** — cleanest enforcement, rejected for
  now: heavy for a single-app repo; ESLint zones give the same guarantee.
- **Convention only** — rejected: that is exactly how `src/lib/` happened.

## Trade-offs
Some ceremony (index barrels, DI wiring); occasional type-only re-exports so a
layer can expose contracts without leaking implementations.

## Consequences
200-test suite runs the domain in Node with no browser APIs; storage and
transport are already swappable (Memory driver, Null transport); Phase 2 can
slot `crypto/` in as a leaf without cycles. Boundary violations fail CI.

## Future considerations
If the repo splits into packages later, zones translate 1:1 to package
boundaries.

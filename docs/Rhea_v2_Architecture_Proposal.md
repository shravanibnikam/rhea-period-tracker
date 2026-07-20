# Rhea v2 Architecture Proposal

> 🧊 **Planning artifact — implementation status frozen at the 2026-07-15 planning state.** The v2 branch has since merged to `main` and deployed; for current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Migration numbers `0004`+ here predate the shipped `0004` pairing fix — the E2EE sequence has shifted to `0005`+.

> **Addendum (2026-07-15, app v0.2.0).** This proposal's phase numbering is
> superseded by the M0–M4 milestones in `RHEA_V2_TECHNICAL_SPEC.md`. The
> sync-engine/transport/conflict layer proposed here as future work shipped in
> the real Phase 1 (`src/sync`, `src/domain/hlc.ts`, `src/domain/merge.ts`,
> outbox, tombstones), and record versioning/migrations shipped (DB_VERSION=2).
> Raw plaintext partner sync STILL EXISTS (`src/app/lib/sync.ts`) and is removed
> in the real Phase 2 (M2.9/M2.13). The Privacy Engine, projections, and E2EE
> are Phase-2 work now starting. See `docs/IMPLEMENTATION_STATUS.md`.

> This document captures proposed architectural changes after reviewing
> the current repository. It is intended as a design document for future
> implementation rather than a description of the current codebase.

------------------------------------------------------------------------

# Vision

Rhea should become a **privacy-first, local-first** period tracker.

Core principles:

-   All health data belongs to the user.
-   Everything works offline.
-   Local storage is the source of truth.
-   Cloud storage is optional.
-   Partner sharing is opt-in.
-   Shared information is end-to-end encrypted.
-   The server (if one exists) should never be able to read health data.

------------------------------------------------------------------------

# Current Strengths

The existing architecture already has a solid foundation:

-   Local-first IndexedDB storage.
-   Derived cycle engine.
-   Offline support.
-   Separation between UI, domain logic, and persistence.
-   Small and understandable codebase.

Keep these ideas.

------------------------------------------------------------------------

# Biggest Architectural Problem

The current implementation synchronizes raw DailyLog entries to
partners.

Instead:

DailyLog → Cycle Engine → Privacy Engine → Partner Projection → Encrypt
→ Sync

Partners should never receive raw logs.

------------------------------------------------------------------------

# Core Data Model

## Private Data (never leaves the owner's device)

-   Symptoms
-   Notes
-   Bleeding intensity
-   Mood
-   Energy
-   Medication
-   Sexual activity
-   Any future sensitive health data

## Derived Data

Never persist these.

Always compute from DailyLog:

-   Current phase
-   Predicted period
-   Fertile window
-   Cycle averages
-   Statistics
-   Trends
-   Confidence

## Shared Data

A filtered projection generated from the private data.

Example:

-   Current phase
-   Estimated next period
-   Fertility window (optional)
-   Pregnancy mode (optional)
-   Shared notes

Never include raw health logs unless the user explicitly enables them.

------------------------------------------------------------------------

# Proposed Privacy Engine

Introduce a dedicated privacy layer.

Daily Logs → Privacy Engine ├── Owner View ├── Partner View ├── Doctor
Export ├── Backup Export └── Research Export (future)

Every consumer receives only the information it requires.

------------------------------------------------------------------------

# Sync Architecture

Separate synchronization from transport.

Sync Engine → Transport Layer

Possible transports:

-   Bluetooth
-   LAN
-   WebRTC
-   Nearby devices
-   QR bootstrap
-   Optional encrypted relay
-   Future iCloud
-   Future Google Drive

The Sync Engine should only know how to send encrypted payloads.

------------------------------------------------------------------------

# End-to-End Encryption

Requirements:

-   Keys generated on-device.
-   Private keys never leave the device.
-   Hardware-backed storage where available.
-   Encrypt partner projections before transmission.
-   Server never has plaintext.

Do not implement custom cryptography.

Use audited libraries and standard protocols.

------------------------------------------------------------------------

# Partner Pairing

Replace invite-code-only pairing with:

-   QR code
-   Public key exchange
-   Device verification
-   Shared encryption keys

Invite codes may remain as a discovery mechanism.

------------------------------------------------------------------------

# Local Database

Future improvements:

-   Scope data by account.
-   Clear local cache on sign-out.
-   Support multiple accounts.
-   Encrypt local database.
-   Version records.

------------------------------------------------------------------------

# Conflict Resolution

Introduce:

-   Record version
-   Last modified timestamp
-   Device ID
-   Deterministic merge rules
-   Offline outbox
-   Retry queue
-   Delete propagation

------------------------------------------------------------------------

# Mobile Roadmap

Short term:

1.  Keep React web app.
2.  Wrap using Capacitor.
3.  Release Android.
4.  Add notifications.
5.  Add biometric lock.
6.  Add encrypted local database.

Later:

-   iOS
-   Apple Health
-   Android Health Connect
-   Widgets
-   Wearables

------------------------------------------------------------------------

# Security Improvements

-   End-to-end encryption
-   Biometric unlock
-   Secure key storage
-   App lock
-   Optional screenshot protection
-   Secure export
-   Encrypted backups

------------------------------------------------------------------------

# Product Philosophy

The primary differentiator should be privacy.

Suggested positioning:

"Your cycle. Your device. Your data."

The application should prioritize user trust over collecting analytics
or storing health information remotely.

------------------------------------------------------------------------

# Implementation Order

## Phase 1

-   Fix current privacy issues.
-   Remove raw partner log synchronization.
-   Introduce Partner Projection.

## Phase 2

-   Build Privacy Engine.
-   Build Sync Engine abstraction.
-   Add encrypted transport.

## Phase 3

-   Mobile apps (Capacitor).
-   Native integrations.
-   Notifications.

## Phase 4

-   Advanced sharing.
-   Doctor exports.
-   Optional relay service.
-   Multi-device synchronization.

------------------------------------------------------------------------

# Guidance for Codex

When implementing changes:

-   Preserve local-first architecture.
-   Keep DailyLog as the single source of truth.
-   Do not persist derived predictions.
-   Build reusable domain services.
-   Separate UI, privacy, synchronization, and transport.
-   Avoid framework-specific business logic.
-   Design interfaces so multiple transport implementations can coexist.

Do not prioritize new features until the privacy architecture is
complete.

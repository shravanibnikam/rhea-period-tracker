# Rhea execution plan

Updated 2026-09-15 from the owner's project orientation and final engineering
brief. This is the active work order; July's v2 planning documents remain design
history. Existing contracts and ESLint boundaries still apply.

## Sequence

1. **Credibility:** isolate transport configuration in tests; execute pgTAP in
   CI against a fresh local Supabase; verify UI delete propagation; MIT license,
   changelog, and a tagged release after the phase's acceptance gates pass.
2. **Hosting:** GitHub Pages project site, base-aware assets and SPA fallback;
   daily Supabase keep-alive; validate auth redirects before retiring the former host.
   Migration `0005` already seeds partner share keys, so keep-alive must use
   `0006` or the next available number. Never rewrite applied migrations.
3. **On-device ML:** separate `rhea-cycle-model` Python repository; verify public
   dataset license and provenance before training; gradient boosting first;
   user-separated evaluation against trailing mean, median, and Rhea's domain
   implementation; MAE/RMSE, uncertainty calibration, regularity/cold-start
   breakdowns, model card and reproducible plots. Export ONNX with parity and
   shared feature fixtures, then add an enforced `src/ml` layer, offline runtime,
   visible uncertainty and rule-based fallback. Publish model/Space artifacts
   only when backed by real evaluation.
4. **Owner E2EE:** use existing libsodium primitives and document the scoped
   password-derived key design in an ADR before implementation. Test migration
   from plaintext. Partner data remains a separately disclosed plaintext path.
5. **Presentation:** demo media, architecture and evaluation links, badges,
   accurate security copy, and a 1,200–1,500 word technical post.

No mobile apps, backend migration, telemetry, WebRTC implementation, key rotation,
partner re-keying, or multi-device key transfer in this round. WebRTC is an ADR
only. Predictions are informational and must explicitly disclaim contraception
and conception planning near the output. Unverified dataset licensing blocks
training; synthetic data must never masquerade as real evaluation.

## Phase 1 release gates

- [x] Clean baseline recorded: 305 Vitest tests, lint and build pass.
- [x] Configured-environment transport failure reproduced and fixed.
- [x] All five existing migrations applied to a disposable local stack.
- [x] Three pgTAP suites executed; CI job added.
- [x] Browser tests for local-only logging and owner save/delete/second-device pull.
- [x] Sync startup race found by browser test fixed, with regression coverage.
- [x] MIT license and unreleased changelog added.
- [x] GitHub CI green on [PR #4](https://github.com/shravanibnikam/rhea-period-tracker/pull/4):
  [implementation run](https://github.com/shravanibnikam/rhea-period-tracker/actions/runs/34944259746) for `405e1cd`.
- [x] Production UI delete verification with dedicated synthetic accounts (2026-09-15).
- [x] Phase 1 merged as `bf76c4b`; CI passed on the merge commit.
- [x] [Release v0.2.0](https://github.com/shravanibnikam/rhea-period-tracker/releases/tag/v0.2.0) tagged at Phase 1 commit `bf76c4b`.

## Phase 2 cutover gates

- [x] Pages build, base-aware assets, real 404 shell and generated offline worker.
- [x] Local Pages browser checks: deep link and offline fresh-tab persistence.
- [x] Keep-alive workflow and migration 0006; 37 SQL assertions pass locally.
- [x] Public build variables and Pages Actions source configured in GitHub.
- [x] Owner reviewed/approved migration 0006; applied to production with history entry.
- [x] Pages deployed at `995a87d`; sign-in and generated signup-confirmation callback verified. Email delivery itself remains untested.
- [x] Production delete, two-session reload, isolation and pairing/unlink passed on the former host and Pages.
- [x] Owner confirmed JSON import and checked dates/entries before retirement.
- [x] Production keep-alive manual dispatch passed; daily schedule enabled.
- [ ] Observe first scheduled run (manual dispatch is not scheduled-run evidence).
- [x] Deleted the former hosting project after confirmed transfer; removed its Auth redirect and updated the homepage.

See [HOSTING.md](HOSTING.md) for the cutover and rollback procedure.

Use one branch and one PR per phase, conventional commits, and update
IMPLEMENTATION_STATUS.md with evidence. Never commit credentials or real user
data. Local browser tests use public signup on a disposable stack; they do not
prove production configuration or deployment behavior.

## Phase 3 dataset gate

Local `../rhea-cycle-model/docs/DATASET_REVIEW.md` records the original sources
checked. No dataset is accepted yet: Marquette lacks an explicit permissive
license on its landing page; Utah is noncommercial; mcPHASES is restricted;
Natural Cycles requires permission. No data downloaded or model trained. The
brief requires resolving this gate before training or moving to owner E2EE.

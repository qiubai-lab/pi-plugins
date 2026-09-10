---
id: QB-20260910-extract-pi-trace
type: design
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Extract PI Trace Plan

Spec: `docs/qb-spec/specs/QB-20260910-extract-pi-trace.md`

Spec quality review: **PASS WITH NOTES**. Package ownership, compatibility, source cleanup, legacy CLI link recovery and two-repository acceptance are closed. The target macOS claim continues to rely on POSIX portability plus the existing residual release-smoke note because the current host is Linux.

## Boundary Decision

- `pi-trace` owns the entire Trace capability and all runtime dependencies; `pi-plugins` has no forwarding adapter or dependency.
- The target uses the existing capability-local separation rather than introducing a workspace or generic shared layer.
- The Pi extension and CLI are adapters over owned modules; SQLite remains the sole writer model and the future Server reads through `query.ts`.
- Historical qb-spec archives remain in the repository where the original implementation was delivered; this migration change records the cross-repository ownership transfer.

## Tasks

- **TASK-001 ✅ [REQ-001, REQ-004, REQ-009; AC-001, AC-006]:** Establish the target TypeScript Pi package baseline, manifest, test/typecheck entrypoints, Node `.gitignore`, executable layout and stable module ownership documents.
- **TASK-002 ✅ [depends: TASK-001] [REQ-002, REQ-003, REQ-004; AC-001, AC-002]:** Copy the implementation and focused tests into the target without changing public commands, paths, schema, payload policy or fail-open behavior; adapt only repository-relative paths and package identity.
- **TASK-003 ✅ [depends: TASK-002] [REQ-005; AC-003]:** Update the target CLI installer and tests to own the new executable, idempotently retain its own link, narrowly repoint the exact legacy source link and reject every unrelated target.
- **TASK-004 ✅ [depends: TASK-001, TASK-002, TASK-003] [REQ-006; AC-004]:** Replace the placeholder target README with standalone installation, migration order, operations, security, development and rollback documentation.
- **TASK-005 ✅ [depends: TASK-002, TASK-003, TASK-004] [REQ-007, REQ-008; AC-005]:** Remove active Trace implementation, CLI, installer, manifest declarations and current-facing ownership documentation from `pi-plugins` while preserving archived history and unrelated package behavior.
- **TASK-006 ✅ [depends: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005] [REQ-002, REQ-003, REQ-008, REQ-009, REQ-010; AC-002, AC-003, AC-005, AC-006, AC-007]:** Run target focused/full checks, source regression checks, shell/CLI/Pi smoke checks, static ownership searches and final two-repository status/diff inspection; record evidence without committing either repository.

## Verification

- **VER-001 [AC-001]:** Target-only Pi discovery and installed CLI resolution smoke checks prove no runtime dependency on the source package.
- **VER-002 [AC-002]:** Target focused suite plus an existing schema-1 config/database fixture cover preserved recording and storage contracts.
- **VER-003 [AC-003]:** Installer integration matrix covers fresh, repeated, foreign and exact legacy-link targets; CLI command/exit behavior is rechecked after installation.
- **VER-004 [AC-004]:** Target documentation review/search covers every required operator and migration topic.
- **VER-005 [AC-005]:** Source static search excluding archives plus complete source test/typecheck proves active ownership removal and unrelated behavior preservation.
- **VER-006 [AC-006]:** Independently run each repository's declared test/typecheck and applicable shell, CLI and Pi discovery checks with nonzero failure propagation.
- **VER-007 [AC-007]:** Compare pre/post HEAD values and final Git status/diffs; inspect ignored/generated artifacts and confirm no migration commit or history operation occurred.

## Rollback

Restore the source repository's removed files and declarations from its existing history, remove the target package from Pi settings, and reinstall the source-owned CLI link if needed. Do not delete or migrate `~/.pi/agent/qb-trace`; schema 1 remains valid for either implementation. Target working-tree files can be removed independently because no Git history rewrite or commit is part of this task.

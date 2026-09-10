---
id: QB-20260910-extract-pi-trace
type: design
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Extract QB Trace into an independent repository

## Goal

Move the complete QB Trace product boundary from `/root/projects/pi-plugins` into the existing clean repository `/root/projects/pi-trace`, so Trace is installed, versioned, tested and evolved independently while preserving its current recording, CLI, SQLite and data-compatibility contracts.

## Foundation Decision

- `/root/projects/pi-trace` becomes a small TypeScript Pi package and CLI repository named `@qiubai-lab/pi-trace`, version `0.1.0`, with `private: true` and Node.js `>=22.19.0`.
- The repository owns one product capability: Pi execution tracing. Pi adaptation, CLI adaptation, deterministic event/config/collector rules, SQLite persistence, diagnostics and the future read-only Server boundary remain separate modules within that capability.
- Runtime entrypoints are the Pi extension and `qb-trace` executable; `npm test` and `npm run typecheck` are canonical non-interactive checks.
- Tests remain colocated with the owned modules. No workspace, second package, generated build output or publishing workflow is introduced.
- The source repository keeps historical archived qb-spec evidence but no active Trace implementation, package entrypoint, CLI or operator documentation.

## Scope

### In scope

- Copy the complete current QB Trace implementation, tests, CLI and installation script into `/root/projects/pi-trace` using a standalone package layout.
- Create the target package manifest, TypeScript/test configuration, focused README, Node-oriented `.gitignore`, engineering context and Directory Map needed for independent maintenance.
- Preserve `qb-trace on/off/status/server`, the global configuration and database locations, SQLite schema, event envelope, full-capture policy, fail-open semantics and Linux/macOS CLI scope.
- Make the target installer safely replace the exact legacy symlink previously installed from `pi-plugins` while continuing to reject unrelated targets.
- Remove Trace runtime files and current-facing documentation/configuration from `pi-plugins`.
- Verify both repositories independently and document the user migration order.

### Out of scope

- No Web/HTTP Server implementation, retention, redaction, schema change, data copy or behavioral enhancement.
- No npm publication, release automation, workspace, package split or Git history rewrite.
- No deletion or rewriting of `pi-plugins` archived qb-spec records.
- No automatic modification of user Pi package settings or deletion of local Trace data.
- No Agent entry initialization in the target repository; the user requested repository migration, not root Agent routing changes.

## Requirements

- **REQ-001:** `/root/projects/pi-trace` shall be an independently installable Pi package named `@qiubai-lab/pi-trace` at version `0.1.0`, private, requiring Node.js 22.19 or newer and declaring only its own QB Trace extension and CLI resources.
- **REQ-002:** The target repository shall preserve all observable behavior and storage contracts from archived change `QB-20260910-qb-trace`, including commands, two-second live switching, full callback-visible payload capture, SQLite WAL/schema 1, append-only correlation, external diagnostics, no automatic deletion and fail-open gaps.
- **REQ-003:** Existing `~/.pi/agent/qb-trace/config.json`, `traces.sqlite` and diagnostics shall remain directly usable without migration, copying, reset or schema rewrite.
- **REQ-004:** Target module boundaries shall keep Pi and executable entrypoints thin; configuration, event/correlation, collection, SQLite write ownership, diagnostics and read-only query behavior shall remain independently testable with no dependency on `pi-plugins` private files.
- **REQ-005:** The target installer shall be idempotent for its own link, reject unrelated existing targets, and safely repoint only an exact legacy symbolic link whose target is the former `pi-plugins/bin/qb-trace` entrypoint.
- **REQ-006:** Target documentation shall provide standalone Git/local installation, CLI installation, enable/disable/status, sensitive-data warnings, development checks, migration order and rollback instructions.
- **REQ-007:** `pi-plugins` shall remove `extensions/qb-trace/`, `bin/qb-trace`, the Trace CLI installer, package `bin`/Trace script declarations, current README section and current Directory Map ownership entries; it shall not bundle, depend on or auto-load `pi-trace`.
- **REQ-008:** Source cleanup shall preserve unrelated plugins, package resources, tests, documentation and archived `QB-20260910-qb-trace` history; no unrelated source behavior shall change.
- **REQ-009:** Both repositories shall have reproducible non-interactive test and typecheck commands, Pi package discovery smoke coverage, executable failure exit codes and no generated/local Trace data committed.
- **REQ-010:** Migration shall use ordinary working-tree changes in both repositories and shall not commit, reset, rebase, filter or otherwise rewrite either Git history.

## Behavior Delta

### MODIFIED

- **REQ-001:** QB Trace changes from a capability embedded in `@qiubai-lab/pi-plugins` to the standalone private package `@qiubai-lab/pi-trace` version `0.1.0`.
- **REQ-005:** CLI installation changes ownership to `pi-trace` and gains a bounded legacy-link repoint path.
- **REQ-007:** Installing `pi-plugins` no longer loads or supplies QB Trace; users install `pi-trace` separately.

### REMOVED

- **REQ-007:** The source package no longer contains or documents active QB Trace implementation and CLI entrypoints; archived change history remains available.

## Acceptance Criteria

- **AC-001 [REQ-001, REQ-004]:** Pi package discovery against `/root/projects/pi-trace` loads exactly the target QB Trace extension without requiring `pi-plugins`, and the standalone CLI resolves entirely within the target repository.
- **AC-002 [REQ-002, REQ-003]:** The migrated focused suite and compatibility fixture pass against an existing schema-1 database/config and demonstrate unchanged command, capture, concurrency, schema refusal, diagnostics and fail-open behavior.
- **AC-003 [REQ-005]:** Isolated installation tests pass first install, repeat install, unrelated-target refusal and exact legacy `pi-plugins/bin/qb-trace` symlink repointing; installed CLI on/off/status and reserved server exit behavior remain correct.
- **AC-004 [REQ-006]:** Target README contains reproducible install, migration, operation, security, development and rollback guidance without referring to target code as part of `pi-plugins`.
- **AC-005 [REQ-007, REQ-008]:** Runtime/source search finds no active QB Trace code, manifest entrypoint, CLI or current ownership claim in `pi-plugins` outside archived history; all unrelated source repository tests and typecheck pass.
- **AC-006 [REQ-009]:** `npm test`, `npm run typecheck`, shell syntax checks, CLI smoke and Pi discovery smoke pass independently in both affected repositories where applicable.
- **AC-007 [REQ-010]:** Final status/diff inspection shows only ordinary uncommitted migration changes, no commits or history rewrites performed by this change, and no generated Trace database/config artifacts staged in either repository.

## Verification Evidence

- **VER-001 / AC-001:** `/root/projects/pi-trace/package.json` declares only `./src/index.ts`; `pi -ne -e . --list-models` succeeded from the target, and the package-owned executable resolves `src/cli-entry.ts` without any source-repository import.
- **VER-002 / AC-002:** The migrated suite passed 22 tests across seven files. A schema-1 database and enabled config created through the former source executable were read by target `status` (`recording: on`, `schema: 1`) and safely updated by target `off` without copy or reset.
- **VER-003 / AC-003:** Automated installation tests passed fresh install, repeat install, exact legacy-link repointing, foreign file refusal and foreign symlink refusal. A separate installed-link smoke passed on/status/off and confirmed reserved `server` exit code 2.
- **VER-004 / AC-004:** Target README now owns standalone Git/local installation, migration ordering, operation, high-sensitivity/full-capture warnings, capacity/fail-open behavior, development checks and rollback.
- **VER-005 / AC-005:** Active source search outside qb-spec returned no QB Trace or pi-trace references. Source package discovery succeeded; its complete remaining suite passed 81 tests across nine files and typecheck passed.
- **VER-006 / AC-006:** Target `npm test`, `npm run typecheck`, `npm audit --omit=dev`, POSIX shell syntax, CLI smoke, Pi discovery smoke and `git diff --check` passed. Source `npm test`, `npm run typecheck`, Pi discovery smoke and `git diff --check` passed independently.
- **VER-007 / AC-007:** Source HEAD remained `640caab0ebacd6bc22457962637025fc5a8b6334` and target HEAD remained `1fb8791a3cc2635990549ab0378a32de26f4f260`. Final changes are ordinary working-tree additions/modifications/deletions; no Trace database, config or diagnostic artifact appears in either status.

## Architecture and behavior-preservation result

- Ownership is now singular: target `src/` owns the complete capability, target adapters point inward, and static search found no dependency on `pi-plugins` private implementation.
- Existing behavior protection moved with the implementation rather than being recreated as weaker placeholders; source and target checks pass independently after source cleanup.
- Target architecture facts and structure are recorded in `docs/qb-spec/context/ARCHITECTURE_SPEC.md` and `docs/qb-spec/DIRECTORY_MAP.md`; the source Directory Map no longer claims Trace ownership.

## Residual risk

- The current host is Linux. The installer uses the tested POSIX shell subset and retains the prior macOS support contract, but a native macOS migration smoke remains a release-environment check.
- Users who start Pi with both an older `pi-plugins` checkout and the new package can temporarily duplicate callbacks; the documented migration order requires closing Pi before switching package ownership.

## Risks and recovery

- Installing target before removing or disabling the source extension can double-register event hooks and duplicate Trace rows. Documentation must require closing Pi instances, updating/removing the source capability, installing target, relinking CLI, then starting Pi.
- An existing CLI link becomes dangling when source files are removed. The target installer may repoint only the narrowly recognized legacy symlink; every other occupied target remains fail-closed.
- Full Trace data remains highly sensitive. Keeping the same external data directory avoids copies but does not reduce the existing disclosure risk.
- Rollback restores source files/package declarations and removes the target package from Pi settings; the shared data directory remains untouched and schema-compatible.

## Authorization Record

The user explicitly requested migration to `/root/projects/pi-trace` and approved complete extraction, separate installation, unchanged data compatibility, ordinary file migration without Git history rewrite, package identity `@qiubai-lab/pi-trace`, version `0.1.0` and `private: true`.

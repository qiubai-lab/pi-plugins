---
id: QB-20260910-qb-trace
type: feature
tier: strict
status: draft
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# QB Trace Implementation Plan

## Plan basis

Implements `docs/qb-spec/specs/QB-20260910-qb-trace.md`. No implementation is authorized by this plan; both documents remain draft until the shaped scope is explicitly approved.

Spec quality review: **PASS WITH NOTES**. REQ/AC/Delta coverage is closed, failure and recovery behavior is explicit, and strict TASK/VER traceability is complete. Non-blocking notes: “full” remains bounded by Pi's public observation points and extension ordering; the SQLite runtime, file permissions and polling mechanism must be resolved by the planned architecture/security gates without weakening the approved behavior.

## Proposed change locations

- `extensions/qb-trace/index.ts`: thin Pi event adapter and runtime lifecycle composition.
- `extensions/qb-trace/config.ts`: global recording state, atomic updates and live change observation.
- `extensions/qb-trace/events.ts`: versioned event envelope, correlation and loss-aware serialization.
- `extensions/qb-trace/collector.ts`: non-blocking queue, batching, retry and shutdown coordination.
- `extensions/qb-trace/store.ts`: SQLite schema ownership, WAL setup, append transactions and read-only query contract.
- `extensions/qb-trace/diagnostics.ts`: database-independent per-runtime error/gap state and status aggregation.
- `extensions/qb-trace/cli.ts`: command use cases for on/off/status and the reserved server response.
- `bin/qb-trace`: thin executable entrypoint.
- `scripts/install-qb-trace-cli.sh`: guarded, idempotent user-level link installation.
- Focused tests colocated under `extensions/qb-trace/`; root manifest, engine contract, README and Directory Map updated only as required.

Exact file splitting may be adjusted by the architecture-boundary check, but the Pi adapter, deterministic policy, storage and CLI responsibilities must remain separable and testable.

## Tasks

- **TASK-001 [REQ-006, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012; AC-004, AC-005, AC-006]:** Define the versioned Trace envelope, Runtime/Session/correlation identity rules, event-stage vocabulary and loss-aware serializer. Inventory the supported Pi 0.85.1 hooks and explicitly mark API-observable boundaries so streamed deltas and final authoritative records are distinguishable.
- **TASK-002 [REQ-013, REQ-014, REQ-015, REQ-016, REQ-017; AC-006, AC-007, AC-008]:** Implement the single global SQLite store with WAL, schema/user-version checks, append-only uniqueness constraints, Session/Runtime indexes, short batch transactions and a read-only query interface. Select a SQLite runtime compatible with Pi's effective Node requirement and update the package engine contract if necessary.
- **TASK-003 [depends: TASK-001, TASK-002] [REQ-018, REQ-019, REQ-020, REQ-021, REQ-022; AC-003, AC-007, AC-009]:** Implement the collector queue with count and byte bounds, non-mutating snapshots, bounded lock retry, batch persistence, two-second shutdown flush, fail-open behavior and whole-event dropping at capacity. Persist error/gap counters outside the Trace database so status remains informative when SQLite is unavailable.
- **TASK-004 [REQ-001, REQ-002, REQ-004, REQ-005; AC-001, AC-002]:** Implement atomic global on/off configuration and a low-cost live observer that applies changes to all loaded runtimes within two seconds. Define auditable on/off boundaries without requiring the Server or a Pi Slash Command.
- **TASK-005 [depends: TASK-001, TASK-003, TASK-004] [REQ-006, REQ-007, REQ-008, REQ-010, REQ-011, REQ-012, REQ-022; AC-004, AC-005, AC-006, AC-009]:** Wire the thin Pi extension adapter to the supported lifecycle, provider, message and tool hooks. Preserve callback ordering metadata, correlate parallel tools by call ID, capture full callback-visible payloads without QB Trace truncation/redaction, and ensure handlers never return mutations to Pi.
- **TASK-006 [depends: TASK-002, TASK-003, TASK-004] [REQ-003, REQ-024, REQ-025, REQ-026; AC-003, AC-011]:** Implement `qb-trace on/off/status`; aggregate sidecar diagnostics with database metadata; make commands independent of Pi and Server processes. Reserve `server` with an explicit nonzero not-implemented result while exposing no placeholder listener.
- **TASK-007 [depends: TASK-006] [REQ-023, REQ-024; AC-010]:** Add the executable and guarded Linux/macOS installation script. Resolve the package-owned source deterministically, create `~/.local/bin` when safe, use a symbolic link, verify ownership on repeat runs, reject foreign targets and report PATH remediation.
- **TASK-008 [depends: TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006] [REQ-001, REQ-002, REQ-006, REQ-007, REQ-009, REQ-010, REQ-011, REQ-013, REQ-014, REQ-018, REQ-019, REQ-020, REQ-021; AC-001, AC-002, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009]:** Add deterministic unit/integration harnesses for event capture, config propagation, concurrent processes, parallel tools, lifecycle replacement, schema incompatibility, storage faults, queue pressure and bounded shutdown. Use synthetic credentials and payload markers only.
- **TASK-009 [depends: TASK-006, TASK-007] [REQ-017, REQ-023, REQ-025, REQ-027, REQ-028; AC-010, AC-011, AC-012]:** Document installation, commands, locations, unlimited growth, full sensitive capture, observable-data limitations, Linux/macOS scope, fail-open gaps, reserved Server behavior and safe rollback. Update package manifest and Directory Map for the new extension/CLI boundary.

## Architecture and critical-behavior gates

Before implementation:

- Run `checking-architecture-boundaries` for ownership between the Pi adapter, CLI, configuration, collector, SQLite store, diagnostics sidecar and future read-only Server. Confirm that `bin/qb-trace` remains a thin adapter and that no sibling plugin private code is imported.
- Run `protecting-critical-behavior` for global enable/disable propagation, non-mutation of Pi events, sensitive full-payload persistence, append-only/idempotent writes, schema refusal, fail-open behavior and explicit gap reporting.
- Resolve the Node/SQLite compatibility decision before storage code starts; do not silently rely on a Node version below the package's declared engine.

## Verification plan

- **VER-001 [AC-001]:** Integration test with Server absent, one already-running extension harness and two new Runtime harnesses; execute `qb-trace on`, assert all begin writing within two seconds to one database with distinct Runtime IDs.
- **VER-002 [AC-002]:** Live-toggle integration test; execute `qb-trace off`, wait no more than the two-second propagation plus two-second flush window, assert no later execution events, unchanged history and an auditable off boundary.
- **VER-003 [AC-003]:** CLI/status matrix covering on, off, absent DB, unreadable/incompatible DB, simulated write failure and persisted sidecar loss counters; assert truthful output and exit status.
- **VER-004 [AC-004]:** Controlled Agent event fixture containing thinking/text deltas, final assistant message, successful tool, failed/aborted tool and follow-up; query and compare all marker values, usage and terminal states.
- **VER-005 [AC-005]:** Provider-hook fixture with synthetic authorization header, system/message payload, tool schema and request parameters; assert callback-visible fields are retained without QB Trace redaction and unavailable raw response/internal reasoning is not represented as captured.
- **VER-006 [AC-006]:** Event-model tests for parallel completion order, duplicate retry, reload, resume, fork/tree and compaction; assert unique IDs, monotonic per-Runtime sequence, call-ID linkage and append-only history.
- **VER-007 [AC-007]:** Multi-process SQLite stress test with concurrent batched writers and a continuous read-only query, plus forced termination of one writer; assert WAL operation, bounded lock handling and continued commits from surviving writers.
- **VER-008 [AC-008]:** Schema tests for clean initialization, compatible reopen and a database with a higher unknown version; assert the latter remains byte/metadata unchanged while collection fails open and diagnostics report incompatibility.
- **VER-009 [AC-009]:** Fault-injection tests for busy timeout, write error, corrupted DB, oversized event/queue saturation and shutdown timeout; assert Pi callback completion, no observed-object mutation, bounded return, whole-event loss semantics and external diagnostics.
- **VER-010 [AC-010]:** Linux and macOS-compatible shell tests using isolated HOME/PATH fixtures for first install, idempotent repeat, foreign-target rejection and direct CLI execution without Pi/Server.
- **VER-011 [AC-011]:** CLI test asserting `qb-trace server` emits an explicit unsupported message and nonzero code; dependency/static check confirms collector modules have no Server dependency and Query Service has read-only storage access.
- **VER-012 [AC-012]:** Documentation assertion/review for sensitive full capture, API boundaries, no retention, no V1 Server, supported platforms, symlink install, PATH guidance, fail-open gaps and rollback.
- **VER-013 [AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011, AC-012]:** Run repository `npm test` and `npm run typecheck` after focused checks; record actual commands, outcomes and any environment-blocked evidence in the change artifacts before completion.

## AC-to-verification trace

| Acceptance | Verification |
| --- | --- |
| AC-001 | VER-001, VER-013 |
| AC-002 | VER-002, VER-013 |
| AC-003 | VER-003, VER-013 |
| AC-004 | VER-004, VER-013 |
| AC-005 | VER-005, VER-013 |
| AC-006 | VER-006, VER-013 |
| AC-007 | VER-007, VER-013 |
| AC-008 | VER-008, VER-013 |
| AC-009 | VER-009, VER-013 |
| AC-010 | VER-010, VER-013 |
| AC-011 | VER-011, VER-013 |
| AC-012 | VER-012, VER-013 |

## Rollback and recovery plan

- Disable new recording first through `qb-trace off`; this must not require opening a Pi session.
- Disable the package resource and remove only the package-owned `~/.local/bin/qb-trace` link if implementation rollback is needed.
- Preserve `traces.sqlite`, WAL/SHM recovery files and diagnostics unless the user separately authorizes deletion.
- Never downgrade or rewrite an unknown newer schema during rollback. A compatible prior implementation may remain disabled while historical data is retained for a future reader.
- A failed collector deployment must not require changes to existing OSC Notify or Marketplace Loader plugins.

## Conditional completion work

Implementation will add a new extension ownership boundary and executable entrypoint, so `updating-directory-map` is required after implementation and before final completion. Final acceptance evidence and ordinary conflict-free archive remain the responsibility of `verifying-before-completion`; neither is authorized or performed during this planning-only request.

---
id: QB-20260907-marketplace-loader
type: feature
tier: strict
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# Central Pi Marketplace Loader Plan

Spec: `docs/qb-spec/specs/QB-20260907-marketplace-loader.md`

Spec quality review: **PASS WITH NOTES**. Requirements, acceptance, failure recovery, and P1 exclusions are closed. External Pi skill collisions remain an explicitly documented host limitation and do not block managed-source collision protection.

## Boundary Decision

- Catalog/path/policy validation belongs to deterministic private modules.
- Git and filesystem state are infrastructure adapters with argument-array and atomic-write contracts.
- Marketplace lifecycle orchestration belongs to one service independent of Pi UI.
- `index.ts` owns only command parsing, confirmations, notifications, reload, and resource event adaptation.
- No shared module or sibling-extension private import is introduced.

## Tasks

- [x] **TASK-001 [REQ-002, REQ-003]:** Implement bounded snapshot and Codex/Pi catalog validation with focused failure tests.
- [x] **TASK-002 [REQ-001, REQ-007, REQ-008]:** Implement injectable argument-safe Git snapshot acquisition and replacement cleanup.
- [x] **TASK-003 [REQ-004]:** Implement versioned atomic state persistence and private home layout.
- [x] **TASK-004 [REQ-001, REQ-005, REQ-007]:** Implement add/update/remove, enable/disable, discovery, collision, and diagnostic application services.
- [x] **TASK-005 [REQ-006]:** Implement the thin `/marketplaces` command and `resources_discover` adapter.
- [x] **TASK-006 [REQ-009]:** Revert the package-local selector commit contents in `my-skills` and update central operator documentation and Directory Map.
- [x] **TASK-007 [all AC]:** Run security-focused tests, repository tests, typecheck, real-repository validation, Pi smoke checks, and record evidence.

## Verification

- **VER-001 [AC-001]:** Local Git fixtures and a local clone of `my-skills` prove exact commit resolution and Pi/Codex adaptation checks.
- **VER-002 [AC-002]:** Table-driven validation tests cover every path/tree/schema bound; source search checks prohibited execution paths.
- **VER-003 [AC-003]:** State and service recreation tests cover fresh, valid, stale, and malformed selections.
- **VER-004 [AC-004]:** Managed collision and resource withdrawal tests.
- **VER-005 [AC-005]:** Fake Pi API/UI command integration tests cover command routes and confirmation gates.
- **VER-006 [AC-006]:** Git update success, decline, and failure integration tests compare durable commit and active paths.
- **VER-007 [AC-007]:** `my-skills` diff and package manifest assertions prove selector removal and prior behavior restoration.
- **VER-008 [AC-008]:** `npm test`, `npm run typecheck`, `git diff --check`, and `pi -e . --list-models`.

## Rollback

Delete `extensions/marketplace-loader/` and its Pi manifest discovery entry (the existing glob makes deletion sufficient), then remove its documentation. Restore direct `pi install my-skills`; private snapshots and state can be removed separately without touching source repositories.

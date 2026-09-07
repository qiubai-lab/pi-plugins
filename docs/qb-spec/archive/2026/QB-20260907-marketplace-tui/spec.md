---
id: QB-20260907-marketplace-tui
type: feature
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# Interactive Marketplace TUI

Approval source: the user explicitly approved the evaluated `/plugins` interactive TUI design and requested implementation.

## Goal

Make the existing central Marketplace Loader usable through a discoverable, keyboard-driven Pi TUI comparable to Codex's plugin manager while retaining text commands for automation and recovery.

## Scope

- `/plugins` opens an interactive manager in TUI mode.
- Marketplace list, source actions, plugin toggles, details, add, update, remove, and diagnostics.
- Native Pi `SelectList`, `SettingsList`, `Input`, confirmation, and `BorderedLoader` components.
- Cancellable Git acquisition with temporary snapshot cleanup.
- One resource reload after the manager closes when active resources changed.
- Existing `/marketplaces` subcommands remain supported.

## Non-goals

- Pixel-identical Codex UI, mouse-specific behavior, Git transfer percentage, background updates, or animation.
- TUI support in RPC/Print/JSON modes.
- Changing marketplace compatibility or trust policy.

## Requirements

- **REQ-001:** `/plugins` shall reject non-TUI modes clearly and open a full custom manager in TUI mode.
- **REQ-002:** The manager shall list searchable marketplaces with ref, commit, plugin count, enabled count, and actions to browse, update, remove, diagnose, add, or close.
- **REQ-003:** Plugin browsing shall expose searchable enabled/disabled settings, descriptions, skill counts, unsupported capabilities, and unavailable policy without allowing unavailable plugins to be enabled.
- **REQ-004:** Plugin changes shall be validated and persisted as one marketplace-level batch; new trust requires confirmation, cancellation leaves state unchanged, and the manager requests at most one reload after closing.
- **REQ-005:** Add and update shall use interactive URL/ref input, confirmations, and a cancellable loader whose AbortSignal reaches Git; abort/failure shall clean temporary snapshots and preserve active state.
- **REQ-006:** Remove shall require confirmation; diagnostics and operation errors shall be shown without permanently closing the management workflow.
- **REQ-007:** All custom rendering shall use callback-provided themes, respect terminal width through Pi TUI components, support Escape cancellation/back navigation, and rebuild disposed screens rather than reusing components.
- **REQ-008:** Existing `/marketplaces` text subcommands and backend security behavior shall remain compatible.

## Behavior Delta

### ADDED

- REQ-001: `/plugins` provides a native interactive Marketplace entrypoint.
- REQ-002: Marketplaces can be browsed and managed without remembering command syntax.
- REQ-003: Plugin state and compatibility details are visible and searchable.
- REQ-004: Multiple plugin toggles are applied transactionally with one eventual reload.
- REQ-005: Long-running Git operations are visible and cancellable.
- REQ-006: Destructive and diagnostic actions are integrated into the manager.
- REQ-007: The manager follows Pi TUI rendering and lifecycle contracts.

### MODIFIED

- REQ-008: Marketplace management previously required text subcommands; those commands remain valid but are no longer the only interface.

## Acceptance Criteria

- **AC-001 [REQ-001, REQ-002]:** `/plugins` in TUI opens a marketplace selector; empty and populated states render, while non-TUI invocation reports an error.
- **AC-002 [REQ-003, REQ-004]:** Plugin UI tests cover draft toggles, unavailable entries, cancellation, trust confirmation, atomic apply, collision errors, and a single close-time reload.
- **AC-003 [REQ-005]:** AbortSignal reaches every Git subprocess and cancellation/failure tests leave no candidate state or temporary snapshot.
- **AC-004 [REQ-002, REQ-005, REQ-006]:** Controller tests cover add, browse, update/no-change/activate/decline, remove, doctor, back, and operation-error recovery.
- **AC-005 [REQ-007]:** Component tests cover narrow-width rendering, selection/back navigation, invalidation, and fresh component construction across loops.
- **AC-006 [REQ-008]:** Existing Marketplace Loader tests, typecheck, and Pi package smoke check continue to pass.

## Implementation Plan

- [x] Extend Git runner, snapshotter, and service acquisition methods with optional AbortSignal support.
- [x] Add atomic marketplace-level plugin selection and UI-oriented summary methods to the service.
- [x] Add reusable selection/settings components and a controller state machine using Pi's built-in TUI components.
- [x] Register `/plugins` while leaving `/marketplaces` command routing intact.
- [x] Add focused component/controller/cancellation tests and update operator documentation and Directory Map.
- [x] Run affected and full verification, record AC evidence, and archive the change.

## Acceptance-to-check Mapping

| Acceptance | Direct check |
|---|---|
| AC-001 | command adapter and marketplace screen tests |
| AC-002 | plugin draft/batch service/controller tests |
| AC-003 | fake runner signal assertions and aborted real fixture cleanup test |
| AC-004 | controller action-loop tests with fake views/service |
| AC-005 | TUI component render/key tests at narrow widths |
| AC-006 | full npm tests, typecheck, source inspection, Pi smoke |

## Verification Evidence

- **AC-001:** Adapter tests prove `/plugins` invokes the manager in TUI mode and reports an error without invoking it in RPC mode. Searchable marketplace components render populated/action states.
- **AC-002:** Plugin settings tests cover keyboard draft toggles, Ctrl+S save, Escape discard, and `NOT_AVAILABLE` display. Controller/service tests cover trust decline, one atomic marketplace batch, managed collision rejection, and exactly one close-time reload.
- **AC-003:** Git tests prove the same AbortSignal reaches clone, ref resolution, and checkout; abort rejects and removes the destination. The loader waits for operation unwinding, and service checks cancellation before catalog activation and state persistence.
- **AC-004:** Controller tests cover add, browse/plugin selection, update activation, unchanged update, declined update cleanup, remove, doctor, back navigation, refreshed lists, and error recovery.
- **AC-005:** TUI tests assert every rendered line stays within a 22/28-column terminal, filtering and keyboard selection work, Escape returns, invalidation is available, and separately constructed screens retain independent selection state.
- **AC-006:** `npm test` passed 75 tests in 9 files; `npm run typecheck`, `git diff --check`, package metadata checks, prohibited shell-call inspection, and `pi -e . --osc-notify-protocol off --list-models` passed. Fresh smoke state created no state file.
- Documentation and Directory Map describe `/plugins`, keyboard controls, cancellation, non-TUI fallback, and component/controller boundaries. Package and lockfile are aligned at 0.3.0 with Pi TUI as a core peer dependency.

## Risks And Recovery

- Reload during a custom component lifecycle can corrupt UX; changes are accumulated and reload happens only after the manager exits.
- BorderedLoader cancellation must abort the child process rather than merely hide UI; the signal is passed through all Git calls.
- Rollback removes `/plugins` registration and UI modules; existing text commands and service state remain usable.

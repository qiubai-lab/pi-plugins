---
id: QB-20260907-marketplace-loader
type: feature
tier: strict
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# Central Pi Marketplace Loader

Approval source: the user explicitly approved moving marketplace selection into `pi-plugins` and requested migration plus implementation.

## Goal

Provide one centrally installed Pi extension that securely acquires and manages trusted remote, Pi-adapted Codex marketplace repositories and exposes skills only from explicitly enabled plugin groups.

## Scope

- Remote Git marketplace repositories, each resolved to an exact commit from an explicit ref.
- Private snapshots and versioned state under a configurable Pi data directory.
- Existing `.agents/plugins/marketplace.json` and local-source `.codex-plugin/plugin.json` files as grouping metadata.
- Explicit source add/update/remove and plugin enable/disable operations.
- Dynamic Pi skill discovery and automatic reload after active-resource changes.
- Migration of `/root/projects/my-skills` back to a passive Pi skills package so it no longer registers a competing selector command.

## Non-goals

- Invoking or modifying Pi's private package-manager APIs or settings.
- Codex URL, git-subdir, or npm plugin sources.
- Codex commands, agents, hooks, MCP servers, apps, authentication, or scripts.
- Automatic background updates, dependency installation, submodules, or lifecycle execution.
- Rewriting third-party skill names or guaranteeing collision freedom with resources outside this loader.

## Requirements

- **REQ-001:** `/marketplaces add <git-url> <ref>` shall require trust confirmation, clone without submodules or dependency installation, resolve the ref to a commit, validate the snapshot, and persist it only after success.
- **REQ-002:** A managed repository shall contain a Pi package manifest plus a valid Codex marketplace whose plugin entries use contained local sources and whose matching plugin manifests declare contained skill roots.
- **REQ-003:** Snapshot validation shall reject path traversal, escaping or in-tree symbolic links, special files, malformed manifests, missing skills, duplicate plugin names, duplicate skill names, and configured file/byte limit violations.
- **REQ-004:** Versioned source and enablement state shall be written atomically under `PI_MARKETPLACE_HOME` or `~/.pi/agent/marketplaces`; malformed state shall fail closed with actionable diagnostics.
- **REQ-005:** Only enabled `<plugin>@<marketplace>` selectors from currently active snapshots shall contribute skill roots through `resources_discover`; managed duplicate skill names shall be rejected before enablement.
- **REQ-006:** `/marketplaces` shall provide help, list, plugins, add, update, remove, enable, disable, and doctor operations with confirmations for trust, activation, update, and destructive removal.
- **REQ-007:** Update shall build and validate a new snapshot before activation, show old/new resolved commits, preserve the old active snapshot on failure or declined activation, and garbage-collect the replaced snapshot only after durable state change.
- **REQ-008:** The extension shall invoke Git only with argument arrays, shall not use shell interpolation, and shall never run Codex, npm, hooks, repository scripts, or plugin scripts.
- **REQ-009:** Migration shall remove the package-local selector from `my-skills`, restore its prior Pi skills manifest and documentation, and document that centrally managed repositories must not also be installed as Pi packages in the same session.

## Behavior Delta

### ADDED

- REQ-001: Pi can register a trusted remote marketplace at a resolved Git commit.
- REQ-002: Only repositories adapted for both Pi and the supported Codex local-source shape are accepted.
- REQ-003: Untrusted snapshot structure and resource bounds are validated before state activation.
- REQ-004: Central marketplace source and plugin selection state is durable and fail-closed.
- REQ-005: Enabled remote plugin groups participate in Pi's native lazy skill loading.
- REQ-006: Marketplace and plugin lifecycle management is available through `/marketplaces`.
- REQ-007: Explicit updates are validated and recoverable.
- REQ-008: Marketplace acquisition does not execute package content.

### MODIFIED

- REQ-009: Plugin selection previously lived inside `my-skills`; it moves to the central `pi-plugins` package, and dual installation becomes unsupported to prevent duplicate skills.

## Acceptance Criteria

- **AC-001 [REQ-001, REQ-002]:** A Git fixture and the real `my-skills` repository snapshot can be added from an explicit ref and report the exact resolved commit; malformed or non-Pi repositories are rejected without source state.
- **AC-002 [REQ-003, REQ-008]:** Automated tests reject traversal, symlinks, special files, duplicate names, malformed/missing resources, and size limits, and source inspection confirms no shell or package-content execution.
- **AC-003 [REQ-004, REQ-005]:** Fresh and malformed state expose no skills; enabled state survives a new service instance and returns only known enabled skill roots.
- **AC-004 [REQ-005]:** Enabling a plugin with a skill collision against another managed enabled plugin fails; disablement withdraws its resource after reload.
- **AC-005 [REQ-006]:** Command tests cover help, list, plugins, add, update, remove, enable, disable, doctor, confirmations, errors, and reload decisions.
- **AC-006 [REQ-007]:** Update tests prove successful snapshot replacement and prove failed or declined updates preserve prior commit, resources, and state.
- **AC-007 [REQ-009]:** `my-skills` no longer contains the selector extension and its original `pi.skills` package behavior is restored; central loader documentation warns against dual loading.
- **AC-008 [REQ-001, REQ-005, REQ-006]:** Repository tests, strict typecheck, and a Pi package discovery smoke check pass.

## Verification Evidence

- **VER-001 / AC-001:** Git fixture integration resolved exact 40-hex commits. A temporary Git snapshot built from the migrated real `/root/projects/my-skills` worktree added as `personal-skills`, exposed one enabled plugin path, and reported 4 plugins and 20 skills.
- **VER-002 / AC-002:** Catalog/tree tests passed for non-Pi packages, traversal, unsupported sources, manifest mismatch, missing skills, duplicate plugin/skill names, symlinks, special files, and file/per-file/total-byte limits. Runtime source search found no shell interpolation, npm, Codex, submodule, hook, or plugin-script invocation; Git is called only through `execFile` argument arrays.
- **VER-003 / AC-003:** State tests passed for empty defaults, atomic valid JSON, persistence, stale selections, unsafe snapshots, and malformed-state fail-closed behavior.
- **VER-004 / AC-004:** Service tests passed for enable/disable discovery, cross-marketplace collision rejection, `NOT_AVAILABLE`, and update-introduced collision rollback.
- **VER-005 / AC-005:** Fake Pi API/UI tests covered discovery failure, help/list/plugins/doctor, declined and accepted add/enable/update/remove, disable, errors, notifications, and reload decisions.
- **VER-006 / AC-006:** Update integration tests passed for declined candidate cleanup, missing-ref failure, preserved old state/resources, validated activation, and exact new commit replacement.
- **VER-007 / AC-007:** `my-skills` package manifest was restored to `pi.skills: ["./plugins/*/skills"]`; its selector implementation and selector documentation were removed. JSON/catalog validation found 20 single-source skills and its independent Pi package smoke check passed.
- **VER-008 / AC-008:** `npm test` passed 61 tests in 7 files; `npm run typecheck`, both repositories' `git diff --check`, and `pi -e . --osc-notify-protocol off --list-models` passed. Package version and lockfile are 0.2.0.
- Repository-required `claude plugin validate .` for `my-skills` was attempted but blocked because `claude` is not installed. No Claude/Codex/Kimi plugin manifest, catalog, or skill content changed during migration; JSON/catalog and Pi-specific checks passed.

## Risks And Recovery

- Git itself is trusted infrastructure and may honor user-global Git configuration; the extension disables repository hooks and never initializes submodules, but users must still add only repositories they trust.
- Skills are model instructions with potential tool-use influence; enablement requires a separate confirmation after source trust.
- Skill collision detection is complete only among loader-managed enabled marketplaces. Pi may still report collisions with unrelated packages or user skills.
- Failed operations remove temporary snapshots before returning. Rollback removes the loader extension and restores direct installation of `my-skills`; source repositories are never modified.

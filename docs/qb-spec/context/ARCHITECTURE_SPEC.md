# Architecture Specification

## Package boundary

The repository is one installable Pi package. The root `package.json` is the package and verification entrypoint. A workspace or independently versioned subpackage is introduced only when a plugin gains a separate release, dependency, or consumer boundary.

## Extension modules

Each `extensions/<plugin>/` directory owns one independently loadable Pi extension. Its `index.ts` is the composition entrypoint; local implementation and tests remain private to that plugin. Plugins do not import another plugin's private files. Shared code is extracted only after a real second consumer with the same semantics exists.

The Pi manifest discovers only `extensions/*/index.ts`. Support modules and tests must never be package resource entrypoints.

## OSC Notify boundary

`extensions/osc-notify/protocol.ts` owns pure protocol selection, sanitization, and byte encoding. `extensions/osc-notify/content.ts` owns final-response extraction, plain-text reduction, outcome fallbacks, and content-mode resolution. `extensions/osc-notify/index.ts` owns Pi lifecycle hooks, CLI configuration, TUI eligibility checks, transient final-message state, and terminal output. Protocol and content rules must remain testable without a Pi session or terminal.

## Marketplace Loader boundary

`extensions/marketplace-loader/catalog.ts` and `tree.ts` own deterministic Pi/Codex adaptation, path, resource, and snapshot safety rules. `git.ts` is the argument-array Git adapter, `state.ts` owns versioned atomic persistence, and `service.ts` owns source and plugin lifecycle orchestration. `index.ts` owns only Pi resource hooks, command parsing, confirmation, notification, and reload. The loader manages private snapshots rather than importing Pi package-manager internals and never executes marketplace package content.

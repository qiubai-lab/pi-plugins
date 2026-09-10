# Directory Map

## Root Directories

- `extensions/`: independently loadable Pi extension modules; does not contain unrelated scripts or repository-wide shared code.
- `bin/`: user-invoked package CLI entrypoints; does not own tracing policy or persistence rules.
- `scripts/`: explicit package setup helpers; does not run automatically during Pi package loading.
- `docs/qb-spec/`: durable project context and active/archived change records; does not replace executable package configuration.

## Important Files

- `package.json`: Pi package resource manifest and npm verification commands.
- `tsconfig.json`: TypeScript checking contract for extension source and tests.
- `extensions/osc-notify/index.ts`: OSC Notify Pi extension entrypoint and runtime composition root.
- `extensions/marketplace-loader/index.ts`: remote Marketplace Pi adapter and the TUI-only `/plugins` command entrypoint.
- `extensions/marketplace-loader/controller.ts`: interactive manager state machine, cancellable operation flow, and close-time reload coordination.
- `extensions/marketplace-loader/ui.ts`: searchable Marketplace and Plugin settings TUI components.
- `extensions/marketplace-loader/service.ts`: source, snapshot, personal enablement, repository installation, update, and diagnostic application service.
- `extensions/marketplace-loader/project.ts`: trusted Git repository resolution, project lock validation, and rollback-safe `.agents/skills` materialization.
- `extensions/qb-trace/index.ts`: QB Trace Pi lifecycle adapter and runtime composition root.
- `extensions/qb-trace/store.ts`: versioned global SQLite Trace persistence; `extensions/qb-trace/query.ts` is the future Server-facing read-only query contract.
- `bin/qb-trace`: standalone recording-control CLI entrypoint.
- `README.md`: installation, configuration, and operator-facing usage.

## Module Responsibilities

- `extensions/osc-notify/`: owns terminal notification lifecycle integration, final-response excerpting, protocol selection, safe encoding, and focused tests; does not own terminal emulator notification settings or native OS delivery.
- `extensions/marketplace-loader/`: owns argument-safe Git snapshots, Pi/Codex catalog validation, atomic personal selection state, owned project Skill materialization, dynamic skill discovery, and focused tests; does not invoke Agent package managers or execute marketplace content.
- `extensions/qb-trace/`: owns global recording state, loss-aware event envelopes, bounded collection, external diagnostics, SQLite persistence, CLI use cases, and focused tests; does not implement the future HTTP/Web Server or modify observed Pi events.
- `bin/` and `scripts/`: expose and install thin operator entrypoints over feature-owned modules; do not duplicate feature decisions.
- `docs/qb-spec/context/`: owns stable architecture and engineering constraints; does not contain task execution history.
- `docs/qb-spec/specs/`: owns active change scope and acceptance; does not define package discovery behavior.

## Forbidden Contents By Directory

- `extensions/<plugin>/`: no private imports from sibling plugins and no credentials or machine-specific configuration.
- `extensions/qb-trace/`: no Web UI/server implementation and no dependency on another plugin's private files.
- `bin/` and `scripts/`: no business rules, SQLite schema ownership, credentials, or automatic install-time side effects.
- `extensions/`: no test/support file may be added to the Pi manifest as a resource entrypoint.
- `docs/qb-spec/context/`: no transient implementation logs or unapproved inferred preferences.

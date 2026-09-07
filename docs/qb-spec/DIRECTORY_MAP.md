# Directory Map

## Root Directories

- `extensions/`: independently loadable Pi extension modules; does not contain unrelated scripts or repository-wide shared code.
- `docs/qb-spec/`: durable project context and active/archived change records; does not replace executable package configuration.

## Important Files

- `package.json`: Pi package resource manifest and npm verification commands.
- `tsconfig.json`: TypeScript checking contract for extension source and tests.
- `extensions/osc-notify/index.ts`: OSC Notify Pi extension entrypoint and runtime composition root.
- `README.md`: installation, configuration, and operator-facing usage.

## Module Responsibilities

- `extensions/osc-notify/`: owns terminal notification lifecycle integration, final-response excerpting, protocol selection, safe encoding, and focused tests; does not own terminal emulator notification settings or native OS delivery.
- `docs/qb-spec/context/`: owns stable architecture and engineering constraints; does not contain task execution history.
- `docs/qb-spec/specs/`: owns active change scope and acceptance; does not define package discovery behavior.

## Forbidden Contents By Directory

- `extensions/<plugin>/`: no private imports from sibling plugins and no credentials or machine-specific configuration.
- `extensions/`: no test/support file may be added to the Pi manifest as a resource entrypoint.
- `docs/qb-spec/context/`: no transient implementation logs or unapproved inferred preferences.

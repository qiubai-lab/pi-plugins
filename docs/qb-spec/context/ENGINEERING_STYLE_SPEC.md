# Engineering Style Specification

## Scope

These rules apply to the TypeScript Pi extensions in this repository.

## Tooling

- Runtime extensions are TypeScript loaded by Pi; no build artifact is required.
- Use the root npm lockfile for reproducible development dependencies.
- `npm test` is the non-watch behavioral check.
- `npm run typecheck` is the strict TypeScript check.
- Pi core packages imported by runtime extensions remain peer dependencies and are not bundled.

## Implementation rules

- Keep Pi/event/output adapters thin and move deterministic transformations into pure local modules.
- Test protocol bytes and safety boundaries with exact assertions or table-driven cases.
- Raw terminal writes must be isolated behind an adapter and guarded against machine-readable or redirected modes.
- Use ecosystem naming conventions and capability-specific module names; do not create generic global `utils` or `helpers` modules without established consumers.

---
id: QB-20260907-osc-notify
type: design
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# OSC notification plugin research and change specification

## Goal

Add the first independently loadable extension to this private multi-plugin repository. It notifies the user when Pi has fully finished an agent run and is ready for input, with explicit support for terminal bell, OSC 9, and OSC 777.

## Current state

The repository currently contains only `README.md` and `LICENSE`. Pi 0.85.1 is installed locally and provides:

- TypeScript extensions loaded directly through jiti;
- the `agent_settled` event, emitted after retries, compaction retries, and queued continuations are exhausted;
- string extension flags through `registerFlag()`;
- git/local package installation and extension discovery through a root `package.json` `pi.extensions` manifest.

Pi's bundled `examples/extensions/notify.ts` confirms that writing terminal notification escape sequences from an `agent_settled` handler is an intended extension pattern. Its OSC 777-only fallback is a useful starting point, but does not meet this change's protocol selection, output-mode safety, sanitization, or testability needs.

## Protocol research

| Protocol | Bytes | Payload | Notes |
| --- | --- | --- | --- |
| Bell | `0x07` | none | Broadest fallback. Terminal behavior is user-configurable and may be audible, visual, a desktop notification, or disabled. |
| OSC 9 | `ESC ] 9 ; text ST` | one text field | Supported by iTerm2, Ghostty and WezTerm. Ghostty warns that text beginning with a number and semicolon can collide with ConEmu OSC 9 subcommands. |
| OSC 777 | `ESC ] 777 ; notify ; title ; body ST` | title and body | Originated with rxvt-unicode and is supported by WezTerm and other terminals. Semicolons are structural delimiters. |

`ST` (`ESC \\`) is recommended as the OSC terminator instead of BEL. This keeps the Bell adapter semantically distinct and follows Ghostty's stated preference. Terminal notification display remains subject to terminal and OS notification settings; no OSC protocol returns a delivery acknowledgment.

### Sources consulted

- Pi extension lifecycle and package docs: local `docs/extensions.md`, `docs/packages.md`, and `examples/extensions/notify.ts` from `@earendil-works/pi-coding-agent` 0.85.1.
- Ghostty OSC 9: <https://ghostty.org/docs/vt/osc/9>
- Ghostty BEL: <https://ghostty.org/docs/vt/control/bel>
- iTerm2 proprietary escape codes: <https://iterm2.com/documentation-escape-codes.html>
- WezTerm notification handling (documents both OSC 9 and OSC 777): <https://wezterm.org/config/lua/config/notification_handling.html>
- VT sequence reference for OSC 9 and OSC 777 syntax: <https://vtdn.dev/docs/osc/osc9/> and <https://vtdn.dev/docs/osc/osc777/>
- Qterm notification documentation, parser, and parser tests: <https://github.com/qiubai-lab/Qterm/blob/main/docs/terminal-notifications.md> and `src/terminal/notifications/notificationProtocol.ts`.

## Scope

### In scope

- A Pi extension triggered by `agent_settled`.
- `bell`, `osc9`, `osc777`, `auto`, and `off` protocol modes.
- Safe, deterministic encoding of notification text.
- A command for manually exercising a selected protocol.
- Root Pi-package metadata suitable for adding more extension directories later.
- Unit tests for protocol bytes, sanitization, selection, and lifecycle guards.
- README installation, configuration, compatibility, and troubleshooting instructions.

### Non-goals

- Kitty OSC 99, native macOS/Linux/Windows notification APIs, sounds, icons, urgency, callbacks, or delivery acknowledgment.
- Inferring whether the terminal window is focused; supporting terminals may suppress focused-window notifications themselves.
- Reporting success versus failure from `agent_settled`, whose event has no result status.
- Sending escape sequences in RPC, JSON, print, redirected-output, or non-TTY execution.
- tmux/screen passthrough wrapping in the first version. Multiplexers may hide the outer terminal identity or filter OSC sequences; explicit Bell mode or multiplexer configuration remains the fallback.
- Persistent per-project configuration in the first version.

## Assumptions

- The first release uses fixed notification content: title `Pi`, body `Ready for input`; OSC 9 combines these into one text field.
- The repository is installed as one Pi package, while each plugin remains independently filterable by path.
- This private plugin prioritizes Qterm. Qterm accepts all three requested protocols but deliberately does not advertise a Qterm-specific `TERM_PROGRAM`: remote sessions use `TERM=xterm-256color`, macOS local sessions currently expose `TERM_PROGRAM=Apple_Terminal`, and other local sessions may omit it. Qterm therefore normally reaches the unknown-terminal branch.
- CLI configuration is sufficient for one-off overrides, and an environment variable supplies a persistent shell-level default.

## Foundation decision

Use a small TypeScript library/package profile rather than a workspace. The root is one installable Pi package and each extension owns a directory:

```text
package.json                         # scripts, peer/dev dependencies, Pi manifest
extensions/
  osc-notify/
    index.ts                         # Pi lifecycle/command adapter
    protocol.ts                      # pure encoding, sanitization, mode resolution
    protocol.test.ts
README.md
docs/qb-spec/specs/...
```

The Pi manifest should list `./extensions/*/index.ts`, not the entire `extensions/` directory, so tests and support modules are never auto-loaded as extensions. `index.ts` may depend on its local pure module; other plugins must not import private files from this plugin. Shared utilities should only be extracted after a real second consumer exists.

Use `@earendil-works/pi-coding-agent` as a `peerDependency` (`"*"`) and as a pinned `devDependency` for local checking. Use TypeScript and Vitest as development dependencies; the runtime extension has no third-party dependency. Non-interactive verification entries are `npm test` and `npm run typecheck`.

## Options considered

### A. Copy Pi's single-file example

Lowest implementation cost, but hard-codes protocol selection, has no sanitization seam, does not guard machine-readable modes, and becomes awkward to test. Suitable only as a personal snippet, not as the first pattern in a growing repository.

### B. One root Pi package with an isolated plugin directory — recommended

Small amount of structure, independent package filtering, pure protocol tests, and no premature workspace/build pipeline. This matches Pi's package conventions while leaving room for other plugin types.

### C. Workspace with one publishable package per plugin

Strongest release isolation, but adds package/version/install coordination without a current independent publishing need. Revisit only if plugins gain separate consumers, dependencies, or release cadences.

## Requirements

- **REQ-001:** The extension shall emit at most one notification after each Pi `agent_settled` event and shall not notify at `agent_end`, startup, or intermediate retry/compaction boundaries.
- **REQ-002:** The extension shall encode `bell`, `osc9`, and `osc777` exactly as documented above, using ST for both OSC modes.
- **REQ-003:** The extension shall support `auto|bell|osc9|osc777|off`, with precedence `--osc-notify-protocol` > `PI_OSC_NOTIFY_PROTOCOL` > `auto`; invalid values shall not emit arbitrary output and shall fall back to `auto` with a visible warning in TUI mode.
- **REQ-004:** In `auto`, the resolver shall prefer OSC 9 for iTerm2 and Ghostty, and OSC 777 for WezTerm, rxvt/urxvt, Qterm's intentionally generic terminal environments, and all otherwise unknown terminals. Explicit configuration shall always override detection.
- **REQ-005:** Notification bytes shall only be written when `ctx.mode === "tui"`, `process.stdout.isTTY === true`, and `ctx.isIdle() === true`. The extension shall not corrupt RPC/JSON/print output or redirected stdout.
- **REQ-006:** Text encoders shall remove ESC, BEL, C0 controls, line breaks, and protocol delimiters that can terminate or restructure a sequence; output shall be bounded to a documented maximum length. OSC 9 content shall use a non-numeric `Pi` prefix to avoid ConEmu subcommand ambiguity.
- **REQ-007:** `/osc-notify-test [auto|bell|osc9|osc777]` shall exercise the same resolver and encoder used by lifecycle notifications, and reject invalid modes without writing escape bytes.
- **REQ-008:** Package discovery shall load only extension entrypoints and permit this plugin to be enabled or disabled independently through Pi package filtering.
- **REQ-009:** Documentation shall explain install/test commands, mode precedence, supported terminal mappings, terminal/OS opt-in behavior, and tmux/screen limitations.
- **REQ-010:** OSC notification content shall default to a plain-text excerpt of the final completed assistant response, bounded to 160 Unicode code points. Only assistant text blocks may contribute; thinking, tool calls, tool results, fenced code, Markdown formatting, and long URLs shall not be exposed. Missing text, truncation, abort, and error outcomes shall use explicit fallback status text. Users may select `result|status` through `--osc-notify-content` or `PI_OSC_NOTIFY_CONTENT`, with CLI precedence and `result` as the default.

## Behavior Delta

### ADDED

- **REQ-001:** Pi can notify the terminal once it has fully settled and is waiting for input.
- **REQ-002:** Bell, OSC 9, and OSC 777 notification transports become available.
- **REQ-003:** Users can select, disable, or automatically resolve the transport.
- **REQ-004:** Common terminal environments receive a best-effort protocol default.
- **REQ-005:** Notification output is isolated to an idle interactive TTY.
- **REQ-006:** Generated escape sequences are bounded and resistant to control-sequence injection.
- **REQ-007:** Users can manually test terminal notification support.
- **REQ-008:** The repository becomes an installable Pi package with independently filterable extension entrypoints.
- **REQ-009:** Compatibility and operational constraints are documented.

### MODIFIED

- **REQ-010:** The OSC notification body changes from the fixed `Ready for input` text to a bounded final-response excerpt by default, with an explicit privacy-oriented static status mode.

## Acceptance criteria

- **AC-001 (REQ-001):** A mocked event registration test shows no write before settlement and exactly one write when the captured `agent_settled` handler runs under eligible conditions.
- **AC-002 (REQ-002):** Unit snapshots/byte assertions match `07`, `1b 5d 39 3b ... 1b 5c`, and `1b 5d 37 37 37 3b 6e 6f 74 69 66 79 3b ... 1b 5c` for Bell, OSC 9, and OSC 777 respectively.
- **AC-003 (REQ-003, REQ-004):** Table-driven tests cover override precedence, every explicit mode, representative iTerm2/Ghostty/WezTerm/rxvt environments, unknown terminals, `off`, and invalid input.
- **AC-004 (REQ-005):** Tests prove no bytes are written for non-TUI modes, non-TTY stdout, non-idle context, or `off`.
- **AC-005 (REQ-006):** Adversarial title/body tests containing ESC, BEL, ST fragments, semicolons, newlines, and overlong Unicode cannot create a second control sequence or unbounded payload.
- **AC-006 (REQ-007):** The manual test command uses the production encoder and reports invalid usage without emitting terminal bytes.
- **AC-007 (REQ-008):** Pi can load `extensions/osc-notify/index.ts` from the local package without loading test/support files; the extension can be excluded with a package filter.
- **AC-008 (REQ-009):** README contains reproducible local installation and protocol smoke-test instructions.
- **AC-009 (REQ-002, REQ-004):** Manual smoke tests on each available target terminal verify that forced Bell, OSC 9, and OSC 777 are accepted; unavailable terminal/OS combinations are explicitly recorded as unverified rather than claimed supported.
- **AC-010 (REQ-010):** Tests prove that a normal final response produces a plain-text excerpt of at most 160 code points; non-text blocks and fenced code are excluded; links retain labels without long targets; truncation, abort, error, and empty responses use the specified safe outcomes; content configuration precedence and invalid values are covered.

## Implementation outline

- [x] Add root package metadata, TypeScript/Vitest configuration, and scoped scripts.
- [x] Implement pure protocol types, sanitization, byte encoding, and environment resolution.
- [x] Implement the Pi adapter with flag registration, mode/TTY/idle guards, `agent_settled`, and `/osc-notify-test`.
- [x] Add unit and adapter tests mapped to AC-001 through AC-006.
- [x] Expand README and verify package discovery/filtering.
- [x] Run installation, tests, typecheck, package discovery, and packaging inspection.
- [x] Complete the user-visible Qterm protocol smoke test for AC-009.
- [x] Implement and document final-response notification excerpts and static status mode for AC-010.

## AC-to-check mapping

| Acceptance | Planned check |
| --- | --- |
| AC-001 | Vitest lifecycle adapter test |
| AC-002–AC-005 | Vitest table-driven protocol tests |
| AC-006 | Vitest command adapter test plus local command smoke test |
| AC-007 | `pi -e .` load smoke test and manifest inspection |
| AC-008 | README review against actual commands |
| AC-009 | Forced-protocol terminal smoke-test matrix |
| AC-010 | Vitest content extraction, outcome, configuration, and adapter tests |

## Verification evidence

- `npm ci --ignore-scripts`: passed; the lockfile installs reproducibly and audit reported no vulnerabilities.
- `npm test`: passed, 3 files and 34 tests. Covers AC-001 through AC-006 and AC-010, including exact bytes, Qterm's generic environment, invalid configuration, output guards, adversarial payloads, final-response extraction, Markdown/privacy filtering, outcome fallbacks, and the 160-code-point bound.
- `npm run typecheck`: passed under strict TypeScript settings.
- `pi -e . --osc-notify-protocol off --osc-notify-content status --list-models`: exited 0, proving Pi can discover the root package and both extension-defined flags without loading tests as resources (AC-007, AC-010).
- `npm pack --dry-run --json`: passed; package contents include the plugin source, while `pi.extensions` is restricted to `extensions/*/index.ts` (AC-007).
- README review confirms actual install, configuration, test, Qterm, and multiplexer guidance (AC-008).
- AC-009 passed through user-operated Qterm smoke testing: the user reported the protocol tests available and supplied a Qterm screenshot confirming OSC 777 title/body delivery (`Pi: Ready for input`). The later content change does not alter protocol bytes; `/reload` is required before observing dynamic excerpts from the updated extension.

## Risks and mitigations

- **Unreliable auto-detection:** terminal environment variables are conventions, not capability negotiation. Keep explicit override first. OSC 777 is intentionally the unknown fallback because this is a private Qterm-oriented plugin and Qterm does not expose a unique terminal identity; unsupported third-party terminals may silently produce no notification, in which case users can force Bell or OSC 9.
- **Multiplexer/SSH filtering:** document it; avoid pretending inner `$TERM` identifies the desktop terminal. Consider DCS passthrough only after concrete tmux/screen requirements are known.
- **Output corruption:** hard guard TUI + TTY + idle, and keep all raw writes behind one adapter.
- **Notification injection:** fixed default content plus centralized sanitization and bounded payloads.
- **False support claims:** separate protocol-byte conformance tests from manual delivery tests because terminals do not acknowledge notifications.

## Quality check

Embedded standard review: goal and non-goals are bounded; every REQ has AC coverage; the Behavior Delta matches requirements; retry/settlement, invalid configuration, noninteractive output, injection, terminal settings, and multiplexer scenarios are covered. No high-impact ambiguity blocks planning.

## Approval note

Approved by the user on 2026-09-07: proceed with the proposed package layout and `auto` mode using OSC 777 for unknown terminals. Repository inspection confirms that choice is compatible with Qterm. The user subsequently approved default final-response excerpts bounded to 160 code points, with static status mode available. Implementation is active.

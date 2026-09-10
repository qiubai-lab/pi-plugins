---
id: QB-20260910-qb-trace
type: feature
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# QB Trace 本地执行追踪采集器

## Summary

为本 Pi package 增加独立的 `qb-trace` 本地追踪能力。所有已加载该扩展的 Pi 实例在全局记录开关开启时，将 Pi 公共扩展 API 可观察到的会话执行事件完整写入一个本地 SQLite 数据库；采集不依赖查询或 Web Server 运行。独立 CLI 提供全局启停和状态查询，并为后续只读查询/Web 服务保留 `qb-trace server` 命令与模块边界，但 V1 不实现 Server。

## Goal

- 为后续执行流程分析和可视化保存跨 Pi 实例、跨 Session 的本地结构化追踪数据。
- 记录模型公开返回的 thinking、模型输出、工具调用输入与结果、Provider 请求以及相关生命周期和时序信息。
- 让记录开关独立于任一 Pi 实例和未来可视化服务，并保证采集故障不影响 Pi 正常执行。

## Users and outcomes

- Pi 使用者可以通过独立命令一次性启用或关闭所有 Pi 实例的追踪。
- 分析工具可以从统一 SQLite 数据库按 Session、Runtime、Turn、Message 和 Tool Call 查询事件。
- 后续 Web 服务可以只读查询同一数据存储，而不成为采集链路的运行依赖。

## Scope

### In scope

- 一个由当前 package 提供的 Pi 追踪扩展，随 package 正常加载，但不注册会话内 Slash Command。
- 一个 Linux/macOS 用户级独立 CLI：`qb-trace`。
- `qb-trace on`、`qb-trace off` 和 `qb-trace status`。
- 通过一次性安装脚本将 package 内的 `bin/qb-trace` 链接到 `~/.local/bin/qb-trace`。
- 全局、持久化、原子更新的记录配置；运行中和后续启动的 Pi 实例都遵循该配置。
- 单一全局 SQLite 数据库、WAL、跨进程并发追加和按 Session/Runtime 逻辑分区。
- 默认全量采集 Pi 公共扩展 API 实际暴露的执行数据，不执行插件级脱敏或内容截断。
- 数据库 schema 版本管理、可诊断的写入失败和显式数据缺口统计。
- 为后续只读 Query Service 和 `qb-trace server` 保留边界及命令名。
- 操作说明、安全警告和验证覆盖。

### Out of scope

- V1 不实现 `qb-trace server`、HTTP API、SSE、Web UI 或浏览器自动打开。
- 不实现自动删除、保留期限、压缩、归档或 `prune` 命令。
- 不提供上传、远程采集、团队共享、认证或外网监听。
- 不提供 Pi 会话内的 `/trace`、`/trace on` 等 Slash Command。
- 不承诺捕获 Provider 未向 Pi 公开的内部 Chain of Thought、原始 HTTP/SSE response body，或工具在产生 Pi 事件前已截断/丢弃的原始输出。
- 不绕过或修改 Pi 的工具输出限制、Provider 行为、上下文构建或扩展执行顺序。
- 不新增独立 npm package、workspace 或单独发布流程。
- 当前版本不强制移除认证头、凭据、密钥、个人数据或其他敏感内容。

## Current context and constraints

- 当前仓库是一个 Pi package；每个 `extensions/<plugin>/` 是独立扩展边界，`index.ts` 仅作为 Pi 适配和组合入口。
- 确定性的数据转换、配置、存储和查询逻辑应进入插件私有模块并保持可独立测试。
- Pi package 安装不会自动把 package 的 `bin` 链接到用户 `PATH`，因此 V1 使用显式的一次性用户级安装脚本。
- Pi 扩展错误应 fail-open，不得中断 Agent、工具或用户会话。
- SQLite 是唯一权威 Trace 存储；未来 Server 只能通过只读查询边界读取，不拥有记录启停语义。

## Assumptions

- 运行 Pi 的用户对本机 Trace 目录具有读写权限，并接受全量 Trace 可能包含凭据、源码、用户数据和大型 payload。
- `~/.local/bin` 已在用户 `PATH` 中；若未配置，安装流程须明确提示而不是静默成功。
- V1 面向 Linux/macOS；Windows 安装和命令分发不在当前验收范围。
- “完整采集”指插件回调实际可观察到的数据，不代表网络层或模型服务内部的逐字节镜像。

## Requirements

### Recording control

- **REQ-001:** 系统必须提供独立用户级命令 `qb-trace on`，以原子方式持久化开启全局记录；成功后，后续启动以及当前运行中且已加载 QB Trace 扩展的所有 Pi 实例都必须开始记录，无需 `/reload` 或重启 Pi；运行中实例必须在 2 秒内应用变化。
- **REQ-002:** 系统必须提供 `qb-trace off`，以原子方式持久化关闭全局记录；当前运行中的采集器必须在 2 秒内停止新增执行事件，关闭操作不得删除或修改已有 Trace。
- **REQ-003:** 系统必须提供 `qb-trace status`，至少报告全局开关、配置路径、数据库路径、数据库大小、schema 版本、最近存储错误以及可检测的数据缺口/丢失计数。
- **REQ-004:** 记录控制不得依赖 `qb-trace server`、任何 Pi Session、TUI、RPC 或会话内 Slash Command。
- **REQ-005:** 开关状态变化必须留下控制审计记录；关闭边界后的未采集区间必须能够与正常事件缺失区分。

### Event capture

- **REQ-006:** 开启记录时，扩展必须记录 Pi 公共扩展 API 暴露的相关执行生命周期，包括 Session、原始输入、Agent、Turn、上下文、Provider 请求头/请求 payload/响应元数据、消息生命周期、模型公开 thinking、文本输出、工具调用与执行、模型及 thinking level 变化、compaction、tree/navigation、用户 bash 和可观察的失败/中止状态。
- **REQ-007:** V1 必须保存消息和工具的流式更新以及最终权威消息/结果，使分析者能够区分中间增量、最终内容、错误和中止。
- **REQ-008:** V1 默认必须保存扩展实际收到的完整 payload，不得由 QB Trace 主动进行敏感字段脱敏、认证头移除、文本摘要或内容截断；若 Pi 或 Provider 在事件产生前已隐藏、转换或截断内容，系统必须保留可观察结果且不得宣称拥有原始内容。
- **REQ-009:** 每条 Trace 事件必须具有 schema version、UTC 时间、稳定唯一事件 ID、事件类型、Session ID、Runtime ID、Runtime 内单调 sequence，并在适用时关联 Agent Run、Turn、Message 和 Tool Call。
- **REQ-010:** 并行工具调用和多个 Pi 进程不得依赖事件到达顺序推断关联关系；Tool Call 必须优先使用 Pi 提供的 `toolCallId` 或等价调用 ID 关联开始、更新、结果和结束事件。
- **REQ-011:** Session resume、new、fork、clone、tree navigation、reload 和 compaction 不得导致已有事件被覆盖；同一 Session 的不同运行实例必须通过 Runtime ID 区分。
- **REQ-012:** 采集器必须记录当前 Provider、模型、thinking level，以及 Pi 提供的 token、cache、cost、stop reason 和错误信息，但不得自行伪造 Provider 未提供的数值。

### Storage

- **REQ-013:** 所有 Runtime 必须写入用户级单一 SQLite 数据库，并按 Session ID 和 Runtime ID 逻辑分区；不得要求每 Session 独立数据库或 Server 参与写入。
- **REQ-014:** SQLite 必须使用 WAL 和短批量事务支持多个 Pi 实例并发追加；Server/未来分析者的读取不得长期阻塞采集写入。
- **REQ-015:** 存储必须采用追加式事件语义和幂等唯一约束，重试不得产生无法识别的重复事件，已提交事件不得因后续 Session 操作被就地改写。
- **REQ-016:** 数据库必须包含显式 schema version，并支持拒绝不兼容的新 schema；V1 不得静默破坏或重建未知版本数据库。
- **REQ-017:** V1 不得自动删除、截断、压缩或按容量清理任何已提交 Trace；`status` 必须让用户看见持续增长的数据库大小。

### Reliability and isolation

- **REQ-018:** 追踪初始化、配置读取、序列化、SQLite 锁定、磁盘满、数据库损坏及其他采集错误必须 fail-open，不得阻断、取消、修改或延迟完成 Pi 的 Agent 与工具行为。
- **REQ-019:** 采集器必须使用非阻塞、按事件数和总字节数双重限制的有界内存队列、有界数据库重试和批量提交；达到可靠性边界时可以丢弃整个事件但不得截断事件内容，并必须通过数据库之外的用户级诊断状态累计并暴露丢失数量和最近错误，不得静默伪装成完整记录。
- **REQ-020:** `qb-trace off`、Pi 正常 `session_shutdown` 和进程正常退出必须尝试在最多 2 秒内刷新待写事件；刷新失败仍不得阻止 Pi 退出。
- **REQ-021:** 多进程并发、异常退出或单个 Runtime 写入失败不得要求删除整个数据库才能恢复其他 Runtime 的后续采集。
- **REQ-022:** QB Trace 扩展不得修改其观察到的输入、上下文、Provider payload/headers、消息、工具参数或工具结果。

### CLI distribution and future server boundary

- **REQ-023:** 当前 package 必须提供一次性安装脚本，将仓库内受版本管理的 `bin/qb-trace` 以用户级链接方式安装到 `~/.local/bin/qb-trace`；重复执行必须幂等，不得覆盖不属于本 package 的现有文件。
- **REQ-024:** `qb-trace` CLI 必须可在没有运行 Pi、没有运行 Trace Server 的情况下完成 on/off/status，并以非零退出码和可操作错误说明报告失败。
- **REQ-025:** V1 必须保留 `qb-trace server` 子命令名称和只读 Trace Query Service 模块边界，但不得启动占位服务或将未实现行为报告为成功。
- **REQ-026:** 未来 Server 的读取路径必须能够使用只读 SQLite 连接，且不得成为采集器写入、开关检测或 schema 所有权的依赖。

### Documentation and security disclosure

- **REQ-027:** 使用文档必须明确说明默认全量记录可能保存认证头、密钥、源码、个人数据、图片及工具输出，数据库不得在未经检查时共享。
- **REQ-028:** 使用文档必须说明公共扩展 API 的可观察性边界、Server 尚未实现、不自动清理数据、CLI 的 Linux/macOS 范围、安装链接方式以及 `~/.local/bin` 的 PATH 要求。

## Behavior Delta

### ADDED

- **REQ-001:** 新增 `qb-trace on` 全局启用行为。
- **REQ-002:** 新增 `qb-trace off` 全局停用行为。
- **REQ-003:** 新增 `qb-trace status` 本地状态与诊断行为。
- **REQ-006:** 新增所有已加载实例的 Pi 执行事件全量采集。
- **REQ-013:** 新增全局 SQLite Trace 存储。
- **REQ-023:** 新增用户级 `qb-trace` CLI 安装入口。
- **REQ-025:** 为后续 `qb-trace server` 保留兼容命令名和只读查询边界。

## Acceptance criteria

- **AC-001 [REQ-001, REQ-004]:** 在 Server 未运行的情况下执行 `qb-trace on` 后，新启动的两个 Pi 实例都向同一 SQLite 数据库写入具有不同 Runtime ID 的事件；已运行实例无需 reload，并在 2 秒内开始记录。
- **AC-002 [REQ-002, REQ-005, REQ-020]:** 执行 `qb-trace off` 后，运行中的实例在 2 秒内停止新增执行事件并在最多 2 秒的刷新窗口后完成停用，已有记录保持不变，并可从控制审计记录识别关闭边界和未记录区间。
- **AC-003 [REQ-003, REQ-017, REQ-019]:** `qb-trace status` 在记录开启、关闭、数据库不存在、数据库不可读、发生模拟写入失败和存在丢失事件时均返回真实、可区分且可操作的信息，包括数据库大小和来自数据库外诊断状态的错误/缺口计数。
- **AC-004 [REQ-006, REQ-007, REQ-008, REQ-012]:** 一次包含公开 thinking、文本流、至少一个成功工具、一个失败或中止工具及后续模型回复的受控 Pi 会话，在数据库中可查到对应生命周期、增量、最终内容、输入、结果、模型、usage、cost 和停止状态，且 QB Trace 未主动脱敏或截断测试标记值。
- **AC-005 [REQ-006, REQ-008]:** 受控 Provider 请求中的系统/消息 payload、工具 schema、请求参数和请求头测试标记能够从 Trace 查询；测试同时证明系统不会把 API 未暴露的 response body 或模型内部 reasoning 标记为已捕获。
- **AC-006 [REQ-009, REQ-010, REQ-011, REQ-015]:** 并行工具、reload、resume、fork/tree 和重试场景中的事件 ID 唯一、Runtime 内 sequence 单调、Tool Call 关联正确，重试不会产生违反唯一约束的不可识别重复，历史行不会被覆盖。
- **AC-007 [REQ-013, REQ-014, REQ-021]:** 多进程并发压力验证证明所有实例使用同一 WAL 数据库，正常读查询可与批量写并行，单 Runtime 异常退出后其他 Runtime 仍能继续提交可查询事件。
- **AC-008 [REQ-016]:** 已知 schema 可正常初始化/重开；人为设置未知更新版本后，采集器 fail-open 并报告不兼容，既不重建也不修改数据库。
- **AC-009 [REQ-018, REQ-019, REQ-020, REQ-022]:** 模拟锁超时、磁盘/写入错误、损坏和队列饱和时，Pi 的受控 Agent/工具结果保持不变并完成；采集器在有界时间内返回，记录错误和丢失数，且没有修改任何被观察事件对象。
- **AC-010 [REQ-023, REQ-024]:** 在 Linux/macOS 测试环境中，安装脚本首次安装及重复执行成功；发现非本 package 所有的目标时安全失败；安装后的 `qb-trace` 可在没有 Pi/Server 进程时执行 on/off/status，失败使用非零退出码。
- **AC-011 [REQ-025, REQ-026]:** V1 调用 `qb-trace server` 明确返回“当前版本未实现”和非零退出码；模块依赖检查证明采集路径不依赖 Server，预留 Query Service 只能通过存储只读接口访问数据。
- **AC-012 [REQ-027, REQ-028]:** 文档审查确认全量敏感数据警告、可观察性边界、无自动清理、Server 非 V1、支持平台、CLI 安装及 PATH 要求均有明确说明。

## Design decisions

1. **全局单一 SQLite，而非每 Session 文件：** 简化跨 Session 查询、schema migration、统计和未来 Web 分页；通过 WAL、短事务、批量和有界重试处理低到中频多进程写竞争。
2. **采集与 Server 解耦：** PI 扩展直接持久化；Server 未来只读，因此关闭可视化不会造成追踪缺口。
3. **全量为默认：** 当前主要目标是流程分析完整性；安全风险通过明确披露而非当前版本脱敏处理。
4. **独立 CLI 而非 Slash Command：** 全局开关不隶属于任一会话，且在没有 Pi 进程时仍可管理。
5. **fail-open 而非审计级阻断：** PI 开发行为优先；存储故障允许产生缺口，但必须可见。
6. **同 package 用户级链接，而非独立 npm CLI：** 保持当前单 package 和单发布边界，接受一次性安装步骤及 Linux/macOS 范围。

## Risks and mitigations

- **高敏数据落盘：** 当前明确接受不脱敏；通过文档警告、用户级目录和禁止默认共享降低误用风险。文件权限与目录安全将在计划中作为安全检查项细化。
- **数据库无限增长：** V1 不自动删除；通过 status 暴露大小，后续 change 可增加显式 prune/retention。
- **SQLite 单写者竞争：** 使用 WAL、短批次、有界重试及每 Runtime 队列；压力验收覆盖锁竞争和进程退出。
- **“全量”被误解为网络抓包：** 文档与 schema 明确区分 extension-observed 数据和 Provider/Pi 已隐藏或截断的数据。
- **扩展顺序影响最终值：** Observer 不修改事件，但后加载扩展仍可能修改 provider/tool middleware 数据；Trace 必须记录观察点和事件阶段，不宣称一定是后续插件处理后的最终值。
- **CLI 链接漂移或 PATH 缺失：** 安装脚本幂等校验目标所有权，并对 PATH 给出可操作提示。
- **正常退出仍可能丢失缓冲：** 使用有界 shutdown flush；异常终止和存储失败通过 gap/error 状态诚实呈现。

## Verification Evidence

- **VER-001 / AC-001:** Multi-runtime adapter integration enabled one global home without a Server, wrote two Session/Runtime identities to one database, and live configuration polling applied without reload within the two-second contract.
- **VER-002 / AC-002:** The live-off integration used the real CLI control path, confirmed post-propagation marker events were absent, retained prior rows, and persisted the off control boundary.
- **VER-003 / AC-003:** CLI tests covered on, off, status, absent/corrupt databases, size/schema/event reporting, external error/drop diagnostics, and truthful exit codes.
- **VER-004 / AC-004:** A controlled Pi adapter fixture persisted raw thinking/text updates, final model output, successful and failed tool lifecycles, inputs, results and terminal status markers.
- **VER-005 / AC-005:** Provider fixtures preserved synthetic Authorization, system prompt, request payload and tool schema markers without QB Trace redaction; documentation and event vocabulary keep unavailable response bodies/internal reasoning outside the captured contract.
- **VER-006 / AC-006:** Event/store tests proved unique runtime-sequence IDs, monotonic sequencing, call-ID linkage, append idempotency, separate Runtime identities and append-only rows across lifecycle fixtures.
- **VER-007 / AC-007:** Three concurrent Node writer processes committed 75 events through one WAL database while a read-only observer remained open; all rows were queryable after writer exit.
- **VER-008 / AC-008:** Clean initialization and compatible reopen passed; a database marked schema 99 was refused and remained byte-for-byte unchanged.
- **VER-009 / AC-009:** Fault tests covered write failure, malformed database, bounded retry, byte/count queue limits, whole-event drop, bounded shutdown, external diagnostics and non-mutation of observed headers.
- **VER-010 / AC-010:** The isolated HOME/PATH installation harness passed first install, idempotent repeat, foreign-target refusal and direct standalone execution. `sh -n` passed for both POSIX scripts; the current Linux host executed the smoke path, while macOS compatibility is based on the same POSIX-only script contract rather than a separate macOS runner.
- **VER-011 / AC-011:** `qb-trace server` returned the reserved not-implemented message and exit code 2; source inspection found no HTTP listener or Server dependency, and `query.ts` exposes the read-only future Server boundary.
- **VER-012 / AC-012:** README documents installation, commands, sensitive full capture, observation limits, unlimited growth, fail-open gaps, platform scope, rollback semantics and the non-operational V1 Server.
- **VER-013 / all AC:** `npm test` passed 101 tests in 16 files; `npm run typecheck`, `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`, `git diff --check`, standalone CLI smoke, and `pi -ne -e . --osc-notify-protocol off --list-models` all passed on the final implementation state.

## Architecture and behavior-protection result

- Boundary check passed: `index.ts` is the Pi adapter; configuration, envelope/correlation, collector, SQLite store, external diagnostics, read-only query and CLI use cases have one-way local dependencies; `bin/` and installation script stay thin and no sibling plugin private import was introduced.
- Critical behavior is protected by focused tests for global switching, full sensitive payload retention, non-mutation, concurrent WAL writes, schema refusal, fail-open loss reporting, bounded shutdown and guarded CLI installation.
- Directory structure changes are recorded in `docs/qb-spec/DIRECTORY_MAP.md`.

## Residual risks

- A native macOS execution runner was not available in this environment; scripts deliberately use the tested POSIX subset and avoid GNU-only flags, but the first real macOS installation remains a release smoke check.
- Abrupt process termination can lose queued events without updating diagnostics; V1 guarantees visible gaps only for failures the process can observe.
- Full streaming snapshots and the absence of retention can grow the database rapidly, as explicitly accepted for V1.

## Compatibility and rollback

- 新功能默认为关闭，直至用户执行 `qb-trace on`；仅安装 package 不应创建执行事件。
- 回滚可执行 `qb-trace off`，禁用该扩展并移除用户级 CLI 链接；历史 SQLite 数据保持不变。
- V1 不自动降级、删除或重写未知 schema 数据库。
- 后续 Server 和 retention 必须作为独立行为增量加入，不得改变 V1 中“Server 非采集依赖”和“不自动删除”的契约，除非获得新的明确批准。

## Open questions

无阻塞性产品问题。SQLite Node 驱动、具体轮询/通知机制、批量阈值、表结构和文件权限实现细节进入独立实施计划及架构检查，不在需求层预先锁定。

## Tier rationale

该功能默认持久化认证头、密钥、源码和个人数据，涉及多进程共享数据库、全局控制和潜在数据完整性缺口；其安全、并发与恢复后果足以采用 strict tier，并要求独立规格审查、独立计划及风险定向验证。

## Authorization record

用户已在 2026-09-10 的需求沟通中分别批准：

- 全局单 SQLite、按 Session/Runtime 逻辑分区；
- `qb-trace` 与未来 Server 独立，Server 不属于 V1；
- `qb-trace on/off/status` 独立 CLI，不提供会话内 Slash Command；
- 默认全量采集，当前不强制移除认证头或密钥；
- 不自动删除数据；
- fail-open 并显式报告数据缺口；
- package 内 CLI 加一次性用户级链接安装，V1 面向 Linux/macOS。

该记录授权以上需求选择进入 draft，不等同于批准开始实现。

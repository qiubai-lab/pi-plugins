---
id: QB-20260907-marketplaces-command-removal
type: feature
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# 移除 marketplaces 命令入口

批准来源：用户明确要求移除 `/marketplaces`，最终只保留现有的 `/plugins`（复数）入口。

## 目标与范围

将 Marketplace Loader 的用户入口收敛为 TUI 中的 `/plugins`。移除 `/marketplaces` 命令注册、相关参数解析、帮助与 README 说明，并调整自动化测试。

## 非目标

- 不改名或移除 `/plugins`。
- 不改变 `/plugins` 管理器内部的添加、更新、删除、诊断和 Plugin 开关能力。
- 不删除 service 层能力或修改持久化数据。
- 不为 RPC、Print、JSON 模式增加替代管理入口。

## 需求

- REQ-001：Marketplace Loader 只注册 `/plugins`，不再注册 `/marketplaces`。
- REQ-002：`/plugins` 继续仅在 TUI 模式打开交互式管理器；非 TUI 模式返回中文错误，不再引导使用已移除命令。
- REQ-003：README 只说明 `/plugins` 入口，不再列出或推荐 `/marketplaces` 文本子命令。
- REQ-004：移除仅供 `/marketplaces` 使用的 adapter 代码和测试，不改变 manager/service 行为。

## Behavior Delta

### MODIFIED

- REQ-001：命令入口由 `/plugins` 与 `/marketplaces` 并存改为仅 `/plugins`。
- REQ-002：非 TUI 提示不再提供文本命令降级路径。
- REQ-003：文档不再公开文本管理命令。

### REMOVED

- REQ-004：移除 `/marketplaces` 的 list、plugins、add、update、remove、enable、disable、doctor 文本适配入口。

## 验收

- AC-001 [REQ-001, REQ-004]：注册测试确认存在 `plugins` 命令且不存在 `marketplaces` 命令。
- AC-002 [REQ-002]：TUI 调用 `/plugins` 仍打开 manager，非 TUI 调用显示中文错误且不引用 `/marketplaces`。
- AC-003 [REQ-003]：README 的 Marketplace Loader 使用说明不再出现 `/marketplaces`。
- AC-004 [REQ-004]：Marketplace manager、service 及仓库 TypeScript 检查继续通过。

## 实施步骤

- [x] 更新命令注册测试，先刻画仅保留 `/plugins` 的目标契约。
- [x] 删除 `index.ts` 中 `/marketplaces` adapter 及不再使用的帮助和导入，调整非 TUI 提示。
- [x] 精简 README 和 adapter 测试，保留 manager/service 行为覆盖。
- [x] 运行相关测试、全量测试和类型检查。

## 架构边界

本次只收缩 `index.ts` 的 Pi command adapter；`controller.ts` 继续拥有交互编排，`service.ts` 继续拥有生命周期逻辑。不得把被删除 adapter 的逻辑迁入 manager 或 service。

## 验收映射

| 验收 | 直接检查 |
| --- | --- |
| AC-001 | `index.test.ts` 命令注册断言 |
| AC-002 | `index.test.ts` TUI/非 TUI 调用测试 |
| AC-003 | README 聚焦扫描 |
| AC-004 | `npm test`、`npm run typecheck` |

## 验证证据

- AC-001：`index.test.ts` 断言注册 `plugins` 且不注册 `marketplaces`。
- AC-002：`index.test.ts` 验证 TUI 打开 manager，RPC 返回中文错误且不引用已移除命令。
- AC-003：README 已改为仅说明 `/plugins`；对活动源码、README、Directory Map 和 context 的 `/marketplaces` 命令扫描无结果。
- AC-004：`npm test` 通过，9 个测试文件、73 个测试全部通过；`npm run typecheck` 通过。
- `git diff --check`：通过。
- Directory Map 与 Architecture Specification 已同步为 TUI-only `/plugins` adapter。

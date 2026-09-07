---
id: QB-20260907-marketplace-default-ref-cn
type: feature
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# Marketplace 默认引用与中文说明

批准来源：用户在当前会话中确认不考虑 latest 标签，未指定引用时沿用远程 `origin/HEAD`，并要求该插件的相关说明使用中文。

## 目标与范围

降低添加和更新 Marketplace 时的操作负担，同时统一插件自有的用户说明语言。

范围包括交互式管理器、`/marketplaces` 文本命令、Git 快照解析、状态保存、README 和相关自动化测试。外部 Marketplace/Plugin 自带的名称、描述、能力标识以及命令关键字不翻译。

## 非目标

- 不自动选择或跟踪 latest、最新版本或最新时间标签。
- 不改变显式 branch、tag、commit 的支持和安全校验。
- 不迁移现有状态 schema；已有 source 继续使用已保存的 `ref`。
- 不翻译 Git 自身输出或远程仓库提供的内容。

## 需求

- REQ-001：添加 Marketplace 时允许省略 Git ref；省略时必须解析并使用远程 `origin/HEAD` 指向的默认分支，不能硬编码 `main` 或 `master`。
- REQ-002：成功添加后必须把解析出的实际默认分支名保存到现有 `source.ref`，后续更新继续沿用该值。
- REQ-003：交互式添加只询问 Git URL，交互式更新不再询问 ref；文本命令仍允许可选显式 ref 作为高级覆盖入口。
- REQ-004：插件自有的 TUI 标签、帮助提示、确认/通知文案、命令说明和 README 相关说明使用中文；技术标识和外部内容保持原样。
- REQ-005：无法解析 `origin/HEAD`、显式 ref 不合法或不可解析时必须失败并清理临时快照，现有安全边界保持不变。

## Behavior Delta

### ADDED

- REQ-001：新增省略 ref 时自动采用远程默认分支的行为。
- REQ-004：新增 Marketplace Loader 自有用户说明的中文化行为。

### MODIFIED

- REQ-002：添加 source 从保存必填 ref 改为保存显式 ref 或自动解析出的实际默认分支。
- REQ-003：原先交互式流程强制单独输入 ref，改为普通流程无 ref 输入，文本命令保留可选覆盖。
- REQ-005：ref 解析增加 `origin/HEAD` 路径，同时保持失败清理和安全校验。

## 验收

- AC-001 [REQ-001, REQ-002]：对默认分支不是硬编码假设的测试仓库省略 ref 添加成功，状态中的 `ref` 为 `origin/HEAD` 对应的实际分支名，commit 正确。
- AC-002 [REQ-003]：交互式添加只消费一个 URL 输入，交互式更新直接使用已配置 ref；`/marketplaces add <git-url>` 和带可选 ref 的形式均可执行。
- AC-003 [REQ-004]：Marketplace Loader 自有的交互标签、帮助、确认/通知和 README 说明均为中文，保留必要技术标识。
- AC-004 [REQ-005]：缺失 `origin/HEAD` 和非法/不存在显式 ref 会失败，临时目录被清理；既有中止与显式 ref 流程继续通过。

## 实施步骤

- [x] 先补 Git、service、controller 和 command adapter 的行为测试，覆盖默认引用和简化交互。
- [x] 在 Git adapter 内解析 `origin/HEAD`，把 commit 与实际 ref 一并返回；service 保存解析结果。
- [x] 简化交互式流程和文本命令参数，并中文化插件自有用户文案与 README。
- [x] 运行受影响测试和严格 TypeScript 检查，记录验收证据。

## 架构边界

默认引用解析属于 `git.ts`；source 生命周期和保存解析结果属于 `service.ts`；交互编排与中文文案分别留在 `controller.ts`、`ui.ts` 和 `index.ts`。不把 Git 解析规则放入 UI/controller，也不引入新的通用工具层。

## 验收映射

| 验收 | 直接检查 |
| --- | --- |
| AC-001 | `service.test.ts` 默认分支添加与持久化用例 |
| AC-002 | `controller.test.ts`、`index.test.ts` 添加/更新参数与输入次数用例 |
| AC-003 | `ui.test.ts`、`index.test.ts` 文案断言及 README 聚焦检查 |
| AC-004 | `service.test.ts` Git 失败清理、非法和缺失 ref 用例 |

## 验证证据

- AC-001：`service.test.ts` 使用真实本地 Git 仓库验证省略 ref 后解析 `origin/HEAD`、保存 `main` 与正确 commit。
- AC-002：`controller.test.ts` 验证添加只消费 URL、更新不消费 ref 输入；`index.test.ts` 验证 add 可省略或显式提供 ref。
- AC-003：Marketplace 自有 TUI、command adapter 和 README 文案已中文化；聚焦英文旧文案扫描无结果。
- AC-004：相关测试覆盖无法解析 `origin/HEAD` 后的清理、非法/不存在显式 ref、中止清理和既有显式 ref。
- `npm test`：通过，9 个测试文件、77 个测试全部通过。
- `npm run typecheck`：通过。
- `git diff --check`：通过。

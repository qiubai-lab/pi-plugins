# pi-plugins

自用 Pi 插件合集。仓库作为一个 Pi package 安装，每个插件保持独立入口，可通过 package filter 单独启用或关闭。

## 安装

推荐通过 GitHub HTTPS 地址安装到个人配置，使插件在所有仓库中可用：

```sh
pi install https://github.com/qiubai-lab/pi-plugins.git
```

安装后可确认 package 来源和安装位置：

```sh
pi list
```

若只希望在当前项目加载本 package，可在已信任的项目根目录执行：

```sh
pi install -l https://github.com/qiubai-lab/pi-plugins.git
```

项目级 package 会写入 `.pi/settings.json`；它控制 Marketplace Loader 和 OSC Notify 扩展在哪些项目加载，不等同于 `/plugins` 中 Plugin 的“个人/仓库”安装作用域。

### Package 配置

运行 `pi config` 可以启用或停用本 package 中的独立扩展：

```sh
pi config
```

- 默认编辑个人配置 `~/.pi/agent/settings.json`；
- `pi config -l` 编辑当前项目的 `.pi/settings.json`；
- 配置界面中可分别控制 `marketplace-loader`、`osc-notify`、`qb-trace`、`betterwright`、`pi-lens`、`pi-web-access` 和 `pi-subagents`；
- 项目配置会覆盖或收窄继承的个人 package 配置。

本 package 会同时安装并加载以下社区插件：

- [`betterwright`](https://www.npmjs.com/package/betterwright)：提供基于 Playwright 的浏览器自动化扩展；
- [`pi-lens`](https://www.npmjs.com/package/pi-lens)：提供代码导航扩展和 Skills；
- [`pi-web-access`](https://www.npmjs.com/package/pi-web-access)：提供网页访问扩展；
- [`pi-subagents`](https://www.npmjs.com/package/pi-subagents)：提供 subagent 扩展、Skills 和 Prompt Templates。

它们由本仓库作为运行时依赖统一安装，无需再单独执行 `pi install`。本仓库不提交 npm lockfile，并使用 `latest` 标签，以便每次全新安装时解析这些插件的最新版本。

部分高级能力仍需要浏览器、系统命令、语言工具链或服务凭据。首次安装后请参阅[社区插件配置与额外依赖](docs/community-plugins-setup.md)，其中包含 BetterWright 浏览器初始化、Pi Lens 语言工具、Pi Web Access 视频组件以及 Pi Subagents 外部 CLI 的配置说明。

更新已安装的 package：

```sh
# 更新所有未固定版本的 package
pi update --extensions

# 只更新本 package
pi update --extension https://github.com/qiubai-lab/pi-plugins.git
```

在本仓库开发时，已安装版本与 `-e .` 会重复注册扩展。应禁用自动发现的扩展，只临时加载当前工作区：

```sh
pi -ne -e .
```

Pi package 中只会发现 `extensions/*/index.ts`，测试和内部模块不会被当成插件加载。

### 卸载

建议先在 Pi TUI 中清理 Marketplace Loader 管理的状态：

1. 在每个使用过仓库安装的项目中运行 `/plugins`，进入对应 Marketplace 的“Plugin 安装（仓库）”，取消安装并确认；
2. 在“Plugin 安装（个人）”中停用不再需要的 Plugin；
3. 从 Marketplace 操作页选择“移除 Marketplace”，删除私有快照和选择状态；
4. 退出 Pi 后移除 package。

个人安装的 package：

```sh
pi remove https://github.com/qiubai-lab/pi-plugins.git
```

项目安装的 package：

```sh
pi remove -l https://github.com/qiubai-lab/pi-plugins.git
```

如果安装时使用了其他 source 写法，先运行 `pi list`，再把其中显示的原始 source 传给 `pi remove`。直接移除 package 不会自动删除已经复制到其他仓库 `.agents/skills/` 的 Skill，因此应优先按上述顺序在 `/plugins` 中卸载。

## OSC Notify

`extensions/osc-notify` 在 Pi 完全结束当前运行并等待输入时发送一次终端通知。它监听 `agent_settled`，不会在自动重试、上下文压缩重试或排队的 follow-up 之间提前通知。

### 协议

| 模式 | 输出 | 用途 |
| --- | --- | --- |
| `bell` | BEL (`0x07`) | 使用终端自身的响铃/视觉提醒设置 |
| `osc9` | `OSC 9 ; text ST` | 单字段桌面通知 |
| `osc777` | `OSC 777 ; notify ; title ; body ST` | 带标题和正文的桌面通知 |
| `auto` | 自动选择 | 默认模式 |
| `off` | 无输出 | 禁用通知 |

自动选择规则：

- iTerm2、Ghostty：OSC 9；
- WezTerm、rxvt/urxvt、Qterm 及其他未知终端：OSC 777。

Qterm 的本地和远程会话有意使用通用终端身份，因此通常会进入未知终端分支。OSC 777 是本私人插件针对 Qterm 选择的默认值，而不是对所有终端兼容性的保证。

### 配置

优先级从高到低：

1. CLI 参数 `--osc-notify-protocol`
2. 环境变量 `PI_OSC_NOTIFY_PROTOCOL`
3. `auto`

```sh
pi --osc-notify-protocol osc777
PI_OSC_NOTIFY_PROTOCOL=bell pi
PI_OSC_NOTIFY_PROTOCOL=off pi
```

合法值为 `auto`、`bell`、`osc9`、`osc777`、`off`。非法值会在 TUI 中显示警告并回退到 `auto`。

通知正文另有两种模式，优先级为 CLI 参数 `--osc-notify-content`、环境变量 `PI_OSC_NOTIFY_CONTENT`、默认值 `result`：

```sh
# 默认：展示最终回复摘要
pi --osc-notify-content result

# 隐私模式：只展示固定完成状态
PI_OSC_NOTIFY_CONTENT=status pi
```

- `result`：提取最终 assistant 回复中的文本，移除 Markdown、代码块和长链接，合并为一行并限制在 160 个 Unicode code point；thinking、工具调用和工具输出不会进入通知。
- `status`：始终使用固定正文 `已完成，等待输入`。
- 回复被截断、运行中止、模型错误或没有可用文本时使用明确的短状态，不发送内部错误或推理内容。

非法正文模式会回退到 `result`。插件仅向空闲的交互式 TTY 写入控制序列，不会向 RPC、JSON、Print 模式或重定向的 stdout 写入通知字节。协议编码还会移除控制字符和双向控制字符、替换 OSC 777 分隔符，并限制标题为 128 个 Unicode code point、协议正文为 1024 个。

### 手动测试

在 Pi 中运行：

```text
/osc-notify-test
/osc-notify-test bell
/osc-notify-test osc9
/osc-notify-test osc777
```

无参数时测试当前协议配置，测试正文固定为 `通知正文测试`，不会复用会话内容。终端和操作系统可能要求单独开启通知权限，也可能在窗口聚焦时抑制通知。OSC 协议没有投递回执，因此插件无法在未展示时自动切换到另一协议。

Qterm 可在「系统设置 → 高级 → 终端通知」中控制接收行为；“显示通知正文”关闭时仍会保留通知和未读提示，但隐藏 OSC 携带的正文。

### tmux / screen

首版不封装 tmux/screen passthrough。复用器可能隐藏外层终端身份或过滤 OSC；遇到这种情况应配置复用器透传，或显式选择 `bell`。不要同时发送多个协议作为降级方案，否则 Qterm 等支持多个协议的终端会收到重复提醒。

## QB Trace

`extensions/qb-trace` 是默认关闭的本地全量执行追踪采集器。它在开启后监听 Pi 的 Session、Agent、Turn、Provider、消息、thinking、工具、compaction 和 tree 等公共扩展事件，并把各 Pi 进程观察到的完整 payload 追加到同一个 SQLite WAL 数据库。采集不依赖 Web Server，也不注册 Pi 会话内 Slash Command。

### 安装独立命令

Pi package 安装不会自动把 package 的可执行文件加入 `PATH`。进入本 package 的实际安装目录（可先用 `pi list` 查看）后执行一次：

```sh
npm run install:qb-trace
```

脚本只会创建 package 自己拥有的链接：

```text
~/.local/bin/qb-trace -> <package-root>/bin/qb-trace
```

如果目标已被其他文件占用，脚本会拒绝覆盖。如果 `~/.local/bin` 不在 `PATH`，请按脚本提示加入。V1 支持 Linux 和 macOS，需要 Node.js 22.19 或更新版本。

### 启停和状态

```sh
qb-trace on       # 持久化开启所有已加载 qb-trace 扩展的 Pi 实例
qb-trace off      # 停止新增执行事件，不删除历史数据
qb-trace status   # 查看路径、schema、大小、事件数、错误和数据缺口
qb-trace server   # V1 保留名称但尚未实现，返回非零退出码
```

运行中的 Pi 实例会在两秒内感知 on/off，无需 `/reload`。如果通过 `pi config` 禁用了 `qb-trace` 扩展，全局 `on` 不会强制加载它。

默认目录为 `~/.pi/agent/qb-trace/`：

```text
config.json       全局记录开关
traces.sqlite     唯一权威 Trace 数据库
diagnostics/      SQLite 不可用时仍可读取的逐 Runtime 错误/丢失计数
```

设置 `QB_TRACE_HOME` 可以覆盖该目录；`PI_CODING_AGENT_DIR` 仍控制默认 Pi agent 目录。

### 重要安全与容量说明

QB Trace 当前**不脱敏、不移除认证头、不摘要且不主动截断事件 payload**。数据库可能包含 API 密钥、Authorization header、系统提示词、源码、个人数据、图片、thinking 和完整工具输入输出。不要在未经检查时共享数据库，并按高敏感文件保护整个目录。

“全量”仅指 Pi 公共扩展回调实际暴露给采集器的数据：Provider 未公开的内部 Chain of Thought、原始 HTTP/SSE response body，以及在事件产生前已被 Pi、工具或 Provider 截断/隐藏的内容无法恢复。其他后加载扩展仍可能在 QB Trace 的观察点之后修改 middleware 数据。

V1 不自动删除、轮转、压缩或限制已提交数据，数据库会持续增长。SQLite 锁定、磁盘满、损坏、队列饱和等错误采用 fail-open：Pi 继续运行，最多重试后允许丢失整个 Trace 事件，`qb-trace status` 会显示可检测的错误和缺口。`qb-trace off`、正常 Session shutdown 和正常退出会尝试在最多两秒内刷新队列，但不阻止 Pi 退出。

未来的 `qb-trace server` 将使用只读查询边界访问同一数据库；Server 是否运行不会改变采集开关或写入路径。

## Marketplace Loader

`extensions/marketplace-loader` 集中管理远程、同时适配 Pi 与 Codex 的 skill marketplace。Pi 只需安装本仓库；加载器会将受信任的远程仓库保存为私有快照，并按 Codex marketplace 中的 plugin 分组启用 skill。

### 仓库要求

远程仓库必须同时包含：

- 根 `package.json`，且 `pi.skills` 非空；
- `.agents/plugins/marketplace.json`；
- 使用仓库内 `local` source 的 plugin 条目；
- 每个 plugin 的 `.codex-plugin/plugin.json` 和其中声明的 `skills` 目录。

P1 不支持 URL、git-subdir、npm plugin source，也不加载 Codex commands、agents、hooks、MCP、apps 或自动执行 scripts。快照会拒绝路径越界、符号链接、特殊文件、重复 skill 名及过大的文件树。

### 交互式管理

在 Pi TUI 中运行：

```text
/plugins
```

管理器提供可搜索的 Marketplace 列表、个人 Plugin 开关、当前仓库安装和兼容性详情，并可完成添加、更新、删除和诊断。使用方向键导航、Enter 选择；Plugin 页面用 Space/Enter 切换、Ctrl+S 保存，修改后按 Esc 也会保存并返回。新增或取消安装会在真正写入前要求确认。Git 获取期间显示可取消的 Loader，按 Esc 会中止子进程并清理临时快照。资源变更会暂存到管理流程结束，关闭管理器后最多执行一次 reload。

Marketplace Loader 只提供 `/plugins` 入口；RPC、Print、JSON 等非 TUI 模式不支持管理操作。

添加仓库只需提供 Git URL，加载器会解析并使用远程 `origin/HEAD` 指向的默认分支，不会猜测 `main`、`master` 或 latest 标签。添加只建立经过校验的 commit 快照，不会默认启用 Plugin。启用或安装前还会单独确认，因为 Skill 是可影响模型工具使用的受信任指令。更新沿用已保存的 ref，不再单独询问；更新会先获取和校验候选快照，再显示旧、新 commit 并确认激活，失败或拒绝不会替换当前快照。

默认状态目录为 `~/.pi/agent/marketplaces/`，可用 `PI_MARKETPLACE_HOME` 覆盖。Git 克隆不初始化 submodule，不运行 npm、Codex、仓库 hooks 或 plugin scripts。

“安装到当前仓库”只在受信任的 Git 仓库中可用。加载器会把选中 Plugin 的完整 Skill 目录原子复制到仓库根的 `.agents/skills/<skill-name>/`，并在 `.pi/marketplace-loader.lock.json` 记录来源、commit 和文件所有权。Pi 与其他支持项目级 Agent Skills 的 Agent 可以直接发现这些 Skill；这不会替各平台注册 Marketplace Plugin、commands、hooks、MCP 或其他非 Skill 能力。加载器拒绝覆盖不在锁文件中登记的同名目录，停用时也只删除自己管理的 Skill。更新 Marketplace 时会同步当前仓库已经安装的 Plugin；其他仓库会在各自打开管理器并更新时同步。

个人和仓库安装可以同时存在。当前仓库已安装的同名 Skill 会遮蔽加载器提供的个人副本，避免 Pi 重复发现。若还通过 Claude、Codex、Kimi 或 Pi 的其他安装方式加载同名 Skill，仍需由用户移除重复入口。项目安装生成的 Skill 与锁文件是否提交到 Git 由仓库自行决定；若不提交，其他机器不会自动恢复这些文件。

不要在同一 Pi 配置中既由本加载器管理某个 Marketplace，又通过 `pi install` 直接安装同一仓库，否则 Pi 可能重复发现 Skill。迁移已有安装时先用 `pi list` 确认 source，再在 shell 中执行 `pi remove <my-skills-source>`。集中模式只安装本 `pi-plugins` 包，然后运行 `/plugins`，在交互式管理器中添加 Marketplace 并启用所需 Plugin。

加载器会检测其管理范围内的 Skill 名冲突；与其他 Pi package 或用户 Skill 的冲突仍由 Pi 自身告警。

## 开发

需要 Node.js 22.19 或更新版本：

```sh
npm ci
npm test
npm run typecheck
```

新增插件时使用独立的 `extensions/<plugin>/index.ts` 入口。插件私有实现和测试留在自己的目录中；出现真实的第二个消费者之前，不创建全局 shared/util 模块。

## License

[MIT](LICENSE)

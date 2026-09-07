# pi-plugins

自用 Pi 插件合集。仓库作为一个 Pi package 安装，每个插件保持独立入口，可通过 package filter 单独启用或关闭。

## 安装

从私有 Git 仓库安装：

```sh
pi install git:git@github.com:qiubai-lab/pi-plugins.git
```

在仓库内临时加载全部插件：

```sh
pi -e .
```

Pi package 中只会发现 `extensions/*/index.ts`，测试和内部模块不会被当成插件加载。

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

## 开发

需要 Node.js 20 或更新版本：

```sh
npm ci
npm test
npm run typecheck
```

新增插件时使用独立的 `extensions/<plugin>/index.ts` 入口。插件私有实现和测试留在自己的目录中；出现真实的第二个消费者之前，不创建全局 shared/util 模块。

## License

[MIT](LICENSE)

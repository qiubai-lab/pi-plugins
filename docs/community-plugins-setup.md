# 推荐社区插件安装与依赖

本仓库仅提供 `marketplace-loader` 和 `osc-notify` 两个自维护扩展，不再捆绑、安装或加载第三方插件。以下社区插件请按各自官方 README/文档推荐的方式单独安装；不要再统一使用 `pi install git:github.com/<owner>/<repository>`。

> 第三方 Pi 扩展会以当前用户权限运行。安装前请审查代码；仅向受信任的插件提供凭据、浏览器 Cookie、网络访问和外部 CLI 权限。

## 快速清单

| 插件 | 官方来源 | 官方推荐安装命令 | 额外组件/条件 |
| --- | --- | --- | --- |
| BetterWright | [BetterWright/betterwright](https://github.com/BetterWright/betterwright) / [betterwright.com](https://betterwright.com/docs/setup) | `pi install npm:betterwright` | Node.js 22+；一次性下载 BetterChromium；可选 MCP SDK |
| Pi Lens | [apmantza/pi-lens](https://github.com/apmantza/pi-lens) | `pi install npm:pi-lens` | Node.js 22.19+；按语言自动安装/探测分析工具；PowerShell 分析器需手动安装 |
| Pi Web Access | [ivanreeve/pi-web-access](https://github.com/ivanreeve/pi-web-access) | `pi install npm:pi-web-access` | Pi v0.37.3+；可选搜索 API Key；视频抽帧需 `ffmpeg`/`yt-dlp` |
| Pi Subagents | [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) | `pi install npm:pi-subagents` | 后台子代理需 npm 版 Pi；研究类内置代理需 `pi-web-access`；外部 profile 需对应 CLI 与认证 |

如需只安装到当前项目，可在对应官方命令中加入 `-l`，例如：

```sh
pi install -l npm:pi-lens
```

## BetterWright

官方来源：[BetterWright/betterwright](https://github.com/BetterWright/betterwright)，安装文档：[betterwright.com/docs/setup](https://betterwright.com/docs/setup)

Pi Coding Agent 官方推荐安装命令：

```sh
pi install npm:betterwright
npx -y betterwright setup
pi
```

额外组件分析：

- **Node.js 22+**：`betterwright` CLI 和 Pi 扩展均运行在 Node 环境中。先检查：

  ```sh
  node --version
  ```

- **BetterChromium 托管浏览器**：npm 安装不会在生命周期脚本中偷偷下载浏览器；必须显式运行一次：

  ```sh
  npx -y betterwright setup
  npx -y betterwright doctor
  ```

  `setup` 会在 macOS arm64、Linux x64、Windows x64 下载校验锁定的 BetterChromium 到 `~/.betterwright/chromium/`。`doctor` 必须以 `BetterWright is ready.` 结束；若出现 `✗`，按输出修复后再使用。

- **升级后的浏览器刷新**：

  ```sh
  npx -y betterwright update
  npx -y betterwright doctor
  ```

- **可选 MCP 集成**：只有把 BetterWright 接入 MCP 客户端时才需要额外安装 `@modelcontextprotocol/sdk`。Pi 原生扩展路径不需要它。

- **安全策略（可选）**：运行不受信任任务时，可限制私网/回环访问和下载权限：

  ```sh
  export BETTERWRIGHT_BLOCK_PRIVATE_NETWORK=1
  export BETTERWRIGHT_BLOCK_LOOPBACK=1
  export BETTERWRIGHT_DOWNLOAD_POLICY=ask
  ```

  如需访问本地开发服务器，不要启用 loopback 阻断。

> 旧文档中的 Bun 1.4+ 要求不再是 BetterWright 当前官方 Pi 安装路径的前置条件。

## Pi Lens

官方来源：[apmantza/pi-lens](https://github.com/apmantza/pi-lens)

官方推荐安装命令：

```sh
pi install npm:pi-lens
```

官方也提供从 Git 安装的替代命令，但常规安装应优先使用 npm 包：

```sh
pi install git:github.com/apmantza/pi-lens
```

额外组件分析：

- **Node.js 22.19.0+**：与 Pi host 的最低版本一致。检查：

  ```sh
  node --version
  ```

- **npm 安装脚本审批**：npm v12 可能要求审批依赖生命周期脚本（例如 `@ast-grep/cli` 的 `postinstall`）。先审查提示，再按需执行：

  ```sh
  npm approve-scripts
  ```

- **自动安装的语言/分析工具**：Pi Lens 会按配置、项目语言或运行流程自动安装大量工具。常见包括 `@biomejs/biome`、`prettier`、`ruff`、`typescript-language-server`、`typescript`、`pyright`、`@ast-grep/cli`、`knip`、`jscpd`、`madge`、`mypy`、`stylelint`、`markdownlint-cli2`、`shellcheck`、`shfmt`、`rust-analyzer`、`golangci-lint`、`hadolint`、`tflint`、`taplo`、`terraform-ls`、HTML/CSS/JSON/YAML/Bash/Svelte/Vue/Prisma/Docker/PHP 等语言服务器。

- **需要本机语言环境或包管理器的工具**：`gopls`、`ruby-lsp`、`solargraph` 等会从 `PATH` 探测，或在检测到对应语言时通过 Go/Ruby 等原生包管理器安装；因此可能需要预先准备 Go、Ruby、Python/pip、网络和目录权限。

- **手动安装项**：`psscriptanalyzer`（PowerShell Script Analyzer）官方列为手动安装。

在 Pi 中检查状态：

```text
/lens-health
```

## Pi Web Access

官方来源：[ivanreeve/pi-web-access](https://github.com/ivanreeve/pi-web-access)

官方推荐安装命令：

```sh
pi install npm:pi-web-access
```

额外组件分析：

- **Pi v0.37.3+**：低于该版本可能无法加载或使用完整工具集。

- **搜索 API Key（可选）**：官方说明基础搜索可零配置工作；如需更多 provider 或直接 API 访问，可写入 `~/.pi/web-search.json`：

  ```json
  {
    "openaiApiKey": "sk-...",
    "braveApiKey": "BSA_...",
    "exaApiKey": "exa-...",
    "perplexityApiKey": "pplx-...",
    "geminiApiKey": "AIza..."
  }
  ```

  环境变量会覆盖配置文件值，例如：

  ```sh
  export OPENAI_API_KEY="..."
  export BRAVE_API_KEY="..."
  export EXA_API_KEY="..."
  export GEMINI_API_KEY="..."
  export PERPLEXITY_API_KEY="..."
  ```

  不要将密钥提交到仓库。

- **视频抽帧依赖（可选）**：普通网页搜索、URL 抓取、GitHub 仓库克隆、YouTube 文本/转录分析通常不需要额外系统包；只有从本地视频或 YouTube 提取指定帧图片时需要：

  ```sh
  # macOS
  brew install ffmpeg yt-dlp

  # Debian/Ubuntu
  sudo apt update
  sudo apt install -y ffmpeg yt-dlp
  ```

  其中本地视频抽帧需要 `ffmpeg`；YouTube 抽帧需要 `ffmpeg` 和 `yt-dlp`。

- **浏览器 Curator（可选）**：Linux 上若需要自动打开交互式搜索 Curator，可安装 `xdg-utils`；缺少它不影响搜索本身。

  ```sh
  sudo apt install -y xdg-utils
  ```

- **GitHub 私有仓库/更高限额（可选）**：访问私有 GitHub 仓库、提高 API 限额或获取更完整仓库信息时，建议安装并认证 GitHub CLI：

  ```sh
  gh auth login
  ```

## Pi Subagents

官方来源：[nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents)

官方推荐安装命令：

```sh
pi install npm:pi-subagents
```

额外组件分析：

- **后台子代理需要 npm 版 Pi**：后台 children 依赖 npm package 形式安装的 Pi（`@earendil-works/pi-coding-agent`），因为 detached runner 会从该 package 目录导入 Pi 代码。单文件 Pi 可执行程序只能运行前台子代理（`async: false`）。

- **内置原生代理本身不需要额外 CLI**：`scout`、`worker`、`reviewer`、`oracle`、`delegate` 等原生子代理复用当前 Pi 模型配置。

- **研究类代理需要 Pi Web Access**：内置 `researcher` 和 `evidence-auditor` 使用 `web_search`、`fetch_content`、`get_search_content` 和 `source_check`，因此需要额外安装并加载：

  ```sh
  pi install npm:pi-web-access
  ```

- **外部 CLI profile 仅在显式选择时需要对应工具和认证**：

  | Profile | 额外要求 |
  | --- | --- |
  | `codex-exec` / `codex-exec-writer` | 已安装并认证的 Codex CLI |
  | `claude-code` / `claude-code-writer` | 已安装并通过正常本地登录认证的 Claude Code CLI；使用前需信任/审查用户级 Claude Code settings/hooks |
  | `cursor-agent` / `cursor-agent-writer` | Cursor CLI，以及 `CURSOR_API_KEY` 或已有本地登录；可能还需要完成 Cursor workspace trust |

- **分享与可选检查**：分享 session 到 GitHub Gist 时需要已认证的 `gh`。Watchdog 的可选 LSP 检查会使用 `PATH` 或 `node_modules/.bin` 中已有的 `typescript-language-server`，不会主动安装它。

在 Pi 中检查环境：

```text
/subagents-doctor
```

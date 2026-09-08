# 社区插件配置与额外依赖

本仓库会在安装时自动安装并加载以下社区插件：

- [`betterwright`](https://www.npmjs.com/package/betterwright)
- [`pi-lens`](https://www.npmjs.com/package/pi-lens)
- [`pi-web-access`](https://www.npmjs.com/package/pi-web-access)
- [`pi-subagents`](https://www.npmjs.com/package/pi-subagents)

用户无需再分别执行 `pi install npm:<package>`。不过，部分插件的完整功能依赖浏览器、系统命令、语言工具链或服务凭据。本页说明首次安装后需要完成的配置。

> 第三方 Pi 扩展会以当前用户权限运行。启用前应审查其来源，并只向受信任的插件提供凭据和网络访问权限。

## 快速检查清单

| 插件 | 基础使用 | 完整功能所需的额外配置 |
| --- | --- | --- |
| BetterWright | 需要初始化 | 必须安装 Bun 1.4+ 并下载 BetterChromium，或配置自有浏览器 |
| Pi Lens | 通常开箱即用 | Node.js 22.19+；语言分析工具会按需自动安装，少数工具需手动安装 |
| Pi Web Access | 搜索和普通网页抓取可零配置使用 | 视频功能需要 FFmpeg/yt-dlp；部分搜索服务需要 API Key；Linux Curator 建议安装 xdg-utils |
| Pi Subagents | 原生前台子代理开箱即用 | 后台任务需要 npm 版 Pi；外部 CLI profiles 需要对应 CLI 和登录状态 |

## 1. BetterWright

BetterWright 的 npm 包不包含浏览器。首次使用前必须安装 Bun，并下载一次托管的 BetterChromium。

### 1.1 安装 Bun

BetterWright 要求 Bun 1.4 或更高版本：

```sh
bun --version
```

如果系统中尚未安装 Bun，请按照 [Bun 官方安装说明](https://bun.sh/docs/installation)安装。例如 Unix 系统可执行：

```sh
curl -fsSL https://bun.sh/install | bash
```

安装后重新打开终端，并再次运行 `bun --version`。

### 1.2 下载浏览器并检查

```sh
npx -y betterwright setup
npx -y betterwright doctor
```

`setup` 会将校验过的 BetterChromium 下载到 `~/.betterwright/chromium/`，下载量约为 200 MB。npm 安装本仓库时不会自动执行该下载。

只有当 `doctor` 最终显示 `BetterWright is ready.` 时，浏览器工具才算准备完成。升级 BetterWright 后建议运行：

```sh
npx -y betterwright update
npx -y betterwright doctor
```

BetterChromium 官方构建主要覆盖 macOS arm64、Linux x64 和 Windows x64。其他操作系统或架构需要配置本地 Chromium、CDP endpoint 或受支持的云浏览器，参见 [BetterWright browser providers](https://betterwright.com/docs/browser-providers)。

### 1.3 可选安全策略

BetterWright 默认可访问公网、私有网络和 loopback。运行不受信任任务时，建议通过其环境变量限制网络范围，例如：

```sh
export BETTERWRIGHT_BLOCK_PRIVATE_NETWORK=1
export BETTERWRIGHT_BLOCK_LOOPBACK=1
export BETTERWRIGHT_DOWNLOAD_POLICY=ask
```

如果需要访问本地开发服务器，不要启用 loopback 阻断。完整选项参见 BetterWright 的 network policy 文档。

## 2. Pi Lens

Pi Lens 要求 Node.js 22.19.0 或更高版本：

```sh
node --version
```

Pi Lens 会根据当前项目语言和配置按需安装大部分分析工具，无需预先一次性安装，包括 TypeScript Language Server、Pyright、Ruff、Biome、Prettier、ast-grep、ShellCheck、rust-analyzer 等。

需要注意：

- 第一次处理某种语言时可能访问 npm、GitHub Releases、pip、gem 或 Go 工具链；
- 自动安装是否成功取决于网络、目录权限以及对应语言包管理器是否可用；
- npm 12 若提示依赖安装脚本未获批准，应先审查提示，再运行：

  ```sh
  npm approve-scripts
  ```

- `PSScriptAnalyzer` 当前需要用户手动安装；
- `gopls`、`ruby-lsp`、`solargraph` 等工具可能需要本机已有 Go、Ruby 等对应语言环境。

可在 Pi 中运行以下命令检查运行状态：

```text
/lens-health
```

Pi Lens 的自动安装策略详见其随包提供的 `docs/dependencies.md`。

## 3. Pi Web Access

普通网页搜索和网页抓取不要求额外系统包。默认可使用零配置的 Exa MCP；使用已登录的 Codex 模型时，也可以复用相应搜索认证。

### 3.1 搜索服务凭据（可选）

Brave、Gemini、Perplexity、Tavily 等其他 provider 需要各自的 API Key。可通过环境变量或 `~/.pi/web-search.json` 配置。若零配置 provider 已满足需求，可以跳过此步骤。

例如：

```sh
export BRAVE_API_KEY="..."
export GEMINI_API_KEY="..."
```

不要将密钥提交到当前仓库。

### 3.2 视频处理（可选）

- 本地视频帧提取需要 `ffmpeg`（通常同时提供 `ffprobe`）；
- YouTube 帧提取需要 `ffmpeg` 和 `yt-dlp`；
- 完整的 Gemini 视频理解通常还需要 `GEMINI_API_KEY`。

macOS 示例：

```sh
brew install ffmpeg yt-dlp
```

Debian/Ubuntu 示例：

```sh
sudo apt update
sudo apt install -y ffmpeg yt-dlp
```

安装后检查：

```sh
ffmpeg -version
yt-dlp --version
```

### 3.3 Linux Curator 界面（可选）

Linux 上自动在默认浏览器中打开搜索 Curator，需要 `xdg-utils`：

```sh
# Debian/Ubuntu
sudo apt install -y xdg-utils

# Fedora/RHEL
sudo dnf install -y xdg-utils

# Arch Linux
sudo pacman -S xdg-utils
```

缺少它不会阻止搜索；插件会输出 Curator URL，用户可以手动在浏览器中打开。

### 3.4 GitHub CLI（可选）

公共 GitHub 仓库通常可以通过普通 Git 或 REST fallback 访问。若需要私有仓库、较高 API 限额或完整的 PR checks 信息，建议安装并登录 GitHub CLI：

```sh
gh auth login
```

## 4. Pi Subagents

原生 `scout`、`worker`、`reviewer`、`oracle` 等子代理不需要额外安装组件，并默认复用当前 Pi 的模型配置。

### 4.1 后台子代理

后台子代理要求 Pi 以 npm package 形式安装，因为 detached runner 需要从 Pi package 目录导入运行时依赖。单文件 Pi 可执行程序只能运行前台子代理：

```text
async: false
```

可在 Pi 中执行以下命令检查环境：

```text
/subagents-doctor
```

### 4.2 外部 CLI profiles（可选）

只有显式选择对应 profile 时才需要安装外部工具：

| Profile | 额外要求 |
| --- | --- |
| `codex-exec` / `codex-exec-writer` | 已安装并认证的 Codex CLI |
| `claude-code` / `claude-code-writer` | 已安装并认证的 Claude Code CLI |
| `cursor-agent` / `cursor-agent-writer` | Cursor CLI，以及本地登录或 `CURSOR_API_KEY` |

这些外部 CLI 不是原生子代理的必需依赖。插件在列出能力时只检查命令是否存在，真正启动时仍会验证版本、认证和运行条件。

其他可选组件：

- 分享 session 到 GitHub Gist 时需要已认证的 `gh`；
- Watchdog 的可选 LSP 检查会使用 PATH 或 `node_modules/.bin` 中已有的 `typescript-language-server`，不会主动安装它；
- researcher 的网页工具依赖 Pi Web Access，本仓库已一并集成，无需另行安装。

## 推荐的首次安装流程

安装本仓库后，建议依次执行：

```sh
node --version
bun --version
npx -y betterwright setup
npx -y betterwright doctor
```

随后启动 Pi，并检查：

```text
/lens-health
/subagents-doctor
```

如果需要视频帧提取，再安装并检查 `ffmpeg` 与 `yt-dlp`；如果需要 Linux Curator 自动打开，再安装 `xdg-utils`。API Key、外部 Agent CLI 和 GitHub CLI 均按实际使用场景配置，无需为基础功能全部安装。

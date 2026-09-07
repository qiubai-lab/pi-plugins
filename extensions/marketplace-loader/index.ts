import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { runMarketplaceManager } from "./controller.ts";
import { MarketplaceService, parseSelector } from "./service.ts";

export interface MarketplaceLoaderOptions {
  service?: MarketplaceService;
  env?: NodeJS.ProcessEnv;
  manager?: typeof runMarketplaceManager;
}

function usage(): string {
  return [
    "用法：",
    "  /marketplaces list",
    "  /marketplaces plugins <marketplace>",
    "  /marketplaces add <git-url> [ref]",
    "  /marketplaces update <marketplace> [ref]",
    "  /marketplaces remove <marketplace>",
    "  /marketplaces enable <plugin>@<marketplace>",
    "  /marketplaces disable <plugin>@<marketplace>",
    "  /marketplaces doctor",
  ].join("\n");
}

async function guarded(ctx: ExtensionCommandContext, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

export function registerMarketplaceLoader(pi: ExtensionAPI, options: MarketplaceLoaderOptions = {}): void {
  const env = options.env ?? process.env;
  const home = env.PI_MARKETPLACE_HOME ?? join(homedir(), ".pi", "agent", "marketplaces");
  const service = options.service ?? new MarketplaceService(home);
  const manager = options.manager ?? runMarketplaceManager;

  pi.on("resources_discover", async (_event, ctx) => {
    try {
      return { skillPaths: await service.discoverSkillPaths() };
    } catch (error) {
      if (ctx.mode === "tui") {
        ctx.ui.notify(`Marketplace Loader 未加载任何 Skill：${error instanceof Error ? error.message : String(error)}`, "error");
      }
      return { skillPaths: [] };
    }
  });

  pi.registerCommand("plugins", {
    description: "打开 Marketplace 与 Plugin 交互式管理器",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/plugins 仅支持 TUI 模式；非交互模式请使用 /marketplaces 子命令。", "error");
        return;
      }
      await manager(ctx, service);
    },
  });

  pi.registerCommand("marketplaces", {
    description: "管理适配 Pi 的远程 Codex Marketplace",
    handler: async (rawArgs, ctx) => guarded(ctx, async () => {
      const [command = "help", ...args] = rawArgs.trim().split(/\s+/).filter(Boolean);
      if (command === "help") {
        ctx.ui.notify(usage(), "info");
        return;
      }
      if (command === "list") {
        if (args.length !== 0) throw new Error(usage());
        const sources = await service.listSources();
        ctx.ui.notify(
          sources.length === 0
            ? "没有受管理的 Marketplace。"
            : sources.map(source => `${source.name} — ${source.ref} @ ${source.commit.slice(0, 12)}\n  ${source.remote}`).join("\n"),
          "info",
        );
        return;
      }
      if (command === "plugins") {
        if (args.length !== 1) throw new Error(usage());
        const plugins = await service.listPlugins(args[0]);
        ctx.ui.notify(plugins.map(({ plugin, enabled }) => {
          const unsupported = plugin.unsupportedCapabilities.length
            ? `；已忽略：${plugin.unsupportedCapabilities.join(", ")}`
            : "";
          return `${enabled ? "[启用] " : "[停用]"} ${plugin.name} — ${plugin.skillNames.length} 个 Skill${unsupported}`;
        }).join("\n") || "Marketplace 不包含 Plugin。", "info");
        return;
      }
      if (command === "doctor") {
        if (args.length !== 0) throw new Error(usage());
        const report = await service.doctor();
        const warnings = [
          report.staleSelections.length ? `失效选择：${report.staleSelections.join(", ")}` : "",
          report.orphanSnapshots.length ? `孤立快照：${report.orphanSnapshots.join(", ")}` : "",
        ].filter(Boolean);
        ctx.ui.notify(
          `目录校验通过：${report.sources} 个来源、${report.plugins} 个 Plugin、${report.skills} 个 Skill，已启用 ${report.enabled} 个。${warnings.length ? `警告：${warnings.join("；")}。` : ""}`,
          warnings.length ? "warning" : "info",
        );
        return;
      }
      if (command === "add") {
        if (args.length < 1 || args.length > 2) throw new Error(usage());
        const [remote, ref] = args;
        const confirmed = await ctx.ui.confirm(
          "信任并克隆远程 Marketplace？",
          `${remote}\n${ref ? `引用：${ref}` : "引用：自动使用远程默认分支（origin/HEAD）"}\nGit 会运行，但不会运行依赖、子模块、Hook 或仓库脚本。`,
        );
        if (!confirmed) return;
        const source = await service.addSource(remote, ref);
        ctx.ui.notify(`已添加 ${source.name}：${source.ref} @ ${source.commit}。尚未启用任何 Plugin Skill。`, "info");
        return;
      }
      if (command === "update") {
        if (args.length < 1 || args.length > 2) throw new Error(usage());
        const [marketplace, ref] = args;
        const fetchConfirmed = await ctx.ui.confirm(
          "获取并校验 Marketplace 更新？",
          `${marketplace}${ref ? `\n新引用：${ref}` : "\n使用已配置的引用"}`,
        );
        if (!fetchConfirmed) return;
        const candidate = await service.stageUpdate(marketplace, ref);
        let activated = false;
        try {
          if (candidate.oldCommit === candidate.newCommit && candidate.ref === (await service.listSources()).find(item => item.name === marketplace)?.ref) {
            ctx.ui.notify(`${marketplace} 已经位于 ${candidate.newCommit}。`, "info");
            return;
          }
          const activate = await ctx.ui.confirm(
            "启用已校验的 Marketplace 快照？",
            `${candidate.sourceName}\n${candidate.oldCommit} → ${candidate.newCommit}\n已校验 ${candidate.catalog.plugins.length} 个 Plugin。`,
          );
          if (!activate) return;
          const source = await service.activateUpdate(candidate);
          activated = true;
          ctx.ui.notify(`已将 ${source.name} 更新到 ${source.commit}。`, "info");
          await ctx.reload();
          return;
        } finally {
          if (!activated) await service.discardUpdate(candidate);
        }
      }
      if (command === "remove") {
        if (args.length !== 1) throw new Error(usage());
        const confirmed = await ctx.ui.confirm(
          "移除受管理的 Marketplace？",
          `将移除 ${args[0]} 及其私有快照，不会修改源仓库。`,
        );
        if (!confirmed) return;
        const changedResources = await service.removeSource(args[0]);
        ctx.ui.notify(`已移除 Marketplace：${args[0]}。`, "info");
        if (changedResources) await ctx.reload();
        return;
      }
      if (command === "enable") {
        if (args.length !== 1) throw new Error(usage());
        const target = parseSelector(args[0]);
        const plugin = (await service.listPlugins(target.marketplace)).find(item => item.plugin.name === target.plugin)?.plugin;
        if (!plugin) throw new Error(`未知 Plugin：${args[0]}`);
        const confirmed = await ctx.ui.confirm(
          "信任并启用 Plugin Skill？",
          `${args[0]} 将提供 ${plugin.skillNames.length} 个模型指令 Skill。请只启用你信任的内容。`,
        );
        if (!confirmed) return;
        await service.enable(args[0]);
        ctx.ui.notify(`已启用：${args[0]}。`, "info");
        await ctx.reload();
        return;
      }
      if (command === "disable") {
        if (args.length !== 1) throw new Error(usage());
        await service.disable(args[0]);
        ctx.ui.notify(`已停用：${args[0]}。`, "info");
        await ctx.reload();
        return;
      }
      throw new Error(usage());
    }),
  });
}

export default function marketplaceLoader(pi: ExtensionAPI): void {
  registerMarketplaceLoader(pi);
}

import { BorderedLoader, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { MarketplaceService, type UpdateCandidate } from "./service.ts";
import {
  showMarketplaceList,
  showPluginSettings,
  showSourceActions,
  type MarketplaceChoice,
  type PluginDraftResult,
  type SourceChoice,
} from "./ui.ts";
import type { MarketplaceSummary } from "./service.ts";
import type { MarketplaceSourceState } from "./state.ts";
import type { ManagedPlugin } from "./catalog.ts";

export interface MarketplaceManagerViews {
  marketplaceList(ctx: ExtensionCommandContext, summaries: MarketplaceSummary[]): Promise<MarketplaceChoice | null>;
  sourceActions(ctx: ExtensionCommandContext, source: MarketplaceSourceState): Promise<SourceChoice>;
  pluginSettings(
    ctx: ExtensionCommandContext,
    marketplace: string,
    plugins: { plugin: ManagedPlugin; enabled: boolean }[],
  ): Promise<PluginDraftResult>;
}

const DEFAULT_VIEWS: MarketplaceManagerViews = {
  marketplaceList: showMarketplaceList,
  sourceActions: showSourceActions,
  pluginSettings: showPluginSettings,
};

export type OperationResult<T> =
  | { status: "ok"; value: T }
  | { status: "aborted" }
  | { status: "error"; error: unknown };

export type OperationRunner = <T>(
  ctx: ExtensionCommandContext,
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
) => Promise<OperationResult<T>>;

export async function runCancellableOperation<T>(
  ctx: ExtensionCommandContext,
  message: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<OperationResult<T>> {
  return ctx.ui.custom<OperationResult<T>>((tui, theme, _keybindings, done) => {
    const loader = new BorderedLoader(tui, theme, message, { cancellable: true });
    loader.onAbort = () => {
      // Wait for the aborted operation to unwind and clean its temporary snapshot.
    };
    operation(loader.signal).then(
      value => done(loader.signal.aborted ? { status: "aborted" } : { status: "ok", value }),
      error => done(loader.signal.aborted ? { status: "aborted" } : { status: "error", error }),
    );
    return loader;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function notifyOperation<T>(
  ctx: ExtensionCommandContext,
  result: OperationResult<T>,
): Promise<T | undefined> {
  if (result.status === "ok") return result.value;
  if (result.status === "aborted") ctx.ui.notify("操作已取消。", "info");
  else ctx.ui.notify(errorMessage(result.error), "error");
  return undefined;
}

async function updateMarketplace(
  ctx: ExtensionCommandContext,
  service: MarketplaceService,
  summary: MarketplaceSummary,
  runOperation: OperationRunner,
): Promise<boolean> {
  const fetchConfirmed = await ctx.ui.confirm(
    "获取并校验 Marketplace 更新？",
    `${summary.source.name}\n引用：${summary.source.ref}`,
  );
  if (!fetchConfirmed) return false;
  const stagedResult = await runOperation(
    ctx,
    `正在获取 ${summary.source.name}…（按 Esc 取消）`,
    signal => service.stageUpdate(summary.source.name, undefined, signal),
  );
  const candidate = await notifyOperation(ctx, stagedResult);
  if (!candidate) return false;
  let activated = false;
  try {
    if (candidate.oldCommit === candidate.newCommit && candidate.ref === summary.source.ref) {
      ctx.ui.notify(`${summary.source.name} 已经位于 ${candidate.newCommit}。`, "info");
      return false;
    }
    const confirmed = await ctx.ui.confirm(
      "启用已校验的 Marketplace 快照？",
      `${candidate.oldCommit} → ${candidate.newCommit}\n已校验 ${candidate.catalog.plugins.length} 个 Plugin。`,
    );
    if (!confirmed) return false;
    await service.activateUpdate(candidate);
    activated = true;
    ctx.ui.notify(`已将 ${summary.source.name} 更新到 ${candidate.newCommit}。`, "info");
    return summary.enabledCount > 0;
  } catch (error) {
    ctx.ui.notify(errorMessage(error), "error");
    return false;
  } finally {
    if (!activated) await service.discardUpdate(candidate).catch(() => undefined);
  }
}

async function addMarketplace(
  ctx: ExtensionCommandContext,
  service: MarketplaceService,
  runOperation: OperationRunner,
): Promise<void> {
  const remote = (await ctx.ui.input("Marketplace Git 地址", "https://host/owner/repository.git"))?.trim();
  if (!remote) return;
  const confirmed = await ctx.ui.confirm(
    "信任并克隆远程 Marketplace？",
    `${remote}\n引用：自动使用远程默认分支（origin/HEAD）\n不会运行依赖、子模块、Hook 或仓库脚本。`,
  );
  if (!confirmed) return;
  const result = await runOperation(
    ctx,
    "正在克隆并校验 Marketplace…（按 Esc 取消）",
    signal => service.addSource(remote, undefined, signal),
  );
  const source = await notifyOperation(ctx, result);
  if (source) ctx.ui.notify(`已添加 ${source.name}：${source.ref} @ ${source.commit}。尚未启用任何 Plugin。`, "info");
}

async function editPlugins(
  ctx: ExtensionCommandContext,
  service: MarketplaceService,
  marketplace: string,
  views: MarketplaceManagerViews,
): Promise<boolean> {
  const plugins = await service.listPlugins(marketplace);
  const draft = await views.pluginSettings(ctx, marketplace, plugins);
  if (!draft.save) return false;
  const original = new Set(plugins.filter(item => item.enabled).map(item => item.plugin.name));
  const additions = draft.enabled.filter(name => !original.has(name));
  if (additions.length > 0) {
    const skillCount = plugins
      .filter(item => additions.includes(item.plugin.name))
      .reduce((sum, item) => sum + item.plugin.skillNames.length, 0);
    const confirmed = await ctx.ui.confirm(
      "信任并启用 Plugin Skill？",
      `${additions.join(", ")} 将提供 ${skillCount} 个模型指令 Skill。`,
    );
    if (!confirmed) return false;
  }
  try {
    const changed = await service.setEnabledPlugins(marketplace, draft.enabled);
    if (changed) ctx.ui.notify(`已更新 ${marketplace} 的 Plugin 选择。`, "info");
    return changed;
  } catch (error) {
    ctx.ui.notify(errorMessage(error), "error");
    return false;
  }
}

function doctorMessage(report: Awaited<ReturnType<MarketplaceService["doctor"]>>): { message: string; warning: boolean } {
  const warnings = [
    report.staleSelections.length ? `失效选择：${report.staleSelections.join(", ")}` : "",
    report.orphanSnapshots.length ? `孤立快照：${report.orphanSnapshots.join(", ")}` : "",
  ].filter(Boolean);
  return {
    message: `目录校验通过：${report.sources} 个来源、${report.plugins} 个 Plugin、${report.skills} 个 Skill，已启用 ${report.enabled} 个。${warnings.length ? `警告：${warnings.join("；")}。` : ""}`,
    warning: warnings.length > 0,
  };
}

export async function runMarketplaceManager(
  ctx: ExtensionCommandContext,
  service: MarketplaceService,
  views: MarketplaceManagerViews = DEFAULT_VIEWS,
  runOperation: OperationRunner = runCancellableOperation,
): Promise<void> {
  let resourcesChanged = false;
  let openMarketplace: string | undefined;

  while (true) {
    let summaries: MarketplaceSummary[];
    try {
      summaries = await service.marketplaceSummaries();
    } catch (error) {
      ctx.ui.notify(errorMessage(error), "error");
      break;
    }
    try {
      if (!openMarketplace) {
        const choice = await views.marketplaceList(ctx, summaries);
        if (!choice) break;
        if (choice.kind === "add") await addMarketplace(ctx, service, runOperation);
        else if (choice.kind === "doctor") {
          const result = doctorMessage(await service.doctor());
          ctx.ui.notify(result.message, result.warning ? "warning" : "info");
        } else openMarketplace = choice.marketplace;
        continue;
      }

      const summary = summaries.find(item => item.source.name === openMarketplace);
      if (!summary) {
        openMarketplace = undefined;
        continue;
      }
      const action = await views.sourceActions(ctx, summary.source);
      if (action === "back") {
        openMarketplace = undefined;
      } else if (action === "plugins") {
        resourcesChanged = await editPlugins(ctx, service, summary.source.name, views) || resourcesChanged;
      } else if (action === "update") {
        resourcesChanged = await updateMarketplace(ctx, service, summary, runOperation) || resourcesChanged;
      } else if (action === "remove") {
        const confirmed = await ctx.ui.confirm(
          "移除受管理的 Marketplace？",
          `将移除 ${summary.source.name} 及其私有快照。`,
        );
        if (confirmed) {
          resourcesChanged = await service.removeSource(summary.source.name) || resourcesChanged;
          ctx.ui.notify(`已移除 Marketplace：${summary.source.name}。`, "info");
          openMarketplace = undefined;
        }
      }
    } catch (error) {
      ctx.ui.notify(errorMessage(error), "error");
      openMarketplace = undefined;
    }
  }

  if (resourcesChanged) await ctx.reload();
}

export type { UpdateCandidate };

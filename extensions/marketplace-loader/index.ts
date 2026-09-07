import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { MarketplaceService, parseSelector } from "./service.ts";

export interface MarketplaceLoaderOptions {
  service?: MarketplaceService;
  env?: NodeJS.ProcessEnv;
}

function usage(): string {
  return [
    "Usage:",
    "  /marketplaces list",
    "  /marketplaces plugins <marketplace>",
    "  /marketplaces add <git-url> <ref>",
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

  pi.on("resources_discover", async (_event, ctx) => {
    try {
      return { skillPaths: await service.discoverSkillPaths() };
    } catch (error) {
      if (ctx.mode === "tui") {
        ctx.ui.notify(`Marketplace loader exposed no skills: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
      return { skillPaths: [] };
    }
  });

  pi.registerCommand("marketplaces", {
    description: "Manage remote Pi-adapted Codex marketplaces",
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
            ? "No managed marketplaces."
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
            ? `; ignored: ${plugin.unsupportedCapabilities.join(", ")}`
            : "";
          return `${enabled ? "[on] " : "[off]"} ${plugin.name} — ${plugin.skillNames.length} skill(s)${unsupported}`;
        }).join("\n") || "Marketplace contains no plugins.", "info");
        return;
      }
      if (command === "doctor") {
        if (args.length !== 0) throw new Error(usage());
        const report = await service.doctor();
        const warnings = [
          report.staleSelections.length ? `stale selections: ${report.staleSelections.join(", ")}` : "",
          report.orphanSnapshots.length ? `orphan snapshots: ${report.orphanSnapshots.join(", ")}` : "",
        ].filter(Boolean);
        ctx.ui.notify(
          `Catalogs OK: ${report.sources} source(s), ${report.plugins} plugin(s), ${report.skills} skill(s), ${report.enabled} enabled.${warnings.length ? ` Warnings: ${warnings.join("; ")}.` : ""}`,
          warnings.length ? "warning" : "info",
        );
        return;
      }
      if (command === "add") {
        if (args.length !== 2) throw new Error(usage());
        const [remote, ref] = args;
        const confirmed = await ctx.ui.confirm(
          "Trust and clone remote marketplace?",
          `${remote}\nRef: ${ref}\nGit will run, but dependencies, submodules, hooks, and repository scripts will not be run.`,
        );
        if (!confirmed) return;
        const source = await service.addSource(remote, ref);
        ctx.ui.notify(`Added ${source.name} at ${source.commit}. No plugin skills were enabled.`, "info");
        return;
      }
      if (command === "update") {
        if (args.length < 1 || args.length > 2) throw new Error(usage());
        const [marketplace, ref] = args;
        const fetchConfirmed = await ctx.ui.confirm(
          "Fetch and validate marketplace update?",
          `${marketplace}${ref ? `\nNew ref: ${ref}` : "\nUsing its configured ref"}`,
        );
        if (!fetchConfirmed) return;
        const candidate = await service.stageUpdate(marketplace, ref);
        let activated = false;
        try {
          if (candidate.oldCommit === candidate.newCommit && candidate.ref === (await service.listSources()).find(item => item.name === marketplace)?.ref) {
            ctx.ui.notify(`${marketplace} is already at ${candidate.newCommit}.`, "info");
            return;
          }
          const activate = await ctx.ui.confirm(
            "Activate validated marketplace snapshot?",
            `${candidate.sourceName}\n${candidate.oldCommit} → ${candidate.newCommit}\n${candidate.catalog.plugins.length} plugin(s) validated.`,
          );
          if (!activate) return;
          const source = await service.activateUpdate(candidate);
          activated = true;
          ctx.ui.notify(`Updated ${source.name} to ${source.commit}.`, "info");
          await ctx.reload();
          return;
        } finally {
          if (!activated) await service.discardUpdate(candidate);
        }
      }
      if (command === "remove") {
        if (args.length !== 1) throw new Error(usage());
        const confirmed = await ctx.ui.confirm(
          "Remove managed marketplace?",
          `${args[0]} and its private snapshot will be removed. The source repository is not modified.`,
        );
        if (!confirmed) return;
        const changedResources = await service.removeSource(args[0]);
        ctx.ui.notify(`Removed marketplace: ${args[0]}.`, "info");
        if (changedResources) await ctx.reload();
        return;
      }
      if (command === "enable") {
        if (args.length !== 1) throw new Error(usage());
        const target = parseSelector(args[0]);
        const plugin = (await service.listPlugins(target.marketplace)).find(item => item.plugin.name === target.plugin)?.plugin;
        if (!plugin) throw new Error(`Unknown plugin: ${args[0]}`);
        const confirmed = await ctx.ui.confirm(
          "Trust and enable plugin skills?",
          `${args[0]} contributes ${plugin.skillNames.length} model instruction skill(s). Enable only content you trust.`,
        );
        if (!confirmed) return;
        await service.enable(args[0]);
        ctx.ui.notify(`Enabled: ${args[0]}.`, "info");
        await ctx.reload();
        return;
      }
      if (command === "disable") {
        if (args.length !== 1) throw new Error(usage());
        await service.disable(args[0]);
        ctx.ui.notify(`Disabled: ${args[0]}.`, "info");
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

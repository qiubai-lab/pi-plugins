import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runMarketplaceManager } from "./controller.ts";
import { MarketplaceService } from "./service.ts";

export interface MarketplaceLoaderOptions {
  service?: MarketplaceService;
  env?: NodeJS.ProcessEnv;
  manager?: typeof runMarketplaceManager;
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
        ctx.ui.notify("/plugins 仅支持 TUI 模式。", "error");
        return;
      }
      await manager(ctx, service);
    },
  });
}

export default function marketplaceLoader(pi: ExtensionAPI): void {
  registerMarketplaceLoader(pi);
}

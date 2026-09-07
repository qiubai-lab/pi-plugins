import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { registerMarketplaceLoader } from "./index.ts";
import type { MarketplaceService } from "./service.ts";

function fakePi() {
  const events = new Map<string, Function>();
  const commands = new Map<string, { handler: Function }>();
  return {
    events,
    commands,
    api: {
      on(name: string, handler: Function) { events.set(name, handler); },
      registerCommand(name: string, command: { handler: Function }) { commands.set(name, command); },
    } as unknown as ExtensionAPI,
  };
}

function fakeContext(): ExtensionCommandContext & { notifications: { message: string; level: string }[] } {
  const notifications: { message: string; level: string }[] = [];
  return {
    mode: "tui",
    notifications,
    ui: {
      notify(message: string, level: string) { notifications.push({ message, level }); },
    },
  } as unknown as ExtensionCommandContext & { notifications: typeof notifications };
}

function fakeService() {
  const calls: string[] = [];
  return {
    calls,
    async discoverSkillPaths() { calls.push("discover"); return ["/skills"]; },
  };
}

describe("marketplace loader Pi adapter", () => {
  it("只注册 /plugins，并仅在 TUI 中打开管理器", async () => {
    const pi = fakePi();
    const service = fakeService();
    const manager = vi.fn(async () => undefined);
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService, manager });
    expect(pi.commands.has("plugins")).toBe(true);
    expect(pi.commands.has("marketplaces")).toBe(false);

    const ctx = fakeContext();
    Object.assign(ctx, { mode: "rpc" });
    await pi.commands.get("plugins")!.handler("", ctx);
    expect(ctx.notifications.at(-1)).toEqual(expect.objectContaining({ level: "error" }));
    expect(ctx.notifications.at(-1)?.message).toContain("仅支持 TUI 模式");
    expect(ctx.notifications.at(-1)?.message).not.toContain("/marketplaces");
    expect(manager).not.toHaveBeenCalled();

    Object.assign(ctx, { mode: "tui" });
    await pi.commands.get("plugins")!.handler("", ctx);
    expect(manager).toHaveBeenCalledWith(ctx, service);
  });

  it("注册资源发现并在发现失败时安全降级", async () => {
    const pi = fakePi();
    const service = fakeService();
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService });
    const handler = pi.events.get("resources_discover")!;
    const ctx = fakeContext();
    await expect(handler({}, ctx)).resolves.toEqual({ skillPaths: ["/skills"] });

    service.discoverSkillPaths = async () => { throw new Error("状态损坏"); };
    await expect(handler({}, ctx)).resolves.toEqual({ skillPaths: [] });
    expect(ctx.notifications.at(-1)?.message).toContain("状态损坏");
  });
});

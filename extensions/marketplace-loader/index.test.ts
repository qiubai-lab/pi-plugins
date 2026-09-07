import { describe, expect, it } from "vitest";
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

function fakeContext(confirmations: boolean[] = []): ExtensionCommandContext & { notifications: { message: string; level: string }[]; reloads: number } {
  const notifications: { message: string; level: string }[] = [];
  const context = {
    mode: "tui",
    notifications,
    reloads: 0,
    ui: {
      notify(message: string, level: string) { notifications.push({ message, level }); },
      async confirm() { return confirmations.shift() ?? false; },
    },
    async reload() { context.reloads += 1; },
  };
  return context as unknown as ExtensionCommandContext & typeof context;
}

function fakeService() {
  const calls: string[] = [];
  const candidate = {
    sourceName: "fixture-market",
    oldCommit: "a".repeat(40),
    newCommit: "b".repeat(40),
    ref: "v2",
    temporaryPath: "/tmp/candidate",
    catalog: { name: "fixture-market", displayName: "Fixture", root: "/tmp", plugins: [{ name: "alpha" }] },
  };
  const service = {
    calls,
    async discoverSkillPaths() { calls.push("discover"); return ["/skills"]; },
    async listSources() { calls.push("list"); return [{ name: "fixture-market", ref: "v1", commit: "a".repeat(40), remote: "https://example.test/repo.git" }]; },
    async listPlugins(name: string) {
      calls.push(`plugins:${name}`);
      return [{ plugin: { name: "alpha", skillNames: ["alpha-skill"], unsupportedCapabilities: ["mcp"] }, enabled: false }];
    },
    async doctor() { calls.push("doctor"); return { sources: 1, plugins: 1, skills: 1, enabled: 0, staleSelections: [], orphanSnapshots: [] }; },
    async addSource(remote: string, ref: string) { calls.push(`add:${remote}:${ref}`); return { name: "fixture-market", commit: "a".repeat(40) }; },
    async stageUpdate(name: string, ref?: string) { calls.push(`stage:${name}:${ref ?? ""}`); return candidate; },
    async discardUpdate() { calls.push("discard"); },
    async activateUpdate() { calls.push("activate"); return { name: "fixture-market", commit: "b".repeat(40) }; },
    async removeSource(name: string) { calls.push(`remove:${name}`); return true; },
    async enable(value: string) { calls.push(`enable:${value}`); },
    async disable(value: string) { calls.push(`disable:${value}`); },
  };
  return service;
}

describe("marketplace loader Pi adapter", () => {
  it("registers discovery and fails closed on discovery errors", async () => {
    const pi = fakePi();
    const service = fakeService();
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService });
    const handler = pi.events.get("resources_discover")!;
    const ctx = fakeContext();
    await expect(handler({}, ctx)).resolves.toEqual({ skillPaths: ["/skills"] });

    service.discoverSkillPaths = async () => { throw new Error("bad state"); };
    await expect(handler({}, ctx)).resolves.toEqual({ skillPaths: [] });
    expect(ctx.notifications.at(-1)?.message).toContain("bad state");
  });

  it("routes read-only commands", async () => {
    const pi = fakePi();
    const service = fakeService();
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService });
    const handler = pi.commands.get("marketplaces")!.handler;
    const ctx = fakeContext();
    for (const command of ["help", "list", "plugins fixture-market", "doctor"]) await handler(command, ctx);
    expect(service.calls).toEqual(["list", "plugins:fixture-market", "doctor"]);
    expect(ctx.notifications.map(item => item.message).join("\n")).toContain("ignored: mcp");
  });

  it("requires confirmation for add and activation", async () => {
    const pi = fakePi();
    const service = fakeService();
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService });
    const handler = pi.commands.get("marketplaces")!.handler;

    await handler("add https://example.test/repo.git v1", fakeContext([false]));
    expect(service.calls).toEqual([]);
    await handler("add https://example.test/repo.git v1", fakeContext([true]));
    expect(service.calls).toContain("add:https://example.test/repo.git:v1");

    const declined = fakeContext([false]);
    await handler("enable alpha@fixture-market", declined);
    expect(service.calls).not.toContain("enable:alpha@fixture-market");
    const accepted = fakeContext([true]);
    await handler("enable alpha@fixture-market", accepted);
    expect(service.calls).toContain("enable:alpha@fixture-market");
    expect(accepted.reloads).toBe(1);
  });

  it("stages, declines, activates updates and confirms removal", async () => {
    const pi = fakePi();
    const service = fakeService();
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService });
    const handler = pi.commands.get("marketplaces")!.handler;

    await handler("update fixture-market v2", fakeContext([false]));
    expect(service.calls).not.toContain("stage:fixture-market:v2");
    await handler("update fixture-market v2", fakeContext([true, false]));
    expect(service.calls).toContain("discard");
    const update = fakeContext([true, true]);
    await handler("update fixture-market v2", update);
    expect(service.calls).toContain("activate");
    expect(update.reloads).toBe(1);

    await handler("remove fixture-market", fakeContext([false]));
    expect(service.calls).not.toContain("remove:fixture-market");
    const removal = fakeContext([true]);
    await handler("remove fixture-market", removal);
    expect(service.calls).toContain("remove:fixture-market");
    expect(removal.reloads).toBe(1);
  });

  it("disables with reload and reports usage errors", async () => {
    const pi = fakePi();
    const service = fakeService();
    registerMarketplaceLoader(pi.api, { service: service as unknown as MarketplaceService });
    const handler = pi.commands.get("marketplaces")!.handler;
    const disabled = fakeContext();
    await handler("disable alpha@fixture-market", disabled);
    expect(service.calls).toContain("disable:alpha@fixture-market");
    expect(disabled.reloads).toBe(1);

    const invalid = fakeContext();
    await handler("unknown", invalid);
    expect(invalid.notifications.at(-1)?.level).toBe("error");
    expect(invalid.notifications.at(-1)?.message).toContain("Usage:");
  });
});

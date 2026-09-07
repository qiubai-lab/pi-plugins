import { describe, expect, it } from "vitest";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { runMarketplaceManager, type MarketplaceManagerViews, type OperationRunner } from "./controller.ts";
import type { MarketplaceService, MarketplaceSummary, UpdateCandidate } from "./service.ts";

const source = {
  name: "fixture-market",
  displayName: "Fixture Market",
  remote: "https://example.test/repo.git",
  ref: "v1",
  commit: "a".repeat(40),
  snapshot: "fixture",
};
const summary: MarketplaceSummary = { source, pluginCount: 1, skillCount: 1, enabledCount: 0 };
const plugin = {
  name: "alpha",
  description: "Alpha plugin",
  skillRoot: "/skills",
  skillNames: ["alpha-skill"],
  skillDirectories: { "alpha-skill": "/skills/alpha-skill" },
  installation: "AVAILABLE" as const,
  unsupportedCapabilities: [],
};

type TestContext = ExtensionCommandContext & {
  notifications: { message: string; type?: string }[];
  reloads: number;
};

function context(confirmations: boolean[] = [], inputs: (string | undefined)[] = []): TestContext {
  const notifications: { message: string; type?: string }[] = [];
  const ctx = {
    mode: "tui",
    cwd: "/project",
    isProjectTrusted() { return true; },
    notifications,
    reloads: 0,
    ui: {
      notify(message: string, type?: string) { notifications.push({ message, type }); },
      async confirm() { return confirmations.shift() ?? false; },
      async input() { return inputs.shift(); },
    },
    async reload() { ctx.reloads += 1; },
  };
  return ctx as unknown as TestContext;
}

function views(
  marketplaceChoices: Awaited<ReturnType<MarketplaceManagerViews["marketplaceList"]>>[],
  sourceChoices: Awaited<ReturnType<MarketplaceManagerViews["sourceActions"]>>[] = [],
  draft = { save: false, enabled: [] as string[] },
): MarketplaceManagerViews {
  return {
    async marketplaceList() { return marketplaceChoices.shift() ?? null; },
    async sourceActions() { return sourceChoices.shift() ?? "back"; },
    async pluginSettings() { return draft; },
  };
}

function service(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const candidate: UpdateCandidate = {
    sourceName: source.name,
    oldCommit: source.commit,
    newCommit: "b".repeat(40),
    ref: "v2",
    temporaryPath: "/tmp/candidate",
    catalog: { name: source.name, displayName: source.displayName, root: "/tmp", plugins: [plugin] },
  };
  const result = {
    calls,
    candidate,
    async marketplaceSummaries() { calls.push("summaries"); return [summary]; },
    async listPlugins(name: string) { calls.push(`plugins:${name}`); return [{ plugin, enabled: false }]; },
    async setEnabledPlugins(name: string, enabled: string[]) { calls.push(`set:${name}:${enabled.join(",")}`); return true; },
    async repositoryRoot(cwd: string) { calls.push(`root:${cwd}`); return "/project"; },
    async listProjectPlugins(name: string, cwd: string) { calls.push(`project-plugins:${name}:${cwd}`); return [{ plugin, enabled: false }]; },
    async setProjectPlugins(name: string, cwd: string, enabled: string[]) { calls.push(`project-set:${name}:${cwd}:${enabled.join(",")}`); return true; },
    async refreshProjectPlugins(name: string, cwd: string) { calls.push(`project-refresh:${name}:${cwd}`); return false; },
    async doctor() { calls.push("doctor"); return { sources: 1, plugins: 1, skills: 1, enabled: 0, staleSelections: [], orphanSnapshots: [] }; },
    async addSource(remote: string, ref: string | undefined, signal: AbortSignal) { calls.push(`add:${remote}:${ref ?? ""}:${signal.aborted}`); return { name: source.name, ref: ref ?? "main", commit: source.commit }; },
    async stageUpdate(name: string, ref: string | undefined, signal: AbortSignal) { calls.push(`stage:${name}:${ref ?? ""}:${signal.aborted}`); return candidate; },
    async activateUpdate() { calls.push("activate"); return source; },
    async discardUpdate() { calls.push("discard"); },
    async removeSource(name: string) { calls.push(`remove:${name}`); return true; },
    ...overrides,
  };
  return result;
}

const immediateOperation: OperationRunner = async (_ctx, _message, operation) => {
  try {
    return { status: "ok", value: await operation(new AbortController().signal) };
  } catch (error) {
    return { status: "error", error };
  }
};

describe("interactive marketplace controller", () => {
  it("applies plugin drafts once and reloads only after the manager closes", async () => {
    const backend = service();
    const ctx = context([true]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["plugins", "back"], { save: true, enabled: ["alpha"] }),
      immediateOperation,
    );
    expect(backend.calls).toContain("set:fixture-market:alpha");
    expect(ctx.reloads).toBe(1);
  });

  it("installs plugin skills into the current repository and reloads once", async () => {
    const backend = service();
    const ctx = context([true]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["project-plugins", "back"], { save: true, enabled: ["alpha"] }),
      immediateOperation,
    );
    expect(backend.calls).toContain("project-plugins:fixture-market:/project");
    expect(backend.calls).toContain("project-set:fixture-market:/project:alpha");
    expect(ctx.reloads).toBe(1);
  });

  it("requires confirmation before disabling a personal plugin", async () => {
    const declined = service({
      async listPlugins(name: string) { declined.calls.push(`plugins:${name}`); return [{ plugin, enabled: true }]; },
    });
    await runMarketplaceManager(
      context([false]),
      declined as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["plugins", "back"], { save: true, enabled: [] }),
      immediateOperation,
    );
    expect(declined.calls.some(call => call.startsWith("set:"))).toBe(false);

    const accepted = service({
      async listPlugins(name: string) { accepted.calls.push(`plugins:${name}`); return [{ plugin, enabled: true }]; },
    });
    await runMarketplaceManager(
      context([true]),
      accepted as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["plugins", "back"], { save: true, enabled: [] }),
      immediateOperation,
    );
    expect(accepted.calls).toContain("set:fixture-market:");
  });

  it("requires confirmation before uninstalling a repository plugin", async () => {
    const backend = service({
      async listProjectPlugins(name: string, cwd: string) {
        backend.calls.push(`project-plugins:${name}:${cwd}`);
        return [{ plugin, enabled: true }];
      },
    });
    const ctx = context([false]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["project-plugins", "back"], { save: true, enabled: [] }),
      immediateOperation,
    );
    expect(backend.calls.some(call => call.startsWith("project-set:"))).toBe(false);
    expect(ctx.reloads).toBe(0);
  });

  it("discards plugin drafts when trust confirmation is declined", async () => {
    const backend = service();
    const ctx = context([false]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["plugins", "back"], { save: true, enabled: ["alpha"] }),
      immediateOperation,
    );
    expect(backend.calls.some(call => call.startsWith("set:"))).toBe(false);
    expect(ctx.reloads).toBe(0);
  });

  it("adds a source and returns to the fresh marketplace list", async () => {
    const backend = service();
    const ctx = context([true], [source.remote]);
    await runMarketplaceManager(ctx, backend as unknown as MarketplaceService, views([{ kind: "add" }, null]), immediateOperation);
    expect(backend.calls).toContain(`add:${source.remote}::false`);
    expect(backend.calls.filter(call => call === "summaries")).toHaveLength(2);
    expect(ctx.reloads).toBe(0);
  });

  it("updates an enabled source after two confirmations and reloads on close", async () => {
    const enabledSummary = { ...summary, enabledCount: 1 };
    const backend = service({ async marketplaceSummaries() { backend.calls.push("summaries"); return [enabledSummary]; } });
    const ctx = context([true, true]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["update", "back"]),
      immediateOperation,
    );
    expect(backend.calls).toContain("stage:fixture-market::false");
    expect(backend.calls).toContain("activate");
    expect(ctx.reloads).toBe(1);
  });

  it("discards a no-change update without activation or reload", async () => {
    const backend = service({
      async stageUpdate() {
        backend.calls.push("stage:no-change");
        return { ...backend.candidate, newCommit: source.commit, ref: source.ref };
      },
    });
    const ctx = context([true]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["update", "back"]),
      immediateOperation,
    );
    expect(backend.calls).toContain("discard");
    expect(backend.calls).not.toContain("activate");
    expect(ctx.reloads).toBe(0);
  });

  it("discards declined updates and preserves the manager loop", async () => {
    const backend = service();
    const ctx = context([true, false]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([{ kind: "source", marketplace: source.name }, null], ["update", "back"]),
      immediateOperation,
    );
    expect(backend.calls).toContain("discard");
    expect(backend.calls).not.toContain("activate");
    expect(ctx.reloads).toBe(0);
  });

  it("runs diagnostics, removes sources, and recovers from operation errors", async () => {
    let failed = false;
    const backend = service({
      async doctor() {
        backend.calls.push("doctor");
        if (!failed) { failed = true; throw new Error("temporary diagnostic failure"); }
        return { sources: 1, plugins: 1, skills: 1, enabled: 0, staleSelections: [], orphanSnapshots: [] };
      },
    });
    const ctx = context([true]);
    await runMarketplaceManager(
      ctx,
      backend as unknown as MarketplaceService,
      views([
        { kind: "doctor" },
        { kind: "doctor" },
        { kind: "source", marketplace: source.name },
        null,
      ], ["remove"]),
      immediateOperation,
    );
    expect(ctx.notifications.some(item => item.message.includes("temporary diagnostic failure"))).toBe(true);
    expect(backend.calls).toContain("remove:fixture-market");
    expect(ctx.reloads).toBe(1);
  });
});

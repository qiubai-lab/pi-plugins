import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MarketplaceStateStore, parseLoaderState } from "./state.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "marketplace-state-"));
  roots.push(root);
  return root;
}

const source = {
  name: "fixture-market",
  displayName: "Fixture",
  remote: "https://example.test/repo.git",
  ref: "v1",
  commit: "a".repeat(40),
  snapshot: "fixture-market-aaaaaaaaaaaa-12345678",
};

describe("marketplace loader state", () => {
  it("defaults empty and atomically round-trips sorted selections", async () => {
    const store = new MarketplaceStateStore(await home());
    expect(await store.load()).toEqual({ schemaVersion: 1, sources: {}, enabled: [] });
    await store.save({ schemaVersion: 1, sources: { "fixture-market": source }, enabled: ["b@fixture-market", "a@fixture-market"] });
    expect((await store.load()).sources["fixture-market"]).toEqual(source);
    expect(JSON.parse(await readFile(store.path, "utf8")).schemaVersion).toBe(1);
  });

  it("rejects malformed and escaping snapshot state", async () => {
    const root = await home();
    const store = new MarketplaceStateStore(root);
    await writeFile(store.path, "not-json");
    await expect(store.load()).rejects.toThrow(/state is invalid/);
    expect(() => parseLoaderState({
      schemaVersion: 1,
      sources: { "fixture-market": { ...source, snapshot: "../outside" } },
      enabled: [],
    })).toThrow(/snapshot is unsafe/);
  });
});

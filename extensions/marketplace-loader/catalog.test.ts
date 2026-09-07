import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { loadManagedCatalog } from "./catalog.ts";
import { writeMarketplace } from "./test-fixture.ts";

const exec = promisify(execFile);
const roots: string[] = [];
async function temporary(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "marketplace-catalog-"));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function mutate(path: string, action: (value: any) => void): Promise<void> {
  const value = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(path, "utf8")));
  action(value);
  await writeFile(path, JSON.stringify(value));
}

describe("managed catalog validation", () => {
  it("loads a Pi-adapted local-source marketplace", async () => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [{ name: "alpha" }, { name: "beta" }]);
    const catalog = await loadManagedCatalog(root);
    expect(catalog.name).toBe("fixture-market");
    expect(catalog.plugins.map(plugin => plugin.skillNames)).toEqual([["alpha-skill"], ["beta-skill"]]);
  });

  it.each([
    ["non-Pi package", async (root: string) => mutate(join(root, "package.json"), value => { delete value.pi; }), /pi manifest/i],
    ["path traversal", async (root: string) => mutate(join(root, ".agents/plugins/marketplace.json"), value => { value.plugins[0].source.path = "../outside"; }), /\.\/-prefixed|escapes/],
    ["unsupported source", async (root: string) => mutate(join(root, ".agents/plugins/marketplace.json"), value => { value.plugins[0].source = { source: "url" }; }), /unsupported source/],
    ["manifest mismatch", async (root: string) => mutate(join(root, "plugins/alpha/.codex-plugin/plugin.json"), value => { value.name = "other"; }), /name mismatch/],
    ["missing skills", async (root: string) => rm(join(root, "plugins/alpha/skills"), { recursive: true }), /does not exist/],
  ])("rejects %s", async (_name, change, expected) => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [{ name: "alpha" }]);
    await change(root);
    await expect(loadManagedCatalog(root)).rejects.toThrow(expected);
  });

  it("rejects duplicate plugin names", async () => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [{ name: "alpha" }]);
    await mutate(join(root, ".agents/plugins/marketplace.json"), value => { value.plugins.push(structuredClone(value.plugins[0])); });
    await expect(loadManagedCatalog(root)).rejects.toThrow(/duplicate plugin name/);
  });

  it("rejects duplicate skill names", async () => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [
      { name: "alpha", skillName: "shared" },
      { name: "beta", skillName: "shared" },
    ]);
    await expect(loadManagedCatalog(root)).rejects.toThrow(/duplicate skill name shared/);
  });

  it("rejects symlinks anywhere in the snapshot", async () => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [{ name: "alpha" }]);
    await symlink("package.json", join(root, "linked.json"));
    await expect(loadManagedCatalog(root)).rejects.toThrow(/symbolic link/);
  });

  it("rejects configured file and byte limits", async () => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [{ name: "alpha" }]);
    await expect(loadManagedCatalog(root, { maxFiles: 1, maxFileBytes: 1_000_000, maxTotalBytes: 1_000_000 }))
      .rejects.toThrow(/file limit/);
    await expect(loadManagedCatalog(root, { maxFiles: 100, maxFileBytes: 2, maxTotalBytes: 1_000_000 }))
      .rejects.toThrow(/file exceeds size limit/);
    await expect(loadManagedCatalog(root, { maxFiles: 100, maxFileBytes: 1_000_000, maxTotalBytes: 2 }))
      .rejects.toThrow(/total size limit/);
  });

  it("rejects special files", async () => {
    const root = await temporary();
    await writeMarketplace(root, "fixture-market", [{ name: "alpha" }]);
    await exec("mkfifo", [join(root, "named-pipe")]);
    await expect(loadManagedCatalog(root)).rejects.toThrow(/special file/);
  });
});

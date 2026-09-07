import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitSnapshotter } from "./git.ts";
import { MarketplaceService } from "./service.ts";
import { commitGit, initializeGit, writeMarketplace } from "./test-fixture.ts";

const roots: string[] = [];
async function temporary(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function repository(marketplace = "fixture-market", skillName = "alpha-skill") {
  const root = await temporary("marketplace-repo-");
  await writeMarketplace(root, marketplace, [{ name: "alpha", skillName }]);
  const commit = await initializeGit(root);
  return { root, remote: pathToFileURL(root).href, commit };
}

describe("Git snapshot and marketplace service", () => {
  it("materializes an exact ref without retaining Git metadata", async () => {
    const repo = await repository();
    const destination = join(await temporary("marketplace-checkout-parent-"), "snapshot");
    const resolved = await new GitSnapshotter().materialize(repo.remote, repo.commit, destination);
    expect(resolved).toBe(repo.commit);
    await expect(readFile(join(destination, ".git", "HEAD"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["unsafe remote", "-upload-pack=bad", "main", /Git source/],
    ["unsafe ref", "https://example.test/repo.git", "--help", /Git ref/],
  ])("rejects %s before Git execution", async (_label, remote, ref, expected) => {
    const destination = join(await temporary("marketplace-invalid-"), "snapshot");
    await expect(new GitSnapshotter(async () => { throw new Error("runner must not execute"); }).materialize(remote, ref, destination))
      .rejects.toThrow(expected);
  });

  it("adds, enables, persists, disables, and removes a remote marketplace", async () => {
    const repo = await repository();
    const home = await temporary("marketplace-home-");
    const service = new MarketplaceService(home);
    const source = await service.addSource(repo.remote, repo.commit);
    expect(source.commit).toBe(repo.commit);
    expect(await service.discoverSkillPaths()).toEqual([]);

    await service.enable("alpha@fixture-market");
    const recreated = new MarketplaceService(home);
    expect(await recreated.discoverSkillPaths()).toHaveLength(1);
    expect(JSON.parse(await readFile(join(home, "state.json"), "utf8")).enabled).toEqual(["alpha@fixture-market"]);

    await recreated.disable("alpha@fixture-market");
    expect(await recreated.discoverSkillPaths()).toEqual([]);
    expect(await recreated.removeSource("fixture-market")).toBe(false);
    expect(await recreated.listSources()).toEqual([]);
  });

  it("does not enable plugins marked NOT_AVAILABLE", async () => {
    const root = await temporary("marketplace-repo-");
    await writeMarketplace(root, "fixture-market", [{ name: "alpha", installation: "NOT_AVAILABLE" }]);
    const commit = await initializeGit(root);
    const service = new MarketplaceService(await temporary("marketplace-home-"));
    await service.addSource(pathToFileURL(root).href, commit);
    await expect(service.enable("alpha@fixture-market")).rejects.toThrow(/not available/);
    expect(await service.discoverSkillPaths()).toEqual([]);
  });

  it("rejects collisions across managed enabled marketplaces", async () => {
    const first = await repository("first-market", "shared-skill");
    const second = await repository("second-market", "shared-skill");
    const service = new MarketplaceService(await temporary("marketplace-home-"));
    await service.addSource(first.remote, first.commit);
    await service.addSource(second.remote, second.commit);
    await service.enable("alpha@first-market");
    await expect(service.enable("alpha@second-market")).rejects.toThrow(/Skill name collision: shared-skill/);
  });

  it("rejects an update that introduces a collision between enabled marketplaces", async () => {
    const first = await repository("first-market", "shared-skill");
    const second = await repository("second-market", "unique-skill");
    const service = new MarketplaceService(await temporary("marketplace-home-"));
    await service.addSource(first.remote, "main");
    await service.addSource(second.remote, "main");
    await service.enable("alpha@first-market");
    await service.enable("alpha@second-market");
    await writeFile(join(second.root, "plugins/alpha/skills/unique-skill/SKILL.md"), "---\nname: shared-skill\ndescription: collision\n---\n");
    await commitGit(second.root, "collision");
    const candidate = await service.stageUpdate("second-market");
    await expect(service.activateUpdate(candidate)).rejects.toThrow(/collision after update/);
    expect((await service.listSources()).find(source => source.name === "second-market")?.commit).not.toBe(candidate.newCommit);
    expect(await service.discoverSkillPaths()).toHaveLength(2);
  });

  it("keeps the active snapshot for declined and failed updates, then activates a valid update", async () => {
    const repo = await repository();
    const home = await temporary("marketplace-home-");
    const service = new MarketplaceService(home);
    await service.addSource(repo.remote, "main");
    await service.enable("alpha@fixture-market");
    const before = (await service.listSources())[0];

    await writeFile(join(repo.root, "plugins/alpha/skills/alpha-skill/SKILL.md"), "---\nname: alpha-skill\ndescription: updated\n---\nUpdated.\n");
    const nextCommit = await commitGit(repo.root, "update");
    const declined = await service.stageUpdate("fixture-market");
    expect(declined.newCommit).toBe(nextCommit);
    await service.discardUpdate(declined);
    expect((await service.listSources())[0].commit).toBe(before.commit);
    expect(await service.discoverSkillPaths()).toHaveLength(1);

    await expect(service.stageUpdate("fixture-market", "missing-ref")).rejects.toThrow(/cannot be resolved/);
    expect((await service.listSources())[0].commit).toBe(before.commit);

    const accepted = await service.stageUpdate("fixture-market");
    await service.activateUpdate(accepted);
    expect((await service.listSources())[0].commit).toBe(nextCommit);
    expect(await service.discoverSkillPaths()).toHaveLength(1);
  });

  it("fails closed on malformed state and reports stale selections and orphan snapshots", async () => {
    const home = await temporary("marketplace-home-");
    const service = new MarketplaceService(home);
    await writeFile(join(home, "state.json"), "not-json");
    await expect(service.discoverSkillPaths()).rejects.toThrow(/state is invalid/);

    await rm(join(home, "state.json"));
    const repo = await repository();
    await service.addSource(repo.remote, repo.commit);
    const state = JSON.parse(await readFile(join(home, "state.json"), "utf8"));
    state.enabled = ["missing@fixture-market"];
    await writeFile(join(home, "state.json"), JSON.stringify(state));
    await writeFile(join(home, "snapshots", "orphan"), "orphan");
    const report = await service.doctor();
    expect(report.staleSelections).toEqual(["missing@fixture-market"]);
    expect(report.orphanSnapshots).toEqual(["orphan"]);
  });
});

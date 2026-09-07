import { mkdir, realpath, readdir, rename, rm } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { loadManagedCatalog, type ManagedCatalog, type ManagedPlugin } from "./catalog.ts";
import { GitSnapshotter } from "./git.ts";
import { MarketplaceStateStore, type MarketplaceLoaderState, type MarketplaceSourceState } from "./state.ts";
import type { TreeLimits } from "./tree.ts";

export interface UpdateCandidate {
  sourceName: string;
  oldCommit: string;
  newCommit: string;
  ref: string;
  temporaryPath: string;
  catalog: ManagedCatalog;
}

export interface DoctorReport {
  sources: number;
  plugins: number;
  skills: number;
  enabled: number;
  staleSelections: string[];
  orphanSnapshots: string[];
}

function selector(plugin: string, marketplace: string): string {
  return `${plugin}@${marketplace}`;
}

export function parseSelector(value: string): { plugin: string; marketplace: string } {
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) throw new Error("Plugin selector must be <plugin>@<marketplace>");
  return { plugin: value.slice(0, separator), marketplace: value.slice(separator + 1) };
}

export class MarketplaceService {
  readonly store: MarketplaceStateStore;

  constructor(
    home: string,
    private readonly git = new GitSnapshotter(),
    private readonly limits?: TreeLimits,
  ) {
    this.store = new MarketplaceStateStore(home);
  }

  private async snapshotPath(source: MarketplaceSourceState): Promise<string> {
    const root = await realpath(this.store.snapshotsRoot);
    const path = await realpath(join(root, source.snapshot)).catch(() => {
      throw new Error(`snapshot is missing for marketplace ${source.name}`);
    });
    const rel = relative(root, path);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`snapshot escapes storage for ${source.name}`);
    return path;
  }

  private async catalogFor(state: MarketplaceLoaderState, marketplace: string): Promise<ManagedCatalog> {
    const source = state.sources[marketplace];
    if (!source) throw new Error(`Unknown marketplace: ${marketplace}`);
    return loadManagedCatalog(await this.snapshotPath(source), this.limits);
  }

  async listSources(): Promise<MarketplaceSourceState[]> {
    return Object.values((await this.store.load()).sources).sort((a, b) => a.name.localeCompare(b.name));
  }

  async listPlugins(marketplace: string): Promise<{ plugin: ManagedPlugin; enabled: boolean }[]> {
    const state = await this.store.load();
    const catalog = await this.catalogFor(state, marketplace);
    const enabled = new Set(state.enabled);
    return catalog.plugins.map(plugin => ({ plugin, enabled: enabled.has(selector(plugin.name, marketplace)) }));
  }

  private async materialize(remote: string, ref: string): Promise<{ path: string; commit: string; catalog: ManagedCatalog }> {
    await mkdir(this.store.snapshotsRoot, { recursive: true, mode: 0o700 });
    const path = join(this.store.snapshotsRoot, `.tmp-${randomUUID()}`);
    const commit = await this.git.materialize(remote, ref, path);
    try {
      const catalog = await loadManagedCatalog(path, this.limits);
      return { path, commit, catalog };
    } catch (error) {
      await rm(path, { recursive: true, force: true });
      throw error;
    }
  }

  private finalSnapshotName(marketplace: string, commit: string): string {
    return `${marketplace}-${commit.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
  }

  async addSource(remote: string, ref: string): Promise<MarketplaceSourceState> {
    const candidate = await this.materialize(remote, ref);
    let finalPath: string | undefined;
    try {
      const state = await this.store.load();
      if (state.sources[candidate.catalog.name]) throw new Error(`Marketplace already exists: ${candidate.catalog.name}`);
      const snapshot = this.finalSnapshotName(candidate.catalog.name, candidate.commit);
      finalPath = join(this.store.snapshotsRoot, snapshot);
      await rename(candidate.path, finalPath);
      const source: MarketplaceSourceState = {
        name: candidate.catalog.name,
        displayName: candidate.catalog.displayName,
        remote,
        ref,
        commit: candidate.commit,
        snapshot,
      };
      state.sources[source.name] = source;
      await this.store.save(state);
      return source;
    } catch (error) {
      await rm(finalPath ?? candidate.path, { recursive: true, force: true });
      throw error;
    }
  }

  async stageUpdate(marketplace: string, ref?: string): Promise<UpdateCandidate> {
    const state = await this.store.load();
    const source = state.sources[marketplace];
    if (!source) throw new Error(`Unknown marketplace: ${marketplace}`);
    const nextRef = ref ?? source.ref;
    const candidate = await this.materialize(source.remote, nextRef);
    if (candidate.catalog.name !== marketplace) {
      await rm(candidate.path, { recursive: true, force: true });
      throw new Error(`Updated marketplace changed identity from ${marketplace} to ${candidate.catalog.name}`);
    }
    return {
      sourceName: marketplace,
      oldCommit: source.commit,
      newCommit: candidate.commit,
      ref: nextRef,
      temporaryPath: candidate.path,
      catalog: candidate.catalog,
    };
  }

  async discardUpdate(candidate: UpdateCandidate): Promise<void> {
    const leaf = basename(candidate.temporaryPath);
    const expected = resolve(this.store.snapshotsRoot, leaf);
    if (!/^\.tmp-[0-9a-f-]{36}$/.test(leaf) || resolve(candidate.temporaryPath) !== expected) {
      throw new Error("Refusing to remove an unsafe staged snapshot path");
    }
    await rm(expected, { recursive: true, force: true });
  }

  private async assertEnabledSkillsRemainUnique(
    state: MarketplaceLoaderState,
    replacement?: { marketplace: string; catalog: ManagedCatalog },
  ): Promise<void> {
    const owners = new Map<string, string>();
    const catalogs = new Map<string, ManagedCatalog>();
    if (replacement) catalogs.set(replacement.marketplace, replacement.catalog);
    for (const enabledSelector of state.enabled) {
      let parsed: { plugin: string; marketplace: string };
      try { parsed = parseSelector(enabledSelector); } catch { continue; }
      let catalog = catalogs.get(parsed.marketplace);
      if (!catalog) {
        if (!state.sources[parsed.marketplace]) continue;
        catalog = await this.catalogFor(state, parsed.marketplace);
        catalogs.set(parsed.marketplace, catalog);
      }
      const plugin = catalog.plugins.find(item => item.name === parsed.plugin);
      if (!plugin || plugin.installation === "NOT_AVAILABLE") continue;
      for (const skillName of plugin.skillNames) {
        const owner = owners.get(skillName);
        if (owner) throw new Error(`Skill name collision after update: ${skillName} is enabled by ${owner} and ${enabledSelector}`);
        owners.set(skillName, enabledSelector);
      }
    }
  }

  async activateUpdate(candidate: UpdateCandidate): Promise<MarketplaceSourceState> {
    const state = await this.store.load();
    const source = state.sources[candidate.sourceName];
    if (!source || source.commit !== candidate.oldCommit) {
      await this.discardUpdate(candidate);
      throw new Error(`Marketplace changed while update was staged: ${candidate.sourceName}`);
    }
    try {
      await this.assertEnabledSkillsRemainUnique(state, { marketplace: candidate.sourceName, catalog: candidate.catalog });
    } catch (error) {
      await this.discardUpdate(candidate);
      throw error;
    }
    let oldPath: string;
    try {
      oldPath = await this.snapshotPath(source);
    } catch (error) {
      await this.discardUpdate(candidate);
      throw error;
    }
    const snapshot = this.finalSnapshotName(source.name, candidate.newCommit);
    const finalPath = join(this.store.snapshotsRoot, snapshot);
    await rename(candidate.temporaryPath, finalPath);
    const updated: MarketplaceSourceState = {
      ...source,
      displayName: candidate.catalog.displayName,
      ref: candidate.ref,
      commit: candidate.newCommit,
      snapshot,
    };
    state.sources[source.name] = updated;
    try {
      await this.store.save(state);
    } catch (error) {
      await rm(finalPath, { recursive: true, force: true });
      throw error;
    }
    await rm(oldPath, { recursive: true, force: true }).catch(() => {
      // The new state is already durable; doctor will report the orphaned old snapshot.
    });
    return updated;
  }

  async removeSource(marketplace: string): Promise<boolean> {
    const state = await this.store.load();
    const source = state.sources[marketplace];
    if (!source) throw new Error(`Unknown marketplace: ${marketplace}`);
    const path = await this.snapshotPath(source);
    const hadEnabledPlugins = state.enabled.some(value => value.endsWith(`@${marketplace}`));
    state.enabled = state.enabled.filter(value => !value.endsWith(`@${marketplace}`));
    delete state.sources[marketplace];
    await this.store.save(state);
    await rm(path, { recursive: true, force: true });
    return hadEnabledPlugins;
  }

  async enable(value: string): Promise<void> {
    const target = parseSelector(value);
    const state = await this.store.load();
    const catalog = await this.catalogFor(state, target.marketplace);
    const plugin = catalog.plugins.find(item => item.name === target.plugin);
    if (!plugin) throw new Error(`Unknown plugin: ${value}`);
    if (plugin.installation === "NOT_AVAILABLE") throw new Error(`Plugin is not available: ${value}`);
    const targetSelector = selector(target.plugin, target.marketplace);
    if (state.enabled.includes(targetSelector)) return;

    const enabledSkillOwners = new Map<string, string>();
    for (const enabledSelector of state.enabled) {
      let parsed: { plugin: string; marketplace: string };
      try { parsed = parseSelector(enabledSelector); } catch { continue; }
      const enabledCatalog = await this.catalogFor(state, parsed.marketplace);
      const enabledPlugin = enabledCatalog.plugins.find(item => item.name === parsed.plugin);
      if (!enabledPlugin) continue;
      for (const skillName of enabledPlugin.skillNames) enabledSkillOwners.set(skillName, enabledSelector);
    }
    for (const skillName of plugin.skillNames) {
      const owner = enabledSkillOwners.get(skillName);
      if (owner) throw new Error(`Skill name collision: ${skillName} is already enabled by ${owner}`);
    }
    state.enabled.push(targetSelector);
    state.enabled.sort();
    await this.store.save(state);
  }

  async disable(value: string): Promise<void> {
    parseSelector(value);
    const state = await this.store.load();
    state.enabled = state.enabled.filter(item => item !== value);
    await this.store.save(state);
  }

  async discoverSkillPaths(): Promise<string[]> {
    const state = await this.store.load();
    const paths: string[] = [];
    for (const value of state.enabled) {
      let target: { plugin: string; marketplace: string };
      try { target = parseSelector(value); } catch { continue; }
      if (!state.sources[target.marketplace]) continue;
      const catalog = await this.catalogFor(state, target.marketplace);
      const plugin = catalog.plugins.find(item => item.name === target.plugin);
      if (plugin && plugin.installation !== "NOT_AVAILABLE") paths.push(plugin.skillRoot);
    }
    return paths;
  }

  async doctor(): Promise<DoctorReport> {
    const state = await this.store.load();
    const known = new Set<string>();
    let plugins = 0;
    let skills = 0;
    for (const source of Object.values(state.sources)) {
      const catalog = await loadManagedCatalog(await this.snapshotPath(source), this.limits);
      if (catalog.name !== source.name) throw new Error(`snapshot marketplace identity mismatch: ${source.name}`);
      plugins += catalog.plugins.length;
      skills += catalog.plugins.reduce((sum, plugin) => sum + plugin.skillNames.length, 0);
      for (const plugin of catalog.plugins) known.add(selector(plugin.name, source.name));
    }
    const entries = await readdir(this.store.snapshotsRoot).catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as string[];
      throw error;
    });
    const referenced = new Set(Object.values(state.sources).map(source => source.snapshot));
    return {
      sources: Object.keys(state.sources).length,
      plugins,
      skills,
      enabled: state.enabled.filter(value => known.has(value)).length,
      staleSelections: state.enabled.filter(value => !known.has(value)),
      orphanSnapshots: entries.filter(entry => !referenced.has(entry)),
    };
  }
}

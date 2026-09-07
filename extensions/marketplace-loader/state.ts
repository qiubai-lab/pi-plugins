import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface MarketplaceSourceState {
  name: string;
  displayName: string;
  remote: string;
  ref: string;
  commit: string;
  snapshot: string;
}

export interface MarketplaceLoaderState {
  schemaVersion: 1;
  sources: Record<string, MarketplaceSourceState>;
  enabled: string[];
}

const EMPTY_STATE: MarketplaceLoaderState = { schemaVersion: 1, sources: {}, enabled: [] };
const SNAPSHOT_NAME = /^[a-z0-9][a-z0-9.-]*$/;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`${label} must be a string`);
  return value;
}

export function parseLoaderState(value: unknown): MarketplaceLoaderState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("state must be an object");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) throw new Error(`unsupported state schema: ${String(input.schemaVersion)}`);
  if (typeof input.sources !== "object" || input.sources === null || Array.isArray(input.sources)) {
    throw new Error("state.sources must be an object");
  }
  if (!Array.isArray(input.enabled) || input.enabled.some(item => typeof item !== "string")) {
    throw new Error("state.enabled must be a string array");
  }
  const sources: Record<string, MarketplaceSourceState> = {};
  for (const [key, raw] of Object.entries(input.sources as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`state.sources.${key} must be an object`);
    const item = raw as Record<string, unknown>;
    const snapshot = requiredString(item.snapshot, `state.sources.${key}.snapshot`);
    if (!SNAPSHOT_NAME.test(snapshot) || snapshot.includes("..")) throw new Error(`state.sources.${key}.snapshot is unsafe`);
    const commit = requiredString(item.commit, `state.sources.${key}.commit`);
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`state.sources.${key}.commit is invalid`);
    sources[key] = {
      name: requiredString(item.name, `state.sources.${key}.name`),
      displayName: requiredString(item.displayName, `state.sources.${key}.displayName`),
      remote: requiredString(item.remote, `state.sources.${key}.remote`),
      ref: requiredString(item.ref, `state.sources.${key}.ref`),
      commit,
      snapshot,
    };
    if (sources[key].name !== key) throw new Error(`state source key/name mismatch: ${key}`);
  }
  return { schemaVersion: 1, sources, enabled: [...new Set(input.enabled as string[])].sort() };
}

export class MarketplaceStateStore {
  readonly path: string;
  readonly snapshotsRoot: string;

  constructor(readonly home: string) {
    this.path = join(home, "state.json");
    this.snapshotsRoot = join(home, "snapshots");
  }

  async load(): Promise<MarketplaceLoaderState> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_STATE);
      throw error;
    }
    try {
      return parseLoaderState(JSON.parse(text));
    } catch (error) {
      throw new Error(`marketplace loader state is invalid at ${this.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async save(state: MarketplaceLoaderState): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(state, null, 2)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

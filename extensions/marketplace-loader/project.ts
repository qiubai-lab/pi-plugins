import { cp, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runCommand } from "./git.ts";

export interface ProjectSourceLock {
  remote: string;
  ref: string;
  commit: string;
  plugins: string[];
}

export interface ProjectSkillLock {
  marketplace: string;
  plugin: string;
}

export interface ProjectMarketplaceLock {
  schemaVersion: 1;
  sources: Record<string, ProjectSourceLock>;
  skills: Record<string, ProjectSkillLock>;
}

const EMPTY_LOCK: ProjectMarketplaceLock = { schemaVersion: 1, sources: {}, skills: {} };
const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

export function parseProjectLock(value: unknown): ProjectMarketplaceLock {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("project lock must be an object");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) throw new Error(`unsupported project lock schema: ${String(input.schemaVersion)}`);
  if (typeof input.sources !== "object" || input.sources === null || Array.isArray(input.sources)) {
    throw new Error("project lock sources must be an object");
  }
  if (typeof input.skills !== "object" || input.skills === null || Array.isArray(input.skills)) {
    throw new Error("project lock skills must be an object");
  }
  const sources: Record<string, ProjectSourceLock> = {};
  for (const [name, raw] of Object.entries(input.sources as Record<string, unknown>)) {
    if (!SAFE_NAME.test(name) || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`invalid project marketplace lock entry: ${name}`);
    }
    const item = raw as Record<string, unknown>;
    if (!Array.isArray(item.plugins) || item.plugins.some(plugin => typeof plugin !== "string" || !SAFE_NAME.test(plugin))) {
      throw new Error(`project lock plugins are invalid for ${name}`);
    }
    const commit = requiredString(item.commit, `project lock ${name} commit`);
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`project lock commit is invalid for ${name}`);
    sources[name] = {
      remote: requiredString(item.remote, `project lock ${name} remote`),
      ref: requiredString(item.ref, `project lock ${name} ref`),
      commit,
      plugins: [...new Set(item.plugins as string[])].sort(),
    };
  }
  const skills: Record<string, ProjectSkillLock> = {};
  for (const [name, raw] of Object.entries(input.skills as Record<string, unknown>)) {
    if (!SAFE_NAME.test(name) || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error(`invalid project skill lock entry: ${name}`);
    }
    const item = raw as Record<string, unknown>;
    const marketplace = requiredString(item.marketplace, `project skill ${name} marketplace`);
    const plugin = requiredString(item.plugin, `project skill ${name} plugin`);
    if (!SAFE_NAME.test(marketplace) || !SAFE_NAME.test(plugin) || !sources[marketplace]
      || !sources[marketplace].plugins.includes(plugin)) {
      throw new Error(`project skill owner is invalid for ${name}`);
    }
    skills[name] = { marketplace, plugin };
  }
  return { schemaVersion: 1, sources, skills };
}

export async function repositoryRoot(cwd: string): Promise<string> {
  try {
    const result = await runCommand("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    const root = result.stdout.trim();
    if (!root) throw new Error("empty repository root");
    return resolve(root);
  } catch {
    throw new Error("当前目录不在 Git 仓库中，无法执行仓库级安装。");
  }
}

export class ProjectMarketplaceStore {
  readonly lockPath: string;
  readonly skillsRoot: string;

  constructor(readonly root: string) {
    this.lockPath = join(root, ".pi", "marketplace-loader.lock.json");
    this.skillsRoot = join(root, ".agents", "skills");
  }

  async load(): Promise<ProjectMarketplaceLock> {
    try {
      return parseProjectLock(JSON.parse(await readFile(this.lockPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_LOCK);
      throw new Error(`project marketplace lock is invalid at ${this.lockPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async save(lock: ProjectMarketplaceLock): Promise<void> {
    await mkdir(dirname(this.lockPath), { recursive: true });
    const temporary = `${this.lockPath}.tmp-${process.pid}-${Date.now()}`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(lock, null, 2)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.lockPath);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async replaceSkills(
    previous: ProjectMarketplaceLock,
    next: ProjectMarketplaceLock,
    sources: Record<string, string>,
  ): Promise<void> {
    await mkdir(this.skillsRoot, { recursive: true });
    const transaction = randomUUID();
    const stageRoot = join(this.root, ".agents", `.marketplace-loader-stage-${transaction}`);
    const backupRoot = join(this.root, ".agents", `.marketplace-loader-backup-${transaction}`);
    const changed = new Set([
      ...Object.keys(previous.skills).filter(name => !next.skills[name] || sources[name]),
      ...Object.keys(sources),
    ]);

    let preserveBackup = false;
    try {
      for (const [name, source] of Object.entries(sources)) {
        const target = join(this.skillsRoot, name);
        const existing = await lstat(target).catch(error => {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
          throw error;
        });
        if (existing && !previous.skills[name]) throw new Error(`拒绝覆盖非 Marketplace Loader 管理的 Skill：${target}`);
        await cp(source, join(stageRoot, name), { recursive: true, errorOnExist: true, force: false });
      }

      await mkdir(backupRoot, { recursive: true });
      try {
        for (const name of changed) {
          const target = join(this.skillsRoot, name);
          try {
            await rename(target, join(backupRoot, name));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        for (const name of Object.keys(sources)) await rename(join(stageRoot, name), join(this.skillsRoot, name));
        await this.save(next);
      } catch (error) {
        for (const name of changed) await rm(join(this.skillsRoot, name), { recursive: true, force: true });
        const restoreErrors: unknown[] = [];
        for (const name of changed) {
          try {
            await rename(join(backupRoot, name), join(this.skillsRoot, name));
          } catch (restoreError) {
            if ((restoreError as NodeJS.ErrnoException).code !== "ENOENT") restoreErrors.push(restoreError);
          }
        }
        if (restoreErrors.length > 0) {
          preserveBackup = true;
          throw new Error(`仓库 Skill 安装失败且回滚不完整；备份保留在 ${backupRoot}`, { cause: error });
        }
        throw error;
      }
    } finally {
      await rm(stageRoot, { recursive: true, force: true });
      if (!preserveBackup) await rm(backupRoot, { recursive: true, force: true });
    }
  }
}

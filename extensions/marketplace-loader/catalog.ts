import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { resolveContainedDirectory, validateSnapshotTree, type TreeLimits } from "./tree.ts";

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILL_NAME = /^name:\s*(?:"([^"]+)"|'([^']+)'|([^\n#]+))\s*$/m;

export type InstallationPolicy = "AVAILABLE" | "INSTALLED_BY_DEFAULT" | "NOT_AVAILABLE";

export interface ManagedPlugin {
  name: string;
  description: string;
  skillRoot: string;
  skillNames: string[];
  installation: InstallationPolicy;
  unsupportedCapabilities: string[];
}

export interface ManagedCatalog {
  name: string;
  displayName: string;
  root: string;
  plugins: ManagedPlugin[];
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function name(value: unknown, label: string): string {
  const result = string(value, label);
  if (result.length > 64 || !SAFE_NAME.test(result)) throw new Error(`${label} is not lowercase kebab-case`);
  return result;
}

function json(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readJson(path: string): Promise<unknown> {
  try {
    return json(await readFile(path, "utf8"), path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`required manifest does not exist: ${path}`);
    throw error;
  }
}

async function findSkillFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`skill tree contains a symbolic link: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name === "SKILL.md") files.push(path);
    }
  }
  await visit(root);
  return files;
}

function skillName(content: string, path: string): string {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error(`skill is missing YAML frontmatter: ${path}`);
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) throw new Error(`skill has unterminated YAML frontmatter: ${path}`);
  const match = normalized.slice(4, end).match(SKILL_NAME);
  const result = match?.[1] ?? match?.[2] ?? match?.[3]?.trim();
  if (!result || result.length > 64 || !SAFE_NAME.test(result)) throw new Error(`skill has invalid name: ${path}`);
  return result;
}

export async function loadManagedCatalog(snapshotRoot: string, limits?: TreeLimits): Promise<ManagedCatalog> {
  const root = await realpath(snapshotRoot);
  await validateSnapshotTree(root, limits);

  const packageManifest = object(await readJson(join(root, "package.json")), "Pi package manifest");
  const piManifest = object(packageManifest.pi, "package.json pi manifest");
  if (!Array.isArray(piManifest.skills) || piManifest.skills.length === 0) {
    throw new Error("Pi-adapted marketplace must declare non-empty package.json pi.skills");
  }

  const marketplacePath = join(root, ".agents", "plugins", "marketplace.json");
  const marketplace = object(await readJson(marketplacePath), "marketplace manifest");
  const marketplaceName = name(marketplace.name, "marketplace.name");
  if (!Array.isArray(marketplace.plugins)) throw new Error("marketplace.plugins must be an array");
  const marketplaceInterface = marketplace.interface === undefined ? {} : object(marketplace.interface, "marketplace.interface");
  const pluginNames = new Set<string>();
  const skillOwners = new Map<string, string>();
  const plugins: ManagedPlugin[] = [];

  for (const [index, raw] of marketplace.plugins.entries()) {
    const entry = object(raw, `marketplace.plugins[${index}]`);
    const pluginName = name(entry.name, `marketplace.plugins[${index}].name`);
    if (pluginNames.has(pluginName)) throw new Error(`duplicate plugin name: ${pluginName}`);
    pluginNames.add(pluginName);
    const sourcePath = typeof entry.source === "string"
      ? string(entry.source, `plugin ${pluginName} source`)
      : (() => {
          const source = object(entry.source, `plugin ${pluginName} source`);
          if (source.source !== "local") {
            throw new Error(`plugin ${pluginName} uses unsupported source: ${String(source.source)}`);
          }
          return string(source.path, `plugin ${pluginName} source.path`);
        })();
    const pluginRoot = await resolveContainedDirectory(root, sourcePath, `plugin ${pluginName} source.path`);
    const pluginManifest = object(
      await readJson(join(pluginRoot, ".codex-plugin", "plugin.json")),
      `plugin ${pluginName} manifest`,
    );
    const manifestName = name(pluginManifest.name, `plugin ${pluginName} manifest.name`);
    if (manifestName !== pluginName) throw new Error(`plugin name mismatch: catalog=${pluginName}, manifest=${manifestName}`);
    const description = string(pluginManifest.description, `plugin ${pluginName} manifest.description`);
    const skillRoot = await resolveContainedDirectory(
      pluginRoot,
      string(pluginManifest.skills, `plugin ${pluginName} manifest.skills`),
      `plugin ${pluginName} manifest.skills`,
    );
    const skillFiles = await findSkillFiles(skillRoot);
    if (skillFiles.length === 0) throw new Error(`plugin ${pluginName} contains no SKILL.md files`);
    const skillNames: string[] = [];
    for (const file of skillFiles) {
      const currentName = skillName(await readFile(file, "utf8"), file);
      const owner = skillOwners.get(currentName);
      if (owner) throw new Error(`duplicate skill name ${currentName} in plugins ${owner} and ${pluginName}`);
      skillOwners.set(currentName, pluginName);
      skillNames.push(currentName);
    }
    const policy = entry.policy === undefined ? {} : object(entry.policy, `plugin ${pluginName} policy`);
    const installation = policy.installation === undefined ? "AVAILABLE" : string(policy.installation, `plugin ${pluginName} installation`);
    if (!(["AVAILABLE", "INSTALLED_BY_DEFAULT", "NOT_AVAILABLE"] as string[]).includes(installation)) {
      throw new Error(`plugin ${pluginName} has unsupported installation policy: ${installation}`);
    }
    const capabilities = [
      ["commands", pluginManifest.commands], ["agents", pluginManifest.agents], ["hooks", pluginManifest.hooks],
      ["mcp", pluginManifest.mcpServers], ["apps", pluginManifest.apps],
    ].filter(([, configured]) => configured !== undefined).map(([capability]) => capability as string);
    for (const [capability, path] of [["commands", "commands"], ["agents", "agents"], ["scripts", "scripts"]] as const) {
      try {
        if ((await lstat(join(pluginRoot, path))).isDirectory() && !capabilities.includes(capability)) capabilities.push(capability);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    plugins.push({
      name: pluginName,
      description,
      skillRoot,
      skillNames,
      installation: installation as InstallationPolicy,
      unsupportedCapabilities: capabilities.sort(),
    });
  }

  return {
    name: marketplaceName,
    displayName: typeof marketplaceInterface.displayName === "string" ? marketplaceInterface.displayName : marketplaceName,
    root,
    plugins,
  };
}

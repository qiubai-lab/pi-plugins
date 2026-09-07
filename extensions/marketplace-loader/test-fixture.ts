import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface FixturePlugin {
  name: string;
  skillName?: string;
  installation?: "AVAILABLE" | "INSTALLED_BY_DEFAULT" | "NOT_AVAILABLE";
}

export async function writeMarketplace(root: string, marketplace: string, plugins: FixturePlugin[]): Promise<void> {
  await mkdir(join(root, ".agents", "plugins"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: `${marketplace}-package`,
    keywords: ["pi-package"],
    pi: { skills: ["./plugins/*/skills"] },
  }));
  const entries = [];
  for (const plugin of plugins) {
    const pluginRoot = join(root, "plugins", plugin.name);
    const skillName = plugin.skillName ?? `${plugin.name}-skill`;
    await mkdir(join(pluginRoot, ".codex-plugin"), { recursive: true });
    await mkdir(join(pluginRoot, "skills", skillName), { recursive: true });
    await writeFile(join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
      name: plugin.name,
      version: "1.0.0",
      description: `${plugin.name} description`,
      skills: "./skills",
    }));
    await writeFile(join(pluginRoot, "skills", skillName, "SKILL.md"), `---\nname: ${skillName}\ndescription: fixture\n---\n\nFixture body.\n`);
    entries.push({
      name: plugin.name,
      source: { source: "local", path: `./plugins/${plugin.name}` },
      policy: { installation: plugin.installation ?? "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Test",
    });
  }
  await writeFile(join(root, ".agents", "plugins", "marketplace.json"), JSON.stringify({
    name: marketplace,
    interface: { displayName: `${marketplace} display` },
    plugins: entries,
  }));
}

export async function initializeGit(root: string): Promise<string> {
  await exec("git", ["init", "-q", "-b", "main", root]);
  await exec("git", ["-C", root, "config", "user.email", "test@example.test"]);
  await exec("git", ["-C", root, "config", "user.name", "Test"]);
  return commitGit(root, "initial");
}

export async function commitGit(root: string, message: string): Promise<string> {
  await exec("git", ["-C", root, "add", "."]);
  await exec("git", ["-C", root, "commit", "-q", "-m", message]);
  const { stdout } = await exec("git", ["-C", root, "rev-parse", "HEAD"]);
  return stdout.trim();
}

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[], cwd?: string) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args, cwd) => new Promise((resolve, reject) => {
  execFile(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      reject(new Error(`${command} ${args[0] ?? ""} failed: ${stderr.trim() || error.message}`));
      return;
    }
    resolve({ stdout, stderr });
  });
});

function validateRemote(remote: string): void {
  const protocolUrl = /^(?:https?|ssh|git|file):\/\//.test(remote);
  const scpUrl = /^[^\s@]+@[^\s:]+:.+/.test(remote);
  if ((!protocolUrl && !scpUrl) || remote.startsWith("-") || /[\0\r\n]/.test(remote)) {
    throw new Error("Git source must be an HTTPS, SSH, Git, file, or SCP-style URL");
  }
}

function validateRef(ref: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref) || ref.includes("..") || ref.includes("@{") || ref.endsWith("/")) {
    throw new Error("Git ref contains unsafe or unsupported characters");
  }
}

export class GitSnapshotter {
  constructor(private readonly runner: CommandRunner = runCommand) {}

  async materialize(remote: string, ref: string, destination: string): Promise<string> {
    validateRemote(remote);
    validateRef(ref);
    try {
      await this.runner("git", [
        "-c", "core.hooksPath=/dev/null",
        "clone", "--no-checkout", "--filter=blob:none", "--no-recurse-submodules", "--", remote, destination,
      ]);
      let commit: string | undefined;
      for (const candidate of [ref, `origin/${ref}`]) {
        try {
          const result = await this.runner("git", ["-C", destination, "rev-parse", "--verify", `${candidate}^{commit}`]);
          const resolved = result.stdout.trim().toLowerCase();
          if (/^[0-9a-f]{40}$/.test(resolved)) {
            commit = resolved;
            break;
          }
        } catch {
          // Try the remote-tracking form next.
        }
      }
      if (!commit) throw new Error(`Git ref cannot be resolved: ${ref}`);
      await this.runner("git", [
        "-c", "core.hooksPath=/dev/null",
        "-C", destination, "checkout", "--detach", commit, "--",
      ]);
      await rm(join(destination, ".git"), { recursive: true, force: true });
      return commit;
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }
}

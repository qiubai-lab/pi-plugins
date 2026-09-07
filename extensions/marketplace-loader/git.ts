import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[], cwd?: string, signal?: AbortSignal) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args, cwd, signal) => new Promise((resolve, reject) => {
  execFile(command, args, { cwd, signal, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      reject(new Error(`${command} ${args[0] ?? ""} 执行失败：${stderr.trim() || error.message}`));
      return;
    }
    resolve({ stdout, stderr });
  });
});

function validateRemote(remote: string): void {
  const protocolUrl = /^(?:https?|ssh|git|file):\/\//.test(remote);
  const scpUrl = /^[^\s@]+@[^\s:]+:.+/.test(remote);
  if ((!protocolUrl && !scpUrl) || remote.startsWith("-") || /[\0\r\n]/.test(remote)) {
    throw new Error("Git 地址必须是 HTTPS、SSH、Git、file 或 SCP 格式的 URL");
  }
}

function validateRef(ref: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref) || ref.includes("..") || ref.includes("@{") || ref.endsWith("/")) {
    throw new Error("Git 引用包含不安全或不支持的字符");
  }
}

export interface MaterializedGitSnapshot {
  commit: string;
  ref: string;
}

export class GitSnapshotter {
  constructor(private readonly runner: CommandRunner = runCommand) {}

  private async defaultRef(destination: string, signal?: AbortSignal): Promise<string> {
    try {
      const result = await this.runner("git", [
        "-C", destination, "symbolic-ref", "--short", "refs/remotes/origin/HEAD",
      ], undefined, signal);
      const symbolicRef = result.stdout.trim();
      if (!symbolicRef.startsWith("origin/")) throw new Error("unexpected symbolic ref");
      const ref = symbolicRef.slice("origin/".length);
      validateRef(ref);
      return ref;
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error("无法解析远程仓库的默认分支 origin/HEAD");
    }
  }

  async materialize(remote: string, ref: string | undefined, destination: string, signal?: AbortSignal): Promise<MaterializedGitSnapshot> {
    validateRemote(remote);
    if (ref !== undefined) validateRef(ref);
    try {
      await this.runner("git", [
        "-c", "core.hooksPath=/dev/null",
        "clone", "--no-checkout", "--filter=blob:none", "--no-recurse-submodules", "--", remote, destination,
      ], undefined, signal);
      const resolvedRef = ref ?? await this.defaultRef(destination, signal);
      let commit: string | undefined;
      for (const candidate of [resolvedRef, `origin/${resolvedRef}`]) {
        try {
          const result = await this.runner("git", ["-C", destination, "rev-parse", "--verify", `${candidate}^{commit}`], undefined, signal);
          const resolved = result.stdout.trim().toLowerCase();
          if (/^[0-9a-f]{40}$/.test(resolved)) {
            commit = resolved;
            break;
          }
        } catch {
          // 继续尝试远程跟踪分支形式。
        }
      }
      if (!commit) throw new Error(`无法解析 Git 引用：${resolvedRef}`);
      await this.runner("git", [
        "-c", "core.hooksPath=/dev/null",
        "-C", destination, "checkout", "--detach", commit, "--",
      ], undefined, signal);
      await rm(join(destination, ".git"), { recursive: true, force: true });
      return { commit, ref: resolvedRef };
    } catch (error) {
      await rm(destination, { recursive: true, force: true });
      throw error;
    }
  }
}

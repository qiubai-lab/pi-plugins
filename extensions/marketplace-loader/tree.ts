import { lstat, realpath, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface TreeLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_TREE_LIMITS: TreeLimits = {
  maxFiles: 10_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
};

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function resolveContainedDirectory(root: string, configuredPath: string, label: string): Promise<string> {
  if (!configuredPath.startsWith("./") || isAbsolute(configuredPath)) {
    throw new Error(`${label} must be a ./-prefixed relative path`);
  }
  const canonicalRoot = await realpath(root);
  const lexicalPath = resolve(canonicalRoot, configuredPath);
  if (!isInside(canonicalRoot, lexicalPath)) throw new Error(`${label} escapes its root`);
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(lexicalPath);
  } catch {
    throw new Error(`${label} does not exist`);
  }
  if (!isInside(canonicalRoot, canonicalPath)) throw new Error(`${label} resolves outside its root`);
  if (!(await lstat(canonicalPath)).isDirectory()) throw new Error(`${label} must be a directory`);
  return canonicalPath;
}

export async function validateSnapshotTree(root: string, limits: TreeLimits = DEFAULT_TREE_LIMITS): Promise<void> {
  const canonicalRoot = await realpath(root);
  let files = 0;
  let totalBytes = 0;

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const rel = relative(canonicalRoot, path);
      const info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error(`snapshot contains a symbolic link: ${rel}`);
      if (info.isDirectory()) {
        await visit(path);
      } else if (info.isFile()) {
        files += 1;
        totalBytes += info.size;
        if (files > limits.maxFiles) throw new Error(`snapshot exceeds file limit (${limits.maxFiles})`);
        if (info.size > limits.maxFileBytes) throw new Error(`snapshot file exceeds size limit: ${rel}`);
        if (totalBytes > limits.maxTotalBytes) {
          throw new Error(`snapshot exceeds total size limit (${limits.maxTotalBytes} bytes)`);
        }
      } else {
        throw new Error(`snapshot contains a special file: ${rel}`);
      }
    }
  }

  await visit(canonicalRoot);
}

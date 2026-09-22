/**
 * Thin wrapper around the rclone CLI.
 *
 * rclone already does the heavy lifting (auth, config, transfers across 80+
 * backends). This module shells out to the `rclone` binary and parses its JSON
 * output. No runtime npm dependencies are required.
 *
 * Binary selection: $RCLONE_BINARY, else "rclone" on $PATH.
 * Config selection: rclone's own $RCLONE_CONFIG env var (we pass process.env
 * through untouched).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RCLONE_BINARY = process.env.RCLONE_BINARY ?? "rclone";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_BUFFER = 64 * 1024 * 1024;

export class RcloneError extends Error {
  readonly stderr: string;
  readonly exitCode?: number;

  constructor(message: string, stderr: string = "", exitCode?: number) {
    super(message);
    this.name = "RcloneError";
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

export interface RunOptions {
  timeoutMs?: number;
  maxBuffer?: number;
}

function normalizeRcloneMessage(stderr: string, fallback: string): string {
  const lines = stderr
    .split("\n")
    .map((line) =>
      line
        .replace(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+(ERROR\s*:?|NOTICE\s*:?|INFO\s*:?|DEBUG\s*:?)?\s*/i, "")
        .trim(),
    )
    .filter(Boolean);
  const unique = Array.from(new Set(lines));
  return unique.length > 0 ? unique.join("\n") : fallback;
}

export async function runRclone(args: string[], options: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(RCLONE_BINARY, args, {
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      encoding: "utf8",
      env: { ...process.env },
    });
    return { stdout, stderr };
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (e.code === "ENOENT") {
      throw new RcloneError(
        `rclone binary not found (looked for "${RCLONE_BINARY}"). ` +
          `Install it with "brew install rclone", then configure a remote with "rclone config".`,
      );
    }
    const stderr = e.stderr ?? "";
    throw new RcloneError(normalizeRcloneMessage(stderr, e.message ?? "rclone command failed"), stderr, typeof e.code === "number" ? e.code : undefined);
  }
}

/** Parse the stdout of a JSON-emitting rclone command (lsjson, size --json, about --json). */
export async function runRcloneJson(args: string[], options?: RunOptions): Promise<unknown> {
  const { stdout } = await runRclone(args, options);
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function isRcloneInstalled(): Promise<boolean> {
  try {
    await runRclone(["version"], { timeoutMs: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function rcloneVersion(): Promise<string> {
  const { stdout } = await runRclone(["version"]);
  const first = stdout.split("\n")[0]?.trim();
  return first || "unknown";
}

export async function rcloneConfigFilePath(): Promise<string> {
  const { stdout } = await runRclone(["config", "file"]);
  const pathLine = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("/") || l.startsWith("~"));
  return pathLine ?? "~/.config/rclone/rclone.conf";
}

/** `rclone listremotes` — returns names WITHOUT the trailing colon. */
export async function listRemotes(): Promise<string[]> {
  const { stdout } = await runRclone(["listremotes"]);
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.endsWith(":") ? l.slice(0, -1) : l));
}

export interface LsjsonEntry {
  Path: string;
  Name: string;
  Size: number;
  MimeType?: string;
  ModTime?: string;
  IsDir: boolean;
  Items?: number;
  ID?: string;
}

/** `rclone lsjson <target> [flags]`. Target is a full `remote:path` spec. */
export async function lsjson(target: string, flags: string[] = []): Promise<LsjsonEntry[]> {
  const out = await runRcloneJson(["lsjson", target, ...flags]);
  return Array.isArray(out) ? (out as LsjsonEntry[]) : [];
}

/** `rclone cat <target>` with optional byte range. */
export async function rcloneCat(target: string, options: { offset?: number; count?: number } = {}): Promise<string> {
  const args = ["cat", target];
  if (options.offset !== undefined) args.push("--offset", String(options.offset));
  if (options.count !== undefined) args.push("--count", String(options.count));
  const { stdout } = await runRclone(args);
  return stdout;
}

/** `rclone size --json <target>` — number of objects and total bytes. */
export async function rcloneSize(target: string): Promise<{ count: number; bytes: number }> {
  const out = (await runRcloneJson(["size", "--json", target])) as { count?: number; bytes?: number } | null;
  return { count: Number(out?.count ?? 0), bytes: Number(out?.bytes ?? 0) };
}

/** `rclone about --json <remote>:` — storage quota info when the backend supports it. */
export async function rcloneAbout(remote: string): Promise<Record<string, unknown> | null> {
  const out = await runRcloneJson(["about", "--json", `${remote}:`]);
  return out as Record<string, unknown> | null;
}

/** `rclone config show` — remote definitions with secrets obfuscated by rclone. */
export async function rcloneConfigShow(): Promise<string> {
  const { stdout } = await runRclone(["config", "show"]);
  return stdout;
}

/**
 * Split an rclone path spec into its remote name and path portion.
 *
 *   "onedrive:docs/report.pdf" -> { remote: "onedrive", path: "docs/report.pdf" }
 *   "onedrive:"               -> { remote: "onedrive", path: "" }
 *   "/tmp/x.txt"              -> { path: "/tmp/x.txt" }         (local)
 *   "./x.txt", "~/x.txt"      -> { path: ... }                 (local)
 */
export function splitRemotePath(input: string): { remote?: string; path: string } {
  const s = input.trim();
  if (
    s === "" ||
    s.startsWith("/") ||
    s.startsWith("./") ||
    s.startsWith("../") ||
    s.startsWith("~") ||
    s === "." ||
    s === ".."
  ) {
    return { path: s };
  }
  const match = /^([A-Za-z0-9._-]+):(.*)$/.exec(s);
  if (match) {
    return { remote: match[1], path: match[2] };
  }
  return { path: s };
}

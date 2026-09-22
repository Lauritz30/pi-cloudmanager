/**
 * Configuration for the pi-cloudmanager extension.
 *
 * The source of truth for remotes is rclone's own config file
 * (~/.config/rclone/rclone.conf or $RCLONE_CONFIG). This extension does NOT
 * duplicate credentials. Its config file only holds pi-specific policy:
 *
 *   ~/.pi/agent/pi-cloudmanager.json
 *
 *   {
 *     "defaultRemote": "onedrive",
 *     "safetyLevel": "confirm",
 *     "mock": false,
 *     "remotes": [
 *       { "name": "onedrive", "safetyLevel": "confirm", "allowedRoots": [] },
 *       { "name": "backup",  "safetyLevel": "readonly" }
 *     ]
 *   }
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_FILE_NAME = "pi-cloudmanager.json";

export type SafetyLevel = "open" | "confirm" | "readonly";

/** Per-action headless approval rule (unattended writes in "confirm" mode). */
export interface HeadlessApprovalRule {
  action: string;
  remote?: string;
  paths?: string[];
}

/** Optional per-remote policy overlay. Remotes themselves live in rclone.conf. */
export interface RcloneRemoteConfig {
  name: string;
  safetyLevel?: SafetyLevel;
  /** When non-empty, mutations are only allowed within these path prefixes. */
  allowedRoots?: string[];
  headlessApprovals?: HeadlessApprovalRule[];
}

export interface RcloneConfig {
  defaultRemote?: string;
  safetyLevel: SafetyLevel;
  mock: boolean;
  remotes: RcloneRemoteConfig[];
  configPath: string;
  configExists: boolean;
}

export class ConfigError extends Error {}

export function getConfigPath(): string {
  return join(homedir(), ".pi", "agent", CONFIG_FILE_NAME);
}

export function loadConfig(path: string = getConfigPath()): RcloneConfig {
  if (!existsSync(path)) {
    return {
      defaultRemote: undefined,
      safetyLevel: "confirm",
      mock: false,
      remotes: [],
      configPath: path,
      configExists: false,
    };
  }

  let raw: {
    defaultRemote?: unknown;
    safetyLevel?: unknown;
    mock?: unknown;
    remotes?: unknown;
  };
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as typeof raw;
  } catch (error) {
    throw new ConfigError(`Failed to parse ${path}: ${(error as Error).message}`);
  }

  const safetyLevel: SafetyLevel =
    raw.safetyLevel === "open" || raw.safetyLevel === "readonly" ? raw.safetyLevel : "confirm";

  const remotes: RcloneRemoteConfig[] = [];
  if (raw.remotes !== undefined) {
    if (!Array.isArray(raw.remotes)) {
      throw new ConfigError(`Config ${path}: "remotes" must be an array.`);
    }
    for (const entry of raw.remotes as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== "object" || typeof entry.name !== "string" || !entry.name.trim()) {
        throw new ConfigError(`Config ${path}: every entry in "remotes" requires a "name" string.`);
      }
      if (
        entry.safetyLevel !== undefined &&
        entry.safetyLevel !== "open" &&
        entry.safetyLevel !== "confirm" &&
        entry.safetyLevel !== "readonly"
      ) {
        throw new ConfigError(
          `Config ${path}: remote "${entry.name}" field "safetyLevel" must be "open", "confirm" or "readonly".`,
        );
      }
      if (entry.allowedRoots !== undefined && (!Array.isArray(entry.allowedRoots) || !entry.allowedRoots.every((r) => typeof r === "string"))) {
        throw new ConfigError(`Config ${path}: remote "${entry.name}" field "allowedRoots" must be an array of strings.`);
      }
      if (entry.headlessApprovals !== undefined && !Array.isArray(entry.headlessApprovals)) {
        throw new ConfigError(`Config ${path}: remote "${entry.name}" field "headlessApprovals" must be an array.`);
      }
      const headlessApprovals = (entry.headlessApprovals ?? []).map((rule, i) => {
        const r = rule as Record<string, unknown>;
        if (!r || typeof r !== "object" || typeof r.action !== "string" || !r.action.trim()) {
          throw new ConfigError(`Config ${path}: remote "${entry.name}" headlessApprovals[${i}] requires an "action" string.`);
        }
        if (r.remote !== undefined && typeof r.remote !== "string") {
          throw new ConfigError(`Config ${path}: remote "${entry.name}" headlessApprovals[${i}] field "remote" must be a string.`);
        }
        if (r.paths !== undefined && (!Array.isArray(r.paths) || !r.paths.every((p) => typeof p === "string"))) {
          throw new ConfigError(`Config ${path}: remote "${entry.name}" headlessApprovals[${i}] field "paths" must be an array of strings.`);
        }
        return {
          action: r.action,
          ...(typeof r.remote === "string" ? { remote: r.remote } : {}),
          ...(Array.isArray(r.paths) ? { paths: r.paths.filter((p): p is string => typeof p === "string") } : {}),
        };
      });

      remotes.push({
        name: entry.name.trim(),
        ...(entry.safetyLevel !== undefined ? { safetyLevel: entry.safetyLevel as SafetyLevel } : {}),
        ...(Array.isArray(entry.allowedRoots)
          ? { allowedRoots: entry.allowedRoots.filter((r): r is string => typeof r === "string") }
          : {}),
        ...(headlessApprovals.length > 0 ? { headlessApprovals } : {}),
      });
    }
  }

  return {
    defaultRemote: typeof raw.defaultRemote === "string" && raw.defaultRemote.trim() ? raw.defaultRemote.trim() : undefined,
    safetyLevel,
    mock: Boolean(raw.mock),
    remotes,
    configPath: path,
    configExists: true,
  };
}

export interface ResolvedRemote {
  name: string;
  /** Optional policy overlay from pi-cloudmanager.json; undefined when none is configured. */
  override?: RcloneRemoteConfig;
}

export function resolveRemote(config: RcloneConfig, name?: string): ResolvedRemote {
  const remoteName = (name ?? config.defaultRemote ?? "").trim();
  if (!remoteName) {
    throw new ConfigError(
      `No rclone remote specified and no "defaultRemote" in ${config.configPath}. ` +
        `Configure a remote with "rclone config" (e.g. OneDrive) and set defaultRemote.`,
    );
  }
  const override = config.remotes.find((r) => r.name === remoteName);
  return { name: remoteName, override };
}

export function resolveSafetyLevel(
  config: Pick<RcloneConfig, "safetyLevel">,
  remote?: Pick<RcloneRemoteConfig, "safetyLevel">,
): SafetyLevel {
  return remote?.safetyLevel ?? config.safetyLevel ?? "confirm";
}

/**
 * rclone_doctor — check the rclone binary, config, remotes, and connectivity.
 */

import { Type, type Static } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { loadConfig, resolveRemote } from "../config.ts";
import {
  isRcloneInstalled,
  listRemotes,
  lsjson,
  rcloneConfigFilePath,
  rcloneVersion,
} from "../rclone.ts";
import { remoteParam, textResult, type ToolResult } from "./shared.ts";

const parameters = Type.Object({
  remote: remoteParam,
});
type Params = Static<typeof parameters>;

export async function runDoctor(params: Params): Promise<ToolResult> {
  const config = loadConfig();
  const lines: string[] = [];

  if (!(await isRcloneInstalled())) {
    lines.push(`✗ rclone binary not found. Install with "brew install rclone", then run "rclone config" to add a remote (e.g. OneDrive).`);
    lines.push(`  Policy config: ${config.configExists ? "present" : "missing"} at ${config.configPath}.`);
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { installed: false, config },
      isError: true,
    };
  }

  lines.push(`✓ rclone installed (${await rcloneVersion()})`);
  lines.push(`✓ config file: ${await rcloneConfigFilePath()}`);

  if (!config.configExists) {
    lines.push(`ℹ No ${config.configPath} yet — remotes come straight from rclone.conf, writes use global safetyLevel "confirm".`);
  }

  const remotes = await listRemotes();
  if (remotes.length === 0) {
    lines.push(`✗ No remotes configured. Run "rclone config" to add one (e.g. OneDrive).`);
  } else {
    lines.push(`✓ ${remotes.length} remote(s): ${remotes.join(", ")}`);
  }

  let active: string | undefined;
  try {
    active = resolveRemote(config, params.remote).name;
  } catch (error) {
    lines.push(`✗ ${(error as Error).message}`);
  }

  if (!config.mock) {
    const toCheck = active ? [active] : remotes;
    for (const name of toCheck) {
      try {
        const entries = await lsjson(`${name}:`, ["--max-depth", "1"]);
        lines.push(`✓ ${name}: reachable (${entries.length} top-level entr${entries.length === 1 ? "y" : "ies"})`);
      } catch (error) {
        lines.push(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    lines.push(`ℹ mock mode enabled — skipping live connectivity checks.`);
  }

  const ok = !lines.some((l) => l.startsWith("✗"));
  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { installed: true, remotes, active, config },
    isError: !ok,
  };
}

export function createDoctorTool(): ToolDefinition<any, any, any> {
  return {
    name: "rclone_doctor",
    label: "rclone Doctor",
    description: "Check rclone installation, configuration, remotes, and connectivity.",
    promptSnippet: "Verify rclone configuration and connection health",
    parameters,
    async execute(_toolCallId: string, params: Params): Promise<ToolResult> {
      return runDoctor(params);
    },
  };
}

/**
 * Extension entry: registers tools, commands, footer status and connection card.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig, resolveRemote, resolveSafetyLevel, type RcloneConfig } from "./config.ts";
import { isRcloneInstalled, listRemotes } from "./rclone.ts";
import {
  publishConnectionCard,
  publishFooterStatus,
  registerConnectionCardRenderer,
  type StatusSnapshot,
  type StatusUi,
} from "./status.ts";
import { createDoctorTool, runDoctor } from "./tools/doctor.ts";
import { createReadTools } from "./tools/read.ts";
import { createWriteTools } from "./tools/write.ts";

export default function piRclone(pi: ExtensionAPI): void {
  pi.registerTool(createDoctorTool());
  for (const tool of createReadTools()) pi.registerTool(tool);
  for (const tool of createWriteTools()) pi.registerTool(tool);

  registerConnectionCardRenderer(pi);

  async function refreshStatus(ctx: StatusUi): Promise<void> {
    const config: RcloneConfig = loadConfig();

    let remoteName: string | undefined;
    let safetyLevel: string | undefined;
    try {
      const resolved = resolveRemote(config);
      remoteName = resolved.name;
      safetyLevel = resolveSafetyLevel(config, resolved.override);
    } catch {
      remoteName = undefined;
      safetyLevel = undefined;
    }

    let installed = false;
    let remotes: string[] = [];
    try {
      installed = await isRcloneInstalled();
      if (installed) remotes = await listRemotes();
    } catch {
      installed = false;
    }

    const snapshot: StatusSnapshot = { remoteName, safetyLevel, installed, remotes };
    publishFooterStatus(ctx, snapshot);
    publishConnectionCard(pi, config, snapshot);
  }

  pi.on("session_start", async (_event, ctx: StatusUi) => {
    await refreshStatus(ctx);
  });

  pi.registerCommand("rclone-status", {
    description: "Show current rclone status (binary, active remote, safety level)",
    handler: async (_args, ctx: StatusUi) => {
      await refreshStatus(ctx);
    },
  });

  pi.registerCommand("rclone-doctor", {
    description: "Check rclone installation, config, remotes, and connectivity",
    handler: async (_args, ctx: StatusUi) => {
      const result = await runDoctor({});
      ctx.ui.notify(result.content[0].text, result.isError ? "error" : "info");
    },
  });
}

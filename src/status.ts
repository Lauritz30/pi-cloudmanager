/**
 * Footer status label and connection card, mirroring pi-confluence-multiproject.
 */

import { Box, Text } from "@earendil-works/pi-tui";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RcloneConfig } from "./config.ts";

const ENTRY_TYPE = "pi-cloudmanager:connection";

export interface StatusUi {
  ui: {
    setStatus(key: string, text: string | undefined): void;
    notify(message: string, kind?: string): void;
  };
}

export interface ConnectionCardData {
  configured: boolean;
  remote?: string;
  safetyLevel?: string;
  defaultRemote?: string;
  remotes: string[];
  rcloneInstalled: boolean;
  configPath: string;
}

export interface StatusSnapshot {
  remoteName?: string;
  safetyLevel?: string;
  installed: boolean;
  remotes: string[];
}

export function buildFooterLabel(snapshot: StatusSnapshot): string {
  if (!snapshot.installed) return "rclone · binary not found";
  if (!snapshot.remoteName) return "rclone · not configured";
  return `✓ rclone · ${snapshot.remoteName} (${snapshot.safetyLevel ?? "confirm"})`;
}

export function publishFooterStatus(ctx: StatusUi, snapshot: StatusSnapshot): void {
  ctx.ui.setStatus("pi-cloudmanager", buildFooterLabel(snapshot));
}

export function publishConnectionCard(pi: ExtensionAPI, config: RcloneConfig, snapshot: StatusSnapshot): void {
  pi.appendEntry<ConnectionCardData>(ENTRY_TYPE, {
    configured: Boolean(snapshot.remoteName),
    remote: snapshot.remoteName,
    safetyLevel: snapshot.safetyLevel,
    defaultRemote: config.defaultRemote,
    remotes: snapshot.remotes,
    rcloneInstalled: snapshot.installed,
    configPath: config.configPath,
  });
}

export function registerConnectionCardRenderer(pi: ExtensionAPI): void {
  pi.registerEntryRenderer<ConnectionCardData>(ENTRY_TYPE, (entry) => {
    const data = entry.data;
    const box = new Box(1, 1);

    if (!data?.rcloneInstalled) {
      box.addChild(new Text("rclone: binary not found — install with `brew install rclone`"));
      return box;
    }

    if (!data.configured) {
      box.addChild(
        new Text(`rclone: no remote configured${data ? ` (policy config: ${data.configPath})` : ""}`),
      );
      return box;
    }

    box.addChild(
      new Text(`rclone · ${data.remote ?? "?"} · safetyLevel=${data.safetyLevel ?? "?"}`),
    );
    const remotesLine = data.remotes.length > 0 ? data.remotes.join(", ") : "(none)";
    box.addChild(new Text(`remotes: ${remotesLine}`));
    return box;
  });
}

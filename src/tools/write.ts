/**
 * Write tools: mkdir, copy, move, sync, delete, purge.
 *
 * All are gated by safetyLevel (default: confirm) via guardMutation, and by a
 * remote's optional allowedRoots restriction. Every tool supports dryRun to
 * preview the exact command without executing it.
 */

import { Type, type Static } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { loadConfig, type RcloneConfig, type RcloneRemoteConfig } from "../config.ts";
import { runRclone, splitRemotePath } from "../rclone.ts";
import { assertAllowedRoot, guardMutation, type MutationContext } from "../safety.ts";
import { errorResult, textResult, type ToolResult } from "./shared.ts";

const RCLONE_BIN = process.env.RCLONE_BINARY ?? "rclone";

function commandText(args: string[]): string {
  return `${RCLONE_BIN} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
}

interface WriteParams {
  dryRun?: boolean;
}

/** Resolve the destination remote + path for gating. Local targets gate under a synthetic "(local)" name. */
function resolveDest(
  config: RcloneConfig,
  dest: string,
): { remote: Pick<RcloneRemoteConfig, "name" | "safetyLevel" | "allowedRoots" | "headlessApprovals">; path: string } {
  const parsed = splitRemotePath(dest);
  if (parsed.remote) {
    const override = config.remotes.find((r) => r.name === parsed.remote);
    return { remote: override ?? { name: parsed.remote }, path: parsed.path };
  }
  return { remote: { name: "(local)" }, path: parsed.path };
}

async function gate(
  config: RcloneConfig,
  target: string,
  ctx: MutationContext | undefined,
  request: { title: string; message: string; action: string },
): Promise<void> {
  const { remote, path } = resolveDest(config, target);
  assertAllowedRoot(remote, path);
  await guardMutation(config, remote, ctx, { ...request, remote: remote.name, path });
}

async function runMutation(
  args: string[],
  params: WriteParams,
  config: RcloneConfig,
  gateTarget: string,
  ctx: MutationContext | undefined,
  request: { title: string; message: string; action: string },
): Promise<ToolResult> {
  try {
    if (params.dryRun) {
      return textResult(`DRY RUN - nothing executed.\n\nCommand: ${commandText(args)}`, {
        dryRun: true,
        command: commandText(args),
      });
    }
    await gate(config, gateTarget, ctx, request);
    await runRclone(args);
    return textResult(`OK: ${commandText(args)}`, { command: commandText(args) });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// mkdir
// ---------------------------------------------------------------------------

const mkdirParameters = Type.Object({
  target: Type.String({ description: "Directory to create, as `remote:path` or a local path." }),
  dryRun: Type.Optional(Type.Boolean({ description: "Preview the command without executing." })),
});
type MkdirParams = Static<typeof mkdirParameters>;

// ---------------------------------------------------------------------------
// copy / move / sync
// ---------------------------------------------------------------------------

const transferParameters = Type.Object({
  source: Type.String({ description: "Source, as `remote:path` or a local path." }),
  dest: Type.String({ description: "Destination, as `remote:path` or a local path." }),
  dryRun: Type.Optional(Type.Boolean({ description: "Preview the command without executing." })),
});
type TransferParams = Static<typeof transferParameters>;

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

const deleteFileParameters = Type.Object({
  target: Type.String({ description: "Single file to delete, as `remote:path`." }),
  dryRun: Type.Optional(Type.Boolean({ description: "Preview the command without executing." })),
});
type DeleteFileParams = Static<typeof deleteFileParameters>;

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

const deleteParameters = Type.Object({
  target: Type.String({ description: "Path whose files to delete, as `remote:path`." }),
  rmdirs: Type.Optional(Type.Boolean({ description: "Also remove empty directories after deleting files." })),
  dryRun: Type.Optional(Type.Boolean({ description: "Preview the command without executing." })),
});
type DeleteParams = Static<typeof deleteParameters>;

// ---------------------------------------------------------------------------
// purge
// ---------------------------------------------------------------------------

const purgeParameters = Type.Object({
  target: Type.String({ description: "Directory to remove with all contents, as `remote:path`." }),
  dryRun: Type.Optional(Type.Boolean({ description: "Preview the command without executing." })),
});
type PurgeParams = Static<typeof purgeParameters>;

export function createWriteTools(): ToolDefinition<any, any, any>[] {
  return [
    {
      name: "rclone_mkdir",
      label: "Create Directory",
      description: "Create a directory on an rclone remote (or locally). Gated by safetyLevel (default: confirm).",
      promptSnippet: "Create a directory on an rclone remote",
      parameters: mkdirParameters,
      async execute(
        _toolCallId: string,
        params: MkdirParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        return runMutation(["mkdir", params.target], params, config, params.target, ctx, {
          title: "Create directory",
          message: `Create directory "${params.target}"?`,
          action: "rclone_mkdir",
        });
      },
    },
    {
      name: "rclone_copy",
      label: "Copy",
      description:
        "Copy files from source to destination (remote↔remote or local↔remote). Does not delete anything at the destination. Gated by safetyLevel (default: confirm).",
      promptSnippet: "Copy files with rclone",
      parameters: transferParameters,
      async execute(
        _toolCallId: string,
        params: TransferParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        return runMutation(["copy", params.source, params.dest], params, config, params.dest, ctx, {
          title: "Copy files",
          message: `Copy "${params.source}" → "${params.dest}"?`,
          action: "rclone_copy",
        });
      },
    },
    {
      name: "rclone_move",
      label: "Move",
      description:
        "Move files from source to destination (deletes the source after transfer). Gated by safetyLevel (default: confirm).",
      promptSnippet: "Move files with rclone",
      parameters: transferParameters,
      async execute(
        _toolCallId: string,
        params: TransferParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        return runMutation(["move", params.source, params.dest], params, config, params.dest, ctx, {
          title: "Move files",
          message: `Move "${params.source}" → "${params.dest}"? This deletes the source after transfer.`,
          action: "rclone_move",
        });
      },
    },
    {
      name: "rclone_sync",
      label: "Sync",
      description:
        "Make destination an exact mirror of source (DESTRUCTIVE: extra files at the destination are deleted). Gated by safetyLevel (default: confirm).",
      promptSnippet: "Sync files with rclone",
      parameters: transferParameters,
      async execute(
        _toolCallId: string,
        params: TransferParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        return runMutation(["sync", params.source, params.dest], params, config, params.dest, ctx, {
          title: "Sync (destructive)",
          message:
            `Sync "${params.dest}" to exactly match "${params.source}"?\n\n` +
            `WARNING: this DELETES files at the destination that are not in the source.`,
          action: "rclone_sync",
        });
      },
    },
    {
      name: "rclone_delete_file",
      label: "Delete File",
      description: "Delete a single file from an rclone remote. Gated by safetyLevel (default: confirm).",
      promptSnippet: "Delete a file from an rclone remote",
      parameters: deleteFileParameters,
      async execute(
        _toolCallId: string,
        params: DeleteFileParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        return runMutation(["deletefile", params.target], params, config, params.target, ctx, {
          title: "Delete file",
          message: `Delete file "${params.target}"? This is permanent.`,
          action: "rclone_delete_file",
        });
      },
    },
    {
      name: "rclone_delete",
      label: "Delete Files",
      description:
        "Delete all files under a path (optionally also empty directories). Gated by safetyLevel (default: confirm).",
      promptSnippet: "Delete files from an rclone remote path",
      parameters: deleteParameters,
      async execute(
        _toolCallId: string,
        params: DeleteParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        const args = ["delete", params.target, ...(params.rmdirs ? ["--rmdirs"] : [])];
        return runMutation(args, params, config, params.target, ctx, {
          title: "Delete files",
          message: `Delete all files under "${params.target}"${params.rmdirs ? " and remove empty directories" : ""}? This is permanent.`,
          action: "rclone_delete",
        });
      },
    },
    {
      name: "rclone_purge",
      label: "Purge Directory",
      description: "Delete a directory and all of its contents from an rclone remote. Gated by safetyLevel (default: confirm).",
      promptSnippet: "Purge a directory from an rclone remote",
      parameters: purgeParameters,
      async execute(
        _toolCallId: string,
        params: PurgeParams,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: MutationContext | undefined,
      ): Promise<ToolResult> {
        const config = loadConfig();
        return runMutation(["purge", params.target], params, config, params.target, ctx, {
          title: "Purge directory",
          message: `Permanently delete directory "${params.target}" and everything inside it?`,
          action: "rclone_purge",
        });
      },
    },
  ];
}

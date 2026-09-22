/**
 * Read-only tools: list remotes, list dirs/files, cat file content, sizes,
 * quota, and config inspection. These never mutate data and are not gated.
 */

import { Type, type Static } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { loadConfig, resolveRemote } from "../config.ts";
import {
  listRemotes,
  lsjson,
  rcloneAbout,
  rcloneCat,
  rcloneConfigShow,
  rcloneSize,
} from "../rclone.ts";
import { errorResult, formatAbout, formatBytes, formatListing, remoteParam, textResult, type ToolResult } from "./shared.ts";

const MAX_CAT_CHARS = 200_000;

function buildTarget(remote: string | undefined, path: string | undefined): { target: string; remoteName: string; path: string } {
  const config = loadConfig();
  const resolved = resolveRemote(config, remote);
  const resolvedPath = path ?? "";
  return { target: `${resolved.name}:${resolvedPath}`, remoteName: resolved.name, path: resolvedPath };
}

// ---------------------------------------------------------------------------
// rclone_list_remotes
// ---------------------------------------------------------------------------

const listRemotesParameters = Type.Object({});
type ListRemotesParams = Static<typeof listRemotesParameters>;

// ---------------------------------------------------------------------------
// rclone_list
// ---------------------------------------------------------------------------

const listParameters = Type.Object({
  remote: remoteParam,
  path: Type.Optional(Type.String({ description: "Path within the remote. Defaults to the remote root." })),
  recursive: Type.Optional(Type.Boolean({ description: "Recurse into subdirectories (default false)." })),
  maxDepth: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum directory depth when recursive." })),
  dirsOnly: Type.Optional(Type.Boolean({ description: "Only list directories." })),
  filesOnly: Type.Optional(Type.Boolean({ description: "Only list files." })),
  include: Type.Optional(Type.String({ description: "Only include entries matching this glob pattern." })),
  exclude: Type.Optional(Type.String({ description: "Exclude entries matching this glob pattern." })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000, description: "Maximum number of entries to return." })),
});
type ListParams = Static<typeof listParameters>;

async function runList(params: ListParams, dirsOnly: boolean): Promise<ToolResult> {
  try {
    const { target, remoteName, path } = buildTarget(params.remote, params.path);
    const flags: string[] = [];
    if (params.recursive || params.maxDepth !== undefined) flags.push("--recursive");
    if (params.maxDepth !== undefined) flags.push("--max-depth", String(params.maxDepth));
    if (dirsOnly) flags.push("--dirs-only");
    if (params.filesOnly && !dirsOnly) flags.push("--files-only");
    if (params.include) flags.push("--include", params.include);
    if (params.exclude) flags.push("--exclude", params.exclude);

    let entries = await lsjson(target, flags);
    if (params.limit !== undefined && entries.length > params.limit) {
      entries = entries.slice(0, params.limit);
    }

    return textResult(formatListing(entries, target), {
      remote: remoteName,
      path,
      count: entries.length,
      entries,
    });
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// rclone_cat
// ---------------------------------------------------------------------------

const catParameters = Type.Object({
  remote: remoteParam,
  path: Type.String({ description: "Path of the file within the remote." }),
  offset: Type.Optional(Type.Integer({ minimum: 0, description: "Byte offset to start reading from." })),
  count: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum number of bytes to read." })),
});
type CatParams = Static<typeof catParameters>;

// ---------------------------------------------------------------------------
// rclone_size
// ---------------------------------------------------------------------------

const sizeParameters = Type.Object({
  remote: remoteParam,
  path: Type.Optional(Type.String({ description: "Path within the remote. Defaults to the remote root." })),
});
type SizeParams = Static<typeof sizeParameters>;

// ---------------------------------------------------------------------------
// rclone_about
// ---------------------------------------------------------------------------

const aboutParameters = Type.Object({
  remote: remoteParam,
});
type AboutParams = Static<typeof aboutParameters>;

export function createReadTools(): ToolDefinition<any, any, any>[] {
  return [
    {
      name: "rclone_list_remotes",
      label: "List Remotes",
      description:
        "List all configured rclone remotes (the cloud sources available, e.g. OneDrive, S3, SFTP). Call this first when unsure which remotes exist.",
      promptSnippet: "List configured rclone remotes",
      parameters: listRemotesParameters,
      async execute(_toolCallId: string, _params: ListRemotesParams): Promise<ToolResult> {
        try {
          const remotes = await listRemotes();
          if (remotes.length === 0) {
            return textResult(
              'No rclone remotes configured. Run "rclone config" to add one (e.g. OneDrive), then retry.',
              { remotes },
            );
          }
          return textResult(
            `Configured rclone remotes (${remotes.length}):\n${remotes.map((r) => `- ${r}`).join("\n")}`,
            { remotes },
          );
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "rclone_list_dirs",
      label: "List Directories",
      description: "List directories within an rclone remote path (folders only).",
      promptSnippet: "List directories in an rclone remote",
      parameters: listParameters,
      async execute(_toolCallId: string, params: ListParams): Promise<ToolResult> {
        return runList(params, true);
      },
    },
    {
      name: "rclone_list",
      label: "List Files",
      description:
        "List files and directories within an rclone remote path with size and modification time. Supports recursion, depth limit, and include/exclude glob filters.",
      promptSnippet: "List files in an rclone remote",
      parameters: listParameters,
      async execute(_toolCallId: string, params: ListParams): Promise<ToolResult> {
        return runList(params, false);
      },
    },
    {
      name: "rclone_cat",
      label: "Read File",
      description:
        "Read the content of a file from an rclone remote. Use offset/count to read a byte range (e.g. preview a large file).",
      promptSnippet: "Read a file from an rclone remote",
      parameters: catParameters,
      async execute(_toolCallId: string, params: CatParams): Promise<ToolResult> {
        try {
          const { target, remoteName, path } = buildTarget(params.remote, params.path);
          let content = await rcloneCat(target, {
            ...(params.offset !== undefined ? { offset: params.offset } : {}),
            ...(params.count !== undefined ? { count: params.count } : {}),
          });
          let truncated = false;
          if (content.length > MAX_CAT_CHARS) {
            content = content.slice(0, MAX_CAT_CHARS);
            truncated = true;
          }
          const suffix = truncated ? `\n\n[truncated — content exceeds ${MAX_CAT_CHARS} characters; use offset/count to read more]` : "";
          return textResult(content + suffix, { remote: remoteName, path, bytes: content.length, truncated });
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "rclone_size",
      label: "Get Size",
      description: "Total number of objects and bytes under an rclone remote path.",
      promptSnippet: "Get the size of an rclone remote path",
      parameters: sizeParameters,
      async execute(_toolCallId: string, params: SizeParams): Promise<ToolResult> {
        try {
          const { target, remoteName, path } = buildTarget(params.remote, params.path);
          const { count, bytes } = await rcloneSize(target);
          const formatted = formatBytes(bytes);
          return textResult(`${count} object(s), ${formatted} under ${target}.`, { remote: remoteName, path, count, bytes });
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "rclone_about",
      label: "Storage Quota",
      description: "Storage quota and usage for an rclone remote (when the backend supports it).",
      promptSnippet: "Check storage quota of an rclone remote",
      parameters: aboutParameters,
      async execute(_toolCallId: string, params: AboutParams): Promise<ToolResult> {
        try {
          const { remoteName } = buildTarget(params.remote, undefined);
          const about = await rcloneAbout(remoteName);
          if (!about) {
            return textResult(`The "${remoteName}" backend does not report quota info (about not supported).`, { remote: remoteName });
          }
          return textResult(formatAbout(about), { remote: remoteName, about });
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      name: "rclone_config_show",
      label: "Show Config",
      description: "Show the rclone configuration (remotes and their types). Secrets are obfuscated by rclone.",
      promptSnippet: "Show rclone configuration",
      parameters: Type.Object({}),
      async execute(_toolCallId: string, _params: Record<string, never>): Promise<ToolResult> {
        try {
          const config = await rcloneConfigShow();
          return textResult(config || "(empty rclone config)", {});
        } catch (error) {
          return errorResult(error instanceof Error ? error.message : String(error));
        }
      },
    },
  ];
}

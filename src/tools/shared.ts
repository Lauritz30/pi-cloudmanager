/**
 * Shared helpers for tool modules: result builders, common parameters,
 * and formatting.
 */

import { Type } from "typebox";
import type { LsjsonEntry } from "../rclone.ts";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
  isError?: boolean;
}

export function textResult(text: string, details: unknown = {}): ToolResult {
  return { content: [{ type: "text", text }], details };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: `❌ ${message}` }], details: { error: true }, isError: true };
}

export const remoteParam = Type.Optional(
  Type.String({ description: "rclone remote name; defaults to defaultRemote." }),
);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "?";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatListing(entries: LsjsonEntry[], target: string): string {
  if (entries.length === 0) {
    return `No entries found under ${target}.`;
  }
  const lines = entries.map((entry) => {
    const icon = entry.IsDir ? "📁" : "📄";
    const suffix = entry.IsDir ? "/" : "";
    const size = !entry.IsDir && entry.Size != null ? ` (${formatBytes(entry.Size)})` : "";
    return `${icon} ${entry.Path}${suffix}${size}`;
  });
  return `Listing of ${target} (${entries.length} entr${entries.length === 1 ? "y" : "ies"}):\n${lines.join("\n")}`;
}

/** Human-friendly summary of an `rclone about` result (bytes fields). */
export function formatAbout(about: Record<string, unknown>): string {
  const lines: string[] = [];
  const known: Array<[string, string]> = [
    ["total", "Total"],
    ["used", "Used"],
    ["free", "Free"],
    ["trashed", "Trashed"],
    ["other", "Other"],
  ];
  for (const [key, label] of known) {
    const value = about[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      lines.push(`${label}: ${formatBytes(value)}`);
    }
  }
  if (lines.length === 0) {
    return JSON.stringify(about, null, 2);
  }
  const extra = Object.entries(about).filter(([key]) => !known.some(([k]) => k === key));
  if (extra.length > 0) {
    for (const [key, value] of extra) lines.push(`${key}: ${String(value)}`);
  }
  return lines.join("\n");
}

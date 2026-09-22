/**
 * Safety gating for mutating tools (mkdir, copy, move, sync, delete, purge).
 *
 * Mirrors the pi-confluence-multiproject / pi-personio pattern:
 * - "readonly": always blocked.
 * - "confirm" (default): prompts via ctx.ui.confirm when a UI is available,
 *   otherwise blocked unless a matching headlessApprovals rule exists.
 * - "open": proceeds without prompting.
 *
 * A remote may additionally restrict writes to `allowedRoots` path prefixes;
 * mutations outside those roots are always blocked regardless of safetyLevel.
 */

import { resolveSafetyLevel, type HeadlessApprovalRule, type RcloneRemoteConfig, type SafetyLevel } from "./config.ts";

export class SafetyBlockedError extends Error {}

export interface MutationContext {
  hasUI?: boolean;
  ui?: {
    confirm(title: string, message: string): Promise<boolean>;
  };
}

export interface MutationApprovalRequest {
  title: string;
  message: string;
  action: string;
  remote?: string;
  path?: string;
}

/** Normalize slashes and strip leading/trailing separators for comparison. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function pathIsWithin(rulePath: string, requestPath: string): boolean {
  const rule = normalizePath(rulePath);
  const req = normalizePath(requestPath);
  if (rule === "") return req === "";
  return req === rule || req.startsWith(rule + "/");
}

function matchesHeadlessApproval(rule: HeadlessApprovalRule, request: MutationApprovalRequest): boolean {
  if (rule.action !== request.action) return false;
  if (rule.remote !== undefined && rule.remote !== request.remote) return false;
  if (rule.paths !== undefined && rule.paths.length > 0) {
    const reqPath = request.path ?? "";
    if (!rule.paths.some((p) => pathIsWithin(p, reqPath))) return false;
  }
  return true;
}

/** Hard restriction: writes outside a remote's allowedRoots are always blocked. */
export function assertAllowedRoot(
  remote: Pick<RcloneRemoteConfig, "name" | "allowedRoots">,
  path: string,
): void {
  const roots = remote.allowedRoots;
  if (!roots || roots.length === 0) return;
  if (!roots.some((root) => pathIsWithin(root, path))) {
    throw new SafetyBlockedError(
      `Blocked: remote "${remote.name}" restricts writes to allowedRoots (${roots.join(", ")}); ` +
        `"${path || "/"}" is outside them.`,
    );
  }
}

export async function guardMutation(
  config: { safetyLevel: SafetyLevel },
  remote: Pick<RcloneRemoteConfig, "name" | "safetyLevel" | "headlessApprovals">,
  ctx: MutationContext | undefined,
  request: MutationApprovalRequest,
): Promise<void> {
  const level = resolveSafetyLevel(config, remote);

  if (level === "readonly") {
    throw new SafetyBlockedError(
      `Blocked: safetyLevel is "readonly" for remote "${remote.name}". ${request.title} was not performed. ` +
        `Set safetyLevel to "confirm" or "open" to allow writes.`,
    );
  }

  if (level === "open") return;

  // level === "confirm"
  if (!ctx?.hasUI) {
    if (request.action && remote.headlessApprovals?.some((rule) => matchesHeadlessApproval(rule, request))) {
      return;
    }
    throw new SafetyBlockedError(
      `Blocked: safetyLevel is "confirm" but no UI is available to prompt for approval in this run mode. ` +
        `Add a matching headlessApprovals rule or set safetyLevel to "open" for remote "${remote.name}" ` +
        `to allow unattended writes.`,
    );
  }

  const approved = await ctx.ui!.confirm(request.title, request.message);
  if (!approved) {
    throw new SafetyBlockedError(`Blocked by user: ${request.title}.`);
  }
}

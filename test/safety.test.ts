import { test } from "node:test";
import assert from "node:assert/strict";
import { assertAllowedRoot, guardMutation, SafetyBlockedError, type MutationContext } from "../src/safety.ts";

const request = { title: "Delete file", message: "Delete?", action: "rclone_delete_file", remote: "onedrive", path: "docs/a.txt" };

function ctxWithUI(approve: boolean): MutationContext {
  return { hasUI: true, ui: { confirm: async () => approve } };
}

test("readonly always blocks", async () => {
  await assert.rejects(
    guardMutation({ safetyLevel: "confirm" }, { name: "onedrive", safetyLevel: "readonly" }, ctxWithUI(true), request),
    SafetyBlockedError,
  );
});

test("open allows without prompting", async () => {
  await guardMutation({ safetyLevel: "open" }, { name: "onedrive" }, undefined, request);
});

test("confirm without UI blocks without headless rule", async () => {
  await assert.rejects(
    guardMutation({ safetyLevel: "confirm" }, { name: "onedrive" }, undefined, request),
    SafetyBlockedError,
  );
});

test("confirm without UI allows a matching headless rule", async () => {
  await guardMutation(
    { safetyLevel: "confirm" },
    { name: "onedrive", headlessApprovals: [{ action: "rclone_delete_file", remote: "onedrive", paths: ["docs"] }] },
    undefined,
    request,
  );
});

test("confirm without UI blocks a non-matching headless rule", async () => {
  await assert.rejects(
    guardMutation(
      { safetyLevel: "confirm" },
      { name: "onedrive", headlessApprovals: [{ action: "rclone_copy", remote: "onedrive", paths: ["docs"] }] },
      undefined,
      request,
    ),
    SafetyBlockedError,
  );
});

test("confirm with UI follows the user's answer", async () => {
  await guardMutation({ safetyLevel: "confirm" }, { name: "onedrive" }, ctxWithUI(true), request);
  await assert.rejects(
    guardMutation({ safetyLevel: "confirm" }, { name: "onedrive" }, ctxWithUI(false), request),
    SafetyBlockedError,
  );
});

test("assertAllowedRoot allows paths inside a root", () => {
  assertAllowedRoot({ name: "onedrive", allowedRoots: ["/work"] }, "work/reports/x.pdf");
  assertAllowedRoot({ name: "onedrive", allowedRoots: ["work"] }, "work");
});

test("assertAllowedRoot blocks paths outside every root", () => {
  assert.throws(() => assertAllowedRoot({ name: "onedrive", allowedRoots: ["/work"] }, "personal/x.pdf"), SafetyBlockedError);
});

test("assertAllowedRoot is a no-op without roots", () => {
  assertAllowedRoot({ name: "onedrive" }, "anything/at/all");
});

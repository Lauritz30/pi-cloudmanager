import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, loadConfig, resolveRemote, resolveSafetyLevel } from "../src/config.ts";

function withConfig(content: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "pi-rclone-config-"));
  const path = join(dir, "pi-rclone.json");
  try {
    writeFileSync(path, content, "utf8");
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loadConfig returns defaults when file is missing", () => {
  const config = loadConfig("/does/not/exist/pi-rclone.json");
  assert.equal(config.configExists, false);
  assert.equal(config.safetyLevel, "confirm");
  assert.deepEqual(config.remotes, []);
  assert.equal(config.defaultRemote, undefined);
  assert.equal(config.mock, false);
});

test("loadConfig parses a full config", () => {
  withConfig(
    JSON.stringify({
      defaultRemote: "onedrive",
      safetyLevel: "readonly",
      mock: true,
      remotes: [
        { name: "onedrive", safetyLevel: "confirm", allowedRoots: ["/work"] },
        { name: "backup", safetyLevel: "open" },
      ],
    }),
    (path) => {
      const config = loadConfig(path);
      assert.equal(config.configExists, true);
      assert.equal(config.defaultRemote, "onedrive");
      assert.equal(config.safetyLevel, "readonly");
      assert.equal(config.mock, true);
      assert.equal(config.remotes.length, 2);
      assert.deepEqual(config.remotes[0].allowedRoots, ["/work"]);
    },
  );
});

test("loadConfig rejects invalid safetyLevel by falling back to confirm", () => {
  withConfig(JSON.stringify({ safetyLevel: "bogus" }), (path) => {
    const config = loadConfig(path);
    assert.equal(config.safetyLevel, "confirm");
  });
});

test("loadConfig rejects remotes without a name", () => {
  withConfig(JSON.stringify({ remotes: [{ safetyLevel: "open" }] }), (path) => {
    assert.throws(() => loadConfig(path), ConfigError);
  });
});

test("resolveRemote uses defaultRemote when name omitted", () => {
  const config = loadConfig("/does/not/exist");
  const resolved = resolveRemote({ ...config, defaultRemote: "onedrive" });
  assert.equal(resolved.name, "onedrive");
  assert.equal(resolved.override, undefined);
});

test("resolveRemote attaches a matching override", () => {
  const config = loadConfig("/does/not/exist");
  const resolved = resolveRemote(
    { ...config, defaultRemote: "onedrive", remotes: [{ name: "onedrive", safetyLevel: "readonly" }] },
    "onedrive",
  );
  assert.equal(resolved.name, "onedrive");
  assert.equal(resolved.override?.safetyLevel, "readonly");
});

test("resolveRemote throws when no remote is configured", () => {
  const config = loadConfig("/does/not/exist");
  assert.throws(() => resolveRemote(config), ConfigError);
});

test("resolveSafetyLevel prefers remote override over global", () => {
  assert.equal(resolveSafetyLevel({ safetyLevel: "confirm" }, { safetyLevel: "readonly" }), "readonly");
  assert.equal(resolveSafetyLevel({ safetyLevel: "confirm" }, undefined), "confirm");
  assert.equal(resolveSafetyLevel({ safetyLevel: "confirm" }, {}), "confirm");
});

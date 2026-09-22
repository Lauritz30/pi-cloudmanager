import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRemotePath } from "../src/rclone.ts";

test("splitRemotePath splits remote:path", () => {
  assert.deepEqual(splitRemotePath("onedrive:docs/report.pdf"), { remote: "onedrive", path: "docs/report.pdf" });
});

test("splitRemotePath handles empty path", () => {
  assert.deepEqual(splitRemotePath("onedrive:"), { remote: "onedrive", path: "" });
});

test("splitRemotePath keeps local absolute paths local", () => {
  assert.deepEqual(splitRemotePath("/tmp/file.txt"), { path: "/tmp/file.txt" });
});

test("splitRemotePath keeps relative and home paths local", () => {
  assert.deepEqual(splitRemotePath("./file.txt"), { path: "./file.txt" });
  assert.deepEqual(splitRemotePath("../file.txt"), { path: "../file.txt" });
  assert.deepEqual(splitRemotePath("~/file.txt"), { path: "~/file.txt" });
});

test("splitRemotePath treats colon-less strings as local", () => {
  assert.deepEqual(splitRemotePath("just-a-folder"), { path: "just-a-folder" });
});

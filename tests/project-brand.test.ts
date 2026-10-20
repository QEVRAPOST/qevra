import assert from "node:assert/strict";
import { test } from "node:test";
import { brandizeDisplayStrings, brandizeProjectName, resolveProjectName } from "@/lib/project-brand";

test("public project names are trimmed, sanitized, bounded, and defaulted centrally", () => {
  assert.equal(resolveProjectName("  JOKOW  "), "JOKOW");
  assert.equal(resolveProjectName("Jo\u0001kow"), "Jokow");
  assert.equal(resolveProjectName("   "), "VEYRA");
  assert.equal(resolveProjectName(undefined), "VEYRA");
  assert.equal(resolveProjectName("A".repeat(90)).length, 80);
});

test("brandizeProjectName updates display copy without changing unrelated text", () => {
  assert.equal(brandizeProjectName("QEVRA smart account", undefined), "VEYRA smart account");
  assert.equal(brandizeProjectName("QEVRA smart account", "JOKOW"), "JOKOW smart account");
  assert.equal(brandizeProjectName("QEVRA’s agents are read-only.", "JOKOW"), "JOKOW’s agents are read-only.");
  assert.equal(brandizeProjectName("Robinhood Chain 46630", "JOKOW"), "Robinhood Chain 46630");
  assert.equal(brandizeProjectName("QEVRA smart account", "QEVRA"), "QEVRA smart account");
});

test("brandizeDisplayStrings transforms presentation values without changing keys or inputs", () => {
  const source = { title: "QEVRA smart account", nested: ["QEVRA assets"], id: "qevra-account" };
  const branded = brandizeDisplayStrings(source, "JOKOW");
  assert.deepEqual(branded, { title: "JOKOW smart account", nested: ["JOKOW assets"], id: "qevra-account" });
  assert.equal(source.title, "QEVRA smart account");
});

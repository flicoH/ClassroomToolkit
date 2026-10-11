import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
const root = new URL("../apps/backend/", import.meta.url);
const require = createRequire(new URL("package.json", root));
const ts = require("typescript");
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
function config(name) {
  const path = fileURLToPath(new URL(name, root));
  const loaded = ts.readConfigFile(path, ts.sys.readFile);
  assert.equal(loaded.error, undefined);
  return ts.parseJsonConfigFileContent(loaded.config, ts.sys, fileURLToPath(root), undefined, path);
}
test("backend development and production use separate output and incremental caches", () => {
  const devPath = /--path\s+(\S+)/.exec(pkg.scripts.dev)?.[1];
  assert.ok(devPath, "development must explicitly use its own TypeScript config");
  const dev = config(devPath);
  const production = config("tsconfig.build.json");
  assert.equal(dev.errors.length, 0);
  assert.equal(production.errors.length, 0);
  assert.notEqual(dev.options.outDir, production.options.outDir);
  assert.ok(dev.options.tsBuildInfoFile.startsWith(dev.options.outDir));
  assert.ok(!dev.options.tsBuildInfoFile.startsWith(production.options.outDir));
  assert.match(pkg.scripts["start:debug"], new RegExp("--path\\s+" + devPath.replaceAll(".", "\\.")));
});
test("production compilation excludes generated development files and preserves deploy paths", () => {
  const production = config("tsconfig.build.json");
  assert.ok(production.raw.exclude.includes(".dev-dist"));
  assert.ok(production.fileNames.every(file => !file.includes("/.dev-dist/")));
  assert.ok(production.options.outDir.endsWith("/dist"));
  assert.equal(pkg.scripts["start:prod"], "node dist/main");
  const ignored = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(ignored, /^\.dev-dist\/$/m);
});

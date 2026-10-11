import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ESLint } from "eslint";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const eslint = new ESLint();

test("verification and staged checks enforce ESLint for all script extensions", () => {
  assert.equal(pkg.scripts["lint:eslint"], "eslint .");
  assert.match(pkg.scripts.verify, /^pnpm run lint:eslint && /);
  assert.match(pkg.scripts["test:standards"], /check-eslint\.test\.mjs/);
  const staged = JSON.parse(readFileSync(new URL(".lintstagedrc", root), "utf8"));
  assert.deepEqual(staged["*.{js,ts,vue,jsx,tsx,mjs,cjs}"], ["prettier --write", "eslint --fix"]);
});

test("source, tests and scripts are checked while generated artifacts are ignored", async () => {
  for (const filePath of [
    "apps/backend/src/check.ts",
    "apps/backend/test/check.ts",
    "apps/web/components/check.spec.tsx",
    "apps/web/components/check.jsx",
    "apps/web/lib/check.js",
    "apps/admin/src/check.ts",
    "scripts/check.mjs",
    "deploy/check.cjs"
  ]) {
    const [result] = await eslint.lintText("var lintRegression = 1; console.log(lintRegression);", { filePath });
    assert.ok(
      result.messages.some(message => message.ruleId === "no-var"),
      filePath
    );
  }
  for (const path of [
    "apps/backend/.dev-dist/check.js",
    "apps/backend/dist/check.js",
    "apps/web/.next/check.js",
    "apps/admin/dist/check.js",
    "node_modules/check.js"
  ]) {
    assert.equal(await eslint.isPathIgnored(path), true, path);
  }
});

test("Vue TypeScript scripts receive the same source checks", async () => {
  const [result] = await eslint.lintText(
    '<script setup lang="ts">var lintRegression: string = "value"; console.log(lintRegression);</script><template><div /></template>',
    { filePath: "apps/admin/src/Check.vue" }
  );
  assert.ok(result.messages.some(message => message.ruleId === "no-var"));
  assert.ok(!result.messages.some(message => message.fatal));
});

// PM2 loads .cjs directly; permitting require must not disable other rules.
test("CommonJS configuration remains compatible without suppressing lint errors", async () => {
  const [result] = await eslint.lintText('const path = require("node:path"); module.exports = path.resolve(".");', {
    filePath: "deploy/check.cjs"
  });
  assert.equal(result.errorCount, 0);
});

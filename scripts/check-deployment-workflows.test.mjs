import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

// ESLint already depends on this YAML parser; do not add another CI installation.
const require = createRequire(import.meta.url);
const yaml = createRequire(require.resolve("eslint/package.json"))("js-yaml");
const backend = yaml.load(readFileSync(new URL("../.github/workflows/deploy-backend.yml", import.meta.url), "utf8"));
const smallHost = yaml.load(
  readFileSync(new URL("../.github/workflows/publish-2c2g-images.yml", import.meta.url), "utf8")
);
const builds = backend.jobs.publish.steps.filter(step => step.uses?.startsWith("docker/build-push-action@"));
const parser = builds.find(step => step.with?.target === "docling-parser");

function buildsParser(vars) {
  assert.ok(parser, "Explicit Docling deployments must retain their image build");
  if (!parser.if) return true;
  // Evaluate only the simple repository-variable comparison used by this guard,
  // not the full GitHub expression language or arbitrary workflow commands.
  const match = /^\$\{\{\s*(vars\.SEMESTER_REPORT_PARSER_PROVIDER\s*==\s*'docling')\s*\}\}$/.exec(parser.if);
  assert.ok(match, "Docling builds must require an explicit parser provider");
  return runInNewContext(match[1], { vars });
}

for (const vars of [
  {},
  { SEMESTER_REPORT_PARSER_PROVIDER: "" },
  { SEMESTER_REPORT_PARSER_PROVIDER: "kimi" },
  { DEPLOY_PROFILE: "2c2g" },
  { DEPLOY_PROFILE: "2c2g", SEMESTER_REPORT_PARSER_PROVIDER: "kimi" }
]) {
  test(`cloud deployment skips the optional OCR build: ${JSON.stringify(vars)}`, () => {
    assert.equal(buildsParser(vars), false);
  });
}

test("explicit Docling deployment builds its parser and still fails if building fails", () => {
  assert.equal(buildsParser({ SEMESTER_REPORT_PARSER_PROVIDER: "docling" }), true);
  assert.notEqual(parser["continue-on-error"], true);
  assert.equal(backend.jobs.deploy.needs, "publish");
});

test("backend image publishing remains unconditional and targets the Node runtime", () => {
  const runtime = builds.find(step => step.with?.target === "runner");
  assert.ok(runtime);
  assert.equal(runtime.if, undefined);
  assert.equal(runtime.with.file, "deploy/docker/backend.Dockerfile");
});

test("the small-host release publishes only backend, web and admin runtime images", () => {
  assert.deepEqual(
    smallHost.jobs.publish.strategy.matrix.include.map(item => [item.app, item.target]),
    [
      ["backend", "runner"],
      ["web", "runner"],
      ["admin", "runner"]
    ]
  );
});

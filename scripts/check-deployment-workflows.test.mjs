import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const frontend = yaml.load(readFileSync(new URL("../.github/workflows/deploy-frontend.yml", import.meta.url), "utf8"));
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

test("repairing backend deployment also schedules a frontend deployment so blocked releases recover", () => {
  const paths = frontend.on.push.paths;
  assert.ok(paths.includes("deploy/backend-deploy.sh"));
  assert.ok(paths.includes(".github/workflows/deploy-backend.yml"));
  assert.ok(frontend.jobs.deploy.needs.includes("wait-for-backend"));
});

for (const [app, workflow] of [
  ["backend", backend],
  ["frontend", frontend]
]) {
  for (const failure of [false, true]) {
    test(`SSH ${app} transport ${failure ? "propagates deployment failure" : "finishes after a child reads stdin"} and cleans up`, () => {
      const command = workflow.jobs.deploy.steps.find(step => step.name === `Deploy ${app} containers`).run;
      const directory = mkdtempSync(join(tmpdir(), "classroom-ci-stdin-"));
      try {
        mkdirSync(join(directory, "deploy"));
        mkdirSync(join(directory, "bin"));
        mkdirSync(join(directory, "remote"));
        // Reproduce a migration that drains stdin before the final deployment step.
        writeFileSync(
          join(directory, `deploy/${app}-deploy.sh`),
          '#!/usr/bin/env bash\nset -eu\npython3 -c "import sys; print(len(sys.stdin.read()))"\n' +
            (failure ? "exit 23\n" : 'printf "completed" > "$TEST_RECEIPT"\n')
        );
        writeFileSync(join(directory, "bin/ssh"), '#!/usr/bin/env bash\nexec bash -c "${@: -1}"\n', { mode: 0o700 });
        // Confine remote temporary files to the fixture so cleanup is observable.
        writeFileSync(
          join(directory, "bin/mktemp"),
          '#!/usr/bin/env bash\nexec /usr/bin/mktemp "$TEST_REMOTE_DIR/${1##*/}"\n',
          { mode: 0o700 }
        );
        const receipt = join(directory, "deployed");
        const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", command], {
          cwd: directory,
          env: {
            ...process.env,
            PATH: `${join(directory, "bin")}:${process.env.PATH}`,
            GITHUB_REPOSITORY: "test/classroom",
            GITHUB_SHA: "a".repeat(40),
            SERVER_HOST: "test-host",
            SERVER_USER: "test-user",
            SERVER_APP_DIR: directory,
            SERVER_PORT: "22",
            TEST_RECEIPT: receipt,
            TEST_REMOTE_DIR: join(directory, "remote")
          },
          encoding: "utf8",
          timeout: 10000
        });
        assert.equal(result.status, failure ? 23 : 0, result.stdout + result.stderr);
        assert.deepEqual(
          readdirSync(join(directory, "remote")),
          [],
          "Remote script must be removed on success and failure"
        );
        if (failure) {
          assert.equal(existsSync(receipt), false);
        } else {
          assert.ok(existsSync(receipt), "A child consumed the rest of the deployment script but CI returned success");
          assert.equal(readFileSync(receipt, "utf8"), "completed");
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
}

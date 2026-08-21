import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, ".github/workflows/deploy.yml"), "utf8");
const steps = workflow.split(/\n      - (?=name:|uses:)/);

const operationalToken = /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/;
const readonlyToken = /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN_READONLY \}\}/;

test("deployment-version API consumers use the operational Cloudflare token", () => {
  const deploymentReaders = steps.filter((step) =>
    /(?:record-versions|verify-versions)\.mjs/.test(step),
  );

  assert.equal(deploymentReaders.length, 3, "expected rollback snapshot, verification, and final state recording");
  for (const step of deploymentReaders) {
    assert.match(step, operationalToken);
    assert.doesNotMatch(step, readonlyToken);
  }
});

test("drift settings read remains least privilege", () => {
  const driftStep = steps.find((step) => step.includes("check-drift.mjs"));
  assert.ok(driftStep, "deploy workflow must keep a drift gate");
  assert.match(driftStep, readonlyToken);
});
